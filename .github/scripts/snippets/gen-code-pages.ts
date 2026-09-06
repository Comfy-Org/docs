#!/usr/bin/env bun
/**
 * Generate the per-model "Code" pages (development/comfy-router/models/<provider>/<model>/code.mdx)
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "../../..");
const SPEC_GLOB = "development/comfy-router/models/**/code.yaml";
const SCHEMA_GLOB = "router-schemas/*/*.json";
const MODELS_DIR = "development/comfy-router/models";
const DOCS_JSON = "docs.json";
const PREVIEW_NOTICE = "snippets/comfy-router/preview-notice.mdx";
const BASE_URL = "https://api.comfy.org";
const ROUTE = "/v2/models";

/**
 * Router provider slug -> the directory its pages live under, where the two
 * differ. A curated page is filed under the provider's display name; a derived
 * page for the same provider has to land in that same directory or the sidebar
 * shows one provider twice (`bfl` next to "Black Forest Labs").
 */
const PROVIDER_DIR: Record<string, string> = { bfl: "black-forest-labs", vertexai: "google" };

/**
 * Router provider slug -> sidebar group label. A slug that is not listed is
 * title-cased, so a provider the catalog gains still renders a sane group
 * without a code change; add a row when the cased form is wrong (`xai` -> `xAI`).
 */
const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  beeble: "Beeble",
  bfl: "Black Forest Labs",
  bria: "Bria",
  byteplus: "BytePlus",
  fal: "fal",
  freepik: "Freepik",
  "gemini-interactions": "Gemini Interactions",
  heygen: "HeyGen",
  ideogram: "Ideogram",
  kling: "Kling",
  krea: "Krea",
  ltx: "LTX",
  luma: "Luma",
  luma_2: "Luma 2",
  meshy: "Meshy",
  minimax: "MiniMax",
  moonvalley: "Moonvalley",
  openai: "OpenAI",
  qwen: "Qwen",
  recraft: "Recraft",
  runway: "Runway",
  tencent: "Tencent",
  veo: "Veo",
  vertexai: "Google",
  wan: "Wan",
  wavespeed: "WaveSpeed",
  xai: "xAI",
};

/**
 * Provider slug -> the site that provider's schema prose links into.
 *
 * Field descriptions are copied verbatim out of the provider's own specification,
 * where a link like `[structured outputs](/docs/guides/structured-outputs)` resolves
 * on THEIR domain. Rendered here it resolves to docs.comfy.org and 404s — 64 of them
 * across the OpenAI pages on the first run of this generator. A provider with no entry
 * has such links flattened to plain text, so a new provider cannot reintroduce the rot.
 *
 * OpenAI is the only provider whose synced schemas use the root-relative form today,
 * and those same documents already spell other links `https://platform.openai.com/...`,
 * which is where this points.
 */
const PROVIDER_DOC_BASE: Record<string, string> = { openai: "https://platform.openai.com" };

/**
 * Provider slug -> that provider's own API reference.
 *
 * A model with no authored input schema is documented by the provider and nobody
 * else, so the Note that says so links there rather than leaving the reader to
 * search. Every URL here was fetched and returned 200 on 2026-09-04; a provider
 * with no entry keeps the unlinked wording, which is why `ltx` is absent (its
 * docs answer 403 to a plain fetch, so the link could not be verified). Verify
 * before adding a row: a docs link that rots is worse than no link.
 */
const PROVIDER_API_DOCS: Record<string, string> = {
  anthropic: "https://docs.claude.com/en/api/messages",
  bfl: "https://docs.bfl.ai/",
  bria: "https://docs.bria.ai/",
  byteplus: "https://docs.byteplus.com/",
  "gemini-interactions": "https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference",
  kling: "https://app.klingai.com/global/dev/document-api",
  krea: "https://docs.krea.ai/",
  luma: "https://docs.lumalabs.ai/docs/api",
  luma_2: "https://docs.lumalabs.ai/docs/api",
  meshy: "https://docs.meshy.ai/",
  minimax: "https://platform.minimax.io/docs/api-reference",
  openai: "https://platform.openai.com/docs/api-reference",
  recraft: "https://www.recraft.ai/docs",
  runway: "https://docs.dev.runwayml.com/",
  veo: "https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation",
  vertexai: "https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference",
  xai: "https://docs.x.ai/docs/api-reference",
};

