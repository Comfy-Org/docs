#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findPricingMatch, loadCatalog, loadSourceRows } from "./gen-router-pricing.ts";

const ROOT = join(import.meta.dir, "../../..");
const SOURCE_FILE = join(ROOT, "tutorials/partner-nodes/pricing.mdx");
const DATA_FILE = join(ROOT, "router-pricing/prices.json");
const SOURCE_URL = "/tutorials/partner-nodes/pricing";

const SAMPLE_UI = [
  { id: "openai/gpt-5", title: "GPT-5", category: "Text", icon: "message", price: "263.75 credits / 1M input", detail: "2,110 credits / 1M output", config: "Token billing" },
  { id: "openai/gpt-image-2", title: "GPT Image 2", category: "Image", icon: "image", price: "2,025.6 credits / 1M input", detail: "7,600 credits / 1M image output", config: "Image generation" },
  { id: "vertexai/gemini-3-pro-image", title: "Nano Banana Pro", category: "Image", icon: "image", price: "30.38 credits / 1K image output", detail: "0.5064 credits / 1K input", config: "1K to 4K images" },
  { id: "byteplus/dreamina-seedance-2-0-260128", title: "Seedance 2.0", category: "Video", icon: "video", price: "2.112 credits / 1K tokens", detail: "480p or 720p, no video input", config: "Video generation" },
  { id: "kling/kling-v3", title: "Kling V3", category: "Video", icon: "video", price: "17.72 credits / second", detail: "720p, audio off", config: "Video generation" },
  { id: "recraft/recraftv4", title: "Recraft V4", category: "Image", icon: "image", price: "8.44 credits / image", detail: "16.88 credits / image for vector", config: "Image and vector" },
] as const;

const source = readFileSync(SOURCE_FILE, "utf8");
const sourceBody = source.replace(/^---[\s\S]*?---\s*/, "");
const rows = loadSourceRows(sourceBody);
const catalog = loadCatalog();
const sourceHash = Bun.spawnSync(["git", "hash-object", SOURCE_FILE], { cwd: ROOT }).stdout.toString().trim();
const previous = existsSync(DATA_FILE) ? (JSON.parse(readFileSync(DATA_FILE, "utf8")) as { source?: { git_blob?: string; synced_at?: string } }) : undefined;

const models = catalog.map((model) => {
  const match = findPricingMatch(model.id, rows);
  return {
    id: model.id,
    title: model.title,
    page: model.page,
    status: match ? "published" : "not_published",
    source_section: match?.section ?? null,
    source_key: match?.key ?? null,
    rates:
      match?.rows.map((row) => ({
        fields: row.cells.map((value, index) => ({ label: row.headers[index] ?? `Field ${index + 1}`, value })),
      })) ?? [],
  };
});

const data = {
  source: {
    path: "tutorials/partner-nodes/pricing.mdx",
    url: SOURCE_URL,
    credits_url: "https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy",
    git_blob: sourceHash,
    credits_per_usd: 211,
    synced_at: previous?.source?.git_blob === sourceHash ? previous.source.synced_at ?? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  },
  models,
  sample: SAMPLE_UI.map((sample) => ({ ...sample, page: catalog.find((model) => model.id === sample.id)?.page ?? "" })),
};

const output = `${JSON.stringify(data, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!existsSync(DATA_FILE) || readFileSync(DATA_FILE, "utf8") !== output) {
    console.error(`${DATA_FILE}: stale or missing, run pnpm router-pricing:sync`);
    process.exit(1);
  }
  console.log("router pricing data is fresh");
} else {
  writeFileSync(DATA_FILE, output);
  console.log(`wrote ${DATA_FILE} from ${data.source.path} (${models.length} models)`);
}
