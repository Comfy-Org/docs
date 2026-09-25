import { describe, expect, test } from "bun:test";

import {
  isApiOperationRow,
  localizeNavTree,
  mergeNavPages,
  normalizeNavTree,
  syncLanguageEntry,
  syncTab,
} from "./sync-docs-json.mjs";

const LANG_DIRS = ["en", "zh", "ja", "ko"];
const zh = { code: "zh", dir: "zh" };

describe("isApiOperationRow", () => {
  test("recognizes OpenAPI operation rows", () => {
    expect(isApiOperationRow("GET /users")).toBe(true);
    expect(isApiOperationRow("DELETE /publishers/{publisherId}")).toBe(true);
    expect(isApiOperationRow("PATCH /nodes/{id}/versions")).toBe(true);
  });

  test("leaves page paths and prose alone", () => {
    expect(isApiOperationRow("cloud/workspace")).toBe(false);
    expect(isApiOperationRow("zh/cloud/workspace")).toBe(false);
    expect(isApiOperationRow("GET users")).toBe(false);
    expect(isApiOperationRow("Overview")).toBe(false);
  });
});

describe("normalizeNavTree", () => {
  test("keeps operation rows when pruning missing pages", () => {
    const out = normalizeNavTree(
      ["GET /users", "zh/cloud/does-not-exist", "zh/cloud/import-models"],
      { pruneMissing: true }
    );
    expect(out).toEqual(["GET /users", "zh/cloud/import-models"]);
  });
});

describe("localizeNavTree", () => {
  test("does not prefix operation rows with the language directory", () => {
    const out = localizeNavTree(
      [{ group: "Registry API Reference", openapi: { source: "x" }, pages: ["GET /users"] },
       "cloud/workspace"],
      "zh",
      LANG_DIRS
    );
    expect(out[0].pages).toEqual(["GET /users"]);
    expect(out[1]).toBe("zh/cloud/workspace");
  });
});

describe("syncTab", () => {
  test("carries EN operation rows into the localized OpenAPI tab", () => {
    const enTab = {
      tab: "API Reference",
      pages: [
        {
          group: "Registry API Reference",
          openapi: { source: "https://api.comfy.org/openapi", directory: "registry/api-reference" },
          pages: ["GET /users", "POST /publishers"],
        },
      ],
    };
    const existingTab = {
      tab: "API 参考",
      pages: [
        {
          group: "Registry API 参考",
          openapi: { source: "https://api.comfy.org/openapi", directory: "zh/registry/api-reference" },
          pages: [],
        },
      ],
    };

    const synced = syncTab(enTab, existingTab, zh, LANG_DIRS);
    const group = synced.pages[0];
    expect(group.group).toBe("Registry API 参考");
    expect(group.pages).toEqual(["GET /users", "POST /publishers"]);
    expect(group.openapi.directory).toBe("zh/registry/api-reference");
  });

  test("keeps the localized label when the EN group was restructured", () => {
    const enTab = {
      tab: "Built-in Nodes",
      pages: [
        {
          group: "Model",
          pages: [
            { group: "Debug", pages: ["built-in-nodes/EasyCache"] },
            { group: "Guidance", pages: ["built-in-nodes/CFGNorm"] },
          ],
        },
      ],
    };
    const existingTab = {
      tab: "内置节点",
      pages: [{ group: "模型", pages: ["zh/built-in-nodes/EasyCache", "zh/built-in-nodes/CFGNorm"] }],
    };

    const synced = syncTab(enTab, existingTab, zh, LANG_DIRS);
    expect(synced.pages[0].group).toBe("模型");
    expect(synced.pages[0].pages[0]).toEqual({
      group: "Debug",
      pages: ["zh/built-in-nodes/EasyCache"],
    });
    expect(synced.pages[0].pages[1].group).toBe("Guidance");
  });

  test("keeps a localized label for an OpenAPI group that has no pages yet", () => {
    const enTab = {
      tab: "API Reference",
      pages: [
        {
          group: "Cloud API Reference",
          openapi: { source: "openapi-cloud.yaml", directory: "api-reference/cloud" },
        },
      ],
    };
    const existingTab = {
      tab: "API 참조",
      pages: [
        {
          group: "Cloud API 참조",
          openapi: { source: "openapi-cloud.yaml", directory: "zh/api-reference/cloud" },
        },
      ],
    };

    expect(syncTab(enTab, existingTab, zh, LANG_DIRS).pages[0].group).toBe("Cloud API 참조");
  });
});

describe("mergeNavPages", () => {
  test("falls back to the EN label when no localized label exists", () => {
    const merged = mergeNavPages(
      [{ group: "Brand New Group", pages: ["brand-new/page"] }],
      [],
      LANG_DIRS
    );
    expect(merged[0].group).toBe("Brand New Group");
  });
});

describe("syncLanguageEntry", () => {
  test("keeps pages that only exist in the locale and reports them", () => {
    const enEntry = {
      language: "en",
      tabs: [{ tab: "Cloud", pages: ["cloud/import-models"] }],
    };
    const zhEntry = {
      language: "zh",
      tabs: [{ tab: "Cloud", pages: ["zh/cloud/import-models", "zh/cloud/share-workflow"] }],
    };

    const reported = [];
    const synced = syncLanguageEntry(enEntry, zhEntry, zh, LANG_DIRS, (pages) =>
      reported.push(...pages)
    );

    expect(synced.tabs[0].pages).toEqual(["zh/cloud/import-models", "zh/cloud/share-workflow"]);
    expect(reported).toEqual(["zh/cloud/share-workflow"]);
  });

  test("does not resurrect a locale-only row whose page is gone", () => {
    const enEntry = { language: "en", tabs: [{ tab: "Cloud", pages: ["cloud/import-models"] }] };
    const zhEntry = {
      language: "zh",
      tabs: [{ tab: "Cloud", pages: ["zh/cloud/import-models", "zh/cloud/deleted-page"] }],
    };

    const synced = syncLanguageEntry(enEntry, zhEntry, zh, LANG_DIRS, () => {});
    expect(synced.tabs[0].pages).toEqual(["zh/cloud/import-models"]);
  });
});
