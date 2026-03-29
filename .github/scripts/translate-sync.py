#!/usr/bin/env python3
"""
Translation sync script for ComfyUI docs.

Usage:
    python translate-sync.py --before <sha> --after <sha> [--dry-run]

For each changed English .mdx file, checks which language translations are
out of sync and translates only the changed sections using DeepSeek API.
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
        # Skip language dirs
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


def split_into_sections(content: str) -> list[dict]:
    """
    Split MDX content into sections by top-level headings (## or ###).
    Returns list of {"heading": str, "content": str, "level": int}
    """
    lines = content.splitlines(keepends=True)
    sections = []
    current_heading = None
    current_level = 0
    current_lines = []
    frontmatter_done = False
    frontmatter_lines = []
    in_frontmatter = False

    for i, line in enumerate(lines):
        # Handle frontmatter
        if i == 0 and line.strip() == "---":
            in_frontmatter = True
            frontmatter_lines.append(line)
            continue
        if in_frontmatter:
            frontmatter_lines.append(line)
            if line.strip() == "---":
                in_frontmatter = False
                frontmatter_done = True
            continue

        heading_match = re.match(r'^(#{2,3})\s+(.+)', line)
        if heading_match:
            # Save current section
            if current_lines:
                sections.append({
                    "heading": current_heading,
                    "level": current_level,
                    "content": "".join(current_lines)
                })
            current_heading = heading_match.group(2).strip()
            current_level = len(heading_match.group(1))
            current_lines = [line]
        else:
            current_lines.append(line)

    # Save last section
    if current_lines:
        sections.append({
            "heading": current_heading,
            "level": current_level,
            "content": "".join(current_lines)
        })

    return {
        "frontmatter": "".join(frontmatter_lines),
        "sections": sections
    }


def get_changed_headings_from_diff(diff: str) -> set[str]:
    """Extract headings of sections that were changed in the diff."""
    changed_headings = set()
    current_heading = None

    for line in diff.splitlines():
        # Track which heading we're under in the diff
        heading_match = re.match(r'^[+-]\s*(#{2,3})\s+(.+)', line)
        if heading_match:
            current_heading = heading_match.group(2).strip()
            changed_headings.add(current_heading)
        elif line.startswith('+') or line.startswith('-'):
            if current_heading:
                changed_headings.add(current_heading)

    return changed_headings


def translate_content(
    client: OpenAI,
    content: str,
    target_language: str,
    target_language_name: str,
    preserve_terms: list[str],
    is_full_file: bool = False,
    existing_translation: Optional[str] = None
) -> str:
    """Translate MDX content using DeepSeek API."""
    preserve_str = ", ".join(preserve_terms)

    if existing_translation:
        system_prompt = f"""You are a technical documentation translator. Translate the given MDX content into {target_language_name}.

Rules:
- Preserve ALL MDX component tags exactly: <Card>, <Accordion>, <AccordionGroup>, <Note>, <Warning>, <Tip>, <Steps>, <Step>, <Tab>, <Tabs>, <Columns>, <video>, etc.
- Preserve ALL code blocks (``` ``` ```) without translating the code inside
- Preserve ALL link URLs (href values) — only translate visible link text if appropriate
- Preserve frontmatter keys but translate their string values (title, description, sidebarTitle)
- Do NOT translate these technical terms: {preserve_str}
- Do NOT translate image paths, file paths, or URLs
- Translate naturally and accurately for {target_language_name} readers
- Return ONLY the translated content, no explanations"""

        user_prompt = f"""Update this {target_language_name} translation to match the new English source.
Only update the parts that changed — preserve existing translations where the English is unchanged.

New English source:
{content}

Current {target_language_name} translation (for reference):
{existing_translation}"""
    else:
        system_prompt = f"""You are a technical documentation translator. Translate the given MDX content into {target_language_name}.

Rules:
- Preserve ALL MDX component tags exactly: <Card>, <Accordion>, <AccordionGroup>, <Note>, <Warning>, <Tip>, <Steps>, <Step>, <Tab>, <Tabs>, <Columns>, <video>, etc.
- Preserve ALL code blocks (``` ``` ```) without translating the code inside
- Preserve ALL link URLs (href values) — only translate visible link text if appropriate
- Preserve frontmatter keys but translate their string values (title, description, sidebarTitle)
- Do NOT translate these technical terms: {preserve_str}
- Do NOT translate image paths, file paths, or URLs
- Translate naturally and accurately for {target_language_name} readers
- Return ONLY the translated content, no explanations"""

        user_prompt = f"Translate this MDX documentation into {target_language_name}:\n\n{content}"

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content.strip()


def translate_frontmatter(
    client: OpenAI,
    frontmatter: str,
    target_language_name: str,
    existing_frontmatter: Optional[str] = None
) -> str:
    """Translate only the translatable frontmatter values."""
    if not frontmatter.strip():
        return frontmatter

    prompt = f"""Translate the values of these YAML frontmatter fields into {target_language_name}.
Only translate: title, description, sidebarTitle.
Keep all other keys and values exactly as-is.
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
    client: OpenAI,
    en_filepath: str,
    lang: dict,
    before_sha: str,
    after_sha: str,
    config: dict,
    dry_run: bool = False
) -> Optional[str]:
    """
    Translate a single file for a single language.
    Returns the lang_filepath if translation was written, None otherwise.
    """
    # Determine language file path
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
        # Translate the whole file
        translated = translate_content(
            client, en_content,
            target_language=lang["code"],
            target_language_name=lang["name"],
            preserve_terms=preserve_terms,
            is_full_file=True
        )
        lang_abs.parent.mkdir(parents=True, exist_ok=True)
        lang_abs.write_text(translated, encoding="utf-8")
    else:
        # Diff-based: only translate changed sections
        diff = get_file_diff(before_sha, after_sha, en_filepath)
        changed_headings = get_changed_headings_from_diff(diff)

        parsed_en = split_into_sections(en_content)
        parsed_lang = split_into_sections(existing_content)

        # Build heading -> section map for existing translation
        lang_sections_map = {s["heading"]: s for s in parsed_lang["sections"]}

        # Translate frontmatter if it changed (check diff)
        frontmatter_changed = any(
            line.startswith(('+', '-')) and ('title:' in line or 'description:' in line or 'sidebarTitle:' in line)
            for line in diff.splitlines()
            if not line.startswith('+++') and not line.startswith('---')
        )

        new_frontmatter = parsed_lang["frontmatter"]
        if frontmatter_changed or not parsed_lang["frontmatter"].strip():
            print(f"    Translating frontmatter...")
            new_frontmatter = translate_frontmatter(
                client, parsed_en["frontmatter"],
                target_language_name=lang["name"],
                existing_frontmatter=parsed_lang["frontmatter"]
            )

        # For each section in new English, translate if changed
        new_sections = []
        for en_section in parsed_en["sections"]:
            heading = en_section["heading"]
            if heading in changed_headings or heading not in lang_sections_map:
                print(f"    Translating section: {heading or '(intro)'}...")
                existing_section_content = lang_sections_map.get(heading, {}).get("content")
                translated_section = translate_content(
                    client, en_section["content"],
                    target_language=lang["code"],
                    target_language_name=lang["name"],
                    preserve_terms=preserve_terms,
                    existing_translation=existing_section_content
                )
                new_sections.append(translated_section)
            else:
                # Keep existing translation unchanged
                new_sections.append(lang_sections_map[heading]["content"])

        # Reassemble file
        result = new_frontmatter + "\n" + "\n".join(new_sections)
        lang_abs.write_text(result, encoding="utf-8")

    return lang_filepath


