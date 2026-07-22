/**
 * Translate OpenAPI summary/description fields into locale-specific spec copies.
 * Used by translate-i18n.ts (pnpm translate) and sync-docs-json.mjs (source paths).
 *
 * Path encoding uses JSON Pointer (RFC 6901) style: each segment is joined with
 * "/", and segments containing "~" or "/" are escaped as "~0" / "~1" so that
 * OpenAPI path keys like "/proxy/bfl/flux-pro-1.1/generate" are handled
 * correctly (dot-joined paths would break on the "1.1" part).
 */

import { createHash } from "crypto";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { join, dirname } from "path";
import { REPO_ROOT } from "./i18n-config.mjs";

export interface OpenApiSpecConfig {
  /** Repo-relative English OpenAPI path (e.g. openapi/cloud.en.yaml). */
  source: string;
  /** Optional remote URL to refresh the English source (e.g. Registry API). */
  fetch_url?: string;
  /** Response format when fetch_url is set. Default: json */
  fetch_format?: "json" | "yaml";
}

export interface OpenApiTranslateOptions {
  dryRun?: boolean;
  force?: boolean;
  fetchOpenApi?: boolean;
  preserveTerms?: string[];
  /** Shared translate function from translate-i18n.ts */
  translateBatch: (
    entries: Record<string, string>,
    existingEntries: Record<string, string>,
    langName: string,
    relPath: string
  ) => Promise<Record<string, string>>;
}

interface LangConfig {
  code: string;
  name: string;
  dir: string;
}

interface Sidecar {
  translationSourceHash: string;
  translationFrom: string;
  blockHashes: Record<string, string>;
}

const TRANSLATABLE_KEYS = new Set(["summary", "description"]);

/** openapi/cloud.en.yaml -> openapi/cloud.zh.yaml */
export function localizedOpenApiSource(source: string, langCode: string): string {
  if (!source || langCode === "en") return source;
  if (/\.en\.(ya?ml|json)$/i.test(source)) {
    return source.replace(/\.en\.(ya?ml|json)$/i, (_, ext: string) => `.${langCode}.${ext}`);
  }
  return source.replace(/\.(ya?ml|json)$/i, (_, ext: string) => `.${langCode}.${ext}`);
}

export function sidecarPathForOutput(outputRel: string): string {
  const basename = outputRel.replace(/^openapi\//, "").replace(/\.(ya?ml|json)$/i, ".json");
  return `openapi/.i18n/${basename}`;
}

export function sourceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

export function blockHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// JSON Pointer (RFC 6901) helpers
// ---------------------------------------------------------------------------

/** Escape a single path segment per RFC 6901: ~ -> ~0, / -> ~1. */
export function escapeJpSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Unescape a JSON Pointer segment: ~1 -> /, ~0 -> ~. */
export function unescapeJpSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Parse a JSON Pointer path string into an array of segments.
 * Handles both absolute pointers (leading "/") and legacy dot-format paths
 * (no leading "/") for backward compatibility with old sidecars.
 * Array index segments are returned as numbers.
 */
export function parseJpPath(path: string): Array<string | number> {
  if (path.startsWith("/")) {
    // JSON Pointer format: /info/description or /paths/~1proxy~1.../post/summary
    const parts = path.split("/");
    // First element is empty string from the leading "/"
    parts.shift();
    return parts.map((s) => {
      const unescaped = unescapeJpSegment(s);
      const n = Number(unescaped);
      return Number.isFinite(n) && String(n) === unescaped ? n : unescaped;
    });
  }
  // Legacy dot-format fallback (old sidecar compatibility)
  const parts: Array<string | number> = [];
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    if (match[1] != null) parts.push(match[1]);
    else if (match[2] != null) parts.push(Number(match[2]));
  }
  return parts;
}

function getAtPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of parseJpPath(path)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[part];
  }
  return cur;
}

function setAtPath(root: Record<string, unknown>, path: string, value: string): void {
  const parts = parseJpPath(path);
  let cur: Record<string | number, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = cur[part];
    if (next == null || typeof next !== "object") return;
    cur = next as Record<string | number, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last == null) return;
  cur[last] = value;
}

// ---------------------------------------------------------------------------
// String extraction & translation application
// ---------------------------------------------------------------------------

/** Walk an OpenAPI object and collect summary/description string values. */
export function extractTranslatableStrings(
  value: unknown,
  path = ""
): Record<string, string> {
  const out: Record<string, string> = {};

  if (value == null) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      Object.assign(out, extractTranslatableStrings(item, `${path}/${index}`));
    });
    return out;
  }

  if (typeof value !== "object") return out;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const escapedKey = escapeJpSegment(key);
    const childPath = path ? `${path}/${escapedKey}` : escapedKey;
    if (
      TRANSLATABLE_KEYS.has(key) &&
      typeof child === "string" &&
      child.trim().length > 0
    ) {
      out[childPath] = child;
    } else {
      Object.assign(out, extractTranslatableStrings(child, childPath));
    }
  }

  return out;
}

