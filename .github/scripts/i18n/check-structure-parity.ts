#!/usr/bin/env bun
/**
 * Structure parity check for localized pages.
 *
 * A translated page must carry the same MDX structure as its English source:
 * the same components (counted per tag name, so a new library like `<CardGroup>`
 * or any other capitalized JSX tag is covered without touching this file), the
 * same images, headings and asset links. When a localization is translated
 * before the English page gains that structure, or when a translation drops it,
 * nothing else catches it: `translate:dry-run` compares section hashes only,
 * `mint-checks` fails on broken links only, and the markdown renders fine
 * without the missing pieces. The result is a page that quietly loses its
 * download cards, workflow previews or card grouping.
 *
 * Both directions are covered in changed-file mode:
 *   - a localized page changed -> compare it with its English source;
 *   - an English page changed -> compare every existing ja/zh/ko counterpart
 *     with the updated English page.
 * The second direction only fails when the counterpart was in parity before the
 * change, so pre-existing debt in untouched pages never blocks a pull request
 * (it is reported as a warning instead).
 *
 * Missing elements and links fail the run. Extra elements are reported as
 * warnings, because a locale may legitimately add something (the zh home page
 * carries an extra social icon).
 *
 * Usage:
 *   bun .github/scripts/i18n/check-structure-parity.ts               # changed files, both directions
 *   bun .github/scripts/i18n/check-structure-parity.ts --all         # whole repo, backlog report
 *   bun .github/scripts/i18n/check-structure-parity.ts --base=<ref>  # explicit base
 *   bun .github/scripts/i18n/check-structure-parity.ts --json        # machine readable
 *
 * In CI the base comes from STRUCTURE_PARITY_BASE (the PR base SHA or the
 * previous commit on push), matching the anchor check.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const LOCALES = ["ja", "zh", "ko"];

/** Paths that are not one-to-one translations of an English page. */
const EXEMPT_PATTERNS: RegExp[] = [
  /^pricing\.mdx$/, // pricing is translated by hand, allowed to differ
  /(^|\/)api-reference\//, // generated from the OpenAPI spec
  /^snippets\//, // snippets are imported, not standalone pages
  /^comfy-router-[^/]+\.mdx$/, // legacy orphans with no English source
  /^changelog\//, // CMS changelog pipeline, separate from docs translation
  /(^|\/)docs\.json$/, // navigation, not a page
];

/**
 * Paths whose content is generated from another repository, so a gap cannot be
 * fixed durably here: `docs-generation/scripts/sync_to_comfy_docs.py` in
 * Comfy-Org/embedded-docs rewrites every localized built-in-nodes page from the
 * localized `.md` upstream, which overwrites hand edits. Findings there are
 * reported as warnings pointing at the upstream file.
 */
const EXTERNAL_SOURCE_PATTERNS: { re: RegExp; note: string }[] = [
  {
    re: /^built-in-nodes\//,
    note: "generated from Comfy-Org/embedded-docs; fix the localized .md upstream",
  },
];

