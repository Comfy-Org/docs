import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOpaqueBody,
  loadModelSchema,
  modalityCell,
  modalityLine,
  modelPageRedirects,
  modelsNav,
  opaqueOutputExample,
  outputContent,
  outputSchemaFields,
  providerCoverage,
  providerRelationRows,
  readModalities,
  readRelations,
  renderDerivedPage,
  renderDocsJson,
  renderModelsIndex,
  renderProvidersPage,
  servingProvidersSection,
} from "./gen-code-pages.ts";

const ROOT = join(import.meta.dir, "../../..");

/**
 * A miniature of `ElevenLabsAudioResult`: the component declares
 * `x-comfy-router-output-media-type` in cloud, so the served 200 is keyed by a wildcard
 * media type rather than `application/json` and its schema is an opaque binary body.
 */
const BINARY_200 = {
  "*/*": {
    schema: {
      type: "string",
      format: "binary",
      description: "Raw audio bytes. The encoding follows the requested output_format.",
      example: "(binary audio bytes)",
    },
  },
};

const JSON_200 = { "application/json": { schema: { type: "object", properties: { id: { type: "string" } } } } };

const modelSchema = (content: Record<string, any>) => {
  const res = outputContent(content)!;
  return { authored: true, output: res.schema, outputExample: res.example ?? res.schema?.example, outputMediaType: res.mediaType, components: {} };
};

describe("outputContent: the 200's media type", () => {
  test("prefers application/json when the response offers it", () => {
    expect(outputContent({ ...JSON_200, ...BINARY_200 })!.mediaType).toBe("application/json");
  });

  test("falls back to the one non-JSON entry instead of reporting no schema", () => {
    const res = outputContent(BINARY_200)!;
    expect(res.mediaType).toBe("*/*");
    expect(res.schema.format).toBe("binary");
  });

  test("a 200 with no content at all still has no schema", () => {
    expect(outputContent(undefined)).toBeUndefined();
    expect(outputContent({})).toBeUndefined();
  });
});

describe("loadModelSchema: the ElevenLabs binary models", () => {
  for (const model of ["elevenlabs/eleven_v3", "elevenlabs/eleven_sfx_v2"]) {
    test(`${model} reads the schema published under its own media type`, () => {
      const doc = JSON.parse(readFileSync(join(ROOT, "router-schemas", `${model}.json`), "utf8"));
      const content = doc.paths[`/v2/models/${model}`].post.responses["200"].content;
      const s = loadModelSchema(model)!;
      // Wiring: whatever key the synced document uses is the one the page renders from.
      expect(Object.keys(content)).toContain(s.outputMediaType);
      expect(s.output).toEqual(content[s.outputMediaType!].schema);
      // The regression this covers. If a later sync republishes these under
      // `application/json`, this assertion is the intended signal to re-read the pages.
      expect(s.outputMediaType).toBe("*/*");
      expect(s.output.format).toBe("binary");
      expect(s.outputExample).toBe("(binary audio bytes)");
    });
  }

  test("a JSON model keeps reporting application/json", () => {
    const s = loadModelSchema("bria/image-edit-erase")!;
    expect(s.outputMediaType).toBe("application/json");
  });
});

describe("isOpaqueBody", () => {
  test("a scalar body is opaque", () => {
    expect(isOpaqueBody(BINARY_200["*/*"].schema, {})).toBe(true);
  });

  test("an object, an open object, an array and a union stay on the normal field walk", () => {
    expect(isOpaqueBody({ type: "object", properties: { a: {} } }, {})).toBe(false);
    expect(isOpaqueBody({ type: "object" }, {})).toBe(false);
    expect(isOpaqueBody({ type: "array", items: { type: "object" } }, {})).toBe(false);
    expect(isOpaqueBody({ oneOf: [{ type: "string" }, { type: "object" }] }, {})).toBe(false);
    expect(isOpaqueBody({ $ref: "#/components/schemas/R" }, { R: { type: "object", properties: { a: {} } } })).toBe(false);
  });

  test("an absent schema is not opaque, so the placeholder still wins", () => {
    expect(isOpaqueBody(undefined, {})).toBe(false);
  });
});

