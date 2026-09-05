import { describe, expect, test } from "bun:test";
import { normalizer, variantLabels, compare, type Report } from "./check-provider-schemas.ts";

/**
 * A miniature of BFL's `Flux3VideoInputsBody`: a discriminated `oneOf` whose four modes
 * agree on `generate_audio` (true), disagree on `resolution` (`hd` in three, `fhd` in
 * `draft_enhance`) and where only `draft_enhance` declares `draft_cache`.
 */
const BFL_DOC = {
  openapi: "3.1.0",
  components: {
    schemas: {
      Body: {
        title: "Body",
        discriminator: { propertyName: "mode" },
        oneOf: [{ $ref: "#/components/schemas/T2V" }, { $ref: "#/components/schemas/I2V" }, { $ref: "#/components/schemas/V2V" }, { $ref: "#/components/schemas/DraftEnhance" }],
      },
      T2V: mode("t2v", { resolution: "hd" }, ["prompt", "mode"]),
      I2V: mode("i2v", { resolution: "hd" }, ["prompt", "mode"]),
      V2V: mode("v2v", { resolution: "hd" }, ["prompt", "mode"]),
      DraftEnhance: { ...mode("draft_enhance", { resolution: "fhd" }, ["mode", "draft_cache"]), },
    },
  },
} as any;

function mode(name: string, overrides: Record<string, unknown>, required: string[]) {
  const s: any = {
    type: "object",
    required,
    properties: {
      mode: { type: "string", const: name, title: "Mode" },
      prompt: { type: "string" },
      resolution: { type: "string", enum: ["hd", "fhd"], default: overrides.resolution },
      generate_audio: { type: "boolean", default: true },
      safety_tolerance: { type: "integer", minimum: 0, maximum: 4, default: 2 },
    },
  };
  if (name === "draft_enhance") s.properties.draft_cache = { type: "string", default: "" };
  return s;
}

const provider = () => normalizer(BFL_DOC).norm({ $ref: "#/components/schemas/Body" });
const emptyReport = (): Report => ({ errors: [], warnings: [] });
/**
 * `compare` also warns about every provider field a fixture leaves undocumented, which is a
 * different check; drop those so each assertion below reads only the messages it is about.
 */
