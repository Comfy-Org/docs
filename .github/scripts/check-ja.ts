#!/usr/bin/env bun
/**
 * Quality check for Japanese translation files.
 *
 * Usage:
 *   bun .github/scripts/check-ja.ts              # check all ja/ files
 *   bun .github/scripts/check-ja.ts --verbose     # show per-file details
 *   bun .github/scripts/check-ja.ts foo.mdx       # check specific file(s)
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const ROOT = join(import.meta.dir, "../..");

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

/** Count CJK characters (Han + Hiragana + Katakana) */
function countCJK(text: string): number {
  const m = text.match(/[\u3000-\u9fff\uf900-\ufaff]/g);
  return m ? m.length : 0;
}

/** Count Hiragana characters (unique to Japanese) */
function countHiragana(text: string): number {
  const m = text.match(/[\u3040-\u309f]/g);
  return m ? m.length : 0;
}

/** Count Katakana characters (unique to Japanese) */
function countKatakana(text: string): number {
  const m = text.match(/[\u30a0-\u30ff]/g);
  return m ? m.length : 0;
}

/** Count Chinese-only characters that don't appear in Japanese
 *  (simplified Chinese characters not used in Japanese kanji) */
function countChineseOnly(text: string): number {
  // Common simplified Chinese markers not used in Japanese
  const m = text.match(/[的了在是我他她它们这那里吗呢吧啊哦哈嗯]/g);
  return m ? m.length : 0;
}

