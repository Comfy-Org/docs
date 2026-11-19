#!/usr/bin/env bun
/**
 * Verify that the public release API serves the exact staged CMS content for
 * one project/version in every configured locale. This is read-only.
 *
 * Usage:
 *   pnpm cms:verify-live -- --project cloud v0.45.5
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseChangelogUpdates } from "./changelog-parse.ts";
import {
  configForProject,
  loadCmsConfig,
  projectLabel,
  type CmsConfig,
} from "./cms-config.ts";
import { resolveProject, stripProjectArg } from "./cms-args.ts";
import { ROOT } from "./cms-env.ts";
import { formatCmsReleaseContent } from "./format-cms-content.ts";

export interface PublicReleaseNote {
  id?: number;
  project?: string;
  version?: string;
  content?: string;
  published_at?: string;
}

export interface LocaleVerification {
  ok: boolean;
  reason?: string;
  expectedHash: string;
  actualHash?: string;
  publishedAt?: string;
  id?: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyLocaleRelease(
  notes: PublicReleaseNote[],
  expectedContent: string,
  project: string,
  version: string,
): LocaleVerification {
  const expectedHash = sha256(expectedContent);
  const matches = notes.filter(
    (note) => note.project === project && note.version === version,
  );
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: `expected one ${project}/v${version} record, found ${matches.length}`,
      expectedHash,
    };
  }

  const note = matches[0]!;
  const actualContent = typeof note.content === "string" ? note.content : "";
  const actualHash = sha256(actualContent);
  if (!note.published_at) {
    return {
      ok: false,
      reason: "record has no published_at",
      expectedHash,
      actualHash,
      id: note.id,
    };
  }
  if (actualContent !== expectedContent) {
    return {
      ok: false,
      reason: "public content does not match staging",
      expectedHash,
      actualHash,
      publishedAt: note.published_at,
      id: note.id,
    };
  }
  return {
    ok: true,
    expectedHash,
    actualHash,
    publishedAt: note.published_at,
    id: note.id,
  };
}

function parseArgs(argv: string[]): { version: string; apiBase: string } {
  let apiBase =
    process.env.COMFY_API_BASE_URL?.trim() || "https://api.comfy.org";
  const versions: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--api-base" && argv[i + 1]) {
      apiBase = argv[++i]!;
    } else if (arg.startsWith("--api-base=")) {
      apiBase = arg.slice("--api-base=".length);
    } else if (!arg.startsWith("-")) {
      versions.push(arg.replace(/^v/i, ""));
    }
  }
  if (versions.length !== 1) {
    throw new Error("Provide exactly one target version, for example v0.45.5.");
  }
  return { version: versions[0]!, apiBase: apiBase.replace(/\/+$/, "") };
}

async function expectedLocaleContent(
  config: CmsConfig,
  project: string,
  locale: string,
  version: string,
): Promise<string> {
  const localeConfig = config.locales.find((entry) => entry.code === locale);
  if (!localeConfig?.changelog)
    throw new Error(`No staging path for locale ${locale}`);
  const raw = await readFile(join(ROOT, localeConfig.changelog), "utf8");
  const entry = parseChangelogUpdates(raw).find(
    (candidate) => candidate.version === version,
  );
  if (!entry) {
    throw new Error(`Staging is missing ${project}/v${version} [${locale}]`);
  }
  return formatCmsReleaseContent(
    projectLabel(config, project),
    version,
    entry.body,
  );
}

async function main(): Promise<void> {
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  if (!cliProject?.trim()) {
    throw new Error(
      "Pass an explicit --project so the readback cannot target the wrong product.",
    );
  }
  const baseConfig = await loadCmsConfig();
  const project = resolveProject(baseConfig, cliProject);
  const config = configForProject(baseConfig, project);
  const { version, apiBase } = parseArgs(rest);

  console.log(
    `Verifying public API for ${project}/v${version} across ${config.locales.length} locales`,
  );
  let failed = 0;
  for (const locale of config.locales) {
    const expectedContent = await expectedLocaleContent(
      config,
      project,
      locale.code,
      version,
    );
    const url = new URL("/releases", apiBase);
    url.searchParams.set("project", project);
    url.searchParams.set("current_version", version);
    url.searchParams.set("locale", locale.code);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      failed++;
      console.error(
        `FAIL ${locale.code}: API returned ${response.status} ${response.statusText}`,
      );
      continue;
    }
    const notes = (await response.json()) as PublicReleaseNote[];
    const result = verifyLocaleRelease(
      notes,
      expectedContent,
      project,
      version,
    );
    if (!result.ok) {
      failed++;
      console.error(
        `FAIL ${locale.code}: ${result.reason}; expected=${result.expectedHash}` +
          `${result.actualHash ? ` actual=${result.actualHash}` : ""}`,
      );
      continue;
    }
    console.log(
      `PASS ${locale.code}: id=${result.id} published_at=${result.publishedAt} sha256=${result.actualHash}`,
    );
  }

  if (failed > 0) {
    throw new Error(
      `Public API readback failed for ${failed}/${config.locales.length} locales.`,
    );
  }
  console.log(
    `Verified ${config.locales.length}/${config.locales.length} locales.`,
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
