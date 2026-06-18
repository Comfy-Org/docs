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
      const m = line.match(/^\s{2}([^:]+):\s*"?([a-f0-9]{8})"?\s*$/);
      if (m) {
        out[m[1]!.trim()] = m[2]!;
        continue;
      }
      if (/^[A-Za-z_][\w-]*:/.test(line)) {
        inMap = false;
      }
    }
  }
  return out;
}

export function formatBlockHashesYaml(blockHashes: Record<string, string>): string {
  const lines = ["translationBlockHashes:"];
  for (const label of Object.keys(blockHashes).sort()) {
    lines.push(`  ${label}: ${blockHashes[label]}`);
  }
  return lines.join("\n");
}

export function stripTranslationMetaFromFrontmatter(body: string): string {
  return body
    .replace(/\ntranslationSourceHash:.*/g, "")
    .replace(/\ntranslationFrom:.*/g, "")
    .replace(/\ntranslationBlockHashes:[\s\S]*?(?=\n[A-Za-z_][\w-]*:|\s*$)/, "")
    .replace(/\ntranslationMismatches:(?:\n\s+-.*?)*/g, "")
    .replace(/^translationSourceHash:.*\n?/m, "")
    .replace(/^translationFrom:.*\n?/m, "")
    .replace(/^translationBlockHashes:[\s\S]*?(?=^[A-Za-z_][\w-]*:|\s*$)/m, "")
    .replace(/^translationMismatches:(?:\n\s+-.*?)*/g, "");
}

export function setChunkedTranslationMeta(
  content: string,
  fileHash: string,
  enPath: string,
  blockHashes: Record<string, string>
): string {
  const metaLines = [
    `translationSourceHash: ${fileHash}`,
    `translationFrom: ${enPath}`,
    formatBlockHashesYaml(blockHashes),
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

export function parseHeadingSections(body: string): ContentBlock[] {
  const lines = body.split("\n");
  const blocks: ContentBlock[] = [];
  let introLines: string[] = [];
  let current: ContentBlock | null = null;

  for (const line of lines) {
    if (H2_HEADING_RE.test(line)) {
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
  let hasIntro = body.trim().length > 0 && !H2_HEADING_RE.test(lines.find((l) => l.trim()) ?? "");

  for (const line of lines) {
    if (H2_HEADING_RE.test(line)) {
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
  return body.split("\n").filter((l) => H2_HEADING_RE.test(l)).length;
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

export function changelogLabelHash(blocks: ContentBlock[]): string {
  return blockHash(blocks.map((b) => b.label).join("|"));
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
  blockHashes: Record<string, string>
): string {
  const body = slots
    .map((s) => s.content)
    .filter((c): c is string => c !== null)
    .join("\n\n");
  const raw = `${frontmatter}\n${body}\n`;
  return setChunkedTranslationMeta(raw, fileHash, enRel, blockHashes);
}

export function getSectionSyncStatus(
  enContent: string,
  existingContent: string,
  strategy: ChunkStrategy,
  force: boolean
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

  if (strategy === "update_blocks") {
    const existingLabels = new Set(existingDoc.blocks.map((b) => b.label));
    const pendingBlocks = enDoc.blocks
      .filter((b) => !existingLabels.has(b.label))
      .map((b) => b.label);
    return {
      upToDate: pendingBlocks.length === 0,
      pendingBlocks,
      needsFrontmatter: existingDoc.blocks.length === 0,
    };
  }

  const existingFm = parseFrontmatterAndBody(existingContent).frontmatter;
  const storedHashes = parseBlockHashesFromFrontmatter(
    existingFm.replace(/^---\n/, "").replace(/\n---$/, "")
  );

  const pendingBlocks = enDoc.blocks
    .filter((b) => storedHashes[b.label] !== enHashes[b.label])
    .map((b) => b.label);

  return {
    upToDate: pendingBlocks.length === 0,
    pendingBlocks,
    needsFrontmatter: Object.keys(storedHashes).length === 0,
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

  // Section blocks must remain level-2 headings (text may be translated).
  return /^## (?![#])/.test(translated.trimStart());
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
