/**
 * Glossary loading + per-document term selection + prompt injection.
 *
 * Two layers, both per-language, both committed:
 *
 *   glossary/frontend/{lang}.json   Machine mirror of the ComfyUI frontend
 *                                   locale terms. Rebuilt wholesale by
 *                                   sync-glossary.mjs — never hand-edit.
 *                                   Shape: { "en term": "target", ... }
 *
 *   glossary/overrides/{lang}.json  Hand-maintained. Takes priority over the
 *                                   frontend mirror. This is the place to record
 *                                   a term decision or correct/extend the
 *                                   frontend (the layer asked for in issue #1124).
 *                                   Shape:
 *                                     {
 *                                       "terms":  { "custom node": "target" },
 *                                       "ignore": ["work", "additional"]
 *                                     }
 *                                   `terms`  remap or add a term (wins over frontend)
 *                                   `ignore` drop a frontend term from injection
 *
 * Resolution: start from the frontend mirror, drop everything in `ignore`, then
 * apply `terms` (override or add). The result is a Map<enTermLower, target>.
 *
 * Term selection for a document is whole-word, case-insensitive, capped to the
 * top N longest matches so the prompt stays small and specific terms win.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const GLOSSARY_DIR = join(SCRIPT_DIR, "glossary");
export const FRONTEND_DIR = join(GLOSSARY_DIR, "frontend");
export const OVERRIDES_DIR = join(GLOSSARY_DIR, "overrides");

/** Max terms injected per document (longest-first). Keeps the prompt bounded. */
const MAX_TERMS_PER_DOC = 40;

function readJsonOr(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

/**
 * Load the frontend mirror for one language as { enTermLower: target }.
 * @param {string} langCode
 * @returns {Record<string, string>}
 */
export function loadFrontendLayer(langCode) {
  const raw = readJsonOr(join(FRONTEND_DIR, `${langCode}.json`), {});
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim()) out[k.toLowerCase()] = v;
  }
  return out;
}

/**
 * Load the hand-maintained override layer for one language.
 * @param {string} langCode
 * @returns {{ terms: Record<string,string>, ignore: Set<string> }}
 */
export function loadOverrideLayer(langCode) {
  const raw = readJsonOr(join(OVERRIDES_DIR, `${langCode}.json`), {});
  const terms = {};
  for (const [k, v] of Object.entries(raw.terms ?? {})) {
    if (typeof v === "string" && v.trim()) terms[k.toLowerCase()] = v;
  }
  const ignore = new Set((raw.ignore ?? []).map((t) => String(t).toLowerCase()));
  return { terms, ignore };
}

/**
 * Resolve the effective glossary for a language: frontend mirror minus the
 * override ignore-list, with override terms applied on top.
 *
 * @param {string} langCode
 * @returns {Map<string, string>} enTermLower → target
 */
export function loadGlossary(langCode) {
  const frontend = loadFrontendLayer(langCode);
  const { terms, ignore } = loadOverrideLayer(langCode);

  const map = new Map();
  for (const [k, v] of Object.entries(frontend)) {
    if (ignore.has(k)) continue;
    map.set(k, v);
  }
  for (const [k, v] of Object.entries(terms)) {
    if (ignore.has(k)) continue; // explicit ignore wins even over a terms entry
    map.set(k, v);
  }
  return map;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s) {
  return s.replace(REGEX_SPECIALS, "\\$&");
}

/**
 * Select the glossary terms that actually appear in `enText`.
 * Whole-word, case-insensitive; returns the longest matches first, capped.
 *
 * @param {string} enText
 * @param {Map<string, string>} glossary
 * @param {number} [max]
 * @returns {{ en: string, t: string }[]}
 */
export function selectGlossaryForText(enText, glossary, max = MAX_TERMS_PER_DOC) {
  if (!glossary.size || !enText) return [];
  const lower = enText.toLowerCase();
  const hits = [];
  for (const [enLower, target] of glossary) {
    if (!lower.includes(enLower)) continue; // cheap pre-check before regex
    const re = new RegExp(`\\b${escapeRegExp(enLower)}\\b`);
    if (re.test(lower)) hits.push({ en: enLower, t: target, _len: enLower.length });
  }
  // Longest term first ("custom node" beats "node"); cap to keep prompt small.
  hits.sort((a, b) => b._len - a._len);
  return hits.slice(0, max).map(({ en, t }) => ({ en, t }));
}

/**
 * Render selected terms as a prompt block. Returns "" when nothing matched.
 * Advisory wording so the model keeps natural phrasing when a literal
 * substitution would read awkwardly.
 *
 * @param {{ en: string, t: string }[]} terms
 * @param {string} langName
 * @returns {string}
 */
export function buildGlossaryPrompt(terms, langName) {
  if (!terms.length) return "";
  const lines = terms.map(({ en, t }) => `${en} → ${t}`);
  return [
    `=== Preferred ${langName} terminology ===`,
    "Use these translations for the listed terms to keep wording consistent across the docs.",
    "They are preferred, not mandatory: if a literal substitution would read unnaturally in context, prefer natural phrasing.",
    "Match case and grammar to the sentence; the arrow shows the base form only.",
    ...lines,
  ].join("\n");
}
