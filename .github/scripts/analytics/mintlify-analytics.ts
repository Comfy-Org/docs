const API_BASE = "https://api.mintlify.com/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
/** Mintlify analytics: 100 requests/org/hour shared across all export endpoints. */
export const MINTLIFY_ANALYTICS_HOURLY_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 200;
/** ~100 requests/hour org limit → 36s between pages when unset. */
export const DEFAULT_PAGE_DELAY_MS = 36_000;
const MAX_PAGINATION_PAGES = 10_000;

export type ResolutionStatus = "answered" | "unanswered";

export interface AssistantSource {
  title: string;
  url: string;
}

export interface AssistantConversation {
  id: string;
  timestamp: string;
  query: string;
  response: string;
  sources: AssistantSource[];
  resolutionStatus: ResolutionStatus;
  queryCategory: string | null;
  pageUrl: string | null;
}

export interface AssistantPage {
  conversations: AssistantConversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchRow {
  searchQuery: string;
  hits: number;
  ctr: number;
  topClickedPage: string | null;
  lastSearchedAt: string;
}

export interface SearchPage {
  searches: SearchRow[];
  totalSearches: number;
  nextCursor: string | null;
}

export interface FeedbackEntry {
  id: string;
  path: string;
  comment: string | null;
  createdAt: string | null;
  source: "code_snippet" | "contextual" | "agent" | "thumbs_only";
  status: "pending" | "in_progress" | "resolved" | "dismissed";
  helpful?: boolean;
  contact?: string | null;
  code?: string;
  filename?: string | null;
  lang?: string | null;
}

export interface FeedbackPage {
  feedback: FeedbackEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export interface MintlifyAnalyticsConfig {
  apiKey: string;
  projectId: string;
}

export interface FetchProgress {
  resource: "assistant" | "searches" | "feedback";
  range: DateRange;
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedFetchOptions {
  limit?: number;
  /** Pause after each page (ms). Use ~36000 to stay under 100 req/hour org limit. */
  pageDelayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  onProgress?: (progress: FetchProgress) => void;
  skipChunks?: Set<string>;
  onChunkComplete?: (chunk: DateRange, items: unknown[]) => void | Promise<void>;
  /** Called after each API page (use for incremental disk saves). */
  onPageComplete?: (
    items: unknown[],
    meta: { page: number; chunkTotal: number; range: DateRange }
  ) => void | Promise<void>;
}

export function chunkKey(range: DateRange): string {
  return `${range.dateFrom}_${range.dateTo}`;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mintlify sometimes returns a full URL; only pass the cursor token in the next request. */
function normalizeCursor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.searchParams.get("cursor") ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function isMintlifyApiError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Mintlify API ");
}

export function daysInRange(range: DateRange): number {
  const from = new Date(`${range.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${range.dateTo}T00:00:00.000Z`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function bisectRange(range: DateRange): [DateRange, DateRange] {
  const from = new Date(`${range.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${range.dateTo}T00:00:00.000Z`);
  const mid = new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
  const midDay = isoDateOnly(mid);
  return [
    { dateFrom: range.dateFrom, dateTo: midDay },
    { dateFrom: midDay, dateTo: range.dateTo },
  ];
}

async function mintlifyGet<T>(
  config: MintlifyAnalyticsConfig,
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: PaginatedFetchOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 4;
  const url = `${API_BASE}${path}${buildQuery(params)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // ignore parse errors
        }

        if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const waitMs = Number.isFinite(retryAfterSec)
            ? Math.max(1000, retryAfterSec * 1000)
            : response.status === 429
              ? Math.max(30_000, 1000 * 2 ** attempt)
              : 1000 * 2 ** attempt;
          console.warn(
            `[analytics] ${response.status} ${detail} — retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs / 1000)}s`
          );
          await sleep(waitMs);
          continue;
        }

        if (response.status === 403) {
          throw new Error(
            `Mintlify API 403: ${detail}. Use an Admin API key (mint_…) from the same organization as the project ID.`
          );
        }
        if (response.status === 414) {
          throw new Error(
            `Mintlify API 414: ${detail}. Pagination URL exceeded server limit — use smaller --chunk-days (e.g. 3 or 1).`
          );
        }
        throw new Error(`Mintlify API ${response.status}: ${detail}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (isMintlifyApiError(error)) throw error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const message = isAbort ? `request timed out after ${timeoutMs}ms` : String(error);
      if (attempt < maxRetries) {
        const waitMs = 1000 * 2 ** attempt;
        console.warn(`[analytics] ${message} — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(isAbort ? `Mintlify API timeout: ${message}` : message);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Mintlify API request failed after retries");
}

async function fetchPaginated<TItem>(
  config: MintlifyAnalyticsConfig,
  resource: FetchProgress["resource"],
  path: string,
  range: DateRange,
  readItems: (page: unknown) => TItem[],
  hasMore: (page: unknown, items: TItem[]) => { continue: boolean; cursor?: string },
  options: PaginatedFetchOptions = {}
): Promise<TItem[]> {
  const limit = Math.min(1000, Math.max(1, options.limit ?? DEFAULT_PAGE_LIMIT));
  const pageDelayMs = Math.max(0, options.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS);
  const all: TItem[] = [];
  let cursor: string | undefined;
  let previousCursor: string | undefined;
  let page = 0;

  for (;;) {
    if (page > 0 && pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
    page += 1;
    if (page > MAX_PAGINATION_PAGES) {
      console.warn(
        `[analytics] Stopping pagination after ${MAX_PAGINATION_PAGES} pages (${resource})`
      );
      break;
    }
    // After page 1, cursor encodes the window — omit dateFrom/dateTo to keep the URL short.
    const queryParams = cursor
      ? { limit, cursor }
      : { dateFrom: range.dateFrom, dateTo: range.dateTo, limit };

    const raw = await mintlifyGet<unknown>(config, path, queryParams, options);
    const items = readItems(raw);
    all.push(...items);
    options.onProgress?.({
      resource,
      range,
      page,
      pageSize: items.length,
      total: all.length,
    });
    await options.onPageComplete?.(items, { page, chunkTotal: all.length, range });

    const next = hasMore(raw, items);
    if (!next.continue || !next.cursor) break;
    const nextCursor = normalizeCursor(next.cursor);
    if (!nextCursor || nextCursor === cursor || nextCursor === previousCursor) {
      console.warn(
        `[analytics] Pagination cursor did not advance (${resource}, page ${page}); stopping`
      );
      break;
    }
    previousCursor = cursor;
    cursor = nextCursor;
  }

  return all;
}

async function fetchPaginatedWithBisect<TItem>(
  config: MintlifyAnalyticsConfig,
  resource: FetchProgress["resource"],
  path: string,
  range: DateRange,
  readItems: (page: unknown) => TItem[],
  hasMore: (page: unknown, items: TItem[]) => { continue: boolean; cursor?: string },
  options: PaginatedFetchOptions = {}
): Promise<TItem[]> {
  try {
    return await fetchPaginated(config, resource, path, range, readItems, hasMore, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("414") || daysInRange(range) <= 1) throw error;
    const [left, right] = bisectRange(range);
    console.warn(
      `[analytics] 414 for ${range.dateFrom} → ${range.dateTo}; splitting into ${left.dateFrom}..${left.dateTo} and ${right.dateFrom}..${right.dateTo}`
    );
    const merged = [
      ...(await fetchPaginatedWithBisect(config, resource, path, left, readItems, hasMore, options)),
      ...(await fetchPaginatedWithBisect(config, resource, path, right, readItems, hasMore, options)),
    ];
    return merged;
  }
}

export async function fetchAllAssistantConversations(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  options: PaginatedFetchOptions = {}
): Promise<AssistantConversation[]> {
  return fetchPaginatedWithBisect(
    config,
    "assistant",
    `/analytics/${config.projectId}/assistant`,
    range,
    (page) => (page as AssistantPage).conversations,
    (page) => {
      const p = page as AssistantPage;
      return { continue: p.hasMore && !!p.nextCursor, cursor: p.nextCursor ?? undefined };
    },
    { limit: DEFAULT_PAGE_LIMIT, ...options }
  );
}

export async function fetchAllSearchQueries(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  options: PaginatedFetchOptions = {}
): Promise<{ searches: SearchRow[]; totalSearches: number }> {
  const path = `/analytics/${config.projectId}/searches`;

  async function fetchForRange(subRange: DateRange): Promise<{ searches: SearchRow[]; totalSearches: number }> {
    let totalSearches = 0;
    let capturedTotal = false;
    try {
      const searches = await fetchPaginated(
        config,
        "searches",
        path,
        subRange,
        (page) => {
          const p = page as SearchPage;
          if (!capturedTotal) {
            totalSearches = p.totalSearches;
            capturedTotal = true;
          }
          return p.searches;
        },
        (page) => {
          const p = page as SearchPage;
          return { continue: !!p.nextCursor, cursor: p.nextCursor ?? undefined };
        },
        { limit: DEFAULT_PAGE_LIMIT, ...options }
      );
      return { searches, totalSearches };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("414") || daysInRange(subRange) <= 1) throw error;
      const [left, right] = bisectRange(subRange);
      console.warn(
        `[analytics] 414 for ${subRange.dateFrom} → ${subRange.dateTo}; splitting into ${left.dateFrom}..${left.dateTo} and ${right.dateFrom}..${right.dateTo}`
      );
      const leftResult = await fetchForRange(left);
      const rightResult = await fetchForRange(right);
      return {
        searches: [...leftResult.searches, ...rightResult.searches],
        totalSearches: leftResult.totalSearches + rightResult.totalSearches,
      };
    }
  }

  return fetchForRange(range);
}

export async function fetchAllFeedback(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  options: PaginatedFetchOptions = {}
): Promise<FeedbackEntry[]> {
  return fetchPaginatedWithBisect(
    config,
    "feedback",
    `/analytics/${config.projectId}/feedback`,
    range,
    (page) => (page as FeedbackPage).feedback,
    (page) => {
      const p = page as FeedbackPage;
      return { continue: p.hasMore && !!p.nextCursor, cursor: p.nextCursor ?? undefined };
    },
    { limit: DEFAULT_PAGE_LIMIT, ...options }
  );
}

export function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateRangeForDays(days: number): DateRange {
  const dateTo = new Date();
  dateTo.setUTCDate(dateTo.getUTCDate() + 1);
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - Math.max(1, days));
  return {
    dateFrom: isoDateOnly(dateFrom),
    dateTo: isoDateOnly(dateTo),
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate YYYY-MM-DD (UTC calendar date). */
export function parseIsoDateOnly(value: string, label: string): string {
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD (got "${value}")`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || isoDateOnly(parsed) !== trimmed) {
    throw new Error(`${label} is not a valid calendar date (got "${value}")`);
  }
  return trimmed;
}

/** Inclusive last day — converted to exclusive `dateTo` for the API. */
export function dateRangeExplicit(dateFrom: string, dateToInclusive: string): DateRange {
  const from = parseIsoDateOnly(dateFrom, "--date-from");
  const through = parseIsoDateOnly(dateToInclusive, "--date-to");
  const exclusiveEnd = new Date(`${through}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  const dateTo = isoDateOnly(exclusiveEnd);
  if (from >= dateTo) {
    throw new Error(`--date-from (${from}) must be before --date-to (${through})`);
  }
  return { dateFrom: from, dateTo };
}

/** Split [dateFrom, dateTo) into smaller windows (dateTo is exclusive). */
export function splitDateRange(range: DateRange, chunkDays: number): DateRange[] {
  const chunks: DateRange[] = [];
  let cursor = new Date(`${range.dateFrom}T00:00:00.000Z`);
  const end = new Date(`${range.dateTo}T00:00:00.000Z`);

  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      dateFrom: isoDateOnly(cursor),
      dateTo: isoDateOnly(chunkEnd),
    });
    cursor = chunkEnd;
  }

  return chunks;
}

export async function fetchAssistantConversationsChunked(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  chunkDays: number,
  options: PaginatedFetchOptions = {}
): Promise<AssistantConversation[]> {
  const chunks = splitDateRange(range, chunkDays);
  const merged: AssistantConversation[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (options.skipChunks?.has(chunkKey(chunk))) {
      console.log(
        `[analytics] assistant chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo} (skipped, cached)`
      );
      continue;
    }

    console.log(
      `[analytics] assistant chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo}`
    );
    const batch = await fetchAllAssistantConversations(config, chunk, {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        process.stdout.write(
          `\r[analytics]   page ${progress.page}, +${progress.pageSize} (chunk total ${progress.total}, all ${merged.length + progress.total})   `
        );
      },
      onPageComplete: options.onPageComplete,
    });
    process.stdout.write("\n");

    for (const row of batch) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    await options.onChunkComplete?.(chunk, batch);
    console.log(`[analytics]   chunk done: ${batch.length} rows (${merged.length} unique this run)`);
  }

  return merged;
}

export async function fetchSearchQueriesChunked(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  chunkDays: number,
  options: PaginatedFetchOptions = {}
): Promise<{ searches: SearchRow[]; totalSearches: number }> {
  const chunks = splitDateRange(range, chunkDays);
  const byQuery = new Map<string, SearchRow>();
  let totalSearches = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (options.skipChunks?.has(chunkKey(chunk))) {
      console.log(
        `[analytics] searches chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo} (skipped, cached)`
      );
      continue;
    }

    console.log(
      `[analytics] searches chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo}`
    );
    const { searches, totalSearches: chunkTotal } = await fetchAllSearchQueries(config, chunk, {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        process.stdout.write(
          `\r[analytics]   page ${progress.page}, +${progress.pageSize} (chunk ${progress.total})   `
        );
      },
      onPageComplete: options.onPageComplete,
    });
    process.stdout.write("\n");
    totalSearches += chunkTotal;

    for (const row of searches) {
      const existing = byQuery.get(row.searchQuery);
      if (!existing) {
        byQuery.set(row.searchQuery, { ...row });
        continue;
      }
      existing.hits += row.hits;
      if (row.lastSearchedAt > existing.lastSearchedAt) {
        existing.lastSearchedAt = row.lastSearchedAt;
        existing.topClickedPage = row.topClickedPage;
        existing.ctr = row.ctr;
      }
    }
    await options.onChunkComplete?.(chunk, searches);
  }

  const searches = [...byQuery.values()].sort((a, b) => b.hits - a.hits);
  return { searches, totalSearches };
}

export async function fetchFeedbackChunked(
  config: MintlifyAnalyticsConfig,
  range: DateRange,
  chunkDays: number,
  options: PaginatedFetchOptions = {}
): Promise<FeedbackEntry[]> {
  const chunks = splitDateRange(range, chunkDays);
  const merged: FeedbackEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (options.skipChunks?.has(chunkKey(chunk))) {
      console.log(
        `[analytics] feedback chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo} (skipped, cached)`
      );
      continue;
    }

    console.log(
      `[analytics] feedback chunk ${i + 1}/${chunks.length}: ${chunk.dateFrom} → ${chunk.dateTo}`
    );
    const batch = await fetchAllFeedback(config, chunk, {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        process.stdout.write(
          `\r[analytics]   page ${progress.page}, +${progress.pageSize} (chunk ${progress.total})   `
        );
      },
      onPageComplete: options.onPageComplete,
    });
    process.stdout.write("\n");

    for (const row of batch) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    await options.onChunkComplete?.(chunk, batch);
  }

  return merged;
}
