#!/usr/bin/env python3
"""
Link validation script for multilingual documentation.

Validates that each locale's documents link to matching locale content:
- zh / ja / ko docs must not use English internal links or snippet imports
- English docs must not use localized (zh / ja / ko) links or images
- Localized docs may use shared English images under /images/ (not /images/zh/)

Usage:
  python3 validate-links.py           # CI: auto-fix .mdx extensions & slashes, then validate
  python3 validate-links.py --fix     # Also fix locale links and snippet imports
  python3 validate-links.py --check   # Validate only (no file modifications)
"""

import argparse
import glob
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

LOCALES = {
    'zh': {
        'name': 'Chinese',
        'doc_dirs': ('zh', 'snippets/zh'),
        'link_prefixes': ('/zh/', '/snippets/zh/', '/images/zh/'),
    },
    'ja': {
        'name': 'Japanese',
        'doc_dirs': ('ja', 'snippets/ja'),
        'link_prefixes': ('/ja/', '/snippets/ja/'),
    },
    'ko': {
        'name': 'Korean',
        'doc_dirs': ('ko', 'snippets/ko'),
        'link_prefixes': ('/ko/', '/snippets/ko/'),
    },
}

DOC_PATH_PATTERNS = (
    'zh/', 'ja/', 'ko/',
    'tutorials/', 'built-in-nodes/', 'interface/', 'installation/',
    'development/', 'custom-nodes/', 'troubleshooting/', 'registry/', 'specs/',
    'get_started/', 'changelog/', 'comfy-cli/', 'snippets/', 'community/',
    'desktop/', 'cloud/', 'manager/', 'account/',
)

# Shared asset paths that localized docs may reference without a locale prefix.
SHARED_PATH_PREFIXES = ('/images/',)

FENCE_LINE_RE = re.compile(r'^(```+|~~~+)')

errors: List[Dict[str, Any]] = []
fixed_files: List[str] = []


def iter_prose_segments(content: str):
    """Yield content outside fenced code blocks (``` or ~~~)."""
    lines = content.split('\n')
    chunk: List[str] = []
    in_fence = False
    fence_marker = ''

    for line in lines:
        stripped = line.lstrip()
        if not in_fence:
            match = FENCE_LINE_RE.match(stripped)
            if match:
                if chunk:
                    yield '\n'.join(chunk)
                    chunk = []
                in_fence = True
                fence_marker = match.group(1)
                continue
            chunk.append(line)
            continue

        if FENCE_LINE_RE.match(stripped):
            in_fence = False
            fence_marker = ''

    if chunk:
        yield '\n'.join(chunk)


def transform_outside_code_fences(content: str, transform_fn) -> Tuple[str, bool]:
    """Apply transform_fn only to prose (non-fenced) segments."""
    lines = content.split('\n')
    result: List[str] = []
    chunk: List[str] = []
    in_fence = False
    changed = False

    def flush_chunk() -> None:
        nonlocal changed
        if not chunk:
            return
        block = '\n'.join(chunk)
        new_block = transform_fn(block)
        if new_block != block:
            changed = True
        result.append(new_block)
        chunk.clear()

    for line in lines:
        stripped = line.lstrip()
        if not in_fence:
            match = FENCE_LINE_RE.match(stripped)
            if match:
                flush_chunk()
                in_fence = True
                result.append(line)
                continue
            chunk.append(line)
            continue

        result.append(line)
        if FENCE_LINE_RE.match(stripped):
            in_fence = False

    flush_chunk()
    return '\n'.join(result), changed


def normalize_path(file_path: str) -> str:
    return file_path.replace('\\', '/')


def get_doc_locale(file_path: str) -> Optional[str]:
    """Return locale code for a localized doc, or None for English."""
    normalized = normalize_path(file_path)
    for code, config in LOCALES.items():
        for doc_dir in config['doc_dirs']:
            if f'/{doc_dir}/' in normalized or normalized.startswith(f'{doc_dir}/'):
                return code
    return None


def is_external_or_special(link: str) -> bool:
    return (
        link.startswith('http')
        or link.startswith('mailto:')
        or link.startswith('#')
        or link.startswith('./')
        or link.startswith('../')
        or not link.strip()
    )


def get_link_locale(link: str) -> Optional[str]:
    """Return locale code if link points to localized content."""
    for code, config in LOCALES.items():
        if any(prefix in link for prefix in config['link_prefixes']):
            return code
    return None


def is_doc_internal_path(path: str) -> bool:
    """Absolute in-repo doc/snippet path (not JS modules like fs/promises)."""
    normalized = path.replace('\\', '/')
    if not normalized.startswith('/'):
        return False
    if is_external_or_special(path):
        return False
    if normalized.startswith('/snippets/'):
        return True
    without_slash = normalized[1:]
    return any(without_slash.startswith(pattern) for pattern in DOC_PATH_PATTERNS)


