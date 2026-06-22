/**
 * Chunked MDX translation helpers.
 *
 * Strategies:
 * - update_blocks: changelog/index.mdx — one <Update label="…"> per block
 * - heading_sections: long pages — split on level-2 `##` headings
 *
 * Incremental sync stores per-block English hashes in frontmatter
 * (`translationBlockHashes`) keyed by stable English labels. Target files
 * are split by section index (headings are translated, so labels differ).
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChunkStrategy = "update_blocks" | "heading_sections";

export interface ChunkedFileConfig {
  path: string;
  strategy: ChunkStrategy;
}

export interface AutoChunkConfig {
  /** Minimum English body length (chars) to auto-enable heading_sections. */
  min_body_chars?: number;
  /** Minimum number of `##` sections required for auto-chunking. */
  min_sections?: number;
}

export interface ContentBlock {
  /** Stable sync key from English (section title or `_intro`). */
  label: string;
  content: string;
}

export interface ParsedDocument {
  frontmatter: string;
  blocks: ContentBlock[];
}

export interface BlockSlot {
  label: string;
  content: string | null;
}

export interface SectionSyncStatus {
  upToDate: boolean;
  pendingBlocks: string[];
  needsFrontmatter: boolean;
  /** EN section removed — re-serialize target without re-translating unchanged blocks. */
  needsReserialize?: boolean;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function blockHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

export function documentBlockHashes(blocks: ContentBlock[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) {
    if (b.label in out) {
      throw new Error(
        `Duplicate block label: "${b.label}". Use unique section headings for sync.`
      );
    }
    out[b.label] = blockHash(b.content);
  }
  return out;
}

export function aggregateDocumentHash(blockHashes: Record<string, string>): string {
  const joined = Object.keys(blockHashes)
    .sort()
    .map((k) => `${k}:${blockHashes[k]}`)
    .join("|");
  return blockHash(joined);
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

export function parseFrontmatterAndBody(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---\n[\s\S]*?\n---)\n?([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: `${match[1]}\n`, body: match[2] };
}

function parseBlockHashEntry(
  line: string
): { label: string; hash: string } | null {
  const quoted = line.match(/^\s{2}("(?:\\.|[^"\\])*"):\s*"?([a-f0-9]{8})"?\s*$/);
  if (quoted) {
    return { label: JSON.parse(quoted[1]!) as string, hash: quoted[2]! };
  }
  const plain = line.match(/^\s{2}([^:]+):\s*"?([a-f0-9]{8})"?\s*$/);
  if (plain) {
    return { label: plain[1]!.trim(), hash: plain[2]! };
  }
  return null;
}

/** Parse `translationBlockHashes` YAML map from frontmatter body. */
export function parseBlockHashesFromFrontmatter(fmBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = fmBody.split("\n");
  let inMap = false;
  for (const line of lines) {
    if (/^translationBlockHashes:\s*$/.test(line)) {
      inMap = true;
      continue;
    }
    if (inMap) {
      const entry = parseBlockHashEntry(line);
      if (entry) {
        out[entry.label] = entry.hash;
        continue;
      }
      if (/^[A-Za-z_][\w-]*:/.test(line)) {
        inMap = false;
      }
    }
  }
  return out;
}

/** Block labels in frontmatter file order (not sorted). */
export function parseBlockHashLabelOrderFromFrontmatter(fmBody: string): string[] {
  const labels: string[] = [];
  const lines = fmBody.split("\n");
  let inMap = false;
  for (const line of lines) {
    if (/^translationBlockHashes:\s*$/.test(line)) {
      inMap = true;
      continue;
    }
    if (inMap) {
      const entry = parseBlockHashEntry(line);
      if (entry) {
        labels.push(entry.label);
        continue;
      }
      if (/^[A-Za-z_][\w-]*:/.test(line)) {
        inMap = false;
      }
    }
  }
  return labels;
}

export function blockHashLabelOrderDrifts(
  enLabels: string[],
  storedLabels: string[]
): boolean {
  if (enLabels.length !== storedLabels.length) return true;
  return enLabels.some((label, i) => label !== storedLabels[i]);
}

export function formatBlockHashesYaml(
  blockHashes: Record<string, string>,
  labelOrder: string[]
): string {
  const lines = ["translationBlockHashes:"];
  const seen = new Set<string>();
  for (const label of labelOrder) {
    if (!(label in blockHashes) || seen.has(label)) continue;
    lines.push(`  ${JSON.stringify(label)}: ${blockHashes[label]}`);
    seen.add(label);
  }
  for (const label of Object.keys(blockHashes)) {
    if (seen.has(label)) continue;
    lines.push(`  ${JSON.stringify(label)}: ${blockHashes[label]}`);
  }
  return lines.join("\n");
}

function stripFrontmatterLineFieldAfterNewline(body: string, field: string): string {
  return body.replace(new RegExp(`\\n${field}:.*`, "g"), "");
}

function stripFrontmatterLineFieldAtStart(body: string, field: string): string {
  return body.replace(new RegExp(`^${field}:.*\\n?`, "m"), "");
}

function stripFrontmatterBlockFieldAfterNewline(body: string, field: string): string {
  return body.replace(
    new RegExp(`\\n${field}:[\\s\\S]*?(?=\\n[A-Za-z_][\\w-]*:|\\s*$)`),
    ""
  );
}

function stripFrontmatterBlockFieldAtStart(body: string, field: string): string {
  return body.replace(
    new RegExp(`^${field}:[\\s\\S]*?(?=^[A-Za-z_][\\w-]*:|\\s*$)`, "m"),
    ""
  );
}

function stripFrontmatterListFieldAfterNewline(body: string, field: string): string {
  return body.replace(new RegExp(`\\n${field}:(?:\\n\\s+-.*?)*`, "g"), "");
}

function stripFrontmatterListFieldAtStart(body: string, field: string): string {
  return body.replace(new RegExp(`^${field}:(?:\\n\\s+-.*?)*`, "g"), "");
}

export function stripTranslationMetaFromFrontmatter(body: string): string {
  let out = body;
  out = stripFrontmatterLineFieldAfterNewline(out, "translationSourceHash");
  out = stripFrontmatterLineFieldAfterNewline(out, "translationFrom");
  out = stripFrontmatterBlockFieldAfterNewline(out, "translationBlockHashes");
  out = stripFrontmatterListFieldAfterNewline(out, "translationMismatches");
  out = stripFrontmatterLineFieldAtStart(out, "translationSourceHash");
  out = stripFrontmatterLineFieldAtStart(out, "translationFrom");
  out = stripFrontmatterBlockFieldAtStart(out, "translationBlockHashes");
  out = stripFrontmatterListFieldAtStart(out, "translationMismatches");
  return out;
}

export function setChunkedTranslationMeta(
  content: string,
  fileHash: string,
  enPath: string,
  blockHashes: Record<string, string>,
  labelOrder: string[]
): string {
  const metaLines = [
    `translationSourceHash: ${fileHash}`,
    `translationFrom: ${enPath}`,
    formatBlockHashesYaml(blockHashes, labelOrder),
  ];
  const metaBlock = metaLines.join("\n");

  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) {
    return `---\n${metaBlock}\n---\n${content}`;
  }
  const [, open, body, close] = fmMatch;
  const rest = content.slice(fmMatch[0].length);
  const cleaned = stripTranslationMetaFromFrontmatter(body);
  return `${open}${cleaned}\n${metaBlock}${close}${rest}`;
}

// ---------------------------------------------------------------------------
// heading_sections — split on level-2 headings
// ---------------------------------------------------------------------------

const H2_HEADING_RE = /^## (?![#])/;
const FENCE_RE = /^(```|~~~)/;

// Track fence depth (``` or ~~~) to handle nested/multiple code blocks correctly.
// Returns 0 when no fence is open, >0 when inside a fence.
function toggleFence(line: string, depth: number): number {
  return FENCE_RE.test(line.trim()) ? depth + 1 : depth;
}

function isClosingFence(line: string): boolean {
  return FENCE_RE.test(line.trim());
}

// Check if code fences are balanced in the text.
// When translating in blocks, unmatched fences can cause parsing issues downstream.
function fencesAreBalanced(text: string): boolean {
  let depth = 0;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line.trim())) depth++;
  }
  // Depth should be even (every open has a close).
  return depth % 2 === 0;
}

