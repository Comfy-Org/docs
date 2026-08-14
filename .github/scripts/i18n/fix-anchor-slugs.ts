#!/usr/bin/env bun
/**
 * Fix broken anchor fragments in translated MDX.
 *
 * Why this exists: translation localizes heading text, and Mintlify derives
 * heading slugs from the *localized* text — but internal links in translated
 * files keep the original English anchor fragment (`[フィードバック](#feedback)`
 * while the target page heading is `## フィードバック` → real anchor
 * `#フィードバック`). The result is dead anchors on translated pages, which
 * the `check-anchors` CI job then flags on every PR that touches those files.
 *
 * This script rewrites such fragments to the actual anchor of the target
 * translated page. It is idempotent: links whose anchor already resolves are
 * left untouched.
 *
 * Resolution strategy per link:
 *   1. If the anchor already exists on the target translated page → skip.
 *   2. English-order alignment: the translated page mirrors the English page's
 *      heading/component order, so the English anchor's index in the English
 *      page maps to the corresponding localized slug in the translated page.
 *      Only applied when both pages expose the same number of anchors.
 *   3. Otherwise the link is reported for manual review.
 *
 * Usage:
 *   pnpm translate:fix-anchors                     # fix all translated pages + snippets
 *   pnpm translate:fix-anchors -- --lang ko        # one language
 *   pnpm translate:fix-anchors -- --dry-run        # report only
 *   pnpm translate:fix-anchors -- --snippets       # snippets only
 *   pnpm translate:fix-anchors -- path/to/page.mdx # specific file(s)
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import {
  loadI18nConfig,
  REPO_ROOT,
  parseLangArg as parseLangArgFromConfig,
} from "./i18n-config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

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

const LANG_DIRS = config.languages.map((l) => l.dir);
const SNIPPET_DIRS = config.languages.map((l) => l.snippets_dir);

/** Mintlify heading-slug approximation, mirroring check-anchors.py. */
export function slugify(text: string): string {
  let t = text.replace(/\\_/g, "-").toLowerCase();
  // Mintlify keeps full-width CJK punctuation in anchors (U+FF08/FF09 etc.).
  const fullwidth = new Set(["\uff08", "\uff09", "\u3001", "\u3002"]);
  const out: string[] = [];
  for (const ch of t) {
    if (fullwidth.has(ch)) {
      out.push(ch);
      continue;
    }
    const norm = ch.normalize("NFKC");
    if (/[\p{L}\p{N}]/u.test(norm) || "+-_".includes(norm)) {
      out.push(norm);
    } else if (norm === " " || norm === "\t") {
      out.push(" ");
    } else if (norm === ".") {
      out.push("-");
    }
    // everything else dropped (punctuation like : ( ) ? , & / >)
  }
  let slug = out.join("");
  slug = slug.replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  slug = slug.replace(/-{2,}/g, "-");
  return slug;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const EXPLICIT_ANCHOR_RE = /\{#([^}]+)\}$/;
const ID_ATTR_RE =
  /<(?:a|span|div|section|h[1-6]|li|p|td|th)[^>]*\bid\s*=\s*["']([^"']+)["']/;
const COMPONENT_TITLE_RE =
  /<(Tab|Accordion|Step|TabItem|Card)[^>]*\btitle\s*=\s*["']([^"']+)["']/;
const SNIPPET_IMPORT_RE =
  /import\s+[^"']+\s+from\s+["'](\/snippets\/[^"']+)["']/;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/;
const HTML_HREF_RE = /<a[^>]*\bhref\s*=\s*["']([^"']+)["']/;

/** Ordered anchors a page provides: heading slugs, {#..} ids, id attrs,
 *  component titles, and anchors from imported snippets. */
export function collectAnchors(path: string): string[] {
  const anchors: string[] = [];
  const seenFiles = new Set<string>();
  const walk = (p: string) => {
    const full = p.startsWith("/") ? p : join(REPO_ROOT, p);
    if (seenFiles.has(full)) return;
    seenFiles.add(full);
    let content: string;
    try {
      content = readFileSyncSafe(full);
    } catch {
      return;
    }
    for (const line of content.split("\n")) {
      const stripped = line.trimStart();
      if (stripped.startsWith("```") || stripped.startsWith("~~~")) continue;
      const hm = HEADING_RE.exec(stripped);
      if (hm) {
        const ht = hm[2].trim();
        const em = EXPLICIT_ANCHOR_RE.exec(ht);
        if (em) {
          anchors.push(em[1]);
          const pre = ht.slice(0, em.index).trim();
          if (pre) anchors.push(slugify(pre));
        } else {
          anchors.push(slugify(ht));
        }
      }
      for (const m of COMPONENT_TITLE_RE[Symbol.matchAll](stripped) ?? []) {
        anchors.push(slugify(m[2]));
      }
      for (const m of ID_ATTR_RE[Symbol.matchAll](stripped) ?? []) {
        anchors.push(m[1]);
      }
      for (const m of SNIPPET_IMPORT_RE[Symbol.matchAll](line) ?? []) {
        walk(join(REPO_ROOT, m[1].replace(/^\//, "")));
      }
    }
  };
  walk(path);
  return anchors;
}

function readFileSyncSafe(p: string): string {
  // small helper to keep collectAnchors synchronous like check-anchors.py
  const fs = require("fs") as typeof import("fs");
  return fs.readFileSync(p, "utf-8");
}

/** Translate page path → English counterpart (ja/foo.mdx → foo.mdx). */
export function englishPathFor(target: string): string | null {
  for (const d of [...LANG_DIRS, ...SNIPPET_DIRS]) {
    if (target.startsWith(d + "/")) {
      const rest = target.slice(d.length + 1);
      if (d.startsWith("snippets/")) return `snippets/${rest}`;
      return rest;
    }
  }
  return null;
}

/** Resolve a link URL from a source file to (targetPath, anchor) or null. */
function resolveTarget(srcFile: string, url: string): { target: string; anchor: string } | null {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/.test(u)) return null;
  const hashIdx = u.indexOf("#");
  if (hashIdx === -1) return null;
  const base = u.slice(0, hashIdx).split("?")[0];
  const anchor = decodeURIComponent(u.slice(hashIdx + 1)).trim();
  if (!anchor) return null;

  let target: string;
  if (base === "") {
    target = srcFile;
  } else if (base.startsWith("/")) {
    target = base.replace(/^\//, "");
  } else {
    target = resolve(dirname(join(REPO_ROOT, srcFile)), base)
      .replace(REPO_ROOT + "/", "")
      .replace(/\\/g, "/");
  }
  if (!target.endsWith(".mdx") && !target.endsWith(".md")) target += ".mdx";
  return { target, anchor };
}

/** Is this path a translated page/snippet that this script owns? */
function isTranslatedPath(p: string): boolean {
  return [...LANG_DIRS, ...SNIPPET_DIRS].some((d) => p.startsWith(d + "/"));
}

interface AnchorIssue {
  file: string;
  line: number;
  url: string;
  target: string;
  anchor: string;
}

/** Scan one file for broken anchor links (internal links whose fragment does
 *  not resolve on the target translated page). */
export function scanFileForAnchorIssues(file: string): AnchorIssue[] {
  const content = readFileSyncSafe(file);
  const issues: AnchorIssue[] = [];
  const lines = content.split("\n");
  let inFence = false;
  let fenceMarker = "";
  const anchorCache = new Map<string, Set<string>>();
  const anchorIndexCache = new Map<string, string[]>();

  const anchorsSet = (p: string) => {
    if (!anchorCache.has(p)) anchorCache.set(p, new Set(collectAnchors(p)));
    return anchorCache.get(p)!;
  };
  const anchorsList = (p: string) => {
    if (!anchorIndexCache.has(p)) anchorIndexCache.set(p, collectAnchors(p));
    return anchorIndexCache.get(p)!;
  };

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trimStart();
    const fenceMatch = /^(```+|~~~+)/.exec(stripped);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (
        marker[0] === fenceMarker[0] &&
        marker.length >= fenceMarker.length &&
        !stripped.slice(marker.length).trim()
      ) {
        // CommonMark: a closing fence uses the same char, length >= opening,
        // and only whitespace after it (matches check-anchors.py).
        inFence = false;
        fenceMarker = "";
      }
      // otherwise: fenced line with trailing content (e.g. ```Schema``` text)
      // is NOT a closer; stay in fence, same as check-anchors.py.
      continue;
    }
    if (inFence) continue;
    for (const m of MD_LINK_RE[Symbol.matchAll](lines[i]) ?? []) {
      const resolved = resolveTarget(file, m[2]);
      if (!resolved) continue;
      const { target, anchor } = resolved;
      if (!isTranslatedPath(target)) continue;
      if (anchorsSet(target).has(anchor)) continue;
      issues.push({ file, line: i + 1, url: m[2], target, anchor });
    }
    for (const m of HTML_HREF_RE[Symbol.matchAll](lines[i]) ?? []) {
      const resolved = resolveTarget(file, m[1]);
      if (!resolved) continue;
      const { target, anchor } = resolved;
      if (!isTranslatedPath(target)) continue;
      if (anchorsSet(target).has(anchor)) continue;
      issues.push({ file, line: i + 1, url: m[1], target, anchor });
    }
  }
  return issues;
}

/** Find the correct localized anchor for a broken (target, anchor) pair, or
 *  null when it cannot be determined automatically. */
export function suggestAnchorFix(target: string, anchor: string): string | null {
  const targetAnchors = collectAnchors(target);
  const targetSet = new Set(targetAnchors);
  if (targetSet.has(anchor)) return null; // already fine

  const enPath = englishPathFor(target);
  if (!enPath || !existsSync(join(REPO_ROOT, enPath))) return null;

  const enAnchors = collectAnchors(enPath);
  if (enAnchors.length === 0 || enAnchors.length !== targetAnchors.length) {
    return null; // structure drifted; do not guess
  }
  const idx = enAnchors.indexOf(anchor);
  if (idx !== -1) {
    return targetAnchors[idx];
  }

  // Fallback: hyphen/underscore drift (e.g. link `#validate-inputs` but the
  // heading `VALIDATE_INPUTS` slugs to `validate_inputs`). Only accept when a
  // single target anchor normalizes to the same token sequence.
  const norm = (s: string) => s.replace(/_/g, "-");
  const want = norm(anchor);
  for (const cand of targetAnchors) {
    if (norm(cand) === want) return cand;
  }
  return null;
}

export interface FixStats {
  scanned: number;
  fixed: number;
  unresolved: number;
  issues: AnchorIssue[];
}

/** Scan and fix broken anchors across translated pages/snippets. */
export async function fixAnchorSlugs(opts: {
  langs?: LangConfig[];
  snippetsMode?: boolean;
  fileArgs?: string[];
  dryRun?: boolean;
}): Promise<FixStats> {
  const { dryRun = false, snippetsMode = false, fileArgs = [] } = opts;
  const langs = opts.langs ?? config.languages;

  // collect translated files to scan
  const files: string[] = [];
  const dirs: string[] = [];
  for (const lang of langs) {
    dirs.push(snippetsMode ? lang.snippets_dir : lang.dir);
  }
  const explicit = fileArgs
    .map((f) => f.replace(/^\//, ""))
    .filter((f) => isTranslatedPath(f));

  if (explicit.length > 0) {
    files.push(...explicit);
  } else {
    for (const dir of dirs) {
      const abs = join(REPO_ROOT, dir);
      if (!existsSync(abs)) continue;
      const walk = (d: string) => {
        for (const entry of require("fs").readdirSync(d, { withFileTypes: true })) {
          const p = join(d, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) files.push(relative(REPO_ROOT, p));
        }
      };
      walk(abs);
    }
  }

  const stats: FixStats = { scanned: 0, fixed: 0, unresolved: 0, issues: [] };
  const byFile = new Map<string, { line: number; url: string; target: string; anchor: string; fix: string | null }[]>();

  for (const f of files) {
    const issues = scanFileForAnchorIssues(f);
    if (issues.length === 0) continue;
    stats.scanned++;
    for (const issue of issues) {
      const fix = suggestAnchorFix(issue.target, issue.anchor);
      if (fix) {
        stats.fixed++;
      } else {
        stats.unresolved++;
      }
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f)!.push({ ...issue, fix });
    }
  }

  if (dryRun) {
    for (const [f, items] of byFile) {
      for (const it of items) {
        const status = it.fix ? "FIX" : "MANUAL";
        console.log(`[${status}] ${f}:${it.line} #${it.anchor} → ${it.fix ?? "(needs manual)"}`);
      }
    }
  } else {
    for (const [f, items] of byFile) {
      const full = join(REPO_ROOT, f);
      const lines = (await readFile(full, "utf-8")).split("\n");
      for (const it of items) {
        if (!it.fix) continue;
        const line = lines[it.line - 1];
        const encoded = "#" + encodeURIComponent(it.anchor);
        const newFrag = "#" + it.fix;
        if (line.includes(encoded)) {
          lines[it.line - 1] = line.replace(encoded, newFrag, 1);
        } else if (line.includes("#" + it.anchor)) {
          lines[it.line - 1] = line.replace("#" + it.anchor, newFrag, 1);
        } else {
          console.warn(`  ! pattern not found: ${f}:${it.line} (${it.url})`);
          stats.fixed--;
          continue;
        }
      }
      await writeFile(full, lines.join("\n"));
    }
    for (const [f, items] of byFile) {
      for (const it of items) {
        if (it.fix) {
          console.log(`[FIX] ${f}:${it.line} #${it.anchor} → #${it.fix}`);
        } else {
          console.log(`[MANUAL] ${f}:${it.line} #${it.anchor} (target ${it.target})`);
        }
      }
    }
  }
  return stats;
}

function parseLangArg(args: string[]): LangConfig[] {
  try {
    return parseLangArgFromConfig(args, config.languages) as LangConfig[];
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const snippetsMode = args.includes("--snippets") || args.includes("--snippets-only");
  const langs = parseLangArg(args);
  const fileArgs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");

  const stats = await fixAnchorSlugs({ langs, snippetsMode, fileArgs, dryRun });
  console.log(
    `\nAnchor fix: ${stats.fixed} fixed, ${stats.unresolved} need manual review, ${stats.scanned} file(s) scanned.`
  );
  if (stats.unresolved > 0) {
    console.log("Run with --dry-run to list unresolved links for manual review.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
