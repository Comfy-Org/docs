import { describe, expect, test } from "bun:test";
import { verifyLocaleRelease } from "./verify-cms-release.ts";

const CONTENT = "# Cloud v0.45.5\n\n**Partner Node Updates**\n* Example";
const NOTE = {
  id: 4001,
  project: "cloud",
  version: "0.45.5",
  content: CONTENT,
  published_at: "2026-11-18T20:00:00Z",
};

describe("verifyLocaleRelease", () => {
  test("accepts one exact published record", () => {
    expect(
      verifyLocaleRelease([NOTE], CONTENT, "cloud", "0.45.5"),
    ).toMatchObject({
      ok: true,
      id: 4001,
      publishedAt: "2026-11-18T20:00:00Z",
    });
  });

  test("rejects a missing or duplicate target record", () => {
    expect(verifyLocaleRelease([], CONTENT, "cloud", "0.45.5")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("found 0"),
    });
    expect(
      verifyLocaleRelease([NOTE, NOTE], CONTENT, "cloud", "0.45.5"),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("found 2"),
    });
  });

  test("rejects content drift and missing publish metadata", () => {
    const drift = verifyLocaleRelease(
      [{ ...NOTE, content: `${CONTENT}\n* Unexpected` }],
      CONTENT,
      "cloud",
      "0.45.5",
    );
    expect(drift).toMatchObject({
      ok: false,
      reason: "public content does not match staging",
    });
    expect(drift.actualHash).not.toBe(drift.expectedHash);

    expect(
      verifyLocaleRelease(
        [{ ...NOTE, published_at: undefined }],
        CONTENT,
        "cloud",
        "0.45.5",
      ),
    ).toMatchObject({ ok: false, reason: "record has no published_at" });
  });
});
