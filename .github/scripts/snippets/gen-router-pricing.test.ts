import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compactOptions, displayProvider, groupImageTiers, groupResolutionTiers, groupRates, loadCatalog, loadMetronomeData, render, resolveKeyedRates, validateCreditConversion } from "./gen-router-pricing.ts";
import { formatAmount, formatOption, formatUnit } from "./router-pricing-display.ts";

const catalog = loadCatalog();
const snapshot = loadMetronomeData();
const sourcePage = render();
const currencyToggleStart = sourcePage.indexOf("<PricingCurrencyToggle");
const creditsTabsStart = sourcePage.indexOf("<Tabs>", currencyToggleStart);
const usdTabsStart = sourcePage.indexOf("<Tabs>", creditsTabsStart + 1);
const currencyToggleEnd = sourcePage.indexOf("</PricingCurrencyToggle>", usdTabsStart);
const creditsPage = sourcePage.slice(creditsTabsStart, usdTabsStart);
const usdPage = sourcePage.slice(usdTabsStart, currencyToggleEnd);

function pricingTables(content: string) {
  const tables: { provider: string; section: string; headers: string[]; rows: string[][]; displayRows: string[][] }[] = [];
  let provider = "";
  let section = "";
  let table: (typeof tables)[number] | undefined;
  let previousName = "";
  let previousModelId = "";
  for (const line of content.split("\n")) {
    const accordion = line.match(/<Accordion title="([^"]+)"/);
    if (accordion) { provider = accordion[1]; section = ""; }
    if (!line.startsWith("|")) {
      const heading = line.match(/^####\s+(.+)$/);
      if (heading) section = heading[1];
      table = undefined;
      previousName = "";
      previousModelId = "";
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Name") {
      table = { provider, section, headers: cells, rows: [], displayRows: [] };
      tables.push(table);
      previousName = "";
      previousModelId = "";
    } else if (table && !cells.every((cell) => /^:?-+:?$/.test(cell))) {
      table.displayRows.push(cells);
      const effective = [...cells];
      if (effective[0]) previousName = effective[0];
      else effective[0] = previousName;
      if (effective[1]) previousModelId = effective[1];
      else effective[1] = previousModelId;
      table.rows.push(effective);
    }
  }
  return tables;
}

const page = sourcePage;
const tables = pricingTables(creditsPage);
const usdTables = pricingTables(usdPage);
const priceAmounts = (cell: string) => [...cell.replaceAll("&#36;", "$").matchAll(/(?:^|<br\s*\/?>)(?:[^<>:]+:\s*)?\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*\/|(?=<br\s*\/?>)|$)/g)].map((match) => match[1].replaceAll(",", ""));

