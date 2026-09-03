#!/usr/bin/env bun
/**
 * Generate the per-model "Code" pages (tutorials/partner-nodes/<provider>/<model>/code.mdx)
 * from their code.yaml specs.
 *
 *   bun .github/scripts/snippets/gen-code-pages.ts            # write every code.mdx
 *   bun .github/scripts/snippets/gen-code-pages.ts --check    # exit 1 if any code.mdx is stale
 *   bun .github/scripts/snippets/gen-code-pages.ts --validate # also syntax-check the emitted snippets
 *
 * The template below is the only place the page shape lives. Python, TypeScript
 * and cURL are all emitted from the same `example` object, so the three cannot
 * disagree about the request body.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "../../..");
const SPEC_GLOB = "tutorials/partner-nodes/**/code.yaml";
const BASE_URL = "https://api.comfy.org";
const ROUTE = "/v2/models";

type Variant = { title: string; model: string; example?: Record<string, unknown>; input?: any; output?: any; provider_spec?: { url: string } };
type Spec = {
  name: string;
  provider: string;
  description: string;
  task?: string;
  variants: Variant[];
  example: Record<string, unknown>;
  fields?: string;
  input?: any;
  output?: any;
  provider_spec?: { url: string };
  result: { path: string; label: string; example: unknown; note?: string; absent_when?: { path: string; label: string } };
  summary: string;
  intro?: string;
};

// ---------------------------------------------------------------------------
// Snippet emitters. `@file:<path>` values are read from disk and base64 encoded.
// ---------------------------------------------------------------------------

type FileInput = { key: string; path: string; varName: string };

function fileInputs(example: Record<string, unknown>): FileInput[] {
  return Object.entries(example)
    .filter(([, v]) => typeof v === "string" && v.startsWith("@file:"))
    .map(([key, v]) => ({ key, path: (v as string).slice("@file:".length), varName: key }));
}

function camel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function shellVar(s: string): string {
  return s.toUpperCase();
}

/** Result path like `candidates[0].content.parts[0].inlineData.data` -> segments. */
function pathSegments(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const part of path.split(".")) {
    const m = part.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!m) throw new Error(`bad result path segment: ${part}`);
    out.push(m[1]);
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]));
  }
  return out;
}

function pyPath(path: string): string {
  return pathSegments(path).map((p) => (typeof p === "number" ? `[${p}]` : `[${JSON.stringify(p)}]`)).join("");
}

function tsPath(path: string): string {
  return pathSegments(path).map((p) => (typeof p === "number" ? `[${p}]` : tsAccess(p, false))).join("");
}

/**
 * Segments of a `result.absent_when.path`. Index segments are rejected so the emitted guard stays
 * one expression (`.get(a, {}).get(b)` / `a?.b`); none of the current specs needs one.
 */
function absentSegments(path: string): string[] {
  const segs = pathSegments(path);
  if (segs.some((p) => typeof p === "number")) throw new Error("bad absent_when path: index segments unsupported");
  return segs as string[];
}

/**
 * A provider field name is not always a TypeScript identifier -- `prompt-feedback` is a legal JSON
 * key. Dot access on one is not a syntax error, which is what makes it dangerous:
 * `data.prompt-feedback?.blockReason` transpiles clean as `data.prompt - feedback?.blockReason`,
 * reading the wrong property and subtracting. So every TypeScript emission site below brackets and
 * quotes a non-identifier segment. The Python emitters already quote every segment
 * (`pySafeGet`, `pyKeyLiteral`), so they needed no change.
 */
const TS_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A member access on an existing expression: `.foo`, `?.foo`, `["a-b"]`, `?.["a-b"]`. */
function tsAccess(seg: string, optional: boolean): string {
  // Bracket access carries its own delimiter, so it takes a dot only when it is also optional.
  if (TS_IDENTIFIER.test(seg)) return `${optional ? "?." : "."}${seg}`;
  return `${optional ? "?." : ""}[${JSON.stringify(seg)}]`;
}

/** A key as it appears in a type literal or an object literal: `foo` or `"a-b"`. */
function tsKey(seg: string): string {
  return TS_IDENTIFIER.test(seg) ? seg : JSON.stringify(seg);
}

