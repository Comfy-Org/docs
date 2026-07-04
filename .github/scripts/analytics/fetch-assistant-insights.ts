#!/usr/bin/env bun
/**
 * Pull Mintlify assistant/search/feedback analytics into a local cache for docs work.
 *
 * Usage:
 *   pnpm analytics:fetch                    # incremental if cache exists, else last 30 days
 *   pnpm analytics:fetch:all                # ~1 year, chunked + checkpoint resume
 *   pnpm analytics:fetch:assistant          # AI Q&A only (default 30d; use --all for 1y)
 *   pnpm analytics:fetch -- --fresh           # ignore cache, refetch window
 *   pnpm analytics:fetch -- --resume          # resume interrupted run only
 *   pnpm analytics:fetch -- --days 14
 *   pnpm analytics:fetch -- --date-from 2025-01-01 --date-to 2025-12-31
 *   pnpm analytics:fetch -- --assistant-only  # skip searches & feedback
 *   pnpm analytics:fetch -- --full
 *   pnpm analytics:fetch:dry-run
 *
 * Checkpoint / incremental:
 *   - Each chunk writes immediately to tmp/analytics-cache/ (summary + JSON)
 *   - store/ holds raw merge state; checkpoint.json tracks progress for resume
 *
 * Output: tmp/analytics-cache/ (gitignored)
 *   assistant-summary.md     — short index + links to by-day/
 *   by-day/YYYY-MM-DD.md     — one readable file per day
 *   by-day/YYYY-MM-DD.json   — slim JSON per day
 */

import { mkdir } from "fs/promises";
import { join } from "path";
import { loadEnvLocal, ROOT } from "../cms/cms-env.ts";
import {
  type FetchCheckpoint,
  clearCheckpoint,
  completedChunkSet,
  incrementalRangeFromManifest,
  loadCheckpoint,
  loadConversationStore,
  loadFeedbackStore,
  loadSearchStore,
  markChunkComplete,
  mergeConversations,
  mergeFeedback,
  mergeSearches,
  readJsonFile,
  saveCheckpoint,
  saveConversationStore,
  saveFeedbackStore,
  saveSearchStore,
  shouldResume,
  unionRange,
  writeJsonFile,
} from "./analytics-checkpoint.ts";
import {
  type AssistantConversation,
  type DateRange,
  type FeedbackEntry,
  type SearchRow,
  dateRangeExplicit,
  dateRangeForDays,
  fetchAssistantConversationsChunked,
  fetchFeedbackChunked,
  fetchSearchQueriesChunked,
  DEFAULT_PAGE_DELAY_MS,
  DEFAULT_PAGE_LIMIT,
  MINTLIFY_ANALYTICS_HOURLY_LIMIT,
  daysInRange,
} from "./mintlify-analytics.ts";
import {
  daysInBatch,
  statsByDay,
  writeDayPartitions,
  writeIndexOnly,
} from "./analytics-writers.ts";

const CACHE_DIR = join(ROOT, "tmp/analytics-cache");
const DEFAULT_DAYS = 30;
const ALL_DAYS = 365;
const DEFAULT_CHUNK_DAYS = 7;
const TOP_SEARCHES = 100;
/** Persist store + summary to disk every N API pages (searches can be 100+ pages per chunk). */
const SAVE_EVERY_PAGES = 10;

type RunMode = "fresh" | "incremental" | "resume";

interface CliOptions {
  days: number;
  chunkDays: number;
  pageLimit: number;
  pageDelayMs: number;
  dateFrom?: string;
  dateTo?: string;
  assistantOnly: boolean;
  dryRun: boolean;
  all: boolean;
  full: boolean;
  fresh: boolean;
  incremental: boolean;
  resume: boolean;
}

interface Manifest {
  fetchedAt: string;
  status: "in_progress" | "complete";
  projectId: string;
  dateFrom: string;
  dateTo: string;
  mode: "lean" | "full";
  chunkDays: number;
  lastRun: RunMode;
  outputDir: string;
  counts: {
    assistantConversations: number;
    unansweredAssistant: number;
    assistantWithoutSources: number;
    searches: number;
    feedback: number;
    negativeFeedback: number;
  };
  files: string[];
  dayFileCount?: number;
}

