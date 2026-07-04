# Agent guide — ComfyUI docs repo

English is the source of truth for documentation. This repo has **three separate pipelines** for content that leaves the Mintlify site — do not mix them.

## Skills (read when relevant)

| Skill | Path | Use when |
|-------|------|----------|
| **docs-i18n-translate** | [.cursor/skills/docs-i18n-translate/SKILL.md](.cursor/skills/docs-i18n-translate/SKILL.md) | Translating MDX to ja/zh/ko, `pnpm translate`, glossary, changelog docs |
| **docs-i18n-review** | [.cursor/skills/docs-i18n-review/SKILL.md](.cursor/skills/docs-i18n-review/SKILL.md) | Reviewing translation quality, `pnpm translate:review` |
| **cms-changelog-sync** | [.cursor/skills/cms-changelog-sync/SKILL.md](.cursor/skills/cms-changelog-sync/SKILL.md) | Strapi release notes, popup simplify, `pnpm cms:prepare`, `pnpm cms:sync` |

Always load the matching skill before changing that pipeline.

## Mintlify assistant insights

When optimizing docs for AI assistant gaps, follow [.github/scripts/analytics/README.md](.github/scripts/analytics/README.md).

## Three pipelines

```
┌─────────────────────────────────────────────────────────────────┐
│  changelog/index.mdx  (full English — edit here for releases)   │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
   DOCS (Mintlify)                    CMS (Strapi popup)
   pnpm translate                     Step 1: pnpm cms:prepare:en → staging/en/
   → zh/ ja/ ko/                      Step 2: pnpm cms:prepare:locales → staging/{lang}/
   COMMIT to git                      Step 3: pnpm cms:sync → Strapi draft (after review)
             │                               │
             ▼                               ▼
   Mintlify site                      In-app notification
   (full changelog)                   (3–5 bullets, PR links)
```

| | Docs translation | CMS sync |
|--|------------------|----------|
| Command | `pnpm translate` | `pnpm cms:prepare:en` / `cms:prepare:locales` / `cms:sync` |
| Output | `{lang}/**/*.mdx` | `.github/scripts/cms/staging/` |
| English input | Full docs MDX | LLM-simplified popup copy |
| Commit? | **Yes** | **Yes** (staging is reviewed and committed) |
| Locales | ja, zh, ko | en, zh, ja, ko, fr, ru, es |

## Quick commands

### Docs — after editing English MDX

```bash
pnpm translate:dry-run
pnpm translate -- changelog/index.mdx    # or specific paths
pnpm translate:check-truncation          # long pages / changelog
pnpm translate:review                    # optional quality pass
```

### CMS — after editing `changelog/index.mdx`

```bash
pnpm cms:prepare:en -- --force v0.25.1       # Step 1: simplify EN
pnpm cms:prepare:locales -- v0.25.1          # Step 2: translate (after EN approved)
pnpm cms:preview -- v0.25.1                # Step 3: dry-run
pnpm cms:sync -- v0.25.1                   # Step 3: push drafts (after user confirms)
pnpm cms:publish -- v0.25.1                # publish + refresh published-versions.json
```

Prepare default: **comfyui + cloud** together so staging stays mirrored.
Sync/publish default for agents: **comfyui only** (`--project comfyui`). Run **cloud** sync or publish only after the user explicitly confirms cloud, using `--project cloud`.

Local default for prepare/sync: **all unpublished EN versions** per `published-versions.json`. Use `CMS_SYNC_ALL=1` for full backfill.

## Agent rules

1. **Do not shorten** `changelog/index.mdx` for CMS — use the staging + simplify pipeline.
2. **Do not use** `pnpm translate` to fill CMS staging — use `pnpm cms:prepare:en` then `cms:prepare:locales`.
3. **Do not commit** `.github/i18n-logs/`.
4. **Do commit** translated docs (`zh/`, `ja/`, `ko/`), `.github/scripts/cms/staging/`, and `published-versions.json` after Strapi publish.
5. Get user approval on **staging EN** before `cms:prepare:locales`; get approval on **all staging** before `cms:sync`.
6. Sync and publish **comfyui only** by default (`--project comfyui`). Cloud sync/publish requires separate explicit user confirmation (`--project cloud`).
7. Strapi publish is **manual by default** — use `bun run cms:publish` after review (not automatic on sync).

## Prose style

When editing English MDX, avoid em dashes (—). Use periods, commas, or colons instead. Stacked em-dash clauses tend to read as AI-generated; keep sentences direct.

## Reference docs

- Local secrets & env: [.github/ENV.local.md](.github/ENV.local.md)
- i18n tooling: [.github/scripts/i18n/README.md](.github/scripts/i18n/README.md)
- CMS tooling: [.github/scripts/cms/README.md](.github/scripts/cms/README.md)
- Mintlify analytics: [.github/scripts/analytics/README.md](.github/scripts/analytics/README.md)
