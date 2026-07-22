import { describe, expect, test } from "bun:test";
import {
  applyTranslations,
  extractTranslatableStrings,
  localizedOpenApiSource,
  sidecarPathForOutput,
  stringifyYamlSpec,
  stripYamlHeader,
  escapeJpSegment,
  unescapeJpSegment,
  parseJpPath,
} from "./openapi-translate.ts";

describe("localizedOpenApiSource", () => {
  test("inserts language code before extension", () => {
    expect(localizedOpenApiSource("openapi/cloud.en.yaml", "zh")).toBe(
      "openapi/cloud.zh.yaml"
    );
    expect(localizedOpenApiSource("openapi/registry.en.yaml", "ja")).toBe(
      "openapi/registry.ja.yaml"
    );
    expect(localizedOpenApiSource("openapi/cloud.en.yaml", "en")).toBe(
      "openapi/cloud.en.yaml"
    );
  });
});

describe("sidecarPathForOutput", () => {
  test("uses openapi/.i18n/ directory", () => {
    expect(sidecarPathForOutput("openapi/cloud.zh.yaml")).toBe(
      "openapi/.i18n/cloud.zh.json"
    );
    expect(sidecarPathForOutput("openapi/registry.ko.yaml")).toBe(
      "openapi/.i18n/registry.ko.json"
    );
  });
});

describe("JSON Pointer helpers", () => {
  test("escapeJpSegment escapes ~ and /", () => {
    expect(escapeJpSegment("simple")).toBe("simple");
    expect(escapeJpSegment("/proxy/bfl/flux-pro-1.1/generate")).toBe(
      "~1proxy~1bfl~1flux-pro-1.1~1generate"
    );
    expect(escapeJpSegment("a~tilde/key")).toBe("a~0tilde~1key");
  });

  test("unescapeJpSegment reverses escape", () => {
    expect(unescapeJpSegment("simple")).toBe("simple");
    expect(unescapeJpSegment("~1proxy~1bfl~1flux-pro-1.1~1generate")).toBe(
      "/proxy/bfl/flux-pro-1.1/generate"
    );
    expect(unescapeJpSegment("a~0tilde~1key")).toBe("a~tilde/key");
  });

  test("parseJpPath handles JSON Pointer format", () => {
    expect(parseJpPath("/info/description")).toEqual(["info", "description"]);
    expect(parseJpPath("/paths/~1proxy~1bfl~1flux-pro-1.1~1generate/post/summary")).toEqual(
      ["paths", "/proxy/bfl/flux-pro-1.1/generate", "post", "summary"]
    );
  });

  test("parseJpPath converts numeric segments to numbers", () => {
    expect(parseJpPath("/servers/0/url")).toEqual(["servers", 0, "url"]);
  });

  test("parseJpPath handles legacy dot format for backward compat", () => {
    expect(parseJpPath("info.description")).toEqual(["info", "description"]);
    expect(parseJpPath("paths./users.get.summary")).toEqual(["paths", "/users", "get", "summary"]);
  });
});

describe("extractTranslatableStrings", () => {
  test("collects summary and description using JSON Pointer paths", () => {
    const spec = {
      info: { title: "API", description: "Root description" },
      paths: {
        "/users": {
          get: {
            summary: "List users",
            description: "Returns all users",
            operationId: "listUsers",
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              id: { type: "string", description: "User id" },
            },
          },
        },
      },
    };

    expect(extractTranslatableStrings(spec)).toEqual({
      "info/description": "Root description",
      "paths/~1users/get/summary": "List users",
      "paths/~1users/get/description": "Returns all users",
      "components/schemas/User/properties/id/description": "User id",
    });
  });

  test("handles OpenAPI path keys containing dots", () => {
    const spec = {
      paths: {
        "/proxy/bfl/flux-pro-1.1/generate": {
          post: {
            summary: "Generate with Flux Pro 1.1",
          },
        },
        "/proxy/pika/generate/2.2/t2v": {
          post: {
            summary: "Pika text-to-video",
          },
        },
        "/proxy/kling/v1/kling-3.0-turbo/generate": {
          post: {
            summary: "Kling 3.0 turbo",
          },
        },
      },
    };

    const strings = extractTranslatableStrings(spec);
    // All 3 dot-containing paths should be present and reachable
    expect(strings["paths/~1proxy~1bfl~1flux-pro-1.1~1generate/post/summary"]).toBe(
      "Generate with Flux Pro 1.1"
    );
    expect(strings["paths/~1proxy~1pika~1generate~12.2~1t2v/post/summary"]).toBe(
      "Pika text-to-video"
    );
    expect(strings["paths/~1proxy~1kling~1v1~1kling-3.0-turbo~1generate/post/summary"]).toBe(
      "Kling 3.0 turbo"
    );
    expect(Object.keys(strings).length).toBe(3);
  });
});

describe("stringifyYamlSpec", () => {
  test("produces indented multi-line YAML", () => {
    const yaml = stringifyYamlSpec({
      openapi: "3.0.3",
      info: { title: "API", description: "Hello" },
    });
    expect(yaml.split("\n").length).toBeGreaterThan(3);
    expect(yaml).toContain("openapi: 3.0.3");
    expect(yaml).toContain("  title: API");
  });
});

describe("stripYamlHeader", () => {
  test("preserves translation metadata comments", () => {
    const { header, body } = stripYamlHeader(
      "# translationSourceHash: abc\n# translationFrom: x.yaml\n\nopenapi: 3.0.3\n"
    );
    expect(header).toContain("translationSourceHash");
    expect(body).toContain("openapi: 3.0.3");
  });
});

describe("applyTranslations", () => {
  test("replaces targeted strings using JSON Pointer paths", () => {
    const english = {
      info: { description: "Hello" },
      paths: { "/x": { get: { summary: "Get X" } } },
    };
    const localized = applyTranslations(english, {
      "/info/description": "你好",
      "/paths/~1x/get/summary": "获取 X",
    });
    expect(localized).toEqual({
      info: { description: "你好" },
      paths: { "/x": { get: { summary: "获取 X" } } },
    });
  });

  test("handles dot-containing path keys", () => {
    const english = {
      paths: {
        "/proxy/bfl/flux-pro-1.1/generate": {
          post: { summary: "Generate" },
        },
      },
    };
    const localized = applyTranslations(english, {
      "/paths/~1proxy~1bfl~1flux-pro-1.1~1generate/post/summary": "生成",
    });
    expect(
      (localized.paths as Record<string, unknown>)[
        "/proxy/bfl/flux-pro-1.1/generate"
      ] as Record<string, unknown>
    ).toBeDefined();
    expect(
      (
        (
          (localized.paths as Record<string, unknown>)[
            "/proxy/bfl/flux-pro-1.1/generate"
          ] as Record<string, unknown>
        ).post as Record<string, unknown>
      ).summary
    ).toBe("生成");
  });
});
