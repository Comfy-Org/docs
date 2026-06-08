# ComfyUI Documentation

| [English](https://github.com/Comfy-Org/docs/blob/main/README.md) | [中文](https://github.com/Comfy-Org/docs/blob/main/README.zh-CN.md) | [日本語](https://github.com/Comfy-Org/docs/blob/main/README.ja-JP.md) |

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
> Don't forget to include the corresponding Chinese translation file in the `zh` directory as well!

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

English MDX at the repo root is the **source of truth**. Translations mirror the same relative paths under language directories (for example `zh/get_started/introduction.mdx`, `ja/get_started/introduction.mdx`). Reusable fragments live in `snippets/` with per-language copies under `snippets/zh/`, `snippets/ja/`, and so on.

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

Pass extra flags after `--`:

```bash
npm run translate -- --lang zh,ja
npm run translate:dry-run -- --lang ja
npm run translate -- installation/manual_install.mdx
```

**How it works**

- **Input**: English MDX (primary) + existing target-language file as context (if present)
- **Output**: Updated files under `zh/`, `ja/`, etc., with refreshed `translationSourceHash` in frontmatter (snippets use an HTML comment for the hash)
- **Skipped paths**: `built-in-nodes/` (configured in `translation-config.json` → `skip_paths`)
- **Directories**: Subdirectories are created automatically when files are written; you do not need to `mkdir` by hand

Script location: `.github/scripts/translate-i18n.ts`

#### Adding a new language

1. **Register the language** in `.github/scripts/translation-config.json`:

```json
{
  "code": "fr",
  "name": "French",
  "dir": "fr",
  "snippets_dir": "snippets/fr"
}
```

2. **Add navigation** in `docs.json` under `navigation.languages` (copy the English tree and prefix page paths with `fr/`). See [Mintlify Localization](https://mintlify.com/docs/navigation/localization).

```json
{
  "language": "fr",
  "tabs": [
    {
      "tab": "Commencer",
      "pages": [
        "fr/index",
        "fr/get_started/introduction"
      ]
    }
  ]
}
```

3. **Run translation**:

```bash
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

Mintlify supports many locale codes (for example `zh`, `ja`, `fr`, `de`). The `language` value in `docs.json` must match [Mintlify's localization settings](https://mintlify.com/docs/navigation/localization); the folder name (`fr/`, `zh/`, `ja/`) should stay consistent with your `translation-config.json` `dir` field.

#### Manual translation

You can still translate by hand instead of using the script:

1. Create a file under the language directory with the **same filename and path** as the English original.
2. Localize `import` paths (`/snippets/...` → `/snippets/zh/...`) and internal links (`/path` → `/zh/path`).
3. Add the page path to the correct language group in `docs.json`.

When English MDX changes, CI workflows (`zh-cn-sync-check`, `ja-sync-check`) emit **warnings** if matching `zh/` or `ja/` files were not updated in the same PR. Update translations manually or re-run `npm run translate`.

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
