import { readFile } from "fs/promises";
import { join } from "path";

export const STAGING_ROOT = ".github/scripts/cms/staging";

export type LocaleSource = "simplify" | "translate";
export type AttentionLevel = "low" | "medium" | "high";

export interface LocaleConfig {
  code: string;
  source: LocaleSource;
  changelog: string | null;
  name?: string;
}

export interface CmsProjectConfig {
  id: string;
  label?: string;
  docs_en?: string;
  default_attention?: AttentionLevel;
  min_version?: string;
}

export interface CmsConfig {
  content_type_plural: string;
  project_field: string;
  version_field: string;
  content_field: string;
  attention_field: string;
  default_project: string;
  default_attention: AttentionLevel;
  min_version: string;
  docs_en: string;
  projects?: CmsProjectConfig[];
  simplify?: {
    max_bullets_total?: number;
    max_sections?: number;
  };
  locales: LocaleConfig[];
}

/** Legacy comfyui path: staging/{locale}/…; other projects: staging/{project}/{locale}/… */
export function stagingChangelogPath(project: string, code: string): string {
  if (project === "comfyui") {
    return `${STAGING_ROOT}/${code}/changelog/index.mdx`;
  }
  return `${STAGING_ROOT}/${project}/${code}/changelog/index.mdx`;
}

export function listProjectIds(config: CmsConfig): string[] {
  return (config.projects ?? [{ id: config.default_project }]).map((p) => p.id);
}

export function getProjectConfig(config: CmsConfig, projectId: string): CmsProjectConfig {
  const projects = config.projects ?? [{ id: config.default_project }];
  const found = projects.find((p) => p.id === projectId);
  if (!found) {
    throw new Error(`Unknown project "${projectId}". Known: ${listProjectIds(config).join(", ")}`);
  }
  return found;
}

export function projectLabel(config: CmsConfig, projectId: string): string {
  const p = getProjectConfig(config, projectId);
  return p.label ?? projectId;
}

export function projectDocsEn(config: CmsConfig, projectId: string): string {
  const p = getProjectConfig(config, projectId);
  return p.docs_en ?? config.docs_en;
}

export function projectMinVersion(config: CmsConfig, projectId: string): string {
  const p = getProjectConfig(config, projectId);
  return p.min_version ?? config.min_version;
}

export function projectLocales(config: CmsConfig, projectId: string): LocaleConfig[] {
  return config.locales.map((l) => ({
    ...l,
    changelog: stagingChangelogPath(projectId, l.code),
  }));
}

/** Project-scoped view of cms-config (staging paths, docs source, min version). */
export function configForProject(config: CmsConfig, projectId: string): CmsConfig {
  return {
    ...config,
    docs_en: projectDocsEn(config, projectId),
    min_version: projectMinVersion(config, projectId),
    locales: projectLocales(config, projectId),
  };
}

export async function loadCmsConfig(): Promise<CmsConfig> {
  const raw = await readFile(join(import.meta.dir, "cms-config.json"), "utf-8");
  const config = JSON.parse(raw) as CmsConfig;
  for (const locale of config.locales) {
    if (!locale.changelog) {
      locale.changelog = stagingChangelogPath(config.default_project, locale.code);
    }
    if (locale.source === "translate" && !locale.name) {
      throw new Error(`Locale ${locale.code} requires "name" in cms-config.json`);
    }
  }
  if (!config.docs_en) {
    config.docs_en = "changelog/index.mdx";
  }
  return config;
}

export function translateLocales(config: CmsConfig): LocaleConfig[] {
  return config.locales.filter((l) => l.code !== "en" && l.source === "translate");
}

export function englishStagingLocale(config: CmsConfig): LocaleConfig {
  const en = config.locales.find((l) => l.code === "en");
  if (!en?.changelog) throw new Error("Missing en locale in cms-config.json");
  return en;
}
