import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface PublishedEntry {
  project: string;
  version: string;
  locales?: string[];
  published_at?: string;
  note?: string;
}

export interface PublishedVersionsFile {
  published: PublishedEntry[];
}

const CMS_DIR = import.meta.dir;

export function publishedVersionsPath(): string {
  return join(CMS_DIR, "published-versions.json");
}

export async function loadPublishedVersions(): Promise<PublishedVersionsFile> {
  const raw = await readFile(publishedVersionsPath(), "utf-8");
  return JSON.parse(raw) as PublishedVersionsFile;
}

export async function savePublishedVersions(data: PublishedVersionsFile): Promise<void> {
  await writeFile(publishedVersionsPath(), `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function isEnPublishedInRegistry(
  registry: PublishedVersionsFile,
  project: string,
  version: string
): boolean {
  return isPublishedInRegistry(registry, project, version, "en");
}

/** Changelog entries whose English release note is not in published-versions.json. */
export function filterUnpublishedEnEntries<T extends { version: string }>(
  registry: PublishedVersionsFile,
  project: string,
  entries: T[]
): T[] {
  return entries.filter((e) => !isEnPublishedInRegistry(registry, project, e.version));
}

export function isPublishedInRegistry(
  registry: PublishedVersionsFile,
  project: string,
  version: string,
  locale: string
): boolean {
  for (const entry of registry.published) {
    if (entry.project !== project || entry.version !== version) continue;
    if (!entry.locales || entry.locales.length === 0) return true;
    if (entry.locales.includes(locale)) return true;
  }
  return false;
}

/** Merge entries; newer published_at wins for same project+version. */
export function mergePublishedEntries(
  existing: PublishedEntry[],
  incoming: PublishedEntry[]
): PublishedEntry[] {
  const byKey = new Map<string, PublishedEntry>();
  for (const e of existing) {
    byKey.set(`${e.project}:${e.version}`, e);
  }
  for (const e of incoming) {
    const key = `${e.project}:${e.version}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, e);
      continue;
    }
    const prevLocales = new Set(prev.locales ?? []);
    const nextLocales = new Set(e.locales ?? []);
    const mergedLocales =
      prevLocales.size === 0 || nextLocales.size === 0
        ? undefined
        : [...new Set([...prevLocales, ...nextLocales])].sort();
    byKey.set(key, {
      project: e.project,
      version: e.version,
      locales: mergedLocales,
      published_at: e.published_at ?? prev.published_at,
      note: e.note ?? prev.note,
    });
  }
  return [...byKey.values()].sort((a, b) => {
    const v = a.version.localeCompare(b.version, undefined, { numeric: true });
    if (v !== 0) return v;
    return a.project.localeCompare(b.project);
  });
}
