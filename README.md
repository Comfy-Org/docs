# ComfyUI Documentation

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mintlify) to preview the documentation changes locally. To install, use the following command

```
npm i mintlify
```

Run the following command at the root of your documentation (where mint.json is)

```
npx mintlify dev
```

### Create a PR

Create a PR. Once it is accepted Vercel will deploy the change to https://docs.comfy.org/

### Generating API Reference Docs

Can either use an OpenAPI file or URL containing the file:

```bash
cd registry/api-reference # Keep API files separated by products.
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

This will only generate the MDX files for each endpoint. You need to add a link to these files in `mint.json`, and the up-to-date API spec will be shown on that doc page.

## Contributing

Please just create a PR and we will review it within a few days.

Or talk to us on our [discord](https://discord.com/invite/comfyorg)

### i18n Contributions

Mintlify uses versioning as a way to add additional locales. To add a translation of a page, follow these instructions:

1. Create a file under the language code with the same exact filename of the original english filename.

eg. If you are translating `introduction.mdx` into Chinese, create a file under `zh-CN/get_started/introduction.mdx`. Make sure you include the version in the new file:

```
---
title: ""
description: ""
version: "Chinese"
---
```

2. Change the original file to be English version

Files without versions appear in all versions, so we need to make sure the English file does not appear in the Chinese translation.

```
---
title: ""
description: ""
version: "English"
---
```

3. Update navigation for `mint.json`

If you translated a single page, just add the new translated page to the navigation group.

For `introduction.mdx`:

```
  "pages": [
    "get_started/introduction",
    "zh-CN/get_started/introduction",
  ...
  ]
```

Mintlify will automatically filter out pages that are not the current version (in our case language).

If all the pages in a group are translated, you should make a copy of the entire group for the specific version.

eg. If the Getting Started group has all been translated, we can do this:

```
{
  "group": "Get Started",
  "version": "English"
  "pages": [
    ...English pages
  ]
},
{
  "group": “入门指南",
  "version": "Chinese"
  "pages": [
    ...Chinese pages
  ]
}

```

```


```

#### Adding a new language

If a language does not exist yet, add it in `mint.json` under versions. So if you are adding Portuguese, make this change:

```
"versions": [{
    "name": "Português",
    "locale": "pt-BR"
  }]
```

The locale will enable translation of Mintlify default UI component text. This is optional. The full list of locales are [here](https://mintlify.com/docs/settings/global#param-locale).