/**
 * Display titles for derived pages.
 *
 * Neither `GET /v2/models` nor the per-model schema publishes a human name — the
 * catalog record is `{id, model, provider, billing}` and `info.title` is the id —
 * so a derived page's sidebar entry would otherwise read `claude-haiku-4-5-20251001`.
 * `modelTitle` derives one from the id with rules that hold across this catalog,
 * and anything the rules get wrong is spelled out in {@link MODEL_TITLE}. Fixing a
 * name is one row there; the id itself is never guessed at, and stays visible on
 * the page (frontmatter description, the intro line, and **Model ID**) so a search
 * for the exact slug still lands.
 *
 * If Router ever publishes a display name, read it instead and delete the rules.
 */
const MODEL_TITLE: Record<string, string> = {
  // OpenAI's reasoning models are lower-case by their own convention.
  "openai/o1": "o1",
  "openai/o1-pro": "o1-pro",
  "openai/o3": "o3",
  "openai/o4-mini": "o4-mini",
  "beeble/switchx": "SwitchX",
  "wan/wan2.7-videoedit": "Wan 2.7 Video Edit",
};

/** Tokens whose casing the generic title-case rule gets wrong. */
const TOKEN_CASE: Record<string, string> = {
  "3d": "3D",
  ai: "AI",
  api: "API",
  asr: "ASR",
  flux: "FLUX",
  gpt: "GPT",
  hd: "HD",
  i2i: "I2I",
  i2v: "I2V",
  ir: "IR",
  ltx: "LTX",
  minimax: "MiniMax",
  r2v: "R2V",
  svg: "SVG",
  t2i: "T2I",
  t2v: "T2V",
  tts: "TTS",
  v2v: "V2V",
  vto: "VTO",
  xl: "XL",
};

/**
 * `kling/kling-v2-5-turbo` -> `Kling V2.5 Turbo`.
 *
 * Three rules, each earning its place on this catalog: a one-or-two digit run
 * joined to the digit before it by `-`/`_` is a version, so `v2-5` is `V2.5` and
 * `recraftv4_1` is `V4.1` (a longer run is a date — `claude-…-4-5-20251001` keeps
 * `20251001` as its own word); a token ending `v<digit>` splits there, so
 * `recraftv3` is `Recraft V3`; and a token of three or more letters followed by
 * digits splits too, so `wan2.5` is `Wan 2.5` while `o1` is left alone.
 */
