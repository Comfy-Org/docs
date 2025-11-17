# ComfyUI Documentation
| [English](./README.md) | [中文](./README.zh-CN.md) |

## Development


To preview documentation changes locally, first install dependencies and then start the development server:

```
npm i
npm run dev
```

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
> Don't forget to include the corresponding Chinese translation file in the `zh-CN` directory as well!

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

Mintlify uses versioning to add other languages. To add a translation of a page, follow these instructions:

1. Create a file under the language code with the same exact filename of the original English filename.

For example: If you are translating `introduction.mdx` into Chinese, create a file under `zh-CN/get_started/introduction.mdx`. 

Specifications for file editing can be found in the Writing Content section of the [Mintlify](https://mintlify.com/docs/page) document

> **Important**: When you modify an existing MDX file in the English documentation, you must also update the corresponding file in the `zh-CN` directory. A GitHub Action will automatically check for this and fail the PR if the corresponding Chinese translations are not updated.

2. Update navigation for `docs.json`

Please refer to [Mintlify Localization](https://mintlify.com/docs/navigation/localization) for configuration details.

If you translated a single page, just add the new translated page path to the corresponding language navigation group, and it will be displayed in that language version.

For `introduction.mdx`:

```
  "navigation": {
    "languages": [
      {
        "language": "en",
        "groups": [
              {
                "group": "Get Started",
                "pages": [
                  "get_started/introduction",
                ...
                ]
              },
            ...
        ]
      },
      {
        "language": "cn",
         "groups": [
              {
                "group": "开始行动",
                "pages": [
                  "zh-CN/get_started/introduction",
                  ...
                ]
              }
            ]
      }
    ]
    ...
  }
```

Mintlify will automatically determine which pages to display in different language versions based on the `language` configuration.

Currently, Mintlify supports localization for English (en), Chinese (cn), Spanish (es), French (fr), Japanese (jp), Portuguese (pt), Brazilian Portuguese (pt-BR), and German (de).

For more information, please refer to the Mintlify documentation on [Mintlify Localization](https://mintlify.com/docs/navigation/localization).

#### Adding a new language

If a language doesn't exist yet, for example, if you want to add a French translation of `introduction.mdx`, you should create a new `fr-FR` folder in the root directory, complete the translation, and then add the following content under `languages` in `docs.json`:

```
{
  "languages": [
    ...
    {
        "language": "fr",
        "groups": [
              {
                "group": "Get Started",
                "pages": [
                  "fr-FR/get_started/introduction",
                  ...
                ]
              }
          ]
      }
  ]
}
```

The locale will translate Mintlify default UI components' text. This is optional. The full list of locales are [here](https://mintlify.com/docs/settings/global#param-locale).

#### Contributing Workflow Examples

When adding workflow examples to the documentation, please:

1. Take your output from ComfyUI (PNG, WebP), and add the models urls to the workflow so a user will have them when they drag in the workflow. You can use this [tool](https://comfyui-embeded-workflow-editor.vercel.app/) to edit the metadata of the PNG or WebP file.

[![Video Title](https://img.youtube.com/vi/_zYbP8w7G8A/0.jpg)](https://youtu.be/_zYbP8w7G8A)

1. Upload your workflow JSON and preview image to the [example_workflows repository](https://github.com/Comfy-Org/example_workflows)
1. Use the raw GitHub content URL in your documentation. To convert a GitHub file URL to a raw content URL:
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