/** `promptFeedback.blockReason` -> `result.get("promptFeedback", {}).get("blockReason")`. */
function pySafeGet(path: string): string {
  const segs = absentSegments(path);
  return `result${segs.map((p, i) => `.get(${JSON.stringify(p)}${i < segs.length - 1 ? ", {}" : ""})`).join("")}`;
}

/** `promptFeedback.blockReason` -> `data.promptFeedback?.blockReason`. */
function tsSafeGet(path: string): string {
  return `data${absentSegments(path).map((p, i) => tsAccess(p, i > 0)).join("")}`;
}

/** The `absent_when` root read for the error payload: `data.promptFeedback` / `data["a-b"]`. */
function tsAbsentRoot(path: string): string {
  return `data${tsAccess(absentSegments(path)[0], false)}`;
}

/** `promptFeedback.blockReason` -> `promptFeedback?: { blockReason?: string }` (a `Result` member). */
function tsAbsentType(path: string): string {
  const segs = absentSegments(path);
  let t = "string";
  for (let i = segs.length - 1; i >= 1; i--) t = `{ ${tsKey(segs[i])}?: ${t} }`;
  return `${tsKey(segs[0])}?: ${t}`;
}

/**
 * A Python string literal quoted with `'`, so it can sit inside the double-quoted f-string the
 * guard emits. Reusing `"` there would need PEP 701 (Python 3.12+) and is a syntax error on 3.11
 * and older, which a reader pasting the snippet would hit.
 */