describe("public Router pricing", () => {
  test("shows every model/provider route under its provider and model-type section", () => {
    const routes = catalog.flatMap((model) => model.providers.map((provider) => ({ model, provider })));
    expect(catalog.length).toBeGreaterThan(0);
    expect(routes.length).toBeGreaterThan(0);
    expect([...new Set(routes.map(({ provider }) => provider))].sort()).toEqual(["Comfy", "Higgsfield", "Runware", "WaveSpeed", "fal"].sort());
    expect([...new Set(tables.map((table) => table.provider))].sort()).toEqual(["Comfy", "Higgsfield", "Runware", "WaveSpeed", "fal"].sort());
    for (const { model, provider } of routes) {
      expect(page).toContain(`](/${model.page})`);
      expect(page).toContain(`](/${model.page}) | \`${model.id}\` |`);
      expect(page).toContain(`<Accordion title="${provider}"`);
      expect(tables.some((table) => table.provider === provider && table.rows.some((row) => row[1] === `\`${model.id}\``))).toBe(true);
    }
    const unavailable = tables.flatMap((table) => table.rows.filter((row) => row.includes("Not published")));
    const unpricedRoutes = routes.filter(({ model, provider }) => !snapshot.rates.some((rate) =>
      rate.model_id === model.id && displayProvider(model.id, model.providers, rate.serving_provider) === provider));
    expect(unavailable).toHaveLength(unpricedRoutes.length);
    for (const name of ["Images", "Video", "Text & multimodal", "Audio", "3D"]) expect(page).toContain(`<Tab title="${name}">`);
  });

  test("separates model owners from serving-provider groups", () => {
    const falSeedanceCard = snapshot.supplemental_sources!.find((source) => source.source.endsWith("services/comfy-api/scripts/metronome/fal/rates/rates.json"))!;
    expect(falSeedanceCard.source_sha256).toBe("4ff71e55c8ee4432f6bb3312d2e01216b1be0c9691d1444017d6eddaa5d73e5c");
    expect(falSeedanceCard.rates).toHaveLength(7);
    expect(falSeedanceCard.rates.every((rate) => rate.entitled === true && rate.effective_from === "2026-09-22")).toBe(true);
    const providersFor = (id: string) => catalog.find((model) => model.id === id)!.providers;
    expect(providersFor("fal/patina")).toEqual(["fal"]);
    expect(providersFor("wavespeed/seedvr2")).toEqual(["WaveSpeed"]);
    expect(providersFor("openai/gpt-image-2")).toEqual(["Comfy", "fal", "Runware", "WaveSpeed"]);
    expect(providersFor("kling/kling-v3")).toEqual(["Comfy", "Higgsfield"]);
    expect(page).not.toContain("Model ID prefixes identify model owners.");
    expect(page).not.toContain("[See provider coverage]");
    expect(page).not.toContain('<Accordion title="OpenAI"');
    expect(page).not.toContain('<Accordion title="Kling"');
    expect(page).not.toContain('<Accordion title="Black Forest Labs"');
    expect(tables.some((table) => table.provider === "fal" && table.rows.some((row) => row[1] === "`fal/patina`"))).toBe(true);
    expect(tables.some((table) => table.provider === "WaveSpeed" && table.rows.some((row) => row[1] === "`wavespeed/seedvr2`"))).toBe(true);
    const falSeedanceRows = tables.filter((table) => table.provider === "fal")
      .flatMap((table) => table.rows)
      .filter((row) => ["`byteplus/dreamina-seedance-2-0-260128`", "`byteplus/dreamina-seedance-2-5-260628`"].includes(row[1]));
    expect(falSeedanceRows).toHaveLength(2);
    const fal20 = falSeedanceRows.find((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`")!;
    const fal25 = falSeedanceRows.find((row) => row[1] === "`byteplus/dreamina-seedance-2-5-260628`")!;
    expect(fal20.slice(2)).toEqual([
      "2.954", "2.954", "2.954", "1.688",
    ]);
    expect(fal25.slice(2)).toEqual([
      "4.5154", "4.5154", "4.9374", "-",
    ]);
    expect(page).not.toContain(" / 1K video tokens");

    for (const [id, expected] of [
      ["bria/video-edit-green-screen", "10.55 / s"],
      ["bria/video-edit-remove-background", "10.55 / s"],
      ["bria/video-edit-replace-background", "10.55 / s"],
    ]) {
      const row = tables.find((table) => table.provider === "Comfy" && table.rows.some((cells) => cells[1] === `\`${id}\``))!
        .rows.find((cells) => cells[1] === `\`${id}\``)!;
      expect(row).toContain(expected);
    }

    const moonvalley = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("5s Credits / request")
      && table.rows.some((row) => row[1] === "`moonvalley/image-to-video`"))!;
    expect(moonvalley.headers).toEqual(["Name", "Model ID", "5s Credits / request", "10s Credits / request"]);
    expect(moonvalley.rows).toEqual([
      ["[Image To Video](/development/comfy-router/models/moonvalley/image-to-video/code)", "`moonvalley/image-to-video`", "316.5", "633"],
      ["[Text To Video](/development/comfy-router/models/moonvalley/text-to-video/code)", "`moonvalley/text-to-video`", "316.5", "633"],
      ["[Video To Video](/development/comfy-router/models/moonvalley/video-to-video/code)", "`moonvalley/video-to-video`", "474.75", "844"],
    ]);
  });

  test("resolves keyed prices per model before a provider-wide usage rail", () => {
    const usage = snapshot.rates.find((rate) => rate.kind === "usage")!;
    const keyed = { ...snapshot.rates.find((rate) => rate.kind !== "usage")!, model_id: usage.model_id, serving_provider: usage.serving_provider };
    const otherModel = { ...usage, model_id: `${usage.model_id}-other` };
    const otherProvider = { ...usage, serving_provider: `${usage.serving_provider} alternate` };
    expect(resolveKeyedRates([usage, keyed, otherModel, otherProvider])).toEqual([keyed, otherModel, otherProvider]);

    const bflSource = snapshot.supplemental_sources!.find((source) => source.source.endsWith("services/comfy-api/scripts/metronome/bfl/rates/rates.json"))!;
    expect(bflSource.rates.every((rate) => rate.entitled === true)).toBe(true);
    const cell = (id: string) => tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === `\`${id}\``))!
      .rows.find((row) => row[1] === `\`${id}\``)!.at(-1);
    for (const [id, credits] of [
      ["bfl/flux-kontext-pro", "8.44"],
      ["bfl/flux-kontext-max", "16.88"],
      ["bfl/flux-pro-1.1", "8.44"],
      ["bfl/flux-pro-1.1-ultra", "12.66"],
      ["bfl/flux-pro-1.0-expand", "10.55"],
      ["bfl/flux-pro-1.0-fill", "10.55"],
      ["freepik/ai-skin-enhancer-creative", "61.19"],
    ]) {
      expect(cell(id)).toBe(credits);
    }
    for (const id of [
      "bfl/flux-3-image", "bfl/flux-3-video", "bfl/flux-2-max", "bfl/flux-2-pro", "bfl/erase-v1",
      "bfl/video-edit-v1", "bfl/video-upscale-v1", "bfl/vto-v1", "freepik/ai-image-upscaler-precision-v2",
    ]) {
      expect(cell(id)).toStartWith("Usage-based");
    }
  });

  test("discloses the credit conversion and keeps billing metadata private", () => {
    expect(page).toContain("| Name | Model ID | Option | Credits |");
    expect(sourcePage).toContain("\n\n211 credits = $1 USD.\n\n<PricingCurrencyToggle");
    expect(sourcePage).toContain('import { PricingCurrencyToggle } from "../../snippets/router-pricing-currency.jsx";');
    expect(sourcePage).toContain('<PricingCurrencyToggle creditsLabel="Credits" usdLabel="USD">');
    expect(sourcePage).not.toContain("Use the currency switch");
    expect(sourcePage).not.toContain('label="Currency"');
    const toggle = readFileSync("snippets/router-pricing-currency.jsx", "utf8");
    expect(toggle).toContain('role="switch"');
    expect(toggle).toContain("setShowUsd");
    expect(toggle).not.toContain("{label}");
    expect(usdTables.some((table) => table.headers.includes("Input USD / 1M tokens"))).toBe(true);
    expect(usdPage).toContain("Text: &#36;7.15");
    for (const clutter of ["Metronome", "Pricing source", "Serving provider", "Router model ID", "USD price:", "Credits:", "Conditions:", "Effective: From", "effective_from", "source_sha256"]) {
      expect(page).not.toContain(clutter);
    }
    expect(page).not.toContain("Extra conditions");
    expect(page).not.toContain("How billing works");
    expect(page).toContain("Unpublished prices do not mean free usage.");
  });

  test("keeps provider-reported usage meters distinct from GPU-second pricing", () => {
    const comfyUsageRows = tables.filter((table) => table.provider === "Comfy" && table.section === "Usage-based rates")
      .flatMap((table) => table.rows);
    expect(comfyUsageRows.length).toBeGreaterThan(0);
    expect(comfyUsageRows.every((row) => row.at(-1)?.startsWith("Usage-based"))).toBe(true);
    expect(comfyUsageRows.some((row) => row.at(-1)?.includes("GPU-second"))).toBe(false);
    expect(creditsPage).not.toContain("Comfy usage-based rates are billed per GPU-second");
    expect(snapshot.rates.filter((rate) => rate.kind === "usage")
      .every((rate) => rate.serving_provider !== "Comfy")).toBe(true);
  });

  test("preserves every route's credit amounts and shows a unit in the cell or token header", () => {
    expect(snapshot.credits_per_usd).toBe(211);
    expect(snapshot.rates).toHaveLength(616);
    expect(snapshot.rates.filter((rate) => rate.kind !== "usage")).toHaveLength(585);
    for (const rate of snapshot.rates.filter((candidate) => candidate.kind !== "usage")) {
      const model = catalog.find((candidate) => candidate.id === rate.model_id)!;
      const provider = displayProvider(model.id, model.providers, rate.serving_provider);
      const matchingPrices = tables.filter((table) => table.provider.toLowerCase() === provider.toLowerCase())
        .flatMap((table) => table.rows.filter((row) => row[1] === `\`${rate.model_id}\``)
        .flatMap((row) => table.headers.flatMap((header, index) => /credits/i.test(header) ? [{ header, cell: row[index], section: table.section }] : [])));
      const matchingUsdPrices = usdTables.filter((table) => table.provider.toLowerCase() === provider.toLowerCase())
        .flatMap((table) => table.rows.filter((row) => row[1] === `\`${rate.model_id}\``)
        .flatMap((row) => table.headers.flatMap((header, index) => /usd/i.test(header) ? [row[index]] : [])));
      const amount = formatAmount(rate.credits!);
      const usdAmount = new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8,
      }).format(Number(rate.price_usd)).replace(/[,$]/g, "");
      const imageGeneration = model.category === "images" && ["per request", "per image", "per output image"].includes(rate.unit);
      const unit = imageGeneration ? "generation"
        : rate.unit === "per second" ? "s" : formatUnit(rate.unit, "en");
      expect(matchingUsdPrices.some((cell) => priceAmounts(cell).includes(usdAmount))).toBe(true);
      expect(matchingPrices.some(({ header, cell, section }) => priceAmounts(cell).includes(amount)
        && (cell.includes(` / ${unit}`) || header.includes(` / ${unit}`) || section.toLowerCase().includes(`credits / ${unit}`)
          || (rate.model_id === "beeble/switchx" && page.includes("Images are billed per output image. Videos are billed per 30 output frames, rounded up."))
          || (unit === "1K video tokens" && section.toLowerCase().startsWith("per 1k video tokens"))))).toBe(true);
    }
    expect(page).toContain("| 15.0865 / s |");
    expect(page).toContain("Credits / generation");
    expect(page).toContain("| 15.0865 |");
    expect(page).toContain("| 7.5432 |");
    expect(page).toContain("| 3.0173 |");
    expect(page).not.toContain("Credits / image");
    expect(page).toContain("| 16.88 |");
    expect(page).toContain("| 31.65 |");
    expect(page).toContain("0.3017 / Recraft credit");
    expect(page).toContain("12.0692 / Meshy credit");
    expect(page).toContain("29.54 / Kling credit");
    expect(page).toContain("Credits / request");
    expect(page).toContain("| 84.4844 / s |");
    const wanPricing = tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === "`wan/wan3.0-video`"));
    expect(wanPricing?.rows.find((row) => row[1] === "`wan/wan3.0-video`")).toContain("42.2 / s");
    expect(page).toContain("| 2.954 |");
    expect(page).toContain("| 13.5778 / s |");
    expect(page).toContain("#### Per 5 s by resolution");
    expect(page).toContain("12.66 / 5 s");
    expect(page).not.toContain("/ 5 seconds");
    expect(page).not.toContain(formatOption("Input duration, capped at 5 seconds per request", "en"));
    expect(page).toContain("| Usage-based<br />request usage |");
  });

  test("token-priced models have one row with cached, input, and output columns", () => {
    expect(page).toContain("| Name | Model ID | Cached input credits / 1M tokens | Input credits / 1M tokens | Output credits / 1M tokens |");
    const creditsPanel = creditsPage;
    expect(creditsPanel.match(/`anthropic\/claude-fable-5`/g)).toHaveLength(1);
    expect(creditsPanel.match(/`openai\/gpt-5\.6-luna`/g)).toHaveLength(1);
    expect(creditsPanel).toContain("| Read: 301.73<br />Write (1h): 6034.6<br />Write (5m): 3771.625 | Text: 3017.3 | Text: 15086.5 |");
    expect(creditsPanel).toContain("| Read: 60.346<br />Write: 754.325 | Text: 603.46 | Text: 3017.3 |");
    const gpt4o = tables.find((table) => table.headers.includes("Cached input credits / 1M tokens")
      && table.rows.some((row) => row[1] === "`openai/gpt-4o`"))!;
    expect(gpt4o.rows.find((row) => row[1] === "`openai/gpt-4o`")?.[2]).toBe("263.75");
    expect(page).not.toContain("Cache creation");
    expect(page).not.toContain("Write 5m");
    expect(page).not.toContain("Audio input:");
    expect(page).not.toContain("Image input / Text input / Video input:");
    expect(page).not.toContain("Text output / Reasoning:");
    expect(creditsPanel).toContain("Reasoning: 2262.975");
    expect(creditsPanel).not.toContain("Text / Reasoning: 2262.975");
    for (const table of tables.filter((table) => table.headers.some((header) => header.startsWith("Input credits")))) {
      for (const row of table.rows) {
        for (const cell of row.slice(2)) expect(cell).not.toContain(" / 1M tokens");
      }
    }
    expect(creditsPanel).toContain("Cached input credits");
    const geminiImage = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Input credits / 1M tokens")
      && table.rows.some((row) => row[1] === "`vertexai/gemini-2.5-flash-image`"))!;
    const geminiRow = geminiImage.rows.find((row) => row[1] === "`vertexai/gemini-2.5-flash-image`")!;
    expect(geminiRow).toHaveLength(4);
    expect(geminiRow[2]).toContain("Audio: 211");
    expect(geminiRow[2]).toContain("Image / Text / Video: 63.3");
    expect(geminiRow[3]).toContain("Image: 6330");
    expect(geminiRow[3]).toContain("Text: 527.5");
    const gptImage = geminiImage.rows.find((row) => row[1] === "`openai/gpt-image-1`")!;
    expect(gptImage).toHaveLength(4);
    expect(gptImage[2]).toBe("Text: 1055<br />Image: 2110");
    expect(gptImage[3]).toBe("Image: 8440");
  });

  test("orders LLM model versions numerically newest first", () => {
    const textTokens = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Input credits / 1M tokens")
      && table.rows.some((row) => row[1] === "`anthropic/claude-fable-5-1`"))!;
    const indexOf = (modelId: string) => textTokens.rows.findIndex((row) => row[1] === `\`${modelId}\``);
    expect(indexOf("anthropic/claude-fable-5-1")).toBeLessThan(indexOf("anthropic/claude-fable-5"));
    expect(indexOf("anthropic/claude-opus-5-5")).toBeLessThan(indexOf("anthropic/claude-opus-5"));
    expect(indexOf("anthropic/claude-sonnet-5-5")).toBeLessThan(indexOf("anthropic/claude-sonnet-5"));
    expect(indexOf("openai/gpt-5-6-luna")).toBeLessThan(indexOf("openai/gpt-5.5"));
    const imageTokens = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Input credits / 1M tokens")
      && table.rows.some((row) => row[1] === "`openai/gpt-image-1.5`"))!;
    const imageIndex = (modelId: string) => imageTokens.rows.findIndex((row) => row[1] === `\`${modelId}\``);
    expect(imageIndex("openai/gpt-image-1.5")).toBeLessThan(imageIndex("openai/gpt-image-1"));
  });

  test("collapses request-priced image operations into columns", () => {
    const operationTable = tables.find((table) => table.provider === "WaveSpeed"
      && table.headers.some((header) => header.startsWith("Text to image Credits"))
      && table.rows.some((row) => row[1] === "`openai/gpt-image-2`") )!;
    expect(operationTable.headers).toEqual([
      "Name", "Model ID", "Text to image Credits / generation", "Image edit Credits / generation", "Image edit · 1K / 2K Credits / generation", "Image edit · 4K Credits / generation",
    ]);
    const rowFor = (modelId: string) => operationTable.rows.find((row) => row[1] === `\`${modelId}\``)!;
    expect(rowFor("openai/gpt-image-2").slice(2)).toEqual(["12.66", "14.77", "-", "-"]);
    expect(rowFor("openai/gpt-image-2.5-flare").slice(2)).toEqual(["5.064", "8.229", "-", "-"]);
    expect(rowFor("openai/gpt-image-2.5-sunburst").slice(2)).toEqual(["5.064", "8.229", "-", "-"]);
    expect(rowFor("vertexai/gemini-3.1-flash-image").slice(2)).toEqual(["14.77", "14.77", "-", "-"]);
    expect(rowFor("vertexai/gemini-3-pro-image").slice(2)).toEqual(["29.54", "-", "29.54", "50.64"]);
  });

  test("image tiers coalesce by quality with exact size prices and defaults preserved", () => {
    const rates = snapshot.rates.filter((rate) => rate.model_id === "openai/gpt-image-2.5-flare" && rate.serving_provider === "WaveSpeed");
    const grouped = groupImageTiers(rates);
    expect(grouped.groups).toHaveLength(10);
    expect(grouped.remaining).toHaveLength(2);
    expect(grouped.remaining.length + grouped.groups.flatMap((group) => [...group.tiers.values()]).length).toBe(rates.length);
    expect(page).toContain("#### Image quality and resolution");
    expect(page).not.toContain("#### Image quality and size");
    expect(page).toContain("| Name | Model ID | Operation | Quality | 1K Credits / generation | 2K Credits / generation | 4K Credits / generation |");
    const qualityTable = tables.find((table) => table.provider === "WaveSpeed"
      && table.headers.includes("Operation")
      && table.rows.some((row) => row[1] === "`openai/gpt-image-2`"))!;
    const image2Rows = qualityTable.displayRows.filter((row, index) => qualityTable.rows[index][1] === "`openai/gpt-image-2`");
    expect(image2Rows).toHaveLength(6);
    expect(image2Rows.filter((row) => row[0] !== "")).toHaveLength(1);
    expect(image2Rows.filter((row) => row[1] !== "")).toHaveLength(1);
    expect(image2Rows.filter((row) => row[2] !== "").map((row) => row[2])).toEqual(["Text to image", "Image edit"]);
    expect(image2Rows.map((row) => row[3])).toEqual(["Low", "Medium", "High", "Low", "Medium", "High"]);
    const conflicted = groupImageTiers([...rates, rates[1]]);
    expect(conflicted.groups).toHaveLength(0);
    expect(conflicted.remaining).toHaveLength(rates.length + 1);
  });

  test("resolution tiers use columns while preserving audio and other pricing options", () => {
    const wan = snapshot.rates.filter((rate) => rate.model_id === "wan/wan3.0-video" && rate.serving_provider === "Wan");
    expect(groupResolutionTiers(wan).groups).toHaveLength(1);
    expect(page).toContain("| Name | Model ID | 480p Credits | 720p Credits | 1080p Credits |");
    expect(page).toContain("| `wan/wan3.0-video` | 10.55 / s | 21.1 / s | 42.2 / s |");
    const veo = snapshot.rates.filter((rate) => rate.model_id === "veo/veo-3.1-generate-001");
    expect(groupResolutionTiers(veo).groups).toHaveLength(2);
    expect(page).toContain("No audio");
    expect(page).toContain("Audio");
    expect(page).not.toContain("With audio");
    const veoRows = tables.find((table) => table.provider === "Comfy" && table.headers.includes("Audio"))!;
    const fastVeoRows = veoRows.displayRows.filter((row, index) => veoRows.rows[index][1] === "`veo/veo-3.1-fast-generate-001`");
    expect(fastVeoRows.map((row) => row[0])).toEqual([
      "[Veo 3.1 Fast Generate 001](/development/comfy-router/models/veo/veo-3-1-fast-generate-001/code)", "",
    ]);
    expect(fastVeoRows.map((row) => row[2])).toEqual(["No audio", "Audio"]);
    const ltx = snapshot.rates.filter((rate) => rate.model_id === "ltx/ltx-2-5-pro");
    const grouped = groupResolutionTiers(ltx);
    expect(grouped.remaining).toHaveLength(0);
    expect(grouped.groups.flatMap((group) => [...group.tiers.values()].flatMap((tier) => tier.sources))).toHaveLength(ltx.length);
    expect(page).not.toContain("1080 × 1920 / 1920 × 1080");
    const perSecondBands = tables.find((table) => table.provider === "Comfy"
      && table.rows.some((row) => row[1] === "`minimax/minimax-h3`"))!;
    expect(perSecondBands.headers).toEqual(["Name", "Model ID", "768p Credits", "2K Credits"]);
    expect(perSecondBands.rows.find((row) => row[1] === "`minimax/minimax-h3`")!.slice(2)).toEqual([
      "27.1557 / s", "39.2249 / s",
    ]);
    expect(perSecondBands.rows.some((row) => row[1] === "`pruna/p-video-2`")).toBe(false);
    const wanMatrix = tables.find((table) => table.provider === "Comfy"
      && table.rows.some((row) => row[1] === "`wan/wan2.5-i2v-preview`"))!;
    const pruna = wanMatrix.rows.filter((row) => row[1] === "`pruna/p-video-2`");
    expect(wanMatrix.headers).toEqual(["Name", "Model ID", "480p Credits", "720p Credits", "1080p Credits", "1440p Credits", "4K Credits"]);
    expect(pruna.map((row) => row[0].match(/P Video 2 (Standard|Draft)/)?.[1])).toEqual(["Standard", "Draft"]);
    expect(pruna.map((row) => [row[3], row[4]])).toEqual([
      ["7.5432 / s", "15.0865 / s"],
      ["4.5259 / s", "9.0519 / s"],
    ]);
    expect(wanMatrix.rows.some((row) => row[1] === "`wan/wan2.5-t2v-preview`")).toBe(true);
    expect(wanMatrix.rows.some((row) => row[1] === "`wan/wan3.0-video`" && row.includes("42.2 / s"))).toBe(true);
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
    const klingVideo = tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === "`kling/kling-v3`"));
    expect(klingVideo).toBeDefined();
    expect(klingVideo!.headers).not.toContain("Option");
  });

  test("combines request-rate rows with and without operation options", () => {
    const wavespeedRequests = tables.find((table) => table.provider === "WaveSpeed"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`wavespeed/seedvr2`"))!;
    expect(wavespeedRequests.headers).toEqual(["Name", "Model ID", "Credits / generation"]);
    expect(wavespeedRequests.rows.some((row) => row[1] === "`wavespeed/seedvr2`" && row[2] === "2.11")).toBe(true);
    expect(wavespeedRequests.rows.some((row) => row[1] === "`wavespeed/ultimate-image-upscaler`" && row[2] === "12.66")).toBe(true);
    const seedance = tables.find((table) => table.provider === "WaveSpeed"
      && table.rows.some((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`"))!;
    expect(seedance.headers).toEqual(["Name", "Model ID", "Credits / request"]);
    expect(seedance.rows).toEqual([
      ["[Dreamina Seedance 2.0](/development/comfy-router/models/byteplus/dreamina-seedance-2-0-260128/code)", "`byteplus/dreamina-seedance-2-0-260128`", "126.6"],
      ["[Dreamina Seedance 2.5](/development/comfy-router/models/byteplus/dreamina-seedance-2-5-260628/code)", "`byteplus/dreamina-seedance-2-5-260628`", "189.9"],
    ]);
  });

  test("groups image output charges as generations", () => {
    expect(page).toContain("#### Image generation and edit rates");
    const oneShot = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`bria/fibo`"))!;
    expect(oneShot.headers).not.toContain("Option");
    expect(oneShot.rows.some((row) => row[1] === "`bria/fibo`" && row.includes("8.44"))).toBe(true);
    const perGeneration = tables.find((table) => table.provider === "Comfy" && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`runway/gen4_image`"))!;
    expect(perGeneration.rows.some((row) => row[1] === "`runway/gen4_image`" && row.includes("24.1384"))).toBe(true);
    const combinedUnitTable = tables.find((table) => table.provider === "fal"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`vertexai/gemini-3.1-flash-image`"))!;
    expect(combinedUnitTable.headers).toEqual(["Name", "Model ID", "Credits / generation"]);
    const nanoBanana = combinedUnitTable.rows.find((row) => row[1] === "`vertexai/gemini-3.1-flash-image`")!;
    expect(nanoBanana[2]).toBe("16.88");
    const outputImage = tables.find((table) => table.section === "Qwen Image 3.0 output image rates")!;
    expect(outputImage.rows.some((row) => row[1] === "`qwen/qwen-image-3.0`" && row.includes("9.0519"))).toBe(true);
    const falOneTime = tables.find((table) => table.provider === "fal"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`fal/patina`"))!;
    expect(falOneTime.rows.some((row) => row[1] === "`fal/patina`" && row.includes("3.0173"))).toBe(true);
    expect(combinedUnitTable.rows.some((row) => row[1] === "`fal/patina`" && row[2] === "3.0173")).toBe(true);
    const wanPreviews = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`wan/wan2.5-i2i-preview`"))!;
    expect(wanPreviews.rows.find((row) => row[1] === "`wan/wan2.5-i2i-preview`")?.[2]).toBe("6.33");
    const generationColumn = wanPreviews.headers.indexOf("Credits / generation");
    expect(wanPreviews.headers).toEqual(["Name", "Model ID", "Credits / generation"]);
    for (const modelId of ["`wan/wan2.5-i2i-preview`", "`wan/wan2.5-t2i-preview`"]) {
      const row = wanPreviews.rows.find((candidate) => candidate[1] === modelId)!;
      expect(row[generationColumn]).toBe("6.33");
    }
    const switchx = tables.find((table) => table.section === "SwitchX image and video rates")!;
    expect(switchx.headers).toEqual(["Name", "Model ID", "720p Credits", "1080p Credits"]);
    expect(switchx.rows).toEqual([[
      "[SwitchX](/development/comfy-router/models/beeble/switchx/code)", "`beeble/switchx`",
      "Image: 30.173<br />Video: 30.173", "Image: 90.519<br />Video: 90.519",
    ]]);
    expect(page).toContain("Images are billed per output image. Videos are billed per 30 output frames, rounded up.");
  });

  test("shows Qwen and Seedream output-image rates as compact generation matrices", () => {
    const qwen = tables.find((table) => table.section === "Qwen Image 3.0 output image rates")!;
    expect(qwen.headers).toEqual([
      "Name", "Model ID", "1K Credits / generation", "2K Credits / generation",
    ]);
    expect(qwen.rows).toEqual([
      ["[Qwen Image 3.0](/development/comfy-router/models/qwen/qwen-image-3-0/code)", "`qwen/qwen-image-3.0`", "9.0519", "9.0519"],
      ["[Qwen Image 3.0 Pro](/development/comfy-router/models/qwen/qwen-image-3-0-pro/code)", "`qwen/qwen-image-3.0-pro`", "12.0692", "22.6297"],
    ]);

    const seedream = tables.find((table) => table.section === "Seedream 5.0 Pro output image rates")!;
    expect(seedream.headers).toEqual([
      "Name", "Model ID", "Layer separation · Standard Credits / generation",
      "Layer separation · Large Credits / generation", "Output image · Standard Credits / generation",
      "Output image · Large Credits / generation",
    ]);
    expect(seedream.rows).toEqual([[
      "[Seedream 5.0 Pro](/development/comfy-router/models/byteplus/seedream-5-0-pro-260628/code)",
      "`byteplus/seedream-5-0-pro-260628`", "6.7889", "13.5778", "9.495", "18.99",
    ]]);

    const falGenerationRates = tables.find((table) => table.provider === "fal"
      && table.headers.includes("Credits / generation")
      && table.rows.some((row) => row[1] === "`vertexai/gemini-3-pro-image`"))!;
    expect(falGenerationRates.rows.some((row) => row[1] === "`vertexai/gemini-3-pro-image`" && row[2] === "31.65")).toBe(true);
  });

  test("coalesces Luma Uni generation and edit rates into one model matrix", () => {
    const luma = tables.find((table) => table.section === "Image generation and then image edit")!;
    expect(luma.headers).toEqual([
      "Name", "Model ID", "Image generation Credits / generation", "Image edit Credits / generation",
    ]);
    expect(luma.rows).toEqual([
      ["[Uni 1](/development/comfy-router/models/luma_2/uni-1/code)", "`luma_2/uni-1`", "8.5244", "9.1574"],
      ["[Uni 1 Max](/development/comfy-router/models/luma_2/uni-1-max/code)", "`luma_2/uni-1-max`", "21.1", "21.733"],
    ]);
    const references = tables.find((table) => table.section === "Rates per reference image"
      && table.rows.some((row) => row[1] === "`luma_2/uni-1`"))!;
    expect(references.headers).toEqual(["Name", "Model ID", "Credits"]);
    expect(references.rows.map((row) => row[2])).toEqual([
      "0.633 / reference image", "0.633 / reference image",
    ]);
  });

  test("groups Ideogram versions and pivots quality prices into columns", () => {
    const ideogram = tables.find((table) => table.section === "Ideogram image rates")!;
    expect(ideogram.headers).toEqual([
      "Name", "Model ID", "Standard Credits / generation", "Quality Credits / generation", "Turbo Credits / generation",
    ]);
    expect(ideogram.rows).toEqual([
      ["[Ideogram 4.0](/development/comfy-router/models/ideogram/ideogram-v4/code)", "`ideogram/ideogram-v4`", "18.1038", "30.173", "9.0519"],
      ["[Ideogram V3](/development/comfy-router/models/ideogram/ideogram-v3/code)", "`ideogram/ideogram-v3`", "18.1038", "27.1557", "9.0519"],
    ]);
  });

  test("coalesces Seedance video billing axes into type and audio columns", () => {
    const videoTypes = tables.find((table) => table.section === "Seedance video token rates")!;
    expect(videoTypes.headers).toEqual([
      "Name", "Model ID", "Image to video / Text to video Credits / 1M tokens", "Video to video Credits / 1M tokens",
    ]);
    expect(videoTypes.rows).toEqual([
      ["[Dreamina Seedance 2.0 Fast](/development/comfy-router/models/byteplus/dreamina-seedance-2-0-fast-260128/code)", "`byteplus/dreamina-seedance-2-0-fast-260128`", "1689.688", "995.709"],
      ["[Dreamina Seedance 2.0 Mini](/development/comfy-router/models/byteplus/dreamina-seedance-2-0-mini/code)", "`byteplus/dreamina-seedance-2-0-mini`", "1056.055", "633.633"],
      ["[Seedance 1.0 Pro](/development/comfy-router/models/byteplus/seedance-1-0-pro-250528/code)", "`byteplus/seedance-1-0-pro-250528`", "527.5", "-"],
      ["[Seedance 1.0 Pro Fast](/development/comfy-router/models/byteplus/seedance-1-0-pro-fast-251015/code)", "`byteplus/seedance-1-0-pro-fast-251015`", "211", "-"],
    ]);

    const audio = tables.find((table) => table.section === "Seedance 1.5 Pro audio rates")!;
    expect(audio.headers).toEqual(["Name", "Model ID", "No audio Credits / 1M tokens", "Audio Credits / 1M tokens"]);
    expect(audio.rows).toEqual([[
      "[Seedance 1.5 Pro](/development/comfy-router/models/byteplus/seedance-1-5-pro-251215/code)",
      "`byteplus/seedance-1-5-pro-251215`", "253.2", "506.4",
    ]]);
  });

  test("moves Kling V3 Standard into the name and removes its otherwise-empty option column", () => {
    const rates = tables.find((table) => table.provider === "Higgsfield"
      && table.section === "Rates per second"
      && table.rows.some((row) => row[1] === "`kling/kling-v3`"))!;
    expect(rates.headers).toEqual(["Name", "Model ID", "Credits"]);
    expect(rates.rows.find((row) => row[1] === "`kling/kling-v3`")?.[0]).toContain("Kling V3 Standard");
    expect(rates.rows.some((row) => row[1] === "`higgsfield/higgsfield-kling-3-pro`" && row[2] === "35.448 / s")).toBe(true);
  });

  test("labels variant axes while combining compatible resolution bands", () => {
    const pruna = tables.find((table) => table.provider === "Comfy"
      && table.rows.some((row) => row[1] === "`pruna/p-video-2`" && row[0].includes("Standard"))
      && table.rows.some((row) => row[1] === "`wan/wan2.5-i2v-preview`"))!;
    expect(pruna.headers).toEqual(["Name", "Model ID", "480p Credits", "720p Credits", "1080p Credits", "1440p Credits", "4K Credits"]);
    expect(pruna.rows.filter((row) => row[1] === "`pruna/p-video-2`").map((row) => row[0].match(/P Video 2 (Standard|Draft)/)?.[1])).toEqual(["Standard", "Draft"]);
    expect(pruna.rows.filter((row) => row[1] === "`pruna/p-video-2`").map((row) => [row[3], row[4]])).toEqual([
      ["7.5432 / s", "15.0865 / s"],
      ["4.5259 / s", "9.0519 / s"],
    ]);
    const minimax = tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === "`minimax/minimax-h3`"))!;
    expect(minimax.headers).toEqual(["Name", "Model ID", "768p Credits", "2K Credits"]);
    expect(minimax.rows.some((row) => row[1] === "`pruna/p-video-2`")).toBe(false);
    const veo = tables.find((table) => table.provider === "Comfy" && table.headers.includes("Audio"))!;
    expect(veo).toBeDefined();
    expect(veo.rows.some((row) => row[1] === "`veo/veo-3.1-generate-001`" && row[2] === "No audio" && row[3] === "42.2 / s")).toBe(true);
    const standaloneVeo = tables.find((table) => table.provider === "Comfy" && table.section === "Rates per second");
    expect(standaloneVeo?.rows.some((row) => row[1] === "`veo/veo-3.1-generate-001`" )).toBe(false);
    const seedance = tables.find((table) => table.provider === "Higgsfield" && table.rows.some((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`"))!;
    expect(seedance.headers).toContain("480p Credits");
    expect(seedance.headers).toContain("720p Credits");
    expect(seedance.rows.find((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`")!.join(" | ")).toContain("2.954");
    const comfySeedance = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Input type")
      && table.rows.some((row) => row[1] === "`byteplus/dreamina-seedance-2-0-260128`"))!;
    const seedanceRows = comfySeedance.displayRows.filter((row, index) => comfySeedance.rows[index][1] === "`byteplus/dreamina-seedance-2-0-260128`");
    expect(seedanceRows.map((row) => row[0])).toHaveLength(3);
    expect(seedanceRows.filter((row) => row[0] !== "")).toHaveLength(1);
    expect(seedanceRows.filter((row) => row[1] !== "")).toHaveLength(1);
    expect(seedanceRows.map((row) => row[2])).toEqual(["Image to video", "Text to video", "Video to video"]);
  });

  test("groups audio duration pricing and names provider-specific credit units", () => {
    const audio = tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === "`elevenlabs/eleven_sfx_v2`"))!;
    expect(page).toContain("#### Rates by duration");
    expect(audio.rows.some((row) => row.includes("29.54 / minute"))).toBe(true);
    expect(audio.rows.some((row) => row.includes("0.7543 / s"))).toBe(true);
    expect(page).toContain("#### Rates per Meshy credit");
    expect(page).toContain("#### Rates per Kling credit");
    const zhPage = readFileSync("zh/development/comfy-router/pricing.mdx", "utf8");
    expect(zhPage).toContain("#### 每 Kling 积分费率");
    expect(zhPage).toContain("#### 每 Meshy 积分费率");
    const eleven = tables.find((table) => table.provider === "Comfy" && table.rows.some((row) => row[1] === "`elevenlabs/eleven_v3`"))!;
    const elevenRow = eleven.rows.find((row) => row[1] === "`elevenlabs/eleven_v3`")!;
    expect(eleven.headers).toEqual(["Name", "Model ID", "Option", "Credits"]);
    expect(elevenRow.slice(2)).toEqual(["Dialogue / Text to speech", "21.1 / 1K characters"]);
    const elevenSource = snapshot.supplemental_sources!.find((source) => source.source === "ElevenLabs API pricing")!;
    expect(elevenSource.source_ref).toBe("https://elevenlabs.io/pricing/api");
    expect(elevenSource.rates).toHaveLength(2);
    expect(elevenSource.rates.every((rate) => rate.price_usd === "0.1" && rate.credits === "21.1")).toBe(true);
  });

  test("puts Krea 2 generation modes in a compact matrix", () => {
    expect(page).toContain("#### Krea 2 generation rates (credits / generation)");
    const krea = tables.find((table) => table.provider === "Comfy"
      && table.headers.includes("Moodboards Credits")
      && table.rows.some((row) => row[1] === "`krea/krea-2-large`"))!;
    expect(krea.headers).toEqual(["Name", "Model ID", "Moodboards Credits", "Style references Credits", "Text only Credits"]);
    expect(krea.rows).toEqual([
      ["[Krea 2](/development/comfy-router/models/krea/krea-2/code)", "`krea/krea-2`", "8.44", "7.385", "6.33"],
      ["[Krea 2 Large](/development/comfy-router/models/krea/krea-2-large/code)", "`krea/krea-2-large`", "14.77", "13.715", "12.66"],
      ["[Krea 2 Medium](/development/comfy-router/models/krea/krea-2-medium/code)", "`krea/krea-2-medium`", "8.44", "7.385", "6.33"],
      ["[Krea 2 Medium Turbo](/development/comfy-router/models/krea/krea-2-medium-turbo/code)", "`krea/krea-2-medium-turbo`", "4.22", "3.6925", "3.165"],
    ]);
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
        const rates = snapshot.rates.filter((rate) => rate.model_id === model.id && displayProvider(model.id, model.providers, rate.serving_provider) === provider);
        preserved += groupRates(rates, "en").flatMap((group) => group.rates).length;
      }
    }
    expect(preserved).toBe(snapshot.rates.length);
  });

  test("tier pivots preserve all source records, including quantities and effective windows", () => {
    const preserved = [];
    for (const model of catalog) {
      for (const provider of model.providers) {
        const rates = snapshot.rates.filter((rate) => rate.model_id === model.id && displayProvider(model.id, model.providers, rate.serving_provider) === provider);
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

  test("keeps price-changing variants inline and labels distinct pricing groups", () => {
    expect(formatOption("resolution=720p; generateAudio=true", "en")).toBe("720p · Audio");
    expect(formatOption("Edit; quality=high; output size=4K", "en")).toBe("Image edit · High · 4K");
    expect(formatOption("Output image; output_tier=qima_output_1k", "en")).toBe("Output image · 1K");
    expect(page).toContain("No audio");
    expect(page).toContain("Audio");
    expect(page).not.toContain("listed rates end on");
    expect(page).toContain("#### Per second by resolution");
    expect(page).toContain("#### Token rates");
    expect(page).toContain("Prices updated: Oct 1, 2026.");
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
