#!/usr/bin/env bun
/**
 * Structure parity check for localized pages.
 *
 * A translated page must carry the same MDX structure as its English source:
 * the same cards, the same CardGroup wrappers around them, the same images and
 * the same asset links. When a localized page is translated before the English
 * page gained that structure (or when a translation drops it), nothing else
 * catches it: `translate:dry-run` compares section hashes only, `mint-checks`
 * only fails on broken links, and the markdown renders without the missing
 * pieces. The result is a page that quietly loses its download cards, workflow
 * previews or card grouping, which is exactly what this gate reports.
 *
 * What it compares, per localized file with an English counterpart:
 *   - component counts: Card, CardGroup, Tab, Tabs, tip-style callouts, Steps,
 *     Step, Accordion, AccordionGroup, Frame, Columns, Tiles
 *   - images: `<img ...>` and `![alt](...)`
 *   - asset links: raw.githubusercontent.com, github.com/Comfy-Org/*,
 *     cloud.comfy.org (a localized page must not drop one the English page has)
 *
 * Missing elements and links fail the run. Extra elements are reported as
 * warnings, because a locale may legitimately add something (the zh home page
 * carries an extra social icon).
 *
 * Usage:
 *   bun .github/scripts/i18n/check-structure-parity.ts               # changed files vs origin/main
 *   bun .github/scripts/i18n/check-structure-parity.ts --all         # whole repo, backlog report
 *   bun .github/scripts/i18n/check-structure-parity.ts --base=<ref>  # explicit base
 *   bun .github/scripts/i18n/check-structure-parity.ts --json        # machine readable
 *
 * In CI the base comes from STRUCTURE_PARITY_BASE (the PR base SHA or the
 * previous commit on push), matching the anchor check.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const LOCALES = ["ja", "zh", "ko"];

/** Paths that are not one-to-one translations of an English page. */
const EXEMPT_PATTERNS: RegExp[] = [
  /^pricing\.mdx$/, // pricing is translated by hand, allowed to differ
  /(^|\/)api-reference\//, // generated from the OpenAPI spec
  /^snippets\//, // snippets are imported, not standalone pages
  /^comfy-router-[^/]+\.mdx$/, // legacy orphans with no English source
  /^changelog\//, // CMS changelog pipeline, separate from docs translation
];

