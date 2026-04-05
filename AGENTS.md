# AGENTS.md

## Cursor Cloud specific instructions

This is the **ComfyUI Official Documentation** site, built with [Mintlify](https://mintlify.com/). There is no backend, database, or build step — only a static docs preview server.

### Running the dev server

```
npm run dev
```

This runs `npx mint dev` and starts the Mintlify local preview server on **port 3000**. The initial startup takes ~90 seconds due to ~3000 MDX files being processed. Hot-reload works for content edits.

### Lint / CI checks available locally

- **Broken links**: `npx mint broken-links` — checks for broken internal links across all pages.
- **OpenAPI check**: `npx mint openapi-check https://api.comfy.org/openapi` — validates OpenAPI schema references.
- There is no ESLint, TypeScript, or other code linting — this is a pure documentation repo.

### Key files

- `docs.json` — Main configuration for navigation, theming, redirects, and localization.
- `package.json` — Only two runtime deps: `mint` and `sharp`.
- `.github/workflows/` — CI checks for broken links, redirects, translation sync, and link validation.

### Gotchas

- The dev server may show navigation warnings about Japanese (`ja/`) translation pages that are referenced in `docs.json` but don't exist yet. These are non-blocking warnings.
- When renaming or moving `.mdx` files, redirects must be added to `docs.json` — a CI check enforces this on PRs.
- Chinese (`zh/`) translation files must be updated when modifying English `.mdx` files — enforced by CI.
