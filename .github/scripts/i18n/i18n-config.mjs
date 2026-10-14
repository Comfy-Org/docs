/**
 * Shared i18n path rules derived from translation-config.json.
 * Add a language under `languages` only — exclude dirs and path helpers update automatically.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Repo root (`.github/scripts/i18n` → three levels up). */
export const REPO_ROOT = join(SCRIPT_DIR, "../../..");

export const CONFIG_PATH = join(SCRIPT_DIR, "translation-config.json");

/**
 * Gitignored translation run logs. Lives under `.github/` so Mintlify does not
 * parse human-readable summaries as MDX (unlike repo-root `tmp/*.md`).
 */
export const TRANSLATE_LOG_REL = ".github/i18n-logs/translate";
export const TRANSLATE_LOG_DIR = join(REPO_ROOT, TRANSLATE_LOG_REL);
export const TRUNCATION_ISSUES_JSON = join(TRANSLATE_LOG_DIR, "truncation-issues.json");
export const TRUNCATION_ISSUES_TXT = join(TRANSLATE_LOG_DIR, "truncation-issues.txt");
export const MISMATCHES_JSON = join(TRANSLATE_LOG_DIR, "mismatches.json");
export const MISMATCHES_TXT = join(TRANSLATE_LOG_DIR, "mismatches.txt");

/** Gitignored AI quality-review logs (review-i18n.ts). */
export const REVIEW_LOG_REL = ".github/i18n-logs/review";
export const REVIEW_LOG_DIR = join(REPO_ROOT, REVIEW_LOG_REL);
export const REVIEW_REPORT_JSON = join(REVIEW_LOG_DIR, "quality-report.json");
export const REVIEW_REPORT_TXT = join(REVIEW_LOG_DIR, "quality-report.txt");

/** Repo roots that are never English MDX sources (pages). */
export const REPO_META_PREFIXES = [
  "snippets/",
  "node_modules/",
  ".github/",
  "tmp/",
  "readme/",
];

/**
 * @typedef {Object} LangConfig
 * @property {string} code
 * @property {string} name
 * @property {string} dir
 * @property {string} snippets_dir
 */

/**
 * @typedef {Object} I18nConfig
 * @property {LangConfig[]} languages
 * @property {string[]} skip_paths
 * @property {string[]} extra_exclude_dirs
 * @property {string[]} exclude_dirs
 * @property {Array<{path: string, strategy: string}>} chunked_files
 * @property {string[]} preserve_terms
 */

/** @returns {I18nConfig} */
export function loadI18nConfig(configPath = CONFIG_PATH) {
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const languages = raw.languages ?? [];
  const skip_paths = raw.skip_paths ?? ["built-in-nodes"];
  const extra_exclude_dirs = raw.extra_exclude_dirs ?? [];
  const exclude_dirs = [
    ...languages.flatMap((l) => [l.dir, l.snippets_dir]),
    ...extra_exclude_dirs,
  ];

  return {
    ...raw,
    languages,
    skip_paths,
    extra_exclude_dirs,
    exclude_dirs,
    chunked_files: raw.chunked_files ?? [],
    preserve_terms: raw.preserve_terms ?? [],
  };
}

export function normalizeRelPath(relPath) {
  return relPath.replace(/\\/g, "/");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All translation directory prefixes, longest first (snippets/zh before zh). */
export function translationPrefixes(languages) {
  return [...new Set(languages.flatMap((l) => [l.snippets_dir, l.dir]))].sort(
    (a, b) => b.length - a.length
  );
}

/** @param {string} relPath @param {LangConfig[]} languages */
export function isUnderTranslationDir(relPath, languages) {
  const normalized = normalizeRelPath(relPath);
  for (const lang of languages) {
    if (normalized === lang.dir || normalized.startsWith(`${lang.dir}/`)) return true;
    if (normalized.startsWith(`${lang.snippets_dir}/`)) return true;
  }
  return false;
}

/** @param {string} relPath @param {LangConfig[]} languages */
export function stripLangPrefix(relPath, languages) {
  const normalized = normalizeRelPath(relPath);
  for (const prefix of translationPrefixes(languages)) {
    if (normalized.startsWith(`${prefix}/`)) {
      return normalized.slice(prefix.length + 1);
    }
  }
  return normalized;
}

/** @param {string} relPath @param {string[]} skip_paths */
export function shouldSkipPath(relPath, skip_paths) {
  const normalized = normalizeRelPath(relPath);
  return skip_paths.some(
    (skip) =>
      normalized === skip ||
      normalized.startsWith(`${skip}/`) ||
      normalized.includes(`/${skip}/`)
  );
}

/** @param {string} relPath */
export function isRepoMetaPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return REPO_META_PREFIXES.some((p) => normalized.startsWith(p));
}

