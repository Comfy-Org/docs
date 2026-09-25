#!/usr/bin/env bun
/**
 * Sync the committed glossary from the ComfyUI frontend locales.
 *
 * The ComfyUI frontend is the authoritative source of term translations. This
 * pulls every translated, term-like string from the frontend locale files
 * (main / nodeDefs / settings / commands) and writes a pure machine mirror to
 * glossary/frontend/{lang}.json. The translator injects these at translation
 * time.
 *
 * This writes ONLY the frontend layer and rebuilds it wholesale every run.
 * Hand-maintained corrections live in glossary/overrides/{lang}.json, which
 * this script never reads or touches — that layer wins at translation time and
 * is the place to remap a term or drop a noisy frontend term (see glossary.mjs).
 *
 * A filter keeps the mirror safe to inject as terminology hints:
 *   - drops stopwords / common short function words (of, on, you, work, …) and
 *     bare 1–3 char strings — these have UI-specific renderings that would
 *     mislead prose translation (e.g. "of" → "중", "work" → "업무용").
 *   - drops full sentences, placeholders ({count}), and label-with-colon text.
 *   - keeps multi-word and longer single-word terms, including harmless UI
 *     phrases ("Download image").
 *
 * Harmless noise is fine: at translation time only terms that literally appear
 * in a document are injected, framed as *preferred* hints, not mandatory
 * substitutions. Genuinely harmful single words go in the override ignore-list.
 *
 * Locale source resolution (first match wins):
 *   Local (only when explicitly set and the path exists):
 *     1. --frontend <path>   CLI flag
 *     2. FRONTEND_LOCALES_PATH env var
 *   Remote (default — fetches latest on each run):
 *     3. --frontend-url <url>   CLI flag
 *     4. FRONTEND_LOCALES_URL env var
 *     5. frontend_locales_url in translation-config.json
 *     6. https://raw.githubusercontent.com/Comfy-Org/ComfyUI_frontend/main/src/locales
 *
 * Usage:
 *   bun .github/scripts/i18n/sync-glossary.mjs               # all configured langs
 *   bun .github/scripts/i18n/sync-glossary.mjs --lang ko     # one language
 *   bun .github/scripts/i18n/sync-glossary.mjs --dry-run     # report only, no write
 *
 * Requires Bun.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { loadI18nConfig, REPO_ROOT, parseLangArg } from "./i18n-config.mjs";
import { FRONTEND_DIR } from "./glossary.mjs";

const DEFAULT_FRONTEND_LOCALES_URL =
  "https://raw.githubusercontent.com/Comfy-Org/ComfyUI_frontend/main/src/locales";

const config = loadI18nConfig();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

/** Frontend locale files to harvest. nodeDefs uses display_name; others are flat key→string. */
const SOURCE_FILES = ["main.json", "nodeDefs.json", "settings.json", "commands.json"];

/** Function words with UI-specific renderings — never useful as prose terminology. */
// Grammar function words — never terminology.
const STOPWORDS =
  "a an the of to in on off or and for with you your we our us i me my is are be am " +
  "was were it its this that these those at by as from into onto over under up down " +
  "out yes no ok per via not do does done";

// Ordinary vocabulary that appears in UI strings but is not domain terminology.
// These collide with short domain terms by length alone, so an explicit list is
// the only reliable filter (e.g. keep "node"/"model" but drop "work"/"mode").
// The long tail that slips through goes in each override's `ignore` list.
const COMMON_WORDS =
  "all none any some each work works working here there now then add added adding " +
  "use used using run running runs new old other others name names type types mode " +
  "modes core share shared small large big more less most least set sets get got " +
  "make made show shows hide open close save load help back next prev also only just " +
  "very much many few same change changed changes edit view item items value values " +
  "text default enable enabled disable disabled allow allowed title additional";

const BLOCKLIST = new Set(`${STOPWORDS} ${COMMON_WORDS}`.split(/\s+/));

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

// ---------------------------------------------------------------------------
// Resolve frontend locales source (local path or remote URL)
// ---------------------------------------------------------------------------

function resolveLocalFrontendPath() {
  const candidates = [flagValue("--frontend"), process.env.FRONTEND_LOCALES_PATH].filter(Boolean);
  for (const c of candidates) {
    const abs = c.startsWith("/") ? c : join(REPO_ROOT, c);
    if (existsSync(join(abs, "en", "main.json"))) return abs;
  }
  return null;
}

function resolveRemoteFrontendUrl() {
  return (
    flagValue("--frontend-url") ||
    process.env.FRONTEND_LOCALES_URL ||
    config.frontend_locales_url ||
    DEFAULT_FRONTEND_LOCALES_URL
  );
}