/** Count all non-whitespace, non-markup characters */
function countTextChars(text: string): number {
  // Strip frontmatter
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // Strip imports, JSX tags, URLs, code blocks
  const cleaned = body
    .replace(/```[\s\S]*?```/g, "")           // code blocks
    .replace(/`[^`]+`/g, "")                  // inline code
    .replace(/import\s+.*?from\s+.*?;?\n/g, "") // imports
    .replace(/<[^>]+>/g, "")                  // JSX/HTML tags
    .replace(/https?:\/\/\S+/g, "")           // URLs
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")     // JSX comments
    .replace(/<!--[\s\S]*?-->/g, "")          // HTML comments
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // markdown links (keep text)
  // Count non-whitespace chars
  return cleaned.replace(/\s/g, "").length;
}

/** Check if file has translationSourceHash in frontmatter */
function hasSourceHash(text: string): boolean {
  return /translationSourceHash:\s*[a-f0-9]{8}/.test(text);
}

/** Check for leaked English-only content patterns */
function findLeakedEnglish(text: string): string[] {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const issues: string[] = [];

  // Check for common untranslated English patterns in prose (not in code/tags)
  const proseLines = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/import\s+.*?from\s+.*?;?\n/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 20);

  for (const line of proseLines) {
    const trimmed = line.trim();
    // Skip lines that are just URLs, code, or markdown syntax
    if (/^https?:\/\//.test(trimmed)) continue;
    if (/^\|/.test(trimmed)) continue; // table rows
    if (/^[#>*-]/.test(trimmed) && trimmed.length < 30) continue;

    const cjk = countCJK(trimmed);
    const total = trimmed.replace(/\s/g, "").length;
    // If a long prose line has 0 CJK chars, it's likely untranslated
    if (total > 30 && cjk === 0) {
      // But skip lines that are mostly code/technical
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
  cjkChars: number;
  cjkRate: number;
  hiragana: number;
  katakana: number;
  jpRate: number; // (hiragana + katakana) / cjk — how "Japanese" vs "Chinese" the CJK is
  hasHash: boolean;
  thinkingLeak: boolean;
  mismatchLeak: boolean;
  leakedEnglish: string[];
  status: "ok" | "warn" | "fail";
  issues: string[];
}

async function checkFile(jaPath: string): Promise<FileReport> {
  const content = await readFile(jaPath, "utf-8");
  const relPath = relative(ROOT, jaPath);

  const totalChars = countTextChars(content);
  const cjkChars = countCJK(content);
  const cjkRate = totalChars > 0 ? cjkChars / totalChars : 0;
  const hiragana = countHiragana(content);
  const katakana = countKatakana(content);
  const jpChars = hiragana + katakana;
  const jpRate = cjkChars > 0 ? jpChars / cjkChars : 0;
  const zhOnly = countChineseOnly(content);
  const hasHash = hasSourceHash(content);
  const thinkingLeak = hasThinkingLeaks(content);
  const mismatchLeak = hasMismatchCommentLeaks(content);
  const leakedEnglish = findLeakedEnglish(content);

  const issues: string[] = [];

  if (!hasHash) issues.push("missing translationSourceHash");
  if (thinkingLeak) issues.push("leaked <think> tags");
  if (mismatchLeak) issues.push("leaked <!-- MISMATCH --> comment in body");
  if (totalChars > 50 && cjkRate < 0.05) issues.push(`very low CJK rate: ${(cjkRate * 100).toFixed(1)}%`);
  if (totalChars > 100 && cjkChars === 0) issues.push("zero CJK characters (untranslated?)");
  if (cjkChars > 20 && jpChars === 0) issues.push("zero hiragana/katakana — likely Chinese, not Japanese");
  if (cjkChars > 20 && jpRate < 0.05 && zhOnly > 5) issues.push(`likely Chinese (${jpChars} kana vs ${zhOnly} zh-only markers)`);
  if (leakedEnglish.length > 3) issues.push(`${leakedEnglish.length} potentially untranslated lines`);

  const status = issues.length === 0
    ? "ok"
    : issues.some((i) => i.includes("not Japanese") || i.includes("likely Chinese") || i.includes("zero CJK") || i.includes("leaked"))
      ? "fail"
      : "warn";

  return { path: relPath, totalChars, cjkChars, cjkRate, hiragana, katakana, jpRate, hasHash, thinkingLeak, mismatchLeak, leakedEnglish, status, issues };
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  let files: string[];
  if (fileArgs.length > 0) {
    files = fileArgs.map((f) => join(ROOT, "ja", f.replace(/^(ja|snippets\/ja)\//, "")));
  } else {
    // Check both ja/ pages and snippets/ja/
    const jaFiles = await collectMdx(join(ROOT, "ja"));
    const snippetFiles = await collectMdx(join(ROOT, "snippets/ja"));
    files = [...jaFiles, ...snippetFiles];
  }

  console.log(`Checking ${files.length} Japanese translation files...\n`);

  const reports: FileReport[] = [];
  for (const f of files) {
    reports.push(await checkFile(f));
  }

  // Stats
  const ok = reports.filter((r) => r.status === "ok").length;
  const warn = reports.filter((r) => r.status === "warn").length;
  const fail = reports.filter((r) => r.status === "fail").length;

  const totalCJK = reports.reduce((s, r) => s + r.cjkChars, 0);
  const totalChars = reports.reduce((s, r) => s + r.totalChars, 0);
  const avgCJKRate = totalChars > 0 ? totalCJK / totalChars : 0;

  // CJK rate distribution
  const rates = reports.filter((r) => r.totalChars > 50).map((r) => r.cjkRate);
  rates.sort((a, b) => a - b);
  const p10 = rates[Math.floor(rates.length * 0.1)] ?? 0;
  const p50 = rates[Math.floor(rates.length * 0.5)] ?? 0;
  const p90 = rates[Math.floor(rates.length * 0.9)] ?? 0;

  const totalHiragana = reports.reduce((s, r) => s + r.hiragana, 0);
  const totalKatakana = reports.reduce((s, r) => s + r.katakana, 0);
  const totalJP = totalHiragana + totalKatakana;
  const avgJPRate = totalCJK > 0 ? totalJP / totalCJK : 0;

  console.log("=== Summary ===");
  console.log(`Files:    ${files.length} total, ${ok} ok, ${warn} warn, ${fail} fail`);
  console.log(`CJK:     ${totalCJK.toLocaleString()} CJK chars / ${totalChars.toLocaleString()} total = ${(avgCJKRate * 100).toFixed(1)}% avg`);
  console.log(`Kana:    ${totalHiragana.toLocaleString()} hiragana + ${totalKatakana.toLocaleString()} katakana = ${totalJP.toLocaleString()} (${(avgJPRate * 100).toFixed(1)}% of CJK)`);
  console.log(`CJK distribution (files >50 chars): p10=${(p10 * 100).toFixed(1)}% p50=${(p50 * 100).toFixed(1)}% p90=${(p90 * 100).toFixed(1)}%`);
  console.log();

  // Show problems
  const problems = reports.filter((r) => r.status !== "ok");
  if (problems.length > 0) {
    console.log(`=== Issues (${problems.length} files) ===`);
    for (const r of problems) {
      const icon = r.status === "fail" ? "FAIL" : "WARN";
      console.log(`${icon} ${r.path} (CJK ${(r.cjkRate * 100).toFixed(1)}%, kana ${(r.jpRate * 100).toFixed(0)}%)`);
      for (const issue of r.issues) {
        console.log(`     - ${issue}`);
      }
    }
    console.log();
  }

  // Verbose: show all files sorted by CJK rate
  if (verbose) {
    console.log("=== All files by CJK rate ===");
    const sorted = [...reports].filter((r) => r.totalChars > 50).sort((a, b) => a.cjkRate - b.cjkRate);
    for (const r of sorted.slice(0, 30)) {
      console.log(`  ${(r.cjkRate * 100).toFixed(1)}%  ${r.path} (${r.cjkChars}/${r.totalChars})`);
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
