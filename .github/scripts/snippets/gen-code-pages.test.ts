import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOpaqueBody, loadModelSchema, modelPageRedirects, modelsNav, opaqueOutputExample, outputContent, outputSchemaFields, renderDocsJson, swiftLiteral, swiftQueueSnippet, swiftSnippet } from "./gen-code-pages.ts";

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

describe("swiftLiteral: the [String: Any] input literal", () => {
  const f = (v: unknown, files: any[] = [], topKey?: string) => swiftLiteral(v, 0, files, topKey);

  test("scalars: strings quoted, numbers and bools bare", () => {
    expect(f("a cat")).toBe('"a cat"');
    expect(f(1024)).toBe("1024");
    expect(f(0.5)).toBe("0.5");
    expect(f(true)).toBe("true");
    expect(f(false)).toBe("false");
  });

  test("JSON null is NSNull(), the [String: Any] stand-in", () => {
    expect(f(null)).toBe("NSNull()");
  });

  test("an empty object is [:], where a Swift dictionary literal differs from JSON", () => {
    // Verified against Swift 6.1: in [String: Any] value position an empty [] infers
    // Array<Any> and an empty [:] infers Dictionary<AnyHashable, Any>, and both BUILD.
    // An explicit [Any]() / [String: Any]() is therefore not needed here.
    expect(f({})).toBe("[:]");
    expect(f([])).toBe("[]");
  });

  test("a primitive array is inline; a string never leaks a raw \\u escape", () => {
    expect(f([1, 2, 3])).toBe("[1, 2, 3]");
    // U+0007 (bell): JSON would spell it , which swiftc -parse rejects; Swift needs \u{7}.
    expect(f(`bell ${String.fromCharCode(7)} here`)).toBe('"bell \\u{7} here"');
    // A double quote inside the value is escaped for Swift, not left to close the literal early.
    expect(f('say "hi"')).toBe('"say \\"hi\\""');
  });

  test("nested objects and arrays render as nested Swift literals", () => {
    expect(f({ input: { prompt: "a cat" }, sizes: [1, 2] })).toBe(
      '[\n    "input": [\n        "prompt": "a cat",\n    ],\n    "sizes": [1, 2],\n]'
    );
  });

  test("a file input is substituted by its camelCased variable name, not its value", () => {
    const files = [{ key: "input_image", path: "input.jpg", varName: "input_image" }];
    expect(f("@file:input.jpg", files, "input_image")).toBe("inputImage");
    // Only the matching top-level key is substituted; a plain string is still a literal.
    expect(f("@file:input.jpg", files, "prompt")).toBe('"@file:input.jpg"');
  });
});

describe("swiftSnippet / swiftQueueSnippet: both delivery modes", () => {
  const example = { prompt: "a cat", input_image: "@file:input.jpg", width: 1024 };
  const files = [{ key: "input_image", path: "input.jpg", varName: "input_image" }];

  test("synchronous: run(), the [String: Any] input, a file read, and a field read via result.output", () => {
    const s = swiftSnippet("bfl/flux-1-kontext", example, files, "result.sample", "image");
    expect(s).toContain("import Foundation");
    expect(s).toContain("import ComfySwiftSDK");
    // The file input is read and base64-encoded once, then referenced by name in the body.
    expect(s).toContain('let inputImage = try Data(contentsOf: URL(fileURLWithPath: "input.jpg")).base64EncodedString()');
    expect(s).toContain('let result = try await client.models.run(\n    "bfl/flux-1-kontext",\n    input: [');
    expect(s).toContain('"input_image": inputImage,');
    expect(s).toContain('print("image:", result.output["result"]["sample"].stringValue ?? "")');
    expect(s).not.toContain("models.submit");
  });

  test("queued: submit(), the poll loop over events(), and result() collect the same body", () => {
    const q = swiftQueueSnippet("bfl/flux-1-kontext", example, files, "result.sample", "image");
    expect(q).toContain('let handle = try await client.models.submit(');
    expect(q).toContain("print(\"requestId:\", handle.requestId)");
    expect(q).toContain("for try await update in handle.events() {");
    // queuePosition is Int?, and the SDK is explicit that "nil is not position zero",
    // so an absent position must not be reported as a real place in line.
    expect(q).toContain('print(update.state.rawValue, update.queuePosition.map(String.init) ?? "unknown")');
    expect(q).not.toContain("update.queuePosition ?? 0");
    expect(q).toContain("let result = try await handle.result()");
    expect(q).toContain('print("image:", result.output["result"]["sample"].stringValue ?? "")');
  });

  test("an empty result path (a derived page) prints the whole payload in both modes", () => {
    const body = { prompt: "a cat" };
    expect(swiftSnippet("m/x", body, [], "", "")).toContain("\nprint(result.output)");
    expect(swiftQueueSnippet("m/x", body, [], "", "")).toContain("\nprint(result.output)");
  });
});

describe("the generated pages carry a Swift tab in both delivery modes", () => {
  test("a curated page emits two Swift fences (synchronous and queued), running client.models", () => {
    const mdx = readFileSync(join(ROOT, "development/comfy-router/models/black-forest-labs/flux-1-kontext/code.mdx"), "utf8");
    const fences = [...mdx.matchAll(/```swift Swift\n/g)];
    // A synchronous and a queued Swift fence per variant (this page carries more than one model).
    expect(fences.length).toBeGreaterThanOrEqual(2);
    expect(fences.length % 2).toBe(0);
    expect(mdx).toContain('try await client.models.run(');
    expect(mdx).toContain('try await client.models.submit(');
    // The file input the spec declares is read in the Swift snippet too.
    expect(mdx).toContain('URL(fileURLWithPath: "input.jpg")).base64EncodedString()');
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
