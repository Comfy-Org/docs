# CMS Changelog Sync

Push **draft** release notes to Strapi CMS. Content is **simplified for end users** in staging, separate from full docs changelog.

## Architecture

Three separate steps — review between each; sync only after confirmation:

```
changelog/index.mdx          ← full docs (unchanged)
        │
        ▼  Step 1: pnpm cms:prepare:en
staging/en/                  ← simplified popup EN (review)
        │
        ▼  Step 2: pnpm cms:prepare:locales
staging/{zh,ja,ko,fr,ru,es}/ ← translated from staging EN (review)
        │
        ▼  Step 3: pnpm cms:sync
Strapi drafts → publish → published-versions.json
```

| Command | Step | Role |
|---------|------|------|
| `pnpm cms:prepare:en` | 1 | LLM simplify docs EN → `staging/en/` |
| `pnpm cms:prepare:locales` | 2 | Translate `staging/en/` → other locales |
| `pnpm cms:preview` / `cms:sync` | 3 | Push staging → Strapi drafts |
| `pnpm cms:publish` | — | Publish reviewed Strapi drafts → live |

**Docs site** (`zh/changelog/`, etc.) stays independent. **CMS** uses `.github/scripts/cms/staging/` only.

## Staging layout (gitignored)

```
.github/scripts/cms/staging/
  en/changelog/index.mdx              ← comfyui (default project)
  zh/ … ja/ … ko/ … fr/ … ru/ … es/
  cloud/
    en/changelog/index.mdx            ← cloud project
    zh/ … (same locale set)
```

Each version is **saved immediately** after simplify/translate (safe to resume).

## Projects & attention

| Project | CLI | Default attention |
|---------|-----|-------------------|
| `comfyui` | default / `CMS_PROJECT=comfyui` | `low` |
| `cloud` | `--project cloud` / `CMS_PROJECT=cloud` | `low` |

Set **high** attention for a specific version:

```bash
pnpm cms:set-attention -- cloud v0.24.0 high --save
```

Persists to `attention-overrides.json` (used on sync). Or edit that file manually.

## Commands

```bash
pnpm cms:prepare:en -- --force v0.25.0      # Step 1: simplify EN
pnpm cms:prepare:locales -- v0.25.1         # Step 2: translate (after EN approved)
pnpm cms:preview -- v0.25.1                 # Step 3: dry-run sync
pnpm cms:sync -- v0.25.1                    # Step 3: push drafts (after staging approved)
pnpm cms:publish -- v0.25.1                 # publish + refresh published-versions.json
```

Default: **comfyui + cloud** on prepare / sync / publish. Single project: `--project cloud`.

Local default (no args): **all unpublished EN versions** (from `published-versions.json`). Full backfill: `CMS_SYNC_ALL=1`.

## Simplification rules (EN)

Prompt: `cms-simplify-prompt.ts` — tuned for a **small in-app notification**, not full docs.

Configured in `cms-config.json` → `simplify`:

| Key | Default | Meaning |
|-----|---------|---------|
| `max_bullets_total` | **10** | Bullets for the **entire version** (not per section) |
| `max_sections` | **3** | `## New Open-Source Model Support` → `## New Node Updates` → `## Partner Node Updates` |

- Section order is **fixed**: open-source models first, node updates second, partner nodes last
- Include **all meaningful New Nodes** entries from the docs changelog (workflows, output sockets, multimodal nodes)
- Each bullet: **[**Name**](pr_url): 12–25 word description** — preserve model/node traits from source
- **Keep PR links** when the source has them
- **Drop** performance tweaks, minor fixes, Load3D/UI housekeeping
- English only (Step 1): `pnpm cms:prepare:en -- --force v0.25.0`
- Translate only (Step 2): `pnpm cms:prepare:locales -- --force v0.25.0` — reads existing `staging/en/`, never re-simplifies

## Configuration

| File | Purpose |
|------|---------|
| `cms-config.json` | Locales, projects (comfyui/cloud), simplify settings |
| `attention-overrides.json` | Per-project high-attention versions (optional) |
| `published-versions.json` | Published versions — sync skips these |

## API tokens

See `.env.local.example`: `TRANSLATE_API_KEY` (prepare), `CMS_API_TOKEN` (sync).

## Publish (draft → live)

After reviewing drafts in Strapi (or trusting staging content):

```bash
pnpm cms:publish --preview -- v0.25.1   # dry-run
pnpm cms:publish -- v0.25.1             # publish + auto-refresh published-versions.json
pnpm cms:publish -- v0.25.1 --no-registry   # publish only, skip JSON
```

- Publishes every locale that has a **draft** (en first, then zh/ja/ko/fr/ru/es)
- **Automatically refreshes** `published-versions.json` from Strapi (scans comfyui + cloud)
- Default (no version): all **unpublished EN versions** that have EN drafts in Strapi
- Bulk: add `--yes` or `CMS_PUBLISH_CONFIRM=1`; all drafts: `CMS_PUBLISH_ALL=1`
- Uses Strapi Content API `PUT ?status=published`

## Published registry

`cms:publish` refreshes the registry automatically. Manual rescan without publishing:

```bash
bun .github/scripts/cms/update-published-versions.ts --write
```