function resolveFrontendSource() {
  const local = resolveLocalFrontendPath();
  if (local) return { kind: "local", value: local };
  return { kind: "remote", value: resolveRemoteFrontendUrl().replace(/\/$/, "") };
}

// ---------------------------------------------------------------------------
// Locale data access (local filesystem or remote fetch)
// ---------------------------------------------------------------------------

function readLocalLocaleFile(frontendPath, langCode, file) {
  const filePath = join(frontendPath, langCode, file);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

async function fetchRemoteLocaleFile(baseUrl, langCode, file) {
  const url = `${baseUrl}/${langCode}/${file}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  return JSON.parse(await res.text());
}

async function createLocaleReader(source) {
  if (source.kind === "local") {
    return (langCode, file) => readLocalLocaleFile(source.value, langCode, file);
  }

  const cache = new Map();
  return async (langCode, file) => {
    const key = `${langCode}/${file}`;
    if (!cache.has(key)) {
      cache.set(key, await fetchRemoteLocaleFile(source.value, langCode, file));
    }
    return cache.get(key);
  };
}

// ---------------------------------------------------------------------------
// Term extraction + filtering
// ---------------------------------------------------------------------------

/** Flatten a nested locale object to { dottedKey: string }. */
function flatten(obj, out = {}, prefix = "") {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") flatten(v, out, key);
  }
  return out;
}

/** nodeDefs is keyed by node id; the term is each entry's display_name. */
function flattenNodeDefs(defs) {
  const out = {};
  for (const k of Object.keys(defs)) {
    const d = defs[k]?.display_name;
    if (typeof d === "string") out[`node.${k}`] = d;
  }
  return out;
}

function flattenFile(name, obj) {
  return name === "nodeDefs.json" ? flattenNodeDefs(obj) : flatten(obj);
}

/** Strip trailing status suffixes the frontend appends (mostly node names). */
function cleanTerm(s) {
  return s.replace(/\s*\((?:DEPRECATED|BETA|EXPERIMENTAL|LEGACY)\)\s*$/i, "").trim();
}

/** Keep only short, term-like strings safe to inject as terminology hints. */
function isTermLike(en) {
  const w = en.trim();
  if (w.length < 3) return false; // bare 1–2 char strings (of, on, OR)
  const words = w.split(/\s+/);
  if (words.length > 5) return false; // full sentences
  if (/[.!?:]/.test(w)) return false; // sentences / label-with-colon
  if (/\{.*?\}/.test(w)) return false; // ICU placeholders
  if (words.length === 1 && BLOCKLIST.has(w.toLowerCase())) return false;
  if (words.every((x) => BLOCKLIST.has(x.toLowerCase()))) return false;
  return true;
}

/**
 * Build the frontend mirror { enTermLower: target } for one language from all
 * source files. First definition of a given English term wins on duplicates.
 */
async function extractTerms(readLocale, langCode) {
  const enFlat = {};
  const tFlat = {};
  for (const file of SOURCE_FILES) {
    const enObj = await readLocale("en", file);
    if (!enObj) {
      throw new Error(`Missing English locale file: en/${file}`);
    }
    Object.assign(enFlat, flattenFile(file, enObj));
    const tObj = await readLocale(langCode, file);
    if (tObj) Object.assign(tFlat, flattenFile(file, tObj));
  }

  const terms = {};
  for (const [key, enRaw] of Object.entries(enFlat)) {
    const en = cleanTerm(enRaw);
    if (!isTermLike(en)) continue;
    const tRaw = tFlat[key];
    if (typeof tRaw !== "string") continue;
    const t = cleanTerm(tRaw);
    if (!t || t === en) continue; // untranslated / kept in English
    const k = en.toLowerCase();
    if (!(k in terms)) terms[k] = t;
  }
  return terms;
}

/** Stable, human-diffable serialization: keys sorted alphabetically. */
function serialize(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const source = resolveFrontendSource();
  if (source.kind === "local") {
    console.log(`Frontend locales (local): ${source.value}`);
  } else {
    console.log(`Frontend locales (remote): ${source.value}`);
  }

  const readLocale = await createLocaleReader(source);

  let selectedLangs;
  try {
    selectedLangs = parseLangArg(args, config.languages);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!dryRun) mkdirSync(FRONTEND_DIR, { recursive: true });

  for (const lang of selectedLangs) {
    const terms = await extractTerms(readLocale, lang.code);
    const total = Object.keys(terms).length;
    console.log(`[${lang.code}] ${total} terms mirrored from frontend`);

    if (dryRun) continue;
    writeFileSync(join(FRONTEND_DIR, `${lang.code}.json`), serialize(terms));
  }

  if (dryRun) console.log("\n(dry-run: no files written)");
  else console.log(`\nFrontend mirror written to ${FRONTEND_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