function clampPageLimit(value: number): number {
  return Math.min(1000, Math.max(1, value));
}

function parseArgs(argv: string[]): CliOptions {
  const pageLimitEnv = Number(process.env.ANALYTICS_PAGE_LIMIT);
  const pageDelayEnv = Number(process.env.ANALYTICS_PAGE_DELAY_MS);
  const options: CliOptions = {
    days: DEFAULT_DAYS,
    chunkDays: DEFAULT_CHUNK_DAYS,
    pageLimit:
      Number.isFinite(pageLimitEnv) && pageLimitEnv > 0
        ? clampPageLimit(pageLimitEnv)
        : DEFAULT_PAGE_LIMIT,
    pageDelayMs:
      Number.isFinite(pageDelayEnv) && pageDelayEnv >= 0 ? pageDelayEnv : DEFAULT_PAGE_DELAY_MS,
    assistantOnly: false,
    dryRun: false,
    all: false,
    full: false,
    fresh: false,
    incremental: false,
    resume: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--assistant-only") options.assistantOnly = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--full") options.full = true;
    else if (arg === "--fresh") options.fresh = true;
    else if (arg === "--incremental") options.incremental = true;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--page-limit") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1 || value > 1000) {
        throw new Error("--page-limit must be between 1 and 1000");
      }
      options.pageLimit = clampPageLimit(value);
    } else if (arg.startsWith("--page-limit=")) {
      const value = Number(arg.slice("--page-limit=".length));
      if (!Number.isFinite(value) || value < 1 || value > 1000) {
        throw new Error("--page-limit must be between 1 and 1000");
      }
      options.pageLimit = clampPageLimit(value);
    } else if (arg === "--page-delay-ms") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--page-delay-ms must be >= 0");
      }
      options.pageDelayMs = value;
    } else if (arg.startsWith("--page-delay-ms=")) {
      const value = Number(arg.slice("--page-delay-ms=".length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--page-delay-ms must be >= 0");
      }
      options.pageDelayMs = value;
    }
    else if (arg === "--days") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error("--days must be a positive number");
      options.days = value;
    } else if (arg.startsWith("--days=")) {
      const value = Number(arg.slice("--days=".length));
      if (!Number.isFinite(value) || value < 1) throw new Error("--days must be a positive number");
      options.days = value;
    } else if (arg === "--chunk-days") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--chunk-days must be a positive number");
      }
      options.chunkDays = value;
    } else if (arg.startsWith("--chunk-days=")) {
      const value = Number(arg.slice("--chunk-days=".length));
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--chunk-days must be a positive number");
      }
      options.chunkDays = value;
    } else if (arg === "--date-from") {
      options.dateFrom = argv[++i];
    } else if (arg.startsWith("--date-from=")) {
      options.dateFrom = arg.slice("--date-from=".length);
    } else if (arg === "--date-to") {
      options.dateTo = argv[++i];
    } else if (arg.startsWith("--date-to=")) {
      options.dateTo = arg.slice("--date-to=".length);
    }
  }

  if (options.dateFrom && !options.dateTo) {
    throw new Error("--date-from requires --date-to (both ends of the range)");
  }
  if (options.dateTo && !options.dateFrom) {
    throw new Error("--date-to requires --date-from");
  }

  return options;
}

