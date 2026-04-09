#!/usr/bin/env python3
"""
Translation sync script for ComfyUI docs.

Usage:
    python translate-sync.py --before <sha> --after <sha> [--dry-run]

For each changed English .mdx file, checks which language translations are
out of sync and translates only the changed sections using DeepSeek API.

Section matching strategy:
  Uses unified diff hunk headers (@@ -a,b +c,d @@) to get the exact line
  ranges that changed in the new English file. These are mapped to section
  indices by comparing line numbers against each section's start/end lines.
  This is language-agnostic and correctly handles inserted, deleted, or
  reordered sections.

Robustness:
  - Per-section error isolation: if a section fails, keeps original translation
    and logs [FALLBACK]. Other sections are unaffected.
  - API retry with exponential backoff (3 attempts).
  - MDX tag count validation: if translated output has mismatched MDX tags,
    falls back to original translation.
  - Frontmatter integrity check: validates --- delimiters after translation.
  - File-level error isolation: one file failing doesn't stop others.
  - Empty response guard: keeps original if API returns empty content.
  - Fallback to full-file translation if diff parsing yields no changed sections
    but the file is confirmed changed.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package required. Run: pip install openai")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
CONFIG_PATH = SCRIPT_DIR / "translation-config.json"

# MDX component tags to validate (opening tags)
MDX_TAG_PATTERN = re.compile(r'<(Card|Accordion|AccordionGroup|Note|Warning|Tip|Steps|Step|Tab|Tabs|Columns|video|CardGroup|Frame|ResponseField|ParamField)\b')


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def get_changed_files(before_sha: str, after_sha: str, exclude_dirs: list[str]) -> list[str]:
    """Get English .mdx files changed between two commits."""
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", before_sha, after_sha],
        capture_output=True, text=True, cwd=REPO_ROOT
    )
    files = []
    for line in result.stdout.strip().splitlines():
        if not line.endswith(".mdx"):
            continue
        if any(line.startswith(d + "/") for d in exclude_dirs):
            continue
        files.append(line)
    return files


def get_files_changed_in_range(before_sha: str, after_sha: str) -> set[str]:
    """Get all files (any language) changed in the commit range."""
    result = subprocess.run(
        ["git", "diff", "--name-only", before_sha, after_sha],
        capture_output=True, text=True, cwd=REPO_ROOT
    )
    return set(result.stdout.strip().splitlines())


def get_file_diff(before_sha: str, after_sha: str, filepath: str) -> str:
    """Get the unified diff of a file between two commits."""
    result = subprocess.run(
        ["git", "diff", before_sha, after_sha, "--", filepath],
        capture_output=True, text=True, cwd=REPO_ROOT
    )
    return result.stdout


def parse_sections(content: str) -> dict:
    """
    Parse MDX content into frontmatter + sections split by ## / ### headings.

    Returns:
      {
        "frontmatter": str,
        "frontmatter_lines": int,
        "sections": [
          {
            "heading": str | None,
            "level": int,
            "content": str,
            "start_line": int,   # 1-based, inclusive
            "end_line": int,     # 1-based, inclusive
          }
        ]
      }
    """
    lines = content.splitlines(keepends=True)
    frontmatter_lines_list = []
    in_frontmatter = False
    fm_done = False

    for i, line in enumerate(lines):
        if i == 0 and line.strip() == "---":
            in_frontmatter = True
            frontmatter_lines_list.append(line)
            continue
        if in_frontmatter:
            frontmatter_lines_list.append(line)
            if line.strip() == "---":
                in_frontmatter = False
                fm_done = True
            continue
        if not fm_done:
            break

    fm_line_count = len(frontmatter_lines_list)
    body_lines = lines[fm_line_count:]

    sections = []
    current_heading = None
    current_level = 0
    current_lines = []
    current_start = fm_line_count + 1  # 1-based

    for i, line in enumerate(body_lines):
        lineno = fm_line_count + i + 1  # 1-based absolute
        heading_match = re.match(r'^(#{2,3})\s+(.+)', line)
        if heading_match:
            if current_lines:
                sections.append({
                    "heading": current_heading,
                    "level": current_level,
                    "content": "".join(current_lines),
                    "start_line": current_start,
                    "end_line": lineno - 1,
                })
            current_heading = heading_match.group(2).strip()
            current_level = len(heading_match.group(1))
            current_lines = [line]
            current_start = lineno
        else:
            current_lines.append(line)

    if current_lines:
        sections.append({
            "heading": current_heading,
            "level": current_level,
            "content": "".join(current_lines),
            "start_line": current_start,
            "end_line": fm_line_count + len(body_lines),
        })

    return {
        "frontmatter": "".join(frontmatter_lines_list),
        "frontmatter_lines": fm_line_count,
        "sections": sections,
    }


def get_changed_line_ranges(diff: str) -> list[tuple[int, int]]:
    """
    Parse unified diff hunk headers to extract changed line ranges in the NEW file.
    Returns list of (start_line, end_line) — 1-based, inclusive.
    Pure deletions (count=0) are excluded since they add no new lines.
    """
    ranges = []
    for line in diff.splitlines():
        m = re.match(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', line)
        if m:
            start = int(m.group(1))
            count = int(m.group(2)) if m.group(2) is not None else 1
            if count == 0:
                continue
            ranges.append((start, start + count - 1))
    return ranges


def get_changed_section_indices(diff: str, sections: list[dict]) -> set[int]:
    """
    Map changed line ranges (from diff hunk headers) onto section indices.

    A section is marked as changed if any of its lines overlap with a
    changed range. This is fully language-agnostic and handles inserted,
    deleted, or reordered sections correctly.
    """
    changed_ranges = get_changed_line_ranges(diff)
    if not changed_ranges:
        return set()

    changed_indices = set()
    for i, section in enumerate(sections):
        s_start = section["start_line"]
        s_end = section["end_line"]
        for r_start, r_end in changed_ranges:
            if r_start <= s_end and r_end >= s_start:
                changed_indices.add(i)
                break

    return changed_indices


def count_mdx_tags(content: str) -> dict[str, int]:
    """Count occurrences of known MDX component tags."""
    counts = {}
    for m in MDX_TAG_PATTERN.finditer(content):
        tag = m.group(1)
        counts[tag] = counts.get(tag, 0) + 1
    return counts


def validate_mdx_tags(original: str, translated: str) -> bool:
    """
    Return True if translated content has the same MDX tag counts as original.
    Allows translated to have 0 of a tag only if original also has 0.
    """
    orig_counts = count_mdx_tags(original)
    trans_counts = count_mdx_tags(translated)
    for tag, count in orig_counts.items():
        if count > 0 and trans_counts.get(tag, 0) != count:
            return False
    return True


def validate_frontmatter(text: str) -> bool:
    """Return True if text starts and ends with --- delimiters."""
    stripped = text.strip()
    lines = stripped.splitlines()
    if len(lines) < 2:
        return False
    return lines[0].strip() == "---" and lines[-1].strip() == "---"


def call_api_with_retry(fn, max_retries: int = 3, initial_delay: float = 2.0):
    """
    Call fn() with exponential backoff on failure.
    Raises the last exception if all retries fail.
    """
    delay = initial_delay
    last_exc = None
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            if attempt < max_retries - 1:
                print(f"    [RETRY {attempt + 1}/{max_retries}] API error: {e}. Retrying in {delay:.0f}s...")
                time.sleep(delay)
                delay *= 2
    raise last_exc


def translate_content(
    client: OpenAI,
    en_content: str,
    target_language: str,
    target_language_name: str,
    preserve_terms: list[str],
    existing_translation: Optional[str] = None,
) -> str:
    """Translate a section of MDX content using DeepSeek API."""
    preserve_str = ", ".join(preserve_terms)

    system_prompt = f"""You are a technical documentation translator specializing in MDX format. Translate into {target_language_name}.

