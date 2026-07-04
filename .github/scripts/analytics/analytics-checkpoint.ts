import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import { dirname, join } from "path";
import type {
  AssistantConversation,
  DateRange,
  FeedbackEntry,
  SearchRow,
} from "./mintlify-analytics.ts";
import { chunkKey, isoDateOnly } from "./mintlify-analytics.ts";

export const CHECKPOINT_FILE = "checkpoint.json";
export const STORE_DIR = "store";

export interface FetchCheckpoint {
  version: 1;
  status: "in_progress" | "failed" | "complete";
  projectId: string;
  targetRange: DateRange;
  chunkDays: number;
  mode: "lean" | "full";
  assistantOnly: boolean;
  startedAt: string;
  updatedAt: string;
  phase: "assistant" | "searches" | "feedback" | "finalize";
  completedChunks: {
    assistant: string[];
    searches: string[];
    feedback: string[];
  };
  error?: string;
}

export interface ConversationStore {
  range: DateRange;
  conversations: AssistantConversation[];
}

export interface SearchStore {
  range: DateRange;
  totalSearches: number;
  searches: SearchRow[];
}

export interface FeedbackStore {
  range: DateRange;
  feedback: FeedbackEntry[];
}

export interface ManifestSnapshot {
  fetchedAt: string;
  projectId: string;
  dateFrom: string;
  dateTo: string;
}

export function storePath(cacheDir: string, name: string): string {
  return join(cacheDir, STORE_DIR, name);
}

export function checkpointPath(cacheDir: string): string {
  return join(cacheDir, CHECKPOINT_FILE);
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

export async function loadCheckpoint(cacheDir: string): Promise<FetchCheckpoint | null> {
  return readJsonFile<FetchCheckpoint>(checkpointPath(cacheDir));
}

export async function saveCheckpoint(cacheDir: string, checkpoint: FetchCheckpoint): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  await writeJsonFile(checkpointPath(cacheDir), checkpoint);
}

export async function clearCheckpoint(cacheDir: string): Promise<void> {
  try {
    await unlink(checkpointPath(cacheDir));
  } catch {
    // ignore missing file
  }
}

export function completedChunkSet(checkpoint: FetchCheckpoint, resource: keyof FetchCheckpoint["completedChunks"]): Set<string> {
  return new Set(checkpoint.completedChunks[resource]);
}

export async function markChunkComplete(
  cacheDir: string,
  checkpoint: FetchCheckpoint,
  resource: keyof FetchCheckpoint["completedChunks"],
  range: DateRange
): Promise<void> {
  const key = chunkKey(range);
  if (!checkpoint.completedChunks[resource].includes(key)) {
    checkpoint.completedChunks[resource].push(key);
  }
  await saveCheckpoint(cacheDir, checkpoint);
}

export async function loadConversationStore(cacheDir: string): Promise<ConversationStore | null> {
  return readJsonFile<ConversationStore>(storePath(cacheDir, "conversations.json"));
}

export async function saveConversationStore(cacheDir: string, store: ConversationStore): Promise<void> {
  await writeJsonFile(storePath(cacheDir, "conversations.json"), store);
}

export async function loadSearchStore(cacheDir: string): Promise<SearchStore | null> {
  return readJsonFile<SearchStore>(storePath(cacheDir, "searches.json"));
}

export async function saveSearchStore(cacheDir: string, store: SearchStore): Promise<void> {
  await writeJsonFile(storePath(cacheDir, "searches.json"), store);
}

export async function loadFeedbackStore(cacheDir: string): Promise<FeedbackStore | null> {
  return readJsonFile<FeedbackStore>(storePath(cacheDir, "feedback.json"));
}

export async function saveFeedbackStore(cacheDir: string, store: FeedbackStore): Promise<void> {
  await writeJsonFile(storePath(cacheDir, "feedback.json"), store);
}

export function mergeConversations(
  existing: AssistantConversation[],
  incoming: AssistantConversation[]
): AssistantConversation[] {
  const byId = new Map<string, AssistantConversation>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function mergeSearches(existing: SearchRow[], incoming: SearchRow[]): SearchRow[] {
  const byQuery = new Map<string, SearchRow>();
  for (const row of existing) byQuery.set(row.searchQuery, { ...row });
  for (const row of incoming) {
    const prev = byQuery.get(row.searchQuery);
    if (!prev) {
      byQuery.set(row.searchQuery, { ...row });
      continue;
    }
    // Overlapping incremental windows re-fetch the same range — keep the fresher row, don't sum hits.
    if (row.lastSearchedAt >= prev.lastSearchedAt) {
      prev.hits = row.hits;
      prev.lastSearchedAt = row.lastSearchedAt;
      prev.topClickedPage = row.topClickedPage;
      prev.ctr = row.ctr;
    }
  }
  return [...byQuery.values()].sort((a, b) => b.hits - a.hits);
}

export function mergeFeedback(existing: FeedbackEntry[], incoming: FeedbackEntry[]): FeedbackEntry[] {
  const byId = new Map<string, FeedbackEntry>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}

export function unionRange(a: DateRange, b: DateRange): DateRange {
  return {
    dateFrom: a.dateFrom < b.dateFrom ? a.dateFrom : b.dateFrom,
    dateTo: a.dateTo > b.dateTo ? a.dateTo : b.dateTo,
  };
}

/** Incremental fetch window: from last manifest dateTo (with 1-day overlap) through tomorrow. */
export function incrementalRangeFromManifest(manifest: ManifestSnapshot): DateRange | null {
  const dateTo = new Date();
  dateTo.setUTCDate(dateTo.getUTCDate() + 1);
  const from = new Date(`${manifest.dateTo}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const dateFrom = isoDateOnly(from);
  const nextDateTo = isoDateOnly(dateTo);
  if (dateFrom >= nextDateTo) return null;
  return { dateFrom, dateTo: nextDateTo };
}

export function shouldResume(checkpoint: FetchCheckpoint | null): checkpoint is FetchCheckpoint {
  return !!checkpoint && (checkpoint.status === "in_progress" || checkpoint.status === "failed");
}
