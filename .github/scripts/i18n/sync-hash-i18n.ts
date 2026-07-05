#!/usr/bin/env bun
/**
 * Sync translationSourceHash / translationBlockHashes from English source without
 * calling the translation API. Use after manually editing zh/ja/ko translations.
 *
 * Usage:
 *   pnpm translate:sync-hash                              # all pending (hash drift)
 *   pnpm translate:sync-hash -- installation/foo.mdx      # specific file(s)
 *   pnpm translate:sync-hash -- --lang zh path/to/page.mdx
 *   pnpm translate:sync-hash -- --dry-run                 # preview only
 *   pnpm translate:sync-hash -- --verify path/to/page.mdx # warn if EN changed blocks look untranslated
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
} from "./i18n-config.mjs";
import {
  type AutoChunkConfig,
  type ChunkedFileConfig,
  type ChunkStrategy,
  aggregateDocumentHash,
  canonicalBlockLabelOrder,
  changelogLabelHash,
  documentBlockHashes,
  getSectionSyncStatus,
  parseDocument,
  parseFrontmatterAndBody,
  resolveChunkStrategy,
  setChunkedTranslationMeta,
  stripTranslationMetaFromFrontmatter,
} from "./chunked-translate.ts";

const config = loadI18nConfig() as TranslationConfig;
const pathFilterOpts = { languages: config.languages, skip_paths: config.skip_paths ?? [] };
const CHUNKED_FILES: ChunkedFileConfig[] = config.chunked_files ?? [];
const AUTO_CHUNK: AutoChunkConfig | undefined = config.auto_chunk;

interface TranslationConfig {
  languages: LangConfig[];
  skip_paths?: string[];
  chunked_files?: ChunkedFileConfig[];
  auto_chunk?: AutoChunkConfig;
}

interface LangConfig {
  code: string;
  name: string;
  dir: string;
  snippets_dir: string;
}

function sourceHash(en: string): string {
  return createHash("sha256").update(en).digest("hex").slice(0, 8);
}

function getExistingHash(content: string): string | null {
  const fmMatch = content.match(/translationSourceHash:\s*"?([a-f0-9]{8})"?/);
  if (fmMatch) return fmMatch[1] ?? null;
  const mdxComment = content.match(/\{\/\*\s*translationSourceHash:\s*([a-f0-9]{8})\s*\*\/\}/);
  if (mdxComment) return mdxComment[1] ?? null;
  const htmlComment = content.match(/<!--\s*translationSourceHash:\s*([a-f0-9]{8})\s*-->/);
  return htmlComment?.[1] ?? null;
}

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

function resolveFileChunkStrategy(relPath: string, enContent: string): ChunkStrategy | null {
  const { body } = parseFrontmatterAndBody(enContent);
  return resolveChunkStrategy(relPath, body, CHUNKED_FILES, AUTO_CHUNK);
}

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
      enPath: join(REPO_ROOT, "snippets", enRel),
      targetPath: join(REPO_ROOT, lang.snippets_dir, enRel),
      enRel: `snippets/${enRel}`,
      targetRel: `${lang.snippets_dir}/${enRel}`,
    };
  }
  return {
    enPath: join(REPO_ROOT, enRel),
    targetPath: join(REPO_ROOT, lang.dir, enRel),
    enRel,
    targetRel: `${lang.dir}/${enRel}`,
  };
}

function syncChunkedHashes(
  enContent: string,
  targetContent: string,
  strategy: ChunkStrategy,
  enRel: string
): string {
  const enDoc = parseDocument(enContent, strategy);
  const enBlockHashes = documentBlockHashes(enDoc.blocks);
  const fileHash =
    strategy === "update_blocks"
      ? changelogLabelHash(enDoc.blocks)
      : aggregateDocumentHash(enBlockHashes);

  const { frontmatter, body } = parseFrontmatterAndBody(targetContent);
  const labelOrder = canonicalBlockLabelOrder(
    strategy,
    enDoc.blocks.map((b) => b.label)
  );
  const bodyText = body.endsWith("\n") ? body : `${body}\n`;
  const raw = `${frontmatter}\n${bodyText}`;
  return setChunkedTranslationMeta(raw, fileHash, enRel, enBlockHashes, labelOrder);
}

function syncPlainHashes(
  targetContent: string,
  enContent: string,
  enRel: string,
  snippetsMode: boolean
): string {
  const hash = sourceHash(enContent);
  if (snippetsMode) {
    return setSnippetHash(targetContent, hash);
  }
  return setTranslationMeta(targetContent, hash, enRel);
}

interface SyncResult {
  status: "updated" | "skipped" | "missing" | "unchanged";
  warnings: string[];
}

function computeSyncedContent(
  enContent: string,
  targetContent: string,
  relPath: string,
  enRel: string,
  snippetsMode: boolean
): { output: string; expectedFileHash: string } {
  const chunkStrategy = !snippetsMode ? resolveFileChunkStrategy(relPath, enContent) : null;
  if (chunkStrategy) {
    const enDoc = parseDocument(enContent, chunkStrategy);
    const enBlockHashes = documentBlockHashes(enDoc.blocks);
    const expectedFileHash =
      chunkStrategy === "update_blocks"
        ? changelogLabelHash(enDoc.blocks)
        : aggregateDocumentHash(enBlockHashes);
    return {
      output: syncChunkedHashes(enContent, targetContent, chunkStrategy, enRel),
      expectedFileHash,
    };
  }
  return {
    output: syncPlainHashes(targetContent, enContent, enRel, snippetsMode),
    expectedFileHash: sourceHash(enContent),
  };
}

function collectVerifyWarnings(
  enContent: string,
  targetContent: string,
  relPath: string,
  langCode: string,
  snippetsMode: boolean
): string[] {
  const warnings: string[] = [];
  const chunkStrategy = !snippetsMode ? resolveFileChunkStrategy(relPath, enContent) : null;

  if (chunkStrategy) {
    const status = getSectionSyncStatus(enContent, targetContent, chunkStrategy, false, langCode);
    if (status.pendingBlocks.length > 0) {
      const unit = chunkStrategy === "update_blocks" ? "block(s)" : "section(s)";
      warnings.push(
        `English changed in ${status.pendingBlocks.length} ${unit}: ${status.pendingBlocks.slice(0, 5).join(", ")}${status.pendingBlocks.length > 5 ? ", …" : ""}. Confirm translations were updated manually.`
      );
    }
    return warnings;
  }

  const expected = sourceHash(enContent);
  const existing = getExistingHash(targetContent);
  if (existing && existing !== expected) {
    warnings.push(
      "English source hash differs from stored translationSourceHash. Confirm the full translation was updated manually."
    );
  }
  return warnings;
}

async function syncOneFile(
  relPath: string,
  lang: LangConfig,
  snippetsMode: boolean,
  dryRun: boolean,
  verify: boolean
): Promise<SyncResult> {
  const { enPath, targetPath, enRel, targetRel } = makeMapping(lang, relPath, snippetsMode);
  const enContent = await readFileOr(enPath);
  if (!enContent || enContent.length < 50) {
    return { status: "skipped", warnings: [] };
  }

  const targetContent = await readFileOr(targetPath);
  if (!targetContent.trim()) {
    console.log(`  [${lang.code}] missing target: ${targetRel}`);
    return { status: "missing", warnings: [] };
  }

  const { output, expectedFileHash } = computeSyncedContent(
    enContent,
    targetContent,
    relPath,
    enRel,
    snippetsMode
  );

  const existingHash = getExistingHash(targetContent);
  if (existingHash === expectedFileHash && output === targetContent) {
    return { status: "unchanged", warnings: [] };
  }

  const warnings = verify
    ? collectVerifyWarnings(enContent, targetContent, relPath, lang.code, snippetsMode)
    : [];

  if (dryRun) {
    console.log(`  [${lang.code}] would sync hash: ${targetRel}`);
    for (const w of warnings) console.log(`    ⚠ ${w}`);
    return { status: "updated", warnings };
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, output);
  console.log(`  [${lang.code}] synced hash: ${targetRel}`);
  for (const w of warnings) console.log(`    ⚠ ${w}`);
  return { status: "updated", warnings };
}

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
    const all = await collectMdx(join(REPO_ROOT, "snippets"));
    return all
      .map((f) => relative(join(REPO_ROOT, "snippets"), f))
      .filter((f) => isEnglishSnippetPath(f, pathFilterOpts));
  }

  const all = await collectMdx(REPO_ROOT);
  return all
    .map((f) => relative(REPO_ROOT, f))
    .filter((f) => isEnglishPagePath(f, pathFilterOpts));
}

function needsHashSync(
  enContent: string,
  targetContent: string,
  relPath: string,
  snippetsMode: boolean
): boolean {
  if (!targetContent.trim()) return false;
  const chunkStrategy = !snippetsMode ? resolveFileChunkStrategy(relPath, enContent) : null;
  if (chunkStrategy) {
    const status = getSectionSyncStatus(enContent, targetContent, chunkStrategy, false);
    return !status.upToDate;
  }
  return getExistingHash(targetContent) !== sourceHash(enContent);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verify = args.includes("--verify");
  const allFiles = args.includes("--all");
  const snippetsOnly = args.includes("--snippets") || args.includes("--snippets-only");
  const pagesOnly = args.includes("--pages-only") || args.includes("--no-snippets");
  const selectedLangs = parseLangArg(args);
  const fileArgs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");

  const phases: { snippetsMode: boolean; fileArgs: string[]; label: string }[] = [];
  if (snippetsOnly) {
    phases.push({ snippetsMode: true, fileArgs, label: "snippets" });
  } else if (pagesOnly) {
    phases.push({ snippetsMode: false, fileArgs, label: "pages" });
  } else if (fileArgs.length > 0) {
    const pageArgs = fileArgs.filter((f) => !f.replace(/^snippets\//, "").startsWith("snippets/"));
    const snippetArgs = fileArgs.filter((f) => f.startsWith("snippets/"));
    if (pageArgs.length > 0) phases.push({ snippetsMode: false, fileArgs: pageArgs, label: "pages" });
    if (snippetArgs.length > 0) phases.push({ snippetsMode: true, fileArgs: snippetArgs, label: "snippets" });
    if (phases.length === 0) phases.push({ snippetsMode: false, fileArgs, label: "pages" });
  } else {
    phases.push({ snippetsMode: false, fileArgs: [], label: "pages" });
    phases.push({ snippetsMode: true, fileArgs: [], label: "snippets" });
  }

  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalMissing = 0;
  let totalWarnings = 0;

  for (const phase of phases) {
    console.log(`\n=== sync-hash (${phase.label})${dryRun ? " [dry-run]" : ""} ===`);
    const files = await collectEnglishFiles(phase.snippetsMode, phase.fileArgs);
    if (files.length === 0) {
      console.log(`No ${phase.label} files to process.`);
      continue;
    }

    for (const relPath of files) {
      let fileHasDrift = false;
      for (const lang of selectedLangs) {
        const { enPath, targetPath } = makeMapping(lang, relPath, phase.snippetsMode);
        const enContent = await readFileOr(enPath);
        const targetContent = await readFileOr(targetPath);
        if (!enContent || enContent.length < 50) continue;
        if (!allFiles && fileArgs.length === 0 && !needsHashSync(enContent, targetContent, relPath, phase.snippetsMode)) {
          continue;
        }
        fileHasDrift = true;
      }

      if (!fileHasDrift && fileArgs.length === 0 && !allFiles) continue;

      if (fileHasDrift || fileArgs.length > 0 || allFiles) {
        console.log(`${relPath}${phase.snippetsMode ? " (snippet)" : ""}:`);
      }

      for (const lang of selectedLangs) {
        const { enPath, targetPath } = makeMapping(lang, relPath, phase.snippetsMode);
        const enContent = await readFileOr(enPath);
        const targetContent = await readFileOr(targetPath);
        if (!enContent || enContent.length < 50) continue;
        if (!allFiles && fileArgs.length === 0 && !needsHashSync(enContent, targetContent, relPath, phase.snippetsMode)) {
          totalUnchanged++;
          continue;
        }

        const result = await syncOneFile(relPath, lang, phase.snippetsMode, dryRun, verify);
        if (result.status === "updated") totalUpdated++;
        else if (result.status === "unchanged") {
          if (fileArgs.length > 0 || allFiles) {
            const { targetRel } = makeMapping(lang, relPath, phase.snippetsMode);
            console.log(`  [${lang.code}] already in sync: ${targetRel}`);
          }
          totalUnchanged++;
        }
        else if (result.status === "missing") totalMissing++;
        totalWarnings += result.warnings.length;
      }
    }
  }

  console.log(
    `\nDone: ${totalUpdated} updated, ${totalUnchanged} already in sync, ${totalMissing} missing target(s)` +
      (totalWarnings > 0 ? `, ${totalWarnings} warning(s)` : "")
  );

  if (dryRun && totalUpdated === 0 && totalMissing === 0) {
    console.log("Nothing to sync. Hashes already match English source.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
