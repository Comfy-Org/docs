#!/usr/bin/env bun
/**
 * Publish Strapi release-note drafts → live (after manual review).
 *
 * Usage:
 *   pnpm cms:publish --preview -- v0.25.1
 *   pnpm cms:publish -- v0.25.1              # publishes + refreshes published-versions.json
 *   pnpm cms:publish -- v0.25.1 --no-registry # skip JSON refresh
 *   pnpm cms:publish -- --yes              # all unpublished versions with EN drafts
 */

import { compareSemver } from "./changelog-parse.ts";
import { resolveProjects, stripProjectArg } from "./cms-args.ts";
import { loadCmsConfig, type CmsConfig } from "./cms-config.ts";
import { loadEnvLocal } from "./cms-env.ts";
import {
  docProject,
  docVersion,
  isValidCmsVersion,
} from "./cms-strapi-utils.ts";
import {
  filterUnpublishedEnEntries,
  loadPublishedVersions,
} from "./published-versions.ts";
import {
  printRegistrySyncResult,
  syncPublishedVersionsFromCms,
  writePublishedVersionsRegistry,
} from "./published-versions-sync.ts";
import { StrapiClient } from "./strapi-client.ts";

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Missing ${name}. See .github/scripts/cms/README.md`);
    process.exit(1);
  }
  return val;
}

function parseArgs(argv: string[]): {
  dryRun: boolean;
  skipRegistry: boolean;
  yes: boolean;
  versions: string[];
} {
  let dryRun = false;
  let skipRegistry = false;
  let yes = false;
  const versions: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "--preview") dryRun = true;
    else if (arg === "--no-registry" || arg === "--skip-registry") skipRegistry = true;
    else if (arg === "--write-registry") {
      // Back-compat: registry refresh is now default; flag is ignored.
    }
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (!arg.startsWith("-")) versions.push(arg.replace(/^v/i, ""));
  }
  return { dryRun, skipRegistry, yes, versions };
}

async function discoverEnDrafts(
  client: StrapiClient,
  config: CmsConfig,
  project: string
): Promise<Map<string, string>> {
  const docs = await client.listAll(config.content_type_plural, {
    status: "draft",
    locale: "en",
    filters: { [config.project_field]: project },
    pageSize: 100,
  });

  const byVersion = new Map<string, string>();
  for (const doc of docs) {
    const version = docVersion(doc, config);
    if (!isValidCmsVersion(version, config.min_version)) continue;
    if (docProject(doc, config) !== project) continue;
    byVersion.set(version, doc.documentId);
  }
  return byVersion;
}

interface PublishTask {
  project: string;
  version: string;
  locale: string;
  documentId: string;
  action: "publish" | "skip";
  reason?: string;
}

async function planPublish(
  client: StrapiClient,
  config: CmsConfig,
  project: string,
  versionDocumentIds: Map<string, string>
): Promise<PublishTask[]> {
  const tasks: PublishTask[] = [];

  for (const version of [...versionDocumentIds.keys()].sort((a, b) => compareSemver(a, b))) {
    const documentId = versionDocumentIds.get(version)!;

    for (const locale of config.locales) {
      const draft = await client.getDocument(config.content_type_plural, documentId, {
        locale: locale.code,
        status: "draft",
      });

      if (!draft) {
        const published = await client.getDocument(config.content_type_plural, documentId, {
          locale: locale.code,
          status: "published",
        });
        tasks.push({
          project,
          version,
          locale: locale.code,
          documentId,
          action: "skip",
          reason: published?.publishedAt ? "already published" : "no draft",
        });
        continue;
      }

      tasks.push({
        project,
        version,
        locale: locale.code,
        documentId,
        action: "publish",
      });
    }
  }

  return tasks;
}

function sortTasks(tasks: PublishTask[]): PublishTask[] {
  return [...tasks].sort((a, b) => {
    if (a.action === "skip" && b.action !== "skip") return 1;
    if (b.action === "skip" && a.action !== "skip") return -1;
    const v = compareSemver(a.version, b.version);
    if (v !== 0) return v;
    if (a.locale === "en" && b.locale !== "en") return -1;
    if (b.locale === "en" && a.locale !== "en") return 1;
    return a.locale.localeCompare(b.locale);
  });
}

async function resolveTargetVersions(
  client: StrapiClient,
  config: CmsConfig,
  project: string,
  explicitVersions: string[]
): Promise<Map<string, string>> {
  const enDrafts = await discoverEnDrafts(client, config, project);

  if (explicitVersions.length > 0) {
    const filtered = new Map<string, string>();
    for (const v of explicitVersions) {
      const documentId = enDrafts.get(v);
      if (documentId) filtered.set(v, documentId);
    }
    return filtered;
  }

  if (process.env.CMS_PUBLISH_ALL?.trim()) {
    return enDrafts;
  }

  const registry = await loadPublishedVersions();
  const unpublished = filterUnpublishedEnEntries(
    registry,
    project,
    [...enDrafts.entries()].map(([version]) => ({ version }))
  );
  const unpublishedSet = new Set(unpublished.map((e) => e.version));
  const filtered = new Map<string, string>();
  for (const [version, documentId] of enDrafts) {
    if (unpublishedSet.has(version)) filtered.set(version, documentId);
  }
  return filtered;
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  const { dryRun, skipRegistry, yes, versions: explicitVersions } = parseArgs(rest);
  const config = await loadCmsConfig();
  const projects = resolveProjects(config, cliProject);
  const client = new StrapiClient(requireEnv("CMS_BASE_URL"), requireEnv("CMS_API_TOKEN"));

  const ping = await client.ping(config.content_type_plural);
  if (!ping.ok) {
    console.error(`CMS unreachable: ${ping.error}`);
    process.exit(1);
  }

  console.log(`Publishing projects: ${projects.join(", ")}\n`);

  let allActionable: PublishTask[] = [];
  let allSkipped: PublishTask[] = [];
  let totalVersions = 0;

  for (const project of projects) {
    const versionDocumentIds = await resolveTargetVersions(
      client,
      config,
      project,
      explicitVersions
    );

    if (versionDocumentIds.size === 0) {
      console.log(`[${project}] No release-note drafts to publish.`);
      continue;
    }

    totalVersions += versionDocumentIds.size;
    const tasks = await planPublish(client, config, project, versionDocumentIds);
    allActionable.push(...tasks.filter((t) => t.action === "publish"));
    allSkipped.push(...tasks.filter((t) => t.action === "skip"));
  }

  if (allActionable.length === 0 && allSkipped.length === 0) {
    console.log("No release-note drafts to publish.");
    return;
  }

  const actionable = sortTasks(allActionable);
  const skipped = allSkipped;

  if (
    !dryRun &&
    explicitVersions.length === 0 &&
    totalVersions > 1 &&
    !yes &&
    !process.env.CMS_PUBLISH_CONFIRM?.trim()
  ) {
    const versions = [...new Set(actionable.map((t) => `${t.project}/v${t.version}`))];
    console.error(
      `Will publish ${versions.length} version(s) across ${projects.length} project(s).\n` +
        `Re-run with --yes or CMS_PUBLISH_CONFIRM=1 to confirm.`
    );
    process.exit(1);
  }

  console.log(
    `${dryRun ? "Would publish" : "Publishing"} ${actionable.length} locale draft(s)\n`
  );

  for (const t of actionable) {
    console.log(`  PUBLISH ${t.project}/v${t.version} [${t.locale}]`);
  }
  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const t of skipped) {
      console.log(`  SKIP   ${t.project}/v${t.version} [${t.locale}] — ${t.reason}`);
    }
  }

  if (dryRun) return;

  let ok = 0;
  let failed = 0;
  for (const task of actionable) {
    try {
      await client.publishLocale(config.content_type_plural, task.documentId, task.locale);
      ok++;
      console.log(`Published ${task.project}/v${task.version} [${task.locale}]`);
    } catch (err) {
      failed++;
      console.error(
        `Failed   ${task.project}/v${task.version} [${task.locale}]: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  console.log(`\nDone: ${ok} published, ${failed} failed`);

  if (!skipRegistry && failed === 0 && ok > 0) {
    console.log("\nRefreshing published-versions.json from CMS (all projects)…");
    try {
      const result = await syncPublishedVersionsFromCms(client, config);
      printRegistrySyncResult(
        result,
        config.projects?.map((p) => p.id) ?? [config.default_project]
      );
      await writePublishedVersionsRegistry(result.merged);
      console.log("Commit published-versions.json if it changed.");
    } catch (err) {
      console.error(
        `Registry refresh failed: ${err instanceof Error ? err.message : err}\n` +
          "Run: bun .github/scripts/cms/update-published-versions.ts --write"
      );
      process.exit(1);
    }
  } else if (skipRegistry && ok > 0) {
    console.log("\nSkipped registry refresh (--no-registry).");
  } else if (failed > 0) {
    console.warn("\nSkipped registry refresh because some publishes failed.");
  }

  if (failed > 0) process.exit(1);
}

main();
