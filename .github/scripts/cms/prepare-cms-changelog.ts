#!/usr/bin/env bun
/**
 * Prepare CMS changelog: LLM-simplify EN → staging, then translate to all locales.
 *
 * Usage:
 *   pnpm cms:prepare           # comfyui + cloud (cloud copies comfyui staging)
 *   pnpm cms:prepare --preview
 *   pnpm cms:prepare -- v0.25.1
 *   pnpm cms:prepare -- --project cloud   # single project only
 *
 * Staging output:
 *   comfyui → .github/scripts/cms/staging/{en,zh,…}/changelog/index.mdx
 *   cloud   → .github/scripts/cms/staging/cloud/{en,zh,…}/changelog/index.mdx
 * Docs changelog (full) is NOT modified — only staging copies for CMS.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { compareSemver, parseChangelogUpdates } from "./changelog-parse.ts";
import { resolveProjects, stripProjectArg } from "./cms-args.ts";
import {
  configForProject,
  englishStagingLocale,
  loadCmsConfig,
  translateLocales,
} from "./cms-config.ts";
import { loadEnvLocal, ROOT } from "./cms-env.ts";
import {
  filterUnpublishedEnEntries,
  loadPublishedVersions,
} from "./published-versions.ts";
import { prepareSimplifiedEnglish } from "./cms-simplify-en.ts";
import { readStaging, copyProjectStaging } from "./cms-staging-io.ts";
import { prepareStagingLocale } from "./cms-staging-translate.ts";
import { translateEnvSummary } from "./cms-translate-client.ts";
import {
  incrementalVersionSet,
  resolveTargetVersions,
  versionLabelsFromEntries,
} from "./cms-versions.ts";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  force: boolean;
  enOnly: boolean;
  versions: string[];
} {
  let dryRun = false;
  let force = false;
  let enOnly = false;
  const versions: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "--preview") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg === "--en-only") enOnly = true;
    else if (!arg.startsWith("-")) versions.push(arg.replace(/^v/i, ""));
  }
  return { dryRun, force, enOnly, versions };
}

async function prepareForProject(
  baseConfig: Awaited<ReturnType<typeof loadCmsConfig>>,
  projectId: string,
  dryRun: boolean,
  force: boolean,
  enOnly: boolean,
  explicitVersions: string[]
): Promise<void> {
  const config = configForProject(baseConfig, projectId);

  const docsEnPath = join(ROOT, config.docs_en);
  const docsEnContent = await readFile(docsEnPath, "utf-8");
  const allEnEntries = parseChangelogUpdates(docsEnContent);

  const incremental = incrementalVersionSet();
  if (incremental && incremental.size === 0 && explicitVersions.length === 0) {
    console.log(`[${projectId}] No new <Update> blocks — nothing to prepare.`);
    return;
  }

  const targetEntries = resolveTargetVersions(
    allEnEntries,
    config.min_version,
    explicitVersions,
    incremental
  );

  let entriesToPrepare = targetEntries;
  if (!incremental && explicitVersions.length === 0 && !process.env.CMS_SYNC_ALL?.trim()) {
    const registry = await loadPublishedVersions();
    const unpublished = filterUnpublishedEnEntries(registry, projectId, targetEntries);
    if (unpublished.length > 0) {
      entriesToPrepare = unpublished;
      console.log(
        `[${projectId}] Local prepare: ${unpublished.length} unpublished EN version(s): ` +
          `${versionLabelsFromEntries(unpublished).join(", ")}. ` +
          `Use CMS_SYNC_ALL=1 to include already-published versions.`
      );
    } else {
      const pending = [...targetEntries].sort((a, b) => compareSemver(b.version, a.version));
      const newest = pending[0];
      if (newest) {
        entriesToPrepare = [newest];
        console.log(
          `[${projectId}] Local prepare: all EN published in registry — latest v${newest.version} only.`
        );
      }
    }
  }

  if (entriesToPrepare.length === 0) {
    console.log(`[${projectId}] No versions to prepare (min=${config.min_version}).`);
    return;
  }

  const targetVersions = versionLabelsFromEntries(entriesToPrepare);
  console.log(
    `[${projectId}] ${dryRun ? "Would prepare" : "Preparing"} CMS staging for: ${targetVersions.join(", ")}`
  );

  const { simplified, skipped: enSkipped } = await prepareSimplifiedEnglish(
    config,
    entriesToPrepare,
    docsEnContent,
    dryRun,
    force
  );

  const enStagingPath = englishStagingLocale(config).changelog!;
  const simplifiedEnContent = dryRun ? docsEnContent : await readStaging(enStagingPath);

  let translated = 0;
  let translateSkipped = 0;

  if (!enOnly) {
    for (const locale of translateLocales(config)) {
      console.log(`[${projectId}/${locale.code}] translate ← simplified en`);
      const result = await prepareStagingLocale(
        locale,
        entriesToPrepare,
        simplifiedEnContent,
        dryRun,
        force
      );
      translated += result.translated;
      translateSkipped += result.skipped;
    }
  } else {
    console.log(`[${projectId}] [en-only] skipping locale translation`);
  }

  console.log(
    `[${projectId}] Done: en simplified=${simplified} (skipped ${enSkipped})` +
      (enOnly ? "" : `, locales translated=${translated} (skipped ${translateSkipped})`)
  );
  console.log(`[${projectId}] Staging: ${englishStagingLocale(config).changelog}`);
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  const { dryRun, force, enOnly, versions: explicitVersions } = parseArgs(rest);
  const baseConfig = await loadCmsConfig();
  const projects = resolveProjects(baseConfig, cliProject);

  console.log(`${translateEnvSummary()}\n`);
  console.log(`Preparing projects: ${projects.join(", ")}\n`);

  const [primary, ...secondary] = projects;

  await prepareForProject(baseConfig, primary!, dryRun, force, enOnly, explicitVersions);

  for (const projectId of secondary) {
    if (dryRun) {
      console.log(`[${projectId}] Would copy staging from ${primary}`);
    } else {
      const copied = await copyProjectStaging(baseConfig, primary!, projectId);
      console.log(`[${projectId}] Copied ${copied} staging file(s) from ${primary}`);
    }
    if (projects.length > 1) console.log("");
  }
}

main();
