import { describe, expect, test } from "bun:test";
import {
  blockHash,
  documentBlockHashes,
  getSectionSyncStatus,
  mapTargetSectionsByStoredLabels,
  parseDocument,
  softSplitByBudget,
  splitByH3Subheadings,
  splitByMintlifyTabs,
  splitOversizedBlock,
  validateTranslatedBlock,
  codeBlocksMatch,
  codeSignature,
  stripTrailingComment,
  docstringLineFlags,
} from "./chunked-translate.ts";

const FM = `---
title: "Changelog"
translationBlockHashes:
`;

function enBlock(label: string, body: string, date: string): string {
  return `<Update label="${label}" description="${date}">\n\n${body}\n\n</Update>`;
}

function targetMdx(
  blocks: Array<{ label: string; body: string; date: string }>,
  hashes: Record<string, string>
): string {
  const hashLines = Object.entries(hashes)
    .map(([label, hash]) => `  "${label}": ${hash}`)
    .join("\n");
  const body = blocks.map((b) => enBlock(b.label, b.body, b.date)).join("\n\n");
  return `${FM}${hashLines}\n---\n${body}\n`;
}

describe("getSectionSyncStatus update_blocks", () => {
  const v026 = enBlock("v0.26.0", "* **Krea2**: first draft", "June 23, 2026");
  const v026Edited = enBlock("v0.26.0", "* **Krea2**: option C", "June 23, 2026");
  const v0251 = enBlock("v0.25.1", "* **Kling**", "June 16, 2026");

  test("marks new version labels as pending", () => {
    const en = `---\n---\n${v026}\n\n${v0251}\n`;
    const target = targetMdx(
      [{ label: "v0.25.1", body: "* Kling", date: "June 16, 2026" }],
      { "v0.25.1": blockHash(v0251) }
    );
    const status = getSectionSyncStatus(en, target, "update_blocks", false, "zh");
    expect(status.pendingBlocks).toEqual(["v0.26.0"]);
    expect(status.upToDate).toBe(false);
  });

  test("skips blocks when stored hash matches English", () => {
    const en = `---\n---\n${v026}\n\n${v0251}\n`;
    const enHashes = documentBlockHashes(parseDocument(en, "update_blocks").blocks);
    const target = targetMdx(
      [
        { label: "v0.26.0", body: "* **Krea2**: first draft", date: "2026年6月23日" },
        { label: "v0.25.1", body: "* Kling", date: "2026年6月16日" },
      ],
      enHashes
    );
    const status = getSectionSyncStatus(en, target, "update_blocks", false, "zh");
    expect(status.pendingBlocks).toEqual([]);
    expect(status.upToDate).toBe(true);
  });

  test("re-translates when English block content changes", () => {
    const en = `---\n---\n${v026Edited}\n\n${v0251}\n`;
    const enHashes = documentBlockHashes(parseDocument(en, "update_blocks").blocks);
    const target = targetMdx(
      [
        { label: "v0.26.0", body: "* **Krea2**: first draft", date: "June 23, 2026" },
        { label: "v0.25.1", body: "* Kling", date: "June 16, 2026" },
      ],
      {
        "v0.26.0": blockHash(v026),
        "v0.25.1": enHashes["v0.25.1"]!,
      }
    );
    const status = getSectionSyncStatus(en, target, "update_blocks", false, "zh");
    expect(status.pendingBlocks).toEqual(["v0.26.0"]);
  });

  test("re-translates when block exists but hash entry is missing", () => {
    const en = `---\n---\n${v026}\n\n${v0251}\n`;
    const enHashes = documentBlockHashes(parseDocument(en, "update_blocks").blocks);
    const target = targetMdx(
      [
        { label: "v0.26.0", body: "* **Krea2**: first draft", date: "June 23, 2026" },
        { label: "v0.25.1", body: "* Kling", date: "June 16, 2026" },
      ],
      { "v0.25.1": enHashes["v0.25.1"]! }
    );
    const status = getSectionSyncStatus(en, target, "update_blocks", false, "zh");
    expect(status.pendingBlocks).toEqual(["v0.26.0"]);
  });
});