const HEADING_RES: { label: string; re: RegExp }[] = [
  { label: "h2", re: /^## /gm },
  { label: "h3", re: /^### /gm },
  { label: "h4", re: /^#### /gm },
];

const ASSET_HOSTS = [
  "raw.githubusercontent.com",
  "github.com/Comfy-Org/",
  "cloud.comfy.org",
];

export type Counts = Record<string, number>;

/**
 * Drop frontmatter and fenced code blocks so component-looking text inside a
 * code sample is never counted. Fence handling follows CommonMark: the closing
 * fence must use the same character as the opener, be at least as long, and have
 * nothing but whitespace after it, so a three-backtick sample inside a
 * four-backtick block (or a `~~~` line inside a backtick fence) stays content.
 */
export function strippedBody(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let fence: { char: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && inFrontmatter) continue;
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[1];
      const rest = match[2];
      if (!fence) {
        // A backtick fence cannot carry backticks in its info string.
        if (marker[0] === "`" && rest.includes("`")) {
          out.push(line);
          continue;
        }
        fence = { char: marker[0], len: marker.length };
        continue;
      }
      if (marker[0] === fence.char && marker.length >= fence.len && rest.trim() === "") {
        fence = null;
      }
      continue;
    }
    if (fence) continue;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Count every capitalized JSX tag by name. Lowercase tags are HTML (`img`,
 * `div`, `video`), so this picks up any MDX component without keeping a list of
 * known names: a new component is covered the moment it appears.
 */
export function componentCounts(body: string): Counts {
  const counts: Counts = {};
  for (const match of body.matchAll(/<([A-Z][A-Za-z0-9_.]*)/g)) {
    const name = match[1];
    counts[name] = (counts[name] ?? 0) + 1;
  }
  for (const { label, re } of HEADING_RES) {
    counts[label] = (body.match(re) ?? []).length;
  }
  counts["img"] = (body.match(/<img[\s>/]/g) ?? []).length;
  counts["markdown-image"] = (body.match(/!\[[^\]]*\]\(/g) ?? []).length;
  return counts;
}

/**
 * Normalize an asset URL so the same asset compares equal across locales:
 * embedded-docs links carry the locale in the path
 * (`.../comfyui_embedded_docs/docs/APG/ja.md` vs `.../APG/en.md`), and trailing
 * punctuation or backticks from the surrounding markdown are not part of the URL.
 */
export function normalizeAssetUrl(url: string): string {
  return url
    .replace(/[.,)`\]]+$/, "")
    .replace(/\/comfyui_embedded_docs\/docs\/([^/]+)\/(en|ja|zh|ko)\.md$/, "/comfyui_embedded_docs/docs/$1.md");
}

export function assetLinks(body: string): string[] {
  const found: string[] = [];
  for (const match of body.match(/https:\/\/[^\s)"'<>\]`]+/g) ?? []) {
    const url = normalizeAssetUrl(match);
    if (ASSET_HOSTS.some((host) => url.includes(host))) found.push(url);
  }
  return found;
}

/**
 * Multiset difference with a case-folded key. GitHub paths are case-sensitive on
 * the web but the embedded-docs generator emits node-name casing on the English
 * side and doc-path casing on the localized side (CLIPMergeSimple/en.md versus
 * ClipMergeSimple/ja.md), which is the same document; comparing case-insensitively
 * keeps that from reading as a missing link.
 */
function multisetDiff(want: string[], have: string[]): string[] {
  const remaining = have.map((item) => ({ item, key: item.toLowerCase() }));
  const missing: string[] = [];
  for (const item of want) {
    const key = item.toLowerCase();
    const at = remaining.findIndex((entry) => entry.key === key);
    if (at === -1) missing.push(item);
    else remaining.splice(at, 1);
  }
  return missing;
}

export interface Finding {
  file: string;
  source: "localized" | "english";
  /** Set when the page is generated from another repository. */
  note?: string;
  missingComponents: { label: string; en: number; localized: number }[];
  extraComponents: { label: string; en: number; localized: number }[];
  missingLinks: string[];
  extraLinks: string[];
}

export function compare(
  englishRaw: string,
  localizedRaw: string,
  file: string,
  source: Finding["source"] = "localized"
): Finding {
  // Strip frontmatter and fenced code here so every caller gets the same view:
  // a `<Card>` inside a code sample is documentation, not a component.
  const en = componentCounts(strippedBody(englishRaw));
  const localized = componentCounts(strippedBody(localizedRaw));
  const missingComponents: Finding["missingComponents"] = [];
  const extraComponents: Finding["extraComponents"] = [];
  for (const label of Object.keys(en)) {
    const want = en[label] ?? 0;
    const have = localized[label] ?? 0;
    if (have < want) missingComponents.push({ label, en: want, localized: have });
  }
  for (const label of Object.keys(localized)) {
    const want = en[label] ?? 0;
    const have = localized[label] ?? 0;
    if (have > want) extraComponents.push({ label, en: want, localized: have });
  }
  const enLinks = assetLinks(strippedBody(englishRaw));
  const trLinks = assetLinks(strippedBody(localizedRaw));
  return {
    file,
    source,
    missingComponents,
    extraComponents,
    missingLinks: multisetDiff(enLinks, trLinks),
    extraLinks: multisetDiff(trLinks, enLinks),
  };
}

/** English counterpart of a localized path, or null when it does not exist. */
export function englishCounterpart(localized: string, repoRoot: string): string | null {
  const [locale, ...rest] = localized.split("/");
  if (!LOCALES.includes(locale)) return null;
  const en = rest.join("/");
  return existsSync(join(repoRoot, en)) ? en : null;
}

/** Localized counterparts of an English page, for locales where they exist. */
export function localizedCounterparts(english: string, repoRoot: string): string[] {
  return LOCALES.map((locale) => `${locale}/${english}`).filter((path) =>
    existsSync(join(repoRoot, path))
  );
}

/** Upstream generator note for externally generated pages, or null. */
export function externalSource(relativePath: string): string | null {
  const parts = relativePath.split("/");
  const rest = LOCALES.includes(parts[0]) ? parts.slice(1).join("/") : relativePath;
  const hit = EXTERNAL_SOURCE_PATTERNS.find(({ re }) => re.test(rest));
  return hit ? hit.note : null;
}

export function isExempt(relativePath: string): boolean {
  const parts = relativePath.split("/");
  const rest = LOCALES.includes(parts[0]) ? parts.slice(1).join("/") : relativePath;
  return EXEMPT_PATTERNS.some((re) => re.test(rest));
}

function sh(cmd: string[], cwd: string): string {
  return execFileSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf8" });
}

/**
 * The repository this run inspects: the git work tree containing the working
 * directory, so the script can be invoked from any checkout (CI runs it from the
 * repo root; tooling may call it from elsewhere).
 */
export function resolveRepoRoot(cwd = process.cwd()): string {
  try {
    return sh(["git", "rev-parse", "--show-toplevel"], cwd).trim();
  } catch {
    return join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  }
}

function changedFiles(repoRoot: string, base: string, paths: string[]): string[] {
  // A force-push can leave the base SHA unreachable; fall back to the previous
  // commit so the gate still sees the change instead of crashing.
  let out = "";
  for (const range of [`${base}...HEAD`, "HEAD~1...HEAD"]) {
    try {
      out = sh(["git", "diff", "--name-only", range, "--", ...paths], repoRoot);
      break;
    } catch {
      // try the next range
    }
  }
  let unstaged = "";
  try {
    unstaged = sh(["git", "diff", "--name-only", "--", ...paths], repoRoot);
  } catch {
    unstaged = "";
  }
  return [
    ...new Set(
      [...out.split("\n"), ...unstaged.split("\n")]
        .map((line) => line.trim())
        .filter((line) => line.endsWith(".mdx"))
    ),
  ];
}

export function changedLocalizedFiles(repoRoot: string, base: string): string[] {
  return changedFiles(repoRoot, base, LOCALES);
}

export function changedEnglishFiles(repoRoot: string, base: string): string[] {
  const candidates = changedFiles(repoRoot, base, ["."]);
  return candidates.filter(
    (path) => !LOCALES.includes(path.split("/")[0]) && !isExempt(path)
  );
}

function allLocalizedFiles(repoRoot: string): string[] {
  return sh(["git", "ls-files", "--", ...LOCALES], repoRoot)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".mdx"));
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function gitShow(repoRoot: string, ref: string, path: string): string | null {
  try {
    return sh(["git", "show", `${ref}:${path}`], repoRoot);
  } catch {
    return null; // added in this change, or unreachable ref
  }
}

