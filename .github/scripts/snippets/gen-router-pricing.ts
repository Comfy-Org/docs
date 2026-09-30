#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatAmount, formatDate, formatOption, formatUnit, pricingCopy, type PricingCategory, type PricingLocale } from "./router-pricing-display.ts";

const ROOT = join(import.meta.dir, "../../..");
const METRONOME_FILE = join(ROOT, "router-pricing/metronome-rates.json");
const OUTPUT_FILE = join(ROOT, "development/comfy-router/pricing.mdx");
const MODEL_GLOB = "development/comfy-router/models/**/code.mdx";

type CatalogModel = {
  id: string;
  title: string;
  page: string;
  providers: string[];
  category: PricingCategory;
};

type MetronomeRate = {
  model_id: string;
  serving_provider: string;
  kind: "usage" | "flat" | "metered";
  unit: string;
  price_usd?: string;
  credits?: string;
  conditions?: string;
  effective_from: string;
  effective_until?: string;
  replace_existing?: boolean;
};

type MetronomeData = {
  snapshot_at: string;
  credits_per_usd: number;
  source_sha256: string;
  rates: MetronomeRate[];
};

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  beeble: "Beeble",
  bfl: "Black Forest Labs",
  bria: "Bria",
  byteplus: "BytePlus",
  elevenlabs: "ElevenLabs",
  fal: "fal",
  freepik: "Freepik",
  "gemini-interactions": "Gemini Interactions",
  heygen: "HeyGen",
  higgsfield: "Higgsfield",
  ideogram: "Ideogram",
  kling: "Kling",
  krea: "Krea",
  ltx: "LTX",
  luma: "Luma",
  luma_2: "Luma 2",
  meshy: "Meshy",
  minimax: "MiniMax",
  moonvalley: "Moonvalley",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  pruna: "Pruna",
  qwen: "Qwen",
  recraft: "Recraft",
  runway: "Runway",
  tencent: "Tencent",
  veo: "Veo",
  vertexai: "Google",
  wan: "Wan",
  wavespeed: "WaveSpeed",
  xai: "xAI",
};

const providerLabel = (modelId: string) => PROVIDER_LABEL[modelId.split("/")[0]] ?? modelId.split("/")[0];

