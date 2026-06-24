---
name: cms-changelog-sync
description: >-
  Sync ComfyUI release notes to Strapi CMS: LLM-simplify English changelog for
  in-app popup, translate to zh/ja/ko/fr/ru/es in staging, push drafts to CMS.
  Use when updating changelog/index.mdx for CMS, running cms:prepare/cms:sync,
  Strapi release-notes, published-versions.json, CMS staging, simplifying
  release notes for the notification popup, or cms:publish to go live.
---

# CMS Changelog Sync

Push **draft** release notes to Strapi (`release-notes` content type). Docs changelog stays full; CMS uses **gitignored staging** with popup-sized copy.

## Architecture

Three **separate** steps — stop for human review between each:

```
changelog/index.mdx                    ← docs source of truth (full EN)
        │
        ▼  Step 1: pnpm cms:prepare:en
staging/en/changelog/index.mdx         ← simplified popup EN → **review & approve**
        │
        ▼  Step 2: pnpm cms:prepare:locales
staging/{zh,ja,ko,fr,ru,es}/…          ← translated from staging EN → **review & approve**
        │
        ▼  Step 3: pnpm cms:preview → cms:sync  (only after user confirms)
Strapi CMS (draft) → manual Publish → published-versions.json
```

**Never** edit docs `zh/changelog/` for CMS. **Never** auto-publish in Strapi. **Never** use `pnpm translate` for CMS — that pipeline is for Mintlify docs only.

## Three-step workflow (local)

| Step | Command | What it does | Gate |
|------|---------|--------------|------|
| **1. Simplify EN** | `pnpm cms:prepare:en -- --force v0.26.0` | docs → LLM → `staging/en/` | Review EN staging |
| **2. Translate** | `pnpm cms:prepare:locales -- --force v0.26.0` | `staging/en/` → `staging/{zh,ja,ko,fr,ru,es}/` | Review locale staging |
| **3. Push CMS** | `pnpm cms:preview` then `pnpm cms:sync` | staging → Strapi **drafts** | Strapi review → `cms:publish` |

`pnpm cms:prepare` without `--en-only` / `--translate-only` prints help and exits — use the step-specific scripts above.

## Translation workflow (CMS staging)

Step 2 only. **Input = simplified EN staging**, not docs changelog.

```
staging/en/changelog/index.mdx          ← input (Step 1 output, human-approved)
        │
        ▼  pnpm cms:prepare:locales -- v0.26.0
staging/zh|ja|ko|fr|ru|es/changelog/…   ← output (popup copy per locale, ready to sync)
        │
        ▼  pnpm cms:sync  (Step 3, after user confirms)
Strapi release-notes (draft)
```

| | Mintlify docs (`pnpm translate`) | CMS popup (`pnpm cms:prepare:locales`) |
|--|----------------------------------|----------------------------------------|
| English source | `changelog/index.mdx` (full docs) | `staging/en/changelog/index.mdx` (simplified popup) |
| Output path | `zh/changelog/index.mdx`, etc. | `staging/zh/changelog/index.mdx`, etc. |
| Purpose | Docs site | Strapi in-app notification |
| Mix pipelines? | **No** | **No** |

**Key points:**

- `cms:prepare:locales` does **not** re-simplify English — it reads existing `staging/en/` only
- If staging EN is missing the version, translate fails — run `cms:prepare:en` first
- Target locales: **zh, ja, ko, fr, ru, es** (see `cms-config.json`)
- `--force` re-translates existing locale blocks (common after manual EN edits)

## Environment (`.env.local`)

| Variable | Used by | Notes |
|----------|---------|-------|
| `TRANSLATE_API_KEY` | prepare | Same as `pnpm translate` |
| `TRANSLATE_API_BASE_URL` | prepare | e.g. `https://api.deepseek.com` |
| `TRANSLATE_API_MODEL` | prepare | e.g. `deepseek-v4-pro` |
| `CMS_BASE_URL` | sync, delete-drafts | e.g. `https://cms.comfy.org` |
| `CMS_API_TOKEN` | sync, delete-drafts | Strapi API token |
| `CMS_PROJECT` | optional | Default `comfyui`; also `--project cloud` on CLI |

CI: `CMS_BASE_URL` / `TRANSLATE_API_BASE_URL` → GitHub **Variables**; tokens → **Secrets**.

## Simplification rules (EN popup)

Prompt: `.github/scripts/cms/cms-simplify-prompt.ts`  
Config: `.github/scripts/cms/cms-config.json` → `simplify`

