#!/usr/bin/env bun
/**
 * Append missing closing ``` markers in translated MDX (structural fix only).
 *
 * Safe to run when `translate:check-truncation` reports `unclosed_code_fence`.
 * Does not restore truncated code inside the block — use `translate:repair-truncated`
 * when content was cut off, not just the closing fence.
 *
 * Usage:
 *   pnpm translate:repair-fences
 *   pnpm translate:repair-fences -- --lang ko
 *   pnpm translate:repair-fences -- --dry-run path/to/page.mdx
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  loadI18nConfig,
  REPO_ROOT,
  parseLangArg as parseLangArgFromConfig,
} from "./i18n-config.mjs";
import {
  hasUnclosedCodeFence,
  repairTargetContent,
  scanTruncationIssues,
  writeTruncationReport,
} from "./check-translation-truncation.ts";
import { parseFrontmatterAndBody } from "./chunked-translate.ts";

interface LangConfig {
  code: string;
  name: string;
  dir: string;
  snippets_dir: string;
}

const config = loadI18nConfig() as {
  languages: LangConfig[];
  skip_paths: string[];
};

async function readFileOr(path: string, fallback = ""): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return fallback;
  }
}

function parseLangArg(args: string[]): LangConfig[] {
  try {
    return parseLangArgFromConfig(args, config.languages) as LangConfig[];
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const snippetsMode = args.includes("--snippets");
  const langs = parseLangArg(args);
  const fileArgs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");

  const issues = await scanTruncationIssues({ langs, snippetsMode, fileArgs });
  const fenceIssues = issues.filter((i) => i.reasons.includes("unclosed_code_fence"));

  if (fenceIssues.length === 0) {
    console.log("No unclosed code fences found.");
    return;
  }

  console.log(`Found ${fenceIssues.length} file(s) with unclosed \`\`\` blocks${dryRun ? " [dry-run]" : ""}:`);

  let repaired = 0;
  let skipped = 0;
  const repairedPairs: { lang: string; enRel: string }[] = [];

  for (const issue of fenceIssues) {
    const targetPath = join(REPO_ROOT, issue.targetRel);
    const targetContent = await readFileOr(targetPath);
    if (!targetContent.trim()) {
      skipped++;
      continue;
    }

    const { body } = parseFrontmatterAndBody(targetContent);
    if (!hasUnclosedCodeFence(body)) {
      console.log(`  [${issue.lang}] ${issue.enRel}: already balanced, skipping`);
      skipped++;
      continue;
    }

    const result = repairTargetContent(targetContent);
    if (!result.repaired) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [${issue.lang}] would repair: ${issue.targetRel}`);
      console.log(`    ${result.detail}`);
    } else {
      await writeFile(targetPath, result.content);
      console.log(`  [${issue.lang}] repaired: ${issue.targetRel}`);
      console.log(`    ${result.detail}`);
      repaired++;
      repairedPairs.push({ lang: issue.lang, enRel: issue.enRel });
    }
  }

  if (!dryRun && repairedPairs.length > 0) {
    const remaining = await scanTruncationIssues({
      langs,
      snippetsMode,
      pairs: repairedPairs.map((p) => ({ langCode: p.lang, enRel: p.enRel })),
    });
    await writeTruncationReport(remaining, { replacePairs: repairedPairs });
  }

  console.log(
    `\nDone: ${dryRun ? fenceIssues.length : repaired} repaired, ${skipped} skipped` +
      (fenceIssues.some((i) => i.reasons.includes("missing_code_fence")) && !dryRun
        ? "\nNote: files with missing_code_fence (fewer fences than EN) may need translate:repair-truncated."
        : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
