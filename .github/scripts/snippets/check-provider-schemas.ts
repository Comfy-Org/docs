#!/usr/bin/env bun
/**
 * Check every code.yaml `input` / `output` schema against the PROVIDER's own
 * published API specification, so the fields we document are the fields the
 * provider actually accepts and returns.
 *
 *   bun .github/scripts/snippets/check-provider-schemas.ts            # report drift, exit 1 on errors
 *   bun .github/scripts/snippets/check-provider-schemas.ts --strict   # also fail on fields we omit
 *
 * Each spec (or variant) names where its provider publishes the contract:
 *
 *   provider_spec:
 *     url: https://api.bfl.ai/openapi.json          # OpenAPI 3 document, or a Google discovery document
 *     operation: POST /v1/flux-kontext-pro            # request body = this operation's application/json schema
 *     response_operation: GET /v1/get_result          # optional: where the FINAL result shape lives (poll route)
 *     request: GenerateContentRequest                 # google-discovery: schema names instead of operations
 *     response: GenerateContentResponse
 *     omit: [webhook_url, webhook_secret]            # provider fields we deliberately do not document
 *
 * Errors (exit 1): a documented field the provider does not have; a type, default,
 * enum, bound or required-ness that disagrees with the provider. Warnings: provider
 * fields we do not document (errors under --strict), and provider shapes that are
 * opaque (`{}`) where we document structure.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const strict = process.argv.includes("--strict");
const verbose = process.argv.includes("--verbose");

type ProviderSpec = { url: string; operation?: string; response_operation?: string; request?: string; response?: string; omit?: string[] };

const FETCH_TIMEOUT_MS = 20_000;
const cache = new Map<string, Promise<any>>();
async function fetchOnce(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
/** Transient = the request never produced an HTTP status (timeout, DNS, reset). Those are worth one retry; an HTTP error is not. */
const transient = (e: unknown) => !(e instanceof Error) || !/: HTTP \d+$/.test(e.message);
function fetchDoc(url: string): Promise<any> {
  // A provider that never answers would otherwise hold this promise open for the job's whole runner limit.
  if (!cache.has(url)) cache.set(url, fetchOnce(url).catch((e) => { if (!transient(e)) throw e; return fetchOnce(url); }));
  return cache.get(url)!;
}

// ---- normalise provider schemas (OpenAPI 3 or Google discovery) into plain JSON-schema-ish objects
function normalizer(doc: any) {
  const isDiscovery = !!doc.schemas && !doc.openapi;
  const comps: Record<string, any> = isDiscovery ? doc.schemas : doc.components?.schemas ?? {};
  const seen = new Set<string>();
  const norm = (s: any, depth = 0): any => {
    if (!s || depth > 12) return {};
    if (s.$ref) {
      const name = String(s.$ref).split("/").pop()!;
      if (seen.has(name) && depth > 6) return { type: "object", opaque: true };
      seen.add(name);
      return norm(comps[name], depth + 1);
    }
    if (s.anyOf || s.oneOf) {
      const alts = (s.anyOf ?? s.oneOf).map((a: any) => norm(a, depth + 1)).filter((a: any) => a.type !== "null");
      if (alts.length === 1) return { ...alts[0], nullable: true, ...(s.default !== undefined ? { default: s.default } : {}) };
      // discriminated unions (FLUX 3 Video): union of properties, required = intersection
      const props: Record<string, any> = {}; let req: Set<string> | null = null;
      for (const a of alts) {
        Object.assign(props, a.properties ?? {});
        const r = new Set<string>(a.required ?? []); req = req ? new Set([...req].filter((x) => r.has(x))) : r;
      }
      const types = [...new Set(alts.map((a: any) => a.type).filter(Boolean))];
      return { type: types.length === 1 ? types[0] : types, properties: props, required: [...(req ?? [])], union: true, ...(s.default !== undefined ? { default: s.default } : {}) };
    }
    if (s.allOf) return s.allOf.map((a: any) => norm(a, depth + 1)).reduce((acc: any, d: any) => ({ ...acc, ...d, properties: { ...(acc.properties ?? {}), ...(d.properties ?? {}) }, required: [...(acc.required ?? []), ...(d.required ?? [])] }), {});
    const out: any = { type: s.type };
    if ((s.type === "object" || s.type === undefined) && !s.properties && !s.items && !s.enum && !s.anyOf) out.opaque = true;
    for (const k of ["default", "enum", "minimum", "maximum", "format", "description"]) if (s[k] !== undefined) out[k] = s[k];
    if (s.properties) { out.properties = {}; for (const [k, v] of Object.entries<any>(s.properties)) out.properties[k] = norm(v, depth + 1); }
    if (s.required) out.required = s.required;
    if (s.items) out.items = norm(s.items, depth + 1);
    if (isDiscovery && s.type === undefined && s.properties) out.type = "object";
    return out;
  };
  return { norm, isDiscovery, comps };
}

