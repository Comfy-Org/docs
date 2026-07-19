# Mintlify analytics cache

Local cache of Mintlify AI assistant, search, and feedback data for docs gap analysis.

**Credentials:** [`.env.local.example`](../../../.env.local.example)

## Design

### Goal

Find where the docs AI assistant fails (`unanswered`), what users search for, and negative page feedback — before editing content.

### Data sources (Mintlify Admin API)

Three endpoints, fetched in order:

| Phase | API | What you get |
|-------|-----|--------------|
| **assistant** | `/v1/analytics/{projectId}/assistant` | User question, response, sources, `resolutionStatus` (`answered` / `unanswered`) |
| **searches** | `/v1/analytics/{projectId}/searches` | Search terms, hit counts, CTR, top clicked page |
| **feedback** | `/v1/analytics/{projectId}/feedback` | Page ratings and comments |

There is no CSV export API — only paginated JSON. The dashboard “Export to CSV” is email-based and not scriptable. This CLI paginates, merges, and writes lean local reports.

### Fetch model

```
CLI → 7-day date chunks (configurable) → paginated API pages → store/ merge → by-day/ + summary files
```

- **Incremental:** if `manifest.json` exists, only fetch since last `dateTo` (1-day overlap).
- **Checkpoint:** `checkpoint.json` + `store/` survive Ctrl+C, 504, or 429; re-run the same command to resume.
- **Flush:** every 10 API pages and after each chunk; assistant reports are written before searches start.
- **Rate limit:** 100 requests/org/hour shared across all analytics endpoints. Default 36s between pages.

### Output layout (gitignored: `tmp/analytics-cache/`)

| Path | Purpose |
|------|---------|
| `assistant-summary.md` | **Start here** — index linking to daily files |
| `by-day/YYYY-MM-DD.md` | That day's conversations (unanswered first) |
| `by-day/YYYY-MM-DD.json` | Slim JSON per day |
| `unanswered-index.json` | Days with unanswered questions |
| `searches-top.json` | Top 100 search terms (lean mode) |
| `feedback-negative.json` | Negative feedback only (lean mode) |
| `store/` | Raw merge state for resume/incremental |
| `checkpoint.json` | In-progress run state (removed on success) |
| `manifest.json` | Last completed run metadata |

Use `--full` for monolithic JSON exports. Use `--assistant-only` to skip searches and feedback.

### Recommended workflows

| Task | Command |
|------|---------|
| Regular docs tuning | `pnpm analytics:fetch` (30 days, incremental) |
| AI Q&A only | `pnpm analytics:fetch:assistant` |
| One year of history | `pnpm analytics:fetch:all` |
| Custom dates | `pnpm analytics:fetch -- --date-from YYYY-MM-DD --date-to YYYY-MM-DD --fresh` |

After a run, read `assistant-summary.md` → `by-day/YYYY-MM-DD.md` → `unanswered-index.json`.

---

## Setup

```bash
cp .env.local.example .env.local
# Fill MINTLIFY_API_KEY + MINTLIFY_PROJECT_ID — see .env.local.example
```

## Commands

```bash
pnpm analytics:fetch                 # incremental if cache exists, else last 30 days
pnpm analytics:fetch:assistant       # AI Q&A only (30 days; add --all for 1 year)
pnpm analytics:fetch:all             # ~1 year, all three datasets; auto-resume
pnpm analytics:fetch -- --fresh        # ignore cache, refetch window
pnpm analytics:fetch -- --resume       # resume interrupted run only
pnpm analytics:fetch -- --days 14
pnpm analytics:fetch -- --date-from 2025-01-01 --date-to 2025-12-31
pnpm analytics:fetch -- --assistant-only
pnpm analytics:fetch -- --full
pnpm analytics:fetch:dry-run
```

### Date range

| Flag | Meaning |
|------|---------|
| (default) | Last **30 days** |
| `--all` | Last **365 days** (1 year) |
| `--days N` | Last **N days** |
| `--date-from` + `--date-to` | Custom range; **both required**; last day is **inclusive** |

Use `--fresh` when changing the date window so old checkpoint/store does not mix with the new range.

### Checkpoint resume

1. Progress in `tmp/analytics-cache/checkpoint.json`
2. Re-run the same command — finished chunks are skipped
3. `pnpm analytics:fetch -- --assistant-only --resume` — stop after assistant if stuck in searches phase

### Resilience

- **504 / 414:** 7-day chunks; page 2+ sends cursor only; auto-bisect on 414
- **429:** backoff + resume; override throttle via `ANALYTICS_PAGE_LIMIT` / `ANALYTICS_PAGE_DELAY_MS` (see `.env.local.example`)
