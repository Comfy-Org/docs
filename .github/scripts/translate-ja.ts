#!/usr/bin/env bun
/**
 * Dual-source (EN+ZH) → JA translation script for ComfyUI docs.
 *
 * Incremental: stores a source hash in each translated file's frontmatter.
 * On re-run, skips files whose EN+ZH sources haven't changed.
 *
 * Usage:
 *   bun .github/scripts/translate-ja.ts              # translate all pending
 *   bun .github/scripts/translate-ja.ts --dry-run    # show what would run
 *   bun .github/scripts/translate-ja.ts --force       # re-translate everything
 *   bun .github/scripts/translate-ja.ts foo.mdx bar.mdx  # specific files only
 *
 * Environment (.env.local):
 *   TRANSLATE_CJK_API_KEY     - API key for CJK translation (OpenRouter, DashScope, etc.)
 *   TRANSLATE_CJK_BASE_URL    - OpenAI-compatible base URL
 *   TRANSLATE_CJK_MODEL       - Model ID (default: qwen-mt-plus)
 *   TRANSLATE_CJK_CONCURRENCY - Parallel requests (default: 5)
 *   DASHSCOPE_API_KEY         - Fallback API key for Qwen-MT
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { join, dirname, relative } from "path";

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "../..");

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

const BASE_URL =
  process.env.TRANSLATE_CJK_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const API_KEY =
  process.env.TRANSLATE_CJK_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
const MODEL = process.env.TRANSLATE_CJK_MODEL ?? "qwen-mt-plus";
const CONCURRENCY = Number(process.env.TRANSLATE_CJK_CONCURRENCY ?? "5");
const IS_QWEN_MT = MODEL.startsWith("qwen-mt");
const ERRORS_PATH = join(ROOT, "tmp/ERRORS.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of combined EN+ZH source, truncated to 16 hex chars */
function sourceHash(en: string, zh: string): string {
  return createHash("sha256").update(en).update(zh).digest("hex").slice(0, 8);
}

/** Extract translationSourceHash from an MDX file's frontmatter */
function getExistingHash(content: string): string | null {
  // Match translationSourceHash anywhere in a frontmatter block (may not be at start of file
  // due to leading MISMATCH comments)
  const match = content.match(
    /translationSourceHash:\s*"?([a-f0-9]{8})"?/
  );
  return match?.[1] ?? null;
}

/** Inject or update translation metadata in frontmatter */
function setTranslationMeta(
  content: string,
  hash: string,
  enPath: string,
  zhPath: string | null,
  mismatches: string[]
): string {
  const metaLines = [
    `translationSourceHash: ${hash}`,
    `translationFrom: ${enPath}${zhPath ? `, ${zhPath}` : ""}`,
  ];
  if (mismatches.length > 0) {
    // Store as a YAML array for easy parsing later
    metaLines.push(`translationMismatches:`);
    for (const m of mismatches) {
      metaLines.push(`  - "${m.replace(/"/g, '\\"')}"`);
    }
  }
  const metaBlock = metaLines.join("\n");

  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) {
    return `---\n${metaBlock}\n---\n${content}`;
  }
  const [, open, body, close] = fmMatch;
  const rest = content.slice(fmMatch[0].length);

  // Remove old translation meta lines if present
  let cleaned = body
    .replace(/\ntranslationSourceHash:.*/, "")
    .replace(/\ntranslationFrom:.*/, "")
    .replace(/\ntranslationMismatches:(?:\n\s+-.*?)*/g, "")
    .replace(/^translationSourceHash:.*\n?/, "")
    .replace(/^translationFrom:.*\n?/, "")
    .replace(/^translationMismatches:(?:\n\s+-.*?)*/g, "");

  return `${open}${cleaned}\n${metaBlock}${close}${rest}`;
}

/** Read file, return empty string on missing */
async function readFileOr(path: string, fallback = ""): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return fallback;
  }
}

/** Collect all .mdx files under a directory recursively */
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

