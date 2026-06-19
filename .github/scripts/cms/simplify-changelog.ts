/**
 * Rule-based simplification of docs changelog blocks → CMS release-note body.
 * Keeps top bullets; strips section headers; normalizes list markers.
 */

const MAX_BULLETS = 12;

export function simplifyChangelogBody(version: string, body: string): string {
  const lines = body.split("\n");
  const bullets: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("**") && line.endsWith("**")) continue;
    const bulletMatch = line.match(/^[*-]\s+(.+)$/);
    if (bulletMatch) {
      bullets.push(`- ${bulletMatch[1]!.trim()}`);
      if (bullets.length >= MAX_BULLETS) break;
    }
  }

  if (bullets.length === 0) {
    const plain = body
      .replace(/\*\*[^*]+\*\*/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    for (const p of plain) bullets.push(`- ${p}`);
  }

  return `# ComfyUI v${version}\n\n${bullets.join("\n")}`.trim();
}
