/**
 * Batch-translate docs.json navigation labels (tab / group titles).
 * All labels for a locale are collected from the English nav tree, sent in
 * one (or few chunked) API call(s), then applied via a lookup map.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { REPO_ROOT, loadI18nConfig } from "./i18n-config.mjs";

/** Labels that stay in English across locales (product / protocol names). */
export const NAV_LABEL_PRESERVE = [
  "ComfyUI",
  "Comfy Desktop",
  "ComfyUI-Manager",
  "CLI",
  "UI",
  "API",
  "MCP",
  "Cloud API",
  "Registry API Reference",
  "Cloud API Reference",
  "ComfyUI Server API",
  "3D",
  "Flux",
  "Qwen",
  "Z-Image",
  "HiDream",
  "ControlNet",
  "LoRA",
  "JSON",
  "GitHub",
];

/** Max labels per API request (entire nav tree is usually one batch). */
const LABEL_BATCH_SIZE = 250;

function loadEnvLocal() {
  try {
    const content = readFileSync(join(REPO_ROOT, ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

/** @returns {boolean} */
export function shouldPreserveNavLabel(label) {
  const trimmed = label.trim();
  return NAV_LABEL_PRESERVE.some(
    (term) => trimmed === term || trimmed.startsWith(`${term} `) || trimmed.endsWith(` ${term}`)
  );
}

/**
 * Collect every tab title and group name from the English navigation entry.
 * @param {object} enEntry
 * @returns {string[]}
 */
export function collectAllNavLabelsFromEn(enEntry) {
  /** @type {Set<string>} */
  const labels = new Set();
  for (const tab of enEntry.tabs ?? []) {
    if (tab.tab) labels.add(tab.tab);
    collectGroupLabelsFromPages(tab.pages, labels);
  }
  return [...labels].filter(Boolean).sort();
}

/** @param {unknown} pages @param {Set<string>} labels */
function collectGroupLabelsFromPages(pages, labels) {
  if (!Array.isArray(pages)) return;
  for (const node of pages) {
    if (typeof node === "string") continue;
    if (node.group) labels.add(node.group);
    if (node.pages) collectGroupLabelsFromPages(node.pages, labels);
  }
}

/** @param {string} enLabel @param {Map<string, string>} labelMap */
export function lookupNavLabel(enLabel, labelMap) {
  if (!enLabel) return enLabel;
  if (shouldPreserveNavLabel(enLabel)) return enLabel;
  return labelMap.get(enLabel) ?? enLabel;
}

function getTranslateConfig() {
  loadEnvLocal();
  const apiKey =
    process.env.TRANSLATE_API_KEY ??
    process.env.DEEPSEEK_API_KEY ??
    process.env.TRANSLATE_CJK_API_KEY ??
    process.env.DASHSCOPE_API_KEY ??
    "";
  const baseUrl =
    process.env.TRANSLATE_API_BASE_URL ??
    process.env.TRANSLATE_CJK_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model =
    process.env.TRANSLATE_API_MODEL ??
    process.env.TRANSLATE_CJK_MODEL ??
    "qwen-mt-plus";
  return { apiKey, baseUrl, model };
}

/**
 * @param {string[]} batch
 * @param {{ name: string }} lang
 * @param {string[]} preserveTerms
 * @param {Record<string, string>} [existingReference]
 */
async function translateNavLabelBatch(batch, lang, preserveTerms, existingReference = {}) {
  const { apiKey, baseUrl, model } = getTranslateConfig();
  if (!apiKey) {
    throw new Error(
      "No API key for nav label translation. Set TRANSLATE_API_KEY in .env.local"
    );
  }

  const numbered = batch.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const referenceEntries = Object.entries(existingReference).filter(
    ([en, localized]) => localized && localized !== en
  );
  const promptParts = [
    `Translate these Mintlify documentation sidebar labels from English into ${lang.name}.`,
    "They are short navigation tab or group titles (not full sentences).",
    `Keep these terms in English when they appear: ${[...new Set(preserveTerms)].join(", ")}.`,
    "Return ONLY a JSON object: keys = exact English labels from the numbered list below, values = translations.",
    "Match terminology and tone of any existing translations provided for consistency.",
    "Include every numbered key. No markdown fences.",
  ];
  if (referenceEntries.length > 0) {
    promptParts.push(
      "",
      "Existing translations in this locale (reference only — keep style consistent; do not repeat these in output unless the same English key appears below):",
      JSON.stringify(Object.fromEntries(referenceEntries), null, 0)
    );
  }
  promptParts.push("", "Translate these English labels:", numbered);
  const prompt = promptParts.join("\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
      ...(model.startsWith("qwen-mt")
        ? { translation_options: { source_lang: "English", target_lang: lang.name } }
        : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Nav label API ${response.status}: ${err}`);
  }

  const data = await response.json();
  let raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  /** @type {Record<string, string>} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Nav label API returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Nav label API must return a JSON object");
  }

  /** @type {Map<string, string>} */
  const batchMap = new Map();
  for (const label of batch) {
    const translated = parsed[label];
    if (typeof translated !== "string" || !translated.trim()) {
      throw new Error(`Nav label API missing translation for: ${label}`);
    }
    batchMap.set(label, translated.trim());
  }
  return batchMap;
}

/**
 * Pack nav labels into batch API call(s), return en → target map.
 * Skips labels that already have a localized value in existingMap.
 * @param {string[]} labels English labels that may still need translation
 * @param {{ name: string, code?: string }} lang
 * @param {{ preserveTerms?: string[], existingMap?: Map<string, string>, onBatch?: (info: { batch: number, total: number, count: number }) => void }} [options]
 * @returns {Promise<Map<string, string>>}
 */
export async function translateNavLabels(labels, lang, options = {}) {
  const preserveTerms = [
    ...NAV_LABEL_PRESERVE,
    ...(options.preserveTerms ?? []),
    ...(loadI18nConfig().preserve_terms ?? []),
  ];

  const existingMap = options.existingMap ?? new Map();
  const unique = [...new Set(labels)].filter(Boolean);

  /** @type {Map<string, string>} */
  const result = new Map();

  for (const label of unique) {
    if (shouldPreserveNavLabel(label)) {
      result.set(label, label);
      continue;
    }
    const existing = existingMap.get(label);
    if (existing && existing !== label) {
      result.set(label, existing);
    }
  }

  const toTranslate = unique.filter((l) => {
    if (shouldPreserveNavLabel(l)) return false;
    const existing = existingMap.get(l);
    return !existing || existing === l;
  });

  if (toTranslate.length === 0) return result;

  const existingReference = Object.fromEntries(
    [...existingMap.entries()].filter(([, localized]) => localized)
  );

  const batches = [];
  for (let i = 0; i < toTranslate.length; i += LABEL_BATCH_SIZE) {
    batches.push(toTranslate.slice(i, i + LABEL_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    options.onBatch?.({
      batch: i + 1,
      total: batches.length,
      count: batch.length,
    });
    const batchMap = await translateNavLabelBatch(
      batch,
      lang,
      preserveTerms,
      existingReference
    );
    for (const [key, val] of batchMap) result.set(key, val);
  }

  return result;
}
