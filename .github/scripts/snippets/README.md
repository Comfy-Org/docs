# Partner-model Code pages

Every partner model page under `tutorials/partner-nodes/<provider>/<model>/` can
carry a third sub-page, `code.mdx`, showing how to call the model through Comfy
Router from Python, TypeScript and cURL.

`code.mdx` is **generated**. The source of truth is the `code.yaml` next to it;
the page shape lives in `gen-code-pages.ts` and nowhere else.

```
tutorials/partner-nodes/black-forest-labs/flux-1-kontext/
  flux-1-kontext.mdx   Overview (hand-written)
  workflow.mdx         Workflows (hand-written)
  code.yaml            spec: name, variants, example body, result path   <- edit this
  code.mdx             generated from code.yaml                          <- never edit
```

## Commands

```bash
pnpm code-pages:gen     # regenerate every code.mdx from its code.yaml
pnpm code-pages:check   # CI: fail if any code.mdx is stale, and syntax-check the emitted snippets
```

`code-pages-check.yml` runs the check on any PR touching a spec, a generated
page, the shared Router snippets or the generator.

## Adding a model

1. Create `code.yaml` in the model's directory (copy the Kontext one).
2. Set `variants` to the Router model IDs (`provider/model`, from `GET /v2/models`).
3. Put the smallest request body that produces a result in `example`. A value of
   `"@file:<path>"` is read from disk and base64 encoded by every snippet.
4. Set `result.path` to where the output lives in the provider's native
   response and `result.example` to a representative response.
5. Run `pnpm code-pages:gen`, add the page to the model's group in `docs.json`,
   and link it from the overview's "Use it" cards.

Python, TypeScript and cURL are all emitted from the same `example`, so the
three snippets cannot disagree about the body. `--validate` compiles each
emitted snippet (`py_compile`, `bun build`, `bash -n`); nothing is executed and
nothing is billed. Live verification against Router is a separate, nightly,
credentialed job.
