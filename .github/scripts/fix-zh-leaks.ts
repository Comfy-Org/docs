#!/usr/bin/env bun
/**
 * Fix Chinese text contamination in Japanese translation files.
 *
 * Two modes:
 *   1. --dict    Static dictionary replacement (free, instant)
 *   2. --llm     Use a cheap LLM to detect & fix unknown Chinese leaks
 *
 * Usage:
 *   bun .github/scripts/fix-zh-leaks.ts --dict                    # dict-only, all files
 *   bun .github/scripts/fix-zh-leaks.ts --llm                     # LLM scan, all files
 *   bun .github/scripts/fix-zh-leaks.ts --dict --llm              # both
 *   bun .github/scripts/fix-zh-leaks.ts --dict file1.mdx          # specific files
 *   bun .github/scripts/fix-zh-leaks.ts --dry-run --dict          # show what would change
 *
 * LLM env (uses TRANSLATE_CJK_* or falls back to a cheap model):
 *   FIX_ZH_MODEL    - model for scanning (default: qwen-plus, or use a cheap one like qwen-turbo)
 *   FIX_ZH_BASE_URL - API base URL
 *   FIX_ZH_API_KEY  - API key
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative } from "path";
import { getActiveDict } from "./zh-ja-dict";

const ROOT = join(import.meta.dir, "../..");

// Load .env.local
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

const LLM_BASE_URL = process.env.FIX_ZH_BASE_URL ?? process.env.TRANSLATE_CJK_BASE_URL ?? "";
const LLM_API_KEY = process.env.FIX_ZH_API_KEY ?? process.env.TRANSLATE_CJK_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
const LLM_MODEL = process.env.FIX_ZH_MODEL ?? "qwen-turbo"; // cheap & fast by default

// ---------------------------------------------------------------------------
// Dictionary-based fix
// ---------------------------------------------------------------------------

interface DictFix {
  chinese: string;
  japanese: string;
  category: string;
  count: number;
}

function applyDictFixes(content: string): { output: string; fixes: DictFix[] } {
  const dict = getActiveDict();
  const fixes: DictFix[] = [];
  let output = content;

  // Don't replace inside code blocks, frontmatter, or import statements
  // Strategy: split into "translatable" and "protected" segments
  const segments = splitProtected(output);

  for (const [zh, ja, cat] of dict) {
    let totalCount = 0;
    for (const seg of segments) {
      if (seg.protected) continue;
      const regex = new RegExp(escapeRegex(zh), "g");
      const matches = seg.text.match(regex);
      if (matches) {
        totalCount += matches.length;
        seg.text = seg.text.replace(regex, ja);
      }
    }
    if (totalCount > 0) {
      fixes.push({ chinese: zh, japanese: ja, category: cat, count: totalCount });
    }
  }

  output = segments.map((s) => s.text).join("");
  return { output, fixes };
}

interface Segment {
  text: string;
  protected: boolean;
}

function splitProtected(content: string): Segment[] {
  const segments: Segment[] = [];
  // Protect: frontmatter, code blocks, inline code, import statements, URLs, JSX tags
  const protectedPattern = /(?:^---\n[\s\S]*?\n---|```[\s\S]*?```|`[^`]+`|import\s+.*?from\s+.*?;?\n|https?:\/\/\S+|<[^>]+>)/gm;

  let lastIndex = 0;
  let match;
  while ((match = protectedPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), protected: false });
  }
  return segments;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// LLM-based fix (cheap model scans for unknown Chinese contamination)
// ---------------------------------------------------------------------------

interface LlmFix {
  original: string;
  fixed: string;
  reason: string;
}

async function applyLlmFixes(content: string, relPath: string): Promise<{ output: string; fixes: LlmFix[] }> {
  // Extract prose-only lines (skip code, frontmatter, imports)
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const proseLines = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/import\s+.*?from\s+.*?;?\n/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 5);

  // Find lines that contain CJK but no kana (suspicious)
  const suspiciousLines: string[] = [];
  for (const line of proseLines) {
    const hasCJK = /[\u4e00-\u9fff]/.test(line);
    const hasKana = /[\u3040-\u30ff]/.test(line);
    if (hasCJK && !hasKana && line.trim().length > 10) {
      suspiciousLines.push(line.trim());
    }
  }

  if (suspiciousLines.length === 0) {
    return { output: content, fixes: [] };
  }

  // Ask a cheap LLM to check and fix
  const prompt = `You are a Japanese language expert. Below are lines from a Japanese documentation file that may contain Chinese text contamination (Chinese words or phrases accidentally used instead of Japanese).

For each line, if it contains Chinese text that should be Japanese, output:
ORIGINAL: <the problematic text>
FIXED: <corrected Japanese text>
REASON: <why it's Chinese, not Japanese>

If a line is fine (valid Japanese), skip it. Only output fixes needed.

Lines to check:
${suspiciousLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) return { output: content, fixes: [] };

    const data = (await response.json()) as any;
    const result = data.choices?.[0]?.message?.content ?? "";

    // Parse fixes from LLM response
    const fixes: LlmFix[] = [];
    const fixPattern = /ORIGINAL:\s*(.*?)\nFIXED:\s*(.*?)\nREASON:\s*(.*?)(?:\n|$)/g;
    let m;
    while ((m = fixPattern.exec(result)) !== null) {
      fixes.push({ original: m[1].trim(), fixed: m[2].trim(), reason: m[3].trim() });
    }

    // Apply fixes to content
    let output = content;
    for (const fix of fixes) {
      if (fix.original && fix.fixed && fix.original !== fix.fixed) {
        output = output.replace(fix.original, fix.fixed);
      }
    }

    return { output, fixes };
  } catch {
    return { output: content, fixes: [] };
  }
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

async function collectMdx(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...(await collectMdx(full)));
      else if (entry.name.endsWith(".mdx")) results.push(full);
    }
  } catch {}
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const useDict = args.includes("--dict");
  const useLlm = args.includes("--llm");
  const dryRun = args.includes("--dry-run");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  if (!useDict && !useLlm) {
    console.log("Usage: bun fix-zh-leaks.ts --dict [--llm] [--dry-run] [files...]");
    console.log("  --dict     Apply static dictionary fixes (free, instant)");
    console.log("  --llm      Use cheap LLM to find unknown Chinese leaks");
    console.log("  --dry-run  Show changes without writing");
    return;
  }

  if (useLlm && !LLM_API_KEY) {
    console.error("No API key for LLM mode. Set FIX_ZH_API_KEY or TRANSLATE_CJK_API_KEY.");
    process.exit(1);
  }

  // Collect files
  let files: string[];
  if (fileArgs.length > 0) {
    files = fileArgs.map((f) => join(ROOT, f));
  } else {
    const jaFiles = await collectMdx(join(ROOT, "ja"));
    const snippetFiles = await collectMdx(join(ROOT, "snippets/ja"));
    files = [...jaFiles, ...snippetFiles];
  }

  console.log(`Scanning ${files.length} files... (dict=${useDict}, llm=${useLlm})`);

  let totalDictFixes = 0;
  let totalLlmFixes = 0;
  let filesChanged = 0;

  for (const filePath of files) {
    const relPath = relative(ROOT, filePath);
    let content = await readFile(filePath, "utf-8");
    let changed = false;
    const allFixes: string[] = [];

    // Dict fixes
    if (useDict) {
      const { output, fixes } = applyDictFixes(content);
      if (fixes.length > 0) {
        totalDictFixes += fixes.reduce((s, f) => s + f.count, 0);
        content = output;
        changed = true;
        for (const f of fixes) {
          allFixes.push(`  dict: ${f.chinese} → ${f.japanese} (×${f.count})`);
        }
      }
    }

    // LLM fixes
    if (useLlm) {
      const { output, fixes } = await applyLlmFixes(content, relPath);
      if (fixes.length > 0) {
        totalLlmFixes += fixes.length;
        content = output;
        changed = true;
        for (const f of fixes) {
          allFixes.push(`  llm:  ${f.original} → ${f.fixed} (${f.reason})`);
        }
      }
    }

    if (changed) {
      filesChanged++;
      console.log(`${dryRun ? "[dry-run] " : ""}${relPath}:`);
      for (const fix of allFixes) console.log(fix);

      if (!dryRun) {
        await writeFile(filePath, content);
      }
    }
  }

  console.log(`\n${dryRun ? "[dry-run] " : ""}Done: ${filesChanged} files, ${totalDictFixes} dict fixes, ${totalLlmFixes} LLM fixes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
