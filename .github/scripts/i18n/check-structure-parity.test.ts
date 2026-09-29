import { describe, expect, test } from "bun:test";
import {
  assetLinks,
  compare,
  countComponents,
  englishCounterpart,
  isExempt,
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
    expect(countComponents(body).Card).toBe(0);
    expect(countComponents(body).CardGroup).toBe(0);
  });

  test("keeps components outside fenced code", () => {
    expect(countComponents(strippedBody(EN)).CardGroup).toBe(1);
    expect(countComponents(strippedBody(EN)).Card).toBe(2);
  });
});

describe("compare", () => {
  test("reports a dropped CardGroup wrapper and a dropped card", () => {
    const localized = EN.replace("<CardGroup cols={2}>\n", "").replace("</CardGroup>\n", "").replace(
      /<Card title="Run on Comfy Cloud"[\s\S]*?<\/Card>\n/,
      ""
    );
    const finding = compare(EN, localized, "ja/x.mdx");
    const labels = finding.missingComponents.map((c) => c.label);
    expect(labels).toContain("CardGroup");
    expect(labels).toContain("Card");
    expect(finding.missingLinks).toContain(
      "https://cloud.comfy.org/?template=image_anima_base_v1"
    );
  });

  test("reports a dropped image", () => {
    const localized = EN.replace(/<img[^\n]*\/>\n\n/, "");
    const finding = compare(EN, localized, "ja/x.mdx");
    expect(finding.missingComponents.map((c) => c.label)).toContain("image");
    expect(finding.missingLinks.some((l) => l.includes("-1.webp"))).toBe(true);
  });

  test("treats extra content as a warning, not a failure", () => {
    const localized = `${EN}\n<Card title="Extra" href="https://example.com">x</Card>\n`;
    const finding = compare(EN, localized, "zh/index.mdx");
    expect(finding.missingComponents).toHaveLength(0);
    expect(finding.missingLinks).toHaveLength(0);
    expect(finding.extraComponents.map((c) => c.label)).toContain("Card");
  });

  test("passes an identical page", () => {
    const finding = compare(EN, EN, "ko/x.mdx");
    expect(finding.missingComponents).toHaveLength(0);
    expect(finding.missingLinks).toHaveLength(0);
  });

  test("ignores markup that only looks like a component inside code", () => {
    const localized = `${EN}\n\`\`\`html\n<CardGroup cols={3}>\n  <Card title="x" />\n</CardGroup>\n\`\`\`\n`;
    const finding = compare(EN, localized, "ko/x.mdx");
    expect(finding.extraComponents).toHaveLength(0);
  });
});

describe("assetLinks", () => {
  test("collects only asset hosts and strips trailing punctuation", () => {
    const links = assetLinks(
      "see https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/a.png) and https://example.com/x"
    );
    expect(links).toEqual([
      "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/a.png",
    ]);
  });
});


describe("normalizeAssetUrl", () => {
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
    expect(isExempt("zh/tutorials/flux/flux-1-text-to-image.mdx")).toBe(false);
  });

  test("englishCounterpart maps a locale path to the English page", () => {
    const repoRoot = new URL("../../..", import.meta.url).pathname;
    expect(englishCounterpart("ja/tutorials/flux/flux-1-text-to-image.mdx", repoRoot)).toBe(
      "tutorials/flux/flux-1-text-to-image.mdx"
    );
    expect(englishCounterpart("ja/does/not/exist.mdx", repoRoot)).toBeNull();
  });
});