describe("rendering an opaque 200", () => {
  test("one ResponseField naming the media type, carrying the schema's own prose", () => {
    const out = outputSchemaFields(modelSchema(BINARY_200));
    expect(out).toBe(
      '<ResponseField name="*/*" type="string (binary)">\n  Raw audio bytes. The encoding follows the requested output_format.\n</ResponseField>'
    );
    expect(out).not.toContain("does not declare named properties");
  });

  test("a JSON 200 is untouched: still one field per named property", () => {
    expect(outputSchemaFields(modelSchema(JSON_200))).toBe('<ResponseField name="id" type="string">\n   \n</ResponseField>');
  });

  test("the Examples output is prose, never a JSON fence around the placeholder string", () => {
    const prose = opaqueOutputExample(modelSchema(BINARY_200));
    expect(prose).toContain("Binary body");
    expect(prose).toContain("`*/*`");
    expect(prose).not.toContain("```");
    expect(prose).not.toContain("(binary audio bytes)");
  });
});

describe("the generated pages the Router serves as binary", () => {
  for (const page of ["eleven-v3", "eleven-sfx-v2"]) {
    test(`${page} documents the binary body instead of claiming none is published`, () => {
      const mdx = readFileSync(join(ROOT, "development/comfy-router/models/elevenlabs", page, "code.mdx"), "utf8");
      expect(mdx).not.toContain("Router does not publish an output schema");
      expect(mdx).toContain('<ResponseField name="*/*" type="string (binary)">');
      expect(mdx).toContain("Binary body: raw bytes rather than a JSON document");
    });
  }
});

