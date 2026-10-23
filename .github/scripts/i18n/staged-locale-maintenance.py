#!/usr/bin/env python3
"""Maintenance for a locale that is being rolled out page by page.

A locale can go live before the whole English tree is translated: docs.json
navigation entries are pruned to the pages that exist (sync-docs-json.mjs does
that) and the locale grows batch by batch. Two gaps are left over, both fixed
here:

  relink-links  `translate-i18n.ts` localizes every internal link to
                `/<lang>/...` and every import to `/snippets/<lang>/...`. When
                the target page has not been translated yet the link 404s and
                `mint broken-links` fails. This rewrites links whose localized
                target does not exist back to the English path, and localizes
                links whose target has just landed.

  prune-nav     docs.json keeps every top-level tab (and OpenAPI groups) even
                when a locale has no pages in them, so the sidebar shows empty
                sections. This drops groups with no page leaves.

Both are idempotent: run them after every translation batch.

Usage:
  python3 .github/scripts/i18n/staged-locale-maintenance.py relink-links --lang es [--dry-run] [--check]
  python3 .github/scripts/i18n/staged-locale-maintenance.py prune-nav    --lang es [--dry-run] [--check]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

LINK_PATTERNS = (
    # markdown links and JSX href/src attributes
    re.compile(r'(?P<pre>\bhref="|src="|\]\()(?P<path>/[^")\s]*)'),
    # snippet imports: from "/snippets/foo.mdx" (closing quote not consumed)
    re.compile(r'(?P<pre>\bfrom\s+")(?P<path>/snippets/[^"]*)(?=")'),
)


def page_file_exists(repo_rel: str) -> bool:
    """True when a page file exists for a site path like `installation/foo`."""
    rel = repo_rel.strip("/")
    if not rel:
        return False
    path = os.path.join(REPO_ROOT, rel)
    if path.endswith((".mdx", ".md")) and os.path.isfile(path):
        return True  # snippet imports already carry the extension
    for ext in (".mdx", ".md", ".json"):
        if os.path.isfile(path + ext):
            return True
    for ext in (".mdx", ".md"):
        if os.path.isfile(os.path.join(path, "index" + ext)):
            return True
    return False


def split_suffix(url: str) -> tuple[str, str]:
    """Split `/a/b#c?d` into (path, suffix)."""
    for i, ch in enumerate(url):
        if ch in "#?":
            return url[:i], url[i:]
    return url, ""


class Relinker:
    def __init__(self, lang: str, other_locales: list[str]) -> None:
        self.lang = lang
        self.other_locales = [c for c in other_locales if c != lang]

    def relink(self, text: str) -> tuple[str, int, int]:
        added = 0
        removed = 0
        lang = self.lang

        def repl(match: re.Match[str]) -> str:
            nonlocal added, removed
            pre = match.group("pre")
            raw = match.group("path")
            path, suffix = split_suffix(raw)

            if path.startswith(("/images/", "/logo/", "/public/", "/http")):
                return match.group(0)

            is_snippet = path.startswith("/snippets/")
            rooted = "snippets/" if is_snippet else ""
            localized = f"/{rooted}{lang}/"
            for other in self.other_locales:
                if path.startswith(f"/{rooted}{other}/"):
                    return match.group(0)

            if path.startswith(localized):
                # locale prefix already applied: keep it only if the localized target exists
                rel = path[len(localized) :]
                if page_file_exists(f"{rooted}{lang}/{rel}"):
                    return match.group(0)
                removed += 1
                return f"{pre}/{rooted}{rel}{suffix}"

            # English link: localize it when the localized target exists.
            en_rel = path[len("/snippets/") :] if is_snippet else path[1:]
            if not page_file_exists(f"{rooted}{lang}/{en_rel}"):
                return match.group(0)
            added += 1
            return f"{pre}{localized}{en_rel}{suffix}"

        out = text
        for pattern in LINK_PATTERNS:
            out = pattern.sub(repl, out)
        return out, added, removed


def iter_locale_files(lang: str) -> list[str]:
    files: list[str] = []
    for base in (lang, os.path.join("snippets", lang)):
        root_dir = os.path.join(REPO_ROOT, base)
        for root, dirs, names in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
            for name in names:
                if name.endswith((".mdx", ".md")):
                    files.append(os.path.join(root, name))
    return files


def cmd_relink_links(args: argparse.Namespace) -> int:
    relinker = Relinker(args.lang, args.other_locales.split(","))
    changed = 0
    added_total = 0
    removed_total = 0

    for path in iter_locale_files(args.lang):
        with open(path, encoding="utf-8") as fh:
            original = fh.read()
        updated, added, removed = relinker.relink(original)
        if updated == original:
            continue
        changed += 1
        added_total += added
        removed_total += removed
        print(f"{added:+d}/{-removed:+d}  {os.path.relpath(path, REPO_ROOT)}")
        if not (args.dry_run or args.check):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(updated)

    print(
        f"\n{args.lang}: {changed} file(s) touched; "
        f"{added_total} link(s) localized, {removed_total} fell back to English"
    )
    return 1 if (args.check and changed) else 0


def prune_nodes(nodes: list) -> list:
    """Drop groups/OpenAPI blocks that have no page leaves."""
    out: list = []
    for node in nodes:
        if isinstance(node, str):
            out.append(node)
            continue
        if not isinstance(node, dict):
            continue
        if node.get("openapi") is not None:
            continue  # API reference has no localized pages yet
        pages = prune_nodes(node.get("pages") or [])
        if pages:
            out.append({**node, "pages": pages})
    return out


def cmd_prune_nav(args: argparse.Namespace) -> int:
    path = os.path.join(REPO_ROOT, "docs.json")
    with open(path, encoding="utf-8") as fh:
        raw = fh.read()
    docs = json.loads(raw)

    entries = docs.get("navigation", {}).get("languages", [])
    target = next((e for e in entries if e.get("language") == args.lang), None)
    if target is None:
        print(f"docs.json has no '{args.lang}' language entry", file=sys.stderr)
        return 2

    before = len(json.dumps(target, ensure_ascii=False))
    for tab in target.get("tabs", []):
        if isinstance(tab, dict) and isinstance(tab.get("pages"), list):
            tab["pages"] = prune_nodes(tab["pages"])
    kept_tabs = []
    for tab in target.get("tabs", []):
        if not isinstance(tab, dict):
            continue
        if tab.get("openapi") is not None or tab.get("pages"):
            kept_tabs.append(tab)
    target["tabs"] = kept_tabs
    after = len(json.dumps(target, ensure_ascii=False))

    if before == after:
        print(f"docs.json {args.lang} navigation: nothing to prune")
        return 0

    updated = json.dumps(docs, ensure_ascii=False, indent=2) + "\n"
    print(f"docs.json {args.lang} navigation pruned: {before} -> {after} chars")
    if not (args.dry_run or args.check):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(updated)
    return 1 if args.check else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    for name in ("relink-links", "prune-nav"):
        p = sub.add_parser(name)
        p.add_argument("--lang", required=True, help="locale code, e.g. es")
        p.add_argument("--dry-run", action="store_true")
        p.add_argument("--check", action="store_true", help="exit 1 if changes needed")
        if name == "relink-links":
            p.add_argument(
                "--other-locales",
                default="zh,ja,ko",
                help="comma separated other locale codes to leave untouched",
            )

    args = parser.parse_args()
    if args.command == "relink-links":
        return cmd_relink_links(args)
    return cmd_prune_nav(args)


if __name__ == "__main__":
    sys.exit(main())
