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

function validatePublishedVersionsFile(data: unknown): PublishedVersionsFile {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("published-versions.json: expected object");
  }
  const published = (data as { published?: unknown }).published;
  if (!Array.isArray(published)) {
    throw new Error("published-versions.json: expected { published: [...] }");
  }
  for (const entry of published) {
    if (!entry || typeof entry !== "object") {
      throw new Error("published-versions.json: invalid entry");
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.project !== "string" || typeof e.version !== "string") {
      throw new Error("published-versions.json: entry missing project/version");
    }
    if (e.locales != null) {
      if (!Array.isArray(e.locales)) {
        throw new Error("published-versions.json: entry locales must be array");
      }
      for (const loc of e.locales) {
        if (typeof loc !== "string") {
          throw new Error("published-versions.json: locale must be string");
        }
      }
    }
  }
  return data as PublishedVersionsFile;
}

export async function loadPublishedVersions(): Promise<PublishedVersionsFile> {
  const raw = await readFile(publishedVersionsPath(), "utf-8");
  return validatePublishedVersionsFile(JSON.parse(raw));
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
