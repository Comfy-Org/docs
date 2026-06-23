import { describe, expect, test } from "bun:test";
import {
  blockHash,
  documentBlockHashes,
  getSectionSyncStatus,
  parseDocument,
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
    expect(status.upToDate).toBe(false);
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
