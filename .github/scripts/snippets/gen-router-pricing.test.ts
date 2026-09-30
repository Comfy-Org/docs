import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCatalog, loadMetronomeData, render, validateCreditConversion } from "./gen-router-pricing.ts";

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
    expect(page).toContain("Credit amounts use 211 credits per USD in this snapshot.");
    expect(page).toContain("An omitted rate or billing component does not mean it is free.");
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
    expect(page).toContain("USD price: $36.0; Credits: 7596.0; Unit: 1M tokens; Conditions: Output image tokens");
    expect(page).toContain("| `openai/gpt-image-2` | fal | Rate shape: Usage-based");
    expect(page).toContain("USD price: $0.06; Credits: 12.66; Unit: request; Conditions: Text to image");
    expect(page).toContain("quality=high; output size=4K");
    expect(page).toContain("USD price: $0.05; Credits: 10.55; Unit: second; Conditions: 480p");
    expect(page).toContain("USD price: $0.1; Credits: 21.1; Unit: second; Conditions: 720p");
    expect(page).toContain("USD price: $0.2; Credits: 42.2; Unit: second; Conditions: 1080p");
    expect(page).not.toContain("USD price: $1; Credits: 211; Unit: generation");
    expect(page).toContain("bria/video-edit-erase");
    expect(page).toContain("USD price: $0.06435; Credits: 13.5778; Unit: second; Conditions: Input duration, capped at 5 seconds per request");
    expect(page).toContain("Rate shape: Usage-based; Unit: varies with image dimensions and scale");
    expect(page).toContain("USD price: $0.29; Credits: 61.19; Unit: generation");
    expect(page).toContain("Rate applies to the usage-credit quantity reported for the request.");
    expect(page).toContain("USD price: $0.6; Credits: 126.6; Unit: completed operation");
    expect(page).toContain("`ideogram/p-image-ideogram` | Ideogram | Not published | Not published");
    expect(page).toContain("USD price: $0.0572; Credits: 12.0692; Unit: usage credit");
    expect(page).toContain("USD price: $0.1859; Credits: 39.2249; Unit: second; Conditions: Text to video; resolution=1080x1920");
    expect(page).toContain("quality=DEFAULT");
    expect(page).toContain("Unit: input image; Conditions: Input image; input_tier=qima_input_1k");
    expect(page).toContain("Unit: output image; Conditions: Output image; output_tier=qima_output_1k");
    expect(page).toContain("Unit: video credit; Conditions: Rate applies to provider-reported video-credit quantity.");
    expect(page).toContain("USD price: $0.03; Credits: 6.33; Unit: image; Conditions: Generated image");
    expect(page).toContain("USD price: $0.0715; Credits: 15.0865; Unit: 5-second billing increment");
    expect(page).toContain("Unit: additional reference image; Conditions: Reference images after the first five");
    expect(page).not.toContain("Minimax H3 | `minimax/minimax-h3` | MiniMax | USD price: $0.0572; Credits: 12.0692; Unit: image; Conditions: Image generation");
    expect(page).not.toContain("USD price: $1.0; Credits: 211.0; Unit: request");
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

  test("rejects malformed credit amounts instead of comparing against NaN", () => {
    const snapshot = loadMetronomeData();
    const rate = snapshot.rates.find((candidate) => candidate.price_usd !== undefined && candidate.credits !== undefined);
    if (!rate) throw new Error("expected at least one numeric Metronome rate");
    expect(() => validateCreditConversion({ ...rate, credits: "12.66x" }, snapshot.credits_per_usd)).toThrow(
      "credit conversion does not match USD amount",
    );
  });

  test("has valid frontmatter", () => {
    const description = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
