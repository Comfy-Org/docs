# Local environment (`.env.local`)

Copy the template and fill in secrets locally — **never commit** `.env.local`.

```bash
cp .env.local.example .env.local
```

Variable names and placeholders live in [`.env.local.example`](../.env.local.example). This document explains what each group is for and where to get credentials.

## Summary by pipeline

| Variable | Docs translate | CMS prepare | CMS sync | Analytics fetch |
|----------|:--------------:|:-----------:|:--------:|:-----------------:|
| `TRANSLATE_API_KEY` | ✓ | ✓ | | |
| `TRANSLATE_API_BASE_URL` | ✓ | ✓ | | |
| `TRANSLATE_API_MODEL` | ✓ | ✓ | | |
| `TRANSLATE_CONCURRENCY` | optional | optional | | |
| `REVIEW_API_*` | optional (review) | | | |
| `CMS_BASE_URL` | | | ✓ | |
| `CMS_API_TOKEN` | | | ✓ | |
| `CMS_PROJECT` | | | optional | |
| `MINTLIFY_API_KEY` | | | | ✓ |
| `MINTLIFY_PROJECT_ID` | | | | ✓ |
| `ANALYTICS_PAGE_LIMIT` | | | | optional |
| `ANALYTICS_PAGE_DELAY_MS` | | | | optional |
| `FRONTEND_LOCALES_PATH` | optional (glossary) | | | |
| `GITHUB_TOKEN` | optional (link tracking) | | | |

Script docs: [i18n](scripts/i18n/README.md) · [cms](scripts/cms/README.md) · [analytics](scripts/analytics/README.md)

---

## Translation API

Used by `pnpm translate`, `pnpm cms:prepare`, and optionally `pnpm translate:review`.

| Variable | Description |
|----------|-------------|
| `TRANSLATE_API_KEY` | API key for an OpenAI-compatible endpoint |
| `TRANSLATE_API_BASE_URL` | Base URL (OpenRouter, DeepSeek, DashScope, etc.) |
| `TRANSLATE_API_MODEL` | Model id for translation |
| `TRANSLATE_CONCURRENCY` | Parallel requests (default varies by script) |

Optional review pass (`pnpm translate:review`): `REVIEW_API_KEY`, `REVIEW_API_BASE_URL`, `REVIEW_API_MODEL`, `REVIEW_CONCURRENCY` — falls back to `TRANSLATE_*` if unset.

Provider examples and links: see comments in `.env.local.example`.

---

## Strapi CMS

Used by `pnpm cms:sync`, `pnpm cms:preview`, `pnpm cms:publish`.

| Variable | Description |
|----------|-------------|
| `CMS_BASE_URL` | Strapi instance URL |
| `CMS_API_TOKEN` | API token with release-note permissions |
| `CMS_PROJECT` | `comfyui` or `cloud` (default `comfyui`) |

Create token: Strapi Admin → Settings → API Tokens. Details: [cms/README.md](scripts/cms/README.md).

Prepare steps also need `TRANSLATE_*` (same as docs translation).

---

## Mintlify analytics

Used by `pnpm analytics:fetch*`. Design and commands: [analytics/README.md](scripts/analytics/README.md).

| Variable | Description |
|----------|-------------|
| `MINTLIFY_API_KEY` | **Admin** API key (`mint_…`). Not the Assistant key (`mint_dsc_`). |
| `MINTLIFY_PROJECT_ID` | Project ID for the docs deployment (e.g. docs.comfy.org) |
| `ANALYTICS_PAGE_LIMIT` | Rows per API page (1–1000, default 200) |
| `ANALYTICS_PAGE_DELAY_MS` | Delay between pages in ms (default 36000 ≈ 100 req/h org limit) |

Get both required values from [Mintlify → Settings → API keys](https://app.mintlify.com/settings/organization/api-keys).

API auth: [Mintlify REST API — Authentication](https://www.mintlify.com/docs/api/introduction#authentication).

---

## Other optional variables

| Variable | Used by |
|----------|---------|
| `FRONTEND_LOCALES_PATH` | `pnpm glossary:sync` — path to ComfyUI frontend locales |
| `GITHUB_TOKEN` | `track-external-links.py` — usually set in CI only |
| `TRANSLATE_CJK_API_KEY` / `DASHSCOPE_API_KEY` | Translation fallbacks (see `.env.local.example`) |
| `CMS_SYNC_ALL` | CMS scripts — full backfill when set to `1` (see cms README) |