def is_english_internal_link(link: str) -> bool:
    """Internal doc/snippet link that is not localized."""
    if not is_doc_internal_path(link):
        return False
    if is_shared_asset_path(link):
        return False
    if get_link_locale(link) is not None:
        return False
    return True


def is_shared_asset_path(path: str) -> bool:
    """Paths that stay un-prefixed in localized docs (e.g. shared /images/)."""
    normalized = path.replace('\\', '/')
    return any(normalized.startswith(prefix) for prefix in SHARED_PATH_PREFIXES)


def is_english_snippet_import(import_path: str) -> bool:
    """Snippet import under /snippets/ without a locale subdirectory."""
    normalized = import_path.replace('\\', '/')
    if not normalized.startswith('/snippets/'):
        return False
    remainder = normalized[len('/snippets/'):]
    return not remainder.startswith(('zh/', 'ja/', 'ko/'))


def _extract_links_from_segment(segment: str) -> List[Dict[str, Any]]:
    links: List[Dict[str, Any]] = []

    for text, url in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', segment):
        links.append({
            'type': 'markdown',
            'text': text,
            'url': url,
            'match': f'[{text}]({url})',
        })

    for url in re.findall(r'<a[^>]+href\s*=\s*["\']([^"\']+)["\'][^>]*>', segment):
        links.append({
            'type': 'html',
            'url': url,
            'match': f'href="{url}"',
        })

    for url in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', segment):
        links.append({
            'type': 'component',
            'url': url,
            'match': f'href="{url}"',
        })

    return links


def extract_links(content: str, file_path: str) -> List[Dict[str, Any]]:
    """Extract links from prose (outside fenced code blocks)."""
    links: List[Dict[str, Any]] = []
    for segment in iter_prose_segments(content):
        links.extend(_extract_links_from_segment(segment))
    return links


def _extract_imports_from_segment(segment: str) -> List[Dict[str, Any]]:
    """Only MDX snippet imports (/snippets/...), not JS/TS module imports."""
    imports: List[Dict[str, Any]] = []
    pattern = r'import\s+[^"\']+\s+from\s+["\'](/snippets/[^"\']+)["\']'
    for url in re.findall(pattern, segment):
        imports.append({
            'type': 'import',
            'url': url,
            'match': f'from "{url}"',
        })
    return imports


def extract_imports(content: str) -> List[Dict[str, Any]]:
    """Extract MDX snippet import paths from prose only."""
    imports: List[Dict[str, Any]] = []
    for segment in iter_prose_segments(content):
        imports.extend(_extract_imports_from_segment(segment))
    return imports


def extract_images(content: str, file_path: str) -> List[Dict[str, Any]]:
    """Extract images from file content."""
    images: List[Dict[str, Any]] = []

    for alt, src in re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content):
        images.append({
            'type': 'markdown',
            'alt': alt,
            'src': src,
            'match': f'![{alt}]({src})',
        })

    for src in re.findall(r'<img[^>]+src\s*=\s*["\']([^"\']+)["\'][^>]*>', content):
        images.append({
            'type': 'html',
            'src': src,
            'match': f'src="{src}"',
        })

    for src in re.findall(r'src\s*=\s*["\']([^"\']+)["\']', content):
        images.append({
            'type': 'component',
            'src': src,
            'match': f'src="{src}"',
        })

    return images


def add_error(file_path: str, error_type: str, error: str, details: str, match: str) -> None:
    errors.append({
        'file': file_path,
        'type': error_type,
        'error': error,
        'details': details,
        'match': match,
    })


def _fix_mdx_extensions_in_segment(segment: str) -> str:
    segment = re.sub(r'\[([^\]]+)\]\(([^)]+)\.mdx\)', r'[\1](\2)', segment)
    return re.sub(r'href\s*=\s*["\']([^"\']+)\.mdx["\']', r'href="\1"', segment)


def fix_mdx_extensions(file_path: str, content: str) -> Tuple[str, bool]:
    """Fix .mdx extensions in links (prose only)."""
    return transform_outside_code_fences(content, _fix_mdx_extensions_in_segment)


def _fix_missing_leading_slash_in_segment(segment: str) -> str:
    def should_add_slash(link: str) -> bool:
        if is_external_or_special(link):
            return False
        return any(link.startswith(pattern) for pattern in DOC_PATH_PATTERNS)

    def fix_markdown_link(match: re.Match[str]) -> str:
        text = match.group(1)
        link = match.group(2)
        if should_add_slash(link):
            return f'[{text}](/{link})'
        return match.group(0)

    segment = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', fix_markdown_link, segment)

    def fix_html_link(match: re.Match[str]) -> str:
        quote = match.group(1)
        link = match.group(2)
        if should_add_slash(link):
            return f'href={quote}/{link}{quote}'
        return match.group(0)

    return re.sub(r'href\s*=\s*(["\'])([^"\']+)\1', fix_html_link, segment)


