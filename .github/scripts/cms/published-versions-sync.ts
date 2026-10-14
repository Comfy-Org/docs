import type { CmsConfig } from "./cms-config.ts";
import { listProjectIds, projectMinVersion } from "./cms-config.ts";
import { meetsMinVersion } from "./changelog-parse.ts";
import {
  loadPublishedVersions,
  mergePublishedEntries,
  savePublishedVersions,
  type PublishedEntry,
} from "./published-versions.ts";
import type { StrapiClient } from "./strapi-client.ts";

export function entryKey(e: PublishedEntry): string {
  return `${e.project}:${e.version}:${(e.locales ?? []).join(",")}`;
}

export async function fetchPublishedFromCms(
  client: StrapiClient,
  config: CmsConfig,
  project: string
): Promise<PublishedEntry[]> {
  const minVersion = projectMinVersion(config, project);
  const localeCodes = config.locales.map((l) => l.code);
  const byVersion = new Map<string, PublishedEntry>();

  for (const locale of localeCodes) {
    const docs = await client.listAll(config.content_type_plural, {
      status: "published",
      locale,
      filters: { [config.project_field]: project },
      sort: `${config.version_field}:desc`,
    });

    for (const doc of docs) {
      const version = String(doc[config.version_field] ?? "");
      if (!version || !meetsMinVersion(version, minVersion)) continue;

      const key = `${project}:${version}`;
      const existing = byVersion.get(key);
      const publishedAt = doc.publishedAt ? String(doc.publishedAt) : undefined;

      if (!existing) {
        byVersion.set(key, {
          project,
          version,
          locales: [locale],
          published_at: publishedAt,
        });
        continue;
      }

      const locales = new Set(existing.locales ?? []);
      locales.add(locale);
      byVersion.set(key, {
        ...existing,
        locales: [...locales].sort(),
        published_at: publishedAt ?? existing.published_at,
      });
    }
  }

  return [...byVersion.values()].sort((a, b) =>
    a.version.localeCompare(b.version, undefined, { numeric: true })
  );
}

export interface RegistrySyncResult {
  fromCms: PublishedEntry[];
  merged: PublishedEntry[];
  added: PublishedEntry[];
  removed: PublishedEntry[];
  previousCount: number;
}

export async function syncPublishedVersionsFromCms(
  client: StrapiClient,
  config: CmsConfig,
  options: { projects?: string[] } = {}
): Promise<RegistrySyncResult> {
  const projects = options.projects?.length ? options.projects : listProjectIds(config);
  const fromCms: PublishedEntry[] = [];

  for (const projectId of projects) {
    const entries = await fetchPublishedFromCms(client, config, projectId);
    fromCms.push(...entries);
  }

  const current = await loadPublishedVersions();
  const projectSet = new Set(projects);
  const unchangedOutsideScan = current.published.filter((e) => !projectSet.has(e.project));
  const merged = mergePublishedEntries(unchangedOutsideScan, fromCms);

  const currentKeys = new Set(current.published.map(entryKey));
  const mergedKeys = new Set(merged.map(entryKey));
  const added = merged.filter((e) => !currentKeys.has(entryKey(e)));
  const removed = current.published.filter((e) => !mergedKeys.has(entryKey(e)));

  return { fromCms, merged, added, removed, previousCount: current.published.length };
}

export function printRegistrySyncResult(result: RegistrySyncResult, projects: string[]): void {
  console.log(`CMS published scanned: ${result.fromCms.length} (projects: ${projects.join(", ")})`);
  console.log(`Registry entries: ${result.previousCount} → ${result.merged.length}`);

  if (result.added.length > 0) {
    console.log("\nNew entries to add:");
    for (const e of result.added) {
      const loc = e.locales?.join(", ") ?? "all";
      console.log(`  + ${e.project}/v${e.version} [${loc}]`);
    }
  }
  if (result.removed.length > 0) {
    console.log("\nEntries no longer in registry merge:");
    for (const e of result.removed) {
      console.log(`  - ${e.project}/v${e.version}`);
    }
  }
  if (result.added.length === 0 && result.removed.length === 0) {
    console.log("\nRegistry is up to date with CMS.");
  }
}

export async function writePublishedVersionsRegistry(merged: PublishedEntry[]): Promise<void> {
  await savePublishedVersions({ published: merged });
  console.log(`\nWrote ${merged.length} entries → published-versions.json`);
}
