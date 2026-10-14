import { readFile } from "fs/promises";
import { join } from "path";

export const ROOT = join(import.meta.dir, "../../..");

export function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export async function loadEnvLocal(): Promise<void> {
  try {
    const content = await readFile(join(ROOT, ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
}