function pyKeyLiteral(key: string): string {
  return `'${key.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// Labels are spec-controlled but land inside emitted string literals, where three of the four
// sites are *silent* failures rather than the syntax errors `--validate` would catch: a `{` in a
// Python f-string is an interpolation (NameError at run time), and a backtick or `${` in a
// TypeScript template literal alters or executes the emitted expression. Each helper below escapes
// for one site's quoting rules; all four are the identity function on the labels shipping today.

/** Inside a double-quoted Python string literal. JSON's escapes are a subset of Python's. */
function pyEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Inside a double-quoted Python *f-string*, where a literal brace must be doubled. */
function pyFEscape(s: string): string {
  return pyEscape(s).replace(/[{}]/g, (c) => c + c);
}

/** Inside a double-quoted TypeScript string literal. */
function tsEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Inside a TypeScript template literal, where a backtick or `${` would end or interpolate it. */
function tsTemplateEscape(s: string): string {
  return s.replace(/[\\`]/g, (c) => `\\${c}`).replace(/\$\{/g, "\\${");
}

/** The result type's object BODY (no braces), so `absent_when` can splice an extra member in. */
function tsResultType(path: string): string {
  const segs = pathSegments(path);
  let t = "string";
  for (let i = segs.length - 1; i >= 1; i--) {
    const p = segs[i];
    t = typeof p === "number" ? `${t}[]` : `{ ${tsKey(p)}: ${t} }`;
  }
  return `${tsKey(segs[0] as string)}: ${t}`;
}

/** JSON value -> Python literal, multi-line, at the given indent. */
function pyLiteral(v: unknown, indent: number, files: FileInput[], topKey?: string): string {
  const pad = " ".repeat(indent);
  const f = topKey !== undefined ? files.find((x) => x.key === topKey) : undefined;
  if (f) return f.varName;
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number" || typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object" || x === null)) return `[${v.map((x) => pyLiteral(x, indent, files)).join(", ")}]`;
    return `[\n${v.map((x) => `${pad}    ${pyLiteral(x, indent + 4, files)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  return `{\n${entries.map(([k, x]) => `${pad}    ${JSON.stringify(k)}: ${pyLiteral(x, indent + 4, files)},`).join("\n")}\n${pad}}`;
}

/** JSON value -> TypeScript object literal, multi-line, at the given indent. */
function tsLiteral(v: unknown, indent: number, files: FileInput[], topKey?: string): string {
  const pad = " ".repeat(indent);
  const f = topKey !== undefined ? files.find((x) => x.key === topKey) : undefined;
  if (f) return camel(f.varName);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object" || x === null)) return `[${v.map((x) => tsLiteral(x, indent, files)).join(", ")}]`;
    return `[\n${v.map((x) => `${pad}  ${tsLiteral(x, indent + 2, files)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  const key = (k: string) => (/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  return `{\n${entries.map(([k, x]) => `${pad}  ${key(k)}: ${tsLiteral(x, indent + 2, files)},`).join("\n")}\n${pad}}`;
}

function pythonSnippet(model: string, example: Record<string, unknown>, files: FileInput[], resultPath: string, label: string, absent?: { path: string; label: string }): string {
  const reads = files
    .map((f) => `with open(${JSON.stringify(f.path)}, "rb") as f:\n    ${f.varName} = base64.b64encode(f.read()).decode()`)
    .join("\n\n");
  const body = Object.entries(example)
    .map(([k, v]) => `            ${JSON.stringify(k)}: ${pyLiteral(v, 12, files, k)},`)
    .join("\n");
  // The provider can legitimately answer with no result (a blocked prompt). Check that first:
  // indexing into the absent result path would raise KeyError/IndexError and hide the reason.
  const guard = absent
    ? `if ${pySafeGet(absent.path)}:\n    raise SystemExit(f"${pyFEscape(absent.label)}: {result[${pyKeyLiteral(absentSegments(absent.path)[0])}]}")\n\n`
    : "";
  return `${files.length ? "import base64\n\n" : ""}from comfy_sdk import Comfy
${reads ? `\n${reads}\n` : ""}
# Reads COMFY_API_KEY from the environment. Each call sends a fresh
# Idempotency-Key and waits up to 10 minutes for the finished result.
with Comfy() as client:
    result = client.models.run(
        "${model}",
        {
${body}
        },
    )

${guard}print("${pyEscape(label)}:", result${pyPath(resultPath)})`;
}

function typescriptSnippet(model: string, example: Record<string, unknown>, files: FileInput[], resultPath: string, label: string, absent?: { path: string; label: string }): string {
  const imports = `import { comfy } from "@comfyorg/sdk";\n${files.length ? `import { readFile } from "node:fs/promises";\n` : ""}`;
  const reads = files
    .map((f) => `const ${camel(f.varName)} = (await readFile(${JSON.stringify(f.path)})).toString("base64");`)
    .join("\n");
  const body = Object.entries(example)
    .map(([k, v]) => `  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${tsLiteral(v, 2, files, k)},`)
    .join("\n");
  const members = [absent ? tsAbsentType(absent.path) : null, tsResultType(resultPath)].filter(Boolean).join("; ");
  // Same guard as the Python snippet: reading through the absent result path would throw on
  // `undefined` and lose the provider's reason.
  const guard = absent
    ? `if (${tsSafeGet(absent.path)}) throw new Error(\`${tsTemplateEscape(absent.label)}: \${JSON.stringify(${tsAbsentRoot(absent.path)})}\`);\n\n`
    : "";
  return `${imports}
${reads ? `${reads}\n\n` : ""}// Reads COMFY_API_KEY from the environment. Each call sends a fresh
// Idempotency-Key and waits up to 10 minutes for the finished result.
type Result = { ${members} };
const { data } = await comfy.models.run<Result>("${model}", {
${body}
});

${guard}console.log("${tsEscape(label)}:", data${tsPath(resultPath)});`;
}

function curlSnippet(model: string, example: Record<string, unknown>, files: FileInput[]): string {
  const reads = files.map((f) => `${shellVar(f.varName)}=$(base64 < ${f.path} | tr -d '\\n')`).join("\n");
  const esc = (v: unknown) => JSON.stringify(v).replace(/[\\$`"]/g, (c) => `\\${c}`);
  const entries = Object.entries(example).map(([k, v]) => {
    const f = files.find((x) => x.key === k);
    const value = f ? `\\"$${shellVar(f.varName)}\\"` : esc(v);
    return `${esc(k)}: ${value}`;
  });
  const json = `{${entries.join(", ")}}`;
  return `${reads ? `${reads}\n\n` : ""}curl ${BASE_URL}${ROUTE}/${model} \\
  -H "X-API-Key: $COMFY_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d "${json}"`;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}


// ---------------------------------------------------------------------------
// Per-model schema documents. `router-schemas/<provider>/<model>.json` is the
// exact body of `GET /v2/models/<provider>/<model>/openapi.json` (a standalone
// OpenAPI document), dropped in by the spec-sync bot. When present and
// authored, the Input schema / Input example sections render from it; when
// absent or unauthored, the page falls back to the spec's hand-written fields.
// ---------------------------------------------------------------------------

type SchemaDoc = {
  paths: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: any; example?: unknown }> }; responses?: Record<string, { content?: Record<string, { schema?: any; example?: unknown }> }> } }>;
  components?: { schemas?: Record<string, any> };
  "x-comfy-router-model-id"?: string;
  "x-comfy-input-schema-authored"?: boolean;
};

type ModelSchema = {
  authored: boolean;
  input?: any;
  inputExample?: unknown;
  output?: any;
  outputExample?: unknown;
  components: Record<string, any>;
};

function loadModelSchema(model: string): ModelSchema | null {
  const file = join(ROOT, "router-schemas", `${model}.json`);
  if (!existsSync(file)) return null;
  let doc: SchemaDoc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8")) as SchemaDoc;
  } catch (e) {
    throw new Error(`router-schemas/${model}.json: cannot parse JSON: ${(e as Error).message}`);
  }
  const op = doc.paths?.[`${ROUTE}/${model}`]?.post;
  if (!op) throw new Error(`router-schemas/${model}.json: no POST ${ROUTE}/${model} operation`);
  const req = op.requestBody?.content?.["application/json"];
  const res = op.responses?.["200"]?.content?.["application/json"];
  return {
    authored: doc["x-comfy-input-schema-authored"] !== false,
    input: req?.schema,
    inputExample: req?.example ?? req?.schema?.example,
    output: res?.schema,
    outputExample: res?.example ?? res?.schema?.example,
    components: doc.components?.schemas ?? {},
  };
}

function deref(schema: any, components: Record<string, any>, depth = 0): any {
  if (!schema || depth > 8) return schema ?? {};
  if (schema.$ref) {
    const name = String(schema.$ref).split("/").pop()!;
    return deref(components[name], components, depth + 1);
  }
  if (schema.allOf) {
    return schema.allOf.reduce((acc: any, part: any) => {
      const d = deref(part, components, depth + 1);
      return { ...acc, ...d, properties: { ...(acc.properties ?? {}), ...(d.properties ?? {}) }, required: [...(acc.required ?? []), ...(d.required ?? [])] };
    }, {});
  }
  return schema;
}

function typeLabel(schema: any, components: Record<string, any>): string {
  const s = deref(schema, components);
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map((x: any) => typeLabel(x, components)).join(" | ");
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v: unknown) => `\`${String(v)}\``).join(", ");
  if (s.type === "array") return `${typeLabel(s.items ?? {}, components)}[]`;
  if (s.type === "string" && s.format) return `string (${s.format})`;
  return s.type ?? "object";
}

