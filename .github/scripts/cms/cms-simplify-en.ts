/**
 * LLM-simplify English changelog blocks for CMS (small notification copy).
 */

import type { ReleaseNoteEntry } from "./changelog-parse.ts";
import type { CmsConfig } from "./cms-config.ts";
import {
  blockForVersion,
  readStaging,
  stagingHasVersion,
  writeStagingCheckpoint,
} from "./cms-staging-io.ts";
import {
  buildSimplifyUserPrompt,
  CMS_SIMPLIFY_SYSTEM_PROMPT,
  type SimplifyLimits,
} from "./cms-simplify-prompt.ts";
import { callTranslateApi } from "./cms-translate-client.ts";

const DEFAULT_MAX_BULLETS_TOTAL = 10;
const DEFAULT_MAX_SECTIONS = 3;

function simplifyLimits(config: CmsConfig): SimplifyLimits {
  return {
    maxBulletsTotal: config.simplify?.max_bullets_total ?? DEFAULT_MAX_BULLETS_TOTAL,
    maxSections: config.simplify?.max_sections ?? DEFAULT_MAX_SECTIONS,
  };
}

export async function prepareSimplifiedEnglish(
  config: CmsConfig,
  targetEntries: ReleaseNoteEntry[],
  docsEnContent: string,
  dryRun: boolean,
  force = false
): Promise<{ simplified: number; skipped: number }> {
  const enLocale = config.locales.find((l) => l.code === "en");
  if (!enLocale?.changelog) {
    throw new Error("cms-config.json missing en locale with staging changelog path");
  }

  const limits = simplifyLimits(config);
  const relPath = enLocale.changelog;
  let existingContent = await readStaging(relPath);

  let simplified = 0;
  let skipped = 0;

  console.log(
    `[en] simplify → ${relPath} (max ${limits.maxBulletsTotal} bullets, ${limits.maxSections} sections)`
  );

  for (const target of targetEntries) {
    if (!force && stagingHasVersion(existingContent, target.version)) {
      skipped++;
      continue;
    }

    const block = blockForVersion(docsEnContent, target.version);
    if (!block) continue;

    if (dryRun) {
      console.log(`  would simplify en/v${target.version}`);
      simplified++;
      continue;
    }

    const simplifiedBody = await callTranslateApi([
      { role: "system", content: CMS_SIMPLIFY_SYSTEM_PROMPT },
      { role: "user", content: buildSimplifyUserPrompt(block.body, limits) },
    ]);

    if (!simplifiedBody.trim()) {
      throw new Error(`Empty simplification for v${target.version}`);
    }

    const updateContent = `<Update label="${block.label}" description="${target.date}">\n\n${simplifiedBody.trim()}\n\n</Update>`;

    existingContent = await writeStagingCheckpoint(relPath, existingContent, {
      label: block.label,
      content: updateContent,
    });
    simplified++;
    console.log(`  simplified en/v${target.version} → saved`);
  }

  return { simplified, skipped };
}
