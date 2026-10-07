import { describe, expect, test } from "bun:test";
import { computeSyncedContent, syncChunkedHashes, syncPlainHashes } from "./sync-hash-i18n.ts";
import { parseFrontmatterAndBody } from "./chunked-translate.ts";

// Regression coverage for https://github.com/Comfy-Org/docs/issues/1358.
//
// syncChunkedHashes used to reassemble the file as `${frontmatter}\n${body}`
// while parseFrontmatterAndBody had already put the separating newline into
// `frontmatter`. Every pass therefore gained one blank line after the closing
// `---`, `output === targetContent` in syncOneFile could never hold, and
// `translate:sync-hash --dry-run` reported 71 of 84 files as drifted on a clean
// main. The invariant these tests protect is simply: running the sync twice must
// be the same as running it once.

const EN = `---
title: "Wan Dancer"
description: "Generate dance video from music."
---

Intro paragraph that belongs to the implicit _intro block.

## Model Highlights

Layered audio-driven framework built on Wan 2.2.

## Workflow Overview

Feed a reference image and an audio track.
`;

const TARGET = `---
title: "Wan Dancer：从音乐生成舞蹈视频"
description: "使用 Wan Dancer 从音乐生成舞蹈视频。"
---

import UpdateReminder from "/snippets/zh/tutorials/update-reminder.mdx"

开头段落。

## 模型亮点

基于 Wan 2.2 构建的分层音频驱动框架。

## 工作流概览

输入参考图像和音频。
`;

const EN_REL = "tutorials/video/wan/wan-dancer.mdx";

function blankLinesAfterFrontmatter(content: string): number {
  const match = content.match(/^---\n[\s\S]*?\n---\n(\n*)/);
  return match?.[1]?.length ?? 0;
}

describe("syncChunkedHashes idempotency", () => {
  test("running the sync twice is the same as running it once", () => {
    const once = syncChunkedHashes(EN, TARGET, "heading_sections", EN_REL);
    const twice = syncChunkedHashes(EN, once, "heading_sections", EN_REL);
    expect(twice).toBe(once);
  });

  test("stays stable over repeated passes", () => {
    let content = syncChunkedHashes(EN, TARGET, "heading_sections", EN_REL);
    for (let i = 0; i < 5; i++) {
      content = syncChunkedHashes(EN, content, "heading_sections", EN_REL);
    }
    expect(content).toBe(syncChunkedHashes(EN, TARGET, "heading_sections", EN_REL));
  });

  test("does not insert a blank line after the frontmatter", () => {
    expect(blankLinesAfterFrontmatter(TARGET)).toBe(1);
    let content = TARGET;
    for (let i = 0; i < 3; i++) {
      content = syncChunkedHashes(EN, content, "heading_sections", EN_REL);
      expect(blankLinesAfterFrontmatter(content)).toBe(1);
    }
  });

  test("leaves the body byte-for-byte untouched", () => {
    const before = parseFrontmatterAndBody(TARGET).body;
    const after = parseFrontmatterAndBody(
      syncChunkedHashes(EN, TARGET, "heading_sections", EN_REL)
    ).body;
    expect(after).toBe(before);
  });

  test("preserves blank lines a previous buggy run already committed", () => {
    // Files touched by the old script carry extra blank lines. The fix must not
    // add more, and must not silently reflow prose that a human may have edited.
    const withExtraBlanks = TARGET.replace(/^(---\n[\s\S]*?\n---\n)/, "$1\n\n");
    expect(blankLinesAfterFrontmatter(withExtraBlanks)).toBe(3);
    const once = syncChunkedHashes(EN, withExtraBlanks, "heading_sections", EN_REL);
    expect(blankLinesAfterFrontmatter(once)).toBe(3);
    expect(syncChunkedHashes(EN, once, "heading_sections", EN_REL)).toBe(once);
  });

  test("handles frontmatter that holds nothing but translation metadata", () => {
    // zh/custom-nodes/workflow_templates.mdx is shaped like this. Stripping the
    // meta leaves an empty frontmatter body, and the old code then emitted
    // "---\n\ntranslationSourceHash: …", a blank line no later run could clear.
    const metaOnly = [
      "---",
      "translationSourceHash: deadbeef",
      "translationFrom: tutorials/video/wan/wan-dancer.mdx",
      "---",
      "",
      "开头段落。",
      "",
      "## 模型亮点",
      "",
      "正文。",
      "",
    ].join("\n");
    const once = syncChunkedHashes(EN, metaOnly, "heading_sections", EN_REL);
    expect(once).not.toContain("---\n\ntranslationSourceHash");
    expect(syncChunkedHashes(EN, once, "heading_sections", EN_REL)).toBe(once);
  });

  test("works when the target has no frontmatter at all", () => {
    const bare = "开头段落。\n\n## 模型亮点\n\n正文。\n";
    const once = syncChunkedHashes(EN, bare, "heading_sections", EN_REL);
    expect(once.startsWith("---\n")).toBe(true);
    expect(syncChunkedHashes(EN, once, "heading_sections", EN_REL)).toBe(once);
  });
});

describe("computeSyncedContent reaches the unchanged branch", () => {
  // syncOneFile reports "unchanged" only when the stored hash matches AND
  // `output === targetContent`. The second condition was unreachable for every
  // chunked file, which is what made --dry-run useless as a drift signal.
  const CHUNKED_REL = "tutorials/partner-nodes/pricing.mdx"; // configured as heading_sections

  test("a synced file is reported as producing identical output", () => {
    const first = computeSyncedContent(EN, TARGET, CHUNKED_REL, EN_REL, false);
    const second = computeSyncedContent(EN, first.output, CHUNKED_REL, EN_REL, false);
    expect(second.output).toBe(first.output);
    expect(second.expectedFileHash).toBe(first.expectedFileHash);
  });

  test("the synced file records the hash syncOneFile compares against", () => {
    const { output, expectedFileHash } = computeSyncedContent(
      EN,
      TARGET,
      CHUNKED_REL,
      EN_REL,
      false
    );
    expect(output).toContain(`translationSourceHash: ${expectedFileHash}`);
  });
});

describe("syncPlainHashes idempotency", () => {
  const PLAIN_TARGET = `---
title: "登录"
---

正文内容。
`;

  test("page metadata round-trips", () => {
    const once = syncPlainHashes(PLAIN_TARGET, EN, EN_REL, false);
    expect(syncPlainHashes(once, EN, EN_REL, false)).toBe(once);
    expect(blankLinesAfterFrontmatter(once)).toBe(1);
  });

  test("snippet comment round-trips", () => {
    const snippet = "这是一个片段。\n";
    const once = syncPlainHashes(snippet, EN, EN_REL, true);
    expect(syncPlainHashes(once, EN, EN_REL, true)).toBe(once);
  });
});