// ---------------------------------------------------------------------------
// Translation API calls
// ---------------------------------------------------------------------------

interface TranslationResult {
  japanese: string;
  mismatches: string[];
}

function extractMismatches(text: string): { clean: string; mismatches: string[] } {
  // New format: mismatches after "=== MISMATCHES ===" separator
  const sepIdx = text.indexOf("=== MISMATCHES ===");
  if (sepIdx !== -1) {
    const clean = text.slice(0, sepIdx).trimEnd();
    const mismatchBlock = text.slice(sepIdx + "=== MISMATCHES ===".length).trim();
    const mismatches = mismatchBlock
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0);
    return { clean, mismatches };
  }
  // Legacy: HTML comments (strip them too just in case)
  const mismatches: string[] = [];
  const re = /<!-- MISMATCH: (.*?) -->/g;
  let m;
  while ((m = re.exec(text)) !== null) mismatches.push(m[1]);
  const clean = text.replace(/\s*<!-- MISMATCH:[\s\S]*?-->\s*/g, "\n").trimStart();
  return { clean, mismatches };
}

async function callApi(
  messages: { role: string; content: string }[],
  extraBody: Record<string, any> = {}
): Promise<string> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 8192,
      ...extraBody,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }
  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

async function translateWithQwenMT(
  enText: string,
  zhText: string
): Promise<TranslationResult> {
  const content = [
    "=== English Source (primary) ===",
    enText,
    "",
    "=== Chinese Source (reference) ===",
    zhText,
    "",
    "=== Instructions ===",
    "Translate the English source to Japanese.",
    "Use the Chinese source as reference for correct kanji compound selection and CJK terminology.",
    "Preserve all MDX/JSX syntax, component tags, code blocks, URLs, and frontmatter structure exactly.",
    "Do NOT translate: component names (e.g. <Card>, <CardGroup>), import statements, code identifiers, URLs, href values.",
    "DO translate: title, description, sidebarTitle in frontmatter; all prose text; alt text; Card title/children text.",
    "If you notice semantic differences between the English and Chinese sources, output them AFTER the MDX content, separated by a line containing only '=== MISMATCHES ===' followed by one mismatch per line.",
    "If no mismatches, just output the MDX content with no separator.",
  ].join("\n");

  const translated = await callApi(
    [{ role: "user", content }],
    { translation_options: { source_lang: "English", target_lang: "Japanese" } }
  );
  const { clean, mismatches } = extractMismatches(translated);
  return { japanese: clean, mismatches };
}

