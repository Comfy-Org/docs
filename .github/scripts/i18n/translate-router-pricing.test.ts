import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "../snippets/gen-router-pricing.ts";
import { REPO_ROOT } from "./i18n-config.mjs";
import { keepLinksInsideLocale, localizedPageContent } from "./translate-router-pricing.ts";

const PAGE = "development/comfy-router/pricing.mdx";
const LOCALES = ["ja", "zh", "ko"] as const;
const links = (content: string) => [...content.matchAll(/\]\((\/[^)]+)\)/g)].map((match) => match[1]);
const technicalKeys = (content: string) => [...content.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const providers = (content: string) => [...content.matchAll(/<Accordion title="([^"]+)"/g)].map((match) => match[1]);
const numericRates = (content: string) => {
  const bothCurrencies = content.replace(
    /<PricingValue credits="([^"]*)" usd="([^"]*)" \/>/g,
    "$1<br />$2",
  );
  const rows: string[][] = [];
  let priceColumns: number[] = [];
  for (const line of bothCurrencies.split("\n")) {
    if (!line.startsWith("|")) { priceColumns = []; continue; }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (/^(Name|名前|名称|이름)$/.test(cells[0])) {
      priceColumns = cells.flatMap((cell, index) => /credits|usd|クレジット|积分|크레딧/i.test(cell) ? [index] : []);
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    // Parse only price columns. A price can be bare under a token-unit header,
    // or inline after a media/cache label, with its unit in the cell.
    rows.push(priceColumns.flatMap((index) => [...cells[index].matchAll(/(?:^|<br\s*\/?>)(?:[^<>:]+:\s*)?\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*\/|(?=<br\s*\/?>)|$)/g)].map((match) => match[1].replaceAll(",", ""))));
  }
  return rows;
};

test("numeric parity includes bare and inline prices without model, option, or unit numbers", () => {
  const fixture = `| Name | Model ID | Option | Input credits / 1M tokens | Output credits / 1M tokens |
| --- | --- | --- | ---: | ---: |
| GPT 5.6 | \`openai/gpt-5.6\` | 1080p | 52.75<br />Audio: 105.5<br />Write 5m: 131.875 | 316.5 |

| Name | Model ID | Credits |
| --- | --- | ---: |
| Model 30 | \`provider/model-30\` | 4.25 / 30 frames (rounded up) |`;
  expect(numericRates(fixture)).toEqual([["52.75", "105.5", "131.875", "316.5"], ["4.25"]]);
  expect(numericRates(fixture.replace("Audio: 105.5", "音声: 105.6"))).not.toEqual(numericRates(fixture));
});

for (const locale of LOCALES) {
  test(`${locale} pricing preserves rate numbers, model IDs, and link targets`, () => {
    const english = render();
    const localized = localizedPageContent(english, locale);
    expect(numericRates(localized)).toEqual(numericRates(english));
    expect(technicalKeys(localized)).toEqual(technicalKeys(english));
    expect(providers(localized)).toEqual(providers(english));

    // The same links in the same order: a translated target keeps its exact
    // path, an untranslated one stays inside the locale (nearest localized
    // page) instead of falling back to the English page.
    const localizedLinks = links(localized);
    const englishLinks = links(english);
    expect(localizedLinks.length).toEqual(englishLinks.length);
    localizedLinks.forEach((link, index) => {
      if (link.replace(/^\/(ja|zh|ko)\//, "/") === englishLinks[index]) return;
      expect(link.startsWith(`/${locale}/`)).toBe(true);
    });

    expect(localized).not.toMatch(/Metronome|Pricing source|Extra conditions|Serving provider/);
    expect(localized).toContain("translationSourceHash:");
    expect(localizedPageContent(english, locale)).toBe(localized);
  });

  test(`${locale} pricing keeps every link inside the locale and points at an existing page`, () => {
    for (const link of links(localizedPageContent(render(), locale))) {
      const path = link.split(/[?#]/)[0];
      if (!path.startsWith("/") || path.startsWith("/images/") || path.startsWith("/snippets/")) continue;

      // A localized page must not send readers to the English page just because
      // the exact target has not been translated yet.
      expect(path.startsWith(`/${locale}/`)).toBe(true);

      // Only real pages count, same contract as nearestExistingLocaleTarget.
      const localized = path.slice(`/${locale}/`.length);
      expect([
        join(REPO_ROOT, locale, `${localized}.mdx`),
        join(REPO_ROOT, locale, localized, "index.mdx"),
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

test("keepLinksInsideLocale keeps an untranslated target inside the locale", () => {
  const untranslated =
    "See [Ideogram 4.5](/ja/development/comfy-router/models/ideogram/ideogram-4-5/code).";
  const kept = keepLinksInsideLocale(untranslated, "ja");
  expect(kept).toContain("](/ja/development/comfy-router/models)");
  expect(kept).not.toContain("/development/comfy-router/models/ideogram");
});

test("keepLinksInsideLocale keeps the exact target and fragment when it exists", () => {
  const translated =
    "See [Ideogram V4](/ja/development/comfy-router/models/ideogram/ideogram-v4/code#examples).";
  expect(keepLinksInsideLocale(translated, "ja")).toBe(translated);
});

test("keepLinksInsideLocale drops the fragment when it falls back to an ancestor page", () => {
  const fallback =
    "See [Ideogram 4.5](/ja/development/comfy-router/models/ideogram/ideogram-4-5/code#examples).";
  const kept = keepLinksInsideLocale(fallback, "ja");
  expect(kept).toContain("](/ja/development/comfy-router/models)");
  expect(kept).not.toContain("#examples");
});

test("keepLinksInsideLocale falls back to English only when the locale has no page on that path", () => {
  const nowhere = "See [Nowhere](/ja/no-such-area/deeper/code).";
  expect(keepLinksInsideLocale(nowhere, "ja")).toContain("](/no-such-area/deeper/code)");
});