function isH2SectionLine(line: string, inFence: boolean): boolean {
  return !inFence && H2_HEADING_RE.test(line);
}

export function parseHeadingSections(body: string): ContentBlock[] {
  const lines = body.split("\n");
  const blocks: ContentBlock[] = [];
  let introLines: string[] = [];
  let current: ContentBlock | null = null;
  let fenceDepth = 0;

  function inFence(): boolean { return fenceDepth % 2 !== 0; }

  for (const line of lines) {
    if (isClosingFence(line)) fenceDepth = toggleFence(line, fenceDepth);
    if (isH2SectionLine(line, inFence())) {
      if (current) {
        blocks.push({ ...current, content: current.content.trimEnd() });
      } else if (introLines.length > 0) {
        const intro = introLines.join("\n").trimEnd();
        if (intro.length > 0) {
          blocks.push({ label: "_intro", content: intro });
        }
        introLines = [];
      }
      current = { label: line.slice(3).trim(), content: line };
    } else if (current) {
      current.content += `\n${line}`;
    } else {
      introLines.push(line);
    }
  }

  if (current) {
    blocks.push({ ...current, content: current.content.trimEnd() });
  } else if (introLines.length > 0) {
    const intro = introLines.join("\n").trimEnd();
    if (intro.length > 0) {
      blocks.push({ label: "_intro", content: intro });
    }
  }

  return blocks;
}

