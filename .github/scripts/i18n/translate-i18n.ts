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
 *   npm run translate                              # pages + snippets (default)
 *   npm run translate:dry-run                      # preview pending files
 *   npm run translate -- --lang zh,ja              # specific languages
 *   npm run translate:force                        # re-translate everything
 *   npm run translate:snippets                     # snippets only
 *   npm run translate -- --pages-only              # pages only, skip snippets
 *   npm run translate -- installation/foo.mdx      # specific files
 *   npm run translate:check-truncation             # scan for truncated translations
 *   npm run translate:repair-truncated -- --lang ko  # re-translate files from truncation log
 *   npm run translate:sync-docs-json -- --lang ko    # sync docs.json paths only (labels preserved)
 *   npm run translate:sync-docs-json -- --translate-nav-labels  # also translate new English nav labels
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
import {
  readTruncationRepairList,
  scanTruncationIssues,
  writeTruncationReport,
} from "./check-translation-truncation.ts";
import {
  loadI18nConfig,
  REPO_ROOT,
  stripLangPrefix,
  isEnglishPagePath,
  isEnglishSnippetPath,
  localizeMdxPaths,
  parseLangArg as parseLangArgFromConfig,
  TRANSLATE_LOG_DIR,
  TRANSLATE_LOG_REL,
  MISMATCHES_JSON,
  MISMATCHES_TXT,
} from "./i18n-config.mjs";
import {
  syncDocsJsonFile,
  formatNavSyncReport,
} from "./sync-docs-json.mjs";
import {
  loadGlossary,
  selectGlossaryForText,
  buildGlossaryPrompt,
} from "./glossary.mjs";

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

interface ChunkedFileConfig {
  path: string;
  strategy: "update_blocks";
}

interface TranslationConfig {
  skip_paths: string[];
  chunked_files?: ChunkedFileConfig[];
  languages: LangConfig[];
  preserve_terms: string[];
}

const config = loadI18nConfig() as TranslationConfig;
const pathFilterOpts = { languages: config.languages, skip_paths: config.skip_paths };

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
const MISMATCHES_LOG_PATH = MISMATCHES_TXT;
const MISMATCHES_JSON_PATH = MISMATCHES_JSON;

interface MismatchEntry {
  lang: string;
  enRel: string;
  issues: string[];
}

interface MismatchReport {
  generated: string;
  model: string;
  issueCount: number;
  entries: MismatchEntry[];
}

async function readExistingMismatches(): Promise<MismatchEntry[]> {
  try {
    const raw = await readFile(MISMATCHES_JSON_PATH, "utf-8");
    return (JSON.parse(raw) as MismatchReport).entries;
  } catch {
    return [];
  }
}

/** Merge AI-reported mismatches; drop prior entries for files re-translated in this run. */
async function writeMismatchReport(
  newEntries: MismatchEntry[],
  scannedPairs: { lang: string; enRel: string }[]
): Promise<void> {
  await mkdir(TRANSLATE_LOG_DIR, { recursive: true });

  const pairSet = new Set(scannedPairs.map((p) => `${p.lang}:${p.enRel}`));
  const kept = (await readExistingMismatches()).filter(
    (e) => !pairSet.has(`${e.lang}:${e.enRel}`)
  );
  const merged = [...kept, ...newEntries.filter((e) => e.issues.length > 0)];

  const report: MismatchReport = {
    generated: new Date().toISOString(),
    model: MODEL,
    issueCount: merged.length,
    entries: merged,
  };

  await writeFile(MISMATCHES_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Translation review notes (not committed to git)",
    "",
    `Generated: ${report.generated}`,
    `Model: ${MODEL}`,
    `Files with notes: ${merged.length}`,
    "",
    "AI-reported semantic issues from `npm run translate` (not from truncation scan).",
    "Only written when the model appends `=== MISMATCHES ===` to its output.",
    "Path localization (/zh/, /ja/, /ko/, snippets) may appear here but is often expected.",
    "",
    `See also: \`${TRANSLATE_LOG_REL}/truncation-issues.txt\` (structural cuts — unclosed fences, short body).`,
    "",
    "---",
    "",
  ];

  if (merged.length === 0) {
    lines.push("_No mismatch notes on record._", "");
  } else {
    for (const { enRel, lang, issues } of merged) {
      lines.push(`## [${lang}] ${enRel}`);
      for (const issue of issues) lines.push(`- ${issue}`);
      lines.push("");
    }
  }

  await writeFile(MISMATCHES_LOG_PATH, lines.join("\n"));
}
const SKIP_PATHS: string[] = config.skip_paths ?? ["built-in-nodes"];
const CHUNKED_FILES: ChunkedFileConfig[] = config.chunked_files ?? [];
const PRESERVE_TERMS: string[] = config.preserve_terms ?? [];