function modelTitle(modelId: string): string {
  const override = MODEL_TITLE[modelId];
  if (override) return override;
  let name = modelOf(modelId);
  for (let prev = ""; prev !== name; ) {
    prev = name;
    name = name.replace(/(\d)[-_](\d{1,2})(?!\d)/, "$1.$2");
  }
  return name
    .split(/[-_]/)
    .map((token) =>
      token
        .replace(/^([a-z]{2,})v(\d)/, "$1 V$2")
        .replace(/^([a-z]{3,})(\d)/, "$1 $2")
        .split(" ")
        .map((word) => TOKEN_CASE[word.toLowerCase()] ?? (/^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
        .join(" ")
    )
    .join(" ");
}

const providerOf = (modelId: string) => modelId.split("/")[0];
const modelOf = (modelId: string) => modelId.slice(modelId.indexOf("/") + 1);
const providerDir = (slug: string) => PROVIDER_DIR[slug] ?? slug;
const providerLabel = (slug: string) =>
  PROVIDER_LABEL[slug] ?? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** `kling/kling-3.0-turbo` -> `kling/kling-3-0-turbo`: one URL-safe directory per model. */
const pageDir = (modelId: string) =>
  `${MODELS_DIR}/${providerDir(providerOf(modelId))}/${modelOf(modelId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

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
  result: { path: string; label: string; example: unknown; note?: string };
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
  return pathSegments(path).map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("");
}

function tsResultType(path: string): string {
  const segs = pathSegments(path);
  let t = "string";
  for (let i = segs.length - 1; i >= 0; i--) {
    const p = segs[i];
    t = typeof p === "number" ? `${t}[]` : `{ ${p}: ${t} }`;
  }
  return t;
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

function pythonSnippet(model: string, example: Record<string, unknown>, files: FileInput[], resultPath: string, label: string): string {
  const reads = files
    .map((f) => `with open(${JSON.stringify(f.path)}, "rb") as f:\n    ${f.varName} = base64.b64encode(f.read()).decode()`)
    .join("\n\n");
  const body = Object.entries(example)
    .map(([k, v]) => `            ${JSON.stringify(k)}: ${pyLiteral(v, 12, files, k)},`)
    .join("\n");
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

print("${label}:", result${pyPath(resultPath)})`;
}

function typescriptSnippet(model: string, example: Record<string, unknown>, files: FileInput[], resultPath: string, label: string): string {
  const imports = `import { comfy } from "@comfyorg/sdk";\n${files.length ? `import { readFile } from "node:fs/promises";\n` : ""}`;
  const reads = files
    .map((f) => `const ${camel(f.varName)} = (await readFile(${JSON.stringify(f.path)})).toString("base64");`)
    .join("\n");
  const body = Object.entries(example)
    .map(([k, v]) => `  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${tsLiteral(v, 2, files, k)},`)
    .join("\n");
  return `${imports}
${reads ? `${reads}\n\n` : ""}// Reads COMFY_API_KEY from the environment. Each call sends a fresh
// Idempotency-Key and waits up to 10 minutes for the finished result.
type Result = ${tsResultType(resultPath)};
const { data } = await comfy.models.run<Result>("${model}", {
${body}
});

console.log("${label}:", data${tsPath(resultPath)});`;
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

/** Rewrite a provider's root-relative markdown links onto its own site, or flatten them. */
const resolveProviderLinks = (text: string, docBase?: string) =>
  text.replace(/\[([^\]]*)\]\(\/([^)\s]*)\)/g, (_, label: string, path: string) =>
    docBase ? `[${label}](${docBase}/${path})` : label
  );

/** Escape the characters MDX reads as syntax in prose, leaving `code spans` alone. */
const mdxText = (v: unknown) =>
  String(v).split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/[{<]/g, "\\$&"))).join("");

