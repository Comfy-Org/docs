/**
 * Translate simplified English staging blocks → other locale staging files.
 */

import { applyChangelogBlockLocalizations, parseDocument } from "../i18n/chunked-translate.ts";
import {
  buildGlossaryPrompt,
  loadGlossary,
  selectGlossaryForText,
} from "../i18n/glossary.mjs";
import type { ReleaseNoteEntry } from "./changelog-parse.ts";
import type { LocaleConfig } from "./cms-config.ts";
import {
  blockForVersion,
  readStaging,
  stagingHasVersion,
  writeStagingCheckpoint,
} from "./cms-staging-io.ts";
import { translateChangelogUpdateBlock } from "./cms-translate-client.ts";

function glossaryBlockFor(enText: string, langCode: string, langName: string): string {
  try {
    const glossary = loadGlossary(langCode);
    const terms = selectGlossaryForText(enText, glossary);
    return buildGlossaryPrompt(terms, langName);
  } catch {
    return "";
  }
}

export async function prepareStagingLocale(
  locale: LocaleConfig,
  targetEntries: ReleaseNoteEntry[],
  simplifiedEnContent: string,
  dryRun: boolean,
  force = false
): Promise<{ translated: number; skipped: number }> {
  if (!locale.changelog || !locale.name) {
    return { translated: 0, skipped: 0 };
  }

  const relPath = locale.changelog;
  let existingContent = await readStaging(relPath);

  let translated = 0;
  let skipped = 0;

  for (const target of targetEntries) {
    const label = `v${target.version}`;
    if (!force && stagingHasVersion(existingContent, target.version)) {
      skipped++;
      continue;
    }

    const enBlock = blockForVersion(simplifiedEnContent, target.version);
    if (!enBlock) {
      console.log(`  skip ${locale.code}/v${target.version} — no simplified en block`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  would translate ${locale.code}/v${target.version} → ${relPath}`);
      translated++;
      continue;
    }

    const glossary = glossaryBlockFor(enBlock.updateBlock, locale.code, locale.name);
    let block = await translateChangelogUpdateBlock(
      enBlock.updateBlock,
      locale.name,
      locale.code,
      glossary
    );

    const localized = applyChangelogBlockLocalizations(
      [{ label, content: block }],
      parseDocument(enBlock.updateBlock, "update_blocks").blocks,
      locale.code
    );
    block = localized[0]?.content ?? block;

    if (!block.includes("<Update")) {
      throw new Error(`Translation for ${locale.code}/v${target.version} missing <Update> wrapper`);
    }

    existingContent = await writeStagingCheckpoint(relPath, existingContent, {
      label,
      content: block,
    });
    translated++;
    console.log(`  translated ${locale.code}/v${target.version} → saved`);
  }

  return { translated, skipped };
}