const NON_CONTENT_PREFIXES = ["node_modules/", ".github/", "tmp/", "readme/"];

/**
 * English MDX at repo root or under snippets/ (not under a language dir).
 * @param {string} relPath
 * @param {{ languages: LangConfig[], skip_paths: string[] }} options
 */
export function isEnglishMdxPath(relPath, { languages, skip_paths }) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized.endsWith(".mdx")) return false;
  if (isUnderTranslationDir(normalized, languages)) return false;
  if (shouldSkipPath(normalized, skip_paths)) return false;
  if (NON_CONTENT_PREFIXES.some((p) => normalized.startsWith(p))) return false;
  return true;
}

/** English page MDX (excludes snippets/). */
export function isEnglishPagePath(relPath, options) {
  const normalized = normalizeRelPath(relPath);
  if (normalized.startsWith("snippets/")) return false;
  return isEnglishMdxPath(relPath, options);
}

/** English snippet MDX; relPath is relative to snippets/ root. */
export function isEnglishSnippetPath(relPath, options) {
  return isEnglishMdxPath(`snippets/${normalizeRelPath(relPath)}`, options);
}

/** @param {LangConfig[]} languages */
export function snippetLocaleExcludePattern(languages) {
  return languages.map((l) => `${escapeRegex(l.code)}\\/`).join("|");
}

/**
 * Locale codes for href/md path localization (skip already-prefixed paths).
 * @param {LangConfig[]} languages
 * @param {{ currentCode?: string, extras?: string[] }} [options]
 */
export function pathLocaleExcludePattern(languages, options = {}) {
  const { currentCode, extras = [] } = options;
  const codes = languages.map((l) => l.code);
  const list = currentCode
    ? [currentCode, ...codes.filter((c) => c !== currentCode), ...extras]
    : [...codes, ...extras];
  return [...new Set(list)].map(escapeRegex).join("|");
}

/** @param {string} enRel @param {LangConfig} lang */
export function targetRelFromEn(enRel, lang) {
  const normalized = normalizeRelPath(enRel);
  if (normalized.startsWith("snippets/")) {
    return `${lang.snippets_dir}/${normalized.slice("snippets/".length)}`;
  }
  return `${lang.dir}/${normalized}`;
}

/**
 * Localize internal links and snippet imports for a target language.
 * @param {string} content
 * @param {LangConfig} lang
 * @param {LangConfig[]} languages
 */
export function localizeMdxPaths(content, lang, languages) {
  const langPrefix = lang.code;
  const hrefExclude = pathLocaleExcludePattern(languages, {
    currentCode: langPrefix,
    extras: ["logo", "images", "snippets", "http"],
  });

  let output = content.replace(
    new RegExp(`href="\\/(?!${hrefExclude}\\/)([^"]*?)"`, "g"),
    `href="/${langPrefix}/$1"`
  );

  output = output.replace(
    new RegExp(
      `from\\s+["']\\/snippets\\/(?!${snippetLocaleExcludePattern(languages)})([^"']+)["']`,
      "g"
    ),
    `from "/${lang.snippets_dir}/$1"`
  );

  const mdExclude = pathLocaleExcludePattern(languages, {
    currentCode: langPrefix,
    extras: ["logo", "images", "snippets", "http", "#"],
  });
  output = output.replace(
    new RegExp(`\\]\\(\\/(?!${mdExclude})([^)]*?)\\)`, "g"),
    `](/${langPrefix}/$1)`
  );

  return output;
}

/**
 * @param {string[]} args argv slice(2)
 * @param {LangConfig[]} languages
 * @returns {LangConfig[]}
 */
export function parseLangArg(args, languages) {
  const langIdx = args.indexOf("--lang");
  if (langIdx === -1) return languages;
  const value = args[langIdx + 1];
  if (!value) {
    const codes = languages.map((l) => l.code).join(", ");
    throw new Error(`--lang requires a comma-separated list, e.g. --lang ${codes}`);
  }
  const codes = value.split(",").map((c) => c.trim()).filter(Boolean);
  const selected = languages.filter((l) => codes.includes(l.code));
  const unknown = codes.filter((c) => !languages.some((l) => l.code === c));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown language code(s): ${unknown.join(", ")}. Available: ${languages.map((l) => l.code).join(", ")}`
    );
  }
  return selected;
}

/** @param {LangConfig[]} languages */
export function languageCodesList(languages) {
  return languages.map((l) => l.code).join(", ");
}