describe("getSectionSyncStatus heading_sections", () => {
  function headingDoc(sections: Array<{ label: string; body: string }>): string {
    return `---\ntitle: Test\n---\nIntro\n\n${sections
      .map((section) => `## ${section.label}\n${section.body}`)
      .join("\n\n")}\n`;
  }

  function translatedHeadingDoc(
    enContent: string,
    targetSections: Array<{ heading: string; body: string }>
  ): string {
    const enHashes = documentBlockHashes(parseDocument(enContent, "heading_sections").blocks);
    const hashLines = Object.entries(enHashes)
      .map(([label, hash]) => `  ${JSON.stringify(label)}: ${hash}`)
      .join("\n");
    return `---\ntitle: 测试\ntranslationBlockHashes:\n${hashLines}\n---\n简介\n\n${targetSections
      .map((section) => `## ${section.heading}\n${section.body}`)
      .join("\n\n")}\n`;
  }

  test("maps a changed section by label when another section is inserted", () => {
    const oldEn = headingDoc([
      { label: "Alpha", body: "A" },
      { label: "Beta", body: "B" },
    ]);
    const en = headingDoc([
      { label: "Alpha", body: "A updated" },
      { label: "Inserted", body: "I" },
      { label: "Beta", body: "B" },
    ]);
    const target = translatedHeadingDoc(oldEn, [
      { heading: "阿尔法", body: "甲" },
      { heading: "贝塔", body: "乙" },
    ]);

    const status = getSectionSyncStatus(en, target, "heading_sections", false, "zh");
    expect(status.pendingBlocks).toEqual(["Alpha", "Inserted"]);

    const targetByLabel = mapTargetSectionsByStoredLabels(
      parseDocument(target, "heading_sections").blocks.map((b) => b.content).join("\n\n"),
      ["_intro", "Alpha", "Beta"]
    );
    expect(targetByLabel.get("Alpha")).toContain("## 阿尔法");
    expect(targetByLabel.get("Beta")).toContain("## 贝塔");
    expect(targetByLabel.has("Inserted")).toBe(false);
  });

  test("refuses positional mapping when intro boundary drifts but counts match", () => {
    const body = `## 阿尔法
甲

## 贝塔
乙

## 伽马
丙
`;
    const storedLabels = ["_intro", "Alpha", "Beta"];
    const targetByLabel = mapTargetSectionsByStoredLabels(body, storedLabels);
    expect(targetByLabel.size).toBe(0);
  });

  test("falls back to positional seeding when stored-label mapping is empty", () => {
    const en = headingDoc([
      { label: "Alpha", body: "A" },
      { label: "Beta", body: "B" },
    ]);
    const target = translatedHeadingDoc(en, [
      { heading: "阿尔法", body: "甲" },
      { heading: "贝塔", body: "乙" },
    ]);
    const truncatedTarget = target.replace(/\n\n## 贝塔[\s\S]*$/, "\n");
    const storedLabels = ["_intro", "Alpha", "Beta"];
    const targetBody = parseDocument(truncatedTarget, "heading_sections").blocks
      .map((b) => b.content)
      .join("\n\n");
    const targetHeadingSections = parseDocument(truncatedTarget, "heading_sections").blocks;
    const mappedByStoredLabel = mapTargetSectionsByStoredLabels(targetBody, storedLabels);
    expect(mappedByStoredLabel.size).toBe(0);

    const existingContentForLabel = new Map<string, string>();
    if (mappedByStoredLabel.size === 0 && targetHeadingSections.length !== storedLabels.length) {
      storedLabels.forEach((label, index) => {
        if (index < targetHeadingSections.length) {
          existingContentForLabel.set(label, targetHeadingSections[index]!.content);
        }
      });
    }

    const slots = parseDocument(en, "heading_sections").blocks.map((b) => {
      const content = existingContentForLabel.get(b.label) ?? null;
      return { label: b.label, content: content?.trim() ? content : null };
    });

    expect(slots.find((s) => s.label === "_intro")?.content).toContain("简介");
    expect(slots.find((s) => s.label === "Alpha")?.content).toContain("## 阿尔法");
    expect(slots.find((s) => s.label === "Beta")?.content).toBeNull();
  });

  test("marks every section pending when target body is missing sections", () => {
    const en = headingDoc([
      { label: "Alpha", body: "A" },
      { label: "Beta", body: "B" },
    ]);
    const fullTarget = translatedHeadingDoc(en, [
      { heading: "阿尔法", body: "甲" },
      { heading: "贝塔", body: "乙" },
    ]);
    const truncatedTarget = fullTarget.replace(/\n\n## 贝塔[\s\S]*$/, "\n");

    const status = getSectionSyncStatus(
      en,
      truncatedTarget,
      "heading_sections",
      false,
      "zh"
    );
    expect(status.upToDate).toBe(false);
    expect(status.pendingBlocks).toEqual(["_intro", "Alpha", "Beta"]);
  });

  test("re-serializes deletion and reorder without re-translating unchanged sections", () => {
    const oldEn = headingDoc([
      { label: "Alpha", body: "A" },
      { label: "Removed", body: "R" },
      { label: "Beta", body: "B" },
    ]);
    const en = headingDoc([
      { label: "Beta", body: "B" },
      { label: "Alpha", body: "A" },
    ]);
    const target = translatedHeadingDoc(oldEn, [
      { heading: "阿尔法", body: "甲" },
      { heading: "已删除", body: "删" },
      { heading: "贝塔", body: "乙" },
    ]);

    const status = getSectionSyncStatus(en, target, "heading_sections", false, "zh");
    expect(status.pendingBlocks).toEqual([]);
    expect(status.needsReserialize).toBe(true);
  });
});

describe("splitOversizedBlock", () => {
  test("returns single piece when under budget", () => {
    expect(splitOversizedBlock("## Small\n\nHello", 6000)).toEqual(["## Small\n\nHello"]);
  });

  test("splits Mintlify Tabs and concatenates to original", () => {
    const content = `## Install

Intro text.

<Tabs>
  <Tab title="A">
    Alpha content here.
  </Tab>
  <Tab title="B">
    Bravo content here.
  </Tab>
</Tabs>
`;
    const pieces = splitByMintlifyTabs(content);
    expect(pieces).not.toBeNull();
    expect(pieces!.length).toBeGreaterThanOrEqual(3);
    expect(pieces!.join("")).toBe(content);

    const oversized = splitOversizedBlock(content, 40);
    expect(oversized.length).toBeGreaterThan(1);
    expect(oversized.join("")).toBe(content);
  });

  test("splits on ### subheadings", () => {
    const content = `## Advanced

Prefix.

### One
aaaa

### Two
bbbb
`;
    const pieces = splitByH3Subheadings(content);
    expect(pieces).not.toBeNull();
    expect(pieces!.length).toBe(2);
    expect(pieces!.join("")).toBe(content);
  });

  test("soft-split does not leave an open fence", () => {
    const fenceBody = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n");
    const content = `## Code\n\nBefore\n\n\`\`\`\n${fenceBody}\n\`\`\`\n\nAfter paragraph text\n`;
    const pieces = softSplitByBudget(content, 80);
    expect(pieces.join("")).toBe(content);
    for (const p of pieces) {
      let inFence = false;
      for (const line of p.split("\n")) {
        if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
      }
      expect(inFence).toBe(false);
    }
  });
});

