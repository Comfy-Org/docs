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
