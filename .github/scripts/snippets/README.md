# Partner-model Code pages

Every Router-addressable partner model has a `code.mdx` page under
`development/comfy-router/models/<provider>/<model>/`, showing how to call the
model through Comfy Router from Python, TypeScript and cURL.

Pages come in two kinds, and both are generated:

- **Curated** — a hand-written `code.yaml` next to the page supplies a display
  name, a real request body, and the path the result sits at. One spec can cover
  several model IDs (`variants`), which is why nine specs document fourteen models.
- **Derived** — no `code.yaml`; the page is generated from
  `router-schemas/<provider>/<model>.json` alone, the document the spec-sync bot
  commits from `GET /v2/models/<provider>/<model>/openapi.json`.

A derived page uses the synced Router schema. When
`x-comfy-input-schema-authored` is false, Router forwards the open input object
without model-specific validation, so the page links to the provider's input
documentation. Provider validation still applies. Output schemas and examples
remain available when published. Without a non-empty request example, the page
shows **Request setup** instead of runnable snippets with an empty body.

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
pnpm code-pages:gen             # regenerate every code.mdx, and the Models nav in docs.json
pnpm code-pages:check           # CI: fail if any page is stale OR MISSING, and syntax-check the snippets
pnpm code-pages:gen --prune     # also delete pages whose model has left the catalog, redirecting their URLs
```

`code-pages-check.yml` runs the check on any PR touching a spec, a generated
page, a synced schema, `docs.json`, the shared Router snippets or the generator.

## Coverage

`--check` fails when a model under `router-schemas/` has no page, not only when
an existing page is stale. That is the gate: the schemas are synced from cloud by
a bot, so a model Router starts serving arrives here on its own, and the first PR
after it lands goes red until the page is generated. Before this existed, the
catalog grew and the sidebar did not — Router served 202 models while the docs
listed 9.

The gate can only see models whose schema has been synced. `GET /v2/models` is
the full catalog and is ahead of `router-schemas/` (202 vs 162 on 2026-09-04);
closing that gap is the sync bot's job upstream, not this generator's. A page
whose model leaves the catalog is reported as an orphan and deleted by `--prune`
— a dead page in the sidebar documents a model that now answers 404. The URL the
page answered on is already in the wild, so `--prune` also writes a `docs.json`
redirect from it to the catalog landing page (`/development/comfy-router/models`);
that is what the repo's redirect check requires of any PR that deletes a page. A
redirect someone already wrote for that URL is kept as written, and a model that
comes back has its redirect removed again so it does not shadow the live page.

The `Models` group in `docs.json` is generated too, one sub-group per provider,
so a new page is in the sidebar the moment it is generated. Provider labels come
from `PROVIDER_LABEL` in the generator; an unlisted slug is title-cased, so a new
provider renders sanely without a code change.

## Serving providers

Some models can be served by more than one provider. Router publishes the
relationship on the schema documents themselves: a **native** document lists its
legs in `x-comfy-router-alt-providers` (`[{provider, model_id}]`), and each leg
also has an **alias** document of its own carrying `x-comfy-router-alias-of` (the
native model id) and `x-comfy-router-alias-provider` (the provider serving it).

The generator reads both and organises the docs by model rather than by route:

- An **alias document renders no page**: no `code.mdx`, no sidebar entry, no row
  on the catalog index. An alias page that already exists is an orphan, so
  `--prune` deletes it and writes a `docs.json` redirect from its URL to the page
  that documents the **native** model, not to the catalog index. Only the page
  goes; the alias JSON under `router-schemas/` stays published, which is what
  keeps model discovery working for an agent that reads the alias id. An alias is
  retired only when the model it points at is documented here: if the native
  document has not synced yet the alias keeps its page, rather than leaving a live
  model with no page at all, and the generator says so on stderr.
- A **native page gains a `## Serving providers` section** after its request
  setup: Comfy first (the default when the call names no provider), then one row
  per leg with the provider's label, the leg's alias model id, and the same call
  on the same endpoint with `?model_provider=<provider>` added. A native model
  with no leg renders no section.
- A **`development/comfy-router/providers.mdx`** index is generated listing each
  serving provider and the native models it covers, and is added to the `Models`
  nav group beside the catalog index. Comfy is described rather than enumerated:
  it serves the whole catalog, and the catalog index one link away already is
  that list. The page exists only while some model publishes a leg, so a catalog
  with no alternate routing gains no page, no nav entry and no diff.