describe("modelPageRedirects: a pruned page keeps answering on its URL", () => {
  const INDEX = "/development/comfy-router/models";
  const retired = "development/comfy-router/models/kling/kling-v1/code";
  const retiredToo = "development/comfy-router/models/byteplus/seedream-3-0-t2i-250415/code";
  const alive = "development/comfy-router/models/kling/kling-v3/code";
  const handWritten = { source: "/comfy-router-quickstart", destination: "/development/comfy-router/quickstart" };

  test("every pruned page gets a redirect to the catalog landing page, appended in a stable order", () => {
    const out = modelPageRedirects([handWritten], [alive], [retired, retiredToo]);
    expect(out).toEqual([
      handWritten,
      { source: `/${retiredToo}`, destination: INDEX },
      { source: `/${retired}`, destination: INDEX },
    ]);
  });

  test("the source is the form the redirect check compares against: leading slash, no .mdx", () => {
    const [r] = modelPageRedirects([], [], [retired]);
    expect(r.source).toBe("/development/comfy-router/models/kling/kling-v1/code");
    expect(r.source.replace(/^\//, "")).toBe(retired);
  });

  test("a redirect someone already wrote for the pruned page is kept as written, not duplicated", () => {
    const better = { source: `/${retired}`, destination: `/${alive}`, permanent: true };
    const out = modelPageRedirects([better], [alive], [retired]);
    expect(out).toEqual([better]);
  });

  test("a model that comes back loses the redirect that would shadow its page", () => {
    const stale = { source: `/${alive}`, destination: INDEX };
    expect(modelPageRedirects([handWritten, stale], [alive], [])).toEqual([handWritten]);
  });

  test("a page that is both live and pruned is live: no redirect is written over it", () => {
    expect(modelPageRedirects([], [alive], [alive])).toEqual([]);
  });

  test("with nothing pruned and nothing stale, the redirects are returned unchanged", () => {
    const existing = [handWritten, { source: `/${retired}`, destination: INDEX }];
    expect(modelPageRedirects(existing, [alive], [])).toEqual(existing);
  });
});

describe("generated model pages omit Swift examples", () => {
  const page = readFileSync(join(ROOT, "development/comfy-router/models/black-forest-labs/flux-1-kontext/code.mdx"), "utf8");

  test("every delivery mode has Python, TypeScript, and cURL tabs", () => {
    const python = [...page.matchAll(/^```python Python\n/gm)].length;
    const typescript = [...page.matchAll(/^```typescript TypeScript\n/gm)].length;
    const curl = [...page.matchAll(/^```bash cURL\n/gm)].length;

    expect(python).toBeGreaterThan(0);
    expect(typescript).toBe(python);
    expect(curl).toBe(python);
  });

  test("the page has no Swift snippets or setup copy", () => {
    expect(page).not.toContain("Swift");
    expect(page).not.toContain("ComfySwiftSDK");
    expect(page).not.toContain("```swift");
  });

  test("Python examples use the async SDK for both delivery modes", () => {
    expect(page).toContain("from comfy_sdk import AsyncComfy");
    expect(page).toContain("async with AsyncComfy() as client:");
    expect(page).toContain("await client.models.run(");
    expect(page).toContain("await client.models.submit(");
    expect(page).toContain("async for update in handle.iter_events():");
    expect(page).toContain("result = await handle.get()");
    expect(page).toContain("asyncio.run(main())");
    expect(page).not.toContain("from comfy_sdk import Comfy");
  });
});

describe("renderDocsJson: the redirect lands in the real docs.json", () => {
  // A page no provider will ever ship. The real `docs.json` already carries a
  // redirect for every model the generator has retired so far, so a real
  // retired id would find its redirect already present and append nothing.
  const retired = "development/comfy-router/models/test-provider/never-shipped/code";
  const before = JSON.parse(readFileSync(join(ROOT, "docs.json"), "utf8"));
  const nav = modelsNav([{ model: "kling/kling-v3", page: "development/comfy-router/models/kling/kling-v3/code" }]);

  test("a pruned page appends exactly one redirect and leaves the others alone", () => {
    expect(before.redirects.some((r: { source: string }) => r.source === `/${retired}`)).toBe(false);
    const after = JSON.parse(renderDocsJson(nav, { live: [], pruned: [retired] }));
    expect(after.redirects.length).toBe(before.redirects.length + 1);
    expect(after.redirects.slice(0, -1)).toEqual(before.redirects);
    expect(after.redirects.at(-1)).toEqual({ source: `/${retired}`, destination: "/development/comfy-router/models" });
  });

  test("nothing pruned means the redirects are byte-for-byte what was there", () => {
    const after = JSON.parse(renderDocsJson(nav, { live: [], pruned: [] }));
    expect(after.redirects).toEqual(before.redirects);
    // `redirects` stays the last key, so the file's shape does not churn.
    expect(Object.keys(after).at(-1)).toBe("redirects");
  });
});

// ---------------------------------------------------------------------------
// Alt-provider legs: `x-comfy-router-alt-providers` on a native document,
// `x-comfy-router-alias-of` on the alias document the exporter publishes for it.
// Fixtures are inline: `router-schemas/` is sync-owned, so a fixture document
// cannot live there, and none of the functions below reads the disk.
// ---------------------------------------------------------------------------

const NATIVE = "vertexai/gemini-3-pro-image";
const NATIVE_PAGE = "development/comfy-router/models/google/nano-banana-pro/code";
const FAL_LEG = { provider: "fal", model_id: "fal/fal-nano-banana-pro" };
const WAVESPEED_LEG = { provider: "wavespeed", model_id: "wavespeed/wavespeed-nano-banana-pro" };

describe("readRelations: the two extensions BE-15959 publishes", () => {
  test("a native document lists its legs, sorted by provider so the page does not churn", () => {
    const r = readRelations(NATIVE, { paths: {}, "x-comfy-router-alt-providers": [WAVESPEED_LEG, FAL_LEG] });
    expect(r.alias).toBeUndefined();
    expect(r.altProviders).toEqual([FAL_LEG, WAVESPEED_LEG]);
  });

  test("an alias document names its native target and the provider serving it", () => {
    const r = readRelations("fal/fal-nano-banana-pro", {
      paths: {},
      "x-comfy-router-alias-of": NATIVE,
      "x-comfy-router-alias-provider": "fal",
    });
    expect(r).toEqual({ altProviders: [], alias: { aliasOf: NATIVE, provider: "fal" } });
  });

  test("an alias with no `alias-provider` falls back to its own namespace", () => {
    const r = readRelations("fal/fal-nano-banana-pro", { paths: {}, "x-comfy-router-alias-of": NATIVE });
    expect(r.alias).toEqual({ aliasOf: NATIVE, provider: "fal" });
  });

  test("a document from before the extensions existed has no relationship at all", () => {
    expect(readRelations(NATIVE, { paths: {} })).toEqual({ altProviders: [] });
  });

  test("malformed values are dropped rather than rendered as `undefined`", () => {
    const r = readRelations(NATIVE, {
      paths: {},
      "x-comfy-router-alt-providers": [
        null,
        "fal",
        { provider: "fal" },
        { model_id: "fal/x" },
        { provider: "", model_id: "fal/x" },
        { provider: "fal", model_id: "no-slash" },
        FAL_LEG,
        { provider: "fal", model_id: "fal/duplicate-provider" },
      ],
    });
    expect(r.altProviders).toEqual([FAL_LEG]);
  });

  test("a non-array `alt-providers` is ignored, not spread", () => {
    expect(readRelations(NATIVE, { paths: {}, "x-comfy-router-alt-providers": { provider: "fal" } }).altProviders).toEqual([]);
  });

  // A self-reference would redirect a page to itself, or claim a model is served
  // by an alternate provider that is the page the reader is already on.
  test("a document that names itself is neither an alias nor its own leg", () => {
    expect(readRelations(NATIVE, { paths: {}, "x-comfy-router-alias-of": NATIVE }).alias).toBeUndefined();
    expect(readRelations(NATIVE, { paths: {}, "x-comfy-router-alt-providers": [{ provider: "fal", model_id: NATIVE }] }).altProviders).toEqual([]);
  });

  test("an `alias-of` that is not a `provider/model` id is ignored", () => {
    expect(readRelations(NATIVE, { paths: {}, "x-comfy-router-alias-of": "gemini-3-pro-image" }).alias).toBeUndefined();
    expect(readRelations(NATIVE, { paths: {}, "x-comfy-router-alias-of": 42 as unknown as string }).alias).toBeUndefined();
  });
});

describe("servingProvidersSection: the block on the native model's page", () => {
  test("a model with two legs lists Comfy first, then one row per leg", () => {
    const out = servingProvidersSection([{ model: NATIVE, legs: [FAL_LEG, WAVESPEED_LEG] }]);
    expect(out).toContain("## Serving providers");
    expect(out).toContain("- **Comfy** (default): `POST https://api.comfy.org/v2/models/vertexai/gemini-3-pro-image`");
    expect(out).toContain(
      "- **fal**, as `fal/fal-nano-banana-pro`: `POST https://api.comfy.org/v2/models/vertexai/gemini-3-pro-image?model_provider=fal`"
    );
    expect(out).toContain(
      "- **WaveSpeed**, as `wavespeed/wavespeed-nano-banana-pro`: `POST https://api.comfy.org/v2/models/vertexai/gemini-3-pro-image?model_provider=wavespeed`"
    );
    // Comfy is first, and the call example is the NATIVE endpoint throughout.
    expect(out.indexOf("**Comfy**")).toBeLessThan(out.indexOf("**fal**"));
    expect(out).not.toContain("/v2/models/fal/fal-nano-banana-pro");
  });

  test("it says what `strict_mode` defaults to and links the three routing parameters", () => {
    const out = servingProvidersSection([{ model: NATIVE, legs: [FAL_LEG] }]);
    expect(out).toContain("`strict_mode` defaults to false");
    expect(out).toContain(
      "[`model_provider`, `strict_mode` and `fallback_provider`](/development/comfy-router/reference#post-v2modelsprovidermodel)"
    );
    expect(out).toContain("[Serving providers](/development/comfy-router/providers)");
  });

  test("a native model with no legs renders no section at all", () => {
    expect(servingProvidersSection([{ model: NATIVE, legs: [] }])).toBe("");
    expect(servingProvidersSection([])).toBe("");
  });

  test("a curated page covering several models heads each one, and skips the ones with no leg", () => {
    const out = servingProvidersSection([
      { model: NATIVE, legs: [FAL_LEG] },
      { model: "vertexai/gemini-3.1-flash-image", legs: [{ provider: "fal", model_id: "fal/fal-nano-banana-2" }] },
      { model: "vertexai/gemini-2-5-flash-image", legs: [] },
    ]);
    expect(out).toContain("**`vertexai/gemini-3-pro-image`**");
    expect(out).toContain("**`vertexai/gemini-3.1-flash-image`**");
    expect(out).not.toContain("gemini-2-5-flash-image");
  });

  test("a single-model page carries no redundant model heading above its rows", () => {
    expect(servingProvidersSection([{ model: NATIVE, legs: [FAL_LEG] }])).not.toContain(`**\`${NATIVE}\`**`);
  });

  // The repo's prose rule (AGENTS.md): em dashes read as generic AI copy.
  test("the generated prose carries no em dash", () => {
    expect(servingProvidersSection([{ model: NATIVE, legs: [FAL_LEG, WAVESPEED_LEG] }])).not.toContain("—");
  });
});

describe("the Providers page", () => {
  const rows = [
    { provider: "wavespeed", model: NATIVE, aliasId: WAVESPEED_LEG.model_id, page: NATIVE_PAGE, title: "Nano Banana Pro" },
    { provider: "fal", model: NATIVE, aliasId: FAL_LEG.model_id, page: NATIVE_PAGE, title: "Nano Banana Pro" },
    { provider: "fal", model: "openai/gpt-image-2", aliasId: "fal/fal-gpt-image-2", page: "development/comfy-router/models/openai/gpt-image-2/code", title: "GPT Image 2" },
  ];

  test("providers come out alphabetically by label, each with its own models", () => {
    const grouped = providerCoverage(rows);
    expect(grouped.map((g) => g.label)).toEqual(["fal", "WaveSpeed"]);
    // Rows sort by the page they link, as the catalog index does.
    expect(grouped[0].rows.map((r) => r.aliasId)).toEqual(["fal/fal-nano-banana-pro", "fal/fal-gpt-image-2"]);
  });

  test("models are rows and providers are columns", () => {
    const page = renderProvidersPage(rows);
    expect(page).toContain("| Model / provider | **Comfy (default)** | **fal** | **WaveSpeed** |");
    expect(page).toContain(`| [Nano Banana Pro](/${NATIVE_PAGE}) | ✓ | ✓ | ✓ |`);
    expect(page).not.toContain(FAL_LEG.model_id);
    expect(page).not.toContain(WAVESPEED_LEG.model_id);
    expect(page).not.toContain("## fal");
  });

  test("Comfy is listed first, as the default that covers the whole catalog", () => {
    const page = renderProvidersPage(rows);
    expect(page).toContain("**Comfy (default)**");
  });

  test("its frontmatter follows the repo's title/description rules", () => {
    const page = renderProvidersPage(rows);
    const description = page.match(/^description: "(.+)"$/m)![1];
    expect(page).toContain('title: "Comfy Router serving providers"');
    expect(page).toContain('sidebarTitle: "Serving providers"');
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(page).not.toContain("—");
  });
});

describe("modelsNav: the Providers page sits beside the catalog index", () => {
  const live = [{ model: "kling/kling-v3", page: "development/comfy-router/models/kling/kling-v3/code" }];

  test("with legs, it is the second entry of the Models group, ahead of every provider sub-group", () => {
    const pages = modelsNav(live, true).pages;
    expect(pages.slice(0, 2)).toEqual([
      "development/comfy-router/models",
      "development/comfy-router/providers",
    ]);
    expect(pages[2]).toEqual({
      group: "All Models",
      pages: [{
        group: "Kling",
        pages: ["development/comfy-router/models/kling/kling-v3/code"],
      }],
    });
  });

  test("with no legs the nav is exactly what it is today", () => {
    expect(modelsNav(live, false)).toEqual(modelsNav(live));
    expect(JSON.stringify(modelsNav(live))).not.toContain("providers");
  });
});

describe("modelPageRedirects: an alias page redirects to its native page", () => {
  const aliasPage = "development/comfy-router/models/fal/fal-nano-banana-pro/code";

  test("the pruned alias page points at the native model's page, not the catalog index", () => {
    const [r] = modelPageRedirects([], [NATIVE_PAGE], [{ page: aliasPage, destination: `/${NATIVE_PAGE}` }]);
    expect(r).toEqual({ source: `/${aliasPage}`, destination: `/${NATIVE_PAGE}` });
  });

  test("per-page and default destinations mix in one run, still sorted by source", () => {
    const retired = "development/comfy-router/models/kling/kling-v1/code";
    expect(modelPageRedirects([], [], [{ page: aliasPage, destination: `/${NATIVE_PAGE}` }, retired])).toEqual([
      { source: `/${aliasPage}`, destination: `/${NATIVE_PAGE}` },
      { source: `/${retired}`, destination: "/development/comfy-router/models" },
    ]);
  });

  test("a redirect already written for that URL still wins over the generated one", () => {
    const existing = { source: `/${aliasPage}`, destination: "/somewhere-else", permanent: true };
    expect(modelPageRedirects([existing], [], [{ page: aliasPage, destination: `/${NATIVE_PAGE}` }])).toEqual([existing]);
  });

  test("two entries for one URL resolve to one redirect, independent of order", () => {
    const dupes = [
      { page: aliasPage, destination: `/${NATIVE_PAGE}` },
      { page: aliasPage, destination: "/development/comfy-router/models" },
    ];
    expect(modelPageRedirects([], [], dupes)).toEqual([{ source: `/${aliasPage}`, destination: `/${NATIVE_PAGE}` }]);
  });

  test("the alias destination wins even when the catalog fallback is scanned first", () => {
    const dupes = [aliasPage, { page: aliasPage, destination: `/${NATIVE_PAGE}` }];
    expect(modelPageRedirects([], [], dupes)).toEqual([{ source: `/${aliasPage}`, destination: `/${NATIVE_PAGE}` }]);
  });
});

describe("resolving the alt-provider relationship to Providers rows", () => {
  const pages = new Map([[NATIVE, { page: NATIVE_PAGE, title: "Nano Banana Pro" }]]);

  test("a native document's legs each become one row against the native page", () => {
    const { rows, problems } = providerRelationRows(new Map([[NATIVE, [FAL_LEG, WAVESPEED_LEG]]]), [], pages);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { provider: "fal", model: NATIVE, aliasId: FAL_LEG.model_id, page: NATIVE_PAGE, title: "Nano Banana Pro" },
      { provider: "wavespeed", model: NATIVE, aliasId: WAVESPEED_LEG.model_id, page: NATIVE_PAGE, title: "Nano Banana Pro" },
    ]);
  });

  test("a native leg and the matching alias document are one row, not two", () => {
    const aliasDocs = [{ model: FAL_LEG.model_id, aliasOf: NATIVE, provider: "fal" }];
    const { rows, problems } = providerRelationRows(new Map([[NATIVE, [FAL_LEG]]]), aliasDocs, pages);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  test("an alias document alone still earns a row, for a native list that has not caught up", () => {
    const aliasDocs = [{ model: FAL_LEG.model_id, aliasOf: NATIVE, provider: "fal" }];
    const { rows } = providerRelationRows(new Map(), aliasDocs, pages);
    expect(rows).toEqual([{ provider: "fal", model: NATIVE, aliasId: FAL_LEG.model_id, page: NATIVE_PAGE, title: "Nano Banana Pro" }]);
  });

  test("the two sides disagreeing on one provider's alias id is a reported conflict", () => {
    const aliasDocs = [{ model: "fal/fal-nano-banana-pro-v2", aliasOf: NATIVE, provider: "fal" }];
    const { rows, problems } = providerRelationRows(new Map([[NATIVE, [FAL_LEG]]]), aliasDocs, pages);
    // The native document's list is canonical, so its alias id is the row that stands.
    expect(rows.map((r) => r.aliasId)).toEqual([FAL_LEG.model_id]);
    expect(problems).toEqual([
      `${NATIVE}: provider \`fal\` is aliased as both \`${FAL_LEG.model_id}\` and \`fal/fal-nano-banana-pro-v2\`; the native model's alt-providers list is canonical`,
    ]);
  });

  // A row whose link would 404 is worse than no row, but the relation is still
  // checked: the duplicate test runs before the page lookup, so a spec bug is
  // reported even while the model it serves is undocumented here.
  test("a leg on an undocumented native model yields no row", () => {
    const { rows, problems } = providerRelationRows(new Map([["vertexai/not-here", [FAL_LEG]]]), [], new Map());
    expect(rows).toEqual([]);
    expect(problems).toEqual([]);
  });

  test("two alias documents claiming one provider conflict even with no native page", () => {
    const aliasDocs = [
      { model: "fal/fal-unsynced", aliasOf: "vertexai/not-here", provider: "fal" },
      { model: "fal/fal-unsynced-v2", aliasOf: "vertexai/not-here", provider: "fal" },
    ];
    const { rows, problems } = providerRelationRows(new Map(), aliasDocs, new Map());
    expect(rows).toEqual([]);
    expect(problems).toEqual([
      "vertexai/not-here: provider `fal` is aliased as both `fal/fal-unsynced` and `fal/fal-unsynced-v2`; the native model's alt-providers list is canonical",
    ]);
  });

  test("one provider serving two different native models is two rows, not a conflict", () => {
    const other = "openai/gpt-image-2";
    const otherPage = "development/comfy-router/models/openai/gpt-image-2/code";
    const { rows, problems } = providerRelationRows(
      new Map([
        [NATIVE, [FAL_LEG]],
        [other, [{ provider: "fal", model_id: "fal/fal-gpt-image-2" }]],
      ]),
      [],
      new Map([...pages, [other, { page: otherPage, title: "GPT Image 2" }]])
    );
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.model)).toEqual([NATIVE, other]);
  });

  test("the provider/model key cannot be forged by a punctuated model id", () => {
    // The two halves of the key are separated by NUL, which no slug can contain.
    const { problems } = providerRelationRows(
      new Map([
        ["a/b", [{ provider: "fal", model_id: "fal/one" }]],
        ["b", [{ provider: "fal/a", model_id: "fal/two" }]],
      ]),
      [],
      new Map()
    );
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Modalities: `x-comfy-router-input-modalities` / `-output-modalities` on the
// schema document root. Fixtures are inline for the same reason as above.
// ---------------------------------------------------------------------------

/** The minimax-h3 shape: text and image in, a video with its own soundtrack out. */
const WITH_MODALITIES = {
  paths: {},
  "x-comfy-router-input-modalities": ["text", "image"],
  "x-comfy-router-output-modalities": ["video", "audio"],
};
/** A document synced before the extensions existed. */
const WITHOUT_MODALITIES = { paths: {} };

const H3 = "minimax/minimax-h3";
const H3_PAGE = "development/comfy-router/models/minimax/minimax-h3/code";
const OLD = "minimax/minimax-old";
const OLD_PAGE = "development/comfy-router/models/minimax/minimax-old/code";

const indexPages = () => {
  const h3 = readModalities(WITH_MODALITIES);
  const old = readModalities(WITHOUT_MODALITIES);
  return [
    { model: H3, page: H3_PAGE, title: "MiniMax H3", input: h3.inputModalities, output: h3.outputModalities },
    { model: OLD, page: OLD_PAGE, title: "MiniMax Old", input: old.inputModalities, output: old.outputModalities },
    { model: "openai/gpt-image-2", page: "development/comfy-router/models/openai/gpt-image-2/code", title: "GPT Image 2", input: ["text", "image"], output: ["image"] },
  ];
};

describe("readModalities", () => {
  test("copies both lists through in the published order", () => {
    expect(readModalities(WITH_MODALITIES)).toEqual({ inputModalities: ["text", "image"], outputModalities: ["video", "audio"] });
  });

  test("a document that predates the extensions has neither", () => {
    expect(readModalities(WITHOUT_MODALITIES)).toEqual({ inputModalities: undefined, outputModalities: undefined });
  });

  test("a malformed or empty list is unknown, not rendered", () => {
    const bad = readModalities({ paths: {}, "x-comfy-router-input-modalities": "text" as unknown as string[], "x-comfy-router-output-modalities": [] });
    expect(bad).toEqual({ inputModalities: undefined, outputModalities: undefined });
  });
});

describe("modalityCell and modalityLine", () => {
  test("output joins secondaries onto the primary, input is a plain list", () => {
    expect(modalityCell(["video", "audio"], "output")).toBe("Video + Audio");
    expect(modalityCell(["text", "image"], "input")).toBe("Text, Image");
    expect(modalityCell(["3d"], "output")).toBe("3D");
  });

  test("an unknown list renders as an em dash", () => {
    expect(modalityCell(undefined, "input")).toBe("\u2014");
  });

  test("the page line needs both lists", () => {
    expect(modalityLine(["text", "image"], ["video", "audio"])).toBe("**Input:** Text, Image \u00b7 **Output:** Video + Audio");
    expect(modalityLine(["text"], undefined)).toBe("");
    expect(modalityLine(undefined, ["video"])).toBe("");
  });
});

describe("renderModelsIndex: modality columns and Find by output", () => {
  const index = renderModelsIndex(indexPages(), false);

  test("each provider section is a Model | ID | Input | Output table", () => {
    expect(index).toContain("## MiniMax\n\n| Model | ID | Input | Output |\n| --- | --- | --- | --- |\n");
    expect(index).toContain(`| [MiniMax H3](/${H3_PAGE}) | \`${H3}\` | Text, Image | Video + Audio |`);
  });

  test("a model with no published modalities shows the fallback in both cells", () => {
    expect(index).toContain(`| [MiniMax Old](/${OLD_PAGE}) | \`${OLD}\` | \u2014 | \u2014 |`);
  });

  test("a video+audio model is listed under both Video and Audio", () => {
    const accordion = (title: string) => index.match(new RegExp(`<Accordion title="${title}">([\\s\\S]*?)</Accordion>`))?.[1] ?? "";
    expect(accordion("Video \\(1\\)")).toContain(`\`${H3}\``);
    expect(accordion("Audio \\(1\\)")).toContain(`\`${H3}\``);
    expect(accordion("Image \\(1\\)")).toContain("`openai/gpt-image-2`");
    expect(accordion("Image \\(1\\)")).not.toContain(`\`${H3}\``);
  });

  test("the jump list sits above the provider groups, in the fixed modality order, skipping empty ones", () => {
    const find = index.indexOf("## Find by output");
    expect(find).toBeGreaterThan(-1);
    expect(find).toBeLessThan(index.indexOf("## MiniMax"));
    const titles = [...index.matchAll(/<Accordion title="([^"]+)">/g)].map((m) => m[1]);
    expect(titles).toEqual(["Video (1)", "Image (1)", "Audio (1)"]);
    expect(index).not.toContain(`[MiniMax Old](/${OLD_PAGE}): `);
  });

  test("with no model publishing an output list there is no empty jump section", () => {
    const bare = renderModelsIndex([{ model: OLD, page: OLD_PAGE, title: "MiniMax Old" }], false);
    expect(bare).not.toContain("Find by output");
    expect(bare).not.toContain("AccordionGroup");
  });

  test("the description names the modality columns", () => {
    expect(index).toContain('description: "Every model available through Comfy Router, grouped by provider, with the input and output modality of each."');
  });
});

describe("renderDerivedPage: the modality line under the intro", () => {
  const page = (doc: typeof WITH_MODALITIES | typeof WITHOUT_MODALITIES) =>
    renderDerivedPage(H3, { authored: false, components: {}, altProviders: [], ...readModalities(doc) });

  test("follows the intro line when both lists are published", () => {
    expect(page(WITH_MODALITIES)).toContain(
      `API Reference for \`${H3}\`, served by Comfy Router from MiniMax.\n\n**Input:** Text, Image \u00b7 **Output:** Video + Audio\n`
    );
  });

  test("is omitted entirely on a document that predates the extensions", () => {
    const text = page(WITHOUT_MODALITIES);
    expect(text).not.toContain("**Input:**");
    expect(text).not.toContain("**Output:**");
  });
});
