import { describe, expect, test } from "bun:test";
import { loadCatalog, render } from "./gen-router-pricing.ts";

describe("Router pricing catalog", () => {
  const catalog = loadCatalog();
  const page = render();

  test("covers every generated Router model ID", () => {
    expect(catalog.length).toBe(212);
    expect(page).toContain("openai/gpt-5.6-terra");
    expect(page).toContain("vertexai/gemini-3-pro-image");
    expect(page).toContain("kling/kling-3.0-turbo");
    expect(page).not.toContain("| `anthropic/claude-opus-4-7` | Published | [OpenRouter]");
  });

  test("includes the official credit tables", () => {
    expect(page).toContain("## Official Comfy credit tables");
    expect(page).toContain("Nano Banana Pro");
    expect(page).toContain("gpt-image-2");
    expect(page).toContain("23.63");
  });

  test("has valid frontmatter and no em dash prose", () => {
    const description = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(page).not.toContain("—");
  });
});
