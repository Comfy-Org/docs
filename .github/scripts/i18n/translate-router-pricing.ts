#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { render } from "../snippets/gen-router-pricing.ts";
import { fixAnchorSlugs } from "./fix-anchor-slugs.ts";
import { loadI18nConfig, localizeMdxPaths, REPO_ROOT } from "./i18n-config.mjs";
import { computeSyncedContent } from "./sync-hash-i18n.ts";

const ENGLISH_PATH = "development/comfy-router/pricing.mdx";
const ENGLISH_FILE = join(REPO_ROOT, ENGLISH_PATH);
const LOCALES = ["ja", "zh", "ko"] as const;
type PricingLocale = (typeof LOCALES)[number];

function fallBackMissingLocaleLinks(content: string, locale: PricingLocale): string {
  const prefix = `/${locale}/`;
  return content.replace(/\]\((\/[^)]+)\)/g, (link, url: string) => {
    const match = url.match(/^(\/[^?#]*)([?#].*)?$/);
    if (!match || !match[1].startsWith(prefix)) return link;

    const localizedPath = match[1].slice(prefix.length);
    const candidates = [
      join(REPO_ROOT, locale, `${localizedPath}.mdx`),
      join(REPO_ROOT, locale, localizedPath, "index.mdx"),
      join(REPO_ROOT, locale, localizedPath),
    ];
    if (candidates.some((candidate) => existsSync(candidate))) return link;

    return link.replace(url, `/${localizedPath}${match[2] ?? ""}`);
  });
}

function localizedPageContent(english: string, locale: PricingLocale): string {
  if (english !== render()) {
    throw new Error("English Router pricing page is stale, run pnpm router-pricing:gen");
  }
  const config = loadI18nConfig();
  const language = config.languages.find((candidate) => candidate.code === locale);
  if (!language) throw new Error(`No language configuration found for ${locale}`);

  const localized = fallBackMissingLocaleLinks(
    localizeMdxPaths(render(locale), language, config.languages),
    locale,
  );
  return computeSyncedContent(english, localized, ENGLISH_PATH, ENGLISH_PATH, false).output;
}

async function main() {
  const check = process.argv.includes("--check");
  const english = await readFile(ENGLISH_FILE, "utf8");
  const targetFiles: string[] = [];
  for (const locale of LOCALES) {
    const targetFile = join(REPO_ROOT, locale, ENGLISH_PATH);
    const output = localizedPageContent(english, locale);
    if (check) {
      if (!existsSync(targetFile) || await readFile(targetFile, "utf8") !== output) {
        throw new Error(`${targetFile}: stale or missing, run pnpm router-pricing:gen`);
      }
      console.log(`fresh ${targetFile}`);
    } else {
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, output);
      console.log(`wrote ${targetFile}`);
    }
    targetFiles.push(`${locale}/${ENGLISH_PATH}`);
  }

  const anchors = await fixAnchorSlugs({ fileArgs: targetFiles, dryRun: check });
  if (anchors.unresolved > 0) {
    throw new Error(`Could not localize ${anchors.unresolved} pricing anchor(s)`);
  }
  if (check && anchors.fixed > 0) {
    throw new Error("Pricing locale anchors are stale, run pnpm router-pricing:gen");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { localizedPageContent };