/** Per-language glossary (en term → preferred target term), loaded once per code. */
const glossaryCache = new Map<string, ReturnType<typeof loadGlossary>>();
function getGlossary(langCode: string): ReturnType<typeof loadGlossary> {
  let g = glossaryCache.get(langCode);
  if (!g) {
    g = loadGlossary(langCode);
    glossaryCache.set(langCode, g);
  }
  return g;
}

/** Build the preferred-terminology prompt block for the terms present in enText. */
function glossaryBlockFor(enText: string, lang: LangConfig): string {
  const terms = selectGlossaryForText(enText, getGlossary(lang.code));
  return buildGlossaryPrompt(terms, lang.name);
}

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
  const mdxComment = content.match(/\{\/\*\s*translationSourceHash:\s*([a-f0-9]{8})\s*\*\/\}/);
  if (mdxComment) return mdxComment[1] ?? null;
  const htmlComment = content.match(/<!--\s*translationSourceHash:\s*([a-f0-9]{8})\s*-->/);
  return htmlComment?.[1] ?? null;
}

/** Remove AI mismatch notes that leaked into YAML (orphan list items, field suffixes). */
function sanitizeFrontmatterBody(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "translationMismatches:") {
      while (i + 1 < lines.length && /^  - /.test(lines[i + 1])) i++;
      continue;
    }
    if (/^  - "/.test(line)) continue;
    if (/^[^:]+:\s*.+\s+"description"\s*$/.test(line) && !line.startsWith("description:")) {
      out.push(line.replace(/\s+"description"\s*$/, ""));
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function sanitizeMdxFrontmatter(content: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;
  const [, open, body, close] = fmMatch;
  const sanitized = sanitizeFrontmatterBody(body);
  if (sanitized === body) return content;
  return `${open}${sanitized}${close}${content.slice(fmMatch[0].length)}`;
}

function stripTranslationMetaFromFrontmatter(body: string): string {
  return sanitizeFrontmatterBody(
    body
      .replace(/\ntranslationSourceHash:.*/, "")
      .replace(/\ntranslationFrom:.*/, "")
      .replace(/\ntranslationBlockHashes:[\s\S]*?(?=\n[A-Za-z_][\w-]*:|\s*$)/, "")
      .replace(/\ntranslationMismatches:(?:\n\s+-.*?)*/g, "")
      .replace(/^translationSourceHash:.*\n?/, "")
      .replace(/^translationFrom:.*\n?/, "")
      .replace(/^translationBlockHashes:[\s\S]*?(?=^[A-Za-z_][\w-]*:|\s*$)/m, "")
      .replace(/^translationMismatches:(?:\n\s+-.*?)*/g, "")
  );
}

/** Inject or update translation metadata in frontmatter (hash only — mismatches go to .github/i18n-logs/translate/) */
function setTranslationMeta(content: string, hash: string, enPath: string): string {
  const metaBlock = [`translationSourceHash: ${hash}`, `translationFrom: ${enPath}`].join("\n");

  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) {
    return `---\n${metaBlock}\n---\n${content}`;
  }
  const [, open, body, close] = fmMatch;
  const rest = content.slice(fmMatch[0].length);
  const cleaned = stripTranslationMetaFromFrontmatter(body);

  return `${open}${cleaned}\n${metaBlock}${close}${rest}`;
}

/** Set hash on snippet files (no frontmatter) via HTML comment */
function setSnippetHash(content: string, hash: string): string {
  const stripped = content
    .replace(/\{\/\*\s*translationSourceHash:\s*[a-f0-9]{8}\s*\*\/\}\n?/, "")
    .replace(/<!--\s*translationSourceHash:\s*[a-f0-9]{8}\s*-->\n?/, "");
  return `{/* translationSourceHash: ${hash} */}\n${stripped}`;
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
  try {
    return parseLangArgFromConfig(args, config.languages) as LangConfig[];
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
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
    "If you notice semantic issues in the existing translation relative to the English (wrong meaning, missing section, untranslated prose), note them AFTER the MDX content, separated by a line containing only '=== MISMATCHES ===' followed by one issue per line.",
    "Do NOT report expected localization as issues: /{lang}/ internal links, translated snippet import paths, or other path prefix changes applied for the target locale.",
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
  const glossaryBlock = glossaryBlockFor(enText, lang);
  if (glossaryBlock) parts.push("", glossaryBlock);
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
  const glossaryBlock = glossaryBlockFor(enText, lang);
  if (glossaryBlock) userParts.push("", glossaryBlock);
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

function cleanModelOutput(text: string): string {
  let output = text;
  output = output.replace(/[\s\S]*?<\/think>\s*/g, "");
  output = output.replace(/^```(?:mdx|markdown)?\n/, "").replace(/\n```$/, "");
  return output;
}

// ---------------------------------------------------------------------------
// Chunked translation (<Update> blocks — changelog/index.mdx)
// ---------------------------------------------------------------------------

interface UpdateBlock {
  label: string;
  content: string;
}

interface ParsedUpdateDocument {
  frontmatter: string;
  blocks: UpdateBlock[];
}

function isChunkedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return CHUNKED_FILES.some(
    (c) => c.strategy === "update_blocks" && normalized === c.path.replace(/\\/g, "/")
  );
}

function parseFrontmatterAndBody(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---\n[\s\S]*?\n---)\n?([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: `${match[1]}\n`, body: match[2] };
}

function parseUpdateBlocks(body: string): UpdateBlock[] {
  const blocks: UpdateBlock[] = [];
  const re = /<Update\s+label="([^"]+)"[^>]*>[\s\S]*?<\/Update>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    blocks.push({ label: match[1], content: match[0] });
  }
  return blocks;
}