function servingProviders(pageText: string, modelId: string): string[] {
  const intro = pageText.match(/API Reference for `[^`]+`, served by Comfy Router from ([^.]+)\./)?.[1];
  const defaultProvider = intro?.trim() ?? providerLabel(modelId);
  const sectionStart = pageText.indexOf("## Serving providers");
  if (sectionStart < 0) return [defaultProvider];
  const nextHeading = pageText.indexOf("\n## ", sectionStart + 4);
  const section = pageText.slice(sectionStart, nextHeading < 0 ? undefined : nextHeading);
  const alternatives = [...section.matchAll(/^- \*\*(.+?)\*\*/gm)]
    .map((match) => match[1].replace(/ \(default\)$/, "").trim())
    .filter((provider) => provider.toLowerCase() !== "comfy");
  return [...new Set([defaultProvider, ...alternatives])];
}

function modelTitle(pageText: string, model: string): string {
  const title = pageText.match(/^title: "([^"]+)"$/m)?.[1];
  if (title) return title.replace(/^Use /, "").replace(/ with Comfy Router$/, "");
  return model
    .split("/")
    .at(-1)!
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function loadCatalog(): CatalogModel[] {
  const modalities = new Map<string, string[]>();
  for (const rel of new Bun.Glob("router-schemas/**/*.json").scanSync({ cwd: ROOT })) {
    const schema = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
    if (schema["x-comfy-router-model-id"]) {
      modalities.set(schema["x-comfy-router-model-id"], schema["x-comfy-router-output-modalities"] ?? []);
    }
  }
  const models = new Map<string, CatalogModel>();
  for (const rel of [...new Bun.Glob(MODEL_GLOB).scanSync({ cwd: ROOT })].sort()) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const match of text.matchAll(/\*\*Model ID:\*\*\s*`([^`]+)`/g)) {
      const id = match[1];
      models.set(id, {
        id,
        title: modelTitle(text, id),
        page: rel.replace(/\.mdx$/, ""),
        providers: servingProviders(text, id),
        category: modelCategory(id, modalities.get(id) ?? []),
      });
    }
  }
  if (models.size === 0) throw new Error(`no Router model pages matched ${MODEL_GLOB}`);
  return [...models.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function modelCategory(id: string, outputs: string[]): PricingCategory {
  if (id.startsWith("gemini-interactions/")) return "text";
  if (outputs.includes("3d")) return "3d";
  if (outputs.includes("video")) return "video";
  if (outputs.includes("image")) return "images";
  if (outputs.includes("audio") && !outputs.includes("text")) return "audio";
  if (outputs.includes("text")) return "text";
  if (id.startsWith("vertexai/")) return /image|imagen/.test(id) ? "images" : "text";
  if (id.startsWith("wan/")) return /[ti]2i/.test(id) ? "images" : "video";
  if (id.startsWith("bfl/")) return /video/.test(id) ? "video" : "images";
  if (id.startsWith("minimax/")) return "video";
  if (id.startsWith("ideogram/")) return "images";
  throw new Error(`No pricing category for ${id}`);
}

function loadMetronomeData(): MetronomeData {
  const data = JSON.parse(readFileSync(METRONOME_FILE, "utf8")) as MetronomeData;
  if (!data.snapshot_at || data.credits_per_usd <= 0 || !Array.isArray(data.rates)) {
    throw new Error(`${METRONOME_FILE}: invalid Metronome pricing data`);
  }
  for (const rate of data.rates) {
    if (!rate.model_id || !rate.serving_provider || !rate.unit || !rate.effective_from) {
      throw new Error(`${METRONOME_FILE}: every route rate requires a model, serving provider, unit, and start date`);
    }
    if (rate.kind !== "usage" && (!rate.price_usd || !rate.credits)) {
      throw new Error(`${METRONOME_FILE}: fixed and metered rates require USD and credit amounts`);
    }
    if (rate.kind === "usage" && (rate.price_usd !== undefined || rate.credits !== undefined)) {
      throw new Error(`${METRONOME_FILE}: usage-based rates must not expose a fixed amount`);
    }
    if (rate.price_usd !== undefined && rate.credits !== undefined) {
      validateCreditConversion(rate, data.credits_per_usd);
    }
    if (rate.effective_until && rate.effective_until <= rate.effective_from) {
      throw new Error(`${METRONOME_FILE}: rate end must follow its start for ${rate.model_id}`);
    }
  }
  return data;
}

function validateCreditConversion(rate: MetronomeRate, creditsPerUsd: number): void {
  const expected = Number(rate.price_usd) * creditsPerUsd;
  const actual = Number(rate.credits);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || Math.abs(expected - actual) > 0.000051) {
    throw new Error(`${METRONOME_FILE}: credit conversion does not match USD amount for ${rate.model_id}`);
  }
}

type DisplayRate = {
  rates: MetronomeRate[];
  options: string[];
};

