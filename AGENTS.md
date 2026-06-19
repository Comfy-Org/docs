# Agent guide — ComfyUI docs repo

English is the source of truth for documentation. This repo has **three separate pipelines** for content that leaves the Mintlify site — do not mix them.

## Skills (read when relevant)

| Skill | Path | Use when |
|-------|------|----------|
| **docs-i18n-translate** | [.cursor/skills/docs-i18n-translate/SKILL.md](.cursor/skills/docs-i18n-translate/SKILL.md) | Translating MDX to ja/zh/ko, `pnpm translate`, glossary, changelog docs |
| **docs-i18n-review** | [.cursor/skills/docs-i18n-review/SKILL.md](.cursor/skills/docs-i18n-review/SKILL.md) | Reviewing translation quality, `pnpm translate:review` |
| **cms-changelog-sync** | [.cursor/skills/cms-changelog-sync/SKILL.md](.cursor/skills/cms-changelog-sync/SKILL.md) | Strapi release notes, popup simplify, `pnpm cms:prepare`, `pnpm cms:sync` |

Always load the matching skill before changing that pipeline.

## Three pipelines

```
┌─────────────────────────────────────────────────────────────────┐
│  changelog/index.mdx  (full English — edit here for releases)   │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
   DOCS (Mintlify)                    CMS (Strapi popup)
   pnpm translate                     pnpm cms:prepare:en
   → zh/ ja/ ko/                      → staging/en/ (gitignored)
   COMMIT to git                      pnpm cms:prepare → staging/{lang}/
                                      pnpm cms:sync → Strapi draft
             │                               │
             ▼                               ▼
   Mintlify site                      In-app notification
   (full changelog)                   (3–5 bullets, PR links)
```

| | Docs translation | CMS sync |
|--|------------------|----------|
| Command | `pnpm translate` | `pnpm cms:prepare` / `cms:sync` |
| Output | `{lang}/**/*.mdx` | `.github/scripts/cms/staging/` |
| English input | Full docs MDX | LLM-simplified popup copy |
| Commit? | **Yes** | **No** (staging gitignored) |
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
pnpm cms:prepare:en -- --force v0.25.1   # simplify EN (comfyui + cloud copy)
pnpm cms:prepare -- v0.25.1               # translate all locales (both projects)
pnpm cms:preview -- v0.25.1               # dry-run (both projects)
pnpm cms:sync -- v0.25.1                  # push drafts (both projects)
pnpm cms:publish -- v0.25.1               # publish + refresh published-versions.json
pnpm cms:set-attention -- cloud v0.24.0 high --save   # optional high priority
```

Default: **comfyui + cloud** together. Single project only: `--project cloud`.

Local default for prepare/sync: **all unpublished EN versions** per `published-versions.json`. Use `CMS_SYNC_ALL=1` for full backfill.

## Environment

Copy `.env.local.example` → `.env.local` (never commit).

| Variable | Docs translate | CMS prepare | CMS sync |
|----------|----------------|-------------|----------|
| `TRANSLATE_API_KEY` | ✓ | ✓ | |
| `TRANSLATE_API_BASE_URL` | ✓ | ✓ | |
| `TRANSLATE_API_MODEL` | ✓ | ✓ | |
| `CMS_BASE_URL` | | | ✓ |
| `CMS_API_TOKEN` | | | ✓ |

## Agent rules

1. **Do not shorten** `changelog/index.mdx` for CMS — use the staging + simplify pipeline.
2. **Do not use** `pnpm translate` to fill CMS staging — use `pnpm cms:prepare`.
3. **Do not commit** `.github/scripts/cms/staging/` or `.github/i18n-logs/`.
4. **Do commit** translated docs (`zh/`, `ja/`, `ko/`) and `published-versions.json` after Strapi publish.
5. Get user approval on **staging EN** before running full `cms:prepare` (translations cost API calls).
5. Strapi publish is **manual by default** — use `pnpm cms:publish` after review (not automatic on sync).

## Reference docs

- i18n tooling: [.github/scripts/i18n/README.md](.github/scripts/i18n/README.md)
- CMS tooling: [.github/scripts/cms/README.md](.github/scripts/cms/README.md)
