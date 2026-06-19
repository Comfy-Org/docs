import { meetsMinVersion } from "./changelog-parse.ts";
import type { CmsConfig } from "./cms-config.ts";
import type { StrapiDocument } from "./strapi-client.ts";

export function versionFromContent(content: unknown): string {
  if (typeof content !== "string") return "";
  const m = content.match(/^#\s*(?:ComfyUI|Cloud)\s+v(\d+\.\d+(?:\.\d+)?)/im);
  return m?.[1] ?? "";
}

export function docVersion(doc: StrapiDocument, config: CmsConfig): string {
  const versionField = String(doc[config.version_field] ?? "").trim();
  if (versionField) return versionField;
  return versionFromContent(doc[config.content_field]);
}

export function docProject(doc: StrapiDocument, config: CmsConfig): string {
  return String(doc[config.project_field] ?? config.default_project).trim();
}

export function isValidCmsVersion(version: string, minVersion: string): boolean {
  return Boolean(version) && meetsMinVersion(version, minVersion);
}
