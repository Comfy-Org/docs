import { describe, expect, test } from "bun:test";
import { parseArgs } from "./publish-cms-drafts.ts";

describe("parseArgs", () => {
  test("keeps dry-run separate from launch evidence", () => {
    expect(
      parseArgs([
        "0.45.5",
        "--rendered-preview",
        "preview.png",
        "--dry-run",
        "--rollback-owner",
        "Release owner",
      ]),
    ).toMatchObject({
      dryRun: true,
      renderedPreview: "preview.png",
      rollbackOwner: "Release owner",
    });
  });

  test("rejects missing or option-shaped evidence values", () => {
    expect(() =>
      parseArgs([
        "0.45.5",
        "--rendered-preview",
        "--dry-run",
        "--rollback-owner",
        "Release owner",
      ]),
    ).toThrow("--rendered-preview requires a value");
    expect(() => parseArgs(["0.45.5", "--rollback-owner="])).toThrow(
      "--rollback-owner requires a value",
    );
  });
});