/** Render a JSON Schema object as Mintlify ParamField (input) or ResponseField (output) blocks. */
function schemaFields(schema: any, components: Record<string, any>, kind: "param" | "response", docBase?: string): string {
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
      // An array property usually carries no description of its own: the prose sits on the
      // component its `items` point at (OpenAPI 3.0 ignores a sibling `description` next to a
      // `$ref`, so that is the only place an author can put it). Without this fallback the whole
      // Gemini request body renders as empty ParamFields.
      const itemsDesc = prop.type === "array" && prop.items ? deref(prop.items, components).description : undefined;
      const description = prop.description ?? itemsDesc;
      if (description) body.push(mdxText(resolveProviderLinks(String(description).trim(), docBase)));
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
  const docBase = PROVIDER_DOC_BASE[providerOf(v.model)];
  if (published?.input) {
    input = `${schemaFields(published.input, published.components, "param", docBase)}\n\nGenerated from the schema Router serves at \`GET ${ROUTE}/${v.model}/openapi.json\`, the same document it validates a call against before the request reaches the provider.`;
  } else if (specInput) {
    input = `${notPublished}\n\n${schemaFields(specInput, {}, "param", docBase)}`;
  } else {
    input = `${notPublished}\n\n${fields}`;
  }
  const inputExample = JSON.stringify(published?.inputExample ?? example, null, 2).replace(/"@file:([^"]+)"/g, '"<base64 of $1>"');
  let output: string;
  if (published?.output) {
    output = schemaFields(published.output, published.components, "response", docBase);
  } else if (specOutput) {
    output = `Router returns ${possessive(spec.provider)} native response unchanged. The ${spec.result.label} is at \`${spec.result.path}\`.\n\n${schemaFields(specOutput, {}, "response", docBase)}`;
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
${pythonSnippet(v.model, example, files, spec.result.path, label)}
\`\`\`

\`\`\`typescript TypeScript
${typescriptSnippet(v.model, example, files, spec.result.path, label)}
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

/**
 * The preview banner is rendered while `snippets/comfy-router/preview-notice.mdx`
 * exists, and disappears from every page the moment that file is deleted. The
 * notice is a rollout artifact ("Router is not GA, these routes answer 404"), so
 * tying it to the snippet's existence means retiring it is one `rm` plus a
 * regen, rather than an edit to this template and 100+ generated pages that must
 * land in the same commit.
 */
const previewNotice = (() => {
  const present = existsSync(join(ROOT, PREVIEW_NOTICE));
  return {
    imports: present ? `import RouterPreviewNotice from "/${PREVIEW_NOTICE}";\n` : "",
    body: present ? "\n<RouterPreviewNotice />\n" : "",
  };
})();

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
sidebarTitle: ${JSON.stringify(spec.name)}
---

{/* GENERATED FILE. Edit code.yaml in this directory and run \`pnpm code-pages:gen\`. */}

${previewNotice.imports}import RouterCodeFooter from "/snippets/comfy-router/model-code-footer.mdx";

${spec.intro ?? `API Reference for ${spec.name}. ${spec.summary.replace(/\s+/g, " ").trim()}`}
${previewNotice.body}
${body}

<RouterCodeFooter />
`;
}

// ---------------------------------------------------------------------------
// Derived pages
//
// Every model Router serves publishes its own OpenAPI document at
// `GET /v2/models/<provider>/<model>/openapi.json`, and the spec-sync bot commits
// each one under `router-schemas/`. A model with no hand-written `code.yaml` gets
// its page from that document alone, so the sidebar tracks the catalog instead of
// tracking who found time to write a spec.
//
// What such a page can honestly say is bounded by what Router has authored. The
// OUTPUT schema is authored for every model, so the response is documented in
// full. The INPUT schema mostly is not (`x-comfy-input-schema-authored: false`
// means Router forwards the body to the provider unvalidated and cannot state its
// fields), so the page says exactly that and points at the provider rather than
// inventing a request shape. No example is fabricated: a derived page shows an
// example only when the served document carries one.
// ---------------------------------------------------------------------------

/** The one-line body placeholder for a model whose request fields Router does not publish. */
const BODY_HINT = "Request fields are the provider's own \u2014 see Input below.";

/**
 * The published input example, when it is a JSON object we can render as a body.
 *
 * An authored model carries one and it is a REAL call: openapi.yml takes it from
 * that model's end-to-end smoke case, and routervalidate's
 * TestAuthoredModelsAreValidatedAgainstTheirOwnSchema runs it through the same
 * validator that guards live traffic, so it necessarily carries every required
 * field. Inlining it is what makes the quick start copy-pasteable rather than a
 * shape the reader has to assemble from the Input table below.
 *
 * Anything else -- absent, null, or a non-object -- falls back to BODY_HINT.
 * That is the unauthored case, where Router genuinely cannot state the fields
 * and a fabricated body would be worse than an honest placeholder.
 */
function bodyExample(example: unknown): Record<string, unknown> | undefined {
  if (example === null || typeof example !== "object" || Array.isArray(example)) return undefined;
  const entries = Object.entries(example as Record<string, unknown>);
  return entries.length > 0 ? (example as Record<string, unknown>) : undefined;
}