def fix_missing_leading_slash(file_path: str, content: str) -> Tuple[str, bool]:
    """Fix internal links that should start with / but don't (prose only)."""
    return transform_outside_code_fences(content, _fix_missing_leading_slash_in_segment)


def fix_path_for_locale(locale: str, path: str) -> Optional[str]:
    """
    Return a locale-corrected doc path, or None if no change is needed.

    Only touches absolute in-repo paths (/tutorials/..., /snippets/...).
    Never modifies JS module imports (fs/promises, react, etc.).
    """
    if not is_doc_internal_path(path) or is_shared_asset_path(path):
        return None

    normalized = path.replace('\\', '/')
    current_locale = get_link_locale(normalized)

    if current_locale == locale:
        return None

    if current_locale is not None:
        wrong = current_locale
        snippet_prefix = f'/snippets/{wrong}/'
        image_prefix = f'/images/{wrong}/'
        doc_prefix = f'/{wrong}/'

        if normalized.startswith(snippet_prefix):
            return f'/snippets/{locale}/{normalized[len(snippet_prefix):]}'
        if normalized.startswith(image_prefix):
            return f'/images/{locale}/{normalized[len(image_prefix):]}'
        if normalized.startswith(doc_prefix):
            return f'/{locale}/{normalized[len(doc_prefix):]}'

    if not is_english_internal_link(normalized):
        return None

    if normalized.startswith('/snippets/'):
        return f'/snippets/{locale}/{normalized[len("/snippets/"):]}'
    return f'/{locale}{normalized}'


def _fix_locale_paths_in_segment(segment: str, locale: str) -> str:
    def apply_fix(path: str) -> str:
        fixed = fix_path_for_locale(locale, path)
        return fixed if fixed is not None else path

    def fix_markdown_link(match: re.Match[str]) -> str:
        text, url = match.group(1), match.group(2)
        new_url = apply_fix(url)
        if new_url != url:
            return f'[{text}]({new_url})'
        return match.group(0)

    segment = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', fix_markdown_link, segment)

    def fix_href(match: re.Match[str]) -> str:
        quote, url = match.group(1), match.group(2)
        new_url = apply_fix(url)
        if new_url != url:
            return f'href={quote}{new_url}{quote}'
        return match.group(0)

    segment = re.sub(r'href\s*=\s*(["\'])([^"\']+)\1', fix_href, segment)

    def fix_snippet_import(match: re.Match[str]) -> str:
        prefix, url, suffix = match.group(1), match.group(2), match.group(3)
        new_url = apply_fix(url)
        if new_url != url:
            return f'{prefix}{new_url}{suffix}'
        return match.group(0)

    return re.sub(
        r'(import\s+[^"\']+\s+from\s+["\'])(/snippets/[^"\']+)(["\'])',
        fix_snippet_import,
        segment,
    )


def fix_locale_paths(file_path: str, content: str) -> Tuple[str, bool]:
    """Fix locale mismatches in links and /snippets/ imports for localized docs."""
    locale = get_doc_locale(file_path)
    if locale is None:
        return content, False

    return transform_outside_code_fences(
        content,
        lambda segment: _fix_locale_paths_in_segment(segment, locale),
    )


def validate_localized_link(file_path: str, locale: str, link: str, match: str) -> None:
    """Localized docs must not point to English internal paths or other locales."""
    locale_name = LOCALES[locale]['name']
    link_locale = get_link_locale(link)

    if link_locale is not None and link_locale != locale:
        other_name = LOCALES[link_locale]['name']
        add_error(
            file_path,
            'link',
            f'{locale_name} document uses {other_name} link',
            f'Link "{link}" in {locale_name} document should use /{locale}/ paths',
            match,
        )
        return

    if is_english_internal_link(link):
        add_error(
            file_path,
            'link',
            f'{locale_name} document uses English link',
            f'Link "{link}" in {locale_name} document should not point to English content',
            match,
        )


def validate_localized_import(file_path: str, locale: str, import_path: str, match: str) -> None:
    """Localized docs must import snippets from their locale directory."""
    locale_name = LOCALES[locale]['name']

    if not import_path.startswith('/snippets/'):
        return

    if is_english_snippet_import(import_path):
        add_error(
            file_path,
            'import',
            f'{locale_name} document uses English snippet import',
            f'Import "{import_path}" should use /snippets/{locale}/ instead of /snippets/',
            match,
        )
        return

    import_locale = get_link_locale(import_path)
    if import_locale is not None and import_locale != locale:
        other_name = LOCALES[import_locale]['name']
        add_error(
            file_path,
            'import',
            f'{locale_name} document uses {other_name} snippet import',
            f'Import "{import_path}" in {locale_name} document should use /snippets/{locale}/',
            match,
        )


