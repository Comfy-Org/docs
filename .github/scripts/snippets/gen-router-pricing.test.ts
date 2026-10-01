import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compactOptions, groupImageTiers, groupResolutionTiers, groupRates, loadCatalog, loadMetronomeData, render, validateCreditConversion } from "./gen-router-pricing.ts";
import { formatAmount, formatOption, formatUnit } from "./router-pricing-display.ts";

const catalog = loadCatalog();
const snapshot = loadMetronomeData();
const page = render();

function pricingTables(content: string) {
  const tables: { provider: string; headers: string[]; rows: string[][] }[] = [];
  let provider = "";
  let table: (typeof tables)[number] | undefined;
  for (const line of content.split("\n")) {
    const accordion = line.match(/<Accordion title="([^"]+)"/);
    if (accordion) provider = accordion[1];
    if (!line.startsWith("|")) { table = undefined; continue; }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Name") {
      table = { provider, headers: cells, rows: [] };
      tables.push(table);
    } else if (table && !cells.every((cell) => /^:?-+:?$/.test(cell))) {
      table.rows.push(cells);
    }
  }
  return tables;
}

const tables = pricingTables(page);
const priceAmounts = (cell: string) => [...cell.matchAll(/(?:^|<br\s*\/?>)(?:[^<>:]+:\s*)?(\d+(?:\.\d+)?)(?:\s*\/|(?=<br\s*\/?>)|$)/g)].map((match) => match[1]);

