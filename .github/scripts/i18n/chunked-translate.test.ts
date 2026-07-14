import { describe, expect, test } from "bun:test";
import {
  blockHash,
  documentBlockHashes,
  getSectionSyncStatus,
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
