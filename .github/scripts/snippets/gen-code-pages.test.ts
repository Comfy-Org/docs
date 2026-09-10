import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("generated model pages", () => {
  test("an empty schema example is reference material, not a runnable call", () => {
    const page = read("development/comfy-router/models/minimax/minimax-h3/code.mdx");
    expect(page).toContain("## Request setup");
    expect(page).not.toContain('client.models.run(\n        "minimax/minimax-h3"');
    expect(page).not.toContain('-d "{}"');
  });



  test("Meshy pages render their model-specific preview and refine fields", () => {
    for (const version of ["5", "6", "7"]) {
      const page = read(`development/comfy-router/models/meshy/meshy-${version}/code.mdx`);
      expect(page).toContain("#### `preview` variant");
      expect(page).toContain('<ParamField body="prompt" type="string" required>');
      expect(page).toContain("#### `refine` variant");
      expect(page).toContain('<ParamField body="preview_task_id" type="string" required>');
    }
  });

  test("response examples use provider model IDs", () => {
    for (const [model, field, expected] of [
      ["anthropic/claude-opus-4-6", "model", "claude-opus-4-6"],
      ["anthropic/claude-sonnet-4-5-20250929", "model", "claude-sonnet-4-5-20250929"],
      ["google/gemini-3-1-flash-lite", "modelVersion", "gemini-3.1-flash-lite"],
      ["luma/photon-flash-1", "model", "photon-flash-1"],
      ["luma_2/uni-1-max", "model", "uni-1-max"],
      ["xai/grok-imagine-video-1-5-preview", "model", "grok-imagine-video-1.5"],
      ["byteplus/dreamina-seedance-2-0-mini", "model", "dreamina-seedance-2-0-mini-260615"],
      ["byteplus/seedream-5-0-pro-260628", "model", "dola-seedream-5-0-pro-260628"],
    ]) {
      const page = read(`development/comfy-router/models/${model}/code.mdx`);
      const examples = [...page.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
      const response = examples.find((e) => e[field] !== undefined);
      expect(response[field]).toBe(expected);
      if (model === "luma/photon-flash-1") expect(response.request.model).toBe(expected);
    }
  });

  test("curated pages show only their paired examples", () => {
    const page = read("development/comfy-router/models/google/nano-banana-pro/code.mdx");
    expect(page).toContain("a single red maple leaf on a plain white background");
    expect(page).not.toContain("Describe a robot learning to paint, in two sentences.");
    expect(page).not.toContain('"modelVersion": "gemini-2.5-flash-image"');
  });

});