function constraints(s: any): string {
  const out: string[] = [];
  if (s.default !== undefined) out.push(`default \`${JSON.stringify(s.default)}\``);
  if (s.minimum !== undefined || s.maximum !== undefined) out.push(`${s.minimum ?? ""}..${s.maximum ?? ""}`);
  if (s.minLength !== undefined || s.maxLength !== undefined) out.push(`length ${s.minLength ?? ""}..${s.maxLength ?? ""}`);
  if (s.minItems !== undefined || s.maxItems !== undefined) out.push(`items ${s.minItems ?? ""}..${s.maxItems ?? ""}`);
  return out.join(", ");
}

const attr = (v: unknown) => String(v ?? "").replace(/"/g, "&quot;").replace(/\s+/g, " ").trim();

/** Escape the characters MDX reads as syntax in prose, leaving `code spans` alone. */
const mdxText = (v: unknown) =>
  String(v).split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/[{<]/g, "\\$&"))).join("");

/** Render a JSON Schema object as Mintlify ParamField (input) or ResponseField (output) blocks. */
function schemaFields(schema: any, components: Record<string, any>, kind: "param" | "response"): string {
  const blocks: string[] = [];
  const walk = (s: any, prefix: string, depth: number) => {
    s = deref(s, components);
    const required = new Set<string>(s.required ?? []);
    for (const [name, raw] of Object.entries<any>(s.properties ?? {})) {
      const prop = deref(raw, components);
      const path = prefix ? `${prefix}.${name}` : name;
      const tag = kind === "param" ? "ParamField" : "ResponseField";
      const nameAttr = kind === "param" ? `body="${path}"` : `name="${path}"`;
      const type = attr(typeLabel({ ...prop, enum: undefined }, components));
      const attrs = [nameAttr, `type="${type}"`];
      if (required.has(name)) attrs.push("required");
      if (prop.default !== undefined) attrs.push(`default="${attr(JSON.stringify(prop.default))}"`);
      const body: string[] = [];
      if (prop.description) body.push(mdxText(String(prop.description).trim()));
      if (prop.enum) body.push(`Possible values: ${prop.enum.map((v: unknown) => `\`${String(v)}\``).join(", ")}`);
      // A union (`integer | "auto"`) carries its bounds on the numeric branch, not on the field.
      const alts: any[] = prop.anyOf ?? prop.oneOf ?? [];
      const bound = (k: "minimum" | "maximum") => {
        if (prop[k] !== undefined) return prop[k];
        const ns = alts.map((a) => a[k]).filter((n) => n !== undefined).map(Number);
        return ns.length ? (k === "minimum" ? Math.min(...ns) : Math.max(...ns)) : undefined;
      };
      const [min, max] = [bound("minimum"), bound("maximum")];
      if (min !== undefined || max !== undefined) body.push(`Range: \`${min ?? "…"}\` to \`${max ?? "…"}\``);
      if (prop.format) body.push(`Format: \`${prop.format}\``);
      blocks.push(`<${tag} ${attrs.join(" ")}>\n  ${body.join("\n\n  ") || " "}\n</${tag}>`);
      if (depth < 4) {
        if (prop.type === "object" || prop.properties) walk(prop, path, depth + 1);
        else if (prop.type === "array") {
          const items = deref(prop.items ?? {}, components);
          if (items.properties) walk(items, `${path}[]`, depth + 1);
        }
      }
    }
  };
  walk(schema, "", 0);
  if (!blocks.length) return "_The schema declares no fixed fields: any JSON object is accepted._";
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Page template
// ---------------------------------------------------------------------------