describe("validateTranslatedBlock heading_sections", () => {
  const installBlock = {
    label: "Install Comfy Cloud MCP",
    content: `## Install Comfy Cloud MCP

<Tabs>
  <Tab title="A">
    one
  </Tab>
  <Tab title="B">
    two
  </Tab>
</Tabs>
`,
  };

  test("accepts complete Tab set", () => {
    const tr = `## 安装

<Tabs>
  <Tab title="A">
    一
  </Tab>
  <Tab title="B">
    二
  </Tab>
</Tabs>
`;
    expect(validateTranslatedBlock("heading_sections", installBlock, tr)).toBe(true);
  });

  test("rejects truncated Tab set", () => {
    const tr = `## 安装

<Tabs>
  <Tab title="A">
    一
`;
    expect(validateTranslatedBlock("heading_sections", installBlock, tr)).toBe(false);
  });

  test("rejects finish_reason length", () => {
    const tr = installBlock.content;
    expect(
      validateTranslatedBlock("heading_sections", installBlock, tr, { finishReason: "length" })
    ).toBe(false);
  });
});

describe("code block comparison (comments may be localized)", () => {
  const enBlock = {
    label: "Examples",
    content: `## Examples

\`\`\`python
# Process the image
image = load_image("photo.png")  # input image
return image
\`\`\`
`,
  };

  test("accepts a translated whole-line comment", () => {
    const tr = `## 示例

\`\`\`python
# 处理图像
image = load_image("photo.png")  # 输入图像
return image
\`\`\`
`;
    expect(validateTranslatedBlock("heading_sections", enBlock, tr)).toBe(true);
  });

  test("rejects a changed code line", () => {
    const tr = `## 示例

\`\`\`python
# 处理图像
image = load_image("other.png")  # 输入图像
return image
\`\`\`
`;
    expect(validateTranslatedBlock("heading_sections", enBlock, tr)).toBe(false);
  });

  test("rejects a dropped code line", () => {
    const tr = `## 示例

\`\`\`python
# 处理图像
image = load_image("photo.png")  # 输入图像
\`\`\`
`;
    expect(validateTranslatedBlock("heading_sections", enBlock, tr)).toBe(false);
  });

  test("rejects a code line that was commented out", () => {
    const tr = `## 示例

\`\`\`python
# 处理图像
image = load_image("photo.png")  # 输入图像
# return image
\`\`\`
`;
    expect(validateTranslatedBlock("heading_sections", enBlock, tr)).toBe(false);
  });

  test("rejects a changed string literal that looks like a comment marker", () => {
    const en = "```javascript\nconsole.log('# not a comment');\n```";
    const tr = "```javascript\nconsole.log('# changed');\n```";
    expect(codeBlocksMatch(en, tr)).toBe(false);
  });

  test("keeps a shebang byte-identical", () => {
    const en = "```bash\n#!/usr/bin/env bash\n# install\ncomfy install\n```";
    const tr = "```bash\n#!/usr/bin/env bash\n# 安装\ncomfy install\n```";
    expect(codeBlocksMatch(en, tr)).toBe(true);
    const translatedShebang = "```bash\n#!/bin/sh\n# 安装\ncomfy install\n```";
    expect(codeBlocksMatch(en, translatedShebang)).toBe(false);
  });

  test("does not treat bash CLI flags as comments", () => {
    expect(stripTrailingComment("comfy deploy scale --min 2 --max 5", ["#"])).toBe(
      "comfy deploy scale --min 2 --max 5"
    );
    expect(stripTrailingComment("comfy build ls  # list builds", ["#"])).toBe("comfy build ls");
  });

  test("drops comment-only lines from the code signature", () => {
    const block = "```bash\n# step one\ncomfy install\n\n# step two\ncomfy run\n```";
    expect(codeSignature(block, "bash")).toEqual(["comfy install", "comfy run"]);
  });

  test("rejects a different fence language tag", () => {
    const en = "```python\nprint('hi')\n```";
    const tr = "```bash\nprint('hi')\n```";
    expect(codeBlocksMatch(en, tr)).toBe(false);
  });
});

