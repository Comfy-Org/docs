import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "../snippets/gen-router-pricing.ts";
import { REPO_ROOT } from "./i18n-config.mjs";
import { localizedPageContent } from "./translate-router-pricing.ts";

const PAGE = "development/comfy-router/pricing.mdx";
const LOCALES = ["ja", "zh", "ko"] as const;
const links = (content: string) => [...content.matchAll(/\]\((\/[^)]+)\)/g)].map((match) => match[1]);
const technicalKeys = (content: string) => [...content.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const providers = (content: string) => [...content.matchAll(/<Accordion title="([^"]+)"/g)].map((match) => match[1]);
const numericRates = (content: string) => content.split("\n")
  .filter((line) => line.startsWith("|"))
  .map((line) => line.split("|").slice(3, 5).map((cell) => cell.trim()).filter((cell) => /^\$?\d/.test(cell)));

for (const locale of LOCALES) {
  test(`${locale} pricing preserves rate numbers, model IDs, and link targets`, () => {
    const english = render();
    const localized = localizedPageContent(english, locale);
    expect(numericRates(localized)).toEqual(numericRates(english));
    expect(technicalKeys(localized)).toEqual(technicalKeys(english));
    expect(providers(localized)).toEqual(providers(english));
    expect(links(localized).map((link) => link.replace(/^\/(ja|zh|ko)\//, "/"))).toEqual(links(english));
    expect(localized).not.toMatch(/Metronome|Pricing source|Extra conditions|Serving provider/);
    expect(localized).toContain("translationSourceHash:");
    expect(localizedPageContent(english, locale)).toBe(localized);
  });

  test(`${locale} pricing uses localized links only where a target exists`, () => {
    for (const link of links(localizedPageContent(render(), locale))) {
      if (!link.startsWith(`/${locale}/`)) continue;
      const path = link.split(/[?#]/)[0].slice(1);
      expect([
        join(REPO_ROOT, `${path}.mdx`),
        join(REPO_ROOT, path, "index.mdx"),
        join(REPO_ROOT, path),
      ].some(existsSync)).toBe(true);
    }
  });
}

test("all pricing locales match deterministic generation including translation metadata", () => {
  const english = readFileSync(join(REPO_ROOT, PAGE), "utf8");
  expect(english).toBe(render());
  for (const locale of LOCALES) {
    expect(readFileSync(join(REPO_ROOT, locale, PAGE), "utf8")).toBe(
      localizedPageContent(english, locale),
    );
  }
});

test("stale English pricing cannot produce apparently fresh translations", () => {
  expect(() => localizedPageContent(`${render()}\nStale English content.`, "ja")).toThrow("English Router pricing page is stale");
});

test("pricing check validates all locales without writing them", () => {
  const files = [PAGE, ...LOCALES.map((locale) => `${locale}/${PAGE}`)].map((path) => join(REPO_ROOT, path));
  const before = files.map((path) => ({ content: readFileSync(path, "utf8"), modified: statSync(path).mtimeMs }));
  const result = Bun.spawnSync(["bun", ".github/scripts/i18n/translate-router-pricing.ts", "--check"], { cwd: REPO_ROOT });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(files.map((path) => ({ content: readFileSync(path, "utf8"), modified: statSync(path).mtimeMs }))).toEqual(before);
});
