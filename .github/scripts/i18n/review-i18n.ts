#!/usr/bin/env bun
/**
 * AI translation quality review (LLM-as-a-judge).
 *
 * An independent — and typically cheaper — model scores existing translations
 * against the English source on four axes (accuracy, completeness, terminology,
 * fluency) and lists concrete issues. This is separate from the `=== MISMATCHES
 * ===` notes that the translation model self-reports during `translate`; here a
 * different model acts as judge.
 *
 * Results are advisory: written to `.github/i18n-logs/review/` (gitignored),
 * never into MDX and never blocking. Treat the report as a review aid.
 *
 * Incremental: by default only reviews translations whose English source hash
 * matches the translated file (i.e. up-to-date translations) AND that have not
 * already been reviewed at that hash. Review state lives in a side file
 * (`reviewed.json`), not in MDX frontmatter.
 *
 * Usage:
 *   bun review-i18n.ts                       # pending reviews, all languages
 *   bun review-i18n.ts --lang ko             # one language
 *   bun review-i18n.ts installation/x.mdx    # specific files
 *   bun review-i18n.ts --all                 # re-review everything (ignore state)
 *   bun review-i18n.ts --sample 20           # review N random pending pairs per language
 *   bun review-i18n.ts --snippets            # review snippets instead of pages
 *   bun review-i18n.ts --min-score 4         # only report files scoring below 4
 *
 * Environment (.env.local or shell). Falls back to TRANSLATE_* when unset, so a
 * dedicated judge model is optional:
 *   REVIEW_API_KEY        - judge API key   (fallback: TRANSLATE_API_KEY ...)
 *   REVIEW_API_BASE_URL   - OpenAI-compatible base URL (fallback: TRANSLATE_API_BASE_URL ...)
 *   REVIEW_API_MODEL      - judge model id  (fallback: TRANSLATE_API_MODEL ...)
 *   REVIEW_CONCURRENCY    - parallel requests (fallback: TRANSLATE_CONCURRENCY, default 5)
 *
 * Requires Bun.
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { join, dirname, relative } from "path";
import {
  loadI18nConfig,
  REPO_ROOT,
  stripLangPrefix,
  isEnglishPagePath,
  isEnglishSnippetPath,
  parseLangArg as parseLangArgFromConfig,
  REVIEW_LOG_DIR,
  REVIEW_LOG_REL,
  REVIEW_REPORT_JSON,
  REVIEW_REPORT_TXT,
  REVIEW_STATE_JSON,
} from "./i18n-config.mjs";
import { loadGlossary, selectGlossaryForText, buildGlossaryPrompt } from "./glossary.mjs";

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const ROOT = REPO_ROOT;

async function loadEnvLocal() {
  try {
    const content = await readFile(join(ROOT, ".env.local"), "utf-8");
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
await loadEnvLocal();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface LangConfig {
  code: string;
  name: string;
  dir: string;
  snippets_dir: string;
}

const config = loadI18nConfig() as {
  languages: LangConfig[];
  skip_paths: string[];
};
const pathFilterOpts = { languages: config.languages, skip_paths: config.skip_paths };

const BASE_URL =
  process.env.REVIEW_API_BASE_URL ??
  process.env.TRANSLATE_API_BASE_URL ??
  process.env.TRANSLATE_CJK_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const API_KEY =
  process.env.REVIEW_API_KEY ??
  process.env.TRANSLATE_API_KEY ??
  process.env.DEEPSEEK_API_KEY ??
  process.env.TRANSLATE_CJK_API_KEY ??
  process.env.DASHSCOPE_API_KEY ??
  "";
const MODEL =
  process.env.REVIEW_API_MODEL ??
  process.env.TRANSLATE_API_MODEL ??
  process.env.TRANSLATE_CJK_MODEL ??
  "qwen-turbo";
const CONCURRENCY = Number(
  process.env.REVIEW_CONCURRENCY ?? process.env.TRANSLATE_CONCURRENCY ?? "5"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 of English source, truncated to 8 hex chars (matches translate). */
function sourceHash(en: string): string {
  return createHash("sha256").update(en).digest("hex").slice(0, 8);
}

/** Extract translationSourceHash from frontmatter or snippet comment. */
function getExistingHash(content: string): string | null {
  const fm = content.match(/translationSourceHash:\s*"?([a-f0-9]{8})"?/);
  if (fm) return fm[1] ?? null;
  const mdx = content.match(/\{\/\*\s*translationSourceHash:\s*([a-f0-9]{8})\s*\*\/\}/);
  if (mdx) return mdx[1] ?? null;
  const html = content.match(/<!--\s*translationSourceHash:\s*([a-f0-9]{8})\s*-->/);
  return html?.[1] ?? null;
}

