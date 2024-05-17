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

Create a PR. Once it is accepted Vercel will deploy the change to https://comfydocs.org.

### Generating API Reference Docs

Can either use an OpenAPI file or URL containing the file:

```bash
cd registry/api-reference # Keep API files separated by products.
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

This will only generate the MDX files for each endpoint. You need to add a link to these files in `mint.json`, and the up-to-date API spec will be shown on that doc page.