function parseUpdateDocument(content: string): ParsedUpdateDocument {
  const { frontmatter, body } = parseFrontmatterAndBody(content);
  return { frontmatter, blocks: parseUpdateBlocks(body) };
}

/** Changelog sync key: ordered version labels only (content edits to old blocks are ignored). */
function changelogLabelHash(enDoc: ParsedUpdateDocument): string {
  return sourceHash(enDoc.blocks.map((b) => b.label).join("|"));
}

interface ChunkedSyncStatus {
  upToDate: boolean;
  pendingBlocks: string[];
  needsFrontmatter: boolean;
}

function getChunkedSyncStatus(
  enContent: string,
  existingContent: string,
  force: boolean
): ChunkedSyncStatus {
  const enDoc = parseUpdateDocument(enContent);
  const existingDoc = existingContent ? parseUpdateDocument(existingContent) : null;
  const existingLabels = new Set((existingDoc?.blocks ?? []).map((b) => b.label));

  if (force) {
    return {
      upToDate: false,
      pendingBlocks: enDoc.blocks.map((b) => b.label),
      needsFrontmatter: true,
    };
  }

  const pendingBlocks = enDoc.blocks
    .filter((b) => !existingLabels.has(b.label))
    .map((b) => b.label);

  return {
    upToDate: pendingBlocks.length === 0 && Boolean(existingDoc),
    pendingBlocks,
    needsFrontmatter: !existingDoc,
  };
}

