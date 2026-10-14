export interface ReleaseNoteEntry {
  version: string;
  date: string;
  body: string;
}

export function normalizeVersion(label: string): string {
  return label.replace(/^v/i, "").trim();
}

export function parseChangelogUpdates(content: string): ReleaseNoteEntry[] {
  const entries: ReleaseNoteEntry[] = [];
  const re = /<Update\s+label="([^"]+)"\s+description="([^"]+)"\s*>([\s\S]*?)<\/Update>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    entries.push({
      version: normalizeVersion(match[1]!),
      date: match[2]!.trim(),
      body: match[3]!.trim(),
    });
  }
  return entries;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function meetsMinVersion(version: string, minVersion: string): boolean {
  return compareSemver(version, minVersion) >= 0;
}

/** Versions added in a git diff hunk for changelog/index.mdx (+ lines only). */
export function versionsFromGitDiff(diff: string): string[] {
  const found = new Set<string>();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const m = line.match(/<Update\s+label="([^"]+)"/);
    if (m) found.add(normalizeVersion(m[1]!));
  }
  return [...found];
}
