import { describe, expect, test } from "bun:test";
import {
  assetLinks,
  changedEnglishFiles,
  compare,
  componentCounts,
  englishCounterpart,
  introducesNewGap,
  isExempt,
  localizedCounterparts,
  normalizeAssetUrl,
  strippedBody,
} from "./check-structure-parity.ts";

const EN = `---
title: "Anima"
---

## Text to image

<img src="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/image_anima_base_v1-1.webp" alt="preview" />

<CardGroup cols={2}>
  <Card title="Download Workflow" icon="download" href="https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_anima_base_v1.json">
    Download the JSON workflow file
  </Card>
  <Card title="Run on Comfy Cloud" icon="cloud" href="https://cloud.comfy.org/?template=image_anima_base_v1">
    Run this workflow on Comfy Cloud
  </Card>
</CardGroup>
`;

describe("strippedBody", () => {
  test("drops frontmatter", () => {
    expect(strippedBody(EN)).not.toContain("title:");
  });

  test("does not count components inside fenced code", () => {
    const body = strippedBody("```mdx\n<CardGroup>\n<Card />\n</CardGroup>\n```\n\nplain\n");
    expect(componentCounts(body).Card).toBeUndefined();
    expect(componentCounts(body).CardGroup).toBeUndefined();
  });

  test("keeps components outside fenced code", () => {
    const counts = componentCounts(strippedBody(EN));
    expect(counts.CardGroup).toBe(1);
    expect(counts.Card).toBe(2);
  });

  test("a three-backtick sample inside a four-backtick block stays content", () => {
    const raw = "````mdx\n```\n<CardGroup>\n```\n<Card />\n````\n\n<Card />\n";
    const counts = componentCounts(strippedBody(raw));
    expect(counts.Card).toBe(1);
    expect(counts.CardGroup).toBeUndefined();
  });

  test("a tilde fence inside a backtick fence stays content", () => {
    const raw = "```mdx\n~~~\n<CardGroup>\n~~~\n<Card />\n```\n\n<CardGroup />\n";
    const counts = componentCounts(strippedBody(raw));
    expect(counts.CardGroup).toBe(1);
    expect(counts.Card).toBeUndefined();
  });

  test("a longer closing fence closes the block", () => {
    const raw = "```mdx\n<Card />\n`````\n\n<CardGroup />\n";
    const counts = componentCounts(strippedBody(raw));
    expect(counts.Card).toBeUndefined();
    expect(counts.CardGroup).toBe(1);
  });
});

describe("componentCounts", () => {
  test("counts capitalized JSX tags generically, including unknown ones", () => {
    const counts = componentCounts("<CardGroup>\n<WeirdNestedComponent />\n<Weird.Nested />\n</CardGroup>");
    expect(counts.CardGroup).toBe(1);
    expect(counts.WeirdNestedComponent).toBe(1);
    expect(counts["Weird.Nested"]).toBe(1);
  });

  test("does not count closing tags or lowercase HTML tags", () => {
    const counts = componentCounts("<Card />\n</Card>\n<img src=\"x\" />\n<div></div>");
    expect(counts.Card).toBe(1);
    expect(counts.img).toBe(1);
    expect(counts.div).toBeUndefined();
  });

  test("separates img tags from markdown images and counts headings", () => {
    const counts = componentCounts("<img src=\"a\" />\n![alt](b)\n## H2\n### H3\n#### H4");
    expect(counts.img).toBe(1);
    expect(counts["markdown-image"]).toBe(1);
    expect(counts.h2).toBe(1);
    expect(counts.h3).toBe(1);
    expect(counts.h4).toBe(1);
  });
});

describe("compare", () => {
  test("reports a dropped CardGroup wrapper and a dropped card", () => {
    const localized = EN.replace("<CardGroup cols={2}>\n", "")
      .replace("</CardGroup>\n", "")
      .replace(/<Card title="Run on Comfy Cloud"[\s\S]*?<\/Card>\n/, "");
    const finding = compare(EN, localized, "ja/x.mdx");
    const labels = finding.missingComponents.map((c) => c.label);
    expect(labels).toContain("CardGroup");
    expect(labels).toContain("Card");
    expect(finding.missingLinks).toContain("https://cloud.comfy.org/?template=image_anima_base_v1");
  });

  test("reports a dropped image and ignores markup that only looks like a component in code", () => {
    const dropped = compare(EN, EN.replace(/<img[^\n]*\/>\n\n/, ""), "ja/x.mdx");
    expect(dropped.missingComponents.map((c) => c.label)).toContain("img");

    const fenced = compare(EN, `${EN}\n\`\`\`html\n<CardGroup cols={3}>\n  <Card title="x" />\n</CardGroup>\n\`\`\`\n`, "ko/x.mdx");
    expect(fenced.extraComponents).toHaveLength(0);
  });

  test("treats extra content as a warning, not a failure", () => {
    const localized = `${EN}\n<Card title="Extra" href="https://example.com">x</Card>\n`;
    const finding = compare(EN, localized, "zh/index.mdx");
    expect(finding.missingComponents).toHaveLength(0);
    expect(finding.missingLinks).toHaveLength(0);
    expect(finding.extraComponents.map((c) => c.label)).toContain("Card");
  });

  test("treats a case-only path difference in an asset link as the same link", () => {
    const en = "see https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/CLIPMergeSimple/en.md";
    const ja = "see https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/ClipMergeSimple/ja.md";
    const finding = compare(en, ja, "ja/x.mdx");
    expect(finding.missingLinks).toHaveLength(0);
  });

  test("passes an identical page", () => {
    const finding = compare(EN, EN, "ko/x.mdx");
    expect(finding.missingComponents).toHaveLength(0);
    expect(finding.missingLinks).toHaveLength(0);
  });

  test("tags the direction the finding came from", () => {
    expect(compare(EN, EN, "ja/x.mdx", "english").source).toBe("english");
  });
});

