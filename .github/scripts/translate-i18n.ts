#!/usr/bin/env bun
/**
 * English-primary MDX translation for ComfyUI docs.
 *
 * Incremental: stores translationSourceHash (SHA-256 of English source, first 8 hex
 * chars) in each translated file's frontmatter. On re-run, skips files whose English
 * source hasn't changed.
 *
 * Translation uses the English source as primary input and passes the existing target-
 * language file (if any) as context so the model can preserve unchanged sections.
 *
 * Skips paths listed in translation-config.json skip_paths (e.g. built-in-nodes).
 *
 * Usage:
 *   npm run translate                              # all configured languages
 *   npm run translate:dry-run                      # preview pending files
 *   npm run translate -- --lang zh,ja              # specific languages
 *   npm run translate:force                        # re-translate everything
 *   npm run translate:snippets                     # snippets only
 *   npm run translate -- installation/foo.mdx      # specific files
 *
 * Requires Bun: https://bun.sh
 *
 * Environment (.env.local or shell):
 *   TRANSLATE_API_KEY         - API key (primary)
 *   DEEPSEEK_API_KEY          - DeepSeek API key (fallback)
 *   TRANSLATE_CJK_API_KEY     - Fallback API key
 *   DASHSCOPE_API_KEY         - Fallback for Qwen-MT
 *   TRANSLATE_API_BASE_URL    - OpenAI-compatible base URL
 *   TRANSLATE_CJK_BASE_URL    - Fallback base URL
 *   TRANSLATE_API_MODEL       - Model ID (default: qwen-mt-plus)
 *   TRANSLATE_CJK_MODEL       - Fallback model ID
 *   TRANSLATE_CONCURRENCY     - Parallel requests (default: 5)
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { join, dirname, relative } from "path";

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "../..");
const CONFIG_PATH = join(import.meta.dir, "translation-config.json");

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

interface TranslationConfig {
  skip_paths: string[];
  languages: LangConfig[];
  preserve_terms: string[];
}

const config: TranslationConfig = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));

const BASE_URL =
  process.env.TRANSLATE_API_BASE_URL ??
  process.env.TRANSLATE_CJK_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const API_KEY =
  process.env.TRANSLATE_API_KEY ??
  process.env.DEEPSEEK_API_KEY ??
  process.env.TRANSLATE_CJK_API_KEY ??
  process.env.DASHSCOPE_API_KEY ??
  "";
const MODEL =
  process.env.TRANSLATE_API_MODEL ??
  process.env.TRANSLATE_CJK_MODEL ??
  "qwen-mt-plus";
const CONCURRENCY = Number(
  process.env.TRANSLATE_CONCURRENCY ??
    process.env.TRANSLATE_CJK_CONCURRENCY ??
    "5"
);
const IS_QWEN_MT = MODEL.startsWith("qwen-mt");
const ERRORS_PATH = join(ROOT, "tmp/ERRORS.md");
const SKIP_PATHS: string[] = config.skip_paths ?? ["built-in-nodes"];
const PRESERVE_TERMS: string[] = config.preserve_terms ?? [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of English source only, truncated to 8 hex chars */
function sourceHash(en: string): string {
  return createHash("sha256").update(en).digest("hex").slice(0, 8);
}

/** Extract translationSourceHash from frontmatter or snippet HTML comment */
function getExistingHash(content: string): string | null {
  const fmMatch = content.match(/translationSourceHash:\s*"?([a-f0-9]{8})"?/);
  if (fmMatch) return fmMatch[1] ?? null;
  const commentMatch = content.match(/<!--\s*translationSourceHash:\s*([a-f0-9]{8})\s*-->/);
  return commentMatch?.[1] ?? null;
}

/** Inject or update translation metadata in frontmatter */
function setTranslationMeta(
  content: string,
  hash: string,
  enPath: string,
  mismatches: string[]
): string {
  const metaLines = [`translationSourceHash: ${hash}`, `translationFrom: ${enPath}`];
  if (mismatches.length > 0) {
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

  let cleaned = body
    .replace(/\ntranslationSourceHash:.*/, "")
    .replace(/\ntranslationFrom:.*/, "")
    .replace(/\ntranslationMismatches:(?:\n\s+-.*?)*/g, "")
    .replace(/^translationSourceHash:.*\n?/, "")
    .replace(/^translationFrom:.*\n?/, "")
    .replace(/^translationMismatches:(?:\n\s+-.*?)*/g, "");

  return `${open}${cleaned}\n${metaBlock}${close}${rest}`;
}

/** Set hash on snippet files (no frontmatter) via HTML comment */
function setSnippetHash(content: string, hash: string): string {
  const stripped = content.replace(/<!--\s*translationSourceHash:\s*[a-f0-9]{8}\s*-->\n?/, "");
  return `<!-- translationSourceHash: ${hash} -->\n${stripped}`;
}

async function readFileOr(path: string, fallback = ""): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return fallback;
  }
}

function shouldSkipPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return SKIP_PATHS.some(
    (skip) =>
      normalized === skip ||
      normalized.startsWith(`${skip}/`) ||
      normalized.includes(`/${skip}/`)
  );
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

function parseLangArg(args: string[]): LangConfig[] {
  const langIdx = args.indexOf("--lang");
  if (langIdx === -1) return config.languages;

  const value = args[langIdx + 1];
  if (!value) {
    console.error("--lang requires a comma-separated list, e.g. --lang zh,ja");
    process.exit(1);
  }

  const codes = value.split(",").map((c) => c.trim()).filter(Boolean);
  const selected = config.languages.filter((l) => codes.includes(l.code));
  const unknown = codes.filter((c) => !selected.some((l) => l.code === c));
  if (unknown.length > 0) {
    console.error(`Unknown language code(s): ${unknown.join(", ")}`);
    console.error(`Available: ${config.languages.map((l) => l.code).join(", ")}`);
    process.exit(1);
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Translation API
// ---------------------------------------------------------------------------

interface TranslationResult {
  content: string;
  mismatches: string[];
}

function extractMismatches(text: string): { clean: string; mismatches: string[] } {
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
  const mismatches: string[] = [];
  const re = /<!-- MISMATCH: (.*?) -->/g;
  let m;
  while ((m = re.exec(text)) !== null) mismatches.push(m[1]);
  const clean = text.replace(/\s*<!-- MISMATCH:[\s\S]*?-->\s*/g, "\n").trimStart();
  return { clean, mismatches };
}

async function callApi(
  messages: { role: string; content: string }[],
  extraBody: Record<string, unknown> = {}
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
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

function buildTranslationInstructions(lang: LangConfig): string {
  const preserveStr = PRESERVE_TERMS.join(", ");
  return [
    `Translate the English source into ${lang.name}.`,
    "The English source is authoritative — always follow it for meaning.",
    "If a current translation is provided, use it as context: preserve wording where the English is unchanged; only update sections that differ from the English.",
    "Preserve ALL MDX/JSX syntax exactly: component tags, import statements, code blocks, URLs, frontmatter YAML structure.",
    "DO translate: title, description, sidebarTitle in frontmatter; all prose; Card title/children text; table content; list items.",
    "Do NOT translate: component tag names, code inside ``` blocks, code identifiers in backticks, URLs, file paths, image paths.",
    preserveStr ? `Do NOT translate these technical terms: ${preserveStr}` : "",
    "If you notice issues in the existing translation relative to the English (wrong meaning, missing section), note them AFTER the MDX content, separated by a line containing only '=== MISMATCHES ===' followed by one issue per line.",
    "If no issues, output only the translated MDX with no separator.",
    "NEVER use HTML comments in the MDX output.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function translateWithQwenMT(
  enText: string,
  existingText: string,
  lang: LangConfig
): Promise<TranslationResult> {
  const parts = [
    "=== English Source (primary) ===",
    enText,
    "",
    buildTranslationInstructions(lang),
  ];
  if (existingText.trim()) {
    parts.push(
      "",
      `=== Current ${lang.name} Translation (context — update only what changed in English) ===`,
      existingText
    );
  }

  const translated = await callApi(
    [{ role: "user", content: parts.join("\n") }],
    { translation_options: { source_lang: "English", target_lang: lang.name } }
  );
  const { clean, mismatches } = extractMismatches(translated);
  return { content: clean, mismatches };
}

async function translateWithLLM(
  enText: string,
  existingText: string,
  lang: LangConfig,
  relPath: string
): Promise<TranslationResult> {
  const systemPrompt = `You are an expert translator specializing in ${lang.name} technical documentation for ComfyUI (a node-based AI image generation tool).

${buildTranslationInstructions(lang)}

Output ONLY the translated MDX content.`;

  const userParts = [
    `File: ${relPath}`,
    "",
    "=== English Source ===",
    enText,
  ];
  if (existingText.trim()) {
    userParts.push(
      "",
      `=== Current ${lang.name} Translation (context) ===`,
      existingText
    );
  }
  userParts.push("", `Translate/update to ${lang.name}. Output only the translated MDX.`);

  const translated = await callApi([
    { role: "system", content: systemPrompt },
    { role: "user", content: userParts.join("\n") },
  ]);
  const { clean, mismatches } = extractMismatches(translated);
  return { content: clean, mismatches };
}

// ---------------------------------------------------------------------------
// Path mapping
// ---------------------------------------------------------------------------

interface PathMapping {
  enPath: string;
  targetPath: string;
  enRel: string;
  targetRel: string;
}

function makeMapping(lang: LangConfig, relPath: string, snippetsMode: boolean): PathMapping {
  if (snippetsMode) {
    return {
      enPath: join(ROOT, "snippets", relPath),
      targetPath: join(ROOT, lang.snippets_dir, relPath),
      enRel: `snippets/${relPath}`,
      targetRel: `${lang.snippets_dir}/${relPath}`,
    };
  }
  return {
    enPath: join(ROOT, relPath),
    targetPath: join(ROOT, lang.dir, relPath),
    enRel: relPath,
    targetRel: `${lang.dir}/${relPath}`,
  };
}

function localizePaths(content: string, langCode: string, snippetsDir: string): string {
  const langPrefix = langCode;
  const otherLangs = config.languages.map((l) => l.code).filter((c) => c !== langCode);

  // href="/path" → href="/{lang}/path"
  const hrefExclude = [langPrefix, ...otherLangs, "logo", "images", "snippets", "http"].join("|");
  let output = content.replace(
    new RegExp(`href="\\/(?!${hrefExclude}\\/)([^"]*?)"`, "g"),
    `href="/${langPrefix}/$1"`
  );

  // import from "/snippets/..." → "/snippets/{lang}/..."
  output = output.replace(
    /from\s+["']\/snippets\/(?!zh\/|ja\/)([^"']+)["']/g,
    `from "/${snippetsDir}/$1"`
  );

  // Markdown links ](/path) → ](/{lang}/path)
  const mdExclude = [langPrefix, ...otherLangs, "logo", "images", "snippets", "http", "#"].join("|");
  output = output.replace(
    new RegExp(`\\]\\(\\/(?!${mdExclude})([^)]*?)\\)`, "g"),
    `](/${langPrefix}/$1)`
  );

  return output;
}

function cleanModelOutput(text: string): string {
  let output = text;
  output = output.replace(/[\s\S]*?<\/think>\s*/g, "");
  output = output.replace(/^```(?:mdx|markdown)?\n/, "").replace(/\n```$/, "");
  return output;
}

// ---------------------------------------------------------------------------
// Translate a single file for one language
// ---------------------------------------------------------------------------

async function translateFile(
  relPath: string,
  lang: LangConfig,
  force: boolean,
  snippetsMode: boolean
): Promise<{ mismatches: string[]; status: "translated" | "skipped" | "up-to-date" }> {
  const { enPath, targetPath, enRel } = makeMapping(lang, relPath, snippetsMode);

  const enContent = await readFileOr(enPath);
  if (!enContent) {
    return { mismatches: [], status: "skipped" };
  }

  if (enContent.length < 50) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, enContent);
    return { mismatches: [], status: "skipped" };
  }

  const hash = sourceHash(enContent);
  const existingContent = await readFileOr(targetPath);

  if (!force && existingContent && getExistingHash(existingContent) === hash) {
    return { mismatches: [], status: "up-to-date" };
  }

  const result = IS_QWEN_MT
    ? await translateWithQwenMT(enContent, existingContent, lang)
    : await translateWithLLM(enContent, existingContent, lang, relPath);

  let output = cleanModelOutput(result.content);
  output = localizePaths(output, lang.code, lang.snippets_dir);

  if (snippetsMode) {
    output = setSnippetHash(output, hash);
  } else {
    output = setTranslationMeta(output, hash, enRel, result.mismatches);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, output);

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
// Collect English source files
// ---------------------------------------------------------------------------

async function collectEnglishFiles(snippetsMode: boolean, fileArgs: string[]): Promise<string[]> {
  if (fileArgs.length > 0) {
    return fileArgs
      .map((f) => f.replace(/^(ja\/|zh\/|snippets\/(ja|zh)\/)/, ""))
      .filter((f) => !shouldSkipPath(f));
  }

  if (snippetsMode) {
    const all = await collectMdx(join(ROOT, "snippets"));
    return all
      .map((f) => relative(join(ROOT, "snippets"), f))
      .filter((f) => !f.startsWith("zh/") && !f.startsWith("ja/"))
      .filter((f) => !shouldSkipPath(f));
  }

  const all = await collectMdx(ROOT);
  return all
    .map((f) => relative(ROOT, f))
    .filter(
      (f) =>
        !f.startsWith("zh/") &&
        !f.startsWith("ja/") &&
        !f.startsWith("snippets/") &&
        !f.startsWith("node_modules/") &&
        !f.startsWith(".github/") &&
        !f.startsWith("tmp/")
    )
    .filter((f) => !shouldSkipPath(f));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.error(
      "No API key. Set TRANSLATE_API_KEY or DEEPSEEK_API_KEY in .env.local"
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const snippetsMode = args.includes("--snippets");
  const selectedLangs = parseLangArg(args);
  const fileArgs = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--lang"
  );

  console.log(
    `Config: model=${MODEL} concurrency=${CONCURRENCY} mode=${IS_QWEN_MT ? "qwen-mt" : "llm"}` +
      ` languages=${selectedLangs.map((l) => l.code).join(",")}` +
      `${snippetsMode ? " [snippets]" : ""}` +
      ` skip=[${SKIP_PATHS.join(", ")}]`
  );

  const files = await collectEnglishFiles(snippetsMode, fileArgs);
  if (files.length === 0) {
    console.log("No files to process.");
    return;
  }

  type Job = { relPath: string; lang: LangConfig };
  const pending: Job[] = [];
  const upToDate: Job[] = [];

  for (const lang of selectedLangs) {
    for (const relPath of files) {
      const { enPath, targetPath } = makeMapping(lang, relPath, snippetsMode);
      const enContent = await readFileOr(enPath);
      if (!enContent || enContent.length < 50) continue;

      const job = { relPath, lang };
      if (force) {
        pending.push(job);
        continue;
      }

      const hash = sourceHash(enContent);
      const existing = await readFileOr(targetPath);
      if (existing && getExistingHash(existing) === hash) {
        upToDate.push(job);
      } else {
        pending.push(job);
      }
    }
  }

  console.log(
    `Files: ${files.length} EN sources × ${selectedLangs.length} lang(s) = ${files.length * selectedLangs.length} pairs; ` +
      `${upToDate.length} up-to-date, ${pending.length} pending`
  );

  if (dryRun) {
    console.log("\nWould translate:");
    for (const { relPath, lang } of pending.slice(0, 40)) {
      console.log(`  [${lang.code}] ${relPath}`);
    }
    if (pending.length > 40) console.log(`  ... and ${pending.length - 40} more`);
    return;
  }

  if (pending.length === 0) {
    console.log("Everything up-to-date. Use --force to re-translate.");
    return;
  }

  await mkdir(join(ROOT, "tmp"), { recursive: true });
  const allMismatches: { file: string; lang: string; issues: string[] }[] = [];
  let translated = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  await pool(pending, CONCURRENCY, async ({ relPath, lang }, idx) => {
    const tag = `[${idx + 1}/${pending.length}]`;
    try {
      const result = await translateFile(relPath, lang, force, snippetsMode);
      const label = `[${lang.code}] ${relPath}`;
      if (result.status === "translated") {
        translated++;
        const note = result.mismatches.length > 0 ? ` (${result.mismatches.length} mismatches)` : "";
        console.log(`${tag} OK   ${label}${note}`);
        if (result.mismatches.length > 0) {
          allMismatches.push({ file: relPath, lang: lang.code, issues: result.mismatches });
        }
      } else {
        skipped++;
        console.log(`${tag} SKIP ${label}`);
      }
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} FAIL [${lang.code}] ${relPath}: ${msg}`);
    }
  });

  if (allMismatches.length > 0) {
    const lines = [
      "# Translation Mismatch Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Files with mismatches: ${allMismatches.length}`,
      "",
      "---",
      "",
    ];
    for (const { file, lang, issues } of allMismatches) {
      lines.push(`## [${lang}] ${file}`);
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