const COMPONENTS: { label: string; re: RegExp }[] = [
  { label: "Card", re: /<Card[\s>/]/g },
  { label: "CardGroup", re: /<CardGroup[\s>/]/g },
  { label: "Tab", re: /<Tab[\s>/]/g },
  { label: "Tabs", re: /<Tabs[\s>/]/g },
  { label: "callout", re: /<(Tip|Note|Warning|Info|Check|Danger)[\s>/]/g },
  { label: "Steps", re: /<Steps[\s>/]/g },
  { label: "Step", re: /<Step[\s>/]/g },
  { label: "Accordion", re: /<Accordion[\s>/]/g },
  { label: "AccordionGroup", re: /<AccordionGroup[\s>/]/g },
  { label: "Frame", re: /<Frame[\s>/]/g },
  { label: "Columns", re: /<Columns[\s>/]/g },
  { label: "Tiles", re: /<Tiles[\s>/]/g },
  { label: "image", re: /<img[\s>/]|!\[[^\]]*\]\(/g },
  { label: "h2", re: /^## /gm },
  { label: "h3", re: /^### /gm },
  { label: "h4", re: /^#### /gm },
];

const ASSET_HOSTS = [
  "raw.githubusercontent.com",
  "github.com/Comfy-Org/",
  "cloud.comfy.org",
];

export interface Counts {
  [label: string]: number;
}

/**
 * Drop frontmatter and fenced code blocks so component-looking text inside a
 * code sample is never counted.
 */
export function strippedBody(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && inFrontmatter) continue;
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function countComponents(body: string): Counts {
  const counts: Counts = {};
  for (const { label, re } of COMPONENTS) {
    counts[label] = (body.match(re) ?? []).length;
  }
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
  const re = /https:\/\/[^\s)"'<>\]`]+/g;
  for (const match of body.match(re) ?? []) {
    const url = normalizeAssetUrl(match);
    if (ASSET_HOSTS.some((host) => url.includes(host))) found.push(url);
  }
  return found;
}

function multisetDiff(want: string[], have: string[]): string[] {
  const remaining = [...have];
  const missing: string[] = [];
  for (const item of want) {
    const at = remaining.indexOf(item);
    if (at === -1) missing.push(item);
    else remaining.splice(at, 1);
  }
  return missing;
}

export interface Finding {
  file: string;
  missingComponents: { label: string; en: number; localized: number }[];
  extraComponents: { label: string; en: number; localized: number }[];
  missingLinks: string[];
  extraLinks: string[];
}

export function compare(enRaw: string, localizedRaw: string, file: string): Finding {
  // Strip frontmatter and fenced code here so every caller gets the same view:
  // a `<Card>` inside a code sample is documentation, not a component.
  const enBody = strippedBody(enRaw);
  const localizedBody = strippedBody(localizedRaw);
  const en = countComponents(enBody);
  const localized = countComponents(localizedBody);
  const missingComponents: Finding["missingComponents"] = [];
  const extraComponents: Finding["extraComponents"] = [];
  for (const { label } of COMPONENTS) {
    const want = en[label] ?? 0;
    const have = localized[label] ?? 0;
    if (have < want) missingComponents.push({ label, en: want, localized: have });
    else if (have > want) extraComponents.push({ label, en: want, localized: have });
  }
  const missingLinks = multisetDiff(assetLinks(enBody), assetLinks(localizedBody));
  const extraLinks = multisetDiff(assetLinks(localizedBody), assetLinks(enBody));
  return { file, missingComponents, extraComponents, missingLinks, extraLinks };
}

/** English counterpart of a localized path, or null when it does not exist. */
export function englishCounterpart(localized: string, repoRoot: string): string | null {
  const [locale, ...rest] = localized.split("/");
  if (!LOCALES.includes(locale)) return null;
  const en = rest.join("/");
  return existsSync(join(repoRoot, en)) ? en : null;
}

export function isExempt(localized: string): boolean {
  const [locale, ...rest] = localized.split("/");
  if (!LOCALES.includes(locale)) return false;
  return EXEMPT_PATTERNS.some((re) => re.test(rest.join("/")));
}

/**
 * The repository this run inspects: the git work tree containing the working
 * directory, so the script can be invoked from any checkout (CI runs it from the
 * repo root; tooling may call it from elsewhere).
 */
export function resolveRepoRoot(): string {
  try {
    return sh(["git", "rev-parse", "--show-toplevel"], process.cwd()).trim();
  } catch {
    return join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  }
}

function sh(cmd: string[], cwd: string): string {
  return execFileSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf8" });
}

export function changedLocalizedFiles(repoRoot: string, base: string): string[] {
  // A force-push can leave the base SHA unreachable; fall back to the previous
  // commit so the gate still sees the change instead of crashing.
  let out = "";
  for (const range of [`${base}...HEAD`, "HEAD~1...HEAD"]) {
    try {
      out = sh(["git", "diff", "--name-only", range, "--", ...LOCALES], repoRoot);
      break;
    } catch {
      // try the next range
    }
  }
  let unstaged = "";
  try {
    unstaged = sh(["git", "diff", "--name-only", "--", ...LOCALES], repoRoot);
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

export function allLocalizedFiles(repoRoot: string): string[] {
  const out = sh(["git", "ls-files", "--", ...LOCALES], repoRoot);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".mdx"));
}

function main(): void {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const json = argv.includes("--json");
  const baseArg = argv.find((a) => a.startsWith("--base="));
  const base = baseArg ? baseArg.slice("--base=".length) : process.env.STRUCTURE_PARITY_BASE || "origin/main";
  const repoRoot = resolveRepoRoot();

  const candidates = all ? allLocalizedFiles(repoRoot) : changedLocalizedFiles(repoRoot, base);
  const findings: Finding[] = [];
  let checked = 0;
  let skippedNoEnglish = 0;

  for (const localized of candidates) {
    if (isExempt(localized)) continue;
    const en = englishCounterpart(localized, repoRoot);
    if (!en) {
      skippedNoEnglish += 1;
      continue;
    }
    checked += 1;
    const finding = compare(
      readFileSync(join(repoRoot, en), "utf8"),
      readFileSync(join(repoRoot, localized), "utf8"),
      localized
    );
    if (finding.missingComponents.length || finding.missingLinks.length) findings.push(finding);
    else if (finding.extraComponents.length || finding.extraLinks.length) findings.push(finding);
  }

  const failing = findings.filter((f) => f.missingComponents.length || f.missingLinks.length);
  const warnings = findings.filter((f) => !f.missingComponents.length && !f.missingLinks.length);

  if (json) {
    console.log(JSON.stringify({ checked, skippedNoEnglish, failing, warnings }, null, 2));
  } else {
    for (const f of failing) {
      console.log(`\n✖ ${f.file}`);
      for (const c of f.missingComponents) {
        console.log(`    ${c.label}: English ${c.en}, localized ${c.localized} (missing ${c.en - c.localized})`);
      }
      for (const link of f.missingLinks.slice(0, 8)) console.log(`    missing link: ${link}`);
      if (f.missingLinks.length > 8) console.log(`    ... and ${f.missingLinks.length - 8} more missing links`);
    }
    for (const f of warnings) {
      const extra = [...f.extraComponents.map((c) => c.label), ...f.extraLinks].join(", ");
      console.log(`\n⚠ ${f.file}: extra content vs English (${extra})`);
    }
    console.log(
      `\nchecked ${checked} localized file(s), skipped ${skippedNoEnglish} without an English counterpart`
    );
    if (failing.length) {
      console.log(
        `\n${failing.length} file(s) lost structure or links that the English source has. ` +
          `Restore them (keep hrefs byte-identical to English) or add the path to EXEMPT_PATTERNS with a reason.`
      );
    } else {
      console.log("\nStructure parity: OK");
    }
  }
  process.exit(failing.length ? 1 : 0);
}

if (import.meta.main) main();
void relative;