def main():
    parser = argparse.ArgumentParser(description="Sync translations for changed MDX files")
    parser.add_argument("--before", required=True, help="Before commit SHA")
    parser.add_argument("--after", required=True, help="After commit SHA")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be translated without calling API")
    parser.add_argument("--output-summary", help="Write PR body summary to this file")
    args = parser.parse_args()

    config = load_config()
    languages = config["languages"]
    exclude_dirs = config["exclude_dirs"]

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key and not args.dry_run:
        print("Error: DEEPSEEK_API_KEY environment variable not set")
        sys.exit(1)

    client = None
    if not args.dry_run:
        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    # Get changed English files
    changed_files = get_changed_files(args.before, args.after, exclude_dirs)
    if not changed_files:
        print("No English MDX files changed. Nothing to translate.")
        sys.exit(0)

    # Get all files changed in commit range (to detect already-synced translations)
    all_changed = get_files_changed_in_range(args.before, args.after)

    print(f"Changed English files: {len(changed_files)}")
    for f in changed_files:
        print(f"  {f}")

    # For each language, find files that need translation
    translated_files: dict[str, list[str]] = {}

    for lang in languages:
        lang_dir = lang["dir"]
        needs_translation = []

        for en_file in changed_files:
            # Determine expected lang file path
            if en_file.startswith("snippets/"):
                snippets_dir = lang.get("snippets_dir", f"snippets/{lang['code']}")
                lang_file = en_file.replace("snippets/", f"{snippets_dir}/", 1)
            else:
                lang_file = f"{lang_dir}/{en_file}"

            # Skip if this lang file was already updated in the same commit range
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

    # Write summary for PR body
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

    print("\nDone.")


if __name__ == "__main__":
    main()
