import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compactOptions, groupRates, loadCatalog, loadMetronomeData, render, validateCreditConversion } from "./gen-router-pricing.ts";
import { formatAmount, formatOption } from "./router-pricing-display.ts";

const catalog = loadCatalog();
const snapshot = loadMetronomeData();
const page = render();

describe("public Router pricing", () => {
  test("shows every model/provider route under its provider and model-type section", () => {
    const routes = catalog.flatMap((model) => model.providers.map((provider) => ({ model, provider })));
    expect(catalog).toHaveLength(218);
    expect(routes).toHaveLength(244);
    for (const { model, provider } of routes) {
      expect(page).toContain(`](/${model.page})`);
      expect(page).toContain(`<Accordion title="${provider}"`);
    }
    const unavailable = page.split("\n").filter((line) => line.includes("| Not published | - | - |"));
    expect(unavailable).toHaveLength(15);
    for (const name of ["Images", "Video", "Text & multimodal", "Audio", "3D"]) expect(page).toContain(`<Tab title="${name}">`);
  });

  test("uses distinct USD and Credits columns without internal billing metadata", () => {
    expect(page).toContain("| Model | Option | USD | Credits | Billed per |");
    expect(page).toContain("**$1 = 211 Comfy credits.**");
    for (const clutter of ["Metronome", "Pricing source", "Serving provider", "Router model ID", "USD price:", "Credits:", "Conditions:", "Effective: From", "effective_from", "source_sha256"]) {
      expect(page).not.toContain(clutter);
    }
    expect(page).not.toContain("Extra conditions");
    expect(page).not.toContain("How billing works");
    expect(page).toContain("Unpublished prices do not mean free usage.");
  });

  test("preserves every numeric price and credit amount in separate table cells", () => {
    for (const rate of snapshot.rates.filter((candidate) => candidate.kind !== "usage")) {
      expect(page).toContain(`| $${formatAmount(rate.price_usd!)} | ${formatAmount(rate.credits!)} |`);
    }
    expect(page).toContain("| $0.0715 | 15.0865 | second |");
    expect(page).toContain("| $0.014 | 2.954 | 1K video tokens |");
    expect(page).toContain("| $0.06435 | 13.5778 | second |");
    expect(page).toContain("Input video, maximum 5s");
    expect(page).toContain("| Usage-based | - | request usage |");
  });

  test("merges equal options only when amounts, unit, and effective windows match", () => {
    const base = snapshot.rates.find((rate) => rate.kind !== "usage")!;
    const differentWindow = { ...base, effective_from: "2026-01-01" };
    const samePriceOption = { ...base, conditions: "resolution=720p" };
    const groups = groupRates([base, samePriceOption, differentWindow], "en");
    expect(groups).toHaveLength(2);
    expect(groups[0].rates).toEqual([base, samePriceOption]);
    expect(groups[1].rates).toEqual([differentWindow]);
    expect(groupRates([base, { ...base, unit: "per second" }], "en")).toHaveLength(2);
    expect(compactOptions(["Text to image · Low · 1K", "Text to image · Low · 2K", "Text to image · High · 4K"])).toBe(
      "Text to image · Low · 1K / 2K<br />Text to image · High · 4K",
    );
    let preserved = 0;
    for (const model of catalog) {
      for (const provider of model.providers) {
        const rates = snapshot.rates.filter((rate) => rate.model_id === model.id && rate.serving_provider.toLowerCase() === provider.toLowerCase());
        preserved += groupRates(rates, "en").flatMap((group) => group.rates).length;
      }
    }
    expect(preserved).toBe(snapshot.rates.length);
  });

  test("keeps price-changing variants inline and expiry information concise", () => {
    expect(formatOption("resolution=720p; generateAudio=true", "en")).toBe("720p · With audio");
    expect(formatOption("Edit; quality=high; output size=4K", "en")).toBe("Image edit · High · 4K");
    expect(formatOption("Output image; output_tier=qima_output_1k", "en")).toBe("Output image · 1K");
    expect(page).toContain("No audio");
    expect(page).toContain("With audio");
    expect(page).toContain("listed rates end on Oct 1, 2026 (exclusive)");
    expect(page.match(/Oct 1, 2026/g)).toHaveLength(1);
    expect(page).toContain("Prices updated: Sep 30, 2026.");
  });

  test("retains source validation without exposing the private source", () => {
    const raw = JSON.stringify(JSON.parse(readFileSync("router-pricing/metronome-rates.json", "utf8")));
    for (const term of ["product_name", "Fal Usage", "Runware Usage", "BFL Cost", "OpenRouter Cost", "Freepik Image Cost", "margin", "markup", "pass-through", "vendor-cost"]) {
      expect(raw).not.toContain(term);
      expect(page).not.toContain(term);
    }
    const rate = snapshot.rates.find((candidate) => candidate.kind !== "usage")!;
    expect(() => validateCreditConversion({ ...rate, credits: "12.66x" }, snapshot.credits_per_usd)).toThrow("credit conversion does not match USD amount");
    const description = page.match(/^description: "(.+)"$/m)![1];
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
