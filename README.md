# ComfyUI Documentation

| [English](README.md) | [中文](readme/zh-CN.md) | [日本語](readme/ja-JP.md) | [한국어](readme/ko-KR.md) |

## Development

To preview documentation changes locally, first install dependencies and then start the development server:

```
npm i
npm run dev
```

To sync translations after editing English docs, see [Automated translation](#automated-translation) below (`npm run translate`).

### Create a PR

Create a PR. Once it is accepted Vercel will deploy the change to https://docs.comfy.org/

### Generating API Reference Docs

Can either use an OpenAPI file or URL containing the file:

```bash
cd registry/api-reference # Keep API files separated by products.
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

This will only generate the MDX files for each endpoint. You need to add a link to these files in `docs.json`, and the up-to-date API spec will be shown on that doc page.

## Special Note on Renaming Files

- Renaming files can cause some external links to become inaccessible, as they are already used in numerous articles and templates.
- Since we can manage the sidebar navigation can be reorganized via the docs.json file, we generally do not change the original document's file location unless absolutely necessary.
- If you renamed any files and caused the file path to be changed, please update the `redirects` list in the `docs.json`

A GitHub Action will check for redirects and fail the PR if they are missing. Redirects should follow this format:

> ```json
> "redirects": [
>   {
>     "source": "/path/to/old-file",
>     "destination": "/path/to/new-file"
>   }
> ]
> ```
> Don't forget to include the corresponding translation files under `zh/`, `ja/`, `ko/`, etc.!

You can also refer to the [Mintlify doc](https://www.mintlify.com/docs/create/redirects) to learn how to add and match a wildcard path.

## About built-in node document

ComfyUI now has a built-in node help menu for both built-in nodes and custom nodes. All built-in node documentation will now be maintained in [this repo](https://github.com/Comfy-Org/embedded-docs).

###  Synchronization frequency

We will regularly sync updated documentation from the corresponding repository to docs.comfy.org weekly to ensure content synchronization and updates. If you would like to contribute to the documentation, please submit PRs and updates to [this repo](https://github.com/Comfy-Org/embedded-docs).

### Node Documentation File Organization

For node documentation, we will use a single-level directory structure under the `built-in-node` folder for the following reasons:
- ComfyUI may adjust node categories and directories during updates, using multi-level directory hierarchies means frequent adjustments to node documentation
- These frequent adjustments mean we need to frequently add redirects and checks
- Mintlify supports setting document hierarchy in the `docs.json` file, so we can make unified changes in that file

> Due to historical updates, some existing documents use different folder hierarchies. We will no longer adjust these files, but new files will use a single-level directory

## Contributing

Please just create a PR and we will review it within a few days.

Or talk to us on our [discord](https://discord.com/invite/comfyorg)

The documentation is built with Mintlify, please refer to [Mintlify documentation](https://mintlify.com/docs) to learn how to use it.

### i18n Contributions

English MDX at the repo root is the **source of truth**. Translations mirror the same relative paths under language directories (for example `zh/get_started/introduction.mdx`, `ja/get_started/introduction.mdx`, `ko/get_started/introduction.mdx`). Reusable fragments live in `snippets/` with per-language copies under `snippets/zh/`, `snippets/ja/`, `snippets/ko/`, and so on.

Contributing guides in other languages: [readme/](readme/) (中文, 日本語, 한국어).

**Translation policy**

Supported locales are maintained through **automated translation** from English. When English docs change, translations are updated in batch via `npm run translate` — contributors do not need to hand-translate every page.

**Request a new language**

Want docs in another language? [Open an issue](https://github.com/Comfy-Org/docs/issues/new) with the locale you need (for example French, German, or Brazilian Portuguese). A maintainer will add the language to `translation-config.json` and `docs.json`, then run a **full batch translation** of all content. You only need to submit the request; no translated MDX PR is required to get started.

Specifications for editing MDX can be found in the Writing Content section of the [Mintlify](https://mintlify.com/docs/page) document.

> **Note**: `built-in-nodes/` is maintained in [embedded-docs](https://github.com/Comfy-Org/embedded-docs) and is **skipped** by the translation script. Do not run bulk translation against that folder.

#### Automated translation

This repo includes a hash-based translation script. It compares each English file against `translationSourceHash` stored in the translated file; when the English source changes, the file is fully re-translated.

**Prerequisites**

1. Install [Bun](https://bun.sh)
2. Copy the env template and add your API key:

```bash
cp .env.local.example .env.local
# Set TRANSLATE_API_KEY (OpenAI-compatible: DashScope Qwen-MT, OpenRouter, DeepSeek, etc.)
```

**npm scripts**

| Command | Description |
|---------|-------------|
| `npm run translate` | Translate all languages listed in `translation-config.json` |
| `npm run translate:dry-run` | List pending files without calling the API |
| `npm run translate:force` | Re-translate everything, ignoring stored hashes |
| `npm run translate:snippets` | Translate `snippets/` only |
| `npm run translate:snippets:dry-run` | Preview pending snippet translations |
| `npm run translate:check-truncation` | Scan for likely truncated translations |
| `npm run translate:repair-truncated` | Re-translate files listed in the truncation log |
| `npm run glossary:sync` | Rebuild the terminology glossary from the ComfyUI frontend (see [Terminology consistency](#terminology-consistency)) |
| `npm run translate:review` | Score existing translations with an AI judge (see [Quality review](#quality-review)) |

Pass extra flags after `--`:

```bash
npm run translate -- --lang zh,ja
npm run translate:dry-run -- --lang ja
npm run translate -- installation/manual_install.mdx
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

**Truncated translations**

Long files can occasionally be cut off mid-translation (e.g. unclosed code fences). After a batch run, the script scans newly translated files and writes a repair list to `.github/i18n-logs/translate/truncation-issues.json` and `truncation-issues.txt` (gitignored). To scan everything for a language, or to repair:

```bash
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

`repair-truncated` reads the JSON log and force re-translates only the flagged files.

**How it works**

- **Input**: English MDX (primary) + existing target-language file as context (if present)
- **Output**: Updated files under `zh/`, `ja/`, `ko/`, etc., with refreshed `translationSourceHash` in frontmatter (snippets use an HTML comment for the hash)
- **Review notes (mismatch)**: When the model reports semantic issues via `=== MISMATCHES ===`, they go to `.github/i18n-logs/translate/mismatches.json` and `mismatches.txt` (gitignored), not into MDX. Only produced during `npm run translate`, not by the truncation scanner.
- **Truncation log**: Structural issues (unclosed code fences, short body) go to `.github/i18n-logs/translate/truncation-issues.json` — see [Truncated translations](#truncated-translations) above.
- **Skipped paths**: `built-in-nodes/` (configured in `translation-config.json` → `skip_paths`)
- **Chunked files**: `changelog/index.mdx` is handled by `<Update label="v0.x.x">` version labels. The script compares EN vs target labels, translates only **missing** versions, and inserts them in EN order. Old blocks are never re-translated unless you use `--force`.
- **Directories**: Subdirectories are created automatically when files are written; you do not need to `mkdir` by hand

Script location: `.github/scripts/i18n/` (see `translate-i18n.ts`, `translation-config.json`, and the [i18n README](.github/scripts/i18n/README.md) for full details)

#### Terminology consistency

To keep the same English term rendered the same way across pages (e.g. avoid "custom node" drifting between two different Korean translations), three complementary mechanisms feed the translator. Each handles a different kind of term:

| Mechanism | Effect | Example | Maintained |
|-----------|--------|---------|------------|
| `preserve_terms` (in `translation-config.json`) | keep the term **in English** | `checkpoint`, `LoRA`, `scheduler` | by hand |
| `glossary/frontend/{lang}.json` | use the frontend's **translation** | `workflow → 워크플로` | machine-synced |
| `glossary/overrides/{lang}.json` | **correct / extend** the frontend | `custom node → 커스텀 노드` | by hand, wins |

The **ComfyUI frontend** ([`ComfyUI_frontend/src/locales`](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/locales)) is the authoritative source of term translations. `npm run glossary:sync` mirrors its locale terms into `glossary/frontend/{lang}.json` (rebuilt wholesale each run — never hand-edit). Hand-maintained corrections live in `glossary/overrides/{lang}.json`, which wins over the mirror and is the place to record a term decision or drop a noisy frontend term:

```jsonc
// glossary/overrides/ko.json
{
  "terms":  { "custom node": "커스텀 노드" },   // remap or add (wins over frontend)
  "ignore": ["title", "additional", "work"]      // drop a noisy frontend term
}
```

At translation time, only terms that actually appear in a document are selected and injected as **preferred** (not mandatory) hints, so the model keeps natural phrasing when a literal substitution would read awkwardly. ComfyUI proper nouns with no settled translation (model names, `checkpoint`, …) instead go in `preserve_terms` to stay in English. See the [i18n README](.github/scripts/i18n/README.md) for the full design and curation guidance.

```bash
npm run glossary:sync                 # rebuild the frontend mirror, all languages
npm run glossary:sync -- --lang ko    # one language
npm run glossary:sync:dry-run         # report counts without writing
```

The frontend locales path resolves in order: `--frontend <path>` → `FRONTEND_LOCALES_PATH` env → `frontend_locales_path` in `translation-config.json` → `../ComfyUI_frontend/src/locales`.

#### Quality review

`npm run translate:review` scores existing translations with an **independent** (and typically cheaper) AI model — an LLM-as-a-judge — on four axes: accuracy, completeness, terminology (checked against the glossary), and fluency. It is separate from the translation model's own `=== MISMATCHES ===` self-notes; here a different model acts as judge.

Results are **advisory**: written to `.github/i18n-logs/review/` (`quality-report.json` / `.txt`, gitignored), never into MDX and never blocking a PR. By default only translations that are up to date with English and not yet reviewed at that hash are checked.

```bash
npm run translate:review                     # pending reviews, all languages
npm run translate:review -- --lang ko        # one language
npm run translate:review -- --all            # re-review everything
npm run translate:review -- --sample 20      # N pending files per language
npm run translate:review -- --min-score 4    # report files scoring below 4/5
```

Configure a dedicated cheap judge model via `REVIEW_API_KEY` / `REVIEW_API_BASE_URL` / `REVIEW_API_MODEL` in `.env.local` (falls back to the `TRANSLATE_*` model when unset). Use a fast model — evaluation is lighter than translation; reasoning-heavy models are slow under concurrency, so lower `REVIEW_CONCURRENCY` if you see connection errors.

#### Adding a new language

See [Request a new language](#request-a-new-language) above — please open an issue rather than adding a language in a PR yourself.

Maintainers: add one entry under `languages` in `.github/scripts/i18n/translation-config.json` (`code`, `name`, `dir`, `snippets_dir`). Path exclusion, link localization, and English-file scanning are derived automatically by `i18n-config.mjs` in the same folder — no per-language edits in translate scripts when adding a locale. Then add navigation in `docs.json` (see [Mintlify Localization](https://mintlify.com/docs/navigation/localization)), and batch-translate:

```bash
npm run glossary:sync -- --lang fr        # build the terminology glossary for the new locale
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

The glossary is extended automatically: once the language is in `translation-config.json`, `npm run glossary:sync` generates `glossary/frontend/{lang}.json` from the ComfyUI frontend locale (provided the frontend ships that locale). An `glossary/overrides/{lang}.json` file is optional — add it later only to correct or pin specific terms. See [Terminology consistency](#terminology-consistency).

#### Manual translation

You can still translate by hand instead of using the script:

1. Create a file under the language directory with the **same filename and path** as the English original.
2. Localize `import` paths (`/snippets/...` → `/snippets/zh/...`) and internal links (`/path` → `/zh/path`).
3. Add the page path to the correct language group in `docs.json`.

When English MDX changes, the `i18n-sync-check` workflow warns if matching translation files were not updated in the same PR, and posts a reminder comment tagging [@comfyui-wiki](https://github.com/comfyui-wiki). Update translations manually or re-run `npm run translate`.

#### Contributing Workflow Examples

When adding workflow examples to the documentation, please:

1. Take your output from ComfyUI (PNG, WebP), and add the models urls to the workflow so a user will have them when they drag in the workflow. You can use this [tool](https://comfyui-embeded-workflow-editor.vercel.app/) to edit the metadata of the PNG or WebP file.

[![Video Title](https://img.youtube.com/vi/_zYbP8w7G8A/0.jpg)](https://youtu.be/_zYbP8w7G8A)

2. Upload your workflow JSON and preview image to the [example_workflows repository](https://github.com/Comfy-Org/example_workflows)
3. Use the raw GitHub content URL in your documentation. To convert a GitHub file URL to a raw content URL:
   - Start with your GitHub file URL:
     ```
     https://github.com/Comfy-Org/example_workflows/blob/main/your-workflow.json
     ```
   - Change it to raw.githubusercontent.com and remove '/blob':
     ```
     https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/your-workflow.json
     ```

   You can also click the "Raw" button on the GitHub file page and copy the URL directly.

This ensures the workflow metadata is preserved in the docs site when dragging it into ComfyUI.