/**
 * Does this change own the gap? The counterpart counts as "in parity before the
 * change" when its gaps were no larger before: a gap that already existed is
 * historical debt (warning), a gap the change introduced is this PR's to fix.
 */
export function introducesNewGap(finding: Finding, baseFinding: Finding): boolean {
  const baseGaps = new Map(baseFinding.missingComponents.map((c) => [c.label, c.en - c.localized]));
  for (const c of finding.missingComponents) {
    if (c.en - c.localized > (baseGaps.get(c.label) ?? 0)) return true;
  }

  return multisetDiff(finding.missingLinks, baseFinding.missingLinks).length > 0;
}

function main(): void {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const json = argv.includes("--json");
  const baseArg = argv.find((a) => a.startsWith("--base="));
  const base = baseArg ? baseArg.slice("--base=".length) : process.env.STRUCTURE_PARITY_BASE || "origin/main";
  const repoRoot = resolveRepoRoot();

  const failures: Finding[] = [];
  const warnings: Finding[] = [];
  const file = (finding: Finding, failed: boolean): void => {
    const interesting =
      failed || finding.extraComponents.length > 0 || finding.extraLinks.length > 0;
    if (!interesting) return; // a clean page is not a warning
    finding.note = externalSource(finding.file) ?? undefined;
    if (failed && !finding.note) failures.push(finding);
    else warnings.push(finding);
  };
  let checked = 0;
  let skipped = 0;

  if (all) {
    for (const localized of allLocalizedFiles(repoRoot)) {
      if (isExempt(localized)) continue;
      const en = englishCounterpart(localized, repoRoot);
      if (!en) {
        skipped += 1;
        continue;
      }
      checked += 1;
      const enRaw = readIfExists(join(repoRoot, en));
      const trRaw = readIfExists(join(repoRoot, localized));
      if (enRaw === null || trRaw === null) {
        skipped += 1;
        continue;
      }
      const finding = compare(enRaw, trRaw, localized);
      const failed = finding.missingComponents.length > 0 || finding.missingLinks.length > 0;
      file(finding, failed);
    }
  } else {
    // Direction 1: a localized page changed -> compare it with its English source.
    for (const localized of changedLocalizedFiles(repoRoot, base)) {
      if (isExempt(localized)) continue;
      const en = englishCounterpart(localized, repoRoot);
      if (!en) {
        skipped += 1;
        continue;
      }
      const enRaw = readIfExists(join(repoRoot, en));
      const trRaw = readIfExists(join(repoRoot, localized));
      if (enRaw === null || trRaw === null) {
        skipped += 1; // deleted or renamed away in this change
        continue;
      }
      checked += 1;
      const finding = compare(enRaw, trRaw, localized, "localized");
      const failed = finding.missingComponents.length > 0 || finding.missingLinks.length > 0;
      file(finding, failed);
    }

    // Direction 2: an English page changed -> check every existing counterpart.
    for (const english of changedEnglishFiles(repoRoot, base)) {
      if (isExempt(english)) continue;
      const baseRaw = gitShow(repoRoot, base, english);
      if (baseRaw === null) continue; // new page: translations do not exist yet
      const enRaw = readIfExists(join(repoRoot, english));
      if (enRaw === null) continue; // deleted page: the redirect check owns that
      for (const localized of localizedCounterparts(english, repoRoot)) {
        const trRaw = readIfExists(join(repoRoot, localized));
        if (trRaw === null) continue;
        checked += 1;
        const finding = compare(enRaw, trRaw, localized, "english");
        if (!finding.missingComponents.length && !finding.missingLinks.length) {
          file(finding, false);
          continue;
        }
        const baseFinding = compare(baseRaw, trRaw, localized, "english");
        file(finding, introducesNewGap(finding, baseFinding));
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ checked, skipped, failures, warnings }, null, 2));
  } else {
    for (const f of failures) {
      const cause =
        f.source === "english"
          ? "the English source changed and this translation is now stale"
          : "this translation lost structure the English source has";
      console.log(`\n✖ ${f.file} (${cause})`);
      for (const c of f.missingComponents) {
        console.log(`    ${c.label}: English ${c.en}, localized ${c.localized} (missing ${c.en - c.localized})`);
      }
      for (const link of f.missingLinks.slice(0, 8)) console.log(`    missing link: ${link}`);
      if (f.missingLinks.length > 8) console.log(`    ... and ${f.missingLinks.length - 8} more missing links`);
    }
    for (const f of warnings) {
      const extra = [
        ...f.missingComponents.map((c) => `${c.label} short by ${c.en - c.localized}`),
        ...f.extraComponents.map((c) => `${c.label} +${c.localized - c.en}`),
        ...f.extraLinks,
      ].join(", ");
      const kind = f.source === "english" ? "pre-existing drift, not caused by this change" : "extra content";
      console.log(`\n⚠ ${f.file}: ${f.note ?? kind} (${extra})`);
    }
    console.log(`\nchecked ${checked} localized file(s), skipped ${skipped}`);
    if (failures.length) {
      console.log(
        `\n${failures.length} comparison(s) failed. Restore the missing structure or links ` +
          `(keep hrefs byte-identical to English), or add the path to EXEMPT_PATTERNS with a reason.`
      );
    } else {
      console.log("\nStructure parity: OK");
    }
  }
  process.exit(failures.length ? 1 : 0);
}

if (import.meta.main) main();
