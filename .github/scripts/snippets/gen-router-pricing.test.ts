import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { findPricingMatch, loadCatalog, loadSourceRows, render } from "./gen-router-pricing.ts";

describe("Router pricing catalog", () => {
  const catalog = loadCatalog();
  const page = render();

  test("covers every generated Router model ID", () => {
    const pricingModelIds = JSON.parse(readFileSync("router-pricing/prices.json", "utf8"))
      .models.map((model: { id: string }) => model.id)
      .sort();
    expect(pricingModelIds).toEqual(catalog.map((model) => model.id).sort());
    expect(page).toContain("GPT 5");
    expect(page).toContain("Nano Banana Pro");
    expect(page).toContain("Kling V3");
    expect(page).toContain("freepik/ai-image-upscaler-precision-v2");
    expect(page).toContain("## OpenAI");
    expect(page).toContain("## Google");
  });

  test("renders the full pricing table", () => {
    expect(page).toContain("## OpenAI");
    expect(page).toContain("Input credits / 1M: 263.75");
    expect(page).toContain("output (image)");
    expect(page).toContain("| Model | Router model ID | Serving provider | Rate | Pricing source |");
    expect(page).toContain("| `openai/gpt-image-2` | OpenAI | Rate shape: Usage-based");
    expect(page).toContain("| `openai/gpt-image-2` | WaveSpeed | USD price: $0.06; Credits: 12.66; Unit: generation");
    expect(page).toContain("USD price: $0.05; Credits: 10.55; Unit: second; Conditions: 480p");
    expect(page).not.toContain("USD price: $1; Credits: 211");
    expect(page).not.toContain("Router model rows");
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
      expect(findPricingMatch("openai/o1", rows)?.rows[0].line).toContain("o1");
      expect(findPricingMatch("openai/o3", rows)?.rows[0].line).toContain("o3");
      expect(findPricingMatch("bfl/flux-kontext-pro", rows)?.rows[0].line).toContain("Kontext [pro]");
      expect(findPricingMatch("bfl/flux-pro-1.1", rows)).toBeUndefined();
      expect(findPricingMatch("bfl/flux-pro-1.1-ultra", rows)?.rows[0].line).toContain("Ultra Image");
    });
  });

  test("has valid frontmatter", () => {
    const description = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
