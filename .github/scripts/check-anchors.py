#!/usr/bin/env python3
"""Anchor link checker for ComfyUI docs (static, MDX-based).

Scans every markdown/html link with a #fragment in the docs, resolves the
target page from the local MDX tree, and verifies the anchor exists on the
target page by extracting its headings ({#custom-id} supported) and
id= attributes.

Usage:
  python3 check-anchors.py                  # check all docs
  python3 check-anchors.py --only-changed   # only files changed vs origin/main
  python3 check-anchors.py --file PATH      # check a single file (repeatable)
  python3 check-anchors.py --fix-suggest    # print closest-match suggestions
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import unicodedata
import urllib.parse

# ---------------------------------------------------------------- slug rules
# Mintlify heading-slug approximation (verified against live docs.comfy.org):
#   lowercase, strip punctuation (except + - _ . and unicode letters/digits),
#   collapse whitespace to single '-'. Escaped underscore `\_` in the source
#   renders as a hyphen in the slug (e.g. "Getting node\_id" -> getting-node-id),
#   while a plain underscore is kept ("VALIDATE_INPUTS" -> validate_inputs).
def slugify(text: str) -> str:
    # escaped underscore in markdown source -> hyphen in slug
    text = text.replace('\\_', '-')
    text = text.lower()
    # normalize unicode so e.g. full-width chars compare sanely
    text = unicodedata.normalize('NFKC', text)
    out = []
    for ch in text:
        if ch.isalnum() or ch in '+-_':
            out.append(ch)
        elif ch in ' \t':
            out.append(' ')
        # everything else dropped (punctuation like : ( ) ? . , & / >)
    slug = ''.join(out)
    slug = re.sub(r'\s+', '-', slug).strip('-')
    return slug


HEADING_RE = re.compile(r'^(#{1,6})\s+(.+?)\s*$')
EXPLICIT_ANCHOR_RE = re.compile(r'\{#([^}]+)\}$')
FENCE_RE = re.compile(r'^(```+|~~~+)')
MD_LINK_RE = re.compile(r'\[([^\]]*)\]\(([^)]+)\)')
HTML_HREF_RE = re.compile(r'href\s*=\s*["\']([^"\']+)["\']')
ID_ATTR_RE = re.compile(r'<(?:a|span|div|section|h[1-6]|li|p|td|th)[^>]*\bid\s*=\s*["\']([^"\']+)["\']')
# Mintlify components that generate heading anchors from their `title` prop.
COMPONENT_TITLE_RE = re.compile(
    r'<(Tab|Accordion|Step|TabItem|Card)[^>]*\btitle\s*=\s*["\']([^"\']+)["\']')


def collect_anchors(path: str) -> set:
    """All anchors a page provides: heading slugs, {#..} ids, id= attrs.

    Also follows MDX snippet imports (`import X from "/snippets/..."`) so
    anchors defined inside imported snippets count as page anchors.
    """
    anchors = set()
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return anchors

    in_fence = False
    for line in content.split('\n'):
        stripped = line.lstrip()
        m = FENCE_RE.match(stripped)
        if m:
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        hm = HEADING_RE.match(stripped)
        if hm:
            heading_text = hm.group(2).strip()
            em = EXPLICIT_ANCHOR_RE.search(heading_text)
            if em:
                anchors.add(em.group(1))
                pre = heading_text[:em.start()].strip()
                if pre:
                    anchors.add(slugify(pre))
            else:
                anchors.add(slugify(heading_text))

    for m in ID_ATTR_RE.finditer(content):
        anchors.add(m.group(1))

    # Mintlify components (Tab, Accordion, Step, Card, ...) generate heading
    # anchors from their title prop, e.g. <Tab title="Install via ComfyUI Manager">
    for m in COMPONENT_TITLE_RE.finditer(content):
        anchors.add(slugify(m.group(2)))

    # Follow MDX snippet imports: `import X from "/snippets/foo.mdx"` renders
    # the snippet's content inline, so its headings are anchors on this page.
    root = os.path.dirname(os.path.dirname(path))  # repo root
    for m in re.finditer(r'import\s+[^"\']+\s+from\s+["\'](/snippets/[^"\']+)["\']', content):
        sp = os.path.join(root, m.group(1).lstrip('/'))
        if os.path.isfile(sp):
            anchors |= collect_anchors(sp)

    return anchors


def iter_links(path: str):
    """Yield (url, match_text, lineno) outside code fences."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f'!! cannot read {path}: {e}', file=sys.stderr)
        return

    in_fence = False
    fence_marker = ''
    for i, line in enumerate(content.split('\n'), 1):
        stripped = line.lstrip()
        m = FENCE_RE.match(stripped)
        if m:
            marker = m.group(1)
            if not in_fence:
                in_fence, fence_marker = True, marker
            elif marker == fence_marker:
                in_fence = False
            continue
        if in_fence:
            continue
        for m in MD_LINK_RE.finditer(line):
            yield m.group(2), m.group(0), i
        for m in HTML_HREF_RE.finditer(line):
            yield m.group(1), m.group(0), i


def resolve_target(src_file: str, url: str, root: str):
    """Return (target_mdx_path, anchor) or (None, anchor) for non-internal links."""
    if url.startswith(('http://', 'https://', 'mailto:', 'tel:')):
        return None, None
    base, _, anchor = url.partition('#')
    if not anchor:
        return None, None
    # strip query strings
    base = base.split('?')[0]
    # URL-decode the fragment (e.g. %3A -> :), then normalize whitespace
    anchor = urllib.parse.unquote(anchor).strip()

    if base == '':
        target = src_file
    elif base.startswith('/'):
        target = os.path.join(root, base.lstrip('/'))
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(src_file), base))

    candidates = [target]
    if not target.endswith(('.mdx', '.md')):
        candidates += [target + '.mdx', target + '.md']
    for c in candidates:
        if os.path.isfile(c):
            return c, anchor
    return None, anchor  # target page missing locally -> handled separately


