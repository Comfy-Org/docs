import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCatalog, render } from "./gen-router-pricing.ts";

describe("Router pricing catalog", () => {
  const catalog = loadCatalog();
  const page = render();

  test("covers every generated Router model ID", () => {
    for (const model of catalog) expect(page).toContain(`\`${model.id}\``);
    expect(page).toContain("GPT 5");
    expect(page).toContain("Nano Banana Pro");
    expect(page).toContain("Kling V3");
    expect(page).toContain("freepik/ai-image-upscaler-precision-v2");
    expect(page).toContain("## OpenAI");
    expect(page).toContain("## Google");
    expect(page).not.toContain("Partner Node");
    expect(catalog.find((model) => model.id === "openai/gpt-image-2")?.providers).toEqual([
      "OpenAI",
      "fal",
      "Runware",
      "WaveSpeed",
    ]);
  });

  test("renders the full pricing table", () => {
    expect(page).toContain("## OpenAI");
    expect(page).toContain("| Model | Router model ID | Serving provider | Rate | Pricing source |");
    expect(page).toContain("| `openai/gpt-image-2` | OpenAI | USD price: $36.0; Credits: 7596.0; Unit: 1M tokens; Conditions: Output image tokens");
    expect(page).toContain("| `openai/gpt-image-2` | fal | Rate shape: Usage-based");
    expect(page).toContain("| `openai/gpt-image-2` | WaveSpeed | USD price: $0.06; Credits: 12.66; Unit: generation");
    expect(page).toContain("USD price: $0.05; Credits: 10.55; Unit: second; Conditions: 480p");
    expect(page).toContain("USD price: $0.1; Credits: 21.1; Unit: second; Conditions: 720p");
    expect(page).toContain("USD price: $0.2; Credits: 42.2; Unit: second; Conditions: 1080p");
    expect(page).not.toContain("USD price: $1; Credits: 211; Unit: generation");
    expect(page).not.toContain("Router model rows");
    expect(page).not.toContain("<Card");
    for (const internalLabel of ["Fal Usage", "Runware Usage", "BFL Cost", "OpenRouter Cost", "Freepik Image Cost"]) {
      expect(page).not.toContain(internalLabel);
    }
  });

  test("keeps the public Metronome snapshot free of source product names", () => {
    const snapshot = JSON.parse(readFileSync("router-pricing/metronome-rates.json", "utf8"));
    const publicData = JSON.stringify(snapshot);
    expect(snapshot.rates.length).toBeGreaterThan(300);
    expect(new Set(snapshot.rates.map((rate: { model_id: string }) => rate.model_id)).size).toBeGreaterThan(80);
    for (const privateOrCommercialTerm of [
      "product_name",
      "Fal Usage",
      "Runware Usage",
      "BFL Cost",
      "OpenRouter Cost",
      "Freepik Image Cost",
      "margin",
      "markup",
      "pass-through",
      "vendor-cost",
    ]) {
      expect(publicData).not.toContain(privateOrCommercialTerm);
      expect(page).not.toContain(privateOrCommercialTerm);
    }
  });

  test("has valid frontmatter", () => {
    const description = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
