# Partner-model Code pages

Every Router-addressable partner model can carry a `code.mdx` page under
`development/comfy-router/models/<provider>/<model>/`, showing how to call the
model through Comfy Router from Python, TypeScript and cURL.

These pages live in the **developer** section, not under `tutorials/`: the
tutorials tree is for end users driving the nodes in the app, and mixing API
reference into it makes both harder to find. Each tutorial page links across to
its Code page instead.

`code.mdx` is **generated**. The source of truth is the `code.yaml` next to it;
the page shape lives in `gen-code-pages.ts` and nowhere else.

```text
development/comfy-router/models/black-forest-labs/flux-1-kontext/
  code.yaml            spec: name, variants, example body, result path   <- edit this
  code.mdx             generated from code.yaml                          <- never edit

tutorials/partner-nodes/black-forest-labs/flux-1-kontext.mdx   Overview (hand-written, links to the Code page)
```

## Commands

```bash
pnpm code-pages:gen     # regenerate every code.mdx from its code.yaml
pnpm code-pages:check   # CI: fail if any code.mdx is stale, and syntax-check the emitted snippets
```

`code-pages-check.yml` runs the check on any PR touching a spec, a generated
page, the shared Router snippets or the generator.

## Schema sections

Every Code page ends with a Schema section (Input, Output) and an Examples
section (Input, Output). They render from `router-schemas/<provider>/<model>.json`,
which is the exact body of `GET https://api.comfy.org/v2/models/<provider>/<model>/openapi.json`
(a standalone OpenAPI document; the spec-sync bot drops these in, do not hand
write them). When the file is absent, or reports
`x-comfy-input-schema-authored: false`, the page falls back to the spec's
`input` / `output` JSON Schema blocks (rendered as the same ParamField /
ResponseField list) and `example` / `result.example`, with a note that Router
has not published the schema yet. Variants that resolve to the same
schema share one block; variants with different schemas get tabs.

## Provider drift check

`pnpm code-pages:check-providers` (`check-provider-schemas.ts`) fetches each
provider's own published API specification (`provider_spec.url` in the
`code.yaml`: BFL and Ideogram publish OpenAPI, Google a discovery document)
and compares the documented `input` / `output` against it: unknown fields,
type, default, enum, bound and required-ness mismatches fail; provider fields
we leave undocumented are warnings (`--strict` makes them errors, `omit:` lists
the deliberate ones). It runs in CI as the `provider-schemas` job, so the
fallback schemas are tested rather than trusted until Router publishes its own.

## Adding a model

1. Create `code.yaml` in the model's directory (copy the Kontext one).
2. Set `variants` to the Router model IDs (`provider/model`, from `GET /v2/models`).
3. Write `summary`: one sentence describing what the model does. It becomes the
   opening line of the generated page's body (`API Reference for <name>.
   <summary>`) unless `intro` overrides it.
4. Put the smallest request body that produces a result in `example`. A value of
   `"@file:<path>"` is read from disk and base64 encoded by every snippet.
5. Set `result.path` to where the output lives in the provider's native
   response and `result.example` to a representative response.
6. Run `pnpm code-pages:gen`, add the page to the model's group in `docs.json`,
   and link it from the overview's "Use it" cards.

Python, TypeScript and cURL are all emitted from the same `example`, so the
three snippets cannot disagree about the body. `--validate` compiles each
emitted snippet (`py_compile`, `bun build`, `bash -n`); nothing is executed and
nothing is billed. Live verification against Router is a separate, nightly,
credentialed job.