export function applyTranslations(
  englishSpec: Record<string, unknown>,
  translations: Record<string, string>
): Record<string, unknown> {
  const cloned = structuredClone(englishSpec) as Record<string, unknown>;
  for (const [path, translated] of Object.entries(translations)) {
    setAtPath(cloned, path, translated);
  }
  return cloned;
}

function aggregateHash(strings: Record<string, string>): string {
  const keys = Object.keys(strings).sort();
  const payload = keys.map((k) => `${k}\0${strings[k]}`).join("\n");
  return sourceHash(payload);
}

async function readSidecar(path: string): Promise<Sidecar | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as Sidecar;
  } catch {
    return null;
  }
}

async function writeSidecar(path: string, sidecar: Sidecar): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(sidecar, null, 2)}\n`);
}

function yamlHeader(sourceRel: string, hash: string): string {
  return [
    `# translationSourceHash: ${hash}`,
    `# translationFrom: ${sourceRel}`,
    "",
  ].join("\n");
}

export async function parseSpecFile(absPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(absPath, "utf-8");
  if (/\.json$/i.test(absPath)) return JSON.parse(raw) as Record<string, unknown>;
  const body = stripYamlHeader(raw).body;
  return Bun.YAML.parse(body) as Record<string, unknown>;
}

/** Pretty-printed YAML for readable diffs and editing (block style, indented). */
export function stringifyYamlSpec(spec: Record<string, unknown>): string {
  const body = Bun.YAML.stringify(spec, null, 2);
  return body.endsWith("\n") ? body : `${body}\n`;
}

export function stripYamlHeader(raw: string): { header: string; body: string } {
  const lines = raw.split("\n");
  const headerLines: string[] = [];
  let i = 0;
  while (i < lines.length && (lines[i].startsWith("#") || lines[i].trim() === "")) {
    if (lines[i].startsWith("#")) headerLines.push(lines[i]);
    else if (headerLines.length > 0) headerLines.push(lines[i]);
    i++;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  const header =
    headerLines.length > 0 ? `${headerLines.join("\n").replace(/\n+$/, "")}\n\n` : "";
  return { header, body: lines.slice(i).join("\n") };
}

async function writeSpecFile(
  absPath: string,
  spec: Record<string, unknown>,
  header = ""
): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  if (/\.json$/i.test(absPath)) {
    await writeFile(absPath, `${JSON.stringify(spec, null, 2)}\n`);
    return;
  }
  await writeFile(absPath, `${header}${stringifyYamlSpec(spec)}`);
}

