#!/usr/bin/env bun
/**
 * Prepare CMS changelog staging — two separate steps (run in order):
 *
 *   Step 1 — simplify EN only:
 *     pnpm cms:prepare:en -- --force v0.26.0
 *
 *   Step 2 — translate staging EN → locales (after EN reviewed):
 *     pnpm cms:prepare:locales -- --force v0.26.0
 *
 * Step 3 — push to Strapi is separate: pnpm cms:preview / cms:sync (after user confirms).
 *
 * Flags: --en-only | --translate-only (required via npm scripts or explicit flag)
 *        --force --project cloud --preview v0.26.0
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
import {
  blockForVersion,
  copyProjectStaging,
  readStaging,
} from "./cms-staging-io.ts";
import { prepareStagingLocale } from "./cms-staging-translate.ts";
import { translateEnvSummary } from "./cms-translate-client.ts";
import {
  incrementalVersionSet,
  resolveTargetVersions,
  versionLabelsFromEntries,
} from "./cms-versions.ts";

export type PrepareMode = "en-only" | "translate-only";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  force: boolean;
  mode: PrepareMode | null;
  versions: string[];
} {
  let dryRun = false;
  let force = false;
  let enOnly = false;
  let translateOnly = false;
  const versions: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "--preview") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg === "--en-only") enOnly = true;
    else if (arg === "--translate-only") translateOnly = true;
    else if (!arg.startsWith("-")) versions.push(arg.replace(/^v/i, ""));
  }

  if (enOnly && translateOnly) {
    console.error("Cannot combine --en-only and --translate-only.");
    process.exit(1);
  }

  const mode: PrepareMode | null = enOnly
    ? "en-only"
    : translateOnly
      ? "translate-only"
      : null;

  return { dryRun, force, mode, versions };
}

function printModeHelp(): void {
  console.error(`
CMS staging prepare — run steps in order (user confirms before cms:sync):

  Step 1 — simplify EN popup copy:
    pnpm cms:prepare:en -- --force v0.26.0

  Step 2 — translate staging EN → zh/ja/ko/fr/ru/es (after EN approved):
    pnpm cms:prepare:locales -- --force v0.26.0

  Step 3 — push drafts to Strapi (after all staging reviewed):
    pnpm cms:preview -- v0.26.0
    pnpm cms:sync -- v0.26.0

Pass --en-only or --translate-only (or use the npm scripts above).
`);
}

async function prepareForProject(
  baseConfig: Awaited<ReturnType<typeof loadCmsConfig>>,
  projectId: string,
  mode: PrepareMode,
  dryRun: boolean,
  force: boolean,
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
  const modeLabel = mode === "en-only" ? "simplify EN" : "translate locales";
  console.log(
    `[${projectId}] ${dryRun ? "Would" : "Preparing"} ${modeLabel} for: ${targetVersions.join(", ")}`
  );

  const enStagingPath = englishStagingLocale(config).changelog!;

  if (mode === "en-only") {
    const { simplified, skipped: enSkipped } = await prepareSimplifiedEnglish(
      config,
      entriesToPrepare,
      docsEnContent,
      dryRun,
      force
    );
    console.log(
      `[${projectId}] Done: en simplified=${simplified} (skipped ${enSkipped})`
    );
    console.log(`[${projectId}] Staging: ${enStagingPath}`);
    console.log(`[${projectId}] Next: review staging EN, then pnpm cms:prepare:locales`);
    return;
  }

  // translate-only — read existing simplified EN staging (never re-simplify)
  const simplifiedEnContent = dryRun
    ? await readStaging(enStagingPath).catch(() => docsEnContent)
    : await readStaging(enStagingPath);

  for (const target of entriesToPrepare) {
    if (!blockForVersion(simplifiedEnContent, target.version)) {
      throw new Error(
        `[${projectId}] translate-only: missing staging EN block for v${target.version}. ` +
          `Run pnpm cms:prepare:en first.`
      );
    }
  }

  console.log(`[${projectId}] [translate-only] reading staging EN → ${enStagingPath}`);

  let translated = 0;
  let translateSkipped = 0;

  for (const locale of translateLocales(config)) {
    console.log(`[${projectId}/${locale.code}] translate ← staging en`);
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

  console.log(
    `[${projectId}] Done: locales translated=${translated} (skipped ${translateSkipped})`
  );
  console.log(`[${projectId}] Staging: ${enStagingPath.replace("/en/", "/{locale}/")}`);
  console.log(`[${projectId}] Next: review staging locales, then pnpm cms:preview / cms:sync`);
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  const { dryRun, force, mode, versions: explicitVersions } = parseArgs(rest);

  if (!mode) {
    printModeHelp();
    process.exit(1);
  }

  const baseConfig = await loadCmsConfig();
  const projects = resolveProjects(baseConfig, cliProject);

  console.log(`${translateEnvSummary()}\n`);
  console.log(`Mode: ${mode} | Projects: ${projects.join(", ")}\n`);

  const [primary, ...secondary] = projects;

  await prepareForProject(baseConfig, primary!, mode, dryRun, force, explicitVersions);

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
