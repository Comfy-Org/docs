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
#   A literal period is converted to a hyphen ("Including `.js` files" ->
#   "including-js-files"), matching Mintlify's anchor behavior.
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
        elif ch == '.':
            out.append('-')
        # everything else dropped (punctuation like : ( ) ? , & / >)
    slug = ''.join(out)
    slug = re.sub(r'\s+', '-', slug).strip('-')
    # Mintlify collapses consecutive hyphens from mixed separators, e.g.
    # "Including `.js` files" -> "including-js-files" (not "--js--").
    slug = re.sub(r'-{2,}', '-', slug)
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
# MDX snippet imports: `import X from "/snippets/foo.mdx"`
SNIPPET_IMPORT_RE = re.compile(r'import\s+[^"\']+\s+from\s+["\'](/snippets/[^"\']+)["\']')


def iter_prose_segments(content: str):
    """Yield (start_line, text) chunks outside fenced code blocks.

    A single fence-aware pass shared by anchor extraction and link scanning,
    so fenced content can never create anchors or satisfy broken links.
    """
    lines = content.split('\n')
    chunk: list = []
    chunk_start = 1
    in_fence = False
    fence_marker = ''
    for i, line in enumerate(lines, 1):
        # CommonMark: a fence marker may be indented up to 3 spaces; 4+
        # spaces means it is indented code, not a fence. Count the original
        # leading whitespace before lstrip'ing.
        indent = len(line) - len(line.lstrip(' '))
        if indent >= 4:
            if not in_fence:
                if not chunk:
                    chunk_start = i
                chunk.append(line)
            continue
        stripped = line.lstrip()
        m = FENCE_RE.match(stripped)
        if m:
            marker = m.group(1)
            if not in_fence:
                if chunk:
                    yield chunk_start, '\n'.join(chunk)
                    chunk = []
                in_fence = True
                fence_marker = marker
            elif (
                marker[0] == fence_marker[0]
                and len(marker) >= len(fence_marker)
                and not stripped[len(marker):].strip()
            ):
                # CommonMark: a closing fence uses the same character, has
                # length >= the opening fence, and only whitespace after it.
                in_fence = False
            continue
        if in_fence:
            continue
        if not chunk:
            chunk_start = i
        chunk.append(line)
    if chunk:
        yield chunk_start, '\n'.join(chunk)


def read_file(path: str) -> str:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return ''


def collect_anchors(path: str, root: str) -> set:
    """All anchors a page provides: heading slugs, {#..} ids, id= attrs.

    Also follows MDX snippet imports (`import X from "/snippets/..."`) so
    anchors defined inside imported snippets count as page anchors.
    Resolves snippet paths against the repository root passed by the caller.
    """
    anchors = set()
    content = read_file(path)
    if not content:
        return anchors

    for _start, seg in iter_prose_segments(content):
        for line in seg.split('\n'):
            stripped = line.lstrip()
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

        for m in ID_ATTR_RE.finditer(seg):
            anchors.add(m.group(1))

        # Mintlify components (Tab, Accordion, Step, Card, ...) generate
        # heading anchors from their title prop.
        for m in COMPONENT_TITLE_RE.finditer(seg):
            anchors.add(slugify(m.group(2)))

        # Follow MDX snippet imports; their headings are anchors on this page.
        for m in SNIPPET_IMPORT_RE.finditer(seg):
            sp = os.path.join(root, m.group(1).lstrip('/'))
            if os.path.isfile(sp):
                anchors |= collect_anchors(sp, root)

    return anchors


def iter_links(path: str):
    """Yield (url, match_text, lineno) outside code fences."""
    content = read_file(path)
    if not content:
        return
    for start_ln, seg in iter_prose_segments(content):
        for i, line in enumerate(seg.split('\n'), start_ln):
            for m in MD_LINK_RE.finditer(line):
                yield m.group(2), m.group(0), i
            for m in HTML_HREF_RE.finditer(line):
                yield m.group(1), m.group(0), i


def resolve_target(src_file: str, url: str, root: str):
    """Return (target_mdx_path, anchor) for internal links, (None, None) for
    external URLs, and (first_candidate_path, anchor) when the target file is
    missing locally so callers can report it as a problem."""
    if url.startswith(('http://', 'https://', 'mailto:', 'tel:')):
        return None, None
    # Markdown permits "( ./path#anchor)" — trim leading whitespace the same
    # way Markdown/Mintlify does before parsing the path.
    url = url.strip()
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
    return candidates[0], anchor  # missing target -> reported by caller


def collect_doc_files(root: str) -> list:
    files = []
    for pat in ('**/*.mdx', '**/*.md'):
        files.extend(glob.glob(os.path.join(root, pat), recursive=True))
    return [f for f in files
            if not any(x in f for x in ('node_modules/', '.git/', '.github/', 'tmp/'))]


