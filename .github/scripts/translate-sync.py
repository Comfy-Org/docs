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
"""

import argparse
import json
import os
import re
import subprocess
import sys
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

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content.strip()


def translate_frontmatter(
    client: OpenAI,
    frontmatter: str,
    target_language_name: str,
    existing_frontmatter: Optional[str] = None,
) -> str:
    """Translate translatable frontmatter fields only."""
    if not frontmatter.strip():
        return frontmatter

    prompt = f"""Translate ONLY the values of these YAML frontmatter fields into {target_language_name}: title, description, sidebarTitle.
Leave all other keys and values exactly as-is.
Return only the frontmatter block including the --- delimiters.

{frontmatter}"""

    if existing_frontmatter:
        prompt += f"\n\nExisting {target_language_name} frontmatter for reference:\n{existing_frontmatter}"

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )
    return response.choices[0].message.content.strip()


def process_file(
    client: Optional[OpenAI],
    en_filepath: str,
    lang: dict,
    before_sha: str,
    after_sha: str,
    config: dict,
    dry_run: bool = False,
) -> Optional[str]:
    """
    Translate a single file for a single language.
    Returns the lang_filepath if a translation was written, None otherwise.
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
        return None

    en_content = en_abs.read_text(encoding="utf-8")
    existing_content = lang_abs.read_text(encoding="utf-8") if lang_abs.exists() else None
    is_new_file = existing_content is None

    print(f"  → {'[NEW]' if is_new_file else '[UPDATE]'} {lang_filepath}")

    if dry_run:
        return lang_filepath

    preserve_terms = config.get("preserve_terms", [])

    if is_new_file:
        translated = translate_content(
            client, en_content,
            target_language=lang["code"],
            target_language_name=lang["name"],
            preserve_terms=preserve_terms,
        )
        lang_abs.parent.mkdir(parents=True, exist_ok=True)
        lang_abs.write_text(translated, encoding="utf-8")
        return lang_filepath

    # --- Diff-based update ---
    diff = get_file_diff(before_sha, after_sha, en_filepath)

    parsed_en = parse_sections(en_content)
    parsed_lang = parse_sections(existing_content)

    en_sections = parsed_en["sections"]
    lang_sections = parsed_lang["sections"]

    # Use diff hunk line numbers to find which English sections changed
    changed_indices = get_changed_section_indices(diff, en_sections)

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
        new_frontmatter = translate_frontmatter(
            client, parsed_en["frontmatter"],
            target_language_name=lang["name"],
            existing_frontmatter=parsed_lang["frontmatter"],
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
            translated = translate_content(
                client, en_section["content"],
                target_language=lang["code"],
                target_language_name=lang["name"],
                preserve_terms=preserve_terms,
                existing_translation=existing_lang_section,
            )
            new_sections.append(translated)
        elif i < len(lang_sections):
            new_sections.append(lang_sections[i]["content"])
        else:
            heading = en_section["heading"]
            print(f"    Translating new section [{i}]: {heading or '(intro)'}...")
            translated = translate_content(
                client, en_section["content"],
                target_language=lang["code"],
                target_language_name=lang["name"],
                preserve_terms=preserve_terms,
            )
            new_sections.append(translated)

    joined = "".join(s.rstrip() + "\n" for s in new_sections)
    result = new_frontmatter.rstrip() + "\n\n" + joined.rstrip() + "\n"
    lang_abs.write_text(result, encoding="utf-8")

    return lang_filepath


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
            result = process_file(client, en_file, lang, args.before, args.after, config, args.dry_run)
            if result:
                translated.append(result)

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
        summary_lines.append("")

    summary = "\n".join(summary_lines)
    print("\n" + summary)

    if args.output_summary:
        Path(args.output_summary).write_text(summary, encoding="utf-8")

    print("Done.")


if __name__ == "__main__":
    main()
