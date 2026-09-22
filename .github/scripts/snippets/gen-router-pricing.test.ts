import { describe, expect, test } from "bun:test";
import { findPricingMatch, loadCatalog, loadSourceRows, render } from "./gen-router-pricing.ts";

describe("Router pricing catalog", () => {
  const catalog = loadCatalog();
  const page = render();

  test("covers every generated Router model ID", () => {
    expect(catalog.length).toBe(212);
    expect(page).toContain("GPT 5");
    expect(page).toContain("Nano Banana Pro");
    expect(page).toContain("Kling V3");
    expect(page).toContain("freepik/ai-image-upscaler-precision-v2");
  });

  test("renders the full pricing table", () => {
    expect(page).toContain("## Pricing by model");
    expect(page).toContain("Input credits / 1M: 263.75");
    expect(page).toContain("output (image)");
    expect(page).toContain("7600");
    expect(page).toContain("212 Router model rows");
    expect(page).not.toContain("<Card");
  });

  test("matches complete model names instead of prefixes", () => {
    const source = Bun.file("tutorials/partner-nodes/pricing.mdx");
    return source.text().then((text) => {
      const body = text.replace(/^---[\s\S]*?---\s*/, "");
      const rows = loadSourceRows(body);
      expect(findPricingMatch("openai/gpt-5", rows)?.rows[0].line).toContain("gpt-5      ");
      expect(findPricingMatch("openai/gpt-5", rows)?.rows[0].line).not.toContain("gpt-5.6");
      expect(findPricingMatch("openai/gpt-5.99", rows)).toBeUndefined();
      expect(findPricingMatch("bfl/flux-kontext-pro", rows)?.rows[0].line).toContain("Kontext [pro]");
    });
  });

  test("has valid frontmatter", () => {
    const description = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
