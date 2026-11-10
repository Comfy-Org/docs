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

`relink-links` only rewrites prose. Fenced code blocks (```/~~~, info string
included) and inline code spans are split out first and restored byte-for-byte,
so a documented URL inside a code sample is never localized. `prune-nav` drops
OpenAPI blocks only for a locale that has no localized `/<lang>/api-reference`
pages on disk; locales that ship a localized API reference keep it.

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

# A fence line: up to three spaces of indent, then ``` or ~~~, then an info string.
FENCE_OPEN_RE = re.compile(r"^(?P<indent> {0,3})(?P<fence>`{3,}|~{3,})(?P<info>.*)$")
BACKTICK_RUN_RE = re.compile(r"`+")


def split_code_segments(text: str) -> list[tuple[bool, str]]:
    """Split `text` into `(is_code, chunk)` pairs; "".join(chunks) == text.

    Fenced blocks (both fence lines and their body, info string included) come
    back as code chunks so callers can leave them byte-for-byte untouched.
    """
    segments: list[tuple[bool, str]] = []
    prose: list[str] = []
    code: list[str] = []
    fence_char = ""
    fence_len = 0

    def flush_prose() -> None:
        if prose:
            segments.append((False, "".join(prose)))
            prose.clear()

    def flush_code() -> None:
        if code:
            segments.append((True, "".join(code)))
            code.clear()

    for line in text.splitlines(keepends=True):
        match = FENCE_OPEN_RE.match(line.rstrip("\r\n"))
        if fence_char:
            code.append(line)
            # A closing fence is the same character, at least as long, no info string.
            if match and match.group("fence")[0] == fence_char:
                if len(match.group("fence")) >= fence_len and not match.group("info").strip():
                    fence_char = ""
                    flush_code()
            continue
        if match:
            flush_prose()
            fence_char = match.group("fence")[0]
            fence_len = len(match.group("fence"))
            code.append(line)
            continue
        prose.append(line)

    flush_prose()
    flush_code()
    return segments


def split_inline_code(chunk: str) -> list[tuple[bool, str]]:
    """Split a prose chunk at inline code spans; "".join(chunks) == chunk.

    A span opens on a backtick run and closes on the next run of exactly the
    same length (CommonMark). An unmatched run is literal text, and a span never
    crosses a blank line.
    """
    segments: list[tuple[bool, str]] = []
    pos = 0
    cursor = 0
    while True:
        opening = BACKTICK_RUN_RE.search(chunk, cursor)
        if opening is None:
            break
        if opening.start() > 0 and chunk[opening.start() - 1] == "\\":
            cursor = opening.end()  # escaped backtick: literal, not a span
            continue
        run_len = opening.end() - opening.start()
        limit = chunk.find("\n\n", opening.end())
        closing = None
        search_from = opening.end()
        while True:
            candidate = BACKTICK_RUN_RE.search(chunk, search_from)
            if candidate is None:
                break
            if limit != -1 and candidate.start() > limit:
                break
            if candidate.end() - candidate.start() == run_len:
                closing = candidate
                break
            search_from = candidate.end()
        if closing is None:
            cursor = opening.end()
            continue
        if opening.start() > pos:
            segments.append((False, chunk[pos : opening.start()]))
        segments.append((True, chunk[opening.start() : closing.end()]))
        pos = closing.end()
        cursor = pos
    if pos < len(chunk):
        segments.append((False, chunk[pos:]))
    return segments


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

        def relink_prose(segment: str) -> str:
            out = segment
            for pattern in LINK_PATTERNS:
                out = pattern.sub(repl, out)
            return out

        pieces: list[str] = []
        for is_code, chunk in split_code_segments(text):
            if is_code:
                pieces.append(chunk)  # fenced code: never rewritten
                continue
            for is_span, part in split_inline_code(chunk):
                pieces.append(part if is_span else relink_prose(part))
        return "".join(pieces), added, removed


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


def has_localized_api_reference(lang: str) -> bool:
    """True when `/<lang>/api-reference` holds at least one localized page."""
    root = os.path.join(REPO_ROOT, lang, "api-reference")
    if not os.path.isdir(root):
        return False
    for _root, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
        if any(name.endswith((".mdx", ".md")) for name in names):
            return True
    return False


def prune_nodes(nodes: list, drop_openapi: bool = True) -> list:
    """Drop groups/OpenAPI blocks that have no page leaves.

    OpenAPI blocks are generated from a spec, so they carry no `pages` of their
    own: they are dropped only when the locale has no localized API reference on
    disk (`drop_openapi`), which keeps working tabs for zh/ja/ko.
    """
    out: list = []
    for node in nodes:
        if isinstance(node, str):
            out.append(node)
            continue
        if not isinstance(node, dict):
            continue
        if node.get("openapi") is not None:
            if drop_openapi:
                continue
            # Generated from a spec: it has no page leaves of its own to prune.
            out.append(node)
            continue
        pages = prune_nodes(node.get("pages") or [], drop_openapi)
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
    # zh/ja/ko ship a localized api-reference directory; es (and any locale
    # without one) has nothing to point those tabs at yet.
    drop_openapi = not has_localized_api_reference(args.lang)
    for tab in target.get("tabs", []):
        if isinstance(tab, dict) and isinstance(tab.get("pages"), list):
            tab["pages"] = prune_nodes(tab["pages"], drop_openapi)
    kept_tabs = []
    for tab in target.get("tabs", []):
        if not isinstance(tab, dict):
            continue
        # An OpenAPI tab carries its pages in the spec, so it is kept only for a
        # locale that actually ships that API reference.
        if tab.get("pages") or (tab.get("openapi") is not None and not drop_openapi):
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
                default="zh,ja,ko,es",
                help="comma separated other locale codes to leave untouched",
            )

    args = parser.parse_args()
    if args.command == "relink-links":
        return cmd_relink_links(args)
    return cmd_prune_nav(args)


if __name__ == "__main__":
    sys.exit(main())
