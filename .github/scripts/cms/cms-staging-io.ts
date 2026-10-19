/**
 * Shared read/write helpers for CMS staging MDX (per-version checkpoint).
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  parseDocument,
  serializeUpdateBlocksDocument,
  sortUpdateBlocksByVersion,
} from "../i18n/chunked-translate.ts";
import { normalizeVersion, parseChangelogUpdates } from "./changelog-parse.ts";
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

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function markdownLinksByText(md: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of md.matchAll(MD_LINK_RE)) {
    map.set(match[1]!, match[2]!);
  }
  return map;
}

function isProjectTrackingUrl(url: string): boolean {
  return url.includes("links.comfy.org") || url.includes("cloud.comfy.org");
}

/** Map source-EN URLs onto dest-EN URLs for the same markdown link text. */
export function trackingUrlMap(fromEnBlock: string, toEnBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const fromLinks = markdownLinksByText(fromEnBlock);
  const toLinks = markdownLinksByText(toEnBlock);
  for (const [text, fromUrl] of fromLinks) {
    const toUrl = toLinks.get(text);
    if (toUrl && toUrl !== fromUrl) map.set(fromUrl, toUrl);
  }
  if (map.size === 0) {
    const fromTrack = [...fromLinks.values()].filter(isProjectTrackingUrl);
    const toTrack = [...toLinks.values()].filter(isProjectTrackingUrl);
    if (fromTrack.length === 1 && toTrack.length === 1 && fromTrack[0] !== toTrack[0]) {
      map.set(fromTrack[0]!, toTrack[0]!);
    }
  }
  return map;
}

export function applyUrlMap(md: string, map: Map<string, string>): string {
  if (map.size === 0) return md;
  let out = md;
  const fromUrls = [...map.keys()].sort((a, b) => b.length - a.length);
  for (const from of fromUrls) {
    out = out.split(from).join(map.get(from)!);
  }
  return out;
}

export function remapBlockUsingEnglishUrlMap(
  incomingBlock: string,
  sourceEnBlock: string | null,
  destEnBlock: string | null
): string {
  if (!sourceEnBlock || !destEnBlock) return incomingBlock;
  return applyUrlMap(incomingBlock, trackingUrlMap(sourceEnBlock, destEnBlock));
}

/**
 * Merge selected version blocks from one project's staging into another.
 *
 * Never replaces whole locale files. Snapshot dest EN first and rewrite
 * incoming tracking shortlinks to match dest EN (cloud vs local campaign
 * URLs). Older dest-only versions stay untouched.
 */
export async function copyProjectStaging(
  baseConfig: CmsConfig,
  fromProject: string,
  toProject: string,
  versions: string[]
): Promise<number> {
  const versionList = [
    ...new Set(versions.map((v) => normalizeVersion(v)).filter(Boolean)),
  ];
  if (versionList.length === 0) {
    return 0;
  }

  const fromConfig = configForProject(baseConfig, fromProject);
  const toConfig = configForProject(baseConfig, toProject);
  const fromEnPath = fromConfig.locales.find((l) => l.code === "en")?.changelog;
  const toEnPath = toConfig.locales.find((l) => l.code === "en")?.changelog;
  const fromEnContent = fromEnPath ? await readStaging(fromEnPath) : "";
  const toEnContent = toEnPath ? await readStaging(toEnPath) : "";

  const urlMaps = new Map<string, Map<string, string>>();
  for (const version of versionList) {
    const sourceEn = blockForVersion(fromEnContent, version);
    const destEn = blockForVersion(toEnContent, version);
    if (!sourceEn || !destEn) continue;
    const map = trackingUrlMap(sourceEn.updateBlock, destEn.updateBlock);
    if (map.size > 0) urlMaps.set(version, map);
  }

  let copied = 0;

  for (const locale of fromConfig.locales) {
    if (!locale.changelog) continue;
    const toLocale = toConfig.locales.find((l) => l.code === locale.code);
    if (!toLocale?.changelog) continue;

    const fromContent = await readStaging(locale.changelog);
    if (!fromContent.trim()) continue;

    const blocksToMerge: Array<{ label: string; content: string }> = [];
    for (const version of versionList) {
      const block = blockForVersion(fromContent, version);
      if (!block) continue;
      const map = urlMaps.get(version);
      const content = map ? applyUrlMap(block.updateBlock, map) : block.updateBlock;
      blocksToMerge.push({ label: block.label, content });
    }
    if (blocksToMerge.length === 0) continue;

    const toPath = join(ROOT, toLocale.changelog);
    const existing = await readStaging(toLocale.changelog);
    const output = mergeStagingBlocks(existing, blocksToMerge);
    await mkdir(dirname(toPath), { recursive: true });
    await writeFile(toPath, output);
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