function findOperation(doc: any, op: string) {
  const [method, path] = op.split(" ");
  const node = doc.paths?.[path]?.[method.toLowerCase()];
  if (!node) throw new Error(`operation ${op} not found in ${doc.info?.title ?? "spec"}`);
  return node;
}

async function providerShapes(ps: ProviderSpec): Promise<{ input: any; output: any }> {
  const doc = await fetchDoc(ps.url);
  const { norm, isDiscovery, comps } = normalizer(doc);
  if (isDiscovery) {
    // Google discovery documents do not express `required`, so required-ness cannot be checked against them.
    const pick = (key: "request" | "response") => {
      const name = ps[key];
      if (!name) throw new Error(`provider_spec.${key} is required: ${ps.url} is a discovery document, which names schemas rather than operations`);
      if (!comps[name]) throw new Error(`provider_spec.${key}: \`${name}\` is not a schema in ${ps.url}`);
      return { ...norm({ $ref: name }), noRequiredInfo: true };
    };
    return { input: pick("request"), output: pick("response") };
  }
  if (!ps.operation) throw new Error(`provider_spec.operation is required: ${ps.url} is an OpenAPI document, which names operations rather than schemas`);
  const op = findOperation(doc, ps.operation);
  const req = op.requestBody?.content?.["application/json"]?.schema;
  const resOp = ps.response_operation ? findOperation(doc, ps.response_operation) : op;
  const res = resOp.responses?.["200"]?.content?.["application/json"]?.schema;
  return { input: norm(req), output: norm(res) };
}

// ---- comparison
type Report = { errors: string[]; warnings: string[] };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const baseType = (t: unknown) => (Array.isArray(t) ? t : [t]).map(String);
const compatible = (ours: unknown, theirs: unknown) => {
  if (theirs === undefined) return true;
  const o = baseType(ours), t = baseType(theirs);
  return o.some((x) => t.includes(x) || (x === "integer" && t.includes("number")) || (x === "number" && t.includes("integer")));
};

/**
 * Collapse a documented `anyOf` / `oneOf` (e.g. `integer | "auto"`) into one comparable shape,
 * the way `norm` already collapses the provider's: union of types and properties, intersection
 * of `required`, widest bounds. Without this a documented union reads as an untyped field.
 */
function flatten(s: any): any {
  const alts: any[] = s?.anyOf ?? s?.oneOf;
  if (!Array.isArray(alts) || !alts.length) return s;
  const types = [...new Set(alts.flatMap((a) => (Array.isArray(a.type) ? a.type : [a.type])).filter(Boolean))];
  const nums = (k: string) => alts.map((a) => a[k]).filter((n) => n !== undefined).map(Number);
  const props: Record<string, any> = {}; let req: Set<string> | null = null;
  for (const a of alts) {
    Object.assign(props, a.properties ?? {});
    const r = new Set<string>(a.required ?? []); req = req ? new Set([...req].filter((x) => r.has(x))) : r;
  }
  const [mins, maxs] = [nums("minimum"), nums("maximum")];
  return {
    ...s, anyOf: undefined, oneOf: undefined,
    type: s.type ?? (types.length === 1 ? types[0] : types),
    ...(mins.length ? { minimum: Math.min(...mins) } : {}),
    ...(maxs.length ? { maximum: Math.max(...maxs) } : {}),
    ...(Object.keys(props).length ? { properties: { ...props, ...(s.properties ?? {}) }, required: [...(req ?? [])] } : {}),
  };
}

