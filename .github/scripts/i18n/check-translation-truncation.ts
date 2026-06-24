#!/usr/bin/env bun
/**
 * Detect likely truncated translations (unclosed code fences, short body, etc.)
 * and write a repair list to .github/i18n-logs/translate/ (gitignored).
 *
 * Usage:
 *   npm run translate:check-truncation
 *   npm run translate:check-truncation -- --lang ko
 *   npm run translate:repair-truncated -- --lang ko   # via translate-i18n.ts
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative } from "path";
import {
  loadI18nConfig,
  REPO_ROOT,
  stripLangPrefix,
  isEnglishPagePath,
  isEnglishSnippetPath,
  parseLangArg as parseLangArgFromConfig,
  targetRelFromEn,
  TRANSLATE_LOG_DIR,
  TRANSLATE_LOG_REL,
  TRUNCATION_ISSUES_JSON,
  TRUNCATION_ISSUES_TXT,
} from "./i18n-config.mjs";
import {
  missingSectionLabels,
  parseFrontmatterAndBody,
  resolveChunkStrategy,
  type ChunkedFileConfig,
} from "./chunked-translate.ts";

const ROOT = REPO_ROOT;
const LOG_DIR = TRANSLATE_LOG_DIR;
const JSON_PATH = TRUNCATION_ISSUES_JSON;
const TXT_PATH = TRUNCATION_ISSUES_TXT;

interface LangConfig {
  code: string;
  name: string;
  dir: string;
  snippets_dir: string;
}

interface TranslationConfig {
  skip_paths: string[];
  chunked_files?: ChunkedFileConfig[];
  auto_chunk?: { min_body_chars?: number; min_sections?: number };
  languages: LangConfig[];
}

export interface TruncationIssue {
  lang: string;
  enRel: string;
  targetRel: string;
  reasons: string[];
  detail: string;
}

export interface TruncationReport {
  generated: string;
  languages: string[];
  issueCount: number;
  issues: TruncationIssue[];
}

const config = loadI18nConfig() as TranslationConfig;
const pathFilterOpts = { languages: config.languages, skip_paths: config.skip_paths };
const CHUNKED_FILES = config.chunked_files ?? [];
const AUTO_CHUNK = config.auto_chunk;

function parseBody(content: string): string {
  return parseFrontmatterAndBody(content).body;
}

function countCodeFences(body: string): { open: boolean; openLang: string; openLine: number } {
  const lines = body.split("\n");
  let open = false;
  let openLang = "";
  let openLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (!open) {
        open = true;
        openLang = line.slice(3).trim();
        openLine = i + 1;
      } else {
        open = false;
        openLang = "";
        openLine = 0;
      }
    }
  }
  return { open, openLang, openLine };
}

function countFencePairs(body: string): number {
  const matches = body.match(/^```/gm);
  return matches ? matches.length : 0;
}

function enFenceCount(enBody: string): number {
  return countFencePairs(enBody);
}

function targetPath(enRel: string, lang: LangConfig): string {
  if (enRel.startsWith("snippets/")) {
    return join(ROOT, lang.snippets_dir, enRel.slice("snippets/".length));
  }
  return join(ROOT, lang.dir, enRel);
}

async function collectMdx(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMdx(full)));
    } else if (entry.name.endsWith(".mdx")) {
      results.push(full);
    }
  }
  return results;
}

async function collectEnglishFiles(snippetsMode: boolean): Promise<string[]> {
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

export function detectTruncation(
  enContent: string,
  targetContent: string,
  enRel: string
): TruncationIssue["reasons"] {
  const reasons: string[] = [];
  const enBody = parseBody(enContent);
  const targetBody = parseBody(targetContent);

  const fence = countCodeFences(targetBody);
  if (fence.open) {
    reasons.push("unclosed_code_fence");
  }

  const enFences = enFenceCount(enBody);
  const targetFences = countFencePairs(targetBody);
  if (enFences >= 2 && targetFences < enFences) {
    reasons.push("missing_code_fence");
  }

  const enLines = enBody.split("\n").filter((l) => l.trim().length > 0).length;
  const targetLines = targetBody.split("\n").filter((l) => l.trim().length > 0).length;
  if (enLines >= 40 && targetLines < enLines * 0.75) {
    reasons.push("short_body");
  }

  const lastLine = targetBody.trimEnd().split("\n").pop()?.trim() ?? "";
  if (fence.open && /[=({[,;:]$/.test(lastLine)) {
    reasons.push("ends_mid_expression");
  }

  if (enRel === "changelog/index.mdx") {
    const enLabels = [...enBody.matchAll(/<Update\s+label="([^"]+)"/g)].map((m) => m[1]);
    const targetLabels = [...targetBody.matchAll(/<Update\s+label="([^"]+)"/g)].map((m) => m[1]);
    const missing = enLabels.filter((l) => !targetLabels.includes(l));
    if (missing.length > 0) {
      reasons.push("missing_changelog_blocks");
    }
  }

  const chunkStrategy = resolveChunkStrategy(enRel, enBody, CHUNKED_FILES, AUTO_CHUNK);
  if (chunkStrategy === "heading_sections") {
    const missingSections = missingSectionLabels(enBody, targetBody, chunkStrategy);
    if (missingSections.length > 0) {
      reasons.push("missing_sections");
    }
  }

  return reasons;
}

function formatDetail(
  reasons: string[],
  enContent: string,
  targetContent: string
): string {
  const parts: string[] = [];
  const enBody = parseBody(enContent);
  const targetBody = parseBody(targetContent);
  const fence = countCodeFences(targetBody);

  if (reasons.includes("unclosed_code_fence")) {
    parts.push(
      `unclosed \`\`\`${fence.openLang || ""} block starting near line ${fence.openLine}`
    );
  }
  if (reasons.includes("missing_code_fence")) {
    parts.push(`EN has ${enFenceCount(enBody)} fence markers, target has ${countFencePairs(targetBody)}`);
  }
  if (reasons.includes("short_body")) {
    const enLines = enBody.split("\n").filter((l) => l.trim()).length;
    const targetLines = targetBody.split("\n").filter((l) => l.trim()).length;
    parts.push(`body lines ${targetLines} vs EN ${enLines} (<75%)`);
  }
  if (reasons.includes("ends_mid_expression")) {
    const last = targetBody.trimEnd().split("\n").pop()?.trim() ?? "";
    parts.push(`ends with: ${last.slice(0, 80)}`);
  }
  if (reasons.includes("missing_changelog_blocks")) {
    const enLabels = [...enBody.matchAll(/<Update\s+label="([^"]+)"/g)].map((m) => m[1]);
    const targetLabels = new Set(
      [...targetBody.matchAll(/<Update\s+label="([^"]+)"/g)].map((m) => m[1])
    );
    const missing = enLabels.filter((l) => !targetLabels.has(l));
    parts.push(`missing versions: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`);
  }
  if (reasons.includes("missing_sections")) {
    const missing = missingSectionLabels(enBody, targetBody, "heading_sections");
    parts.push(
      `missing sections: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`
    );
  }
  return parts.join("; ");
}

export async function scanTruncationIssues(options: {
  langs: LangConfig[];
  snippetsMode?: boolean;
  fileArgs?: string[];
  pairs?: { langCode: string; enRel: string }[];
}): Promise<TruncationIssue[]> {
  const { langs, snippetsMode = false, fileArgs = [], pairs } = options;

  const issues: TruncationIssue[] = [];

  const jobs: { lang: LangConfig; enRel: string }[] = [];
  if (pairs && pairs.length > 0) {
    const langByCode = new Map(langs.map((l) => [l.code, l]));
    for (const p of pairs) {
      const lang = langByCode.get(p.langCode);
      if (lang) jobs.push({ lang, enRel: p.enRel });
    }
  } else {
    let files = await collectEnglishFiles(snippetsMode);
    if (fileArgs.length > 0) {
      files = fileArgs
        .map((f) => stripLangPrefix(f, config.languages))
        .filter((f) =>
          snippetsMode
            ? isEnglishSnippetPath(f, pathFilterOpts)
            : isEnglishPagePath(f, pathFilterOpts)
        );
    }
    for (const lang of langs) {
      for (const enRel of files) {
        jobs.push({ lang, enRel });
      }
    }
  }

  for (const { lang, enRel } of jobs) {
      const enPath = snippetsMode ? join(ROOT, "snippets", enRel) : join(ROOT, enRel);
      let enContent: string;
      try {
        enContent = await readFile(enPath, "utf-8");
      } catch {
        continue;
      }
      if (enContent.length < 50) continue;

      const tp = targetPath(enRel, lang);
      let targetContent: string;
      try {
        targetContent = await readFile(tp, "utf-8");
      } catch {
        continue;
      }

      const reasons = detectTruncation(enContent, targetContent, enRel);
      if (reasons.length === 0) continue;

      issues.push({
        lang: lang.code,
        enRel,
        targetRel: targetRelFromEn(enRel, lang),
        reasons,
        detail: formatDetail(reasons, enContent, targetContent),
      });
  }

  return issues;
}

async function readExistingIssues(): Promise<TruncationIssue[]> {
  try {
    const raw = await readFile(JSON_PATH, "utf-8");
    return (JSON.parse(raw) as TruncationReport).issues;
  } catch {
    return [];
  }
}

/** Merge new scan results; optionally drop prior issues for specific langs or file pairs. */
export async function writeTruncationReport(
  issues: TruncationIssue[],
  options?: { replaceLangs?: string[]; replacePairs?: { lang: string; enRel: string }[] }
): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });

  let merged = issues;
  if (options?.replaceLangs?.length || options?.replacePairs?.length) {
    const existing = await readExistingIssues();
    const langSet = new Set(options.replaceLangs ?? []);
    const pairSet = new Set(
      (options.replacePairs ?? []).map((p) => `${p.lang}:${p.enRel}`)
    );
    const kept = existing.filter((i) => {
      if (langSet.size > 0 && langSet.has(i.lang)) return false;
      if (pairSet.size > 0 && pairSet.has(`${i.lang}:${i.enRel}`)) return false;
      return true;
    });
    merged = [...kept, ...issues];
  }

  const langs = [...new Set(merged.map((i) => i.lang))];
  const report: TruncationReport = {
    generated: new Date().toISOString(),
    languages: langs,
    issueCount: merged.length,
    issues: merged,
  };

  await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Truncated translation issues (not committed to git)",
    "",
    `Generated: ${report.generated}`,
    `Issues: ${issues.length}`,
    "",
    "Heuristics: unclosed code fences, missing fences vs EN, body <75% of EN length,",
    "changelog missing <Update> blocks.",
    "",
    "Repair:",
    "  npm run translate:repair-truncated -- --lang ko",
    "",
    `Note: semantic AI review notes (mismatch) are separate — see ${TRANSLATE_LOG_REL}/mismatches.txt`,
    "      (only written when `npm run translate` runs and the model reports issues).",
    "",
    "---",
    "",
  ];

  for (const issue of issues) {
    lines.push(`## [${issue.lang}] ${issue.enRel}`);
    lines.push(`- Target: \`${issue.targetRel}\``);
    lines.push(`- Reasons: ${issue.reasons.join(", ")}`);
    lines.push(`- Detail: ${issue.detail}`);
    lines.push("");
  }

  await writeFile(TXT_PATH, lines.join("\n"));
}

