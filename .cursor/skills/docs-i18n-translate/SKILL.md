---
name: docs-i18n-translate
description: >-
  Translate ComfyUI Mintlify docs from English MDX to ja/zh/ko using translate-i18n.ts.
  Incremental hash sync, chunked long pages, changelog update_blocks, glossary terms.
  Use when translating docs, updating zh/ja/ko changelog or pages, running pnpm translate,
  translationSourceHash, glossary sync, docs.json i18n, or fixing truncated translations.
---

# Docs i18n Translation

Translate **Mintlify docs** (not CMS). English is source of truth; ja / zh / ko are generated under `{lang}/` and `snippets/{lang}/`.

**Separate from CMS:** `pnpm cms:prepare` writes gitignored `.github/scripts/cms/staging/` for Strapi. See skill `cms-changelog-sync`.

## Architecture

```
index.mdx, changelog/index.mdx, …   ← English (edit here)
        │
        ▼  pnpm translate
{ja,zh,ko}/…                        ← translated MDX (commit to git)
snippets/{ja,zh,ko}/…
        │
        ▼  optional
pnpm translate:sync-docs-json       ← mirror nav paths in docs.json
```

Incremental: each file stores `translationSourceHash` in frontmatter. Unchanged English → skip.

## Environment (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `TRANSLATE_API_KEY` | Primary API key |
| `TRANSLATE_API_BASE_URL` | OpenAI-compatible endpoint |
| `TRANSLATE_API_MODEL` | e.g. `deepseek-v4-pro`, `qwen-mt-plus` |
| `TRANSLATE_CONCURRENCY` | Parallel requests (default 5) |
| `FRONTEND_LOCALES_PATH` | Optional; ComfyUI frontend locales for glossary sync |

Requires **Bun**.

## Commands

| Command | Action |
|---------|--------|
| `pnpm translate` | Pending pages + snippets, all languages |
| `pnpm translate:dry-run` | Preview pending work |
| `pnpm translate:force` | Re-translate everything |
| `pnpm translate -- --lang zh,ja` | Specific languages |
| `pnpm translate -- path/to/page.mdx` | Specific file(s) |
| `pnpm translate:snippets` | Snippets only |
| `pnpm translate -- --pages-only` | Skip snippets |
| `pnpm translate:check-truncation` | Scan for truncated output |
| `pnpm translate:repair-truncated -- --lang ko` | Re-translate flagged files |
| `pnpm translate:sync-docs-json` | Sync `docs.json` nav paths (labels preserved) |
| `pnpm translate:sync-docs-json -- --translate-nav-labels` | Also translate new EN nav labels |
| `pnpm glossary:sync` | Rebuild glossary from ComfyUI frontend |
| `pnpm glossary:sync:dry-run` | Preview glossary sync |

Logs (gitignored): `.github/i18n-logs/translate/`

## Standard workflow

### After editing English MDX

```bash
pnpm translate:dry-run                    # see pending
pnpm translate -- changelog/index.mdx   # or specific paths
pnpm translate:check-truncation         # if long page / changelog
```

### Changelog (`changelog/index.mdx`)

- Strategy: `update_blocks` (configured in `translation-config.json`)
- Only **new/changed** `<Update label="vX">` blocks are translated
- Dates in `description` are localized automatically (ja/zh/ko formats)
- Block hashes stored in `translationBlockHashes` frontmatter

```bash
pnpm translate -- changelog/index.mdx
pnpm translate -- changelog/index.mdx --lang zh
```

### Long pages (truncation risk)

| Strategy | When | Config |
|----------|------|--------|
| `heading_sections` | Long reference pages | `chunked_files` or `auto_chunk` (≥10k chars, ≥4 `##`) |
| `update_blocks` | Changelog | `chunked_files` entry for `changelog/index.mdx` |

Checkpoints per block — safe to resume after interrupt.

```bash
pnpm translate -- tutorials/partner-nodes/pricing.mdx --lang ko
pnpm translate:check-truncation -- --lang ko
pnpm translate:repair-truncated -- --lang ko
```

## Terminology (glossary)

Three layers — see `.github/scripts/i18n/README.md` for detail:

| Layer | File / config | Effect |
|-------|---------------|--------|
| `preserve_terms` | `translation-config.json` | Keep English (LoRA, checkpoint, …) |
| `glossary/frontend/{lang}.json` | Machine-synced | Mirror ComfyUI frontend |
| `glossary/overrides/{lang}.json` | Hand-edited | Corrections; wins over frontend |

```bash
pnpm glossary:sync              # after frontend locale updates
# Edit overrides/{lang}.json for term decisions
# Edit preserve_terms for English-only terms
```

**Never hand-edit** `glossary/frontend/` — run `glossary:sync`.

## Skipped paths

`translation-config.json` → `skip_paths`: e.g. `built-in-nodes` (not auto-translated).

## Agent checklist

When user updates English docs and needs translations:

- [ ] Identify changed files (or run `pnpm translate:dry-run`)
- [ ] Run `pnpm translate` for affected paths — **not** `cms:prepare` unless CMS/Strapi
- [ ] For changelog, translate **docs** `zh/changelog/` etc., not CMS staging
- [ ] After long pages, run `pnpm translate:check-truncation`
- [ ] Commit translated MDX + updated `translationSourceHash` / `translationBlockHashes`
- [ ] Do not commit `.github/i18n-logs/`
- [ ] If nav structure changed, run `pnpm translate:sync-docs-json`
- [ ] Optional quality pass: skill `docs-i18n-review`

## Key files

| Path | Role |
|------|------|
| `.github/scripts/i18n/translate-i18n.ts` | Entry point |
| `.github/scripts/i18n/chunked-translate.ts` | Block splitting/reassembly |
| `.github/scripts/i18n/translation-config.json` | Languages, skip paths, chunked files |
| `.github/scripts/i18n/glossary.mjs` | Term injection |
| `.github/scripts/i18n/README.md` | Full reference |
| `.github/workflows/i18n-sync-check.yml` | PR reminder for missing translations |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| File skipped | English hash unchanged — use `pnpm translate:force` or edit EN source |
| Truncated translation | `translate:repair-truncated` or add to `chunked_files` |
| Wrong term | `glossary/overrides/{lang}.json` or `preserve_terms` |
| PR i18n comment | Run `pnpm translate` for listed files |
| Changelog date still English | Re-run translate for that block; dates derived from EN |

## Docs vs CMS translation

| | Docs (`pnpm translate`) | CMS (`pnpm cms:prepare`) |
|--|-------------------------|---------------------------|
| Output | `{lang}/changelog/index.mdx` | `staging/{lang}/…` (gitignored) |
| English source | Full docs changelog | LLM-simplified staging EN |
| Purpose | Mintlify site | Strapi in-app popup |
| Commit | Yes | No (staging gitignored) |