function groupRates(rates: MetronomeRate[], locale: PricingLocale): DisplayRate[] {
  const groups = new Map<string, DisplayRate>();
  for (const rate of rates) {
    const key = JSON.stringify([rate.kind, rate.price_usd, rate.credits, rate.unit, rate.effective_from, rate.effective_until]);
    const group = groups.get(key) ?? { rates: [], options: [] };
    group.rates.push(rate);
    const option = formatOption(rate.conditions, locale);
    if (!group.options.includes(option)) group.options.push(option);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function compactOptions(options: string[]): string {
  if (options.length === 1) return options[0];
  const groups = new Map<string, string[]>();
  for (const option of options) {
    const parts = option.split(" · ");
    const last = parts.pop()!;
    const prefix = parts.join(" · ");
    const values = groups.get(prefix) ?? [];
    values.push(last);
    groups.set(prefix, values);
  }
  return [...groups].map(([prefix, values]) =>
    [prefix, values.join(" / ")].filter(Boolean).join(" · "),
  ).join("<br />");
}

function displayTitle(model: CatalogModel): string {
  if (model.id === "bfl/flux-pro-1.1") return "FLUX 1.1 Pro";
  if (model.id === "bfl/flux-pro-1.1-ultra") return "FLUX 1.1 Pro Ultra";
  if (model.id === "bfl/flux-kontext-max") return `${model.title} Max`;
  if (model.id === "bfl/flux-kontext-pro") return `${model.title} Pro`;
  return model.title.replace(/^Image Edit /, "").replace(/^Video Edit /, "").replace(/Gen Fill$/, "Generative Fill")
    .replace(/ (?:20\d{6}|\d{6})$/, "");
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function render(locale: PricingLocale = "en"): string {
  const models = loadCatalog();
  const data = loadMetronomeData();
  const copy = pricingCopy[locale];
  const modelIds = new Set(models.map((model) => model.id));
  const missingModels = [...new Set(data.rates.map((rate) => rate.model_id).filter((id) => !modelIds.has(id)))];
  if (missingModels.length) throw new Error(`${METRONOME_FILE}: Router model IDs are absent from the current catalog: ${missingModels.join(", ")}`);
  const categories: PricingCategory[] = ["images", "video", "text", "audio", "3d"];
  const tabs = categories.map((category) => {
    const providers = new Map<string, Array<{ model: CatalogModel; rates: MetronomeRate[] }>>();
    for (const model of models.filter((candidate) => candidate.category === category)) {
      for (const provider of model.providers) {
        const routes = providers.get(provider) ?? [];
        routes.push({ model, rates: data.rates.filter((rate) => rate.model_id === model.id && rate.serving_provider.toLowerCase() === provider.toLowerCase()) });
        providers.set(provider, routes);
      }
    }
    let opened = false;
    const sections = [...providers].sort(([a], [b]) => a.localeCompare(b)).map(([provider, routes]) => {
      const hasNumeric = routes.some(({ rates }) => rates.some((rate) => rate.kind !== "usage"));
      const defaultOpen = !opened && hasNumeric;
      if (defaultOpen) opened = true;
      const rows = routes.flatMap(({ model, rates }) => {
        const name = `[${tableCell(displayTitle(model))}](/${model.page})`;
        if (!rates.length) return [`| ${name} | - | ${copy.unavailable} | - | - |`];
        return groupRates(rates, locale).map((group) => {
          const rate = group.rates[0];
          const usd = rate.kind === "usage" ? copy.variable : `$${formatAmount(rate.price_usd!)}`;
          const credits = rate.kind === "usage" ? "-" : formatAmount(rate.credits!);
          return `| ${name} | ${tableCell(compactOptions(group.options))} | ${usd} | ${credits} | ${tableCell(formatUnit(rate.unit, locale))} |`;
        });
      }).join("\n");
      const expiry = new Map<string, Set<string>>();
      for (const { model, rates } of routes) {
        for (const rate of rates) {
          if (!rate.effective_until) continue;
          const titles = expiry.get(rate.effective_until) ?? new Set<string>();
          titles.add(displayTitle(model));
          expiry.set(rate.effective_until, titles);
        }
      }
      const notices = [...expiry].map(([date, titles]) =>
        `\n${copy.expiry([...titles].join(", "), formatDate(date, locale))}\n`,
      ).join("");
      return `<Accordion title="${provider}"${defaultOpen ? " defaultOpen" : ""}>\n\n| ${copy.model} | ${copy.option} | ${copy.usd} | ${copy.credits} | ${copy.unit} |\n| --- | --- | ---: | ---: | --- |\n${rows}\n${notices}\n</Accordion>`;
    }).join("\n\n");
    return `<Tab title="${copy.categories[category]}">\n\n<AccordionGroup>\n\n${sections}\n\n</AccordionGroup>\n\n</Tab>`;
  }).join("\n\n");
  return `---
title: "${copy.title}"
sidebarTitle: "${copy.sidebar}"
description: "${copy.description}"
mode: "wide"
---

{/* Generated pricing page. */}

${copy.conversion(data.credits_per_usd)} ${copy.intro}

<Tabs>

${tabs}

</Tabs>

${copy.status}

${copy.updated}: ${formatDate(data.snapshot_at, locale)}.
`;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const output = render();
  if (check) {
    if (!existsSync(OUTPUT_FILE) || readFileSync(OUTPUT_FILE, "utf8") !== output) {
      console.error(`${OUTPUT_FILE}: stale or missing, run pnpm router-pricing:gen`);
      process.exit(1);
    }
    console.log("router pricing page is fresh");
  } else {
    writeFileSync(OUTPUT_FILE, output);
    console.log(`wrote ${OUTPUT_FILE}`);
  }
}

export { compactOptions, groupRates, loadCatalog, loadMetronomeData, render, validateCreditConversion };
