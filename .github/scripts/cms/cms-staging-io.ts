/**
 * Shared read/write helpers for CMS staging MDX (per-version checkpoint).
 */

import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  parseDocument,
  serializeUpdateBlocksDocument,
  sortUpdateBlocksByVersion,
} from "../i18n/chunked-translate.ts";
import { parseChangelogUpdates } from "./changelog-parse.ts";
import { configForProject, type CmsConfig } from "./cms-config.ts";
import { isEnoent, ROOT } from "./cms-env.ts";

export const STAGING_FRONTMATTER = `---
title: "Changelog (CMS staging)"
cmsStaging: true
---

`;

export function stagingHasVersion(content: string, version: string): boolean {
  return parseChangelogUpdates(content).some((e) => e.version === version);
}

export function mergeStagingBlocks(
  existingContent: string,
  newBlocks: Array<{ label: string; content: string }>
): string {
  const existing = existingContent.trim()
    ? parseDocument(existingContent, "update_blocks").blocks
    : [];
  const byLabel = new Map(existing.map((b) => [b.label, b.content]));
  for (const b of newBlocks) {
    byLabel.set(b.label, b.content);
  }
  const merged = sortUpdateBlocksByVersion(
    [...byLabel.entries()].map(([label, content]) => ({
      label,
      content,
      hash: "",
    }))
  );
  return serializeUpdateBlocksDocument(STAGING_FRONTMATTER, merged);
}

export async function readStaging(relPath: string): Promise<string> {
  try {
    return await readFile(join(ROOT, relPath), "utf-8");
  } catch (error) {
    if (isEnoent(error)) return "";
    throw error;
  }
}

export async function writeStagingCheckpoint(
  relPath: string,
  existingContent: string,
  block: { label: string; content: string }
): Promise<string> {
  const targetPath = join(ROOT, relPath);
  const output = mergeStagingBlocks(existingContent, [block]);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, output);
  return output;
}

/** Copy all locale staging files from one project to another (same changelog body). */
export async function copyProjectStaging(
  baseConfig: CmsConfig,
  fromProject: string,
  toProject: string
): Promise<number> {
  const fromConfig = configForProject(baseConfig, fromProject);
  const toConfig = configForProject(baseConfig, toProject);
  let copied = 0;

  for (const locale of fromConfig.locales) {
    if (!locale.changelog) continue;
    const toLocale = toConfig.locales.find((l) => l.code === locale.code);
    if (!toLocale?.changelog) continue;

    const fromPath = join(ROOT, locale.changelog);
    const toPath = join(ROOT, toLocale.changelog);
    try {
      await readFile(fromPath, "utf-8");
    } catch {
      continue;
    }
    await mkdir(dirname(toPath), { recursive: true });
    await copyFile(fromPath, toPath);
    copied++;
  }

  return copied;
}

export function blockForVersion(
  content: string,
  version: string
): { label: string; updateBlock: string; body: string } | null {
  const entry = parseChangelogUpdates(content).find((e) => e.version === version);
  if (!entry) return null;
  const label = `v${entry.version}`;
  const body = entry.body;
  const updateBlock = `<Update label="${label}" description="${entry.date}">\n\n${body}\n\n</Update>`;
  return { label, updateBlock, body };
}