function resolveFetchRange(options: CliOptions): DateRange {
  if (options.dateFrom && options.dateTo) {
    if (options.all) {
      console.log("[analytics] Using --date-from/--date-to (--all ignored)");
    }
    return dateRangeExplicit(options.dateFrom, options.dateTo);
  }
  const daySpan = options.all ? ALL_DAYS : options.days;
  return dateRangeForDays(daySpan);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.local.example → .env.local and fill it in.`);
  }
  return value;
}

function createCheckpoint(
  projectId: string,
  range: DateRange,
  chunkDays: number,
  mode: "lean" | "full",
  assistantOnly: boolean
): FetchCheckpoint {
  return {
    version: 1,
    status: "in_progress",
    projectId,
    targetRange: range,
    chunkDays,
    mode,
    assistantOnly,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: "assistant",
    completedChunks: { assistant: [], searches: [], feedback: [] },
  };
}

function resolveRunMode(
  options: CliOptions,
  checkpoint: FetchCheckpoint | null,
  manifest: Manifest | null,
  projectId: string
): RunMode {
  if (options.resume) {
    if (!shouldResume(checkpoint)) {
      throw new Error("No interrupted fetch to resume (checkpoint.json missing or complete).");
    }
    return "resume";
  }
  if (options.fresh) return "fresh";
  if (shouldResume(checkpoint)) return "resume";
  if ((options.incremental || manifest) && manifest?.projectId === projectId && !options.all) {
    return "incremental";
  }
  return "fresh";
}

async function writeOutputs(
  options: CliOptions,
  runMode: RunMode,
  projectId: string,
  range: DateRange,
  chunkDays: number,
  conversations: AssistantConversation[],
  searches: SearchRow[],
  totalSearches: number,
  feedback: FeedbackEntry[],
  status: Manifest["status"] = "complete",
  logWrite = false,
  daysToUpdate?: Set<string>
): Promise<void> {
  const unanswered = conversations.filter((c) => c.resolutionStatus === "unanswered");
  const noSources = conversations.filter((c) => c.sources.length === 0);
  const negativeFeedback = feedback.filter((f) => f.helpful === false);
  const topSearches = searches.slice(0, TOP_SEARCHES);
  const dayStats = statsByDay(conversations);

  if (daysToUpdate && daysToUpdate.size > 0) {
    await writeDayPartitions(CACHE_DIR, conversations, daysToUpdate);
  }

  await writeIndexOnly(CACHE_DIR, range, conversations, topSearches, negativeFeedback);

  const files = [
    "manifest.json",
    "assistant-summary.md",
    "unanswered-index.json",
    "by-day/YYYY-MM-DD.md",
    "by-day/YYYY-MM-DD.json",
    ...(options.full ? ["assistant-conversations.json"] : []),
    ...(options.assistantOnly
      ? []
      : [
          options.full ? "searches.json" : "searches-top.json",
          options.full ? "feedback.json" : "feedback-negative.json",
        ]),
  ];

  const manifest: Manifest = {
    fetchedAt: new Date().toISOString(),
    status,
    projectId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    mode: options.full ? "full" : "lean",
    chunkDays,
    lastRun: runMode,
    outputDir: CACHE_DIR,
    dayFileCount: dayStats.length,
    counts: {
      assistantConversations: conversations.length,
      unansweredAssistant: unanswered.length,
      assistantWithoutSources: noSources.length,
      searches: searches.length,
      feedback: feedback.length,
      negativeFeedback: negativeFeedback.length,
    },
    files,
  };

  await writeJsonFile(join(CACHE_DIR, "manifest.json"), manifest);

  if (options.full) {
    await writeJsonFile(join(CACHE_DIR, "assistant-conversations.json"), {
      range,
      total: conversations.length,
      conversations,
    });
  }

  if (!options.assistantOnly) {
    if (options.full) {
      await writeJsonFile(join(CACHE_DIR, "searches.json"), { range, totalSearches, searches });
      await writeJsonFile(join(CACHE_DIR, "feedback.json"), { range, total: feedback.length, feedback });
    } else {
      await writeJsonFile(join(CACHE_DIR, "searches-top.json"), {
        range,
        totalSearches,
        top: TOP_SEARCHES,
        searches: topSearches,
      });
      await writeJsonFile(join(CACHE_DIR, "feedback-negative.json"), {
        range,
        total: negativeFeedback.length,
        feedback: negativeFeedback,
      });
    }
  }

  if (logWrite) {
    const dayHint =
      daysToUpdate && daysToUpdate.size > 0
        ? `, updated days: ${[...daysToUpdate].sort().join(", ")}`
        : "";
    console.log(
      `[analytics] Updated ${CACHE_DIR} (${conversations.length} conversations, ${unanswered.length} unanswered${dayHint})`
    );
  }
}

/** Write user-facing cache files from current in-memory stores (called after each chunk). */
async function flushOutputs(
  options: CliOptions,
  runMode: RunMode,
  projectId: string,
  outputRange: DateRange,
  chunkDays: number,
  conversationStore: { conversations: AssistantConversation[] },
  searchStore: { searches: SearchRow[]; totalSearches: number },
  feedbackStore: { feedback: FeedbackEntry[] },
  status: Manifest["status"],
  logWrite: boolean,
  daysToUpdate?: Set<string>
): Promise<void> {
  await writeOutputs(
    options,
    runMode,
    projectId,
    outputRange,
    chunkDays,
    conversationStore.conversations,
    searchStore.searches,
    searchStore.totalSearches,
    feedbackStore.feedback,
    status,
    logWrite,
    daysToUpdate
  );
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const options = parseArgs(process.argv.slice(2));
  const apiKey = requireEnv("MINTLIFY_API_KEY");
  const projectId = requireEnv("MINTLIFY_PROJECT_ID");
  const config = { apiKey, projectId };

  await mkdir(CACHE_DIR, { recursive: true });
  console.log(`[analytics] Output directory: ${CACHE_DIR}`);

  const existingManifest = await readJsonFile<Manifest>(join(CACHE_DIR, "manifest.json"));
  let checkpoint = await loadCheckpoint(CACHE_DIR);
  const runMode = resolveRunMode(options, checkpoint, existingManifest, projectId);

  let fetchRange: DateRange;
  if (runMode === "resume" && checkpoint) {
    fetchRange = checkpoint.targetRange;
    console.log(`[analytics] Resuming interrupted fetch (${checkpoint.phase} phase)`);
  } else if (runMode === "incremental" && existingManifest) {
    const inc = incrementalRangeFromManifest(existingManifest);
    if (!inc) {
      console.log("[analytics] Already up to date — refreshing summary from store");
      const conversations = (await loadConversationStore(CACHE_DIR))?.conversations ?? [];
      const searchStoreSnapshot = await loadSearchStore(CACHE_DIR);
      const searches = searchStoreSnapshot?.searches ?? [];
      const totalSearches = searchStoreSnapshot?.totalSearches ?? 0;
      const feedback = (await loadFeedbackStore(CACHE_DIR))?.feedback ?? [];
      const range = {
        dateFrom: existingManifest.dateFrom,
        dateTo: existingManifest.dateTo,
      };
      if (!options.dryRun) {
        await writeOutputs(
          options,
          "incremental",
          projectId,
          range,
          existingManifest.chunkDays,
          conversations,
          searches,
          totalSearches,
          feedback
        );
      }
      return;
    }
    fetchRange = inc;
    console.log(`[analytics] Incremental update: ${fetchRange.dateFrom} → ${fetchRange.dateTo}`);
  } else {
    fetchRange = resolveFetchRange(options);
    const windowLabel = options.all ? "Full fetch (1 year)" : "Fetch window";
    console.log(`[analytics] ${windowLabel}: ${fetchRange.dateFrom} → ${fetchRange.dateTo}`);
  }

  const chunkDays = Math.min(options.chunkDays, daysInRange(fetchRange));

  let conversationStore =
    runMode === "fresh"
      ? { range: fetchRange, conversations: [] as AssistantConversation[] }
      : (await loadConversationStore(CACHE_DIR)) ?? { range: fetchRange, conversations: [] };
  let searchStore =
    runMode === "fresh"
      ? { range: fetchRange, totalSearches: 0, searches: [] as SearchRow[] }
      : (await loadSearchStore(CACHE_DIR)) ?? { range: fetchRange, totalSearches: 0, searches: [] };
  let feedbackStore =
    runMode === "fresh"
      ? { range: fetchRange, feedback: [] as FeedbackEntry[] }
      : (await loadFeedbackStore(CACHE_DIR)) ?? { range: fetchRange, feedback: [] };

  if (runMode === "fresh") {
    await clearCheckpoint(CACHE_DIR);
    checkpoint = createCheckpoint(
      projectId,
      fetchRange,
      chunkDays,
      options.full ? "full" : "lean",
      options.assistantOnly
    );
    await saveCheckpoint(CACHE_DIR, checkpoint);
  } else if (runMode === "incremental") {
    checkpoint = createCheckpoint(
      projectId,
      fetchRange,
      chunkDays,
      options.full ? "full" : "lean",
      options.assistantOnly
    );
    await saveCheckpoint(CACHE_DIR, checkpoint);
  } else if (!checkpoint) {
    throw new Error("Resume requested but checkpoint.json is missing.");
  }

  console.log(
    `[analytics] ${projectId} | mode ${runMode} | chunk ${chunkDays}d | output ${options.full ? "full" : "lean"}${options.assistantOnly ? " | assistant-only" : ""}`
  );
  const reqPerHour =
    options.pageDelayMs > 0
      ? Math.floor(3_600_000 / options.pageDelayMs)
      : MINTLIFY_ANALYTICS_HOURLY_LIMIT;
  console.log(
    `[analytics] Rate: ${options.pageLimit}/page, ${options.pageDelayMs}ms delay (~${reqPerHour} req/h; Mintlify org limit ${MINTLIFY_ANALYTICS_HOURLY_LIMIT}/h)`
  );
  if (reqPerHour > MINTLIFY_ANALYTICS_HOURLY_LIMIT) {
    console.warn(
      `[analytics] Delay may be too short for ${MINTLIFY_ANALYTICS_HOURLY_LIMIT}/h limit — try --page-delay-ms 36000`
    );
  }

  const fetchOpts = {
    limit: options.pageLimit,
    pageDelayMs: options.pageDelayMs,
  };

  if (options.dryRun) {
    console.log("[analytics] Dry run — would fetch and write cache");
    return;
  }

  const cp = checkpoint!;

  const outputRange = (): DateRange =>
    runMode === "incremental" && existingManifest
      ? unionRange(
          { dateFrom: existingManifest.dateFrom, dateTo: existingManifest.dateTo },
          conversationStore.range
        )
      : conversationStore.range;

  let pagesSinceDiskSave = 0;

  async function persistToDisk(label: string, daysToUpdate?: Set<string>): Promise<void> {
    await saveConversationStore(CACHE_DIR, conversationStore);
    await saveSearchStore(CACHE_DIR, searchStore);
    await saveFeedbackStore(CACHE_DIR, feedbackStore);
    await flushOutputs(
      options,
      runMode,
      projectId,
      outputRange(),
      chunkDays,
      conversationStore,
      searchStore,
      feedbackStore,
      "in_progress",
      false,
      daysToUpdate
    );
    cp.updatedAt = new Date().toISOString();
    await saveCheckpoint(CACHE_DIR, cp);
    pagesSinceDiskSave = 0;
    console.log(`\n[analytics]   💾 saved ${label}`);
    console.log(`[analytics]      ${join(CACHE_DIR, "store/searches.json")} (${searchStore.searches.length} unique search terms)`);
    console.log(`[analytics]      ${join(CACHE_DIR, "store/conversations.json")} (${conversationStore.conversations.length} conversations)`);
    console.log(`[analytics]      ${join(CACHE_DIR, "searches-top.json")}, manifest.json, checkpoint.json`);
    console.log(
      `[analytics]      (updates existing files — tmp/ is gitignored, use Cmd+P to open or enable "Show Excluded Files")`
    );
  }

  function trackPagePersist(
    label: string,
    mergeFn: () => Set<string> | undefined
  ): (items: unknown[]) => Promise<void> {
    return async (items) => {
      pagesSinceDiskSave += 1;
      if (pagesSinceDiskSave >= SAVE_EVERY_PAGES) {
        await persistToDisk(label, mergeFn());
      }
    };
  }

  try {
    if (cp.phase === "assistant") {
      await fetchAssistantConversationsChunked(config, fetchRange, chunkDays, {
        ...fetchOpts,
        skipChunks: completedChunkSet(cp, "assistant"),
        onPageComplete: async (items) => {
          conversationStore.conversations = mergeConversations(
            conversationStore.conversations,
            items as AssistantConversation[]
          );
          await trackPagePersist(
            `assistant progress (${conversationStore.conversations.length} conversations)`,
            () => daysInBatch(items as AssistantConversation[])
          )(items);
        },
        onChunkComplete: async (chunk, batch) => {
          conversationStore.conversations = mergeConversations(
            conversationStore.conversations,
            batch as AssistantConversation[]
          );
          conversationStore.range = unionRange(conversationStore.range, chunk);
          await markChunkComplete(CACHE_DIR, cp, "assistant", chunk);
          await persistToDisk(
            `assistant chunk ${chunk.dateFrom} → ${chunk.dateTo}`,
            daysInBatch(batch as AssistantConversation[])
          );
        },
      });
      cp.phase = options.assistantOnly ? "finalize" : "searches";
      await saveCheckpoint(CACHE_DIR, cp);
      console.log(`[analytics] Assistant total in store: ${conversationStore.conversations.length}`);
      await persistToDisk("assistant phase complete");
      console.log(
        `[analytics] ✓ AI Q&A ready → assistant-summary.md, by-day/, unanswered-index.json`
      );
      if (!options.assistantOnly) {
        console.log(`[analytics] Continuing with searches, then feedback…`);
      }
    }

    if (!options.assistantOnly && (cp.phase === "searches" || cp.phase === "assistant")) {
      if (cp.phase === "assistant") cp.phase = "searches";
      await fetchSearchQueriesChunked(config, fetchRange, chunkDays, {
        ...fetchOpts,
        skipChunks: completedChunkSet(cp, "searches"),
        onPageComplete: async (items) => {
          searchStore.searches = mergeSearches(searchStore.searches, items as SearchRow[]);
          await trackPagePersist(
            `searches progress (${searchStore.searches.length} terms)`,
            () => undefined
          )(items);
        },
        onChunkComplete: async (chunk, batch) => {
          searchStore.searches = mergeSearches(searchStore.searches, batch as SearchRow[]);
          searchStore.range = unionRange(searchStore.range, chunk);
          await markChunkComplete(CACHE_DIR, cp, "searches", chunk);
          await persistToDisk(
            `searches chunk ${chunk.dateFrom} → ${chunk.dateTo} (${searchStore.searches.length} terms)`
          );
        },
      });
      cp.phase = "feedback";
      await saveCheckpoint(CACHE_DIR, cp);
      console.log(`[analytics] Search terms in store: ${searchStore.searches.length}`);
    }

    if (!options.assistantOnly && (cp.phase === "feedback" || cp.phase === "searches")) {
      if (cp.phase === "searches") cp.phase = "feedback";
      await fetchFeedbackChunked(config, fetchRange, chunkDays, {
        ...fetchOpts,
        skipChunks: completedChunkSet(cp, "feedback"),
        onPageComplete: async (items) => {
          feedbackStore.feedback = mergeFeedback(feedbackStore.feedback, items as FeedbackEntry[]);
          await trackPagePersist(
            `feedback progress (${feedbackStore.feedback.length} entries)`,
            () => undefined
          )(items);
        },
        onChunkComplete: async (chunk, batch) => {
          feedbackStore.feedback = mergeFeedback(feedbackStore.feedback, batch as FeedbackEntry[]);
          feedbackStore.range = unionRange(feedbackStore.range, chunk);
          await markChunkComplete(CACHE_DIR, cp, "feedback", chunk);
          await persistToDisk(
            `feedback chunk ${chunk.dateFrom} → ${chunk.dateTo} (${feedbackStore.feedback.length} entries)`
          );
        },
      });
      cp.phase = "finalize";
      await saveCheckpoint(CACHE_DIR, cp);
      console.log(`[analytics] Feedback entries in store: ${feedbackStore.feedback.length}`);
    }

    await writeOutputs(
      options,
      runMode,
      projectId,
      outputRange(),
      chunkDays,
      conversationStore.conversations,
      searchStore.searches,
      searchStore.totalSearches,
      feedbackStore.feedback,
      "complete",
      false
    );

    cp.status = "complete";
    cp.phase = "finalize";
    await saveCheckpoint(CACHE_DIR, cp);
    await clearCheckpoint(CACHE_DIR);

    console.log(`[analytics] Done → tmp/analytics-cache/`);
    console.log(
      `[analytics] Unanswered: ${conversationStore.conversations.filter((c) => c.resolutionStatus === "unanswered").length} | Start with assistant-summary.md`
    );
  } catch (error) {
    cp.status = "failed";
    cp.error = error instanceof Error ? error.message : String(error);
    await saveCheckpoint(CACHE_DIR, cp);
    if (
      conversationStore.conversations.length > 0 ||
      searchStore.searches.length > 0 ||
      feedbackStore.feedback.length > 0
    ) {
      await persistToDisk("partial progress after error");
      console.error(`[analytics] Partial results saved under ${CACHE_DIR}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`[analytics] ${error instanceof Error ? error.message : String(error)}`);
  console.error("[analytics] Re-run the same command to resume from checkpoint.json");
  process.exit(1);
});
