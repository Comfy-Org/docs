#!/usr/bin/env python3
"""Remove templates/*.webp from Example output sections; fix SPEC violations."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INDEX_PATH = Path("/Users/linmoumou/Documents/comfy/workflow_templates/templates/index.json")

OUTPUT_MARKERS = [
    "**Example output**",
    "**输出示例**",
    "**出力例**",
    "**출력 예시**",
]

WEBP_IN_TEMPLATES = re.compile(
    r"https://raw\.githubusercontent\.com/Comfy-Org/workflow_templates/main/templates/[^\s\"')]+-\d+\.webp"
)


def load_templates() -> dict:
    data = json.loads(INDEX_PATH.read_text())
    out = {}
    for mod in data:
        for t in mod.get("templates", []):
            out[t["name"]] = t
    return out


def output_url_for_template(templates: dict, template_name: str) -> str | None:
    t = templates.get(template_name)
    if not t:
        return None
    thumb = t.get("thumbnail") or []
    for item in thumb:
        if item.startswith("output/"):
            return f"https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/{item}"
    for o in t.get("io", {}).get("outputs", []):
        f = o.get("file")
        if f:
            return f"https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/output/{f}"
    return None


def find_example_output_blocks(text: str) -> list[tuple[int, int]]:
    blocks = []
    for marker in OUTPUT_MARKERS:
        start = 0
        while True:
            idx = text.find(marker, start)
            if idx == -1:
                break
            block_start = idx
            rest = text[idx + len(marker) :]
            # end at next ## or ### heading at line start, or **Model / next major section
            end_match = re.search(r"\n(?:## |### |\*\*[A-Z])", rest)
            block_end = idx + len(marker) + (end_match.start() if end_match else len(rest))
            blocks.append((block_start, block_end))
            start = idx + len(marker)
    return sorted(set(blocks))


def fix_file(path: Path, templates: dict) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text

    blocks = find_example_output_blocks(text)
    # process from end to preserve offsets
    for start, end in reversed(blocks):
        block = text[start:end]
        if not WEBP_IN_TEMPLATES.search(block):
            continue
        # try replace webp output side with real output URL
        webp_match = WEBP_IN_TEMPLATES.search(block)
        if webp_match:
            webp_url = webp_match.group(0)
            m = re.search(r"templates/([^/\"')]+)-\d+\.webp", webp_url)
            template_name = m.group(1) if m else None
            real_url = output_url_for_template(templates, template_name) if template_name else None
            if real_url:
                block = block.replace(webp_url, real_url)
                text = text[:start] + block + text[end:]
            else:
                # remove entire example output section
                text = text[:start] + text[end:]
                # trim extra blank lines
                text = re.sub(r"\n{3,}", "\n\n", text)

    # safety: remove any remaining templates/*-2.webp anywhere (never valid in docs)
    text = WEBP_IN_TEMPLATES.sub(
        lambda m: "" if "-2.webp" in m.group(0) else m.group(0),
        text,
    )
    # remove broken empty output imgs left after stripping webp
    text = re.sub(r'\n\s*<img src=""[^>]*/>\s*', "\n", text)
    # clean up empty grids left behind
    text = re.sub(
        r"\*\*Example output\*\*\s*\n\s*<div style=\{\{display: 'grid'[^>]*\}\}>\s*</div>\s*\n",
        "",
        text,
    )
    text = re.sub(
        r"\*\*输出示例\*\*\s*\n\s*<div style=\{\{display: 'grid'[^>]*\}\}>\s*</div>\s*\n",
        "",
        text,
    )
    text = re.sub(
        r"\*\*出力例\*\*\s*\n\s*<div style=\{\{display: 'grid'[^>]*\}\}>\s*</div>\s*\n",
        "",
        text,
    )
    text = re.sub(
        r"\*\*출력 예시\*\*\s*\n\s*<div style=\{\{display: 'grid'[^>]*\}\}>\s*</div>\s*\n",
        "",
        text,
    )

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    templates = load_templates()
    changed = []
    for path in ROOT.rglob("*.mdx"):
        if "node_modules" in path.parts:
            continue
        if fix_file(path, templates):
            changed.append(str(path.relative_to(ROOT)))
    print(f"Fixed {len(changed)} files")
    for p in sorted(changed):
        print(f"  {p}")


if __name__ == "__main__":
    main()
