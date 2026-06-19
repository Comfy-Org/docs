import { execFileSync } from "child_process";
import {
  meetsMinVersion,
  parseChangelogUpdates,
  versionsFromGitDiff,
  type ReleaseNoteEntry,
} from "./changelog-parse.ts";
import { getSectionSyncStatus } from "../i18n/chunked-translate.ts";
import { ROOT } from "./cms-env.ts";

export function gitDiffChangelog(before: string, after: string): string {
  return execFileSync("git", ["diff", before, after, "--", "changelog/index.mdx"], {
    encoding: "utf-8",
    cwd: ROOT,
  });
}

export function incrementalVersionSet(): Set<string> | null {
  const before = process.env.CMS_SYNC_BEFORE?.trim();
  const after = process.env.CMS_SYNC_AFTER?.trim();
  if (!before || !after) return null;
  const diff = gitDiffChangelog(before, after);
  const versions = versionsFromGitDiff(diff);
  return versions.length > 0 ? new Set(versions) : new Set();
}

export function resolveTargetVersions(
  entries: ReleaseNoteEntry[],
  minVersion: string,
  explicitVersions: string[],
  incremental: Set<string> | null
): ReleaseNoteEntry[] {
  let filtered = entries.filter((e) => meetsMinVersion(e.version, minVersion));

  if (explicitVersions.length > 0) {
    const wanted = new Set(explicitVersions);
    filtered = filtered.filter((e) => wanted.has(e.version));
  } else if (incremental && incremental.size > 0) {
    filtered = filtered.filter((e) => incremental.has(e.version));
  }

  return filtered;
}

export function versionLabelsFromEntries(entries: ReleaseNoteEntry[]): string[] {
  return entries.map((e) => e.version);
}

/** Pending `<Update>` labels (e.g. v0.25.1) for target semver versions. */
export function pendingLabelsForVersions(
  enContent: string,
  targetContent: string,
  targetVersions: string[],
  langCode: string
): string[] {
  const status = getSectionSyncStatus(enContent, targetContent, "update_blocks", false, langCode);
  const wanted = new Set(targetVersions);
  return status.pendingBlocks.filter((label) => {
    const v = label.replace(/^v/i, "");
    return wanted.has(v);
  });
}