async function translateWithLLM(
  enText: string,
  zhText: string,
  relPath: string
): Promise<TranslationResult> {
  const systemPrompt = `You are an expert translator specializing in Japanese technical documentation for software (ComfyUI - a node-based AI image generation tool).

Your task:
1. Translate the provided English documentation to natural, professional Japanese.
2. Use the Chinese translation as a REFERENCE to help select correct kanji compounds and CJK-specific technical terminology.
3. Detect any semantic mismatches between the English and Chinese sources.

Rules:
- Output ONLY the translated Japanese MDX content
- Preserve ALL MDX/JSX syntax exactly: component tags (<Card>, <CardGroup>, <Tabs>, etc.), import statements, code blocks, URLs, href attributes, frontmatter YAML structure
- DO translate: title/description/sidebarTitle in frontmatter, all prose, Card title and children text, table content, list items
- Do NOT translate: component names, import paths, code identifiers, parameter names in backticks, URLs, anchor IDs
- Use standard Japanese technical writing conventions (です/ます form)
- If you notice semantic differences between EN and ZH, output them AFTER the MDX content, separated by a line containing only '=== MISMATCHES ===' followed by one mismatch per line
- Mismatch descriptions MUST be specific and actionable, e.g. "EN title says X but ZH title says Y" — never just a field name like "description"
- If no mismatches, just output the MDX content with no separator
- NEVER use HTML comments (<!-- -->) in your output`;

  const userPrompt = `File: ${relPath}

=== English Source ===
${enText}

=== Chinese Reference ===
${zhText}

Translate the English source to Japanese. Use Chinese as reference for terminology. Output only the translated MDX.`;

  const translated = await callApi([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  const { clean, mismatches } = extractMismatches(translated);
  return { japanese: clean, mismatches };
}

// ---------------------------------------------------------------------------
// Translate a single file
// ---------------------------------------------------------------------------

interface PathMapping {
  enPath: string;
  zhPath: string;
  jaPath: string;
  enRel: string;  // relative path for display/frontmatter
  zhRel: string;
}

function defaultMapping(relPath: string): PathMapping {
  return {
    enPath: join(ROOT, relPath),
    zhPath: join(ROOT, "zh", relPath),
    jaPath: join(ROOT, "ja", relPath),
    enRel: relPath,
    zhRel: `zh/${relPath}`,
  };
}

function snippetMapping(relPath: string): PathMapping {
  // relPath is relative inside snippets/, e.g. "install/foo.mdx"
  return {
    enPath: join(ROOT, "snippets", relPath),
    zhPath: join(ROOT, "snippets/zh", relPath),
    jaPath: join(ROOT, "snippets/ja", relPath),
    enRel: `snippets/${relPath}`,
    zhRel: `snippets/zh/${relPath}`,
  };
}

async function translateFile(
  relPath: string,
  force: boolean,
  mapping: (r: string) => PathMapping = defaultMapping
): Promise<{ mismatches: string[]; status: "translated" | "skipped" | "up-to-date" }> {
  const { enPath, zhPath, jaPath, enRel, zhRel } = mapping(relPath);

  // Read sources
  const enContent = await readFileOr(enPath);
  if (!enContent) {
    return { mismatches: [], status: "skipped" };
  }
  const zhContent = await readFileOr(zhPath);

  // Skip tiny files (likely just frontmatter redirects)
  if (enContent.length < 50) {
    await mkdir(dirname(jaPath), { recursive: true });
    await writeFile(jaPath, enContent);
    return { mismatches: [], status: "skipped" };
  }

  // Check if already translated with same source hash
  const hash = sourceHash(enContent, zhContent);
  if (!force) {
    const existingJa = await readFileOr(jaPath);
    if (existingJa && getExistingHash(existingJa) === hash) {
      return { mismatches: [], status: "up-to-date" };
    }
  }

  // Translate
  const result = IS_QWEN_MT
    ? await translateWithQwenMT(enContent, zhContent)
    : await translateWithLLM(enContent, zhContent, relPath);

  // Clean up LLM artifacts
  let output = result.japanese;
  // Remove thinking tags (Qwen 3.5 can leak these)
  output = output.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  // Remove code fence wrappers
  output = output.replace(/^```(?:mdx|markdown)?\n/, "").replace(/\n```$/, "");

  // Post-process: add /ja/ prefix to internal href links
  output = output.replace(
    /href="\/(?!ja\/|zh\/|logo\/|images\/|snippets\/)([^"]*?)"/g,
    'href="/ja/$1"'
  );

  // Mismatches already extracted and stripped by extractMismatches()

  // Inject translation metadata into frontmatter (skip for snippets — they're inline fragments)
  const isSnippet = enRel.startsWith("snippets/");
  if (!isSnippet) {
    output = setTranslationMeta(
      output,
      hash,
      enRel,
      zhContent ? zhRel : null,
      result.mismatches
    );
  }

  // Write
  await mkdir(dirname(jaPath), { recursive: true });
  await writeFile(jaPath, output);

  return { mismatches: result.mismatches, status: "translated" };
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
) {
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.error(
      "No API key. Set TRANSLATE_CJK_API_KEY or DASHSCOPE_API_KEY in .env.local"
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const snippetsMode = args.includes("--snippets");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  const mapFn = snippetsMode ? snippetMapping : defaultMapping;
  console.log(`Config: model=${MODEL} concurrency=${CONCURRENCY} mode=${IS_QWEN_MT ? "qwen-mt" : "llm"}${snippetsMode ? " [snippets]" : ""}`);

  // Collect files
  let files: string[];
  if (fileArgs.length > 0) {
    files = fileArgs.map((f) => f.replace(/^(ja\/|zh\/|snippets\/(ja|zh)\/)/, ""));
  } else if (snippetsMode) {
    // Collect EN snippet files (snippets/ minus snippets/zh/ and snippets/ja/)
    const all = await collectMdx(join(ROOT, "snippets"));
    files = all
      .map((f) => relative(join(ROOT, "snippets"), f))
      .filter((f) => !f.startsWith("zh/") && !f.startsWith("ja/"));
  } else {
    const all = await collectMdx(ROOT);
    files = all
      .map((f) => relative(ROOT, f))
      .filter(
        (f) =>
          !f.startsWith("zh/") &&
          !f.startsWith("ja/") &&
          !f.startsWith("snippets/") &&
          !f.startsWith("node_modules/") &&
          !f.startsWith(".github/")
      );
  }

  // Pre-scan: check which files need translation (hash mismatch)
  if (!force && !dryRun) {
    console.log(`Scanning ${files.length} files for changes...`);
  }

  // For dry-run or to show accurate counts, do a quick pre-scan
  const pending: string[] = [];
  const upToDate: string[] = [];

  for (const relPath of files) {
    if (force) {
      pending.push(relPath);
      continue;
    }
    const paths = mapFn(relPath);
    const enContent = await readFileOr(paths.enPath);
    if (!enContent || enContent.length < 50) {
      upToDate.push(relPath);
      continue;
    }
    const zhContent = await readFileOr(paths.zhPath);
    const hash = sourceHash(enContent, zhContent);
    const existingJa = await readFileOr(paths.jaPath);
    if (existingJa && getExistingHash(existingJa) === hash) {
      upToDate.push(relPath);
    } else {
      pending.push(relPath);
    }
  }

  console.log(
    `Files: ${files.length} total, ${upToDate.length} up-to-date, ${pending.length} pending`
  );

  if (dryRun) {
    console.log("\nWould translate:");
    for (const f of pending.slice(0, 30)) console.log(`  ${f}`);
    if (pending.length > 30) console.log(`  ... and ${pending.length - 30} more`);
    return;
  }

  if (pending.length === 0) {
    console.log("Everything up-to-date. Use --force to re-translate.");
    return;
  }

  // Translate
  await mkdir(join(ROOT, "tmp"), { recursive: true });
  const allMismatches: { file: string; issues: string[] }[] = [];
  let translated = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  await pool(pending, CONCURRENCY, async (relPath, idx) => {
    const tag = `[${idx + 1}/${pending.length}]`;
    try {
      const result = await translateFile(relPath, force, mapFn);
      if (result.status === "translated") {
        translated++;
        const note = result.mismatches.length > 0 ? ` (${result.mismatches.length} mismatches)` : "";
        console.log(`${tag} OK   ${relPath}${note}`);
        if (result.mismatches.length > 0) {
          allMismatches.push({ file: relPath, issues: result.mismatches });
        }
      } else {
        skipped++;
        console.log(`${tag} SKIP ${relPath}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`${tag} FAIL ${relPath}: ${err.message}`);
    }
  });

  // Write mismatch report
  if (allMismatches.length > 0) {
    const lines = [
      "# EN ↔ ZH Mismatch Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Files with mismatches: ${allMismatches.length}`,
      "",
      "---",
      "",
    ];
    for (const { file, issues } of allMismatches) {
      lines.push(`## ${file}`);
      for (const issue of issues) lines.push(`- ${issue}`);
      lines.push("");
    }
    await writeFile(ERRORS_PATH, lines.join("\n"));
    console.log(`\nMismatch report: ${ERRORS_PATH}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s: ${translated} translated, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) console.log("Re-run to retry failed files.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