const run = (ours: any, theirs: any = provider()) => {
  const rep = emptyReport();
  compare(ours, theirs, "model input", new Set<string>(), rep);
  const undocumented = (m: string) => /provider field `/.test(m);
  return { errors: rep.errors.filter((m) => !undocumented(m)), warnings: rep.warnings.filter((m) => !undocumented(m)) };
};

describe("normalizer: per-variant defaults across a union", () => {
  test("a property the alternatives disagree about loses `default` and gains `defaultByVariant`", () => {
    const res = provider().properties.resolution;
    expect(res.default).toBeUndefined();
    expect(res.defaultByVariant).toEqual({ t2v: "hd", i2v: "hd", v2v: "hd", draft_enhance: "fhd" });
  });

  test("the rest of the merged property survives, so enum and type are still checkable", () => {
    const res = provider().properties.resolution;
    expect(res.type).toBe("string");
    expect(res.enum).toEqual(["hd", "fhd"]);
  });

  test("a property every alternative agrees about keeps its single default", () => {
    const merged = provider().properties;
    expect(merged.generate_audio.default).toBe(true);
    expect(merged.generate_audio.defaultByVariant).toBeUndefined();
    expect(merged.safety_tolerance.default).toBe(2);
  });

  test("a default only one alternative declares is not a disagreement", () => {
    const merged = provider().properties;
    expect(merged.draft_cache.default).toBe("");
    expect(merged.draft_cache.defaultByVariant).toBeUndefined();
  });

  test("union merging is otherwise unchanged: required is the intersection", () => {
    expect(provider().required).toEqual(["mode"]);
    expect(provider().union).toBe(true);
  });
});

describe("variantLabels", () => {
  test("uses the declared discriminator's constants", () => {
    const alts = [{ properties: { mode: { const: "t2v" } } }, { properties: { mode: { const: "i2v" } } }];
    expect(variantLabels({ discriminator: { propertyName: "mode" } }, alts)).toEqual(["t2v", "i2v"]);
  });

  test("falls back to a single-valued enum, then to the alternative index", () => {
    const enums = [{ properties: { kind: { enum: ["a"] } } }, { properties: { kind: { enum: ["b"] } } }];
    expect(variantLabels({}, enums)).toEqual(["a", "b"]);
    expect(variantLabels({}, [{ properties: { x: { type: "string" } } }, { properties: { x: { type: "string" } } }])).toEqual(["#0", "#1"]);
  });

  test("a property that is constant but not distinct is not the discriminator", () => {
    const alts = [{ properties: { kind: { const: "same" } } }, { properties: { kind: { const: "same" } } }];
    expect(variantLabels({}, alts)).toEqual(["#0", "#1"]);
  });

  test("labels a union whose alternatives are unlabelled by index", () => {
    const doc = { openapi: "3.1.0", components: { schemas: {} } } as any;
    const s = { oneOf: [{ type: "object", properties: { size: { type: "string", default: "small" } } }, { type: "object", properties: { size: { type: "string", default: "large" } } }] };
    expect(normalizer(doc).norm(s).properties.size.defaultByVariant).toEqual({ "#0": "small", "#1": "large" });
  });
});

describe("compare: reporting a per-variant provider default", () => {
  const documented = (resolution: any) => ({ type: "object", properties: { resolution: { type: "string", enum: ["hd", "fhd"], ...resolution } } });

  test("documenting a single default is an ERROR naming every variant", () => {
    const rep = run(documented({ default: "fhd" }));
    expect(rep.errors).toEqual([
      'model input: `resolution` documents a single default "fhd" but the provider default is per-variant {"t2v":"hd","i2v":"hd","v2v":"hd","draft_enhance":"fhd"}; document the per-variant defaults in the description and drop `default`',
    ]);
  });

  test("the default that is right for MOST modes is an error too: there is no single right one", () => {
    expect(run(documented({ default: "hd" })).errors).toHaveLength(1);
  });

  test("documenting no default is a WARNING, not an error", () => {
    const rep = run(documented({}));
    expect(rep.errors).toEqual([]);
    expect(rep.warnings).toEqual([
      'model input: `resolution` provider default is per-variant {"t2v":"hd","i2v":"hd","v2v":"hd","draft_enhance":"fhd"}; make sure the description says so',
    ]);
  });

  test("the collapsed last-wins default is never reported: `fhd` alone is not the provider's default", () => {
    for (const rep of [run(documented({})), run(documented({ default: "fhd" }))]) {
      expect([...rep.errors, ...rep.warnings].filter((m) => /provider default "fhd"|default "fhd" vs provider/.test(m))).toEqual([]);
    }
  });

  test("the other checks still run on a per-variant property (only the default checks are skipped)", () => {
    const rep = run({ type: "object", properties: { resolution: { type: "integer", enum: ["hd", "fhd", "uhd"] } } });
    expect(rep.errors).toContain('model input: `resolution` type "integer" vs provider "string"');
    expect(rep.errors).toContain('model input: `resolution` enum values ["uhd"] are not in the provider\'s ["hd","fhd"]');
  });

  test("inside an array's items a per-variant default warns nothing but still errors", () => {
    const rep = emptyReport();
    const items = { type: "object", properties: { resolution: { type: "string" } } };
    compare(items, provider(), "model input", new Set<string>(), rep, "clips[]");
    expect(rep.warnings.filter((m) => /per-variant/.test(m))).toEqual([]);
    compare({ type: "object", properties: { resolution: { type: "string", default: "hd" } } }, provider(), "model input", new Set<string>(), rep, "clips[]");
    expect(rep.errors.filter((m) => /per-variant/.test(m))).toHaveLength(1);
  });

  test("properties without a per-variant default keep the ordinary default checks", () => {
    expect(run({ type: "object", properties: { generate_audio: { type: "boolean", default: false } } }).errors).toEqual([
      "model input: `generate_audio` default false vs provider true",
    ]);
    expect(run({ type: "object", properties: { generate_audio: { type: "boolean" } } }).warnings).toEqual([
      "model input: `generate_audio` provider default true is not documented",
    ]);
  });
});
