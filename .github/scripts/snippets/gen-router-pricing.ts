#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const METRONOME_FILE = join(ROOT, "router-pricing/metronome-rates.json");
const OUTPUT_FILE = join(ROOT, "development/comfy-router/pricing.mdx");
const MODEL_GLOB = "development/comfy-router/models/**/code.mdx";

type CatalogModel = {
  id: string;
  title: string;
  page: string;
  providers: string[];
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
      });
    }
  }
  if (models.size === 0) throw new Error(`no Router model pages matched ${MODEL_GLOB}`);
  return [...models.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
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
      const expected = Number(rate.price_usd) * data.credits_per_usd;
      if (!Number.isFinite(expected) || Math.abs(expected - Number(rate.credits)) > 0.000051) {
        throw new Error(`${METRONOME_FILE}: credit conversion does not match USD amount for ${rate.model_id}`);
      }
    }
    if (rate.effective_until && rate.effective_until <= rate.effective_from) {
      throw new Error(`${METRONOME_FILE}: rate end must follow its start for ${rate.model_id}`);
    }
  }
  return data;
}

function metronomeRateSummary(rate: MetronomeRate): string {
  if (rate.kind === "usage") {
    return `Rate shape: Usage-based; Unit: Variable per request; Conditions: The amount depends on reported usage; Effective: From ${rate.effective_from}`;
  }
  const unit = rate.unit.replace(/^per /, "");
  const conditions = rate.conditions ? `; Conditions: ${rate.conditions}` : "";
  const end = rate.effective_until ? ` until ${rate.effective_until} (exclusive)` : "";
  return `USD price: $${rate.price_usd}; Credits: ${rate.credits}; Unit: ${unit}${conditions}; Effective: From ${rate.effective_from}${end}`;
}

function render(): string {
  const models = loadCatalog();
  const metronome = loadMetronomeData();
  const modelIds = new Set(models.map((model) => model.id));
  const missingModels = [...new Set(metronome.rates.map((rate) => rate.model_id).filter((id) => !modelIds.has(id)))];
  if (missingModels.length) {
    throw new Error(`${METRONOME_FILE}: Router model IDs are absent from the current catalog: ${missingModels.join(", ")}`);
  }
  const ratesByModel = new Map<string, MetronomeRate[]>();
  for (const rate of metronome.rates) {
    const rates = ratesByModel.get(rate.model_id) ?? [];
    rates.push(rate);
    ratesByModel.set(rate.model_id, rates);
  }
  const grouped = new Map<string, CatalogModel[]>();
  for (const model of models) {
    const label = model.providers[0];
    const models = grouped.get(label) ?? [];
    models.push(model);
    grouped.set(label, models);
  }
  const sections = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, models]) => {
      const rows = [...models]
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .flatMap((model) => {
          const routeRates = ratesByModel.get(model.id) ?? [];
          return model.providers.map((servingProvider) => {
            const rates = routeRates.filter((candidate) => candidate.serving_provider.toLowerCase() === servingProvider.toLowerCase());
            const value = rates.length ? rates.map(metronomeRateSummary).join("<br />") : "Not published";
            const source = rates.length ? "Metronome snapshot" : "No matched Metronome rate";
            return `| [${model.title}](/${model.page}) | \`${model.id}\` | ${servingProvider} | ${value} | ${source} |`;
          });
        })
        .join("\n");
      return `## ${provider}\n\n| Model | Router model ID | Serving provider | Rate | Pricing source |\n| --- | --- | --- | --- | --- |\n${rows}`;
    })
    .join("\n\n");

  return `---
title: "Comfy Router pricing by model"
sidebarTitle: "Pricing"
description: "Compare Comfy Router model rates by serving provider, including billing units, conditions, and snapshot dates."
mode: "wide"
---

{/* GENERATED FILE. Generated from autogenerated Router model pages and router-pricing/metronome-rates.json. */}

<Note>
Model IDs and serving providers come from the autogenerated Comfy Router model pages. Published rates reflect the Metronome production snapshot from ${metronome.snapshot_at}. Rates are per stated billable unit and conditions apply as listed. Usage-based rates vary by request. The \`X-Comfy-Credits-Used\` response header reports the run amount when available. “Not published” means no matching Metronome rate is mapped for that model and serving provider. See [billing details](/development/comfy-router/billing).
</Note>

${sections}
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

export { loadCatalog, loadMetronomeData, render };