describe("public Router pricing", () => {
  test("shows every model/provider route under its provider and model-type section", () => {
    const routes = catalog.flatMap((model) => model.providers.map((provider) => ({ model, provider })));
    expect(catalog).toHaveLength(218);
    expect(routes).toHaveLength(244);
    for (const { model, provider } of routes) {
      expect(page).toContain(`](/${model.page})`);
      expect(page).toContain(`](/${model.page}) | \`${model.id}\` |`);
      expect(page).toContain(`<Accordion title="${provider}"`);
    }
    const unavailable = page.split("\n").filter((line) => line.includes("| Not published |"));
    expect(unavailable).toHaveLength(15);
    for (const name of ["Images", "Video", "Text & multimodal", "Audio", "3D"]) expect(page).toContain(`<Tab title="${name}">`);
  });

  test("uses model IDs and credit prices without USD or internal billing metadata", () => {
    expect(page).toContain("| Name | Model ID | Option | Credits |");
    expect(page).toContain("Prices are in Comfy credits.");
    for (const clutter of ["Metronome", "Pricing source", "Serving provider", "Router model ID", "USD price:", "Credits:", "Conditions:", "Effective: From", "effective_from", "source_sha256"]) {
      expect(page).not.toContain(clutter);
    }
    expect(page).not.toContain("Extra conditions");
    expect(page).not.toContain("USD");
    expect(page).not.toContain("$");
    expect(page).not.toContain("How billing works");
    expect(page).toContain("Unpublished prices do not mean free usage.");
  });

  test("preserves every route's credit amounts and shows a unit in the cell or token header", () => {
    expect(snapshot.rates).toHaveLength(610);
    expect(snapshot.rates.filter((rate) => rate.kind !== "usage")).toHaveLength(570);
    for (const rate of snapshot.rates.filter((candidate) => candidate.kind !== "usage")) {
      const matchingPrices = tables.filter((table) => table.provider.toLowerCase() === rate.serving_provider.toLowerCase())
        .flatMap((table) => table.rows.filter((row) => row[1] === `\`${rate.model_id}\``)
          .flatMap((row) => table.headers.flatMap((header, index) => /credits/i.test(header) ? [{ header, cell: row[index] }] : [])));
      const amount = formatAmount(rate.credits!);
      const unit = formatUnit(rate.unit, "en");
      expect(matchingPrices.some(({ header, cell }) => priceAmounts(cell).includes(amount)
        && (cell.includes(` / ${unit}`) || header.includes(` / ${unit}`)))).toBe(true);
    }
    expect(page).toContain("| 15.0865 / second |");
    expect(page).toContain("| 15.0865 / generation |");
    expect(page).toContain("| 7.5432 / generation |");
    expect(page).toContain("| 3.0173 / generation |");
    expect(page).toContain("| 16.88 / image |");
    expect(page).toContain("| 31.65 / image |");
    expect(page).toContain("0.3017 / Recraft credit");
    expect(page).toContain("| 211 / request |");
    expect(page).toContain("| 84.4844 / second |");
    expect(page).toContain("| [GPT Image 1](/development/comfy-router/models/openai/gpt-image-1/code) | `openai/gpt-image-1` | Image output | 8440 / 1M tokens |");
    expect(page).toContain("| [GPT Image 2.5 Flare](/development/comfy-router/models/openai/gpt-image-2-5-flare/code) | `openai/gpt-image-2.5-flare` | Text output | 3017.3 / 1M tokens |");
    expect(page).toContain("| 2.954 / 1K video tokens |");
    expect(page).toContain("| 13.5778 / second |");
    expect(page).toContain(formatOption("Input duration, capped at 5 seconds per request", "en"));
    expect(page).toContain("| Usage-based<br />request usage |");
  });

  test("LLMs have one model row with separate input and output credit columns", () => {
    expect(page).toContain("| Name | Model ID | Input credits / 1M tokens | Cached input credits / 1M tokens | Output credits / 1M tokens |");
    expect(page).toContain("| Name | Model ID | Input credits / 1M tokens | Output credits / 1M tokens |");
    expect(page.match(/`anthropic\/claude-fable-5`/g)).toHaveLength(1);
    expect(page.match(/`openai\/gpt-5\.6-luna`/g)).toHaveLength(1);
    expect(page).toContain("| 3017.3 | 301.73<br />Cache creation 1h: 6034.6<br />Cache creation 5m: 3771.625 | 15086.5 |");
    expect(page).not.toContain("Write 5m");
    expect(page).not.toContain("Audio input:");
    expect(page).not.toContain("Image input / Text input / Video input:");
    expect(page).not.toContain("Text output / Reasoning:");
    for (const table of tables.filter((table) => table.headers.some((header) => header.startsWith("Input credits")))) {
      for (const row of table.rows) {
        for (const cell of row.slice(2)) expect(cell).not.toContain(" / 1M tokens");
      }
    }
    expect(page).toContain("Cached input credits");
  });

  test("image tiers coalesce by quality with exact size prices and defaults preserved", () => {
    const rates = snapshot.rates.filter((rate) => rate.model_id === "openai/gpt-image-2.5-flare" && rate.serving_provider === "WaveSpeed");
    const grouped = groupImageTiers(rates);
    expect(grouped.groups).toHaveLength(10);
    expect(grouped.remaining).toHaveLength(2);
    expect(grouped.remaining.length + grouped.groups.flatMap((group) => [...group.tiers.values()]).length).toBe(rates.length);
    expect(page).toContain("| Name | Model ID | Option | 1K Credits | 2K Credits | 4K Credits |");
    expect(page).toContain("| Image edit · High | 48.53 / request | 86.51 / request | 154.03 / request |");
    const conflicted = groupImageTiers([...rates, rates[1]]);
    expect(conflicted.groups).toHaveLength(0);
    expect(conflicted.remaining).toHaveLength(rates.length + 1);
  });

  test("resolution tiers use columns while preserving audio and other pricing options", () => {
    const wan = snapshot.rates.filter((rate) => rate.model_id === "wan/wan3.0-video" && rate.serving_provider === "Wan");
    expect(groupResolutionTiers(wan).groups).toHaveLength(1);
    expect(page).toContain("| Name | Model ID | 480p Credits | 720p Credits | 1080p Credits |");
    expect(page).toContain("| `wan/wan3.0-video` | 10.55 / second | 21.1 / second | 42.2 / second |");
    const veo = snapshot.rates.filter((rate) => rate.model_id === "veo/veo-3.1-generate-001");
    expect(groupResolutionTiers(veo).groups).toHaveLength(2);
    expect(page).toContain("No audio");
    expect(page).toContain("With audio");
    const ltx = snapshot.rates.filter((rate) => rate.model_id === "ltx/ltx-2-5-pro");
    const grouped = groupResolutionTiers(ltx);
    expect(grouped.remaining).toHaveLength(0);
    expect(grouped.groups.flatMap((group) => [...group.tiers.values()].flatMap((tier) => tier.sources))).toHaveLength(ltx.length);
    expect(page).not.toContain("1080 × 1920 / 1920 × 1080");
    const minimax = snapshot.rates.filter((rate) => rate.model_id === "minimax/minimax-h3");
    const minimaxGroups = groupResolutionTiers(minimax);
    expect(minimaxGroups.groups).toHaveLength(1);
    expect(page).toContain("| `minimax/minimax-h3` | 27.1557 / second | 39.2249 / second |");
    expect(page).not.toContain("Output video · 2K");
    expect(page).not.toContain("Reference video · 2K");
    expect(page).toContain("Video rates apply to output plus reference-video duration.");
  });

  test("puts model IDs after names and removes entirely empty option columns", () => {
    for (const table of tables) {
      expect(table.headers.slice(0, 2)).toEqual(["Name", "Model ID"]);
      const optionIndex = table.headers.indexOf("Option");
      if (optionIndex >= 0) expect(table.rows.some((row) => row[optionIndex] !== "-")).toBe(true);
      for (const row of table.rows) {
        expect(row).toHaveLength(table.headers.length);
        expect(row[0]).toMatch(/^\[.+\]\(\/development\/comfy-router\/models\//);
        expect(row[1]).toMatch(/^`[^`]+\/[^`]+`$/);
      }
    }
    const klingVideo = tables.filter((table) => table.provider === "Kling" && table.rows.some((row) => row[1] === "`kling/kling-v3`"));
    expect(klingVideo).toHaveLength(1);
    expect(klingVideo[0].headers).not.toContain("Option");
  });

  test("labels variant axes and pivots Pruna and Seedance resolution bands", () => {
    const pruna = tables.find((table) => table.provider === "Pruna")!;
    expect(pruna.headers).toEqual(["Name", "Model ID", "Mode", "720p Credits", "1080p Credits"]);
    expect(pruna.rows.map((row) => row[2])).toEqual(["Standard", "Draft"]);
    expect(pruna.rows.map((row) => row.slice(3))).toEqual([
      ["7.5432 / second", "15.0865 / second"],
      ["4.5259 / second", "9.0519 / second"],
    ]);
    const veo = tables.find((table) => table.provider === "Veo" && table.headers.includes("Audio"))!;
    expect(veo).toBeDefined();
    expect(veo.headers).not.toContain("Option");
    const seedance = tables.find((table) => table.provider === "Higgsfield" && table.rows.some((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`"))!;
    expect(seedance.headers).toContain("480p Credits");
    expect(seedance.headers).toContain("720p Credits");
    expect(seedance.rows.find((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`")!.join(" | ")).toContain("2.954 / 1K video tokens");
  });

  test("orientation grouping keeps all source records and avoids merging unequal prices or date windows", () => {
    const base = snapshot.rates.find((rate) => rate.model_id === "ltx/ltx-2-5-pro")!;
    const portrait = { ...base, conditions: "Text-to-video; resolution=1080x1920" };
    const landscape = { ...base, conditions: "Text-to-video; resolution=1920x1080" };
    const smaller = { ...base, conditions: "Text-to-video; resolution=1280x720" };
    const equal = groupResolutionTiers([portrait, landscape, smaller]);
    expect(equal.remaining).toHaveLength(0);
    expect(equal.groups).toHaveLength(1);
    expect(equal.groups[0].tiers.get("1080p")!.sources).toEqual([portrait, landscape]);
    const conflicting = { ...landscape, credits: "999", price_usd: "999" };
    const conflicts = groupResolutionTiers([portrait, conflicting, smaller]);
    expect(conflicts.groups).toHaveLength(0);
    expect(conflicts.remaining).toEqual([portrait, conflicting, smaller]);
    const later = { ...landscape, effective_from: "2026-10-01" };
    const dated = groupResolutionTiers([portrait, later, smaller]);
    expect(dated.groups).toHaveLength(2);
    expect(dated.groups.flatMap((group) => [...group.tiers.values()].flatMap((tier) => tier.sources))).toHaveLength(3);
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

  test("tier pivots preserve all source records, including quantities and effective windows", () => {
    const preserved = [];
    for (const model of catalog) {
      for (const provider of model.providers) {
        const rates = snapshot.rates.filter((rate) => rate.model_id === model.id && rate.serving_provider.toLowerCase() === provider.toLowerCase());
        const image = model.category === "images" ? groupImageTiers(rates) : { groups: [], remaining: rates };
        const resolution = groupResolutionTiers(image.remaining);
        preserved.push(...image.groups.flatMap((group) => [...group.tiers.values()]),
          ...resolution.groups.flatMap((group) => [...group.tiers.values()].flatMap((tier) => tier.sources)),
          ...resolution.remaining);
      }
    }
    const records = (rates: typeof snapshot.rates) => rates.map((rate) => JSON.stringify(rate)).sort();
    expect(records(preserved)).toEqual(records(snapshot.rates));
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
