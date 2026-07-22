# Docs i18n

Tooling that translates the English MDX docs into the languages listed in
[`translation-config.json`](./translation-config.json) (currently ja / zh / ko).
English is the single source of truth; every other language is generated.

## Relationship to CMS changelog

`changelog/index.mdx` is the full English release notes for the **Mintlify docs site**.
This pipeline produces `{lang}/**/*.mdx` via `pnpm translate`.

**CMS popup release notes** are a separate pipeline — simplified copy in
`.github/scripts/cms/staging/` → Strapi. See [cms/README.md](../cms/README.md).
Do **not** use `pnpm translate` to fill CMS staging.

```
changelog/index.mdx
        ├─► pnpm translate → zh/ ja/ ko/ (Mintlify docs)
        └─► pnpm cms:prepare → staging/ → Strapi (in-app popup)
```

## Agent rules

- Do **not** commit `.github/i18n-logs/`.
- Do commit translated docs (`zh/`, `ja/`, `ko/`) after a translation run.
- Prose style for English MDX: see [AGENTS.md](../../../AGENTS.md#prose-style-english-mdx).

## How translation works

`translate-i18n.ts` is the entry point. It is **incremental**: each translated
file records a `translationSourceHash` (SHA-256 of its English source) in
frontmatter, and a re-run skips files whose English source is unchanged. The
English source is the primary input; the existing target file is passed as
context so unchanged sections are preserved.

```bash
pnpm translate                       # translate pending pages + snippets, all languages
pnpm translate:dry-run               # list what would be translated
pnpm translate:force                 # re-translate everything
pnpm translate -- --lang zh,ja       # specific languages
pnpm translate -- installation/x.mdx # specific files
pnpm translate -- --with-docs-json   # also sync docs.json nav after translate (opt-in)
pnpm translate:snippets              # snippets only
pnpm translate:check-truncation      # scan for truncated output
pnpm translate:repair-fences         # append missing closing ```
pnpm translate:repair-truncated -- --lang ko
pnpm translate:sync-hash             # update hashes after manual translation edits
pnpm translate:sync-docs-json        # sync docs.json navigation paths
pnpm translate -- --openapi-only     # OpenAPI specs only
pnpm translate -- --no-openapi         # skip OpenAPI specs
pnpm translate -- --fetch-openapi      # refresh vendored specs from fetch_url
```

### OpenAPI API Reference (Mintlify auto-generated pages)

Mintlify endpoint pages under `api-reference/**` are generated from OpenAPI
specs, not MDX. This pipeline copies each English spec to locale-specific files
(for example `openapi/cloud.zh.yaml`) and translates `summary` / `description`
fields incrementally.

Configure sources in `translation-config.json` → `openapi_specs`:

| Source | Output | Notes |
|--------|--------|-------|
| `openapi/cloud.en.yaml` | `openapi/cloud.{lang}.yaml` | Cloud API Reference tab |
| `openapi/registry.en.yaml` | `openapi/registry.{lang}.yaml` | Registry + Admin tabs; refresh with `--fetch-openapi` |

`docs.json` keeps English sources under `openapi/`. Sidecar hashes live in `openapi/.i18n/`.
`pnpm translate:sync-docs-json` localizes tab `openapi.source` values to the
matching `{lang}` file for zh / ja / ko.

Sidecar hashes per locale live in `openapi/.i18n/` as `{basename}.json`
(e.g. `openapi/.i18n/cloud.zh.json`). Commit translated specs and sidecars
with MDX translations.

```bash
pnpm translate:dry-run -- --openapi-only --lang zh   # preview pending OpenAPI work
pnpm translate -- --openapi-only --lang zh             # translate Cloud + Registry specs for zh
pnpm translate -- --fetch-openapi --openapi-only       # pull latest Registry spec, then translate
```

**`docs.json` is not rewritten by `pnpm translate` by default.** Nav sync used to run
after every page translate and would also normalize EN path casing against on-disk
MDX filenames, so a changelog-only run could produce a large unrelated `docs.json`
diff. When you add, move, or rename pages in the English nav, run
`pnpm translate:sync-docs-json` (or `pnpm translate -- --with-docs-json`) separately.

Quality controls during/after a run write to `.github/i18n-logs/translate/`
(gitignored): semantic mismatches reported by the model, and a truncation scan
(`check-translation-truncation.ts`).

Truncation heuristics include **unclosed ` ``` ` blocks** (`unclosed_code_fence`),
fewer fence markers than English (`missing_code_fence`), and short body length.

```bash
pnpm translate:check-truncation              # scan all languages
pnpm translate:check-truncation -- --lang ko
pnpm translate:repair-fences                 # append missing closing ```
pnpm translate:repair-fences -- --dry-run    # preview fence fixes
pnpm translate:repair-truncated -- --lang ko # re-translate via API when content was cut
```

`repair-fences` is a **structural** fix (adds `\`\`\`` at the end). It does not
restore code lines lost inside the block. Use `repair-truncated` when the block
body itself was truncated.

### Long pages (chunked translation)

Very long MDX files (e.g. `tutorials/partner-nodes/pricing.mdx`) exceed model
output limits when translated in one shot. Two strategies avoid truncation:

| Strategy | Use case | Split boundary | Incremental sync |
|----------|----------|----------------|------------------|
| `heading_sections` | Long reference pages | Level-2 `##` headings | Per-section content hash in `translationBlockHashes` |
| `update_blocks` | Changelog | `<Update label="…">` blocks | Per-block content hash in `translationBlockHashes` (new labels + EN edits) |

Configure explicit paths in `translation-config.json` → `chunked_files`, or rely
on `auto_chunk` (default: body ≥ 3k chars and ≥ 2 `##` sections) to auto-enable
`heading_sections`.

**Oversized H2 blocks:** a single `##` section can still be too large for one API
call (e.g. Install tabs with many Mintlify `<Tab>` children). When an English
block exceeds `auto_chunk.max_block_chars` (default **6000**), the translator
sub-chunks it for the API only:

1. Mintlify `<Tab title="…">…</Tab>` pieces (preferred)
2. Else `###` subheadings
3. Else fence-safe soft splits by character budget

Pieces are translated separately and concatenated. Sync hashes stay keyed by the
H2 label (no frontmatter schema change).

API calls use `max_tokens: 16384` and inspect `finish_reason`. Truncated or
structurally invalid block output (wrong Tab count, unclosed fences, short line
ratio, `finish_reason === "length"`) is **rejected**: previous target content is
kept and that block’s hash is left pending so the next run retries. A file with
failed blocks is reported as failed, not silently marked up-to-date.

Truncation scan also flags per-block problems (`truncated_block`) when whole-file
line count still looks acceptable but a Tab-heavy section is cut.

Changelog `<Update description="…">` dates are **derived from English** and
localized automatically (`ja`/`zh`: `YYYY年M月D日`, `ko`: `YYYY년 M월 D일`) after
each block is translated or re-serialized — English month names should not
remain in translated files.

During a chunked run the script:

1. Parses English into blocks (intro + each `##` section).
2. Compares each block’s hash to `translationBlockHashes` in the target frontmatter.
3. Translates only pending blocks (plus frontmatter when needed), sub-chunking oversized blocks.
4. Checkpoints after every block so a failed run can resume.

`translationBlockHashes` keys are written in **descending semver order** for
changelog (`v0.25.1` before `v0.25.0`), matching the canonical `<Update>`
sequence. Long pages use **English document order** for section hashes.

Example:

```bash
pnpm translate -- tutorials/partner-nodes/pricing.mdx --lang ko
pnpm translate:check-truncation -- --lang ko
pnpm translate:repair-truncated -- --lang ko   # force re-translate flagged files
```

### Sync hashes after manual edits

When you edit English and update zh/ja/ko translations by hand (or with Cursor), refresh
metadata so `pnpm translate` skips those files:

```bash
pnpm translate:sync-hash -- path/to/page.mdx           # specific file(s)
pnpm translate:sync-hash -- --lang zh path/to/page.mdx
pnpm translate:sync-hash -- --dry-run path/to/page.mdx # preview
pnpm translate:sync-hash -- --verify path/to/page.mdx  # warn if EN blocks still look pending
pnpm translate:sync-hash                               # all files with hash drift
```

This updates `translationSourceHash` (and `translationBlockHashes` on chunked pages)
from the English source. It does **not** call the translation API or change prose.

Example:

```bash
pnpm translate:sync-hash -- installation/system_requirements.mdx
```

## Quality review (LLM-as-a-judge)

`review-i18n.ts` scores existing translations with an **independent** (and
typically cheaper) model on four axes — accuracy, completeness, terminology
(checked against the glossary), and fluency — and lists concrete issues. This is
separate from the translation model's own `=== MISMATCHES ===` notes: here a
different model acts as judge.

Results are **advisory**: written to `.github/i18n-logs/review/`
(`quality-report.json` / `.txt`, gitignored), never into MDX and never blocking.
By default only translations that are up to date with English and not yet
reviewed at that hash are checked. The reviewed hash is stored as
`reviewSourceHash` in the translated file's frontmatter (snippets: an MDX
comment) and committed to git — so review state is shared across the team and
visible per file, mirroring `translationSourceHash`. Only the hash goes in
frontmatter; scores and the issue list stay in the gitignored report.

```bash
pnpm translate:review                     # pending reviews, all languages
pnpm translate:review -- --lang ko        # one language
pnpm translate:review -- installation/x.mdx
pnpm translate:review -- --all            # re-review everything
pnpm translate:review -- --sample 20      # N pending files per language
pnpm translate:review -- --min-score 4    # report files scoring below 4/5
```

Configure a dedicated (cheap) judge model via `REVIEW_API_*` — see
[`.env.local.example`](../../../.env.local.example); falls back to the `TRANSLATE_*` model when unset. Use a fast model — evaluation is lighter than
translation, and reasoning-heavy models are slow and can drop connections under
concurrency (lower `REVIEW_CONCURRENCY` if you see socket errors).

## Terminology consistency

The same English term must render the same way across pages. Three complementary
mechanisms handle this, each for a different category of term:

| Mechanism | Effect | Example | Maintained |
|-----------|--------|---------|------------|
| `preserve_terms` (in `translation-config.json`) | keep the term **in English** | `checkpoint`, `LoRA`, `scheduler` | by hand |
| glossary `frontend/{lang}.json` | use the frontend's **translation** | `workflow → 워크플로` | machine-synced |
| glossary `overrides/{lang}.json` | **correct / extend** the frontend | `custom node → 커스텀 노드` | by hand, wins |

**Why three.** ComfyUI proper nouns with no settled translation (model names,
`checkpoint`, `embedding`, …) should stay in English → `preserve_terms`. Terms
the ComfyUI frontend already translates well → mirror them. Terms the frontend
gets wrong, lacks, or that a language community wants to pin → overrides.

### The glossary (`glossary/`)

```
glossary/
  frontend/{lang}.json   machine mirror of ComfyUI frontend locale terms
  overrides/{lang}.json   hand-maintained corrections; win over the mirror
```

**`frontend/`** is rebuilt wholesale by `pnpm glossary:sync` from the ComfyUI
frontend locales (the authoritative source). Never hand-edit it. Shape:

```jsonc
{ "custom nodes": "커스텀 노드", "workflow": "워크플로" }
```

**`overrides/{lang}.json`** is the place to record a term decision (issue #1124).
It both remaps terms and drops noisy frontend terms:

```jsonc
{
  "terms":  { "custom node": "커스텀 노드" },   // remap or add (wins over frontend)
  "ignore": ["title", "additional", "work"]      // drop a noisy frontend term
}
```

Resolution at translation time: frontend mirror → remove `ignore` → apply
`terms`. For each document, only terms that literally appear are selected
(whole-word, case-insensitive, longest-first, capped) and injected as
**preferred** (not mandatory) hints — so the model keeps natural phrasing when a
literal substitution would read awkwardly.

```bash
pnpm glossary:sync                 # rebuild the frontend mirror, all languages
pnpm glossary:sync -- --lang ko    # one language
pnpm glossary:sync:dry-run         # report counts without writing
```

Frontend path resolves in order: `--frontend <path>` → `FRONTEND_LOCALES_PATH`
env → `frontend_locales_path` in `translation-config.json` →
`../ComfyUI_frontend/src/locales`.

### Design notes

- **Why not auto-extract everything from the frontend?** Its UI locale strings
  are low signal as a glossary — full of button/toast text (`Download image`) and
  function words whose UI rendering is wrong in prose (`of → 중`, `work → 업무용`).
- **Why a curated word blocklist, not a length filter?** Gold short terms
  (`node`, `model`, `latent`) and harmful ones (`work`, `mode`, `here`) are the
  same length; length can't separate them. `sync-glossary.mjs` uses an explicit
  common-word blocklist; the long tail that slips through goes in override
  `ignore`.

### Curating

- A frontend term reads badly in prose → add it to the override `ignore` list.
- A term needs a different / agreed translation → add it to override `terms`.
- A term should stay in English everywhere → add it to `preserve_terms`.

## Files

| File | Role |
|------|------|
| `translate-i18n.ts` | translation entry point |
| `openapi-translate.ts` | OpenAPI summary/description translation |
| `chunked-translate.ts` | split/reassemble long MDX (`heading_sections`, `update_blocks`) |
| `sync-hash-i18n.ts` | Refresh translation hashes after manual edits (no API) |
| `repair-fences-i18n.ts` | Append missing closing ``` in translations (no API) |
| `sync-glossary.mjs` | rebuild the glossary frontend mirror |
| `glossary.mjs` | load glossary layers, select + inject terms |
| `i18n-config.mjs` | shared path rules from `translation-config.json` |
| `sync-docs-json.mjs` / `nav-label-translate.mjs` | docs.json navigation sync |
| `check-translation-truncation.ts` | detect truncated output |
| `check-i18n-sync.mjs` | PR check: English changes have matching translations |
| `translation-config.json` | languages, skip paths, `openapi_specs`, `preserve_terms`, frontend path |
