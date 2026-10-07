import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  slugify,
  collectAnchors,
  suggestAnchorFix,
  scanFileForAnchorIssues,
} from "./fix-anchor-slugs.ts";

describe("slugify (aligned with check-anchors.py)", () => {
  test("localized heading -> Mintlify slug", () => {
    expect(slugify("フィードバック")).toBe("フィードバック");
    expect(slugify("智能体可以做什么")).toBe("智能体可以做什么");
    expect(slugify("호출 순서")).toBe("호출-순서");
  });

  test("keeps full-width CJK punctuation", () => {
    // U+FF08/U+FF09 full-width parens are preserved in Mintlify anchors
    expect(slugify("並列実行（同時ジョブ）")).toBe("並列実行（同時ジョブ）");
    expect(slugify("并行执行（并发任务）")).toBe("并行执行（并发任务）");
  });

  test("lowercases, collapses whitespace and hyphens; keeps +", () => {
    expect(slugify("Lazy Evaluation (V1 → V3)")).toBe("lazy-evaluation-v1-v3");
    expect(slugify("Method 2: WebSocket + History")).toBe("method-2-websocket-+-history");
  });

  test("escaped underscore becomes hyphen; plain underscore is kept", () => {
    expect(slugify("Getting node\\_id")).toBe("getting-node-id");
    expect(slugify("VALIDATE_INPUTS")).toBe("validate_inputs");
  });

  test("literal period becomes hyphen", () => {
    expect(slugify("Including `.js` files")).toBe("including-js-files");
  });
});

describe("collectAnchors", () => {
  test("collects headings, component titles and id attributes", () => {
    const anchors = collectAnchors("custom-nodes/js/javascript_hooks.mdx");
    expect(anchors).toContain("call-sequences"); // EN heading slug
  });

  test("translated page exposes localized slugs", () => {
    const anchors = collectAnchors("zh/custom-nodes/js/javascript_hooks.mdx");
    expect(anchors).toContain("调用顺序");
  });

  test("follows snippet imports", () => {
    const anchors = collectAnchors("zh/installation/desktop/windows.mdx");
    // Step titles inside an imported snippet count as page anchors
    expect(anchors.some((a) => a.includes("desktop-settings"))).toBe(true);
  });
});

describe("suggestAnchorFix", () => {
  test("resolves an English anchor to the localized slug via EN order alignment", () => {
    expect(suggestAnchorFix("zh/custom-nodes/js/javascript_hooks.mdx", "call-sequences")).toBe(
      "调用顺序"
    );
    expect(suggestAnchorFix("ja/custom-nodes/js/javascript_hooks.mdx", "call-sequences")).toBe(
      "呼び出し順序"
    );
  });

  test("returns null when the anchor already resolves", () => {
    expect(suggestAnchorFix("zh/custom-nodes/js/javascript_hooks.mdx", "调用顺序")).toBeNull();
  });

  test("handles explicit-anchor pages (validate_inputs)", () => {
    expect(suggestAnchorFix("zh/custom-nodes/backend/server_overview.mdx", "validate-inputs")).toBe(
      "validate_inputs"
    );
  });

  test("resolves via EN order alignment when structure matches", () => {
    expect(
      suggestAnchorFix("ja/tutorials/video/wan/fun-control.mdx", "workflow-using-custom-nodes")
    ).toBe("カスタムノードを使用するワークフロー");
  });

  test("returns null when the EN structure drifted (no safe guess)", () => {
    // api-examples pages have drifted anchor counts (EN 25 vs TR 12) -> no guess
    const fix = suggestAnchorFix(
      "ja/development/comfyui-server/api-examples.mdx",
      "method-2-websocket--history-monitor-completion"
    );
    expect(fix).toBeNull();
  });
});

describe("scanFileForAnchorIssues", () => {
  test("flags links whose fragment does not resolve on the target page", () => {
    const dir = mkdtempSync(join(tmpdir(), "anchor-fix-"));
    const file = join(dir, "fake-ja.mdx");
    writeFileSync(
      file,
      [
        "## 概要",
        "",
        // two broken fragments on the SAME line: both must be flagged
        "[フィードバック](/zh/custom-nodes/js/javascript_hooks.mdx#feedback) [カテゴリ](/zh/custom-nodes/js/javascript_hooks.mdx#categories)",
        "",
        "[よいリンク](/zh/custom-nodes/js/javascript_hooks.mdx#调用顺序)",
        "",
      ].join("\n")
    );
    try {
      const issues = scanFileForAnchorIssues(file);
      // #feedback / #categories do not exist on the zh javascript_hooks page
      const anchors = issues.map((i) => i.anchor).sort();
      expect(anchors).toEqual(["categories", "feedback"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores links inside fenced code blocks", () => {
    const dir = mkdtempSync(join(tmpdir(), "anchor-fix-fence-"));
    const file = join(dir, "fake.mdx");
    writeFileSync(
      file,
      [
        "## 見出し",
        "",
        "```",
        // inside a fence: must NOT be flagged even though the fragment is broken
        "[リンク](/zh/custom-nodes/js/javascript_hooks.mdx#broken-anchor)",
        "```",
        "",
        "[よいリンク](/zh/custom-nodes/js/javascript_hooks.mdx#调用顺序)",
        "",
      ].join("\n")
    );
    try {
      const issues = scanFileForAnchorIssues(file);
      expect(issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