/** Split target body into the same number of positional sections as English. */
export function parseTargetSectionsByIndex(body: string, enBlockCount: number): string[] {
  const enBlocks = parseHeadingSections(body);
  if (enBlocks.length === enBlockCount) {
    return enBlocks.map((b) => b.content);
  }

  // Fallback: positional split using English block structure markers
  const sections: string[] = [];
  const lines = body.split("\n");
  let introLines: string[] = [];
  let currentLines: string[] = [];
  let h2Count = 0;
  let fenceDepth = 0;
  let hasIntro = body.trim().length > 0 && !H2_HEADING_RE.test(lines.find((l) => l.trim()) ?? "");

  function inFenceFallback(): boolean { return fenceDepth % 2 !== 0; }

  for (const line of lines) {
    if (isClosingFence(line)) fenceDepth = toggleFence(line, fenceDepth);
    if (isH2SectionLine(line, inFenceFallback())) {
      if (h2Count === 0 && introLines.length > 0) {
        sections.push(introLines.join("\n").trimEnd());
        introLines = [];
        hasIntro = true;
      } else if (currentLines.length > 0) {
        sections.push(currentLines.join("\n").trimEnd());
      }
      currentLines = [line];
      h2Count++;
    } else if (h2Count === 0 && !hasIntro) {
      currentLines.push(line);
    } else if (h2Count === 0) {
      introLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (introLines.length > 0) {
    sections.unshift(introLines.join("\n").trimEnd());
  }
  if (currentLines.length > 0) {
    sections.push(currentLines.join("\n").trimEnd());
  }

  // Pad with empty strings if target is shorter
  while (sections.length < enBlockCount) {
    sections.push("");
  }
  return sections.slice(0, enBlockCount);
}

export function countH2Sections(body: string): number {
  let fenceDepth = 0;
  let count = 0;
  for (const line of body.split("\n")) {
    if (isClosingFence(line)) fenceDepth = toggleFence(line, fenceDepth);
    if (isH2SectionLine(line, fenceDepth % 2 !== 0)) count++;
  }
  return count;
}

export function shouldAutoChunk(body: string, autoChunk?: AutoChunkConfig): boolean {
  const minChars = autoChunk?.min_body_chars ?? 10_000;
  const minSections = autoChunk?.min_sections ?? 4;
  const sectionCount = countH2Sections(body);
  return body.length >= minChars && sectionCount >= minSections;
}

// ---------------------------------------------------------------------------
// update_blocks — changelog <Update> elements
// ---------------------------------------------------------------------------

export function parseUpdateBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const re = /<Update\s+label="([^"]+)"[^>]*>[\s\S]*?<\/Update>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    blocks.push({ label: match[1]!, content: match[0] });
  }
  return blocks;
}

