#!/usr/bin/env bun
/**
 * Delete draft release-notes from Strapi CMS (never touches published entries).
 *
 * Usage:
 *   pnpm cms:delete-drafts --preview   # list what would be deleted
 *   pnpm cms:delete-drafts             # delete draft documents / localizations
 */

import { meetsMinVersion } from "./changelog-parse.ts";
import { resolveProject, stripProjectArg } from "./cms-args.ts";
import { loadCmsConfig } from "./cms-config.ts";
import { loadEnvLocal } from "./cms-env.ts";
import { loadPublishedVersions, isPublishedInRegistry } from "./published-versions.ts";
import { StrapiClient, type StrapiDocument } from "./strapi-client.ts";

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.some((a) => a === "--dry-run" || a === "--preview") };
}

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`Missing ${name}. See .github/scripts/cms/README.md`);
    process.exit(1);
  }
  return val;
}

type DraftRow = {
  documentId: string;
  locale: string;
  version: string;
  project: string;
  content?: string;
};

function versionFromContent(content: unknown): string {
  if (typeof content !== "string") return "";
  const m = content.match(/^#\s*(?:ComfyUI|Cloud)\s+v(\d+\.\d+(?:\.\d+)?)/im);
  return m?.[1] ?? "";
}

function rowFromDoc(doc: StrapiDocument, config: Awaited<ReturnType<typeof loadCmsConfig>>): DraftRow | null {
  const versionField = String(doc[config.version_field] ?? "").trim();
  const content = doc[config.content_field];
  const version = versionField || versionFromContent(content);
  const project = String(doc[config.project_field] ?? config.default_project).trim();
  if (!doc.documentId || !version) return null;
  return {
    documentId: doc.documentId,
    locale: String(doc.locale ?? "en"),
    version,
    project,
    content: typeof content === "string" ? content : undefined,
  };
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const { project: cliProject, rest } = stripProjectArg(process.argv.slice(2));
  const { dryRun } = parseArgs(rest);
  const config = await loadCmsConfig();
  const project = resolveProject(config, cliProject);
  const registry = await loadPublishedVersions();
  const client = new StrapiClient(requireEnv("CMS_BASE_URL"), requireEnv("CMS_API_TOKEN"));

  const draftRows: DraftRow[] = [];
  for (const locale of config.locales) {
    const docs = await client.listAll(config.content_type_plural, {
      status: "draft",
      locale: locale.code,
      filters: { [config.project_field]: project },
      pageSize: 100,
    });
    for (const doc of docs) {
      const row = rowFromDoc(doc, config);
      if (row && meetsMinVersion(row.version, config.min_version)) draftRows.push(row);
    }
  }

  const enPublishedCache = new Map<string, boolean>();
  async function enIsPublished(version: string): Promise<boolean> {
    if (isPublishedInRegistry(registry, project, version, "en")) return true;
    const cached = enPublishedCache.get(version);
    if (cached != null) return cached;
    const enPublishedInCms = await client.findOne(
      config.content_type_plural,
      {
        [config.project_field]: project,
        [config.version_field]: version,
      },
      { locale: "en", status: "published" }
    );
    const val = Boolean(enPublishedInCms?.publishedAt);
    enPublishedCache.set(version, val);
    return val;
  }

  const byDocument = new Map<string, DraftRow[]>();
  for (const row of draftRows) {
    const list = byDocument.get(row.documentId) ?? [];
    list.push(row);
    byDocument.set(row.documentId, list);
  }

  const toDeleteWhole: DraftRow[] = [];
  const toDeleteLocale: DraftRow[] = [];

  for (const [documentId, rows] of byDocument) {
    const enRow = rows.find((r) => r.locale === "en");
    const version = enRow?.version ?? rows[0]?.version ?? "";
    const enPublished = await enIsPublished(version);

    if (enPublished) {
      for (const row of rows) {
        if (row.locale !== "en") toDeleteLocale.push(row);
      }
      continue;
    }

    if (enRow) {
      toDeleteWhole.push(enRow);
    } else {
      toDeleteWhole.push(rows[0]!);
    }
    void documentId;
  }

  console.log(
    `${dryRun ? "Would delete" : "Deleting"} CMS drafts (project=${project}):\n` +
      `  whole documents: ${toDeleteWhole.length}\n` +
      `  draft localizations only: ${toDeleteLocale.length}\n`
  );

  for (const row of toDeleteWhole.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))) {
    console.log(`  DELETE doc  ${row.project}/v${row.version} [all locales] (${row.documentId})`);
    if (!dryRun) {
      for (const locale of [...config.locales.map((l) => l.code).filter((c) => c !== "en"), "en"]) {
        try {
          await client.delete(config.content_type_plural, row.documentId, { locale });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("404")) console.warn(`    warn ${row.version} [${locale}]: ${msg}`);
        }
      }
    }
  }

  for (const row of toDeleteLocale.sort((a, b) =>
    a.version.localeCompare(b.version, undefined, { numeric: true }) || a.locale.localeCompare(b.locale)
  )) {
    console.log(`  DELETE loc  ${row.project}/v${row.version} [${row.locale}] (${row.documentId})`);
    if (!dryRun) {
      await client.delete(config.content_type_plural, row.documentId, { locale: row.locale });
    }
  }

  console.log(`\nDone${dryRun ? " (preview)" : ""}.`);
}

main();
