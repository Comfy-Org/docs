#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findPricingMatch, loadCatalog, loadSourceRows } from "./gen-router-pricing.ts";

const ROOT = join(import.meta.dir, "../../..");
const SOURCE_FILE = join(ROOT, "tutorials/partner-nodes/pricing.mdx");
const DATA_FILE = join(ROOT, "router-pricing/prices.json");
const SOURCE_URL = "/tutorials/partner-nodes/pricing";

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
    git_blob: sourceHash,
    credits_per_usd: 211,
    synced_at: previous?.source?.git_blob === sourceHash ? previous.source.synced_at ?? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  },
  models,
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
