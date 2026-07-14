#!/usr/bin/env bun
/**
 * Re-pretty-print OpenAPI YAML files without calling the translation API.
 * Skips *.en.yaml sources that are already hand-formatted (optional --all).
 *
 * Usage:
 *   pnpm translate:reformat-openapi
 *   pnpm translate:reformat-openapi -- --all
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { REPO_ROOT } from "./i18n-config.mjs";
import {
  parseSpecFile,
  stringifyYamlSpec,
  stripYamlHeader,
} from "./openapi-translate.ts";

const openapiDir = join(REPO_ROOT, "openapi");
const includeEn = process.argv.includes("--all");

async function reformatFile(absPath: string): Promise<void> {
  const rel = absPath.slice(REPO_ROOT.length + 1);
  if (!/\.ya?ml$/i.test(rel)) return;
  if (!includeEn && /\.en\.ya?ml$/i.test(rel)) {
    console.log(`SKIP ${rel} (English source)`);
    return;
  }
  if (includeEn && rel === "openapi/cloud.en.yaml") {
    console.log(`SKIP ${rel} (hand-maintained English source)`);
    return;
  }

  const raw = await readFile(absPath, "utf-8");
  const { header } = stripYamlHeader(raw);
  const spec = await parseSpecFile(absPath);
  const next = `${header}${stringifyYamlSpec(spec)}`;
  if (next === raw) {
    console.log(`OK   ${rel} (unchanged)`);
    return;
  }
  await Bun.write(absPath, next);
  const lines = next.split("\n").length;
  console.log(`OK   ${rel} (${lines} lines)`);
}

const entries = await readdir(openapiDir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
    await reformatFile(join(openapiDir, entry.name));
  }
}
