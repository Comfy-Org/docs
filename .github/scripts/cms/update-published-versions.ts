#!/usr/bin/env bun
/**
 * Refresh published-versions.json from Strapi CMS (read-only scan).
 *
 * Usage:
 *   bun .github/scripts/cms/update-published-versions.ts          # print diff (all projects)
 *   bun .github/scripts/cms/update-published-versions.ts --write  # update JSON
 *   bun .github/scripts/cms/update-published-versions.ts --check  # CI: fail if stale
 *   bun .github/scripts/cms/update-published-versions.ts cloud    # single project only
 */

import { resolveProject, stripProjectArg } from "./cms-args.ts";
import { loadCmsConfig } from "./cms-config.ts";
import { loadEnvLocal } from "./cms-env.ts";
import {
  printRegistrySyncResult,
  syncPublishedVersionsFromCms,
  writePublishedVersionsRegistry,
} from "./published-versions-sync.ts";
import { StrapiClient } from "./strapi-client.ts";

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Missing ${name}. Set in .env.local or GitHub Actions secrets.`);
    process.exit(1);
  }
  return val;
}

function parseArgs(argv: string[]): { write: boolean; check: boolean; project?: string } {
  const { project: cliProject, rest } = stripProjectArg(argv);
  let write = false;
  let check = false;
  let project = cliProject;

  for (const arg of rest) {
    if (arg === "--write") write = true;
    else if (arg === "--check") check = true;
    else if (!arg.startsWith("-") && !project) project = arg;
  }

  return { write, check, project };
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { write, check, project: projectArg } = parseArgs(process.argv.slice(2));
  const config = await loadCmsConfig();
  const client = new StrapiClient(requireEnv("CMS_BASE_URL"), requireEnv("CMS_API_TOKEN"));

  const projects = projectArg
    ? [resolveProject(config, projectArg)]
    : undefined;

  const label = projects ? projects.join(", ") : "all projects";
  console.log(`Scanning published release-notes in CMS (${label})…`);

  const result = await syncPublishedVersionsFromCms(client, config, { projects });
  printRegistrySyncResult(result, projects ?? config.projects?.map((p) => p.id) ?? [config.default_project]);

  if (check && (result.added.length > 0 || result.removed.length > 0)) {
    console.error(
      "\npublished-versions.json is out of date. Run:\n  bun .github/scripts/cms/update-published-versions.ts --write"
    );
    process.exit(1);
  }

  if (write) {
    await writePublishedVersionsRegistry(result.merged);
  } else if (!check && (result.added.length > 0 || result.removed.length > 0)) {
    console.log("\nDry run. Pass --write to update published-versions.json");
  }
}

main();
