#!/usr/bin/env bun
/**
 * Sync changelog release notes to Strapi CMS as drafts (incremental).
 *
 * Usage:
 *   pnpm cms:preview   # dry-run — show what would sync
 *   pnpm cms:sync      # push drafts to CMS
 *
 * Requires Bun + CMS_BASE_URL / CMS_API_TOKEN (see README.md in this folder).
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { compareSemver, parseChangelogUpdates, type ReleaseNoteEntry } from "./changelog-parse.ts";
import { loadAttentionOverrides, resolveAttention } from "./cms-attention.ts";
import { resolveProjects, stripProjectArg } from "./cms-args.ts";
import { loadCmsConfig, configForProject, projectLabel, type CmsConfig, type LocaleConfig } from "./cms-config.ts";
import { loadEnvLocal, ROOT } from "./cms-env.ts";
import { incrementalVersionSet, resolveTargetVersions } from "./cms-versions.ts";
import {
  filterUnpublishedEnEntries,
  loadPublishedVersions,
  type PublishedVersionsFile,
} from "./published-versions.ts";
import { formatCmsReleaseContent } from "./format-cms-content.ts";
import { StrapiClient, type StrapiDocument } from "./strapi-client.ts";

interface SyncTask {
  project: string;
  version: string;
  locale: string;
  date: string;
  body: string;
  action: "create" | "update" | "update-published" | "skip";
  reason?: string;
}

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Missing ${name}. See .github/scripts/cms/README.md`);
    process.exit(1);
  }
  return val;
}

function parseArgs(argv: string[]): { dryRun: boolean; force: boolean; versions: string[] } {
  let dryRun = false;
  let force = false;
  const versions: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "--preview") dryRun = true;
    else if (arg === "--force") force = true;
    else if (!arg.startsWith("-")) versions.push(arg.replace(/^v/i, ""));
  }
  return { dryRun, force, versions };
}

async function loadAllLocaleEntries(
  locales: LocaleConfig[],
  versionFilter: Set<string> | null
): Promise<Map<string, Map<string, ReleaseNoteEntry>>> {
  const byLocale = new Map<string, Map<string, ReleaseNoteEntry>>();
  for (const locale of locales) {
    if (!locale.changelog) continue;
    let raw = "";
    try {
      raw = await readFile(join(ROOT, locale.changelog), "utf-8");
    } catch {
      byLocale.set(locale.code, new Map());
      continue;
    }
    const map = new Map<string, ReleaseNoteEntry>();
    for (const entry of parseChangelogUpdates(raw)) {
      if (versionFilter && !versionFilter.has(entry.version)) continue;
      map.set(entry.version, entry);
    }
    byLocale.set(locale.code, map);
  }
  return byLocale;
}

async function resolveDocState(
  client: StrapiClient,
  config: CmsConfig,
  project: string,
  version: string,
  locale: string
): Promise<{ published: boolean; draft: StrapiDocument | null; enDocumentId?: string }> {
  const filters = {
    [config.project_field]: project,
    [config.version_field]: version,
  };

  const published = await client.findOne(config.content_type_plural, filters, {
    locale,
    status: "published",
  });
  if (published?.publishedAt) {
    return { published: true, draft: null, enDocumentId: published.documentId };
  }

  const draft = await client.findOne(config.content_type_plural, filters, {
    locale,
    status: "draft",
  });

  let enDocumentId: string | undefined;
  if (locale !== "en") {
    const enDraft = await client.findOne(config.content_type_plural, filters, {
      locale: "en",
      status: "draft",
    });
    const enPublished = await client.findOne(config.content_type_plural, filters, {
      locale: "en",
      status: "published",
    });
    enDocumentId = enDraft?.documentId ?? enPublished?.documentId;
  } else {
    enDocumentId = draft?.documentId;
  }

  return { published: false, draft, enDocumentId };
}

async function findEnglishDocumentId(
  client: StrapiClient,
  config: CmsConfig,
  project: string,
  version: string,
  cache: Map<string, string>
): Promise<string | undefined> {
  const cached = cache.get(version);
  if (cached) return cached;

  const filters = {
    [config.project_field]: project,
    [config.version_field]: version,
  };
  const enDraft = await client.findOne(config.content_type_plural, filters, {
    locale: "en",
    status: "draft",
  });
  if (enDraft?.documentId) {
    cache.set(version, enDraft.documentId);
    return enDraft.documentId;
  }
  const enPublished = await client.findOne(config.content_type_plural, filters, {
    locale: "en",
    status: "published",
  });
  if (enPublished?.documentId) {
    cache.set(version, enPublished.documentId);
    return enPublished.documentId;
  }
  return undefined;
}

function buildPayload(
  config: CmsConfig,
  task: SyncTask,
  content: string,
  attention: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [config.content_field]: content,
    [config.project_field]: task.project,
    [config.version_field]: task.version,
  };
  if (task.locale === "en") {
    payload[config.attention_field] = attention;
  }
  return payload;
}

function sortSyncTasks(tasks: SyncTask[]): SyncTask[] {
  return [...tasks].sort((a, b) => {
    if (a.action === "skip" && b.action !== "skip") return 1;
    if (b.action === "skip" && a.action !== "skip") return -1;
    // Oldest version first; within each version: en → other locales
    const v = compareSemver(a.version, b.version);
    if (v !== 0) return v;
    if (a.locale === "en" && b.locale !== "en") return -1;
    if (b.locale === "en" && a.locale !== "en") return 1;
    return a.locale.localeCompare(b.locale);
  });
}

async function planSync(
  client: StrapiClient,
  config: CmsConfig,
  project: string,
  targetVersions: ReleaseNoteEntry[],
  byLocale: Map<string, Map<string, ReleaseNoteEntry>>,
  force = false
): Promise<SyncTask[]> {
  const tasks: SyncTask[] = [];

  for (const base of targetVersions) {
    for (const locale of config.locales) {
      if (!locale.changelog) continue;

      const entry = byLocale.get(locale.code)?.get(base.version);
      if (!entry) {
        tasks.push({
          project,
          version: base.version,
          locale: locale.code,
          date: base.date,
          body: "",
          action: "skip",
          reason: "no changelog entry for locale",
        });
        continue;
      }

      const state = await resolveDocState(client, config, project, base.version, locale.code);
      if (state.published) {
        tasks.push({
          project,
          version: base.version,
          locale: locale.code,
          date: entry.date,
          body: entry.body,
          action: force ? "update-published" : "skip",
          reason: force ? undefined : "published (CMS)",
        });
        continue;
      }

      // CMS is source of truth — do not skip on registry alone (stale registry strand).

      const enInChangelog = byLocale.get("en")?.has(base.version) ?? false;

      if (locale.code !== "en" && !state.enDocumentId && !enInChangelog) {
        tasks.push({
          project,
          version: base.version,
          locale: locale.code,
          date: entry.date,
          body: entry.body,
          action: "skip",
          reason: "no English changelog entry",
        });
        continue;
      }

      tasks.push({
        project,
        version: base.version,
        locale: locale.code,
        date: entry.date,
        body: entry.body,
        action: state.draft ? "update" : "create",
      });
    }
  }

  return tasks;
}

function printTasks(tasks: SyncTask[], dryRun: boolean): void {
  const actionable = tasks.filter((t) => t.action !== "skip");
  const skipped = tasks.filter((t) => t.action === "skip");

  console.log(`${dryRun ? "Would sync" : "Syncing"} ${actionable.length} draft(s):\n`);
  for (const t of actionable) {
    console.log(`  ${t.action.toUpperCase().padEnd(6)} ${t.project}/v${t.version} [${t.locale}]`);
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const t of skipped) {
      console.log(`  SKIP   ${t.project}/v${t.version} [${t.locale}] — ${t.reason}`);
    }
  }
}

async function executeTasks(
  client: StrapiClient,
  config: CmsConfig,
  tasks: SyncTask[],
  attentionOverrides: Awaited<ReturnType<typeof loadAttentionOverrides>>
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  // Oldest version first; en before other locales within each version
  const sorted = sortSyncTasks(tasks);

  const enDocumentIds = new Map<string, string>();

  for (const task of sorted) {
    if (task.action === "skip") continue;

    const content = formatCmsReleaseContent(
      projectLabel(config, task.project),
      task.version,
      task.body
    );
    const attention = resolveAttention(config, task.project, task.version, attentionOverrides);
    const payload = buildPayload(config, task, content, attention);

    try {
      if (task.action === "create") {
        if (task.locale === "en") {
          const doc = await client.create(config.content_type_plural, payload, {
            locale: "en",
            status: "draft",
          });
          enDocumentIds.set(task.version, doc.documentId);
        } else {
          const enId = await findEnglishDocumentId(
            client,
            config,
            task.project,
            task.version,
            enDocumentIds
          );
          if (!enId) throw new Error("English base missing (no draft or published en entry)");
          await client.update(config.content_type_plural, enId, payload, {
            locale: task.locale,
            status: "draft",
          });
        }
        ok++;
        console.log(`Created  ${task.project}/v${task.version} [${task.locale}] (draft)`);
      } else {
        const draft = await client.findOne(
          config.content_type_plural,
          {
            [config.project_field]: task.project,
            [config.version_field]: task.version,
          },
          { locale: task.locale, status: "draft" }
        );
        if (!draft?.documentId) throw new Error("draft not found for update");
        await client.update(config.content_type_plural, draft.documentId, payload, {
          locale: task.locale,
          status: "draft",
        });
        ok++;
        console.log(`Updated  ${task.project}/v${task.version} [${task.locale}] (draft)`);
      } else if (task.action === "update-published") {
        const published = await client.findOne(
          config.content_type_plural,
          {
            [config.project_field]: task.project,
            [config.version_field]: task.version,
          },
          { locale: task.locale, status: "published" }
        );
        if (!published?.documentId) throw new Error("published entry not found for update");
        await client.update(config.content_type_plural, published.documentId, payload, {
          locale: task.locale,
          status: "published",
        });
        ok++;
        console.log(`Updated  ${task.project}/v${task.version} [${task.locale}] (published)`);
      }
    } catch (err) {
      failed++;
      console.error(
        `Failed   ${task.project}/v${task.version} [${task.locale}]: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  return { ok, failed };
}

async function syncProject(
  baseConfig: CmsConfig,
  project: string,
  explicitVersions: string[],
  dryRun: boolean,
  force: boolean,
  client: StrapiClient,
  registry: PublishedVersionsFile,
  attentionOverrides: Awaited<ReturnType<typeof loadAttentionOverrides>>
): Promise<{ ok: number; failed: number }> {
  const config = configForProject(baseConfig, project);

  const enRaw = await readFile(join(ROOT, config.docs_en), "utf-8");
  const allEnEntries = parseChangelogUpdates(enRaw);

  const incrementalVersions = incrementalVersionSet();
  if (incrementalVersions && incrementalVersions.size === 0 && explicitVersions.length === 0) {
    console.log(`[${project}] No new <Update> blocks — nothing to sync.`);
    return { ok: 0, failed: 0 };
  }

  const targetEntries = resolveTargetVersions(
    allEnEntries,
    config.min_version,
    explicitVersions,
    incrementalVersions
  );

  let entriesToSync = targetEntries;
  if (
    !incrementalVersions &&
    explicitVersions.length === 0 &&
    !process.env.CMS_SYNC_ALL?.trim()
  ) {
    const unpublished = filterUnpublishedEnEntries(registry, project, targetEntries);
    if (unpublished.length > 0) {
      entriesToSync = unpublished;
      console.log(
        `[${project}] ${unpublished.length} unpublished EN version(s): ` +
          `${unpublished.map((e) => e.version).join(", ")}`
      );
    } else {
      const pending = [...targetEntries].sort((a, b) => compareSemver(b.version, a.version));
      const newest = pending[0];
      if (newest) {
        entriesToSync = [newest];
        console.log(`[${project}] all EN published — latest v${newest.version} only.`);
      }
    }
  }

  if (entriesToSync.length === 0) {
    console.log(`[${project}] No versions to sync (min=${config.min_version}).`);
    return { ok: 0, failed: 0 };
  }

  const versionFilter = new Set(entriesToSync.map((e) => e.version));
  const byLocale = await loadAllLocaleEntries(config.locales, versionFilter);

  console.log(
    `[${project}] ${dryRun ? "Would sync" : "Syncing"} versions=[${[...versionFilter].join(", ")}], ` +
      `locales=[${config.locales.filter((l) => l.changelog).map((l) => l.code).join(", ")}]\n`
  );

  const tasks = await planSync(client, config, project, entriesToSync, byLocale, force);
  printTasks(tasks, dryRun);

  if (dryRun) return { ok: 0, failed: 0 };

  return executeTasks(
    client,
    config,
    tasks.filter((t) => t.action !== "skip"),
    attentionOverrides
  );
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  const { dryRun, force, versions: explicitVersions } = parseArgs(rest);
  const baseConfig = await loadCmsConfig();
  const projects = resolveProjects(baseConfig, cliProject);
  const registry = await loadPublishedVersions();
  const attentionOverrides = await loadAttentionOverrides();

  const client = new StrapiClient(requireEnv("CMS_BASE_URL"), requireEnv("CMS_API_TOKEN"));

  const ping = await client.ping(baseConfig.content_type_plural);
  if (!ping.ok) {
    console.error(`CMS unreachable: ${ping.error}`);
    process.exit(1);
  }

  console.log(
    `CMS ${baseConfig.content_type_plural} — projects=[${projects.join(", ")}], ` +
      `min=${baseConfig.min_version}\n`
  );

  let totalOk = 0;
  let totalFailed = 0;

  for (const projectId of projects) {
    const { ok, failed } = await syncProject(
      baseConfig,
      projectId,
      explicitVersions,
      dryRun,
      force,
      client,
      registry,
      attentionOverrides
    );
    totalOk += ok;
    totalFailed += failed;
    if (projects.length > 1) console.log("");
  }

  if (!dryRun) {
    console.log(`\nDone: ${totalOk} synced, ${totalFailed} failed`);
    if (totalFailed > 0) process.exit(1);
  }
}

main();
