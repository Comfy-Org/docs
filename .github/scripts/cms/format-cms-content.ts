/**
 * Format staging changelog body for Strapi CMS (no further stripping).
 */

const LEGACY_HEADERS = ["ComfyUI", "Cloud"];

export function formatCmsReleaseContent(projectLabel: string, version: string, body: string): string {
  const trimmed = body.trim();
  const prefix = `# ${projectLabel} v${version}`;
  if (trimmed.startsWith(prefix)) return trimmed;
  for (const label of LEGACY_HEADERS) {
    if (trimmed.startsWith(`# ${label} v${version}`)) return trimmed;
  }
  return `${prefix}\n\n${trimmed}`;
}
