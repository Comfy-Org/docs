import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { CmsConfig } from "./cms-config.ts";
import { getProjectConfig } from "./cms-config.ts";
import { isEnoent } from "./cms-env.ts";

export type AttentionLevel = "low" | "high";

export interface AttentionOverrides {
  [project: string]: Record<string, AttentionLevel>;
}

export function attentionOverridesPath(): string {
  return join(import.meta.dir, "attention-overrides.json");
}

export async function loadAttentionOverrides(): Promise<AttentionOverrides> {
  try {
    const raw = await readFile(attentionOverridesPath(), "utf-8");
    return JSON.parse(raw) as AttentionOverrides;
  } catch (error) {
    if (isEnoent(error)) return {};
    throw error;
  }
}

export async function saveAttentionOverride(
  project: string,
  version: string,
  attention: AttentionLevel
): Promise<void> {
  const overrides = await loadAttentionOverrides();
  const cleanVersion = version.replace(/^v/i, "");
  if (!overrides[project]) overrides[project] = {};
  if (attention === "low") {
    delete overrides[project][cleanVersion];
    if (Object.keys(overrides[project]).length === 0) delete overrides[project];
  } else {
    overrides[project][cleanVersion] = attention;
  }
  await writeFile(attentionOverridesPath(), `${JSON.stringify(overrides, null, 2)}\n`, "utf-8");
}

export function resolveAttention(
  config: CmsConfig,
  project: string,
  version: string,
  overrides?: AttentionOverrides
): AttentionLevel {
  const cleanVersion = version.replace(/^v/i, "");
  const fromOverrides = overrides?.[project]?.[cleanVersion];
  if (fromOverrides) return fromOverrides;
  try {
    const p = getProjectConfig(config, project);
    return (p.default_attention ?? config.default_attention ?? "low") as AttentionLevel;
  } catch {
    return (config.default_attention ?? "low") as AttentionLevel;
  }
}