def git_changed_files(root: str) -> list:
    """Files changed vs origin/main (fallback: HEAD~1 for direct pushes).

    Returns both sides of a rename (pre- and post-image paths) so inbound
    links to the old path are still validated after a file move.

    A successful diff with no changes returns an empty list (no fallback);
    the HEAD~1 fallback only runs when origin/main is unavailable. Raises
    RuntimeError if both diffs fail.
    """
    origin_result = subprocess.run(
        ['git', 'diff', '--name-status', '-M', 'origin/main...HEAD'],
        capture_output=True, text=True, cwd=root)
    if origin_result.returncode == 0:
        return parse_name_status(origin_result.stdout)

    # origin/main unavailable (e.g. shallow direct push): fall back to HEAD~1
    fallback_result = subprocess.run(
        ['git', 'diff', '--name-status', '-M', 'HEAD~1...HEAD'],
        capture_output=True, text=True, cwd=root)
    if fallback_result.returncode == 0:
        return parse_name_status(fallback_result.stdout)

    raise RuntimeError(
        f'git diff failed: origin/main...HEAD '
        f'rc={origin_result.returncode}: '
        f'{origin_result.stderr.strip()[:200]}; '
        f'HEAD~1...HEAD rc={fallback_result.returncode}: '
        f'{fallback_result.stderr.strip()[:200]}')


def parse_name_status(output: str) -> list:
    """Parse `git diff --name-status` output into a flat path list.

    Handles status codes with optional similarity, rename lines
    ('R100\told\tnew'), and copied lines ('C\told\tnew').
    """
    paths = []
    for line in output.splitlines():
        parts = line.split('\t')
        if not parts:
            continue
        status = parts[0]
        if status.startswith(('R', 'C')):
            # rename/copy: old path and new path both matter
            if len(parts) >= 3:
                paths.append(parts[1])
                paths.append(parts[2])
        elif len(parts) >= 2:
            paths.append(parts[1])
    return paths


def main():
    ap = argparse.ArgumentParser(description='Static anchor link checker')
    ap.add_argument('--root', default='.')
    ap.add_argument('--only-changed', action='store_true',
                    help='Check MDX/MD files changed vs origin/main, plus any '
                         'unchanged English pages that link to changed headings')
    ap.add_argument('--file', action='append', default=[],
                    help='Check a specific file (repeatable)')
    args = ap.parse_args()

    root = os.path.abspath(args.root)

    if args.file:
        files = [os.path.abspath(f) for f in args.file]
    elif args.only_changed:
        try:
            changed = git_changed_files(root)
        except RuntimeError as e:
            print(f'❌ {e}', file=sys.stderr)
            return 1
        files = [os.path.join(root, f) for f in changed
                 if f.endswith(('.mdx', '.md'))]
        # If a PR renames/removes a heading on a changed page, unchanged pages
        # linking to it would silently break. Scan all English sources that
        # point at a changed file (with an anchor) and include them too.
        if files:
            changed_abs = {os.path.abspath(f) for f in files}
            for f in collect_doc_files(root):
                if f in changed_abs:
                    continue
                rel = os.path.relpath(f, root)
                if rel.split('/')[0] in ('ja', 'ko', 'zh'):
                    continue  # translations swept separately
                for url, _match, _ln in iter_links(f):
                    target, anchor = resolve_target(f, url, root)
                    if anchor and target in changed_abs:
                        files.append(f)
                        break
    else:
        files = collect_doc_files(root)
    files = sorted(set(os.path.abspath(f) for f in files if os.path.isfile(f)))

    if not files:
        print('No files to check.')
        return 0

    print(f'Checking {len(files)} file(s) for anchor links...')

    anchor_cache = {}
    def anchors_of(p):
        if p not in anchor_cache:
            anchor_cache[p] = collect_anchors(p, root)
        return anchor_cache[p]

    problems = []
    for fp in files:
        for url, match, ln in iter_links(fp):
            target, anchor = resolve_target(fp, url, root)
            if target is None or anchor is None:
                continue  # external URL or link without a fragment
            if not os.path.isfile(target):
                problems.append(
                    (fp, ln, url, os.path.relpath(target, root), anchor,
                     'target page not found locally'))
                continue
            if anchor not in anchors_of(target):
                problems.append(
                    (fp, ln, url, os.path.relpath(target, root), anchor,
                     'anchor NOT FOUND'))

    if not problems:
        print('✅ All anchor links OK!')
        return 0

    print(f'\n❌ Found {len(problems)} broken anchor link(s):\n')
    for fp, ln, url, target, anchor, reason in problems:
        print(f'  {os.path.relpath(fp, root)}:{ln}')
        print(f'    link:     {url}')
        print(f'    target:   {target}')
        if reason == 'anchor NOT FOUND':
            print(f'    anchor:   #{anchor}  (NOT FOUND)')
            # suggestions
            have = sorted(anchors_of(os.path.join(root, target)))
            import difflib
            close = difflib.get_close_matches(anchor, have, n=2, cutoff=0.5)
            if close:
                print(f'    maybe meant: {close}')
        else:
            print(f'    {reason}')
        print()
    return 1


if __name__ == '__main__':
    sys.exit(main())
