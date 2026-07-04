#!/usr/bin/env bun
/**
 * Daily cron wrapper for analytics fetch.
 * Fetches the last 2 days of assistant conversations only (incremental).
 * Writes a compact JSON summary for the cron LLM to analyze.
 *
 * Usage: bun analytics-daily-cron.ts
 * Output: tmp/analytics-cache/latest-summary.json
 */
import { join } from "path";
import { ROOT } from "../cms/cms-env.ts";
import { loadEnvLocal } from "../cms/cms-env.ts";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";

const CACHE_DIR = join(ROOT, "tmp/analytics-cache");
const LATEST_SUMMARY = join(CACHE_DIR, "latest-summary.json");

async function main() {
  // Load env
  loadEnvLocal();

  // Find the last completed fetch date from manifest
  const manifestPath = join(CACHE_DIR, "manifest.json");
  let lastDateTo: string | null = null;
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
      if (manifest.dateTo && typeof manifest.dateTo === "string") {
        lastDateTo = manifest.dateTo;
      }
    } catch {}
  }

  // Compute date range
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Daily cron: only fetch yesterday (the latest complete day).
  // At 06:00 CST the previous day's data is fully available.
  const dateFrom = fmt(new Date(today.getTime() - 1 * 86400000));
  const dateTo = fmt(today);

  // Build command
  const cmd = [
    "bun",
    join(ROOT, ".github/scripts/analytics/fetch-assistant-insights.ts"),
    "--date-from", dateFrom,
    "--date-to", dateTo,
    "--assistant-only",
    "--fresh",
    `--page-limit=500`,
    `--page-delay-ms=5000`,
  ].join(" ");

  console.log(`[analytics-daily-cron] Running: ${cmd}`);
  const proc = Bun.spawnSync(["bash", "-c", cmd], {
    cwd: ROOT,
    env: { ...process.env },
    timeout: 300_000, // 5 min
  });

  if (proc.exitCode !== 0) {
    console.error(`[analytics-daily-cron] Fetch failed (exit ${proc.exitCode}):`);
    console.error(proc.stderr.toString());
    // Write a minimal summary so the cron job still reports something
    await writeLatestSummary({
      dateFrom, dateTo,
      status: "fetch_failed",
      conversations: 0,
      unanswered: 0,
      error: proc.stderr.toString().slice(0, 500),
    });
    process.exit(0);
  }

  // Read the assistant-summary.md for the daily breakdown
  const summaryPath = join(CACHE_DIR, "assistant-summary.md");
  let summaryText = "";
  if (existsSync(summaryPath)) {
    summaryText = await readFile(summaryPath, "utf-8");
  }

  // Find the latest day file
  const files = [...new Bun.Glob("by-day/????-??-??.md").scanSync(CACHE_DIR)];
  files.sort().reverse();
  const latestDayFile = files.length > 0 ? join(CACHE_DIR, files[0]) : null;

  // Read the latest day's data if available
  let latestDay: any = null;
  if (latestDayFile && existsSync(latestDayFile)) {
    const dayContent = await readFile(latestDayFile, "utf-8");

    // Parse unanswered questions from the "## Unanswered" section
    const unanswered: string[] = [];
    const inUnanswered = dayContent.split("\n## All conversations")[0] || "";
    const lines = inUnanswered.split("\n");
    for (const line of lines) {
      const m = line.match(/^- \*\*(.+?)\*\*/);
      if (m) {
        unanswered.push(m[1]);
      }
    }

    // Extract date from filename
    const dateMatch = files[0].match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "unknown";

    // Count conversations
    const convoMatch = dayContent.match(/- Conversations: \*\*(\d+)\*\*/);
    const unansMatch = dayContent.match(/- Unanswered: \*\*(\d+)\*\*/);
    const totalConvos = convoMatch ? parseInt(convoMatch[1]) : 0;
    const totalUnanswered = unansMatch ? parseInt(unansMatch[1]) : 0;

    latestDay = {
      date,
      conversations: totalConvos,
      unanswered: totalUnanswered,
      unansweredQuestions: unanswered.slice(0, 20), // top 20
      page: files[0],
    };
  }

  // Read the unanswered-index.json
  const unansweredIndexPath = join(CACHE_DIR, "unanswered-index.json");
  let allUnansweredDays: any[] = [];
  if (existsSync(unansweredIndexPath)) {
    try {
      const idx = JSON.parse(await readFile(unansweredIndexPath, "utf-8"));
      allUnansweredDays = idx.days || [];
    } catch {}
  }

  // Read search top
  const searchesPath = join(CACHE_DIR, "searches-top.json");
  let topSearches: any[] = [];
  if (existsSync(searchesPath)) {
    try {
      const s = JSON.parse(await readFile(searchesPath, "utf-8"));
      topSearches = (s.searches || []).slice(0, 10);
    } catch {}
  }

  await writeLatestSummary({
    dateFrom, dateTo,
    status: "ok",
    latestDay,
    allUnansweredDays,
    topSearches,
    lastFetchDate: lastDateTo,
    summaryFile: "by-day/" + (latestDay?.page || ""),
    summaryText: summaryText.slice(0, 2000),
  });

  console.log(`[analytics-daily-cron] Done. Latest: ${latestDay?.date || "none"}`);
}

async function writeLatestSummary(data: any) {
  await writeFile(LATEST_SUMMARY, JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error("[analytics-daily-cron] Fatal:", e);
  process.exit(1);
});