/** Parse ComfyUI changelog label like `v0.25.1` into numeric segments. */
export function parseChangelogVersion(label: string): number[] {
  const m = label.match(/^v?(\d+(?:\.\d+)*)/i);
  if (!m) return [];
  return m[1]!.split(".").map((n) => Number(n));
}

/** Descending semver compare for changelog `<Update label="…">` values (newest first). */
export function compareChangelogVersionsDesc(a: string, b: string): number {
  const pa = parseChangelogVersion(a);
  const pb = parseChangelogVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return b.localeCompare(a);
}

export function canonicalChangelogLabelOrder(labels: string[]): string[] {
  return [...labels].sort(compareChangelogVersionsDesc);
}

export function sortUpdateBlocksByVersion(blocks: ContentBlock[]): ContentBlock[] {
  return [...blocks].sort((a, b) => compareChangelogVersionsDesc(a.label, b.label));
}

export function orderSlotsForStrategy(strategy: ChunkStrategy, slots: BlockSlot[]): BlockSlot[] {
  if (strategy !== "update_blocks") return slots;
  return [...slots].sort((a, b) => compareChangelogVersionsDesc(a.label, b.label));
}

export function canonicalBlockLabelOrder(
  strategy: ChunkStrategy,
  labels: string[]
): string[] {
  return strategy === "update_blocks" ? canonicalChangelogLabelOrder(labels) : labels;
}

export function changelogLabelHash(blocks: ContentBlock[]): string {
  const labels = canonicalChangelogLabelOrder(blocks.map((b) => b.label));
  return blockHash(labels.join("|"));
}

const EN_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const EN_DATE_DESC_RE =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/;

export function parseEnglishChangelogDate(
  date: string
): { year: number; month: number; day: number } | null {
  const m = date.trim().match(EN_DATE_DESC_RE);
  if (!m) return null;
  const month = EN_MONTH_NAMES.indexOf(m[1] as (typeof EN_MONTH_NAMES)[number]) + 1;
  if (month <= 0) return null;
  return { year: Number(m[3]), month, day: Number(m[2]) };
}

/** Localized `<Update description="…">` date for ja / ko / zh. */
export function formatChangelogDateForLang(
  year: number,
  month: number,
  day: number,
  lang: string
): string {
  switch (lang) {
    case "ja":
    case "zh":
      return `${year}年${month}月${day}日`;
    case "ko":
      return `${year}년 ${month}월 ${day}일`;
    default:
      return `${EN_MONTH_NAMES[month - 1]} ${day}, ${year}`;
  }
}

export function localizeEnglishChangelogDate(date: string, lang: string): string {
  const parsed = parseEnglishChangelogDate(date);
  if (!parsed || lang === "en") return date;
  return formatChangelogDateForLang(parsed.year, parsed.month, parsed.day, lang);
}

export function extractUpdateDescription(updateBlock: string): string | null {
  return updateBlock.match(/<Update\s+[^>]*description="([^"]+)"/)?.[1] ?? null;
}

