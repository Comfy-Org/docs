import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { AssistantConversation, DateRange, FeedbackEntry, SearchRow } from "./mintlify-analytics.ts";
import { writeJsonFile } from "./analytics-checkpoint.ts";

const BY_DAY_DIR = "by-day";

export interface SlimConversation {
  id: string;
  timestamp: string;
  query: string;
  resolutionStatus: string;
  queryCategory: string | null;
  pageUrl: string | null;
  sourceCount: number;
  sources: string[];
  responsePreview: string;
}

function truncate(text: string, max = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function toSlim(conversation: AssistantConversation, previewLen = 200): SlimConversation {
  return {
    id: conversation.id,
    timestamp: conversation.timestamp,
    query: truncate(conversation.query, previewLen),
    resolutionStatus: conversation.resolutionStatus,
    queryCategory: conversation.queryCategory,
    pageUrl: conversation.pageUrl,
    sourceCount: conversation.sources.length,
    sources: conversation.sources.map((s) => s.title),
    responsePreview: truncate(conversation.response, previewLen),
  };
}

export function dayFromTimestamp(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export function groupConversationsByDay(
  conversations: AssistantConversation[]
): Map<string, AssistantConversation[]> {
  const map = new Map<string, AssistantConversation[]>();
  for (const row of conversations) {
    const day = dayFromTimestamp(row.timestamp);
    const list = map.get(day) ?? [];
    list.push(row);
    map.set(day, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return map;
}

export interface DayStats {
  date: string;
  conversations: number;
  unanswered: number;
  noSources: number;
}

export function statsByDay(conversations: AssistantConversation[]): DayStats[] {
  const byDay = groupConversationsByDay(conversations);
  return [...byDay.entries()]
    .map(([date, rows]) => ({
      date,
      conversations: rows.length,
      unanswered: rows.filter((r) => r.resolutionStatus === "unanswered").length,
      noSources: rows.filter((r) => r.sources.length === 0).length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildDayMarkdown(day: string, conversations: AssistantConversation[]): string {
  const unanswered = conversations.filter((c) => c.resolutionStatus === "unanswered");
  const lines: string[] = [
    `# Assistant insights — ${day}`,
    "",
    `- Conversations: **${conversations.length}**`,
    `- Unanswered: **${unanswered.length}**`,
    "",
  ];

  if (unanswered.length > 0) {
    lines.push("## Unanswered", "");
    for (const item of unanswered) {
      lines.push(
        `- **${truncate(item.query, 200)}**`,
        `  - Page: ${item.pageUrl ?? "(unknown)"}`,
        `  - Category: ${item.queryCategory ?? "(none)"}`,
        `  - Response: ${truncate(item.response, 180)}`,
        ""
      );
    }
  }

  lines.push("## All conversations", "");
  for (const item of conversations) {
    lines.push(
      `- **${truncate(item.query, 160)}** (${item.resolutionStatus})`,
      `  - ${item.timestamp}${item.pageUrl ? ` · ${item.pageUrl}` : ""}`,
      item.sources.length > 0
        ? `  - Sources: ${item.sources.map((s) => s.title).join("; ")}`
        : "  - Sources: (none)",
      ""
    );
  }

  return lines.join("\n");
}

export function buildIndexMarkdown(
  range: DateRange,
  conversations: AssistantConversation[],
  searches: SearchRow[],
  feedback: FeedbackEntry[],
  dayStats: DayStats[]
): string {
  const unanswered = conversations.filter((c) => c.resolutionStatus === "unanswered");
  const negativeFeedback = feedback.filter((f) => f.helpful === false);

  const lines: string[] = [
    "# Mintlify assistant insights (index)",
    "",
    `Date range: ${range.dateFrom} → ${range.dateTo}`,
    "",
    "## Snapshot",
    "",
    `- Assistant conversations: **${conversations.length}**`,
    `- Unanswered: **${unanswered.length}**`,
    `- Search terms tracked: **${searches.length}**`,
    `- Negative feedback: **${negativeFeedback.length}**`,
    "",
    "## Daily reports (newest first)",
    "",
    "Open a day file for full detail. Large exports are split under `by-day/`.",
    "",
    "| Date | Conversations | Unanswered | Report |",
    "|------|---------------|------------|--------|",
  ];

  for (const row of dayStats) {
    lines.push(
      `| ${row.date} | ${row.conversations} | ${row.unanswered} | [${row.date}.md](by-day/${row.date}.md) |`
    );
  }

  lines.push("", "## Unanswered days", "");
  const unansweredDays = dayStats.filter((d) => d.unanswered > 0);
  if (unansweredDays.length === 0) {
    lines.push("_None in this range._", "");
  } else {
    for (const row of unansweredDays) {
      lines.push(`- **${row.date}** — ${row.unanswered} unanswered → [by-day/${row.date}.md](by-day/${row.date}.md)`);
    }
    lines.push("");
  }

  if (searches.length > 0) {
    lines.push("## Top search terms (all time in range)", "");
    for (const row of searches.slice(0, 15)) {
      lines.push(`- **${row.searchQuery}** — ${row.hits} searches`);
    }
    lines.push("");
  }

  lines.push(
    "## Other files",
    "",
    "- `by-day/YYYY-MM-DD.json` — slim JSON per day",
    "- `searches-top.json` / `feedback-negative.json` — aggregated analytics",
    "- `store/` — raw data for resume/incremental fetch",
    ""
  );

  return lines.join("\n");
}

export async function writeDayPartition(
  cacheDir: string,
  day: string,
  conversations: AssistantConversation[]
): Promise<void> {
  const dir = join(cacheDir, BY_DAY_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${day}.md`), buildDayMarkdown(day, conversations), "utf-8");
  await writeJsonFile(join(dir, `${day}.json`), {
    date: day,
    total: conversations.length,
    unanswered: conversations.filter((c) => c.resolutionStatus === "unanswered").length,
    conversations: conversations.map((c) => toSlim(c)),
  });
}

/** Rewrite daily MD/JSON for given days using the full conversation store. */
export async function writeDayPartitions(
  cacheDir: string,
  allConversations: AssistantConversation[],
  daysToUpdate?: Set<string>
): Promise<string[]> {
  const byDay = groupConversationsByDay(allConversations);
  const days = daysToUpdate ?? new Set(byDay.keys());
  const written: string[] = [];

  for (const day of [...days].sort()) {
    const rows = byDay.get(day) ?? [];
    if (rows.length === 0) continue;
    await writeDayPartition(cacheDir, day, rows);
    written.push(`${BY_DAY_DIR}/${day}.md`);
  }

  return written;
}

export async function writeSplitSummaries(
  cacheDir: string,
  range: DateRange,
  conversations: AssistantConversation[],
  searches: SearchRow[],
  feedback: FeedbackEntry[],
  daysToUpdate?: Set<string>
): Promise<{ dayFiles: string[]; dayStats: DayStats[] }> {
  const dayFiles = await writeDayPartitions(cacheDir, conversations, daysToUpdate);
  const dayStats = statsByDay(conversations);
  await writeFile(
    join(cacheDir, "assistant-summary.md"),
    buildIndexMarkdown(range, conversations, searches, feedback, dayStats),
    "utf-8"
  );
  await writeJsonFile(join(cacheDir, "unanswered-index.json"), {
    range,
    days: dayStats
      .filter((d) => d.unanswered > 0)
      .map((d) => ({ date: d.date, unanswered: d.unanswered, file: `${BY_DAY_DIR}/${d.date}.md` })),
  });
  return { dayFiles, dayStats };
}

export async function writeIndexOnly(
  cacheDir: string,
  range: DateRange,
  conversations: AssistantConversation[],
  searches: SearchRow[],
  feedback: FeedbackEntry[]
): Promise<void> {
  const dayStats = statsByDay(conversations);
  await writeFile(
    join(cacheDir, "assistant-summary.md"),
    buildIndexMarkdown(range, conversations, searches, feedback, dayStats),
    "utf-8"
  );
  await writeJsonFile(join(cacheDir, "unanswered-index.json"), {
    range,
    days: dayStats
      .filter((d) => d.unanswered > 0)
      .map((d) => ({ date: d.date, unanswered: d.unanswered, file: `${BY_DAY_DIR}/${d.date}.md` })),
  });
}

export function daysInBatch(batch: AssistantConversation[]): Set<string> {
  return new Set(batch.map((c) => dayFromTimestamp(c.timestamp)));
}
