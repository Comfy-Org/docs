import { describe, expect, test } from "bun:test";
import {
  applyTranslations,
  extractTranslatableStrings,
  localizedOpenApiSource,
  sidecarPathForOutput,
  stringifyYamlSpec,
  stripYamlHeader,
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

describe("extractTranslatableStrings", () => {
  test("collects summary and description only", () => {
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
      "info.description": "Root description",
      "paths./users.get.summary": "List users",
      "paths./users.get.description": "Returns all users",
      "components.schemas.User.properties.id.description": "User id",
    });
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
  test("replaces targeted strings without changing structure", () => {
    const english = {
      info: { description: "Hello" },
      paths: { "/x": { get: { summary: "Get X" } } },
    };
    const localized = applyTranslations(english, {
      "info.description": "你好",
      "paths./x.get.summary": "获取 X",
    });
    expect(localized).toEqual({
      info: { description: "你好" },
      paths: { "/x": { get: { summary: "获取 X" } } },
    });
  });
});
