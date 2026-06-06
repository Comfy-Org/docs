#!/usr/bin/env bun
/**
 * Quality check for Korean translation files.
 *
 * Usage:
 *   bun .github/scripts/check-ko.ts              # check all ko/ files
 *   bun .github/scripts/check-ko.ts --verbose     # show per-file details
 *   bun .github/scripts/check-ko.ts foo.mdx       # check specific file(s)
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";

// import.meta.dir is bun-only; import.meta.url works on both bun and Node.js
const ROOT = join(fileURLToPath(new URL("../..", import.meta.url)));

// Thresholds — same starting values as check-ja.ts, adjust with real data
const HANGUL_RATE_LOW = 0.05;
const LEAKED_ENGLISH_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Count Hangul syllable characters (U+AC00–D7AF) */
function countHangul(text: string): number {
  const m = text.match(/[가-힯]/g);
  return m ? m.length : 0;
}

/** Count all non-whitespace, non-markup characters */
function countTextChars(text: string): number {
  // Strip frontmatter
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // Strip imports, JSX tags, URLs, code blocks
  const cleaned = body
    .replace(/```[\s\S]*?```/g, "")            // code blocks
    .replace(/`[^`]+`/g, "")                   // inline code
    .replace(/import\s+.*?from\s+.*?;?\n/g, "") // imports
    .replace(/<[^>]+>/g, "")                   // JSX/HTML tags
    .replace(/https?:\/\/\S+/g, "")            // URLs
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")      // JSX comments
    .replace(/<!--[\s\S]*?-->/g, "")           // HTML comments
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");  // markdown links (keep text)
  return cleaned.replace(/\s/g, "").length;
}

/** Check if file has translationSourceHash in frontmatter */
function hasSourceHash(text: string): boolean {
  return /translationSourceHash:\s*[a-f0-9]{8}/.test(text);
}

/** Check for leaked English-only content patterns.
 *  Excludes: fenced code, inline code, frontmatter, URLs, table rows,
 *  short markdown syntax, and preserve_terms from translation-config.json.
 */
function findLeakedEnglish(text: string, preserveTerms: string[]): string[] {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const issues: string[] = [];

  const proseLines = body
    .replace(/```[\s\S]*?```/g, "")            // fenced code blocks
    .replace(/`[^`]+`/g, "")                   // inline code
    .replace(/<[^>]+>/g, "")                   // JSX/HTML tags
    .replace(/import\s+.*?from\s+.*?;?\n/g, "") // imports
    .split("\n")
    .filter((l) => l.trim().length > 20);

  for (const line of proseLines) {
    const trimmed = line.trim();
    if (/^https?:\/\//.test(trimmed)) continue;  // URL lines
    if (/^\|/.test(trimmed)) continue;            // table rows
    if (/^[#>*-]/.test(trimmed) && trimmed.length < 30) continue; // short markdown

    // Strip preserve_terms before checking Hangul presence
    let checkLine = trimmed;
    for (const term of preserveTerms) {
      checkLine = checkLine.replace(
        new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        ""
      );
    }

    const hangul = countHangul(checkLine);
    const total = checkLine.replace(/\s/g, "").length;
    if (total > 30 && hangul === 0) {
      // Skip if line doesn't start with an uppercase word (likely code/technical)
      if (!/^[A-Z][a-z]/.test(trimmed)) continue;
      issues.push(trimmed.slice(0, 80));
    }
  }
  return issues;
}

/** Check for thinking tag leaks */
function hasThinkingLeaks(text: string): boolean {
  return /<think>|<\/think>/.test(text);
}

/** Check for MISMATCH comment leaks (should be in frontmatter only) */
function hasMismatchCommentLeaks(text: string): boolean {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  return /<!-- MISMATCH:/.test(body);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface FileReport {
  path: string;
  totalChars: number;
  hangulChars: number;
  koRate: number;
  hasHash: boolean;
  thinkingLeak: boolean;
  mismatchLeak: boolean;
  leakedEnglish: string[];
  status: "ok" | "warn" | "fail";
  issues: string[];
}

async function checkFile(koPath: string, preserveTerms: string[]): Promise<FileReport> {
  const content = await readFile(koPath, "utf-8");
  const relPath = relative(ROOT, koPath);

  const totalChars = countTextChars(content);
  const hangulChars = countHangul(content);
  const koRate = totalChars > 0 ? hangulChars / totalChars : 0;
  const hasHash = hasSourceHash(content);
  const thinkingLeak = hasThinkingLeaks(content);
  const mismatchLeak = hasMismatchCommentLeaks(content);
  const leakedEnglish = findLeakedEnglish(content, preserveTerms);

  const issues: string[] = [];

  if (!hasHash) issues.push("missing translationSourceHash");
  if (thinkingLeak) issues.push("leaked <think> tags");
  if (mismatchLeak) issues.push("leaked <!-- MISMATCH --> comment in body");
  if (totalChars > 50 && koRate < HANGUL_RATE_LOW) issues.push(`very low Hangul rate: ${(koRate * 100).toFixed(1)}%`);
  if (totalChars > 100 && hangulChars === 0) issues.push("zero Hangul characters (untranslated?)");
  if (leakedEnglish.length > LEAKED_ENGLISH_THRESHOLD) issues.push(`${leakedEnglish.length} potentially untranslated lines`);

  const status = issues.length === 0
    ? "ok"
    : issues.some((i) =>
        i.includes("zero Hangul") ||
        i.includes("leaked") ||
        i.includes("untranslated?")
      )
      ? "fail"
      : "warn";

  return { path: relPath, totalChars, hangulChars, koRate, hasHash, thinkingLeak, mismatchLeak, leakedEnglish, status, issues };
}

async function main() {
  // Load preserve_terms from translation-config.json
  const configPath = join(fileURLToPath(new URL(".", import.meta.url)), "translation-config.json");
  const config = JSON.parse(await readFile(configPath, "utf-8"));
  const preserveTerms: string[] = config.preserve_terms ?? [];

  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  let files: string[];
  if (fileArgs.length > 0) {
    files = fileArgs.map((f) => join(ROOT, f.replace(/^(ko|snippets\/ko)\//, "ko/")));
  } else {
    // Check both ko/ pages and snippets/ko/
    const koFiles = await collectMdx(join(ROOT, "ko"));
    const snippetFiles = await collectMdx(join(ROOT, "snippets/ko"));
    files = [...koFiles, ...snippetFiles];
  }

  console.log(`Checking ${files.length} Korean translation files...\n`);

  const reports: FileReport[] = [];
  for (const f of files) {
    reports.push(await checkFile(f, preserveTerms));
  }

  // Stats
  const ok = reports.filter((r) => r.status === "ok").length;
  const warn = reports.filter((r) => r.status === "warn").length;
  const fail = reports.filter((r) => r.status === "fail").length;

  const totalHangul = reports.reduce((s, r) => s + r.hangulChars, 0);
  const totalChars = reports.reduce((s, r) => s + r.totalChars, 0);
  const avgKoRate = totalChars > 0 ? totalHangul / totalChars : 0;

  // Hangul rate distribution
  const rates = reports.filter((r) => r.totalChars > 50).map((r) => r.koRate);
  rates.sort((a, b) => a - b);
  const p10 = rates[Math.floor(rates.length * 0.1)] ?? 0;
  const p50 = rates[Math.floor(rates.length * 0.5)] ?? 0;
  const p90 = rates[Math.floor(rates.length * 0.9)] ?? 0;

  console.log("=== Summary ===");
  console.log(`Files:    ${files.length} total, ${ok} ok, ${warn} warn, ${fail} fail`);
  console.log(`Hangul:  ${totalHangul.toLocaleString()} Hangul chars / ${totalChars.toLocaleString()} total = ${(avgKoRate * 100).toFixed(1)}% avg`);
  console.log(`Hangul rate distribution (files >50 chars): p10=${(p10 * 100).toFixed(1)}% p50=${(p50 * 100).toFixed(1)}% p90=${(p90 * 100).toFixed(1)}%`);
  console.log();

  // Show problems
  const problems = reports.filter((r) => r.status !== "ok");
  if (problems.length > 0) {
    console.log(`=== Issues (${problems.length} files) ===`);
    for (const r of problems) {
      const icon = r.status === "fail" ? "FAIL" : "WARN";
      console.log(`${icon} ${r.path} (Hangul ${(r.koRate * 100).toFixed(1)}%)`);
      for (const issue of r.issues) {
        console.log(`     - ${issue}`);
      }
    }
    console.log();
  }

  // Verbose: show all files sorted by Hangul rate
  if (verbose) {
    console.log("=== All files by Hangul rate ===");
    const sorted = [...reports].filter((r) => r.totalChars > 50).sort((a, b) => a.koRate - b.koRate);
    for (const r of sorted.slice(0, 30)) {
      console.log(`  ${(r.koRate * 100).toFixed(1)}%  ${r.path} (${r.hangulChars}/${r.totalChars})`);
    }
    if (sorted.length > 30) console.log(`  ... and ${sorted.length - 30} more`);
  }

  // Exit code
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
