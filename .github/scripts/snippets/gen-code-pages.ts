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
const CLIENT_TIMEOUT_S = 660; // above Router's 10 minute server deadline

type Variant = { title: string; model: string; example?: Record<string, unknown> };
type Spec = {
  name: string;
  provider: string;
  description: string;
  task?: string;
  variants: Variant[];
  example: Record<string, unknown>;
  fields: string;
  result: { path: string; label: string; example: unknown; note?: string };
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
  const esc = (v: unknown) => JSON.stringify(v).replace(/"/g, '\\"');
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
// Page template
// ---------------------------------------------------------------------------

function variantBlock(v: Variant, spec: Spec): string {
  const example = v.example ?? spec.example;
  const files = fileInputs(example);
  const label = spec.result.label;
  return `  <Tab title="${v.title}">
**Model ID:** \`${v.model}\`

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
</CodeGroup>
  </Tab>`;
}

function renderPage(spec: Spec, dir: string): string {
  const overview = "/" + dir; // tutorials/partner-nodes/<provider>/<model>
  const both = spec.variants.length > 1;
  const modelsPhrase = both
    ? `both ${spec.name} models`
    : `${spec.name}`;
  const fields = spec.fields.replace(/\s+/g, " ").trim();
  const resultJson = JSON.stringify(spec.result.example, null, 2);
  return `---
title: "Call ${spec.name} from code with Comfy Router"
description: "${spec.description.replace(/\s+/g, " ").trim()}"
sidebarTitle: "Code"
---

{/* GENERATED FILE. Edit code.yaml in this directory and run \`pnpm code-pages:gen\`. */}

import RouterPreviewNotice from "/snippets/comfy-router/preview-notice.mdx";
import RouterCodeFooter from "/snippets/comfy-router/model-code-footer.mdx";

${spec.intro ?? `This page shows how to call ${spec.name} from your own code.`} For what the model is and what it does best, see the [${spec.name} overview](${overview}). To run it interactively in ComfyUI instead, see the [workflows](${overview}/workflow).

<RouterPreviewNotice />

Comfy Router runs ${modelsPhrase} behind one host, one credential and one route. The request body is ${possessive(spec.provider)} own native JSON input and the response is their native JSON output, unwrapped, so a call written against the ${spec.provider} API becomes a Router call by changing the host. Create a key at [platform.comfy.org/profile/api-keys](https://platform.comfy.org/profile/api-keys) and export it as \`COMFY_API_KEY\`; every snippet below reads it from the environment. The Python and TypeScript snippets use the Comfy SDKs (\`pip install comfy-sdk\`, \`npm install @comfyorg/sdk\`), which send an \`Idempotency-Key\` on every call, wait up to Router's 10 minute deadline, and surface \`X-Comfy-Request-Id\` on results and errors. The cURL snippet is the same call over raw HTTP.

## Quick start
${both ? `
${spec.variants.some((v) => v.example) ? "Pick the tab for the model you want to call. The model ID in the path changes, and so does the request body where the models take different inputs." : "The only difference between the variants is the model ID in the path. Pick the tab for the model you want to call."}
` : ""}
<Tabs>
${spec.variants.map((v) => variantBlock(v, spec)).join("\n")}
</Tabs>

## Request fields

${fields} This list is a convenience: the authoritative schema is served live, and it is the same document Router validates your call against.

\`\`\`bash
curl -H "X-API-Key: $COMFY_API_KEY" \\
  ${BASE_URL}${ROUTE}/${spec.variants[0].model}/openapi.json
\`\`\`

## Read the result

Router holds the connection until the ${spec.task ?? "generation"} is finished and returns ${possessive(spec.provider)} native result. The ${spec.result.label} is at \`${spec.result.path}\`:

\`\`\`json
${resultJson}
\`\`\`
${spec.result.note ? `\n${spec.result.note}\n` : ""}
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
  for (const key of ["name", "provider", "description", "variants", "example", "fields", "result"] as const) {
    if (spec[key] === undefined) problems.push(`${specPath}: missing required key \`${key}\``);
  }
  if (problems.some((m) => m.startsWith(specPath))) continue;
  const dir = dirname(specPath);
  const out = join(ROOT, dir, "code.mdx");
  const page = renderPage(spec, dir);
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