The redirect destination is resolved through the page the native model is
actually documented on, which is not always `models/<provider>/<model>/code`: a
curated spec can cover a model under a different name, so
`vertexai/gemini-3-pro-image` lives at `models/google/nano-banana-pro/code`.

`bun test ./.github/scripts/snippets/` covers all four cases against inline
fixtures. `router-schemas/` is sync-owned, so a fixture document cannot be
committed there.

## The preview banner

`snippets/comfy-router/preview-notice.mdx` is rendered on every page while that
file exists, and vanishes from all of them on the next `code-pages:gen` once it
is deleted. The banner is a rollout artifact, so retiring it is one `rm` plus a
regen rather than an edit to the template and every generated page in the same
commit.

## The two delivery tabs

Every runnable Quick start is a tab pair: **Wait for the result** is the
`models.run` call, **Queue and collect later** is the same body through
`models.submit`, polled to completion and collected. Both tabs are emitted from
the one `example`, so they cannot disagree about the request. During the
gated preview the queued tab opened with
`snippets/comfy-router/queue-preview-notice.mdx`, on the same existence rule as
the preview banner; the file was removed once the queue was on for every
workspace, and recreating it brings the note back on every page after a regen.

## Schema sections

Every Code page includes a Schema section and the examples available for it.
Schema fields render from `router-schemas/<provider>/<model>.json`,
which is the exact body of `GET https://api.comfy.org/v2/models/<provider>/<model>/openapi.json`
(a standalone OpenAPI document; the spec-sync bot drops these in, do not hand
write them). When the file is absent, or reports
`x-comfy-input-schema-authored: false`, the page falls back to the spec's
`input` / `output` JSON Schema blocks (rendered as the same ParamField /
ResponseField list), with a note that Router
has not published the schema yet. Variants that resolve to the same
schema share one block; variants with different schemas get tabs.

Curated pages pair their `example` with `result.example`.
Derived pages use the synced examples with provider model identifiers adjusted for the page.
Fix other incorrect fixture data in the source contract rather than
editing synced JSON snapshots.

## Provider drift check

`pnpm code-pages:check-providers` (`check-provider-schemas.ts`) fetches each
provider's own published API specification (`provider_spec.url` in the
`code.yaml`: BFL and Ideogram publish OpenAPI, Google a discovery document)
and compares the documented `input` / `output` against it: unknown fields,
type, default, enum, bound and required-ness mismatches fail; provider fields
we leave undocumented are warnings (`--strict` makes them errors, `omit:` lists
the deliberate ones). It runs in CI as the `provider-schemas` job, so the
fallback schemas are tested rather than trusted until Router publishes its own.

### Per-variant defaults

Some provider bodies are a `oneOf` of modes: BFL's FLUX 3 Video is `t2v`, `i2v`,
`v2v` and `draft_enhance`, and the four modes disagree about `resolution` (`hd`
in three of them, `fhd` in `draft_enhance`). Merging those alternatives into one
shape used to take the last one's `default`, so the checker would have accepted a
documented `default: fhd` and rejected a documented `default: hd`. Both are wrong:
neither value is the default in every mode.

The checker now records the disagreement as `defaultByVariant` instead of picking
a winner, and reports it two ways:

```text
ERROR ... input: `resolution` documents a single default "fhd" but the provider default is per-variant
      {"t2v":"hd","i2v":"hd","v2v":"hd","draft_enhance":"fhd"}; document the per-variant defaults in the
      description and drop `default`
warn  ... input: `resolution` provider default is per-variant
      {"t2v":"hd","i2v":"hd","v2v":"hd","draft_enhance":"fhd"}; make sure the description says so
```

So a field like this carries no `default:` in the `code.yaml` and explains the
per-mode values in its `description` instead, which is what the page renders. The
variant keys come from the union's discriminator when the document declares one,
and fall back to `#0`, `#1` when it does not. Everything else about the field
(type, `enum`, bounds) is still checked as usual.

`bun test ./.github/scripts/snippets/` covers this against a fixture, and runs in
CI as the `snippet-script-tests` job. It needs no network, so it stays green when
a provider's host is down.

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
6. Run `pnpm code-pages:gen` (it writes the page and the `docs.json` nav entry)
   and link it from the overview's "Use it" cards.

Python, TypeScript and cURL are all emitted from the same `example`, so the
three snippets cannot disagree about the body. `--validate` compiles each
emitted snippet (`py_compile`, `bun build`, `bash -n`); nothing is executed and
nothing is billed. Live verification against Router is a separate, nightly,
credentialed job.
