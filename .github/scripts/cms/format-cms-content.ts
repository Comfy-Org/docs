/**
 * Format staging changelog body for Strapi CMS (no further stripping).
 */

const LEGACY_HEADERS = ["ComfyUI", "Cloud"];

/** CMS popup uses bold section labels, not ## headings (matches published release-notes style). */
export function normalizeCmsSectionHeadings(body: string): string {
  return body.replace(/^##\s+(.+)$/gm, "**$1**");
}

export function formatCmsReleaseContent(projectLabel: string, version: string, body: string): string {
  const trimmed = normalizeCmsSectionHeadings(body.trim());
  const prefix = `# ${projectLabel} v${version}`;
  if (trimmed.startsWith(prefix)) return trimmed;
  for (const label of LEGACY_HEADERS) {
    if (trimmed.startsWith(`# ${label} v${version}`)) return trimmed;
  }
  return `${prefix}\n\n${trimmed}`;
}