| Rule | Value |
|------|-------|
| Total bullets per version | **up to 10** (`max_bullets_total: 10`) |
| Section headings max | **3** (`max_sections: 3`) |
| Section order | **New Open-Source Model Support** → **New Node Updates** → **Partner Node Updates** |
| Words per version | ~60–120 |
| Bullet format | `[**Name**](pr_url): 6–12 words with one key trait` |
| PR links | **Keep** when source has them; never invent URLs |
| New Node Updates | Include meaningful entries from source **New Nodes** section (workflows, sockets, multimodal nodes) |
| Drop | Bug fixes, performance, pure Load3D plumbing, internal refactors, **ComfyUI-WIKI dependency bumps** (see below) |

Style: principle-only prompt in `cms-simplify-prompt.ts` (no concrete version examples — avoids LLM contamination).

## ComfyUI-WIKI commits (omit from changelog)

When curating `changelog/index.mdx` from ComfyUI git history, **do not add bullets** for commits routinely opened by **[ComfyUI-WIKI](https://github.com/Comfy-Org/ComfyUI-WIKI)** — they are dependency/content syncs, not core release features:

| Skip | Typical commit / PR pattern |
|------|----------------------------|
| **Embedded docs** | `chore: update embedded docs to v…`, `comfyui-embedded-docs` in `requirements.txt` |
| **Workflow templates** | `chore: update workflow templates to v…`, `comfyui-workflow-templates` in `requirements.txt` |
| **Model blueprints** | `Add new model blueprints`, blueprint starter workflows in template library |

Also omit standalone **frontend package semver bumps** unless tied to a user-visible fix worth its own bullet. CMS simplify must never promote WIKI-only items into popup copy even if they appear in the full docs block.

Example staging shape (placeholders only):

```markdown
**New Open-Source Model Support**
* [**Model Name**](source_url): Short description with 1–2 traits from the release data

**New Node Updates**
* [**Node Name**](source_url): What the node does and why it matters

**Partner Node Updates**
* [**Partner Node**](source_url): Partner scope and capability from the release data
```

Sync adds header: `# ComfyUI vX.Y.Z` via `format-cms-content.ts`.

## Projects (comfyui + cloud)

**Default: both projects** on `cms:prepare`, `cms:sync`, and `cms:publish`. Same changelog content; Strapi `project` field and CMS header differ (`# ComfyUI` vs `# Cloud`).

| Project | Staging path | CMS header |
|---------|--------------|------------|
| `comfyui` | `staging/{locale}/…` | `# ComfyUI vX.Y.Z` |
| `cloud` | `staging/cloud/{locale}/…` | `# Cloud vX.Y.Z` |

Prepare runs LLM once on comfyui, then **copies staging to cloud**. Sync/publish push both to Strapi.

Single project only: `--project cloud` or `CMS_PROJECT=cloud`.

Mark a version **high** attention:

```bash
pnpm cms:set-attention -- cloud v0.24.0 high --save
```

## Commands

| Command | Action |
|---------|--------|
| `pnpm cms:prepare:en` | **Step 1** — LLM simplify docs EN → `staging/en/` (no translation) |
| `pnpm cms:prepare:locales` | **Step 2** — translate `staging/en/` → `staging/{zh,ja,ko,fr,ru,es}/` (does not re-simplify EN) |
| `pnpm cms:preview -- v0.25.1` | **Step 3a** — Dry-run Strapi push |
| `pnpm cms:sync -- v0.25.1` | **Step 3b** — Push/update **drafts** (run only after user confirms staging) |
| `pnpm cms:publish -- v0.25.1` | Publish + refresh `published-versions.json` |
| `pnpm cms:prepare` | Prints three-step help and exits when no mode flag is passed |
| `pnpm cms:set-attention -- cloud v0.24.0 high` | Set attention low/high in Strapi |
| `pnpm cms:delete-drafts --preview` | List deletable Strapi drafts |
| `pnpm cms:delete-drafts` | Delete drafts (keeps published) |

Flags (after `--`):

- `--force` — re-simplify/re-translate even if staging has the version; on **sync**, update already-**published** CMS entries (default skips published)
- `--preview` / `--dry-run` — no API writes
- `--project cloud` — single project only (default = both)
- `v0.25.1` — explicit version(s)

Env:

- `CMS_SYNC_ALL=1` — include already-published versions (backfill)
- Without it, local default = **all unpublished EN versions** per `published-versions.json`

Requires **Bun**. Loads `.env.local` automatically.

## Standard workflow

### New release version

1. Add full `<Update>` block to `changelog/index.mdx` (docs quality — unchanged).

2. **Step 1 — Simplify EN** — review before translating:

   ```bash
   pnpm cms:prepare:en -- --force v0.25.1
   ```

   Inspect: `.github/scripts/cms/staging/en/changelog/index.mdx` → **stop until approved**

3. **Step 2 — Translate** — from approved staging EN only:

   ```bash
   pnpm cms:prepare:locales -- v0.25.1          # first translate
   pnpm cms:prepare:locales -- --force v0.25.1 # re-translate after EN edits
   ```

   Inspect: `.github/scripts/cms/staging/zh/changelog/index.mdx` (and other locales) → **stop until approved**

4. **Step 3 — Push drafts** (only after user confirms staging):

   ```bash
   pnpm cms:preview -- v0.25.1
   pnpm cms:sync -- v0.25.1
   ```

5. **Publish** after Strapi review:

   ```bash
   pnpm cms:publish --preview -- v0.25.1
   pnpm cms:publish -- v0.25.1
   ```

6. Commit `.github/scripts/cms/published-versions.json` after publish.

### Catch up all unpublished versions locally

```bash
pnpm cms:prepare:en -- --force              # Step 1: all unpublished EN
pnpm cms:prepare:locales -- --force         # Step 2: all locales
pnpm cms:preview
pnpm cms:sync                               # Step 3: after review
```

### After prompt or config changes

Re-run with `--force`. Staging without `--force` **skips** existing `<Update>` blocks.

## Version selection logic

| Context | Versions processed |
|---------|-------------------|
| Local, no args | EN not in `published-versions.json` (≥ `min_version` 0.21.0) |
| Local + `CMS_SYNC_ALL=1` | All ≥ min_version |
| Explicit `v0.25.1` | That version only |
| CI (`CMS_SYNC_BEFORE` / `CMS_SYNC_AFTER`) | New/changed `<Update>` blocks in git diff only |

`cms:sync` skips locales already published per registry. Published EN in CMS is never overwritten.

## Key files

| Path | Role |
|------|------|
| `changelog/index.mdx` | Full docs EN changelog |
| `.github/scripts/cms/staging/` | CMS content (gitignored) |
| `.github/scripts/cms/cms-config.json` | Locales, min version, simplify limits |
| `.github/scripts/cms/published-versions.json` | Published registry (commit after Strapi publish) |
| `.github/scripts/cms/prepare-cms-changelog.ts` | Prepare pipeline |
| `.github/scripts/cms/sync-to-strapi.ts` | Strapi draft sync |
| `.github/scripts/cms/publish-cms-drafts.ts` | Draft → published |
| `.github/scripts/cms/delete-cms-drafts.ts` | Clean bad drafts |
| `.github/workflows/cms-changelog-sync.yml` | CI: prepare → preview → sync on main (changelog paths only) |

## Agent checklist

When user asks to update CMS release notes:

- [ ] Confirm `changelog/index.mdx` has the new `<Update>` block
- [ ] Omit ComfyUI-WIKI items (embedded docs, workflow templates, model blueprints) unless user explicitly asks
- [ ] Run `pnpm cms:prepare:en`; show staging EN → **wait for user approval**
- [ ] Run `pnpm cms:prepare:locales` (not `cms:prepare:en`) → **wait for user approval**
- [ ] Run `pnpm cms:preview` then `pnpm cms:sync` **only after user confirms staging**
- [ ] Remind: Strapi publish is manual; then `--write` on published-versions
- [ ] Do **not** commit staging/ (gitignored)
- [ ] Do **not** shorten docs changelog for CMS — staging is separate
- [ ] Do **not** run bulk `CMS_SYNC_ALL` prepare/sync without user consent (many API calls)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Only one version simplified | Old behavior was latest-only; now defaults to unpublished. Use `CMS_SYNC_ALL=1` for all. |
| Staging skipped | Version already exists — add `--force` |
| Strapi VERSION shows `-` | Bulk sync bug: `version` field null; delete drafts and re-sync |
| Delete draft 500 | Use `pnpm cms:delete-drafts` (locale-only DELETE, not `status=draft`) |
| `English base draft missing` on locale sync | Ensure EN draft exists first; sync creates EN before other locales |
| Background prepare still running | `pkill -f prepare-cms-changelog.ts` |

## Related skills

- **`docs-i18n-translate`** — Mintlify docs ja/zh/ko (`pnpm translate`)
- **`docs-i18n-review`** — translation quality review (`pnpm translate:review`)

## Docs vs CMS (do not confuse)

| | Docs site | CMS popup |
|--|-----------|-----------|
| Source | `changelog/index.mdx` | `staging/en/…` |
| Length | Full detail | 3–5 bullets |
| i18n | `zh/changelog/` etc. | `staging/zh/` etc. |
| Deploy | Mintlify | Strapi draft → publish |