function sectionBlocks(v: Variant, spec: Spec) {
  const s = loadModelSchema(v.model);
  const example = v.example ?? spec.example;
  const specInput = v.input ?? spec.input;
  const specOutput = v.output ?? spec.output;
  const fields = (spec.fields ?? "").replace(/\s+/g, " ").trim();
  const checked = !!(v.provider_spec ?? spec.provider_spec);
  const notPublished = checked
    ? `_Fields follow ${possessive(spec.provider)} published API specification and are checked against it in CI. Router's own schema for this model is not published yet, so requests are forwarded to the provider unvalidated._`
    : `<Note>\nRouter has not published an authored input schema for this model yet: \`GET ${ROUTE}/${v.model}/openapi.json\` returns an open object with \`x-comfy-input-schema-authored: false\`. The fields below follow the provider's own API documentation and are not yet validated server side.\n</Note>`;
  // `x-comfy-input-schema-authored: false` disqualifies the whole served document, not just its input
  // half: the page then reads its fields AND its examples from the spec, as the README describes.
  const published = s?.authored ? s : null;
  let input: string;
  if (published?.input) {
    input = `${schemaFields(published.input, published.components, "param")}\n\nGenerated from the schema Router serves at \`GET ${ROUTE}/${v.model}/openapi.json\`, the same document it validates a call against before the request reaches the provider.`;
  } else if (specInput) {
    input = `${notPublished}\n\n${schemaFields(specInput, {}, "param")}`;
  } else {
    input = `${notPublished}\n\n${fields}`;
  }
  const inputExample = JSON.stringify(published?.inputExample ?? example, null, 2).replace(/"@file:([^"]+)"/g, '"<base64 of $1>"');
  let output: string;
  if (published?.output) {
    output = schemaFields(published.output, published.components, "response");
  } else if (specOutput) {
    output = `Router returns ${possessive(spec.provider)} native response unchanged. The ${spec.result.label} is at \`${spec.result.path}\`.\n\n${schemaFields(specOutput, {}, "response")}`;
  } else {
    output = `Router returns ${possessive(spec.provider)} native output unchanged and does not publish an output schema for this model. The ${spec.result.label} is at \`${spec.result.path}\`; the example below is representative of the provider's response.`;
  }
  const outputExample = JSON.stringify(published?.outputExample ?? spec.result.example, null, 2);
  return { input, inputExample, output, outputExample };
}

