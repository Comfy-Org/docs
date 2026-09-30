import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./i18n-config.mjs";
import { localizedPageContent, translateRateValue } from "./translate-router-pricing.ts";

test("localized rate windows clearly identify the exclusive end date", () => {
  const window = "From 2026-08-26 until 2026-10-01 (exclusive)";
  expect(translateRateValue("ja", "Effective", window)).toBe(
    "開始: 2026-08-26、終了: 2026-10-01（終了日は含みません）",
  );
  expect(translateRateValue("ko", "Effective", window)).toBe(
    "시작: 2026-08-26, 종료: 2026-10-01(종료일은 미포함)",
  );
  expect(translateRateValue("zh", "Effective", window)).toBe(
    "开始：2026-08-26 至 2026-10-01（结束日期不含）",
  );
});

test("open-ended rates do not gain an end-date label", () => {
  const start = "From 2026-09-22";
  expect(translateRateValue("ja", "Effective", start)).toBe("開始: 2026-09-22");
  expect(translateRateValue("ko", "Effective", start)).toBe("시작: 2026-09-22");
  expect(translateRateValue("zh", "Effective", start)).toBe("开始：2026-09-22");
});

test("all pricing locales match deterministic generation including translation metadata", () => {
  const page = "development/comfy-router/pricing.mdx";
  const english = readFileSync(join(REPO_ROOT, page), "utf8");
  const snapshot = JSON.parse(readFileSync(join(REPO_ROOT, "router-pricing/metronome-rates.json"), "utf8"));
  for (const locale of ["ja", "zh", "ko"] as const) {
    expect(readFileSync(join(REPO_ROOT, locale, page), "utf8")).toBe(
      localizedPageContent(english, locale, snapshot.snapshot_at, snapshot.credits_per_usd),
    );
  }
});