function compare(ours: any, theirs: any, where: string, omit: Set<string>, rep: Report, prefix = "", noRequired = false) {
  ours = flatten(ours);
  noRequired = noRequired || !!theirs?.noRequiredInfo;
  if (!theirs || theirs.opaque) { if (ours?.properties && Object.keys(ours.properties).length) rep.warnings.push(`${where}: provider declares \`${prefix || "body"}\` as an opaque object; cannot verify ${Object.keys(ours.properties).length} documented field(s) beneath it`); return; }
  const ourReq = new Set<string>(ours.required ?? []); const theirReq = new Set<string>(theirs.required ?? []);
  for (const [name, raw] of Object.entries<any>(ours.properties ?? {})) {
    const o = flatten(raw);
    const path = prefix ? `${prefix}.${name}` : name;
    const t = theirs.properties?.[name];
    if (!t) { rep.errors.push(`${where}: \`${path}\` is documented but the provider spec has no such field`); continue; }
    if (!compatible(o.type, t.type)) rep.errors.push(`${where}: \`${path}\` type ${JSON.stringify(o.type)} vs provider ${JSON.stringify(t.type)}`);
    if (!noRequired && ourReq.has(name) !== theirReq.has(name) && !theirs.union) rep.errors.push(`${where}: \`${path}\` required=${ourReq.has(name)} vs provider required=${theirReq.has(name)}`);
    if (t.default !== undefined && o.default !== undefined && !eq(o.default, t.default)) rep.errors.push(`${where}: \`${path}\` default ${JSON.stringify(o.default)} vs provider ${JSON.stringify(t.default)}`);
    if (t.default !== undefined && o.default === undefined && !prefix.includes("[]")) rep.warnings.push(`${where}: \`${path}\` provider default ${JSON.stringify(t.default)} is not documented`);
    if (o.default !== undefined && t.default === undefined) rep.warnings.push(`${where}: \`${path}\` documents default ${JSON.stringify(o.default)} but the provider spec declares none`);
    if (o.enum && t.enum) { const extra = o.enum.filter((v: unknown) => !t.enum.includes(v)); if (extra.length) rep.errors.push(`${where}: \`${path}\` enum values ${JSON.stringify(extra)} are not in the provider's ${JSON.stringify(t.enum)}`); const missing = t.enum.filter((v: unknown) => !o.enum.includes(v) && !String(v).endsWith("UNSPECIFIED")); if (missing.length) rep.warnings.push(`${where}: \`${path}\` provider also allows ${JSON.stringify(missing)}`); }
    if (t.enum && !o.enum && t.enum.length <= 12) rep.warnings.push(`${where}: \`${path}\` provider enumerates ${JSON.stringify(t.enum)} but we document a free ${o.type}`);
    for (const b of ["minimum", "maximum"] as const) if (o[b] !== undefined && t[b] !== undefined && Number(o[b]) !== Number(t[b])) rep.errors.push(`${where}: \`${path}\` ${b} ${o[b]} vs provider ${t[b]}`);
    if (o.properties) compare(o, t, where, omit, rep, path, noRequired);
    if (o.items?.properties) compare(o.items, t.items, where, omit, rep, `${path}[]`, noRequired);
  }
  for (const name of Object.keys(theirs.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (!ours.properties?.[name] && !omit.has(path) && !omit.has(name) && !prefix.includes("[]") && prefix.split(".").length <= 1) {
      (strict ? rep.errors : rep.warnings).push(`${where}: provider field \`${path}\` is not documented${theirReq.has(name) ? " (and the provider marks it required)" : ""}`);
    }
  }
}

// ---- main
const glob = new Bun.Glob("tutorials/partner-nodes/**/code.yaml");
const rep: Report = { errors: [], warnings: [] };
let checked = 0, skipped = 0;
for (const specPath of glob.scanSync({ cwd: ROOT })) {
  const spec = Bun.YAML.parse(readFileSync(join(ROOT, specPath), "utf8")) as any;
  for (const v of spec.variants) {
    const ps: ProviderSpec | undefined = v.provider_spec ?? spec.provider_spec;
    const input = v.input ?? spec.input, output = v.output ?? spec.output;
    if (!ps) { skipped++; rep.warnings.push(`${dirname(specPath)} (${v.model}): no provider_spec, cannot verify`); continue; }
    const where = `${dirname(specPath).replace("tutorials/partner-nodes/", "")} (${v.model})`;
    try {
      const shapes = await providerShapes(ps);
      const omit = new Set<string>(ps.omit ?? []);
      if (input) compare(input, shapes.input, `${where} input`, omit, rep);
      if (output) compare(output, shapes.output, `${where} output`, omit, rep);
      checked++;
    } catch (e) { rep.errors.push(`${where}: ${(e as Error).message}`); }
  }
}
if (verbose) for (const w of rep.warnings) console.log(`warn  ${w}`);
else if (rep.warnings.length) console.log(`(${rep.warnings.length} warning(s); run with --verbose to list them)`);
for (const e of rep.errors) console.log(`ERROR ${e}`);
console.log(`\n${checked} model(s) checked against provider specs, ${skipped} skipped, ${rep.errors.length} error(s), ${rep.warnings.length} warning(s)`);
process.exit(rep.errors.length ? 1 : 0);