Rules:
- Preserve ALL MDX component tags exactly: <Card>, <Accordion>, <AccordionGroup>, <Note>, <Warning>, <Tip>, <Steps>, <Step>, <Tab>, <Tabs>, <Columns>, <video>, etc.
- Preserve ALL code blocks (```...```) — do NOT translate code inside them
- Preserve ALL link URLs (href values) — only translate visible link text if natural
- Preserve ALL image paths and alt text formatting — do not rewrite alt text unless translating a new file
- Preserve frontmatter keys; translate only their string values (title, description, sidebarTitle)
- Do NOT translate these technical terms: {preserve_str}
- Do NOT translate file paths, URLs, or image paths
- Return ONLY the translated content with no explanations or preamble"""

    if existing_translation:
        user_prompt = f"""Update the {target_language_name} translation to reflect the new English source.
Only change what has changed — preserve existing translations where English is unchanged.

=== NEW ENGLISH SOURCE ===
{en_content}

=== CURRENT {target_language_name.upper()} TRANSLATION (for reference) ===
{existing_translation}"""
    else:
        user_prompt = f"Translate the following MDX content into {target_language_name}:\n\n{en_content}"

    def _call():
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()

    return call_api_with_retry(_call)


def extract_custom_frontmatter_fields(existing_fm: str, en_fm: str) -> str:
    """
    Extract fields from existing_fm that are NOT present in en_fm.
    These are custom fields added by translators (e.g. translationSourceHash,
    translationFrom, translationMismatches) that should be preserved.
    Returns a string of extra lines to inject before the closing ---.
    """
    if not existing_fm.strip() or not en_fm.strip():
        return ""

    def parse_keys(fm: str) -> set[str]:
        keys = set()
        for line in fm.splitlines():
            m = re.match(r'^([a-zA-Z][a-zA-Z0-9_-]*):', line)
            if m:
                keys.add(m.group(1))
        return keys

    en_keys = parse_keys(en_fm)
    extra_lines = []
    in_extra_block = False
    current_key = None

    for line in existing_fm.splitlines():
        key_match = re.match(r'^([a-zA-Z][a-zA-Z0-9_-]*):', line)
        if key_match:
            current_key = key_match.group(1)
            if current_key not in en_keys and current_key not in ('title', 'description', 'sidebarTitle'):
                in_extra_block = True
                extra_lines.append(line)
            else:
                in_extra_block = False
        elif in_extra_block and (line.startswith(' ') or line.startswith('\t') or line.strip() == ''):
            extra_lines.append(line)
        else:
            in_extra_block = False

    return "\n".join(extra_lines)


def translate_frontmatter(
    client: OpenAI,
    frontmatter: str,
    target_language_name: str,
    existing_frontmatter: Optional[str] = None,
) -> str:
    """Translate translatable frontmatter fields only, preserving custom fields."""
    if not frontmatter.strip():
        return frontmatter

    prompt = f"""Translate ONLY the values of these YAML frontmatter fields into {target_language_name}: title, description, sidebarTitle.