interface ChunkedBlockSlot {
  label: string;
  content: string | null;
}

function serializeChunkedDocument(
  frontmatter: string,
  slots: ChunkedBlockSlot[],
  fileHash: string,
  enRel: string
): string {
  const body = slots
    .map((s) => s.content)
    .filter((c): c is string => c !== null)
    .join("\n\n");
  return setTranslationMeta(`${frontmatter}\n${body}\n`, fileHash, enRel);
}

async function writeChunkedCheckpoint(
  targetPath: string,
  frontmatter: string,
  slots: ChunkedBlockSlot[],
  fileHash: string,
  enRel: string,
  label?: string
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, serializeChunkedDocument(frontmatter, slots, fileHash, enRel));
  if (label) {
    const done = slots.filter((s) => s.content !== null).length;
    console.log(`    Saved ${label} → disk (${done}/${slots.length} blocks)`);
  }
}

async function translateUpdateChunkedFile(
  relPath: string,
  lang: LangConfig,
  force: boolean,
  enContent: string,
  existingContent: string,
  enRel: string,
  targetPath: string
): Promise<{
  mismatches: string[];
  status: "translated" | "skipped" | "up-to-date";
  blocksTranslated: number;
  output: string | null;
}> {
  const status = getChunkedSyncStatus(enContent, existingContent, force);
  if (status.upToDate) {
    return { mismatches: [], status: "up-to-date", blocksTranslated: 0, output: null };
  }

  const enDoc = parseUpdateDocument(enContent);
  const existingDoc = existingContent ? parseUpdateDocument(existingContent) : null;
  const existingByLabel = new Map(
    (existingDoc?.blocks ?? []).map((b) => [b.label, b.content])
  );
  const fileHash = changelogLabelHash(enDoc);

  const slots: ChunkedBlockSlot[] = enDoc.blocks.map((b) => ({
    label: b.label,
    content: !force && existingByLabel.has(b.label) ? existingByLabel.get(b.label)! : null,
  }));

  const allMismatches: string[] = [];
  let blocksTranslated = 0;
  let frontmatterDirty = false;

  let translatedFrontmatter = existingDoc?.frontmatter ?? "";
  if (force || status.needsFrontmatter) {
    console.log(`    Translating frontmatter...`);
    const fmResult = IS_QWEN_MT
      ? await translateWithQwenMT(enDoc.frontmatter, existingDoc?.frontmatter ?? "", lang)
      : await translateWithLLM(
          enDoc.frontmatter,
          existingDoc?.frontmatter ?? "",
          lang,
          `${relPath}#frontmatter`
        );
    translatedFrontmatter = sanitizeMdxFrontmatter(cleanModelOutput(fmResult.content));
    if (!translatedFrontmatter.trim().startsWith("---")) {
      translatedFrontmatter = enDoc.frontmatter;
    }
    allMismatches.push(...fmResult.mismatches);
    frontmatterDirty = true;
    await writeChunkedCheckpoint(targetPath, translatedFrontmatter, slots, fileHash, enRel);
  } else {
    translatedFrontmatter = existingDoc!.frontmatter;
  }

  for (const slot of slots) {
    if (slot.content !== null) continue;

    const enBlock = enDoc.blocks.find((b) => b.label === slot.label)!;
    const existingBlock = existingByLabel.get(slot.label);

    console.log(`    Translating block: ${slot.label}...`);
    const blockResult = IS_QWEN_MT
      ? await translateWithQwenMT(enBlock.content, existingBlock ?? "", lang)
      : await translateWithLLM(
          enBlock.content,
          existingBlock ?? "",
          lang,
          `${relPath}#${slot.label}`
        );

    let translatedBlock = cleanModelOutput(blockResult.content);
    translatedBlock = localizeMdxPaths(translatedBlock, lang, config.languages);

    if (!translatedBlock.includes("<Update")) {
      console.log(`    [WARN] Block ${slot.label}: invalid output, keeping existing`);
      translatedBlock = existingBlock ?? enBlock.content;
    } else {
      blocksTranslated++;
    }

    slot.content = translatedBlock;
    allMismatches.push(...blockResult.mismatches);
    await writeChunkedCheckpoint(
      targetPath,
      translatedFrontmatter,
      slots,
      fileHash,
      enRel,
      slot.label
    );
  }

  const output = serializeChunkedDocument(translatedFrontmatter, slots, fileHash, enRel);
  const didWork = blocksTranslated > 0 || frontmatterDirty || status.needsFrontmatter;

  return {
    mismatches: allMismatches,
    status: didWork ? "translated" : "up-to-date",
    blocksTranslated,
    output,
  };
}