/** Replace description with locale date derived from the English source block. */
export function syncUpdateBlockDescription(
  translatedBlock: string,
  enBlock: ContentBlock,
  langCode: string
): string {
  const enDesc = extractUpdateDescription(enBlock.content);
  if (!enDesc || langCode === "en") return translatedBlock;
  const localized = localizeEnglishChangelogDate(enDesc, langCode);
  if (localized === enDesc) return translatedBlock;
  return translatedBlock.replace(
    /(<Update\s+[^>]*description=")([^"]+)(")/,
    `$1${localized}$3`
  );
}

export function applyChangelogBlockLocalizations(
  slots: BlockSlot[],
  enBlocks: ContentBlock[],
  langCode: string
): BlockSlot[] {
  if (langCode === "en") return slots;
  const enByLabel = new Map(enBlocks.map((b) => [b.label, b]));
  return slots.map((s) => {
    const enBlock = enByLabel.get(s.label);
    if (!s.content || !enBlock) return s;
    return {
      label: s.label,
      content: syncUpdateBlockDescription(s.content, enBlock, langCode),
    };
  });
}

export function hasChangelogDateDrift(
  enContent: string,
  targetContent: string,
  langCode: string
): boolean {
  if (langCode === "en") return false;
  const enDoc = parseDocument(enContent, "update_blocks");
  const targetDoc = parseDocument(targetContent, "update_blocks");
  const targetByLabel = new Map(targetDoc.blocks.map((b) => [b.label, b]));
  for (const enBlock of enDoc.blocks) {
    const enDesc = extractUpdateDescription(enBlock.content);
    if (!enDesc) continue;
    const expected = localizeEnglishChangelogDate(enDesc, langCode);
    const targetBlock = targetByLabel.get(enBlock.label);
    if (!targetBlock) continue;
    const actual = extractUpdateDescription(targetBlock.content) ?? "";
    if (actual !== expected) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Document parsing / serialization
// ---------------------------------------------------------------------------

export function parseDocument(content: string, strategy: ChunkStrategy): ParsedDocument {
  const { frontmatter, body } = parseFrontmatterAndBody(content);
  const blocks =
    strategy === "update_blocks" ? parseUpdateBlocks(body) : parseHeadingSections(body);
  return { frontmatter, blocks };
}

export function serializeChunkedDocument(
  frontmatter: string,
  slots: BlockSlot[],
  fileHash: string,
  enRel: string,
  blockHashes: Record<string, string>,
  strategy: ChunkStrategy
): string {
  const ordered = orderSlotsForStrategy(strategy, slots);
  const body = ordered
    .map((s) => s.content)
    .filter((c): c is string => c !== null)
    .join("\n\n");
  const labelOrder = ordered.map((s) => s.label);
  const raw = `${frontmatter}\n${body}\n`;
  return setChunkedTranslationMeta(raw, fileHash, enRel, blockHashes, labelOrder);
}

/** Rebuild changelog body with `<Update>` blocks in descending semver order. */
export function serializeUpdateBlocksDocument(
  frontmatter: string,
  blocks: ContentBlock[]
): string {
  const body = sortUpdateBlocksByVersion(blocks)
    .map((b) => b.content)
    .join("\n\n");
  return `${frontmatter}\n${body}\n`;
}

export function getSectionSyncStatus(
  enContent: string,
  existingContent: string,
  strategy: ChunkStrategy,
  force: boolean,
  langCode?: string
): SectionSyncStatus {
  const enDoc = parseDocument(enContent, strategy);
  const enHashes = documentBlockHashes(enDoc.blocks);

  if (force) {
    return {
      upToDate: false,
      pendingBlocks: enDoc.blocks.map((b) => b.label),
      needsFrontmatter: true,
    };
  }

  if (!existingContent.trim()) {
    return {
      upToDate: false,
      pendingBlocks: enDoc.blocks.map((b) => b.label),
      needsFrontmatter: true,
    };
  }

  const existingDoc = parseDocument(existingContent, strategy);

  const existingFmBody = parseFrontmatterAndBody(existingContent).frontmatter
    .replace(/^---\n/, "")
    .replace(/\n---$/, "");
  const storedLabels = parseBlockHashLabelOrderFromFrontmatter(existingFmBody);
  const enLabels = canonicalBlockLabelOrder(
    strategy,
    enDoc.blocks.map((b) => b.label)
  );
  const hasOrderDrift = blockHashLabelOrderDrifts(enLabels, storedLabels);

  if (strategy === "update_blocks") {
    const existingLabels = new Set(existingDoc.blocks.map((b) => b.label));
    const pendingBlocks = enDoc.blocks
      .filter((b) => !existingLabels.has(b.label))
      .map((b) => b.label);
    const hasDateDrift = langCode
      ? hasChangelogDateDrift(enContent, existingContent, langCode)
      : false;
    return {
      upToDate: pendingBlocks.length === 0 && !hasOrderDrift && !hasDateDrift,
      pendingBlocks,
      needsFrontmatter: existingDoc.blocks.length === 0,
      needsReserialize: pendingBlocks.length === 0 && (hasOrderDrift || hasDateDrift),
    };
  }

  const storedHashes = parseBlockHashesFromFrontmatter(existingFmBody);

  const pendingBlocks = enDoc.blocks
    .filter((b) => storedHashes[b.label] !== enHashes[b.label])
    .map((b) => b.label);

  const hasStructureDrift = Object.keys(storedHashes).some((k) => !(k in enHashes));

  return {
    upToDate: pendingBlocks.length === 0 && !hasStructureDrift && !hasOrderDrift,
    pendingBlocks,
    needsFrontmatter: Object.keys(storedHashes).length === 0,
    needsReserialize:
      pendingBlocks.length === 0 && (hasStructureDrift || hasOrderDrift),
  };
}

export function resolveChunkStrategy(
  relPath: string,
  enBody: string,
  chunkedFiles: ChunkedFileConfig[],
  autoChunk?: AutoChunkConfig
): ChunkStrategy | null {
  const normalized = relPath.replace(/\\/g, "/");
  const configured = chunkedFiles.find((c) => c.path.replace(/\\/g, "/") === normalized);
  if (configured) return configured.strategy;
  if (shouldAutoChunk(enBody, autoChunk)) return "heading_sections";
  return null;
}

export function validateTranslatedBlock(
  strategy: ChunkStrategy,
  enBlock: ContentBlock,
  translated: string
): boolean {
  if (!translated.trim()) return false;

  if (strategy === "update_blocks") {
    return translated.includes("<Update");
  }

  if (enBlock.label === "_intro") {
    return true;
  }

  // Must start with a level-2 heading.
  if (!/^## (?![#])/.test(translated.trimStart())) {
    return false;
  }

  // Validate code fence balance: every open fence must have a matching close.
  // Unmatched fences cause subsequent sections to be swallowed during re-parsing.
  if (!fencesAreBalanced(translated)) {
    const fenceLines = (translated.match(/^(```|~~~)/gm) || []).length;
    console.log(
      `    [WARN] Block "${enBlock.label}": unclosed code fence ` +
      `(${fenceLines} fence markers, expected even count) — keeping existing content`
    );
    return false;
  }

  return true;
}

export function missingSectionLabels(
  enBody: string,
  targetBody: string,
  strategy: ChunkStrategy
): string[] {
  if (strategy !== "heading_sections") return [];
  const enBlocks = parseHeadingSections(enBody);
  const targetSections = parseTargetSectionsByIndex(targetBody, enBlocks.length);
  const missing: string[] = [];
  for (let i = 0; i < enBlocks.length; i++) {
    if (!targetSections[i]?.trim()) {
      missing.push(enBlocks[i]!.label);
    }
  }
  return missing;
}
