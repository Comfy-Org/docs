import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  SYNC_PR_AUTHOR,
  SYNC_PR_BRANCH,
  changedGeneratorInput,
  check,
  classify,
  exemptionReason,
  formatFailure,
  parsePaths,
} from "./check-sync-owned.ts";

const ROOT = join(import.meta.dir, "../../..");

/** Guarded whatever else the pull request changes. */
const ALWAYS_GUARDED = [
  "openapi-v2.yaml",
  "development/comfy-router/reference.mdx",
  "development/comfy-router/quickstart.mdx",
  "development/comfy-router/limitations.mdx",
  "router-schemas/openai/gpt-image-1.json",
];

/** Guarded only when the pull request changes no generator input. */
const GENERATED_GUARDED = [
  "development/comfy-router/models.mdx",
  "development/comfy-router/models/openai/gpt-image-1/code.mdx",
];

/** Every path the acceptance criteria name, minus the one that is also an input. */
const GUARDED_TOGETHER = [
  ...ALWAYS_GUARDED.filter((p) => !p.startsWith("router-schemas/")),
  ...GENERATED_GUARDED,
];

/** Paths the sync touches partially or not at all, which must stay editable. */
const EDITABLE = [
  "docs.json",
  "development/comfy-router/api.mdx",
  "development/comfy-router/queue.mdx",
  "development/comfy-router/headers.mdx",
  "zh/development/comfy-router/limitations.mdx",
  "ja/development/comfy-router/quickstart.mdx",
  "ko/development/comfy-router/reference.mdx",
  "README.md",
  "openapi-cloud.yaml",
];

describe("classify: the guarded set", () => {
  for (const path of [...ALWAYS_GUARDED, ...GENERATED_GUARDED]) {
    test(`flags ${path}`, () => {
      const offences = classify([path]);
      expect(offences.map((o) => o.path)).toEqual([path]);
      expect(offences[0].guidance.length).toBeGreaterThan(0);
    });
  }

  test("flags every guarded file in one pull request, not just the first", () => {
    expect(classify(GUARDED_TOGETHER).map((o) => o.path)).toEqual(GUARDED_TOGETHER);
  });

  test("flags the router-schemas directory itself, not only files under it", () => {
    expect(classify(["router-schemas"])).toHaveLength(1);
  });

  test("tolerates the ./-prefixed and whitespace-padded forms git can hand it", () => {
    expect(classify(["./openapi-v2.yaml", "  development/comfy-router/limitations.mdx  "]).map((o) => o.path)).toEqual([
      "openapi-v2.yaml",
      "development/comfy-router/limitations.mdx",
    ]);
  });

  test("reports a path once even when the diff lists it twice", () => {
    expect(classify(["openapi-v2.yaml", "openapi-v2.yaml"])).toHaveLength(1);
  });

  test("flags a guarded file that the pull request DELETES, which git reports as a plain path", () => {
    expect(classify(["development/comfy-router/quickstart.mdx"])).toHaveLength(1);
  });
});

describe("classify: what stays editable", () => {
  for (const path of EDITABLE) {
    test(`passes ${path}`, () => {
      expect(classify([path])).toEqual([]);
    });
  }

  test("passes a pull request that changes nothing guarded", () => {
    expect(classify(EDITABLE)).toEqual([]);
  });

  // The generated tree holds hand-curated `code.yaml` specs next to the generated
  // pages, so a prefix match on the models directory would guard the wrong file.
  test("does not guard a code.yaml merely because it sits under the generated models tree", () => {
    expect(classify(["development/comfy-router/models/bfl/flux-3/code.yaml"])).toEqual([]);
  });

  // `router-schemas` is guarded by prefix; a sibling whose name merely starts with
  // the same characters is not part of it.
  test("does not guard a sibling directory that shares the router-schemas prefix", () => {
    expect(classify(["router-schemas-notes/readme.md"])).toEqual([]);
  });
});

/**
 * `code-pages:check` FAILS a pull request whose generated pages are stale, so any
 * change to a generator input must ship the regenerated pages in the same diff.
 * Guarding those pages unconditionally would make the two checks contradict each
 * other and a `code.yaml` edit unshippable.
 */
describe("generated pages are a regeneration when an input changed in the same diff", () => {
  const CODE_MDX = "development/comfy-router/models/openai/gpt-image-1/code.mdx";

  test("a code.yaml edit plus its regenerated page passes", () => {
    expect(classify(["development/comfy-router/models/openai/gpt-image-1/code.yaml", CODE_MDX])).toEqual([]);
  });

  test("a snippets/comfy-router fragment edit plus regenerated pages passes", () => {
    expect(classify(["snippets/comfy-router/model-code-footer.mdx", CODE_MDX, "development/comfy-router/models.mdx"])).toEqual([]);
  });

  test("a generator change plus regenerated pages passes", () => {
    expect(classify([".github/scripts/snippets/gen-code-pages.ts", CODE_MDX])).toEqual([]);
  });

  test("the excusal is reported, so the log says why the pages were allowed", () => {
    const report = check(["development/comfy-router/models/openai/gpt-image-1/code.yaml", CODE_MDX]);
    expect(report.excused).toEqual([CODE_MDX]);
    expect(report.regeneratedBecause).toContain("code.yaml");
  });

  test("a router-schemas edit excuses the regenerated pages but is itself still flagged", () => {
    expect(classify(["router-schemas/openai/gpt-image-1.json", CODE_MDX]).map((o) => o.path)).toEqual([
      "router-schemas/openai/gpt-image-1.json",
    ]);
  });

  test("the excusal does not spill onto the hand-written pages", () => {
    expect(
      classify([
        "development/comfy-router/models/openai/gpt-image-1/code.yaml",
        CODE_MDX,
        "development/comfy-router/quickstart.mdx",
      ]).map((o) => o.path),
    ).toEqual(["development/comfy-router/quickstart.mdx"]);
  });

  test("a hand-edited generated page with no input change is still refused", () => {
    const report = check([CODE_MDX, "development/comfy-router/api.mdx"]);
    expect(report.excused).toEqual([]);
    expect(report.regeneratedBecause).toBeNull();
    expect(report.offences.map((o) => o.path)).toEqual([CODE_MDX]);
  });
});

