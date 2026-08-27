import { describe, expect, test } from "bun:test";
import {
  hasUnclosedCodeFence,
  repairTargetContent,
  repairUnclosedCodeFence,
} from "./check-translation-truncation.ts";

describe("repairUnclosedCodeFence", () => {
  test("detects unclosed fence", () => {
    const body = "Some text\n\n```bash\necho hello\n";
    expect(hasUnclosedCodeFence(body)).toBe(true);
  });

  test("leaves balanced fences unchanged", () => {
    const body = "Some text\n\n```bash\necho hello\n```\n";
    expect(hasUnclosedCodeFence(body)).toBe(false);
    const result = repairUnclosedCodeFence(body);
    expect(result.repaired).toBe(false);
  });

  test("appends closing fence", () => {
    const body = "Some text\n\n```bash\necho hello\n";
    const result = repairUnclosedCodeFence(body);
    expect(result.repaired).toBe(true);
    expect(result.body.endsWith("```\n")).toBe(true);
    expect(hasUnclosedCodeFence(result.body)).toBe(false);
  });
});

describe("repairTargetContent", () => {
  test("preserves frontmatter and appends closing fence", () => {
    const input = `---
title: "Example"
---

Intro

\`\`\`python
print("hi")
`;
    const { content, repaired, detail } = repairTargetContent(input);
    expect(repaired).toBe(true);
    expect(content.startsWith("---\ntitle: \"Example\"")).toBe(true);
    expect(content.trimEnd().endsWith("```")).toBe(true);
    expect(detail).toContain("appended closing");
  });
});
