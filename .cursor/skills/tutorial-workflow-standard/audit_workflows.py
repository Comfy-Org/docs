#!/usr/bin/env python3
"""Audit (and optionally fix) tutorial workflow pages against SPEC.md."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INDEX_PATH = ROOT.parent / "workflow_templates" / "templates" / "index.json"

OUTPUT_MARKERS = [
    "**Example output**",
    "**输出示例**",
    "**出力例**",
    "**출력 예시**",
]

WEBP_IN_TEMPLATES = re.compile(
    r"https://raw\.githubusercontent\.com/Comfy-Org/workflow_templates/main/templates/[^\s\"')]+-\d+\.webp"
)

CARD_SHORT = {
    "en": {"cloud": "Open in Comfy Cloud", "download": "Download JSON workflow"},
    "zh": {"cloud": "在 Comfy Cloud 中打开", "download": "下载 JSON 工作流"},
    "ja": {"cloud": "Comfy Cloud で開く", "download": "JSON ワークフローをダウンロード"},
    "ko": {"cloud": "Comfy Cloud에서 열기", "download": "JSON 워크플로 다운로드"},
}

EMPTY_CARD = re.compile(
    r'(?P<open><Card\s+title="[^"]*"\s+icon="(?P<icon>cloud|download)"[^>]*>)\s*\n\s*</Card>',
    re.MULTILINE,
)

TUTORIAL_ROOTS = ("tutorials", "zh/tutorials", "ja/tutorials", "ko/tutorials")


def iter_mdx() -> list[Path]:
    paths: list[Path] = []
    for root in TUTORIAL_ROOTS:
        base = ROOT / root
        if base.exists():
            paths.extend(sorted(base.rglob("*.mdx")))
    return paths


def locale_for(path: Path) -> str:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return "en"
    if rel.parts[0] in CARD_SHORT:
        return rel.parts[0]
    return "en"


def load_templates() -> dict:
    if not INDEX_PATH.exists():
        return {}
    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    out: dict = {}
    for mod in data:
        for t in mod.get("templates", []):
            out[t["name"]] = t
    return out


def output_url_for_template(templates: dict, template_name: str) -> str | None:
    t = templates.get(template_name)
    if not t:
        return None
    for item in t.get("thumbnail") or []:
        if item.startswith("output/"):
            return f"https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/{item}"
    for o in t.get("io", {}).get("outputs", []):
        f = o.get("file")
        if f:
            return f"https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/output/{f}"
    return None


def find_example_output_blocks(text: str) -> list[tuple[int, int]]:
    blocks: list[tuple[int, int]] = []
    for marker in OUTPUT_MARKERS:
        start = 0
        while True:
            idx = text.find(marker, start)
            if idx == -1:
                break
            rest = text[idx + len(marker) :]
            end_match = re.search(r"\n(?:## |### |\*\*[A-Z])", rest)
            block_end = idx + len(marker) + (end_match.start() if end_match else len(rest))
            blocks.append((idx, block_end))
            start = idx + len(marker)
    return sorted(set(blocks))


def audit_webp(path: Path, templates: dict, fix: bool) -> list[str]:
    text = path.read_text(encoding="utf-8")
    issues: list[str] = []
    original = text

    blocks = find_example_output_blocks(text)
    for start, end in reversed(blocks):
        block = text[start:end]
        if not WEBP_IN_TEMPLATES.search(block):
            continue
        rel = path.relative_to(ROOT)
        issues.append(f"{rel}: webp in Example output section")
        if not fix:
            continue
        webp_match = WEBP_IN_TEMPLATES.search(block)
        if not webp_match:
            continue
        m = re.search(r"templates/([^/\"')]+)-\d+\.webp", webp_match.group(0))
        template_name = m.group(1) if m else None
        real_url = output_url_for_template(templates, template_name) if template_name else None
        if real_url:
            block = block.replace(webp_match.group(0), real_url)
            text = text[:start] + block + text[end:]
        else:
            text = text[:start] + text[end:]
            text = re.sub(r"\n{3,}", "\n\n", text)

    if fix:
        text = WEBP_IN_TEMPLATES.sub(
            lambda m: "" if "-2.webp" in m.group(0) else m.group(0),
            text,
        )
        text = re.sub(r'\n\s*<img src=""[^>]*/>\s*', "\n", text)
        for marker in OUTPUT_MARKERS:
            text = re.sub(
                rf"{re.escape(marker)}\s*\n\s*<div style=\{{\{{display: 'grid'[^>]*\}}\}}>\s*</div>\s*\n",
                "",
                text,
            )
        if text != original:
            path.write_text(text, encoding="utf-8")

    return issues


def audit_empty_cards(path: Path, fix: bool) -> list[str]:
    text = path.read_text(encoding="utf-8")
    matches = list(EMPTY_CARD.finditer(text))
    if not matches:
        return []

    rel = path.relative_to(ROOT)
    issues = [f"{rel}: {len(matches)} empty Card(s)"]
    if not fix:
        return issues

    locale = locale_for(path)
    labels = CARD_SHORT[locale]
    count = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        body = labels[match.group("icon")]
        return f'{match.group("open")}\n    {body}\n  </Card>'

    updated = EMPTY_CARD.sub(repl, text)
    if count:
        path.write_text(updated, encoding="utf-8")
    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit tutorial workflow MDX pages.")
    parser.add_argument("--fix", action="store_true", help="Apply safe auto-fixes")
    args = parser.parse_args()

    templates = load_templates()
    if not templates and args.fix:
        print(f"warn: index not found at {INDEX_PATH}, webp fixes may be limited")

    webp_issues: list[str] = []
    card_issues: list[str] = []
    for path in iter_mdx():
        webp_issues.extend(audit_webp(path, templates, args.fix))
        card_issues.extend(audit_empty_cards(path, args.fix))

    print(f"webp misuse: {len(webp_issues)}")
    for item in webp_issues[:20]:
        print(f"  {item}")
    if len(webp_issues) > 20:
        print(f"  ... and {len(webp_issues) - 20} more")

    print(f"empty Cards: {len(card_issues)}")
    for item in card_issues[:20]:
        print(f"  {item}")
    if len(card_issues) > 20:
        print(f"  ... and {len(card_issues) - 20} more")

    if args.fix:
        print("fixes applied where possible")
    elif webp_issues or card_issues:
        print("run with --fix to apply safe auto-fixes")


if __name__ == "__main__":
    main()
