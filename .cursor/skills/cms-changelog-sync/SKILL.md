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

```
changelog/index.mdx              ← docs source of truth (do not shorten for CMS)
        │
        ▼  pnpm cms:prepare:en / cms:prepare
.github/scripts/cms/staging/
  en/changelog/index.mdx         ← LLM-simplified popup EN
  {zh,ja,ko,fr,ru,es}/…         ← translated from simplified EN
        │
        ▼  pnpm cms:sync
Strapi CMS (draft only) → manual Publish → published-versions.json
```

**Never** edit docs `zh/changelog/` for CMS. **Never** auto-publish in Strapi.

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
| Total bullets per version | **3–5** (`max_bullets_total: 5`) |
| Section headings max | **2** (`max_sections: 2`) |
| Words per version | ~60–120 |
| Bullet format | `[**Name**](pr_url): 5–12 word function` |
| PR links | **Keep** when source has them; never invent URLs |
| Sections allowed | `**New Open-Source Model Support**`, `**Partner Node Updates**` only |
| Drop | Bug fixes, performance, Load3D, UI, internal refactors |

Example staging output:

```markdown
**New Open-Source Model Support**
* [**Depth Anything 3**](https://github.com/Comfy-Org/ComfyUI/pull/13853): Monocular depth estimation model

**Partner Node Updates**
* [**Kling V3-Turbo**](https://github.com/Comfy-Org/ComfyUI/pull/14528): Text-to-video generation model
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
| `pnpm cms:prepare:en` | Simplify EN → staging (comfyui + cloud copy) |
| `pnpm cms:prepare` | Simplify EN + translate all locales (both projects) |
| `pnpm cms:preview -- v0.25.1` | Dry-run Strapi push (both projects) |
| `pnpm cms:sync -- v0.25.1` | Push/update **drafts** (both projects) |
| `pnpm cms:publish -- v0.25.1` | Publish + refresh `published-versions.json` (both) |
| `pnpm cms:set-attention -- cloud v0.24.0 high` | Set attention low/high in Strapi |
| `pnpm cms:delete-drafts --preview` | List deletable Strapi drafts |
| `pnpm cms:delete-drafts` | Delete drafts (keeps published) |

Flags (after `--`):

- `--force` — re-simplify/re-translate even if staging has the version
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
2. **English first** — review popup copy before translating:

   ```bash
   pnpm cms:prepare:en -- --force v0.25.1
   ```

   Inspect: `.github/scripts/cms/staging/en/changelog/index.mdx`

3. **Translate** after EN approved:

   ```bash
   pnpm cms:prepare -- v0.25.1
   ```

4. **Push drafts**:

   ```bash
   pnpm cms:preview -- v0.25.1
   pnpm cms:sync -- v0.25.1
   ```

5. **Publish** after review (CLI or Strapi admin):

   ```bash
   pnpm cms:publish --preview -- v0.25.1
   pnpm cms:publish -- v0.25.1
   # published-versions.json is refreshed automatically — commit if changed
   ```

6. Commit `.github/scripts/cms/published-versions.json` after publish (auto-refreshed by `cms:publish`).

### Catch up all unpublished versions locally

```bash
pnpm cms:prepare:en -- --force          # all unpublished EN
pnpm cms:prepare -- --force             # then all locales
pnpm cms:preview
pnpm cms:sync
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
- [ ] Run `pnpm cms:prepare:en` (with `--force` if redoing); show staging EN for review
- [ ] Wait for user approval before `pnpm cms:prepare` (translations)
- [ ] Run `pnpm cms:preview` then `pnpm cms:sync`
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