def main():
    ap = argparse.ArgumentParser(description='Static anchor link checker')
    ap.add_argument('--root', default='.')
    ap.add_argument('--only-changed', action='store_true',
                    help='Only check MDX files changed vs origin/main')
    ap.add_argument('--file', action='append', default=[],
                    help='Check a specific file (repeatable)')
    args = ap.parse_args()

    root = os.path.abspath(args.root)

    if args.file:
        files = [os.path.abspath(f) for f in args.file]
    elif args.only_changed:
        # PR: compare against origin/main if available; fall back to HEAD~1
        # for direct pushes to main (where origin/main == HEAD).
        out = subprocess.run(
            ['git', 'diff', '--name-only', 'origin/main...HEAD'],
            capture_output=True, text=True, cwd=root)
        changed = out.stdout.split()
        if not changed:
            out = subprocess.run(
                ['git', 'diff', '--name-only', 'HEAD~1...HEAD'],
                capture_output=True, text=True, cwd=root)
            changed = out.stdout.split()
        files = [os.path.join(root, f) for f in changed
                 if f.endswith(('.mdx', '.md'))]
    else:
        files = []
        for pat in ('**/*.mdx', '**/*.md'):
            files.extend(glob.glob(os.path.join(root, pat), recursive=True))
        files = [f for f in files
                 if not any(x in f for x in ('node_modules/', '.git/', '.github/', 'tmp/'))]
    files = sorted(set(os.path.abspath(f) for f in files if os.path.isfile(f)))

    if not files:
        print('No files to check.')
        return 0

    print(f'Checking {len(files)} file(s) for anchor links...')

    anchor_cache = {}
    def anchors_of(p):
        if p not in anchor_cache:
            anchor_cache[p] = collect_anchors(p)
        return anchor_cache[p]

    problems = []
    for fp in files:
        for url, match, ln in iter_links(fp):
            target, anchor = resolve_target(fp, url, root)
            if target is None or anchor is None:
                continue
            if target not in anchor_cache:
                anchor_cache[target] = collect_anchors(target)
            if anchor not in anchor_cache[target]:
                problems.append((fp, ln, url, os.path.relpath(target, root), anchor))

    if not problems:
        print('✅ All anchor links OK!')
        return 0

    print(f'\n❌ Found {len(problems)} broken anchor link(s):\n')
    for fp, ln, url, target, anchor in problems:
        print(f'  {os.path.relpath(fp, root)}:{ln}')
        print(f'    link:     {url}')
        print(f'    target:   {target}')
        print(f'    anchor:   #{anchor}  (NOT FOUND)')
        # suggestions
        have = sorted(anchor_cache[os.path.join(root, target)])
        import difflib
        close = difflib.get_close_matches(anchor, have, n=2, cutoff=0.5)
        if close:
            print(f'    maybe meant: {close}')
        print()
    return 1


if __name__ == '__main__':
    sys.exit(main())