async function readFileOr(path: string, fallback = ""): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return fallback;
  }
}

async function collectMdx(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await collectMdx(full)));
    else if (entry.name.endsWith(".mdx")) results.push(full);
  }
  return results;
}

function parseLangArg(args: string[]): LangConfig[] {
  try {
    return parseLangArgFromConfig(args, config.languages) as LangConfig[];
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Path mapping (mirrors translate-i18n.makeMapping)
// ---------------------------------------------------------------------------

interface PathMapping {
  enPath: string;
  targetPath: string;
  enRel: string;
  targetRel: string;
}

function makeMapping(lang: LangConfig, relPath: string, snippetsMode: boolean): PathMapping {
  const enRel = stripLangPrefix(relPath, config.languages);
  if (snippetsMode) {
    return {
      enPath: join(ROOT, "snippets", enRel),
      targetPath: join(ROOT, lang.snippets_dir, enRel),
      enRel: `snippets/${enRel}`,
      targetRel: `${lang.snippets_dir}/${enRel}`,
    };
  }
  return {
    enPath: join(ROOT, enRel),
    targetPath: join(ROOT, lang.dir, enRel),
    enRel,
    targetRel: `${lang.dir}/${enRel}`,
  };
}

// ---------------------------------------------------------------------------
// Judge API
// ---------------------------------------------------------------------------

interface AxisScores {
  accuracy: number;
  completeness: number;
  terminology: number;
  fluency: number;
}

interface ReviewVerdict {
  scores: AxisScores;
  overall: number;
  issues: string[];
}

const SCORE_KEYS: (keyof AxisScores)[] = ["accuracy", "completeness", "terminology", "fluency"];

function buildJudgePrompt(
  enText: string,
  targetText: string,
  lang: LangConfig,
  relPath: string,
  glossaryBlock: string
): string {
  return [
    `You are reviewing a ${lang.name} translation of ComfyUI documentation (a node-based AI image generation tool).`,
    `File: ${relPath}`,
    "",
    "Score the translation against the English source on four axes, each 1 (poor) to 5 (excellent):",
    "- accuracy: faithful meaning; no mistranslation, no invented content",
    "- completeness: nothing dropped — sections, list items, tables, code, links all present",
    "- terminology: technical terms translated consistently and correctly (follow the preferred terminology below if given)",
    "- fluency: reads naturally in the target language",
    "",
    "Do NOT penalize: expected localization (e.g. /{lang}/ internal links, translated snippet import paths),",
    "code blocks / identifiers / URLs left in English, or terms intentionally kept in English.",
    glossaryBlock ? `${glossaryBlock}\n` : "",
    "Respond with ONLY a JSON object, no prose, no code fences:",
    '{"scores":{"accuracy":N,"completeness":N,"terminology":N,"fluency":N},"overall":N,"issues":["short issue", "..."]}',
    "Keep issues concise and specific (quote the offending phrase). Empty array if none.",
    "",
    "=== English Source ===",
    enText,
    "",
    `=== ${lang.name} Translation ===`,
    targetText,
  ]
    .filter(Boolean)
    .join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callApi(prompt: string, attempt = 0): Promise<string> {
  const MAX_RETRIES = 3;
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        // Headroom for reasoning models that spend tokens before the JSON answer.
        max_tokens: 4096,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      // Retry on rate-limit / server errors; fail fast on client errors.
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        return callApi(prompt, attempt + 1);
      }
      throw new Error(`API ${response.status}: ${err}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  } catch (err: unknown) {
    // Transient network drops (socket closed, reset) — back off and retry.
    if (attempt < MAX_RETRIES) {
      await sleep(1000 * 2 ** attempt);
      return callApi(prompt, attempt + 1);
    }
    throw err;
  }
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(5, Math.max(1, v));
}

/** Parse the judge's JSON, tolerating code fences / surrounding prose. */
function parseVerdict(raw: string): ReviewVerdict {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    const preview = raw.trim().slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`no JSON object in judge output (got: "${preview || "<empty>"}")`);
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

  const rawScores = (obj.scores ?? {}) as Record<string, unknown>;
  const scores = {} as AxisScores;
  for (const k of SCORE_KEYS) scores[k] = clampScore(rawScores[k]);

  const overall =
    obj.overall != null
      ? clampScore(obj.overall)
      : clampScore(SCORE_KEYS.reduce((s, k) => s + scores[k], 0) / SCORE_KEYS.length);

  const issues = Array.isArray(obj.issues)
    ? obj.issues.map((i) => String(i).trim()).filter(Boolean)
    : [];

  return { scores, overall, issues };
}

// ---------------------------------------------------------------------------
// Review state (side file — not in MDX)
// ---------------------------------------------------------------------------

interface ReviewState {
  [key: string]: string; // `${lang}:${enRel}` -> reviewed source hash
}

async function loadState(): Promise<ReviewState> {
  try {
    return JSON.parse(await readFile(REVIEW_STATE_JSON, "utf-8")) as ReviewState;
  } catch {
    return {};
  }
}

async function saveState(state: ReviewState): Promise<void> {
  await mkdir(REVIEW_LOG_DIR, { recursive: true });
  const sorted: ReviewState = {};
  for (const k of Object.keys(state).sort()) sorted[k] = state[k];
  await writeFile(REVIEW_STATE_JSON, `${JSON.stringify(sorted, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Collect candidate English source files
// ---------------------------------------------------------------------------

async function collectEnglishFiles(snippetsMode: boolean, fileArgs: string[]): Promise<string[]> {
  if (fileArgs.length > 0) {
    return fileArgs
      .map((f) => stripLangPrefix(f, config.languages))
      .filter((f) =>
        snippetsMode
          ? isEnglishSnippetPath(f.replace(/^snippets\//, ""), pathFilterOpts)
          : isEnglishPagePath(f, pathFilterOpts)
      );
  }
  if (snippetsMode) {
    const all = await collectMdx(join(ROOT, "snippets"));
    return all
      .map((f) => relative(join(ROOT, "snippets"), f))
      .filter((f) => isEnglishSnippetPath(f, pathFilterOpts));
  }
  const all = await collectMdx(ROOT);
  return all
    .map((f) => relative(ROOT, f))
    .filter((f) => isEnglishPagePath(f, pathFilterOpts));
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

async function pool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface ReviewEntry {
  lang: string;
  enRel: string;
  targetRel: string;
  overall: number;
  scores: AxisScores;
  issues: string[];
}

interface ReviewReport {
  generated: string;
  model: string;
  reviewed: number;
  flagged: number;
  minScore: number;
  entries: ReviewEntry[];
}

async function writeReport(entries: ReviewEntry[], reviewed: number, minScore: number): Promise<void> {
  await mkdir(REVIEW_LOG_DIR, { recursive: true });
  const flagged = entries.filter((e) => e.overall < minScore);
  flagged.sort((a, b) => a.overall - b.overall);

  const report: ReviewReport = {
    generated: new Date().toISOString(),
    model: MODEL,
    reviewed,
    flagged: flagged.length,
    minScore,
    entries: flagged,
  };
  await writeFile(REVIEW_REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Translation quality review (not committed to git)",
    "",
    `Generated: ${report.generated}`,
    `Judge model: ${MODEL}`,
    `Reviewed: ${reviewed} file(s); flagged below ${minScore}/5: ${flagged.length}`,
    "",
    "AI-as-judge scores (accuracy / completeness / terminology / fluency, 1-5).",
    "Advisory only — independent of the translation model's own MISMATCH notes.",
    "",
    "---",
    "",
  ];
  if (flagged.length === 0) {
    lines.push(`_No files scored below ${minScore}._`, "");
  } else {
    for (const e of flagged) {
      const s = e.scores;
      lines.push(
        `## [${e.lang}] ${e.enRel} — overall ${e.overall}/5`,
        `acc ${s.accuracy} · comp ${s.completeness} · term ${s.terminology} · flu ${s.fluency}`,
        ""
      );
      for (const issue of e.issues) lines.push(`- ${issue}`);
      lines.push("");
    }
  }
  await writeFile(REVIEW_REPORT_TXT, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type ReviewJob = { relPath: string; lang: LangConfig };

/** Per-language glossary cache for the terminology axis. */
const glossaryCache = new Map<string, ReturnType<typeof loadGlossary>>();
function getGlossary(code: string): ReturnType<typeof loadGlossary> {
  let g = glossaryCache.get(code);
  if (!g) {
    g = loadGlossary(code);
    glossaryCache.set(code, g);
  }
  return g;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const snippetsMode = args.includes("--snippets") || args.includes("--snippets-only");
  const selectedLangs = parseLangArg(args);

  const sampleIdx = args.indexOf("--sample");
  const sampleN = sampleIdx !== -1 ? Number(args[sampleIdx + 1]) : 0;
  const minScoreIdx = args.indexOf("--min-score");
  const minScore = minScoreIdx !== -1 ? Number(args[minScoreIdx + 1]) : 4;

  const fileArgs = args.filter((a, i) => {
    if (a.startsWith("--")) return false;
    const prev = args[i - 1];
    return prev !== "--lang" && prev !== "--sample" && prev !== "--min-score";
  });

  if (!API_KEY) {
    console.error("No API key. Set REVIEW_API_KEY or TRANSLATE_API_KEY in .env.local");
    process.exit(1);
  }

  const files = await collectEnglishFiles(snippetsMode, fileArgs);
  if (files.length === 0) {
    console.log("No files to review.");
    return;
  }

  const state = await loadState();

  // Build the pending set: translation exists, is up-to-date vs English, and
  // (unless --all) hasn't been reviewed at this hash yet.
  const pending: ReviewJob[] = [];
  let skipStale = 0;
  let skipReviewed = 0;
  for (const lang of selectedLangs) {
    for (const relPath of files) {
      const { enPath, targetPath, enRel } = makeMapping(lang, relPath, snippetsMode);
      const enContent = await readFileOr(enPath);
      if (!enContent || enContent.length < 50) continue;
      const target = await readFileOr(targetPath);
      if (!target) continue; // no translation to review

      const hash = sourceHash(enContent);
      if (getExistingHash(target) !== hash) {
        skipStale++; // translation out of date — translate first
        continue;
      }
      if (!all && state[`${lang.code}:${enRel}`] === hash) {
        skipReviewed++;
        continue;
      }
      pending.push({ relPath, lang });
    }
  }

  let jobs = pending;
  if (sampleN > 0) {
    // Deterministic sample per language (no RNG): take first N after a stable shuffle by enRel.
    const byLang = new Map<string, ReviewJob[]>();
    for (const j of pending) {
      const arr = byLang.get(j.lang.code) ?? [];
      arr.push(j);
      byLang.set(j.lang.code, arr);
    }
    jobs = [];
    for (const arr of byLang.values()) {
      arr.sort((a, b) => a.relPath.localeCompare(b.relPath));
      jobs.push(...arr.slice(0, sampleN));
    }
  }

  console.log(
    `Review: model=${MODEL} concurrency=${CONCURRENCY} languages=${selectedLangs
      .map((l) => l.code)
      .join(",")} mode=${snippetsMode ? "snippets" : "pages"}`
  );
  console.log(
    `${files.length} EN sources × ${selectedLangs.length} lang(s); ` +
      `${jobs.length} to review` +
      `${skipStale ? `, ${skipStale} stale (translate first)` : ""}` +
      `${skipReviewed ? `, ${skipReviewed} already reviewed` : ""}` +
      `${sampleN > 0 ? ` [sampled ${sampleN}/lang]` : ""}`
  );

  if (jobs.length === 0) {
    console.log("Nothing to review. Use --all to re-review.");
    return;
  }

  await mkdir(REVIEW_LOG_DIR, { recursive: true });
  const entries: ReviewEntry[] = [];
  let reviewed = 0;
  let failed = 0;
  const startTime = Date.now();

  await pool(jobs, CONCURRENCY, async ({ relPath, lang }, idx) => {
    const tag = `[${idx + 1}/${jobs.length}]`;
    const { enPath, targetPath, enRel, targetRel } = makeMapping(lang, relPath, snippetsMode);
    try {
      const enContent = await readFileOr(enPath);
      const target = await readFileOr(targetPath);
      const glossaryTerms = selectGlossaryForText(enContent, getGlossary(lang.code));
      const glossaryBlock = buildGlossaryPrompt(glossaryTerms, lang.name);

      const out = await callApi(buildJudgePrompt(enContent, target, lang, enRel, glossaryBlock));
      const verdict = parseVerdict(out);

      reviewed++;
      state[`${lang.code}:${enRel}`] = sourceHash(enContent);
      entries.push({
        lang: lang.code,
        enRel,
        targetRel,
        overall: verdict.overall,
        scores: verdict.scores,
        issues: verdict.issues,
      });
      const flag = verdict.overall < minScore ? " ⚠" : "";
      console.log(`${tag} ${verdict.overall}/5${flag}  [${lang.code}] ${enRel}`);
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} FAIL [${lang.code}] ${enRel}: ${msg}`);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await saveState(state);
  await writeReport(entries, reviewed, minScore);

  const flagged = entries.filter((e) => e.overall < minScore).length;
  console.log(
    `\nReviewed ${reviewed} in ${elapsed}s (${failed} failed). ` +
      `${flagged} flagged below ${minScore}/5 → ${REVIEW_LOG_REL}/quality-report.txt`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