function derivedSnippets(model: string, example?: unknown): string {
  // Rendered through the same pyLiteral/tsLiteral/esc helpers the curated
  // snippets use, so the three languages cannot drift from one another or from
  // the JSON in the Examples section -- the invariant stated at the top of this
  // file. Derived pages have no file inputs, so the FileInput list is empty.
  const body = bodyExample(example);
  const pyBody = body
    ? Object.entries(body).map(([k, v]) => `            ${JSON.stringify(k)}: ${pyLiteral(v, 12, [], k)},`).join("\n")
    : `            # ${BODY_HINT}`;
  const tsBody = body
    ? Object.entries(body).map(([k, v]) => `  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${tsLiteral(v, 2, [], k)},`).join("\n")
    : `  // ${BODY_HINT}`;
  const esc = (v: unknown) => JSON.stringify(v).replace(/[\\$`"]/g, (c) => `\\${c}`);
  const curlJson = body
    ? `{${Object.entries(body).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(", ")}}`
    : "{}";
  const curlHint = body ? "" : `# ${BODY_HINT}\n`;

  const python = `from comfy_sdk import Comfy

# Reads COMFY_API_KEY from the environment. Each call sends a fresh
# Idempotency-Key and waits up to 10 minutes for the finished result.
with Comfy() as client:
    result = client.models.run(
        "${model}",
        {
${pyBody}
        },
    )

print(result)`;
  const typescript = `import { comfy } from "@comfyorg/sdk";

// Reads COMFY_API_KEY from the environment. Each call sends a fresh
// Idempotency-Key and waits up to 10 minutes for the finished result.
const { data } = await comfy.models.run("${model}", {
${tsBody}
});

console.log(data);`;
  const curl = `${curlHint}curl ${BASE_URL}${ROUTE}/${model} \\
  -H "X-API-Key: $COMFY_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d "${curlJson}"`;
  return `<CodeGroup>
\`\`\`python Python
${python}
\`\`\`

\`\`\`typescript TypeScript
${typescript}
\`\`\`

\`\`\`bash cURL
${curl}
\`\`\`
</CodeGroup>`;
}

function renderDerivedPage(model: string, s: ModelSchema): string {
  const provider = providerLabel(providerOf(model));
  const setup = `Create a key at [platform.comfy.org/profile/api-keys](https://platform.comfy.org/profile/api-keys) and export it as \`COMFY_API_KEY\`. The Python and TypeScript snippets use the Comfy SDKs (\`pip install comfy-sdk\`, \`npm install @comfyorg/sdk\`); the cURL snippet is the same call over raw HTTP.`;
  const docBase = PROVIDER_DOC_BASE[providerOf(model)];
  const apiDocs = PROVIDER_API_DOCS[providerOf(model)];
  const input = s.authored && s.input
    ? `${schemaFields(s.input, s.components, "param", docBase)}\n\nGenerated from the schema Router serves at \`GET ${ROUTE}/${model}/openapi.json\`, the same document it validates a call against before the request reaches the provider.`
    : `<Note>\nRouter has not published an authored input schema for this model yet: \`GET ${ROUTE}/${model}/openapi.json\` returns an open object with \`x-comfy-input-schema-authored: false\`. Router forwards the body to ${provider} unchanged, so ${apiDocs ? `[${provider}'s own API reference](${apiDocs})` : `${provider}'s own API documentation`} is authoritative for the request fields, and nothing is validated server side.\n</Note>`;
  const output = s.output
    ? schemaFields(s.output, s.components, "response", docBase)
    : `Router does not publish an output schema for this model.`;
  const examples = s.inputExample !== undefined || s.outputExample !== undefined
    ? `\n\n## Examples\n${s.inputExample !== undefined ? `\n### Input\n\n\`\`\`json\n${JSON.stringify(s.inputExample, null, 2)}\n\`\`\`\n` : ""}${s.outputExample !== undefined ? `\n### Output\n\n\`\`\`json\n${JSON.stringify(s.outputExample, null, 2)}\n\`\`\`\n` : ""}`
    : "";
  const title = modelTitle(model);
  return `---
title: ${JSON.stringify(`Use ${title} with Comfy Router`)}
description: ${JSON.stringify(`Call ${model} through Comfy Router: endpoint, request shape and the response Router returns.`)}
sidebarTitle: ${JSON.stringify(title)}
---

{/* GENERATED FILE. Generated from router-schemas/${model}.json by \`pnpm code-pages:gen\`. */}

${previewNotice.imports}import RouterCodeFooter from "/snippets/comfy-router/model-code-footer.mdx";

API Reference for \`${model}\`, served by Comfy Router from ${provider}.
${previewNotice.body}
## Quick start

${setup}

**Model ID:** \`${model}\`

**Endpoint:** \`POST ${BASE_URL}${ROUTE}/${model}\`

${derivedSnippets(model, s.inputExample)}

## Schema

### Input

${input}

### Output

${output}${examples}

<RouterCodeFooter />
`;
}

// ---------------------------------------------------------------------------
// Sidebar
//
// `docs.json` carries the nav for four locales; only `en` lists these pages, and
// the zh/ja/ko trees are maintained by the i18n sync. With one page per catalog
// model a flat list is unreadable, so the Models group holds one sub-group per
// provider.
// ---------------------------------------------------------------------------

type NavGroup = { group: string; pages: (string | NavGroup)[] };

function modelsNav(pages: { model: string; page: string }[]): NavGroup {
  const byProvider = new Map<string, string[]>();
  for (const { model, page } of pages) {
    const label = providerLabel(providerOf(model));
    const list = byProvider.get(label) ?? [];
    list.push(page);
    byProvider.set(label, list);
  }
  return {
    group: "Models",
    pages: [...byProvider.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, list]) => ({ group, pages: [...list].sort((a, b) => a.localeCompare(b)) })),
  };
}

/** Replace the `Models` group under `Comfy Router` in the `en` nav. Returns the new file text. */
function renderDocsJson(nav: NavGroup): string {
  const raw = readFileSync(join(ROOT, DOCS_JSON), "utf8");
  const doc = JSON.parse(raw);
  const en = doc.navigation?.languages?.find((l: any) => l.language === "en");
  if (!en) throw new Error(`${DOCS_JSON}: no \`en\` language in navigation.languages`);
  const groups: NavGroup[] = [];
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (typeof node.group === "string") groups.push(node);
      if (node.pages) walk(node.pages);
      if (node.tabs) walk(node.tabs);
      if (node.anchors) walk(node.anchors);
    }
  };
  walk(en);
  const router = groups.find((g) => g.group === "Comfy Router");
  if (!router) throw new Error(`${DOCS_JSON}: no \`Comfy Router\` group in the en nav`);
  const at = router.pages.findIndex((p) => typeof p === "object" && (p as NavGroup).group === "Models");
  if (at === -1) throw new Error(`${DOCS_JSON}: no \`Models\` group under \`Comfy Router\``);
  router.pages[at] = nav;
  return `${JSON.stringify(doc, null, 2)}\n`;
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
const prune = process.argv.includes("--prune");