/** Model ID, endpoint and the three snippets for one variant. */
function quickStart(v: Variant, spec: Spec): string {
  const example = v.example ?? spec.example;
  const files = fileInputs(example);
  const label = spec.result.label;
  return `**Model ID:** \`${v.model}\`

**Endpoint:** \`POST ${BASE_URL}${ROUTE}/${v.model}\`

<CodeGroup>
\`\`\`python Python
${pythonSnippet(v.model, example, files, spec.result.path, label, spec.result.absent_when)}
\`\`\`

\`\`\`typescript TypeScript
${typescriptSnippet(v.model, example, files, spec.result.path, label, spec.result.absent_when)}
\`\`\`

\`\`\`bash cURL
${curlSnippet(v.model, example, files)}
\`\`\`
</CodeGroup>`;
}

/** Schema + Examples for one variant. `html` headings keep them out of the TOC when rendered inside tabs. */
function sections(v: Variant, spec: Spec, html: boolean): string {
  const h2 = (t: string) => (html ? `<h2>${t}</h2>` : `## ${t}`);
  const h3 = (t: string) => (html ? `<h3>${t}</h3>` : `### ${t}`);
  const b = sectionBlocks(v, spec);
  return `${h2("Schema")}

${h3("Input")}

${b.input}

${h3("Output")}

${b.output}

${h2("Examples")}

${h3("Input")}

\`\`\`json
${b.inputExample}
\`\`\`

${h3("Output")}

\`\`\`json
${b.outputExample}
\`\`\`${spec.result.note ? `\n\n${spec.result.note}` : ""}`;
}

function variantsShareSections(spec: Spec): boolean {
  const key = (v: Variant) => JSON.stringify([v.input ?? spec.input, v.output ?? spec.output, v.example ?? spec.example, loadModelSchema(v.model)]);
  return spec.variants.every((v) => key(v) === key(spec.variants[0]));
}

function renderPage(spec: Spec, dir: string): string {
  const both = spec.variants.length > 1;
  // The one-time setup a snippet cannot run without. Everything else that is
  // shared across models (idempotency, deadline, request IDs) lives on the
  // headers page the footer links to.
  const setup = `Create a key at [platform.comfy.org/profile/api-keys](https://platform.comfy.org/profile/api-keys) and export it as \`COMFY_API_KEY\`. The Python and TypeScript snippets use the Comfy SDKs (\`pip install comfy-sdk\`, \`npm install @comfyorg/sdk\`); the cURL snippet is the same call over raw HTTP.`;
  let body: string;
  if (!both) {
    body = `## Quick start\n\n${setup}\n\n${quickStart(spec.variants[0], spec)}\n\n${sections(spec.variants[0], spec, false)}`;
  } else if (variantsShareSections(spec)) {
    // Only the snippets differ: one selector under Quick start, the shared schema and examples once below.
    body = `## Quick start\n\n${setup}\n\nPick the model you want to call. The models share one request and response shape, documented once below.\n\n<Tabs>\n${spec.variants.map((v) => `  <Tab title="${v.title}">\n${quickStart(v, spec)}\n  </Tab>`).join("\n")}\n</Tabs>\n\n${sections(spec.variants[0], spec, false)}`;
  } else {
    // The models take different inputs: one selector switches the whole page.
    body = `## Quick start\n\n${setup}\n\nPick the model you want to call. Everything below, from the snippets to the schema and examples, follows your choice.\n\n<Tabs>\n${spec.variants.map((v) => `  <Tab title="${v.title}">\n${quickStart(v, spec)}\n\n${sections(v, spec, true)}\n  </Tab>`).join("\n")}\n</Tabs>`;
  }
  return `---
title: ${JSON.stringify(`Use ${spec.name} with Comfy Router`)}
description: ${JSON.stringify(spec.description.replace(/\s+/g, " ").trim())}
sidebarTitle: "Code"
---

{/* GENERATED FILE. Edit code.yaml in this directory and run \`pnpm code-pages:gen\`. */}

import RouterPreviewNotice from "/snippets/comfy-router/preview-notice.mdx";
import RouterCodeFooter from "/snippets/comfy-router/model-code-footer.mdx";

${spec.intro ?? `API Reference for ${spec.name}. ${spec.summary.replace(/\s+/g, " ").trim()}`}

<RouterPreviewNotice />

${body}

<RouterCodeFooter />
`;
}

// ---------------------------------------------------------------------------
// Validation of emitted snippets (syntax only; nothing is executed or billed)
// ---------------------------------------------------------------------------