// ---------------------------------------------------------------------------
// Translate a single file for one language
// ---------------------------------------------------------------------------

async function translateFile(
  relPath: string,
  lang: LangConfig,
  force: boolean,
  snippetsMode: boolean
): Promise<{ mismatches: string[]; status: "translated" | "skipped" | "up-to-date"; blocksTranslated?: number }> {
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

  const existingContent = await readFileOr(targetPath);

  if (!snippetsMode && isChunkedFile(relPath)) {
    console.log(`  → [CHUNKED] ${lang.code}/${relPath}`);
    const chunked = await translateUpdateChunkedFile(
      relPath,
      lang,
      force,
      enContent,
      existingContent,
      enRel,
      targetPath
    );
    if (chunked.status === "up-to-date" || !chunked.output) {
      return {
        mismatches: [],
        status: "up-to-date",
        blocksTranslated: 0,
      };
    }
    return {
      mismatches: chunked.mismatches,
      status: "translated",
      blocksTranslated: chunked.blocksTranslated,
    };
  }

  const hash = sourceHash(enContent);

  if (!force && existingContent && getExistingHash(existingContent) === hash) {
    return { mismatches: [], status: "up-to-date" };
  }

  const result = IS_QWEN_MT
    ? await translateWithQwenMT(enContent, existingContent, lang)
    : await translateWithLLM(enContent, existingContent, lang, relPath);

  let output = sanitizeMdxFrontmatter(cleanModelOutput(result.content));
  output = localizeMdxPaths(output, lang, config.languages);

  if (snippetsMode) {
    output = setSnippetHash(output, hash);
  } else {
    output = setTranslationMeta(output, hash, enRel);
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
      .map((f) => stripLangPrefix(f, config.languages))
      .filter((f) =>
        snippetsMode
          ? isEnglishSnippetPath(f, pathFilterOpts)
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
// docs.json navigation sync
// ---------------------------------------------------------------------------

async function runDocsJsonSync(
  selectedLangs: LangConfig[],
  dryRun: boolean,
  options: { translateLabels?: boolean } = {}
): Promise<boolean> {
  const translateLabels = options.translateLabels === true;
  if (!translateLabels) {
    console.log(
      "docs.json: syncing navigation paths only (existing tab/group labels are preserved)."
    );
  }
  const result = await syncDocsJsonFile({
    selectedCodes: selectedLangs.map((l) => l.code),
    dryRun,
    translateLabels,
  });
  console.log(formatNavSyncReport(result.changes));
  if (result.changed && dryRun) {
    console.log("(dry-run: docs.json not written)");
  } else if (result.changed) {
    console.log(`Updated ${result.docsJsonPath}`);
  }
  return result.changed;
}

// ---------------------------------------------------------------------------
// Translate phases (pages + snippets)
// ---------------------------------------------------------------------------

type TranslateJob = { relPath: string; lang: LangConfig };

interface TranslatePhasePlan {
  snippetsMode: boolean;
  fileArgs: string[];
  label: string;
}

function filterFileArgsForPhase(fileArgs: string[], snippetsMode: boolean): string[] {
  return fileArgs
    .map((f) => stripLangPrefix(f, config.languages))
    .filter((f) =>
      snippetsMode
        ? isEnglishSnippetPath(f.replace(/^snippets\//, ""), pathFilterOpts)
        : isEnglishPagePath(f, pathFilterOpts)
    );
}

function resolveTranslatePhases(
  snippetsOnly: boolean,
  pagesOnly: boolean,
  fileArgs: string[]
): TranslatePhasePlan[] {
  if (snippetsOnly) {
    return [{ snippetsMode: true, fileArgs, label: "snippets" }];
  }
  if (pagesOnly) {
    return [{ snippetsMode: false, fileArgs, label: "pages" }];
  }
  if (fileArgs.length > 0) {
    const plans: TranslatePhasePlan[] = [];
    const pageArgs = filterFileArgsForPhase(fileArgs, false);
    const snippetArgs = filterFileArgsForPhase(fileArgs, true);
    if (pageArgs.length > 0) {
      plans.push({ snippetsMode: false, fileArgs: pageArgs, label: "pages" });
    }
    if (snippetArgs.length > 0) {
      plans.push({ snippetsMode: true, fileArgs: snippetArgs, label: "snippets" });
    }
    return plans.length > 0 ? plans : [{ snippetsMode: false, fileArgs, label: "pages" }];
  }
  return [
    { snippetsMode: false, fileArgs: [], label: "pages" },
    { snippetsMode: true, fileArgs: [], label: "snippets" },
  ];
}

async function runTranslatePhase(options: {
  snippetsMode: boolean;
  fileArgs: string[];
  phaseLabel: string;
  selectedLangs: LangConfig[];
  dryRun: boolean;
  force: boolean;
  repairTruncated: boolean;
}): Promise<{ translatedJobs: TranslateJob[]; failed: number }> {
  const { snippetsMode, fileArgs, phaseLabel, selectedLangs, dryRun, force } = options;

  console.log(`\n=== ${phaseLabel} ===`);

  const files = await collectEnglishFiles(snippetsMode, fileArgs);
  if (files.length === 0) {
    console.log(`No ${phaseLabel} files to process.`);
    return { translatedJobs: [], failed: 0 };
  }

  const pending: TranslateJob[] = [];
  const upToDate: TranslateJob[] = [];

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

      const existing = await readFileOr(targetPath);

      if (!snippetsMode && isChunkedFile(relPath)) {
        const chunkedStatus = getChunkedSyncStatus(enContent, existing, false);
        if (chunkedStatus.upToDate) upToDate.push(job);
        else pending.push(job);
        continue;
      }

      const hash = sourceHash(enContent);
      if (existing && getExistingHash(existing) === hash) upToDate.push(job);
      else pending.push(job);
    }
  }

  console.log(
    `${phaseLabel}: ${files.length} EN sources × ${selectedLangs.length} lang(s) = ${files.length * selectedLangs.length} pairs; ` +
      `${upToDate.length} up-to-date, ${pending.length} pending`
  );

  if (dryRun) {
    console.log(`Would translate (${phaseLabel}):`);
    for (const { relPath, lang } of pending.slice(0, 40)) {
      if (!snippetsMode && isChunkedFile(relPath)) {
        const enContent = await readFileOr(makeMapping(lang, relPath, false).enPath);
        const existing = await readFileOr(makeMapping(lang, relPath, false).targetPath);
        const cs = getChunkedSyncStatus(enContent, existing, false);
        const parts: string[] = [];
        if (cs.needsFrontmatter) parts.push("frontmatter");
        if (cs.pendingBlocks.length > 0) {
          parts.push(`${cs.pendingBlocks.length} missing version(s)`);
        }
        const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        console.log(`  [${lang.code}] ${relPath}${detail}`);
      } else {
        console.log(`  [${lang.code}] ${relPath}`);
      }
    }
    if (pending.length > 40) console.log(`  ... and ${pending.length - 40} more`);
    return { translatedJobs: [], failed: 0 };
  }

  if (pending.length === 0) {
    console.log(`${phaseLabel}: everything up-to-date.`);
    return { translatedJobs: [], failed: 0 };
  }

  await mkdir(TRANSLATE_LOG_DIR, { recursive: true });
  const runMismatches: MismatchEntry[] = [];
  let translated = 0;
  let skipped = 0;
  let failed = 0;
  const translatedJobs: TranslateJob[] = [];
  const startTime = Date.now();

  await pool(pending, CONCURRENCY, async ({ relPath, lang }, idx) => {
    const tag = `[${phaseLabel} ${idx + 1}/${pending.length}]`;
    try {
      const result = await translateFile(relPath, lang, force, snippetsMode);
      const label = `[${lang.code}] ${relPath}`;
      if (result.status === "translated") {
        translated++;
        translatedJobs.push({ relPath, lang });
        const blockNote =
          result.blocksTranslated != null && result.blocksTranslated > 0
            ? ` (${result.blocksTranslated} block(s))`
            : "";
        const mismatchNote =
          result.mismatches.length > 0 ? ` (${result.mismatches.length} mismatches)` : "";
        console.log(`${tag} OK   ${label}${blockNote}${mismatchNote}`);
        if (result.mismatches.length > 0) {
          runMismatches.push({ enRel: relPath, lang: lang.code, issues: result.mismatches });
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `${phaseLabel} done in ${elapsed}s: ${translated} translated, ${skipped} skipped, ${failed} failed`
  );
  if (failed > 0) console.log("Re-run to retry failed files.");

  if (translatedJobs.length > 0) {
    const pairs = translatedJobs.map((j) => ({
      langCode: j.lang.code,
      enRel: j.relPath,
    }));
    const scannedPairs = pairs.map((p) => ({ lang: p.langCode, enRel: p.enRel }));

    await writeMismatchReport(runMismatches, scannedPairs);
    if (runMismatches.length > 0) {
      console.log(
        `Mismatch notes (${phaseLabel}): ${runMismatches.length} file(s) → ${TRANSLATE_LOG_REL}/mismatches.txt`
      );
    }

    const issues = await scanTruncationIssues({
      langs: selectedLangs,
      snippetsMode,
      pairs,
    });
    await writeTruncationReport(issues, { replacePairs: pairs });
    const newIssues = issues.filter((i) =>
      pairs.some((p) => p.langCode === i.lang && p.enRel === i.enRel)
    );
    if (newIssues.length > 0) {
      console.log(
        `Truncation check (${phaseLabel}): ${newIssues.length} issue(s) → ${TRANSLATE_LOG_REL}/truncation-issues.txt`
      );
    }
  }

  return { translatedJobs, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const checkTruncation = args.includes("--check-truncation");
  const repairTruncated = args.includes("--repair-truncated");
  const syncDocsJsonOnly = args.includes("--sync-docs-json");
  const skipDocsJsonSync = args.includes("--no-sync-docs-json");
  const translateNavLabels = args.includes("--translate-nav-labels");
  const force = args.includes("--force") || repairTruncated;
  const snippetsOnly = args.includes("--snippets") || args.includes("--snippets-only");
  const pagesOnly = args.includes("--pages-only") || args.includes("--no-snippets");
  const selectedLangs = parseLangArg(args);
  let fileArgs = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--lang"
  );
  const phases = resolveTranslatePhases(snippetsOnly, pagesOnly, fileArgs);
  const runDocsJsonAfter = !snippetsOnly && !skipDocsJsonSync;

  if (syncDocsJsonOnly) {
    if (translateNavLabels && !API_KEY) {
      console.warn(
        "--translate-nav-labels requires TRANSLATE_API_KEY in .env.local; syncing paths only."
      );
    }
    await runDocsJsonSync(selectedLangs, dryRun, {
      translateLabels: translateNavLabels && Boolean(API_KEY),
    });
    return;
  }

  if (checkTruncation) {
    const scanPhases = snippetsOnly
      ? [{ snippetsMode: true, fileArgs, label: "snippets" }]
      : pagesOnly
        ? [{ snippetsMode: false, fileArgs, label: "pages" }]
        : [
            { snippetsMode: false, fileArgs, label: "pages" },
            { snippetsMode: true, fileArgs, label: "snippets" },
          ];
    let allIssues: Awaited<ReturnType<typeof scanTruncationIssues>> = [];
    for (const phase of scanPhases) {
      const phaseFiles = filterFileArgsForPhase(fileArgs, phase.snippetsMode);
      const issues = await scanTruncationIssues({
        langs: selectedLangs,
        snippetsMode: phase.snippetsMode,
        fileArgs: phaseFiles.length > 0 ? phaseFiles : fileArgs,
      });
      allIssues = [...allIssues, ...issues];
    }
    await writeTruncationReport(allIssues, {
      replaceLangs:
        selectedLangs.length < config.languages.length
          ? selectedLangs.map((l) => l.code)
          : undefined,
    });
    console.log(`Truncation scan: ${allIssues.length} issue(s) → ${TRANSLATE_LOG_REL}/truncation-issues.txt`);
    if (allIssues.length > 0) {
      console.log("Repair: npm run translate:repair-truncated -- --lang <code>");
    }
    return;
  }

  if (!API_KEY) {
    console.error(
      "No API key. Set TRANSLATE_API_KEY or DEEPSEEK_API_KEY in .env.local"
    );
    process.exit(1);
  }

  if (repairTruncated) {
    const repairFiles = await readTruncationRepairList(
      selectedLangs.map((l) => l.code)
    );
    if (repairFiles.length === 0) {
      console.error(
        `No truncation issues in ${TRANSLATE_LOG_REL}/truncation-issues.json for selected language(s).`
      );
      console.error("Run: npm run translate:check-truncation -- --lang <code>");
      process.exit(1);
    }
    fileArgs = repairFiles;
    console.log(`Repair-truncated: ${repairFiles.length} file(s) from truncation log`);
  }

  const phaseSummary = phases.map((p) => p.label).join(" → ");
  console.log(
    `Config: model=${MODEL} concurrency=${CONCURRENCY} mode=${IS_QWEN_MT ? "qwen-mt" : "llm"}` +
      ` languages=${selectedLangs.map((l) => l.code).join(",")}` +
      ` phases=${phaseSummary}` +
      `${repairTruncated ? " [repair-truncated]" : ""}` +
      ` skip=[${SKIP_PATHS.join(", ")}]`
  );

  let totalFailed = 0;
  for (const phase of phases) {
    const result = await runTranslatePhase({
      snippetsMode: phase.snippetsMode,
      fileArgs: phase.fileArgs,
      phaseLabel: phase.label,
      selectedLangs,
      dryRun,
      force,
      repairTruncated,
    });
    totalFailed += result.failed;
  }

  if (dryRun) {
    if (runDocsJsonAfter) {
      console.log("");
      await runDocsJsonSync(selectedLangs, true, {
        translateLabels: translateNavLabels && Boolean(API_KEY),
      });
    }
    return;
  }

  if (repairTruncated && totalFailed === 0) {
    console.log("\nTruncation repair: all targeted files look OK.");
  }

  if (runDocsJsonAfter) {
    console.log("");
    await runDocsJsonSync(selectedLangs, false, {
      translateLabels: translateNavLabels && Boolean(API_KEY),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