type Page = { model: string; page: string; text: string; out: string };

const pages: Page[] = [];
const covered = new Set<string>();
let problems: string[] = [];

// ---- curated pages: one hand-written code.yaml, one page, one or more models
const specGlob = new Bun.Glob(SPEC_GLOB);
let specCount = 0;
for (const specPath of specGlob.scanSync({ cwd: ROOT })) {
  specCount++;
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
  if (problems.some((m) => m.startsWith(specPath))) continue;
  const dir = dirname(specPath);
  let text: string;
  try {
    // A malformed `result.path`, or a router-schemas document we cannot read, must not abandon the
    // remaining specs half written; report it against this spec and carry on, as YAML errors do.
    text = renderPage(spec, dir);
  } catch (e) {
    problems.push(`${specPath}: cannot render: ${(e as Error).message}`);
    continue;
  }
  for (const v of spec.variants) covered.add(v.model);
  pages.push({ model: spec.variants[0].model, page: `${dir}/code`, text, out: join(ROOT, dir, "code.mdx") });
}
if (specCount === 0) {
  console.error(`no specs matched ${SPEC_GLOB}`);
  process.exit(1);
}

// ---- derived pages: one per synced router schema with no curated spec
const schemaGlob = new Bun.Glob(SCHEMA_GLOB);
const claimed = new Map<string, string>(pages.map((p) => [p.page, "a code.yaml spec"]));
for (const rel of [...schemaGlob.scanSync({ cwd: ROOT })].sort()) {
  const model = rel.slice("router-schemas/".length).replace(/\.json$/, "");
  if (covered.has(model)) continue;
  let schema: ModelSchema | null;
  try {
    schema = loadModelSchema(model);
  } catch (e) {
    problems.push(`${rel}: ${(e as Error).message}`);
    continue;
  }
  if (!schema) {
    problems.push(`${rel}: model id does not match its path (expected router-schemas/<provider>/<model>.json)`);
    continue;
  }
  const dir = pageDir(model);
  const owner = claimed.get(`${dir}/code`);
  if (owner) {
    // Two model ids that differ only in punctuation would silently overwrite one another.
    problems.push(`${rel}: page directory ${dir} is already claimed by ${owner}`);
    continue;
  }
  claimed.set(`${dir}/code`, rel);
  pages.push({ model, page: `${dir}/code`, text: renderDerivedPage(model, schema), out: join(ROOT, dir, "code.mdx") });
}