describe("exemptionReason", () => {
  test("exempts the sync bot", () => {
    expect(exemptionReason(SYNC_PR_AUTHOR, "matt/some-branch")).toContain(SYNC_PR_AUTHOR);
  });

  test("exempts the fixed sync branch", () => {
    expect(exemptionReason("someone-else", SYNC_PR_BRANCH)).toContain(SYNC_PR_BRANCH);
  });

  test("does not exempt an ordinary contributor", () => {
    expect(exemptionReason("someone-else", "someone/fix-typo")).toBeNull();
  });

  test("does not exempt when the event supplied neither signal", () => {
    expect(exemptionReason(undefined, undefined)).toBeNull();
  });

  test("does not exempt a branch that merely resembles the sync branch", () => {
    expect(exemptionReason("someone-else", "chore/sync-comfy-api-v2-spec-2")).toBeNull();
  });
});

describe("formatFailure", () => {
  const message = formatFailure(classify(GUARDED_TOGETHER));

  test("names every offending file", () => {
    for (const path of GUARDED_TOGETHER) expect(message).toContain(path);
  });

  test("says per file where the edit belongs instead", () => {
    expect(message).toContain("Edit the contract upstream");
    expect(message).toContain("Edit the upstream quickstart.mdx");
    expect(message).toContain("Edit the upstream limitations.mdx");
    expect(message).toContain("Edit the sibling code.yaml");
    expect(message).toContain("code-pages:gen");
  });

  test("covers the router-schemas mirror too", () => {
    expect(formatFailure(classify(["router-schemas/openai/gpt-image-1.json"]))).toContain("Edit the upstream contract");
  });

  // This repository is public, so the failure a contributor reads must not carry
  // an issue-tracker identifier or a link into a private repository.
  test("leaks no tracker identifier and no private-repository link", () => {
    expect(message).not.toMatch(/\b[A-Z]{2,4}-\d{3,}\b/);
    expect(message).not.toMatch(/linear\.app/i);
    expect(message).not.toMatch(/github\.com/i);
  });
});

describe("parsePaths", () => {
  test("splits the NUL-separated form git diff -z produces", () => {
    expect(parsePaths("a.mdx\0b.mdx\0")).toEqual(["a.mdx", "b.mdx"]);
  });

  test("splits the newline-separated form too", () => {
    expect(parsePaths("a.mdx\nb.mdx\n")).toEqual(["a.mdx", "b.mdx"]);
  });

  test("returns nothing for an empty diff", () => {
    expect(parsePaths("")).toEqual([]);
    expect(parsePaths("\0")).toEqual([]);
  });
});

// A guard whose paths have drifted out of the repository silently guards nothing,
// which is the one failure mode that looks exactly like a clean run.
describe("the guarded paths exist in this repository", () => {
  const present = [
    "openapi-v2.yaml",
    "router-schemas",
    "development/comfy-router/reference.mdx",
    "development/comfy-router/quickstart.mdx",
    "development/comfy-router/limitations.mdx",
    "development/comfy-router/models",
    "development/comfy-router/models.mdx",
    "snippets/comfy-router",
    ".github/scripts/snippets",
  ];
  for (const path of present) {
    test(`${path} is present`, () => {
      expect(existsSync(join(ROOT, path))).toBe(true);
    });
  }

  test("docs.json and at least one hand-curated code.yaml are present and unguarded", () => {
    expect(existsSync(join(ROOT, "docs.json"))).toBe(true);
    const first = new Bun.Glob("development/comfy-router/models/**/code.yaml").scanSync(ROOT).next().value;
    expect(first).toBeString();
    expect(classify([first!.replaceAll("\\", "/")])).toEqual([]);
  });

  test("at least one generated code.mdx is present and guarded", () => {
    const first = new Bun.Glob("development/comfy-router/models/**/code.mdx").scanSync(ROOT).next().value;
    expect(first).toBeString();
    expect(classify([first!.replaceAll("\\", "/")])).toHaveLength(1);
  });
});

describe("changedGeneratorInput", () => {
  test("names the most direct input, not whichever the diff listed first", () => {
    const report = check([
      ".github/scripts/snippets/README.md",
      "snippets/comfy-router/queue-preview-notice.mdx",
      "development/comfy-router/models/openai/gpt-image-1/code.mdx",
    ]);
    expect(report.regeneratedBecause).toBe("a snippets/comfy-router fragment");
    expect(report.offences).toEqual([]);
  });

  test("prose beside the generator is not an input on its own", () => {
    expect(changedGeneratorInput([".github/scripts/snippets/README.md"])).toBeNull();
    expect(changedGeneratorInput([".github/scripts/snippets/gen-code-pages.ts"])).toBe("the code-page generator");
  });
});