function validate(page: string, rel: string): string[] {
  const problems: string[] = [];
  const tmp = mkdtempSync(join(tmpdir(), "code-pages-"));
  try {
    const fences = [...page.matchAll(/```(python|typescript|bash)[^\n]*\n([\s\S]*?)```/g)];
    fences.forEach((m, i) => {
      const [, lang, code] = m;
      const file = join(tmp, `s${i}.${lang === "python" ? "py" : lang === "typescript" ? "ts" : "sh"}`);
      writeFileSync(file, code);
      const cmd =
        lang === "python"
          ? ["python3", "-m", "py_compile", file]
          : lang === "typescript"
            ? ["bun", "build", "--target=node", "--no-bundle", file, "--outfile", `${file}.out.js`]
            : ["bash", "-n", file];
      const r = Bun.spawnSync(cmd, { stderr: "pipe", stdout: "pipe" });
      if (r.exitCode !== 0) problems.push(`${rel}: ${lang} snippet #${i + 1} failed syntax check:\n${r.stderr.toString()}`);
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

// ---------------------------------------------------------------------------

const check = process.argv.includes("--check");
const doValidate = process.argv.includes("--validate");
const glob = new Bun.Glob(SPEC_GLOB);
let stale: string[] = [];
let problems: string[] = [];
let count = 0;
for (const specPath of glob.scanSync({ cwd: ROOT })) {
  count++;
  let spec: Spec;
  try {
    spec = Bun.YAML.parse(readFileSync(join(ROOT, specPath), "utf8")) as Spec;
  } catch (e) {
    problems.push(`${specPath}: cannot parse YAML: ${(e as Error).message}`);
    continue;
  }
  for (const key of ["name", "provider", "description", "summary", "variants", "example", "result"] as const) {
    if (spec[key] === undefined) problems.push(`${specPath}: missing required key \`${key}\``);
  }
  // `absent_when.path` uses the same dotted syntax as `result.path`, minus index segments. Report a
  // bad one against this spec, like the missing-key checks above, rather than throwing out of the run.
  const absentWhen = spec.result?.absent_when;
  if (absentWhen) {
    for (const key of ["path", "label"] as const) {
      // Both are interpolated straight into the emitted guard, where a missing one would ship as
      // the literal `undefined` in a snippet that still compiles.
      if (absentWhen[key] === undefined) problems.push(`${specPath}: missing required key \`result.absent_when.${key}\``);
    }
    try {
      if (absentWhen.path !== undefined) {
        // `type Result` splices the absent_when member alongside the result member, so sharing a
        // root key emits a duplicate identifier. That is a TS *type* error, and `--validate` only
        // transpiles (`bun build --no-bundle`), so it would ship into the page unnoticed.
        const root = absentSegments(absentWhen.path)[0];
        if (root === spec.result.path?.split(/[.[]/)[0]) {
          problems.push(`${specPath}: result.absent_when.path root \`${root}\` collides with \`result.path\``);
        }
      }
    } catch (e) {
      problems.push(`${specPath}: result.absent_when: ${(e as Error).message}`);
    }
  }
  if (problems.some((m) => m.startsWith(specPath))) continue;
  const dir = dirname(specPath);
  const out = join(ROOT, dir, "code.mdx");
  let page: string;
  try {
    // A malformed `result.path`, or a router-schemas document we cannot read, must not abandon the
    // remaining specs half written; report it against this spec and carry on, as YAML errors do.
    page = renderPage(spec, dir);
  } catch (e) {
    problems.push(`${specPath}: cannot render: ${(e as Error).message}`);
    continue;
  }
  if (doValidate) problems.push(...validate(page, relative(ROOT, out)));
  if (check) {
    if (!existsSync(out) || readFileSync(out, "utf8") !== page) stale.push(relative(ROOT, out));
  } else {
    writeFileSync(out, page);
    console.log(`wrote ${relative(ROOT, out)}`);
  }
}
if (count === 0) {
  console.error(`no specs matched ${SPEC_GLOB}`);
  process.exit(1);
}
if (stale.length) {
  console.error(`stale generated pages (run \`pnpm code-pages:gen\`):\n  ${stale.join("\n  ")}`);
}
if (problems.length) console.error(problems.join("\n"));
if (stale.length || problems.length) process.exit(1);
if (check) console.log(`${count} code page(s) fresh`);
