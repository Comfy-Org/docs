#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const SOURCE_FILE = join(ROOT, "tutorials/partner-nodes/pricing.mdx");
const DATA_FILE = join(ROOT, "router-pricing/prices.json");
const OUTPUT_FILE = join(ROOT, "development/comfy-router/pricing.mdx");
const MODEL_GLOB = "development/comfy-router/models/**/code.mdx";
const PRICING_URL = "/tutorials/partner-nodes/pricing";

type CatalogModel = {
  id: string;
  title: string;
  page: string;
};

type SourceRow = {
  section: string;
  anchor: string;
  line: string;
  cells: string[];
  headers: string[];
};

type PricingMatch = { section: string; anchor: string; key: string; rows: SourceRow[] };

type PricingData = {
  source: {
    path: string;
    url: string;
    credits_url: string;
    git_blob: string;
    credits_per_usd: number;
    synced_at: string;
  };
  models: Array<{
    id: string;
    title: string;
    page: string;
    status: "published" | "not_published";
    source_section: string | null;
    source_key: string | null;
    rates: Array<{ fields: Array<{ label: string; value: string }> }>;
  }>;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[`*_()[\],.]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const anchor = (heading: string) => normalize(heading);

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

function modelKeys(model: string): string[] {
  const [provider] = model.split("/");
  const segment = model.split("/").at(-1)!;
  const keys = new Set<string>([
    segment,
    segment.replace(/\./g, "-"),
    segment.replace(/-\d{6}$/, ""),
  ]);

  if (segment.startsWith("dreamina-")) {
    keys.add(segment.slice("dreamina-".length));
    keys.add(segment.slice("dreamina-".length).replace(/-\d{6}$/, ""));
  }
  if (segment.startsWith("claude-")) keys.add(segment.slice("claude-".length));
  if (provider === "bfl") {
    const bflAliases: Record<string, string[]> = {
      "flux-kontext-pro": ["flux-1-kontext-pro-image"],
      "flux-kontext-max": ["flux-1-kontext-max-image"],
      "flux-pro-1.1": ["flux-1-1-pro-ultra-image"],
      "flux-pro-1.1-ultra": ["flux-1-1-pro-ultra-image"],
      "video-edit-v1": ["flux-video-edit"],
      "video-upscale-v1": ["flux-video-upscale"],
    };
    for (const alias of bflAliases[segment] ?? []) keys.add(alias);
  }
  if (provider === "wavespeed" && segment === "ultimate-image-upscaler") keys.add("ultimate");

  return [...keys].map(normalize).filter((key) => key.length > 2).sort((a, b) => b.length - a.length);
}

function providerSection(model: string): string | undefined {
  const [provider, segment] = model.split("/");
  if (provider === "anthropic") return "Anthropic";
  if (provider === "bfl") return "BFL";
  if (provider === "bria") return "Bria";
  if (provider === "byteplus") return "ByteDance";
  if (provider === "elevenlabs") return "ElevenLabs";
  if (["gemini-interactions", "google", "vertexai"].includes(provider)) return "Google";
  if (provider === "heygen") return "HeyGen";
  if (provider === "ideogram") return "Ideogram";
  if (provider === "kling") return "Kling";
  if (provider === "krea") return "Krea";
  if (provider === "ltx") return "Lightricks";
  if (["luma", "luma_2"].includes(provider)) return "Luma";
  if (provider === "meshy") return "Meshy";
  if (provider === "minimax") return "Minimax";
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "qwen") return "Qwen";
  if (provider === "recraft") return "Recraft";
  if (provider === "runway") return "Runway";
  if (provider === "tencent") return "Tencent";
  if (provider === "wan" && segment.startsWith("happyhorse-")) return "HappyHorse";
  if (provider === "wan") return "Wan";
  if (provider === "wavespeed") return "WaveSpeed";
  if (provider === "xai") return "xAI";
  return undefined;
}

function loadCatalog(): CatalogModel[] {
  const models = new Map<string, CatalogModel>();
  for (const rel of [...new Bun.Glob(MODEL_GLOB).scanSync({ cwd: ROOT })].sort()) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const match of text.matchAll(/\*\*Model ID:\*\*\s*`([^`]+)`/g)) {
      const id = match[1];
      models.set(id, { id, title: modelTitle(text, id), page: rel.replace(/\.mdx$/, "") });
    }
  }
  if (models.size === 0) throw new Error(`no Router model pages matched ${MODEL_GLOB}`);
  return [...models.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function loadSourceRows(sourceBody: string): SourceRow[] {
  let section = "Partner Node pricing";
  let currentAnchor = anchor(section);
  let headers: string[] = [];
  const rows: SourceRow[] = [];
  for (const line of sourceBody.split("\n")) {
    const heading = line.match(/^## ([^#].*)$/)?.[1];
    if (heading) {
      section = heading.trim();
      currentAnchor = anchor(section);
      headers = [];
    }
    if (!line.trim().startsWith("|")) {
      headers = [];
      continue;
    }
    const cells = line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
    if (/^\s*\|?\s*:?-{2,}/.test(line.trim())) continue;
    if (headers.length === 0) {
      headers = cells;
      continue;
    }
    rows.push({ section, anchor: currentAnchor, line: line.trim(), cells, headers });
  }
  return rows;
}

function findPricingMatch(model: string, rows: SourceRow[]): PricingMatch | undefined {
  const section = providerSection(model);
  const scopedRows = section ? rows.filter((row) => row.section === section) : [];
  for (const key of modelKeys(model)) {
    const matches = scopedRows.filter((candidate) =>
      candidate.cells
        .flatMap((cell) => cell.split(/[(),;]/).map(normalize))
        .includes(key),
    );
    if (matches.length) return { section: matches[0].section, anchor: matches[0].anchor, key, rows: matches };
  }
  return undefined;
}

function rateSummary(record: PricingData["models"][number]): string {
  if (record.status !== "published") return "—";
  return record.rates
    .map((row) => row.fields.map((field) => `${field.label}: ${field.value}`).join("; "))
    .join("<br />")
    .replaceAll("|", "\\|");
}

function loadPricingData(): PricingData {
  const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as PricingData;
  if (!data.source || data.source.credits_per_usd <= 0 || !Array.isArray(data.models)) {
    throw new Error(`${DATA_FILE}: invalid pricing data`);
  }
  if (data.models.length === 0) throw new Error(`${DATA_FILE}: no model records`);
  return data;
}

function render(): string {
  const data = loadPricingData();
  const grouped = new Map<string, PricingData["models"]>();
  for (const model of data.models) {
    const label = providerLabel(model.id);
    const models = grouped.get(label) ?? [];
    models.push(model);
    grouped.set(label, models);
  }
  const sections = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, models]) => {
      const rows = [...models]
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .map((model) => {
          const reference = model.source_section
            ? `[${model.source_section}](${PRICING_URL}#${normalize(model.source_section)})`
            : `[Partner Node pricing](${PRICING_URL})`;
          return `| [${model.title}](/${model.page}) | \`${model.id}\` | ${rateSummary(model)} | ${reference} |`;
        })
        .join("\n");
      return `## ${provider}\n\n| Model | Router model ID | Comfy credit rate | Pricing source |\n| --- | --- | --- | --- |\n${rows}`;
    })
    .join("\n\n");

  return `---
title: "Comfy Router pricing by model"
sidebarTitle: "Pricing"
description: "Compare Comfy Router credit pricing by model, with billing units and official pricing source links."
mode: "wide"
---

{/* GENERATED FILE. Generated from router-pricing/prices.json by \`pnpm router-pricing:gen\`. */}

<Note>
Prices are in Comfy credits. A dash means the official source has no matching rate row. [Pricing details](${PRICING_URL}).
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

export { findPricingMatch, loadCatalog, loadSourceRows, render };
