---
name: docs-i18n-review
description: >-
  Review ComfyUI docs translation quality with LLM-as-a-judge (review-i18n.ts).
  Scores accuracy, completeness, terminology, fluency. Use when reviewing zh/ja/ko
  translations, running translate:review, quality-report, reviewSourceHash, or
  checking translation quality after pnpm translate.
---

# Docs i18n Quality Review

Advisory LLM-as-a-judge for **existing** ja/zh/ko translations. Separate from translation (`pnpm translate`) and from the model's self-reported `=== MISMATCHES ===` during translate.

**Not for CMS staging** — reviews committed docs under `{lang}/`.

## When to use

- After `pnpm translate` on important pages
- Before merging large i18n PRs
- When user asks to review translation quality
- Spot-check with `--sample N`

## Environment (`.env.local`)

Prefer a **cheap/fast** judge model (lighter than translation):

| Variable | Purpose |
|----------|---------|
| `REVIEW_API_KEY` | Judge API key (falls back to `TRANSLATE_API_KEY`) |
| `REVIEW_API_BASE_URL` | Endpoint (falls back to `TRANSLATE_*`) |
| `REVIEW_API_MODEL` | e.g. `deepseek-v4-flash` |
| `REVIEW_CONCURRENCY` | Default 5; lower if socket errors |

Requires **Bun**.

## Commands

| Command | Action |
|---------|--------|
| `pnpm translate:review` | Pending reviews, all languages |
| `pnpm translate:review -- --lang ko` | One language |
| `pnpm translate:review -- installation/x.mdx` | Specific file(s) |
| `pnpm translate:review -- --all` | Re-review everything |
| `pnpm translate:review -- --sample 20` | N random pending per language |
| `pnpm translate:review -- --min-score 4` | Report files scoring below 4/5 |
| `pnpm translate:review -- --snippets` | Review snippets instead of pages |

## Output

Reports (gitignored): `.github/i18n-logs/review/`

- `quality-report.json` / `.txt` — scores + issues
- **Advisory only** — never written into MDX

Per-file state in git: `reviewSourceHash` in translated frontmatter (mirrors `translationSourceHash`). Commit hash updates; detailed scores stay in logs.

## Scoring axes

1. **Accuracy** — meaning matches English
2. **Completeness** — nothing missing or added
3. **Terminology** — glossary / preserve_terms consistency
4. **Fluency** — natural target language

## Standard workflow

```bash
pnpm translate -- changelog/index.mdx --lang ko   # translate first
pnpm translate:review -- changelog/index.mdx --lang ko
# Read .github/i18n-logs/review/quality-report.txt
# Fix issues → re-translate affected sections → re-review
```

Incremental: skips files already reviewed at current English hash unless `--all`.

## Agent checklist

- [ ] Ensure translation is up to date (`translationSourceHash` matches EN) before review
- [ ] Run review after translate, not instead of translate
- [ ] Read report from `.github/i18n-logs/review/` — do not commit logs
- [ ] Fix via re-translate or glossary overrides, not manual score edits
- [ ] For systematic term issues → `glossary/overrides/{lang}.json` (see `docs-i18n-translate` skill)

## Key files

| Path | Role |
|------|------|
| `.github/scripts/i18n/review-i18n.ts` | Review entry point |
| `.github/scripts/i18n/glossary.mjs` | Terminology check hints |
| `.github/scripts/i18n/README.md` | Full review section |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Nothing to review | Translation stale or already reviewed — run translate or `--all` |
| Socket / timeout errors | Lower `REVIEW_CONCURRENCY`; use faster model |
| Low terminology score | Update glossary overrides, re-translate, re-review |

## Related skills

- **`docs-i18n-translate`** — generate/update translations
- **`cms-changelog-sync`** — CMS popup staging (different pipeline)
