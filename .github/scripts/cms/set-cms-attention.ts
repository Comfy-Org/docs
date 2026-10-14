#!/usr/bin/env bun
/**
 * Set attention level (low | medium | high) for a release note in Strapi CMS.
 *
 * Usage:
 *   pnpm cms:set-attention -- cloud v0.24.0 high
 *   pnpm cms:set-attention -- --project cloud v0.24.0 high
 *   pnpm cms:set-attention -- --preview comfyui v0.25.0 low
 *   pnpm cms:set-attention -- --save cloud v0.24.0 high   # persist to attention-overrides.json
 *
 * Requires CMS_BASE_URL / CMS_API_TOKEN.
 */

import { resolveProject, stripProjectArg } from "./cms-args.ts";
import {
  loadAttentionOverrides,
  saveAttentionOverride,
  type AttentionLevel,
} from "./cms-attention.ts";
import { loadCmsConfig, listProjectIds, projectLabel } from "./cms-config.ts";
import { loadEnvLocal } from "./cms-env.ts";
import { StrapiClient } from "./strapi-client.ts";

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Missing ${name}. See .github/scripts/cms/README.md`);
    process.exit(1);
  }
  return val;
}

function parseArgs(
  argv: string[],
  knownProjects: string[]
): {
  dryRun: boolean;
  save: boolean;
  project?: string;
  version?: string;
  attention?: AttentionLevel;
} {
  let dryRun = false;
  let save = false;
  const { project: cliProject, rest } = stripProjectArg(argv);
  let project = cliProject;
  let attention: AttentionLevel | undefined;
  const positional: string[] = [];

  for (const arg of rest) {
    if (arg === "--dry-run" || arg === "--preview") dryRun = true;
    else if (arg === "--save") save = true;
    else if (arg === "low" || arg === "medium" || arg === "high") attention = arg;
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  let version: string | undefined;
  if (!project && positional.length >= 2 && knownProjects.includes(positional[0]!)) {
    project = positional[0];
    version = positional[1]!.replace(/^v/i, "");
  } else if (positional.length >= 1) {
    version = positional[0]!.replace(/^v/i, "");
  }

  return { dryRun, save, project, version, attention };
}

async function updateAttentionInStrapi(
  client: StrapiClient,
  contentType: string,
  projectField: string,
  versionField: string,
  attentionField: string,
  project: string,
  version: string,
  attention: AttentionLevel,
  dryRun: boolean
): Promise<void> {
  const filters = { [projectField]: project, [versionField]: version };
  const payload = { [attentionField]: attention };

  const draft = await client.findOne(contentType, filters, { locale: "en", status: "draft" });
  const published = await client.findOne(contentType, filters, {
    locale: "en",
    status: "published",
  });

  if (!draft?.documentId && !published?.documentId) {
    throw new Error(`No release note found for ${project}/v${version}`);
  }

  const docId = draft?.documentId ?? published!.documentId;

  if (dryRun) {
    console.log(
      `Would set ${project}/v${version} attention=${attention}` +
        (draft ? " (draft)" : "") +
        (published ? " (published)" : "")
    );
    return;
  }

  if (draft?.documentId) {
    await client.update(contentType, docId, payload, { locale: "en", status: "draft" });
    console.log(`Updated  ${project}/v${version} [en] draft → attention=${attention}`);
  }

  if (published?.documentId) {
    await client.update(contentType, docId, payload, { locale: "en", status: "published" });
    console.log(`Updated  ${project}/v${version} [en] published → attention=${attention}`);
  }
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const config = await loadCmsConfig();
  const { dryRun, save, project: projectArg, version, attention } = parseArgs(
    process.argv.slice(2),
    listProjectIds(config)
  );

  if (!version || !attention) {
    console.error(
      "Usage: pnpm cms:set-attention -- [cloud] v0.24.0 high [--save] [--preview]\n" +
        "       pnpm cms:set-attention -- --project cloud v0.24.0 high"
    );
    process.exit(1);
  }

  const project = resolveProject(config, projectArg);
  const overrides = await loadAttentionOverrides();
  const current = overrides[project]?.[version] ?? "low (default)";

  console.log(
    `${dryRun ? "Would set" : "Setting"} ${project}/v${version} attention: ${current} → ${attention}`
  );

  if (save && !dryRun) {
    await saveAttentionOverride(project, version, attention);
    console.log(`Saved override to attention-overrides.json`);
  } else if (save && dryRun) {
    console.log(`Would save ${project}/v${version}=${attention} to attention-overrides.json`);
  }

  const client = new StrapiClient(requireEnv("CMS_BASE_URL"), requireEnv("CMS_API_TOKEN"));
  const ping = await client.ping(config.content_type_plural);
  if (!ping.ok) {
    console.error(`CMS unreachable: ${ping.error}`);
    process.exit(1);
  }

  await updateAttentionInStrapi(
    client,
    config.content_type_plural,
    config.project_field,
    config.version_field,
    config.attention_field,
    project,
    version,
    attention,
    dryRun
  );

  void projectLabel(config, project);
}

main();