export async function readTruncationRepairList(langFilter?: string[]): Promise<string[]> {
  try {
    const raw = await readFile(JSON_PATH, "utf-8");
    const report = JSON.parse(raw) as TruncationReport;
    const enRels = report.issues
      .filter((i) => !langFilter || langFilter.includes(i.lang))
      .map((i) => i.enRel);
    return [...new Set(enRels)];
  } catch {
    return [];
  }
}

function parseLangArg(args: string[]): LangConfig[] {
  try {
    return parseLangArgFromConfig(args, config.languages) as LangConfig[];
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const snippetsMode = args.includes("--snippets");
  const langs = parseLangArg(args);
  const fileArgs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");

  const issues = await scanTruncationIssues({ langs, snippetsMode, fileArgs });
  await writeTruncationReport(issues, {
    replaceLangs: langs.length < config.languages.length ? langs.map((l) => l.code) : undefined,
  });

  console.log(`Truncation scan: ${issues.length} issue(s)`);
  for (const issue of issues.slice(0, 20)) {
    console.log(`  [${issue.lang}] ${issue.enRel} (${issue.reasons.join(", ")})`);
  }
  if (issues.length > 20) console.log(`  ... and ${issues.length - 20} more`);

  console.log(`\nLog: ${TXT_PATH}`);
  console.log(`JSON: ${JSON_PATH}`);
  if (issues.length > 0) {
    console.log("\nRepair: npm run translate:repair-truncated -- --lang <code>");
  }
}

const isMain = import.meta.main ?? import.meta.path === Bun.main;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
