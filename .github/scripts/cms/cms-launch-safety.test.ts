import { describe, expect, test } from "bun:test";
import { validateCloudPublishSafety } from "./cms-launch-safety.ts";

const SAFE_CLOUD_INPUT = {
  dryRun: false,
  projects: ["cloud"],
  explicitProject: "cloud",
  versions: ["0.45.5"],
  renderedPreview: "artifacts/cloud-0.45.5-preview.png",
  rollbackOwner: "Release owner",
};

describe("validateCloudPublishSafety", () => {
  test("accepts one explicitly scoped Cloud version with launch evidence", () => {
    expect(() => validateCloudPublishSafety(SAFE_CLOUD_INPUT)).not.toThrow();
  });

  test("does not add write gates to dry-run previews", () => {
    expect(() =>
      validateCloudPublishSafety({
        dryRun: true,
        projects: ["comfyui", "cloud"],
        versions: [],
      }),
    ).not.toThrow();
  });

  test("rejects an implicit multi-project Cloud publish", () => {
    expect(() =>
      validateCloudPublishSafety({
        ...SAFE_CLOUD_INPUT,
        projects: ["comfyui", "cloud"],
        explicitProject: undefined,
      }),
    ).toThrow("--project cloud");
  });

  test("rejects bulk or versionless Cloud publishes", () => {
    expect(() =>
      validateCloudPublishSafety({ ...SAFE_CLOUD_INPUT, versions: [] }),
    ).toThrow("exactly one explicit target version");
    expect(() =>
      validateCloudPublishSafety({
        ...SAFE_CLOUD_INPUT,
        versions: ["0.45.5", "0.45.6"],
      }),
    ).toThrow("exactly one explicit target version");
  });

  test("requires rendered-preview evidence and a rollback owner", () => {
    expect(() =>
      validateCloudPublishSafety({
        ...SAFE_CLOUD_INPUT,
        renderedPreview: undefined,
      }),
    ).toThrow("--rendered-preview");
    expect(() =>
      validateCloudPublishSafety({
        ...SAFE_CLOUD_INPUT,
        rollbackOwner: undefined,
      }),
    ).toThrow("--rollback-owner");
  });
});