// ---- write or check
const stale: string[] = [];
const missing: string[] = [];
for (const p of pages) {
  if (doValidate) problems.push(...validate(p.text, relative(ROOT, p.out)));
  if (check) {
    if (!existsSync(p.out)) missing.push(relative(ROOT, p.out));
    else if (readFileSync(p.out, "utf8") !== p.text) stale.push(relative(ROOT, p.out));
  } else {
    mkdirSync(dirname(p.out), { recursive: true });
    writeFileSync(p.out, p.text);
  }
}

// A model that leaves the catalog leaves its schema and, without this, its page:
// a dead page still in the sidebar, documenting a model that now answers 404.
const wanted = new Set(pages.map((p) => p.out));
const orphans = [...new Bun.Glob(`${MODELS_DIR}/*/*/code.mdx`).scanSync({ cwd: ROOT })]
  .filter((rel) => !wanted.has(join(ROOT, rel)))
  .sort();
for (const rel of orphans) {
  if (prune && !check) {
    rmSync(join(ROOT, dirname(rel)), { recursive: true, force: true });
    console.log(`pruned ${rel}`);
  } else {
    problems.push(`${rel}: no code.yaml spec and no router-schemas document (rerun with --prune to delete it)`);
  }
}

// ---- sidebar
let docsJson: string;
try {
  docsJson = renderDocsJson(modelsNav(pages.map(({ model, page }) => ({ model, page }))));
} catch (e) {
  problems.push((e as Error).message);
  docsJson = readFileSync(join(ROOT, DOCS_JSON), "utf8");
}
if (check) {
  if (docsJson !== readFileSync(join(ROOT, DOCS_JSON), "utf8")) stale.push(DOCS_JSON);
} else if (docsJson !== readFileSync(join(ROOT, DOCS_JSON), "utf8")) {
  writeFileSync(join(ROOT, DOCS_JSON), docsJson);
  console.log(`wrote ${DOCS_JSON}`);
}

if (missing.length) {
  console.error(
    `missing generated pages (run \`pnpm code-pages:gen\`) \u2014 a model Router serves has no page:\n  ${missing.join("\n  ")}`
  );
}
if (stale.length) {
  console.error(`stale generated pages (run \`pnpm code-pages:gen\`):\n  ${stale.join("\n  ")}`);
}
if (problems.length) console.error(problems.join("\n"));
if (missing.length || stale.length || problems.length) process.exit(1);
const derivedCount = pages.length - specCount;
if (check) console.log(`${pages.length} code page(s) fresh (${specCount} curated, ${derivedCount} derived)`);
else console.log(`wrote ${pages.length} code page(s) (${specCount} curated, ${derivedCount} derived)`);