describe("docstrings are documentation", () => {
  test("accepts a translated python docstring", () => {
    const en = `\`\`\`python
class Example(io.ComfyNode):
    """Return the list of node classes this extension provides."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="Example")
\`\`\``;
    const tr = `\`\`\`python
class Example(io.ComfyNode):
    """この拡張機能が提供するノードクラスの一覧を返します。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="Example")
\`\`\``;
    expect(codeBlocksMatch(en, tr)).toBe(true);
  });

  test("accepts a translated single-line docstring", () => {
    const en = `\`\`\`python
def f():
    """Process an image."""
    return 1
\`\`\``;
    const tr = `\`\`\`python
def f():
    """画像を処理します。"""
    return 1
\`\`\``;
    expect(codeBlocksMatch(en, tr)).toBe(true);
  });

  test("still rejects a code change next to a docstring", () => {
    const en = `\`\`\`python
def f():
    """Process an image."""
    return 1
\`\`\``;
    const tr = `\`\`\`python
def f():
    """画像を処理します。"""
    return 2
\`\`\``;
    expect(codeBlocksMatch(en, tr)).toBe(false);
  });

  test("rejects a translated string literal used as a value", () => {
    const en = '```python\ntooltip="3D model file or path string",\n```';
    const tr = '```python\ntooltip="3D モデルファイルまたはパス文字列",\n```';
    expect(codeBlocksMatch(en, tr)).toBe(false);
  });

  test("flags docstring lines only at suite position", () => {
    const suite = ['def f():', '    """doc', '    more doc', '    """', '    return 1'];
    expect(docstringLineFlags(suite, "python")).toEqual([false, true, true, true, false]);
    const blockStart = ['"""module doc"""', 'x = 1'];
    expect(docstringLineFlags(blockStart, "python")).toEqual([true, false]);
    const value = ['labels = (', '    """English"""', ')'];
    expect(docstringLineFlags(value, "python")).toEqual([false, false, false]);
    expect(docstringLineFlags(suite, "bash")).toEqual([false, false, false, false, false]);
  });

  test("rejects a translated triple-quoted value", () => {
    const en = '```python\nlabels = (\n    """English"""\n)\n```';
    const tr = '```python\nlabels = (\n    """中文"""\n)\n```';
    expect(codeBlocksMatch(en, tr)).toBe(false);
  });

  test("keeps a generator method line as code", () => {
    const en = '```javascript\nclass C {\n  *values() { yield 1; }\n}\n```';
    const changed = '```javascript\nclass C {\n  *values() { yield 2; }\n}\n```';
    expect(codeBlocksMatch(en, changed)).toBe(false);
    const commented = '```javascript\nclass C {\n  *values() { yield 1; }  // 로컬 주석\n}\n```';
    expect(codeBlocksMatch(en, commented)).toBe(true);
  });

  test("recognizes trailing comments written without a space", () => {
    expect(stripTrailingComment("value=1# note", ["#"], "python")).toBe("value=1");
    expect(stripTrailingComment("run();// note", ["//"], "javascript")).toBe("run();");
    expect(stripTrailingComment("echo a#b", ["#"], "bash")).toBe("echo a#b");
    const en = '```python\nvalue=1# the value\n```';
    const tr = '```python\nvalue=1# 値\n```';
    expect(codeBlocksMatch(en, tr)).toBe(true);
  });

  test("tracks block comments across lines", () => {
    const en = '```javascript\nconst a = 1; /* note\n   still note */\nconst b = 2;\n```';
    const localized = '```javascript\nconst a = 1; /* 説明\n   続き */\nconst b = 2;\n```';
    expect(codeBlocksMatch(en, localized)).toBe(true);
    const changed = '```javascript\nconst a = 1; /* 説明\n   続き */\nconst b = 3;\n```';
    expect(codeBlocksMatch(en, changed)).toBe(false);
  });

  test("keeps code after a block-comment marker inside a string", () => {
    const en = '```javascript\nconst marker = "/*";\nconst value = 1;\n```';
    const changed = '```javascript\nconst marker = "/*";\nconst value = 2;\n```';
    expect(codeBlocksMatch(en, changed)).toBe(false);
    expect(validateTranslatedBlock(
      "heading_sections",
      { label: "Examples", content: `## Examples\n\n${en}` },
      `## 示例\n\n${changed}`
    )).toBe(false);
  });

  test("keeps code after slashes inside a regex literal", () => {
    const en = '```javascript\nconst re = /a\\/\\/b/; const value = 1;\n```';
    const changed = '```javascript\nconst re = /a\\/\\/b/; const value = 2;\n```';
    expect(codeBlocksMatch(en, changed)).toBe(false);
  });

  test("keeps code on a docstring line", () => {
    const en = '```python\ndef f():\n    """docs"""; return 1\n```';
    const localized = '```python\ndef f():\n    """文档"""; return 1\n```';
    const changed = '```python\ndef f():\n    """文档"""; return 2\n```';
    expect(codeBlocksMatch(en, localized)).toBe(true);
    expect(codeBlocksMatch(en, changed)).toBe(false);
  });

  test("treats a string under an if statement as code", () => {
    const en = '```python\nif enabled:\n    """English value"""\n```';
    const changed = '```python\nif enabled:\n    """Translated value"""\n```';
    expect(codeBlocksMatch(en, changed)).toBe(false);
  });

  test("accepts a module docstring after a comment", () => {
    const en = '```python\n# module name\n"""English docs"""\nvalue = 1\n```';
    const localized = '```python\n# 模块名称\n"""中文文档"""\nvalue = 1\n```';
    expect(codeBlocksMatch(en, localized)).toBe(true);
  });
});