export async function ensureEnglishOpenApiSource(
  spec: OpenApiSpecConfig,
  options: { fetchOpenApi?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const absPath = join(REPO_ROOT, spec.source);
  const needsFetch = Boolean(spec.fetch_url);
  if (!needsFetch) return;

  let exists = true;
  try {
    await access(absPath);
  } catch {
    exists = false;
  }

  if (!options.fetchOpenApi && exists) return;

  // Dry-run guard: never write when dry-run is active
  if (options.dryRun) {
    console.log(
      `[openapi] DRY-RUN: would fetch ${spec.source} from ${spec.fetch_url}`
    );
    return;
  }

  if (!spec.fetch_url) return;

  console.log(`[openapi] Fetching ${spec.source} from ${spec.fetch_url} ...`);
  const response = await fetch(spec.fetch_url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${spec.fetch_url}: HTTP ${response.status}`);
  }

  const format = spec.fetch_format ?? "json";
  let parsed: Record<string, unknown>;
  if (format === "yaml") {
    parsed = Bun.YAML.parse(await response.text()) as Record<string, unknown>;
  } else {
    parsed = (await response.json()) as Record<string, unknown>;
  }

  await writeSpecFile(absPath, parsed);
  console.log(`[openapi] Wrote ${spec.source}`);
}

function chunkEntries(
  entries: Record<string, string>,
  maxEntries = 25,
  maxChars = 8000
): Record<string, string>[] {
  const keys = Object.keys(entries).sort();
  const chunks: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  let chars = 0;

  for (const key of keys) {
    const value = entries[key];
    const size = key.length + value.length + 4;
    const currentCount = Object.keys(current).length;
    if (
      currentCount > 0 &&
      (currentCount >= maxEntries || chars + size > maxChars)
    ) {
      chunks.push(current);
      current = {};
      chars = 0;
    }
    current[key] = value;
    chars += size;
  }

  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

export async function translateOpenApiForLanguage(
  spec: OpenApiSpecConfig,
  lang: LangConfig,
  options: OpenApiTranslateOptions
): Promise<"translated" | "skipped" | "dry-run"> {
  const sourceAbs = join(REPO_ROOT, spec.source);
  const outputRel = localizedOpenApiSource(spec.source, lang.code);
  const outputAbs = join(REPO_ROOT, outputRel);
  const sidecarAbs = join(REPO_ROOT, sidecarPathForOutput(outputRel));

  const englishSpec = await parseSpecFile(sourceAbs);
  const englishStrings = extractTranslatableStrings(englishSpec);
  const fileHash = aggregateHash(englishStrings);

  const sidecar = await readSidecar(sidecarAbs);

  const existingStrings: Record<string, string> = {};
  if (await readFile(outputAbs, "utf-8").catch(() => null)) {
    try {
      const existingSpec = await parseSpecFile(outputAbs);
      Object.assign(existingStrings, extractTranslatableStrings(existingSpec));
    } catch {
      // ignore corrupt prior output
    }
  }

  const pending: Record<string, string> = {};
  const merged: Record<string, string> = {};
  const nextBlockHashes: Record<string, string> = {};

  for (const [path, enText] of Object.entries(englishStrings)) {
    const hash = blockHash(enText);
    nextBlockHashes[path] = hash;
    const unchanged =
      !options.force &&
      sidecar?.blockHashes?.[path] === hash &&
      existingStrings[path] &&
      existingStrings[path] !== enText;
    if (unchanged) {
      merged[path] = existingStrings[path];
    } else {
      pending[path] = enText;
    }
  }

  if (
    !options.dryRun &&
    !options.force &&
    Object.keys(pending).length === 0 &&
    (await readFile(outputAbs, "utf-8").catch(() => null)) != null
  ) {
    return "skipped";
  }

  if (options.dryRun) {
    const pendingCount = Object.keys(pending).length;
    console.log(
      `[openapi][${lang.code}] ${spec.source} -> ${outputRel}: ${pendingCount} block(s) pending (${Object.keys(englishStrings).length} total)`
    );
    return "dry-run";
  }

  const chunks = chunkEntries(pending);
  const totalChunks = chunks.length;
  if (totalChunks > 0) {
    console.log(
      `[openapi][${lang.code}] ${spec.source}: ${Object.keys(pending).length} field(s) in ${totalChunks} chunk(s)`
    );
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(
      `[openapi][${lang.code}] ${spec.source}: chunk ${i + 1}/${totalChunks} (${Object.keys(chunk).length} fields)`
    );
    const existingChunk: Record<string, string> = {};
    for (const key of Object.keys(chunk)) {
      if (existingStrings[key]) existingChunk[key] = existingStrings[key];
    }
    const translated = await options.translateBatch(
      chunk,
      existingChunk,
      lang.name,
      outputRel
    );
    for (const [key, value] of Object.entries(translated)) {
      if (typeof value === "string" && value.trim()) merged[key] = value;
    }

    // Checkpoint after each chunk so a long run can resume without redoing finished batches.
    for (const [path, enText] of Object.entries(englishStrings)) {
      if (!merged[path]) merged[path] = enText;
    }
    const checkpointSpec = applyTranslations(englishSpec, merged);
    const header = yamlHeader(spec.source, fileHash);
    await writeSpecFile(outputAbs, checkpointSpec, header);
    await writeSidecar(sidecarAbs, {
      translationSourceHash: fileHash,
      translationFrom: spec.source,
      blockHashes: nextBlockHashes,
    });
  }

  return Object.keys(pending).length > 0 ? "translated" : "skipped";
}

export async function runOpenApiTranslation(
  specs: OpenApiSpecConfig[],
  langs: LangConfig[],
  options: OpenApiTranslateOptions
): Promise<{ translated: number; skipped: number; failed: number }> {
  let translated = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of specs) {
    try {
      await ensureEnglishOpenApiSource(spec, {
        fetchOpenApi: options.fetchOpenApi,
        dryRun: options.dryRun,
      });
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[openapi] FAIL fetch ${spec.source}: ${msg}`);
      continue;
    }

    for (const lang of langs) {
      try {
        const status = await translateOpenApiForLanguage(spec, lang, options);
        if (status === "translated" || status === "dry-run") translated++;
        else skipped++;
        if (status === "translated") {
          console.log(`[openapi] OK   [${lang.code}] ${spec.source}`);
        } else if (status === "skipped") {
          console.log(`[openapi] SKIP [${lang.code}] ${spec.source}`);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[openapi] FAIL [${lang.code}] ${spec.source}: ${msg}`);
      }
    }
  }

  return { translated, skipped, failed };
}