Leave all other keys and values exactly as-is.
Return only the frontmatter block including the --- delimiters.

{frontmatter}"""

    if existing_frontmatter:
        prompt += f"\n\nExisting {target_language_name} frontmatter for reference:\n{existing_frontmatter}"

    def _call():
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return response.choices[0].message.content.strip()

    translated = call_api_with_retry(_call)

    # Re-inject custom fields from existing translation that aren't in English source
    if existing_frontmatter:
        extra = extract_custom_frontmatter_fields(existing_frontmatter, frontmatter)
        if extra:
            # Insert extra fields before the closing ---
            lines = translated.splitlines()
            close_idx = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].strip() == '---'), -1)
            if close_idx > 0:
                lines.insert(close_idx, extra)
                translated = "\n".join(lines)

    return translated


def safe_translate_section(
    client: OpenAI,
    index: int,
    en_section: dict,
    existing_lang_section: Optional[str],
    lang: dict,
    preserve_terms: list[str],
    fallback_log: list[str],
) -> str:
    """
    Translate a single section with error isolation.
    Returns the translated content, or falls back to existing_lang_section
    (or en_section content as last resort) on any error.
    """
    heading = en_section["heading"] or "(intro)"
    en_content = en_section["content"]

    try:
        translated = translate_content(
            client, en_content,
            target_language=lang["code"],
            target_language_name=lang["name"],
            preserve_terms=preserve_terms,
            existing_translation=existing_lang_section,
        )

        # Guard: empty response
        if not translated.strip():
            msg = f"[FALLBACK] Section [{index}] '{heading}': empty API response, keeping original"
            print(f"    {msg}")
            fallback_log.append(msg)
            return existing_lang_section if existing_lang_section else en_content

        # Guard: MDX tag mismatch
        if not validate_mdx_tags(en_content, translated):
            msg = f"[FALLBACK] Section [{index}] '{heading}': MDX tag mismatch after translation, keeping original"
            print(f"    {msg}")
            fallback_log.append(msg)
            return existing_lang_section if existing_lang_section else en_content

        return translated

    except Exception as e:
        msg = f"[FALLBACK] Section [{index}] '{heading}': translation error ({e}), keeping original"
        print(f"    {msg}")
        fallback_log.append(msg)
        return existing_lang_section if existing_lang_section else en_content


def safe_translate_frontmatter(
    client: OpenAI,
    en_frontmatter: str,
    lang: dict,
    existing_frontmatter: str,
    fallback_log: list[str],
) -> str:
    """
    Translate frontmatter with integrity validation and fallback.
    """
    try:
        translated = translate_frontmatter(
            client, en_frontmatter,
            target_language_name=lang["name"],
            existing_frontmatter=existing_frontmatter,
        )

        if not translated.strip():
            msg = "[FALLBACK] Frontmatter: empty response, keeping original"
            print(f"    {msg}")
            fallback_log.append(msg)
            return existing_frontmatter

        if not validate_frontmatter(translated):
            msg = "[FALLBACK] Frontmatter: missing --- delimiters after translation, keeping original"
            print(f"    {msg}")
            fallback_log.append(msg)
            return existing_frontmatter

        return translated

    except Exception as e:
        msg = f"[FALLBACK] Frontmatter: error ({e}), keeping original"
        print(f"    {msg}")
        fallback_log.append(msg)
        return existing_frontmatter


def process_file(
    client: Optional[OpenAI],
    en_filepath: str,
    lang: dict,
    before_sha: str,
    after_sha: str,
    config: dict,
    dry_run: bool = False,
) -> tuple[Optional[str], list[str]]:
    """
    Translate a single file for a single language.
    Returns (lang_filepath, fallback_log) if a translation was written,
    (None, []) otherwise.
    """
    if en_filepath.startswith("snippets/"):
        snippets_dir = lang.get("snippets_dir", f"snippets/{lang['code']}")
        lang_filepath = en_filepath.replace("snippets/", f"{snippets_dir}/", 1)
    else:
        lang_filepath = f"{lang['dir']}/{en_filepath}"

    en_abs = REPO_ROOT / en_filepath
    lang_abs = REPO_ROOT / lang_filepath

    if not en_abs.exists():
        print(f"  [SKIP] English source not found: {en_filepath}")
        return None, []

    en_content = en_abs.read_text(encoding="utf-8")
    existing_content = lang_abs.read_text(encoding="utf-8") if lang_abs.exists() else None
    is_new_file = existing_content is None

    print(f"  → {'[NEW]' if is_new_file else '[UPDATE]'} {lang_filepath}")

    if dry_run:
        return lang_filepath, []

    preserve_terms = config.get("preserve_terms", [])
    fallback_log: list[str] = []

    if is_new_file:
        try:
            translated = translate_content(
                client, en_content,
                target_language=lang["code"],
                target_language_name=lang["name"],
                preserve_terms=preserve_terms,
            )
            if not translated.strip():
                print(f"  [ERROR] Empty translation for new file {en_filepath}, skipping")
                return None, []
            lang_abs.parent.mkdir(parents=True, exist_ok=True)
            lang_abs.write_text(translated, encoding="utf-8")
            return lang_filepath, []
        except Exception as e:
            print(f"  [ERROR] Failed to translate new file {en_filepath}: {e}")
            return None, []

    # --- Diff-based update ---
    diff = get_file_diff(before_sha, after_sha, en_filepath)

    parsed_en = parse_sections(en_content)
    parsed_lang = parse_sections(existing_content)

    en_sections = parsed_en["sections"]
    lang_sections = parsed_lang["sections"]

    # Use diff hunk line numbers to find which English sections changed
    changed_indices = get_changed_section_indices(diff, en_sections)

    # Fallback: if diff parsing found no changed sections but file is confirmed changed,
    # translate all sections (file-level change without section-level hunk info)
    if not changed_indices and diff.strip():
        print(f"    [WARN] No sections mapped from diff hunks; translating all sections as fallback")
        changed_indices = set(range(len(en_sections)))

    # Translate frontmatter if translatable fields changed
    frontmatter_changed = any(
        line.startswith(('+', '-'))
        and any(k in line for k in ('title:', 'description:', 'sidebarTitle:'))
        for line in diff.splitlines()
        if not line.startswith('+++') and not line.startswith('---')
    )

    new_frontmatter = parsed_lang["frontmatter"]
    if frontmatter_changed or not parsed_lang["frontmatter"].strip():
        print(f"    Translating frontmatter...")
        new_frontmatter = safe_translate_frontmatter(
            client, parsed_en["frontmatter"], lang,
            existing_frontmatter=parsed_lang["frontmatter"],
            fallback_log=fallback_log,
        )

    # Build translated section list:
    # - Changed sections → translate (pass existing lang section as reference)
    # - Unchanged sections at same index → keep existing lang translation
    # - New sections beyond lang file length → translate fresh
    # - Deleted English sections → their lang counterparts are naturally dropped
    new_sections = []
    for i, en_section in enumerate(en_sections):
        if i in changed_indices:
            heading = en_section["heading"]
            print(f"    Translating section [{i}]: {heading or '(intro)'}...")
            existing_lang_section = lang_sections[i]["content"] if i < len(lang_sections) else None
            translated = safe_translate_section(
                client, i, en_section, existing_lang_section,
                lang, preserve_terms, fallback_log,
            )
            new_sections.append(translated)
        elif i < len(lang_sections):
            new_sections.append(lang_sections[i]["content"])
        else:
            heading = en_section["heading"]
            print(f"    Translating new section [{i}]: {heading or '(intro)'}...")
            translated = safe_translate_section(
                client, i, en_section, None,
                lang, preserve_terms, fallback_log,
            )
            new_sections.append(translated)

    joined = "".join(s.rstrip() + "\n" for s in new_sections)
    result = new_frontmatter.rstrip() + "\n\n" + joined.rstrip() + "\n"
    lang_abs.write_text(result, encoding="utf-8")

    return lang_filepath, fallback_log


def main():
    parser = argparse.ArgumentParser(description="Sync translations for changed MDX files")
    parser.add_argument("--before", required=True, help="Before commit SHA")
    parser.add_argument("--after", required=True, help="After commit SHA")
    parser.add_argument("--dry-run", action="store_true", help="Preview without calling API or writing files")
    parser.add_argument("--output-summary", help="Write PR body summary to this file")
    args = parser.parse_args()

    config = load_config()
    languages = config["languages"]
    exclude_dirs = config["exclude_dirs"]

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key and not args.dry_run:
        print("Error: DEEPSEEK_API_KEY environment variable not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com") if not args.dry_run else None

    changed_files = get_changed_files(args.before, args.after, exclude_dirs)
    if not changed_files:
        print("No English MDX files changed. Nothing to translate.")
        sys.exit(0)

    all_changed = get_files_changed_in_range(args.before, args.after)

    print(f"Changed English files: {len(changed_files)}")
    for f in changed_files:
        print(f"  {f}")

    translated_files: dict[str, list[str]] = {}
    all_fallbacks: dict[str, list[str]] = {}

    for lang in languages:
        needs_translation = []
        for en_file in changed_files:
            if en_file.startswith("snippets/"):
                snippets_dir = lang.get("snippets_dir", f"snippets/{lang['code']}")
                lang_file = en_file.replace("snippets/", f"{snippets_dir}/", 1)
            else:
                lang_file = f"{lang['dir']}/{en_file}"

            if lang_file in all_changed:
                print(f"[{lang['code']}] Already synced: {lang_file}")
                continue
            needs_translation.append(en_file)

        if not needs_translation:
            print(f"[{lang['code']}] All files already in sync.")
            continue

        print(f"\n[{lang['code']}] Files to translate: {len(needs_translation)}")
        translated = []
        for en_file in needs_translation:
            try:
                result, fallbacks = process_file(client, en_file, lang, args.before, args.after, config, args.dry_run)
                if result:
                    translated.append(result)
                    if fallbacks:
                        all_fallbacks[result] = fallbacks
            except Exception as e:
                print(f"  [ERROR] Unexpected error processing {en_file} for {lang['code']}: {e}")

        if translated:
            translated_files[lang["name"]] = translated

    if not translated_files:
        print("\nAll translations are already in sync.")
        sys.exit(0)

    summary_lines = ["## Translation Sync Summary\n"]
    for lang_name, files in translated_files.items():
        summary_lines.append(f"### {lang_name}")
        for f in files:
            summary_lines.append(f"- `{f}`")
            if f in all_fallbacks:
                for fb in all_fallbacks[f]:
                    summary_lines.append(f"  - ⚠️ {fb}")
        summary_lines.append("")

    summary = "\n".join(summary_lines)
    print("\n" + summary)

    if args.output_summary:
        Path(args.output_summary).write_text(summary, encoding="utf-8")

    print("Done.")


if __name__ == "__main__":
    main()