describe("introducesNewGap", () => {
  const base = EN;
  const changed = EN.replace(
    "</CardGroup>",
    '  <Card title="Second" href="https://example.com/second">y</Card>\n</CardGroup>'
  );

  test("an English change that a stale counterpart does not follow is new debt", () => {
    const stale = EN.replace(/<Card title="Run on Comfy Cloud"[\s\S]*?<\/Card>\n/, "");
    const finding = compare(changed, stale, "ja/x.mdx", "english");
    const baseFinding = compare(base, stale, "ja/x.mdx", "english");
    expect(finding.missingComponents.length).toBeGreaterThan(0);
    expect(introducesNewGap(finding, baseFinding)).toBe(true);
  });

  test("pre-existing debt is not blamed on the change", () => {
    const stale = EN.replace(/<Card title="Run on Comfy Cloud"[\s\S]*?<\/Card>\n/, "");
    const finding = compare(EN, stale, "ja/x.mdx", "english");
    const baseFinding = compare(EN, stale, "ja/x.mdx", "english");
    expect(introducesNewGap(finding, baseFinding)).toBe(false);
  });
});

describe("assetLinks / normalizeAssetUrl", () => {
  test("collects only asset hosts and strips trailing punctuation", () => {
    const links = assetLinks(
      "see https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/a.png) and https://example.com/x"
    );
    expect(links).toEqual([
      "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/a.png",
    ]);
  });

  test("maps a locale-specific embedded-docs link onto the English one", () => {
    const en = "https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/APG/en.md";
    const ja = "https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/APG/ja.md";
    expect(normalizeAssetUrl(ja)).toBe(normalizeAssetUrl(en));
  });

  test("drops trailing markdown punctuation and backticks", () => {
    expect(normalizeAssetUrl("https://cloud.comfy.org/mcp`")).toBe("https://cloud.comfy.org/mcp");
    expect(normalizeAssetUrl("https://cloud.comfy.org/mcp).")).toBe("https://cloud.comfy.org/mcp");
  });
});

describe("path helpers", () => {
  test("isExempt covers pricing, api-reference, snippets, orphans, changelog", () => {
    expect(isExempt("zh/pricing.mdx")).toBe(true);
    expect(isExempt("ja/api-reference/v2/overview.mdx")).toBe(true);
    expect(isExempt("ko/snippets/foo.mdx")).toBe(true);
    expect(isExempt("zh/comfy-router-limitations.mdx")).toBe(true);
    expect(isExempt("ja/changelog/index.mdx")).toBe(true);
    expect(isExempt("docs.json")).toBe(true);
    expect(isExempt("zh/tutorials/flux/flux-1-text-to-image.mdx")).toBe(false);
  });

  test("englishCounterpart and localizedCounterparts map between the two sides", () => {
    const repoRoot = new URL("../../..", import.meta.url).pathname;
    expect(englishCounterpart("ja/tutorials/flux/flux-1-text-to-image.mdx", repoRoot)).toBe(
      "tutorials/flux/flux-1-text-to-image.mdx"
    );
    expect(englishCounterpart("ja/does/not/exist.mdx", repoRoot)).toBeNull();
    expect(localizedCounterparts("tutorials/flux/flux-1-text-to-image.mdx", repoRoot)).toEqual([
      "ja/tutorials/flux/flux-1-text-to-image.mdx",
      "zh/tutorials/flux/flux-1-text-to-image.mdx",
      "ko/tutorials/flux/flux-1-text-to-image.mdx",
    ]);
  });

  test("changedEnglishFiles excludes localized and exempt paths", () => {
    const repoRoot = new URL("../../..", import.meta.url).pathname;
    const files = changedEnglishFiles(repoRoot, "HEAD~1");
    expect(files.every((f) => !f.startsWith("ja/") && !f.startsWith("zh/") && !f.startsWith("ko/"))).toBe(true);
  });
});
