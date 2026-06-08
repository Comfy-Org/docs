#!/usr/bin/env node
/**
 * PR check: English MDX changes should have matching translations for each
 * language in translation-config.json. Missing translations are warnings only;
 * missing redirects for moved files fail the check.
 *
 * Usage (CI):
 *   node .github/scripts/i18n/check-i18n-sync.mjs <base_sha> <head_sha>
 *
 * Writes JSON summary to path in CHECK_I18N_OUTPUT env (optional).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { loadI18nConfig, REPO_ROOT, isEnglishMdxPath, targetRelFromEn } from "./i18n-config.mjs";

const ROOT = REPO_ROOT;
const CONFIG = loadI18nConfig();

const [baseSha, headSha] = process.argv.slice(2);
if (!baseSha || !headSha) {
  console.error("Usage: check-i18n-sync.mjs <base_sha> <head_sha>");
  process.exit(1);
}

const languages = CONFIG.languages;
const skipPaths = CONFIG.skip_paths;
const pathFilterOpts = { languages, skip_paths: skipPaths };

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function gitLines(cmd) {
  const out = git(cmd);
  return out ? out.split("\n").filter(Boolean) : [];
}

function shouldSkipEnglishPath(file) {
  return !isEnglishMdxPath(file, pathFilterOpts);
}

function matchesPattern(filePath, pattern) {
  pattern = pattern.replace(/^\//, "");
  filePath = filePath.replace(/^\//, "");
  const regexPattern = pattern
    .replace(/\//g, "\\/")
    .replace(/:slug\*/g, ".*")
    .replace(/:slug/g, "[^/]+")
    .replace(/\*/g, ".*");
  return new RegExp(`^${regexPattern}$`).test(filePath);
}

function filterEnglish(files) {
  return files.filter((f) => !shouldSkipEnglishPath(f));
}

const changedRaw = gitLines(
  `git diff --name-only --diff-filter=ACMRT ${baseSha} ${headSha}`
);
const deletedRaw = gitLines(
  `git diff --name-only --diff-filter=D ${baseSha} ${headSha}`
);
const addedRaw = gitLines(
  `git diff --name-only --diff-filter=A ${baseSha} ${headSha}`
);

const changedFiles = filterEnglish(changedRaw.filter((f) => f.endsWith(".mdx")));
const deletedFiles = filterEnglish(deletedRaw.filter((f) => f.endsWith(".mdx")));
const addedFiles = filterEnglish(addedRaw.filter((f) => f.endsWith(".mdx")));

const allDiffNames = gitLines(`git diff --name-only ${baseSha} ${headSha}`);
const acmrtNames = gitLines(
  `git diff --name-only --diff-filter=ACMRT ${baseSha} ${headSha}`
);
const arNames = gitLines(
  `git diff --name-only --diff-filter=AR ${baseSha} ${headSha}`
);
const renameLines = gitLines(
  `git diff --name-status --find-renames ${baseSha} ${headSha}`
);
const renamedDestinations = renameLines
  .filter((line) => /^R\d+\s+/.test(line))
  .map((line) => line.split(/\s+/)[2]);

if (
  changedFiles.length === 0 &&
  deletedFiles.length === 0 &&
  addedFiles.length === 0
) {
  console.log("No English MDX files changed outside translation directories. Skipping check.");
  writeOutput({ skipped: true, missingByLang: {}, movedFiles: [] });
  process.exit(0);
}

// --- Redirect check for moved files ---
let movedFiles = [];
if (deletedFiles.length > 0 && addedFiles.length > 0) {
  const docsJsonChanged = allDiffNames.includes("docs.json");
  if (!docsJsonChanged) {
    console.log("⚠️ docs.json was not modified — if files were moved, redirects should be added.");
    movedFiles = [...deletedFiles];
  } else {
    const docsJson = JSON.parse(readFileSync(join(ROOT, "docs.json"), "utf-8"));
    const redirects = docsJson.redirects ?? [];
    for (const file of deletedFiles) {
      const sourcePath = file.replace(/\.mdx$/, "");
      const hasRedirect = redirects.some((redirect) => {
        const redirectSource = redirect.source.replace(/^\//, "");
        const filePathNormalized = sourcePath.replace(/^\//, "");
        return (
          redirectSource === filePathNormalized ||
          matchesPattern(filePathNormalized, redirectSource)
        );
      });
      if (hasRedirect) {
        console.log(`✅ Found redirect for moved file: ${file}`);
      } else {
        console.log(`❌ Missing redirect in docs.json for: ${file}`);
        movedFiles.push(file);
      }
    }
  }
}

// --- Translation sync per language ---
const missingByLang = {};

for (const lang of languages) {
  const missing = [];

  for (const file of changedFiles) {
    const langFile = targetRelFromEn(file, lang);
    if (acmrtNames.includes(langFile)) {
      console.log(`✅ [${lang.code}] Found corresponding change: ${langFile}`);
      continue;
    }
    if (existsSync(join(ROOT, langFile))) {
      console.log(`❌ [${lang.code}] Missing update to existing file: ${langFile}`);
    } else {
      console.log(`❌ [${lang.code}] Missing equivalent file: ${langFile}`);
    }
    missing.push(langFile);
  }

  for (const file of addedFiles) {
    const langFile = targetRelFromEn(file, lang);
    if (arNames.includes(langFile) || renamedDestinations.includes(langFile)) {
      console.log(`✅ [${lang.code}] Found corresponding added/renamed file: ${langFile}`);
      continue;
    }
    console.log(`❌ [${lang.code}] Missing equivalent for added file: ${langFile}`);
    missing.push(langFile);
  }

  if (missing.length > 0) {
    missingByLang[lang.code] = { name: lang.name, files: missing };
  }
}

const totalMissing = Object.values(missingByLang).reduce(
  (n, v) => n + v.files.length,
  0
);

if (totalMissing > 0) {
  console.log("------------------------");
  console.log("⚠️ Translation files that may need updates:");
  for (const [code, { name, files }] of Object.entries(missingByLang)) {
    console.log(`  ${name} (${code}):`);
    for (const f of files) console.log(`    - ${f}`);
  }
}

if (movedFiles.length > 0) {
  console.log("------------------------");
  console.log("❌ Files moved without redirects in docs.json:");
  for (const f of movedFiles) console.log(`  - ${f}`);
}

writeOutput({ skipped: false, missingByLang, movedFiles });

if (movedFiles.length > 0) {
  console.log("------------------------");
  console.log("Please add redirects in docs.json before merging.");
  process.exit(1);
}

console.log("------------------------");
console.log(totalMissing > 0 ? "⚠️ Check completed with translation warnings." : "✅ All checks passed!");
process.exit(0);

function writeOutput(data) {
  const outPath = process.env.CHECK_I18N_OUTPUT;
  if (outPath) {
    writeFileSync(outPath, JSON.stringify(data, null, 2));
  }
}