def validate_file_links(file_path: str, content: str) -> None:
    """Validate links, imports, and images in a file."""
    locale = get_doc_locale(file_path)
    links = extract_links(content, file_path)
    imports = extract_imports(content)
    images = extract_images(content, file_path)
    image_sources = {image['src'] for image in images}

    for link in links:
        if link['url'] in image_sources:
            continue

        if link['url'].endswith('.mdx'):
            add_error(
                file_path,
                'link',
                'Link contains .mdx extension',
                f'Link "{link["url"]}" should not end with .mdx extension',
                link['match'],
            )
            continue

        if locale is not None:
            validate_localized_link(file_path, locale, link['url'], link['match'])
        elif get_link_locale(link['url']) is not None:
            link_locale = get_link_locale(link['url'])
            locale_name = LOCALES[link_locale]['name']
            add_error(
                file_path,
                'link',
                f'English document uses {locale_name} link',
                f'Link "{link["url"]}" in English document should not point to {locale_name} content',
                link['match'],
            )

    for imp in imports:
        if locale is not None:
            validate_localized_import(file_path, locale, imp['url'], imp['match'])
        elif get_link_locale(imp['url']) is not None:
            link_locale = get_link_locale(imp['url'])
            locale_name = LOCALES[link_locale]['name']
            add_error(
                file_path,
                'import',
                f'English document uses {locale_name} snippet import',
                f'Import "{imp["url"]}" in English document should not point to {locale_name} snippets',
                imp['match'],
            )

    if locale is None:
        for image in images:
            if '/images/zh/' in image['src']:
                add_error(
                    file_path,
                    'image',
                    'English document uses Chinese image',
                    f'Image "{image["src"]}" in English document should not point to Chinese image directory',
                    image['match'],
                )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Validate and optionally fix documentation links.',
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        '--fix',
        action='store_true',
        help='Fix .mdx extensions, slashes, and locale links/imports',
    )
    mode.add_argument(
        '--check',
        action='store_true',
        help='Validate only; do not modify any files',
    )
    return parser.parse_args()


def collect_doc_files() -> List[str]:
    files: List[str] = []
    for pattern in ('**/*.mdx', '**/*.md'):
        files.extend(glob.glob(pattern, recursive=True))
    return [
        f for f in files
        if not any(exclude in f for exclude in ('node_modules/', '.git/', '.github/'))
    ]


def apply_auto_fixes(file_path: str, content: str, fix_locale: bool) -> Tuple[str, List[str]]:
    """Apply automatic fixes and return updated content plus fix labels."""
    applied: List[str] = []

    content, mdx_fixed = fix_mdx_extensions(file_path, content)
    if mdx_fixed:
        applied.append('.mdx extensions')

    content, slash_fixed = fix_missing_leading_slash(file_path, content)
    if slash_fixed:
        applied.append('missing leading slashes')

    if fix_locale:
        content, locale_fixed = fix_locale_paths(file_path, content)
        if locale_fixed:
            applied.append('locale links/imports')

    return content, applied


def main() -> None:
    """Main function to validate all documentation files."""
    global errors, fixed_files
    errors = []
    fixed_files = []

    args = parse_args()
    fix_locale = args.fix
    write_files = not args.check

    try:
        files = collect_doc_files()
        print(f'Found {len(files)} documentation files')

        if args.check:
            print('Mode: check only (no modifications)')
        elif args.fix:
            print('Mode: fix formatting + locale links/imports')
        else:
            print('Mode: fix formatting (.mdx extensions, slashes)')

        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                if not write_files:
                    continue

                fixed_content, applied = apply_auto_fixes(
                    file_path,
                    content,
                    fix_locale=fix_locale,
                )

                if applied:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(fixed_content)
                    fixed_files.append(file_path)
                    print(f"Fixed {' and '.join(applied)} in: {file_path}")

            except Exception as e:
                print(f'Error processing file {file_path}: {e}')

        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                validate_file_links(file_path, content)
            except Exception as e:
                print(f'Error reading file {file_path}: {e}')

        if fixed_files:
            print(f'\n✅ Fixed link issues in {len(fixed_files)} files:')
            for file in fixed_files:
                print(f'  - {file}')

        if errors:
            print(f'\nFound {len(errors)} remaining link errors:\n')

            error_report = []
            for error in errors:
                error_report.append(f"""❌ **{error['file']}**
   - **Error**: {error['error']}
   - **Problem**: {error['details']}
   - **Found in code**: 
     ```
     {error['match']}
     ```
""")

            report = '\n'.join(error_report)
            print(report)

            with open('/tmp/link-errors.txt', 'w', encoding='utf-8') as f:
                f.write(report)

            sys.exit(1)

        print('✅ All link validations passed!')

    except Exception as e:
        print(f'Error during validation: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
