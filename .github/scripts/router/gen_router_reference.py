#!/usr/bin/env python3
"""Render Comfy Router's reference from the public router-openapi.yaml snapshot.

Cloud projects and leak-checks the API contract before syncing it here. Docs
owns this renderer and its editorial descriptions. Regenerate with:
    python3 .github/scripts/router/gen_router_reference.py router-openapi.yaml development/comfy-router/reference.mdx
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
from typing import Any

import yaml

ROUTER_TAG = "Comfy Router"

HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")

BANNER = """{/*
  GENERATED FILE -- DO NOT HAND-EDIT.

  Produced from the Comfy API contract by gen_router_reference.py. Edit the
  contract and regenerate; an edit made here is overwritten by the next run and
  is rejected by the drift gate in the meantime.
*/}"""

FRONTMATTER = """---
title: "Comfy Router API reference"
sidebarTitle: "API Reference"
description: "Every Comfy Router endpoint, parameter, response body and error bucket, generated from the Comfy API contract."
---"""


# Editorial guidance owned by docs, separate from the generated API contract.
RESULT_ASSETS = """## Result assets

A model can return asset URLs, inline bytes, or both. The providers below copy selected assets onto Comfy storage and replace their URLs. This behavior depends on the model; there is no request header that selects it.

| Models | What is copied onto Comfy storage | Maximum Comfy-hosted URL lifetime |
| --- | --- | --- |
| `bfl/*` | the finished asset, and the draft-cache asset when the result carries one | 24 hours |
| `byteplus/*` video models (`seedance`, `dreamina-seedance`) | the finished video, and the last-frame image when the result carries one | 24 hours |
| `minimax/*` | the finished video | 12 hours |
| `xai/*` | every generated image, and the finished video | 24 hours |

These lifetimes start when the URL is signed, not when you open it. Cached or replayed URLs can have less time remaining; replay does not renew them. Download the asset promptly. Only the assets named in each row are copied: `byteplus/seedream-*` and `byteplus/seededit-*` images are not covered by the BytePlus video row.

**Veo (`veo/*`) has a separate storage path.** In `response.videos[]`, read whichever member is present: `bytesBase64Encoded` contains the clip inline, while `gcsUri` contains a Comfy-signed HTTPS link when the environment is configured for direct provider writes to Comfy storage. That link is valid for 24 hours from the response. The latter case writes the asset directly rather than copying it, so Veo is not in the rehosting table.

Other models return provider asset references or inline bytes. Provider URLs follow the provider's expiry, which can be much shorter than the lifetimes above and is not specified by the Router contract.

Copying is best effort per asset. If one copy fails, that entry keeps its provider reference; the response can contain both Comfy and provider URLs, with no explicit per-asset copy-status field. The generation still succeeds and is charged. Do not infer every URL's lifetime from one successfully rehosted asset.

The `xai` and `minimax` adapters serialize through known provider types, so undeclared provider fields may be omitted. Consult the model's output schema rather than assuming that every field from a provider SDK is preserved.

Whether a result is Comfy-hosted also decides whether a completed call can still be replayed from its `Idempotency-Key` record later; the `Idempotency-Key` parameter above says what a retry is answered with when it cannot be."""


def lead(text: Any) -> str:
    """First paragraph of a description, whitespace-normalized.

    Every description on the Router surface is a folded (`>-`) YAML scalar, and
    folding has ALREADY collapsed each paragraph's own line breaks into spaces
    by the time the value reaches here. A surviving `\\n` is therefore a
    paragraph break, and splitting on a BLANK line instead would find none and
    return the whole description -- rationale, internal notes and all.
    """
    if not isinstance(text, str):
        return ""
    para = text.strip().split("\n", 1)[0]
    return " ".join(para.split())


def deref(doc: dict, node: Any) -> Any:
    """Resolve a local `$ref` one hop. Non-local refs are a spec bug, not a fallback."""
    if not isinstance(node, dict) or "$ref" not in node:
        return node
    ref = node["$ref"]
    if not ref.startswith("#/"):
        raise ValueError(f"non-local $ref is not supported in this spec: {ref}")
    cur: Any = doc
    for part in ref[2:].split("/"):
        cur = cur[part]
    return cur


def ref_name(node: Any) -> str | None:
    """Component name a `$ref` points at, or None for an inline node."""
    if isinstance(node, dict) and isinstance(node.get("$ref"), str):
        return node["$ref"].rsplit("/", 1)[-1]
    return None


def anchor(name: str) -> str:
    """Mintlify/GitHub heading anchor for a schema section."""
    return "#" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def schema_link(name: str) -> str:
    return f"[`{name}`]({anchor(name)})"


_CODE_SPAN = re.compile(r"(`[^`]*`)")


def mdx(text: str) -> str:
    """Neutralize MDX-hazardous characters in spec-authored prose.

    Mintlify parses this reference as MDX, where a bare `{` opens a JSX
    expression and a bare `<` opens a JSX element -- either one turns a sentence
    the spec author wrote as plain prose into a docs-build failure. Text inside a
    backtick code span is already literal and is left alone, because escaping
    there renders the entity instead of the character.
    """
    parts = _CODE_SPAN.split(text)
    for i, part in enumerate(parts):
        if i % 2 == 0:
            parts[i] = (
                part.replace("{", "&#123;")
                .replace("}", "&#125;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
    return "".join(parts)


def cell(text: Any) -> str:
    """Render a spec-authored value as the contents of ONE GFM table cell.

    A `|` opens a new column wherever it appears -- GFM requires it escaped even
    inside a code span, and an alternation such as `^(fal|openai)/` is routine in
    a `pattern` on this surface -- so it is escaped unconditionally. The table
    parser turns `\\|` back into a literal `|` before inline parsing, so the code
    spans still read correctly.
    """
    return mdx(str(text)).replace("|", "\\|")


def summary(text: Any) -> str:
    """One complete sentence for a dense reference table cell."""
    pieces = re.split(r"(`[^`]*`|\[[^\]]+\]\([^)]+\))", lead(text))
    result = ""
    for index, piece in enumerate(pieces):
        if index % 2 == 0:
            for match in re.finditer(r"[.!?](?=\s|$)", piece):
                candidate = result + piece[:match.end()]
                if not re.search(r"\b(?:e\.g|i\.e|etc)\.$", candidate):
                    return candidate.strip()
        result += piece
    return result.strip()


def response_summary(status: Any, response: dict, named: str | None, body_name: str | None) -> str:
    if str(status) == "409":
        return (
            "Inspect `X-Comfy-Error-Type`: `concurrency_limit_exceeded` means the original "
            "call is still running, so wait for `Retry-After` and reuse the same key; "
            "`invalid_input` requires a new key."
        )
    if str(status) == "429":
        return (
            "Inspect `X-Comfy-Error-Type`: `concurrency_limit_exceeded` means reduce "
            "in-flight calls; `rate_limited` means wait for the allowance window."
        )
    if named == "RouterRequestError" or body_name == "RouterErrorResponse":
        known = {
            "400": "Invalid request. Check the error type and request body.",
            "401": "Missing or invalid credentials.",
            "403": "The request is not allowed for this caller or model.",
            "404": "The model ID was not found.",
            "413": "The request body is too large.",
            "500": "Router could not complete the request.",
            "503": "Router is temporarily unavailable. Retry with backoff.",
            "504": "The request exceeded a deadline. Check the error type before retrying.",
        }
        if str(status) in known:
            return known[str(status)]
    return summary(response.get("description"))


def public_endpoint_description(method: str, path: str, description: Any) -> str:
    summaries = {
        ("GET", "/v2/models"): "List available model IDs and billing facts. Use `next_cursor` while `has_more` is true.",
        ("GET", "/v2/models/{provider}/{model}"): "Read details for one model without listing the full catalog.",
        ("POST", "/v2/models/{provider}/{model}"): "Run a model and receive its finished result in the same response.",
        ("GET", "/v2/models/{provider}/{model}/openapi.json"): "Read one model's input and output schemas as a standalone OpenAPI document.",
    }
    return summaries.get((method, path), lead(description))


def public_schema_description(name: str, description: Any) -> str:
    summaries = {
        "RouterModelInput": "The model input object. Read the selected model's OpenAPI document for fields and validation.",
        "RouterModelOutput": "The model result object. Read the selected model's output schema for its exact shape.",
        "RouterModelInputSchemaDocument": "A standalone OpenAPI document for one model's input and output.",
        "RouterModelId": "The model ID used in `POST /v2/models/{provider}/{model}`.",
        "RouterProviderSegment": "The provider portion of a `{provider}/{model}` model ID.",
        "RouterModelSegment": "The model portion of a `{provider}/{model}` model ID.",
        "RouterPageCursor": "An opaque catalog cursor. Pass it back unchanged as `cursor`.",
        "RouterModelListEntry": "A model's ID and billing facts.",
        "RouterModelDetailFields": "Optional fields returned by the model-details endpoint.",
        "RouterModelBilling": "Billing behavior to check before invoking a model. It does not include prices or usage.",
        "RouterChargesOnPolicyRejection": "Whether a content-policy refusal is charged for this model. Treat an unknown value as potentially charged.",
        "RouterErrorType": "Machine-readable Router error category, also sent in the `X-Comfy-Error-Type` header.",
        "RouterErrorResponse": "Error body for authentication, access, model lookup, quota, and provider transport failures.",
        "RouterValidationErrorContext": "Provider-supplied details about the validation rule that failed.",
        "RouterValidationErrorInput": "The rejected input value, when the provider includes it.",
        "RouterValidationErrorDetail": "One field-level validation failure.",
        "RouterValidationErrorResponse": "The `422` validation error body. Read `X-Comfy-Error-Type` for its category.",
    }
    return summaries.get(name, lead(description))


def public_parameter_description(path: str, name: str, description: Any) -> str:
    descriptions = {
        ("/v2/models/{provider}/{model}", "provider"): "Provider portion of the canonical `{provider}/{model}` model ID.",
        ("/v2/models/{provider}/{model}", "model"): "Model portion of the canonical `{provider}/{model}` model ID.",
        ("/v2/models/{provider}/{model}/openapi.json", "provider"): "Provider portion of the canonical `{provider}/{model}` model ID.",
        ("/v2/models/{provider}/{model}/openapi.json", "model"): "Model portion of the canonical `{provider}/{model}` model ID.",
    }
    return descriptions.get((path, name), summary(description))


def public_property_description(parent: str, field: str, description: Any) -> str:
    descriptions = {
        ("RouterModelDetailFields", "input_schema_url"): "URL of this model's OpenAPI document, including its input and output schemas.",
    }
    return descriptions.get((parent, field), lead(description))


def type_of(doc: dict, node: Any) -> str:
    """Human-readable type for a parameter/property, following one `$ref` hop."""
    name = ref_name(node)
    target = deref(doc, node)
    if not isinstance(target, dict):
        return "any"
    if name is not None and name.startswith("Router"):
        return schema_link(name)
    if "allOf" in target:
        return " & ".join(type_of(doc, sub) for sub in target["allOf"])
    kind = target.get("type")
    if kind == "array":
        return f"array of {type_of(doc, target.get('items', {}))}"
    if kind is None:
        return "any"
    if kind == "object" and target.get("additionalProperties") is True:
        return "object (open)"
    return str(kind)


def constraints_of(doc: dict, node: Any) -> str:
    """Validation rules for the human reference, with common patterns named plainly."""
    target = deref(doc, node)
    if not isinstance(target, dict):
        return ""
    parts = []
    pattern = target.get("pattern")
    if pattern == r"^[a-z0-9]+([._-][a-z0-9]+)*$":
        if ref_name(node) == "RouterProviderSegment":
            parts.append("Alphanumeric slug, e.g. `anthropic`")
        else:
            parts.append("Alphanumeric slug, e.g. `claude-opus-4-6`")
    elif pattern == r"^[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9]+([._-][a-z0-9]+)*$":
        parts.append("Model ID, e.g. `anthropic/claude-opus-4-6`")
    elif pattern == r"^[A-Za-z0-9._~+/=-]+$":
        parts.append("Opaque cursor returned as `next_cursor`")
    elif pattern == r"^https://":
        parts.append("HTTPS URL, e.g. `https://api.comfy.org/v2/models/bfl/flux-2-pro/openapi.json`")
    elif pattern:
        parts.append(f"`pattern: {pattern}`")
    if target.get("format") == "uri":
        if pattern != r"^https://":
            parts.append("URI")
    elif "format" in target:
        parts.append(str(target["format"]))
    min_length, max_length = target.get("minLength"), target.get("maxLength")
    if min_length is not None and max_length is not None:
        parts.append(f"{min_length}–{max_length} characters")
    elif max_length is not None:
        parts.append(f"Up to {max_length} characters")
    elif min_length is not None:
        parts.append(f"At least {min_length} character{'s' if min_length != 1 else ''}")
    minimum, maximum = target.get("minimum"), target.get("maximum")
    if minimum is not None and maximum is not None:
        parts.append(f"{minimum}–{maximum}")
    elif maximum is not None:
        parts.append(f"Up to {maximum}")
    elif minimum is not None:
        parts.append(f"At least {minimum}")
    if "default" in target:
        parts.append(f"Default: {target['default']}")
    return ", ".join(parts)


def is_internal(op: dict) -> bool:
    """Whether an operation is withheld from public output.

    The same marker the public v2 spec projection honours
    (`_is_internal_operation` in api/v2/scripts/project_spec.py), so an
    operation withheld from one public artifact is withheld from both. Without
    it the reference had no readiness marker at all: tag membership was the only
    selector, and a route can be in the contract before it is servable.
    """
    tags = op.get("tags")
    return op.get("x-internal") is True or (isinstance(tags, list) and "internal" in tags)


def merged_parameters(doc: dict, item: dict, op: dict) -> list[Any]:
    """An operation's parameters, including the ones it inherits from its path.

    OpenAPI lets a parameter shared by every operation under a path be declared
    once on the Path Item. Reading only `op.parameters` would silently drop such
    a parameter from the reference, and the drift gate could not catch it because
    it compares this generator's output only against itself. Keyed by
    `(name, in)` so an operation's own declaration overrides the inherited one,
    which is the precedence OpenAPI specifies.
    """
    merged: dict[tuple[Any, Any], Any] = {}
    for source in ((item.get("parameters") or []), (op.get("parameters") or [])):
        for node in source:
            resolved = deref(doc, node)
            if not isinstance(resolved, dict):
                continue
            merged[(resolved.get("name"), resolved.get("in"))] = node
    return list(merged.values())


def collect_router_operations(doc: dict) -> list[dict]:
    ops: list[dict] = []
    for path, item in (doc.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        for method in HTTP_METHODS:
            op = item.get(method)
            if not isinstance(op, dict):
                continue
            if ROUTER_TAG in (op.get("tags") or []) and not is_internal(op):
                ops.append(
                    {
                        "path": path,
                        "method": method.upper(),
                        "op": op,
                        "parameters": merged_parameters(doc, item, op),
                    }
                )
    # Sorted by path then method so the output is a function of the spec's
    # CONTENT, not of its key order -- a re-ordered spec must not show up as a
    # drift-gate failure.
    ops.sort(key=lambda o: (o["path"], o["method"]))
    return ops


def reachable_schemas(doc: dict, ops: list[dict]) -> list[str]:
    """Component schemas the Router operations reach, transitively, in sorted order."""
    schemas = (doc.get("components") or {}).get("schemas") or {}
    seen: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for child in node:
                walk(child)
            return
        if not isinstance(node, dict):
            return
        name = ref_name(node)
        if name is not None:
            # Follow the ref wherever it points, not only into
            # components/schemas: a Router response is reached as
            # `$ref: components/responses/RouterRequestError`, and stopping at
            # a section this walk does not recognize is how the whole error
            # contract went missing from an earlier draft of this reference.
            if name in schemas:
                if name in seen:
                    return
                seen.add(name)
            target = deref(doc, node)
            # A $ref's siblings are ignored by OpenAPI 3.0.2, so the target is
            # the only thing on this node worth walking.
            walk(target)
            return
        for child in node.values():
            walk(child)

    for entry in ops:
        walk(entry["op"])

    # The `Router` prefix is this spec's namespace for Router-owned components,
    # and it is included WHOLESALE rather than only where reachable. The 422
    # validation body is the case that forces it: `RouterValidationErrorResponse`
    # is part of the published error contract but no operation declares a `422`
    # yet, so a purely reachability-driven reference would omit the very shape an
    # SDK's typed exception hierarchy is built on.
    seen.update(name for name in schemas if name.startswith("Router"))
    return sorted(seen)


def render_properties(doc: dict, name: str, schema: dict, out: list[str]) -> None:
    props = schema.get("properties")
    if not isinstance(props, dict) or not props:
        return
    required = set(schema.get("required") or [])
    out.append("| Field | Type | Required | Constraints | Description |")
    out.append("| --- | --- | --- | --- | --- |")
    for field, node in props.items():
        desc = public_property_description(parent=name, field=field, description=(deref(doc, node).get("description") if isinstance(deref(doc, node), dict) else ""))
        out.append(
            f"| `{cell(field)}` | {type_of(doc, node)} | "
            f"{'yes' if field in required else 'no'} | "
            f"{cell(constraints_of(doc, node)) or '-'} | {cell(desc) or '-'} |"
        )
    out.append("")


def render_error_types(doc: dict, out: list[str]) -> None:
    schemas = (doc.get("components") or {}).get("schemas") or {}
    error_type = schemas.get("RouterErrorType")
    if not isinstance(error_type, dict):
        raise ValueError("openapi.yml declares no RouterErrorType schema")
    buckets = error_type.get("x-comfy-error-types")
    if not isinstance(buckets, list) or not buckets:
        raise ValueError(
            "RouterErrorType carries no x-comfy-error-types: the reference has no "
            "source for the bucket meanings, and RouterErrorType is deliberately not "
            "an enum, so there is nothing else to read them from"
        )
    out.append("## Error buckets")
    out.append("")
    out.append(mdx(public_schema_description("RouterErrorType", error_type.get("description"))))
    out.append("")
    for tier, title, blurb in (
        (
            "request",
            "Request-level buckets",
            "Raised for a request Router accepted and then could not complete.",
        ),
        (
            "transport",
            "Transport-level buckets",
            "Raised by Router itself, before or around the call to the model.",
        ),
    ):
        rows = [b for b in buckets if isinstance(b, dict) and b.get("tier") == tier]
        if not rows:
            continue
        out.append(f"### {title}")
        out.append("")
        out.append(blurb)
        out.append("")
        out.append("| `error_type` | Meaning |")
        out.append("| --- | --- |")
        for row in rows:
            out.append(f"| `{cell(row.get('value'))}` | {cell(summary(row.get('meaning')))} |")
        out.append("")


def auth_line(doc: dict, ops: list[dict]) -> str:
    """The authentication instruction, derived from the operations' `security`.

    Hardcoding this sentence is how a reference comes to tell an integrator to
    send the wrong header: the drift gate compares this generator's output only
    against itself, so a hand-written claim about auth is the one statement in
    the document nothing checks against the contract. It said "bearer API key"
    while the spec declared a JWT bearer scheme, which sends a `comfyui-` key --
    an `X-API-Key` credential -- to the bearer validator for a 401 on the
    integrator's first call.
    """
    schemes = (doc.get("components") or {}).get("securitySchemes") or {}
    default = doc.get("security")

    requirements = {
        tuple(
            sorted(
                name
                for requirement in (entry["op"].get("security", default) or [])
                if isinstance(requirement, dict)
                for name in requirement
            )
        )
        for entry in ops
    }
    # OpenAPI reads `security` as OR-of-entries, AND-of-keys-within-an-entry.
    # The comprehension above flattens BOTH levels, so a single entry naming two
    # schemes -- both credentials required -- would come out of the join below
    # as "Send `A` or `B`.", telling an integrator one credential is enough when
    # the contract demands both. Every entry in this spec names exactly one
    # scheme today, so the published sentence is correct; refusing the
    # conjunction keeps it correct after the next contract edit rather than
    # silently downgrading it, which is the same rule the rest of this function
    # already follows for a requirement it cannot phrase.
    for entry in ops:
        for requirement in entry["op"].get("security", default) or []:
            if isinstance(requirement, dict) and len(requirement) > 1:
                raise ValueError(
                    "a Comfy Router operation requires several security schemes at once "
                    f"({sorted(requirement)}); auth_line can only phrase alternatives, and "
                    "rendering a conjunction as 'or' tells an integrator one credential is "
                    "enough"
                )
    if len(requirements) != 1 or not next(iter(requirements)):
        raise ValueError(
            "the Comfy Router operations do not share one security requirement, so a "
            "single authentication sentence cannot describe them all; render the "
            f"instruction per operation instead (found: {sorted(requirements)})"
        )

    instructions = []
    for name in next(iter(requirements)):
        scheme = schemes.get(name)
        if not isinstance(scheme, dict):
            raise ValueError(
                f"an operation's security names {name!r}, which components.securitySchemes "
                "does not declare"
            )
        kind = scheme.get("type")
        if kind == "http" and str(scheme.get("scheme", "")).lower() == "bearer":
            placeholder = str(scheme.get("bearerFormat") or "token").lower()
            instructions.append(f"`Authorization: Bearer <{placeholder}>`")
        elif kind == "apiKey" and scheme.get("in") == "header":
            instructions.append(f"`{scheme.get('name')}: <api-key>`")
        else:
            raise ValueError(
                f"security scheme {name!r} is a {kind!r}/{scheme.get('in')!r} scheme this "
                "generator cannot phrase; teach auth_line to describe it rather than "
                "shipping an authentication sentence the contract does not check"
            )

    return "Every endpoint below is authenticated. Send " + " or ".join(instructions) + "."


def render(doc: dict) -> str:
    ops = collect_router_operations(doc)
    if not ops:
        raise ValueError(f"no operation carries the {ROUTER_TAG!r} tag")

    schemas = (doc.get("components") or {}).get("schemas") or {}
    headers = (doc.get("components") or {}).get("headers") or {}
    responses = (doc.get("components") or {}).get("responses") or {}

    tag_desc = ""
    for tag in doc.get("tags") or []:
        if isinstance(tag, dict) and tag.get("name") == ROUTER_TAG:
            tag_desc = mdx(lead(tag.get("description")))

    out: list[str] = [FRONTMATTER, "", BANNER, "", '<div className="router-api-reference-marker" />', ""]
    if tag_desc:
        out += [tag_desc, ""]

    servers = doc.get("servers") or []
    if servers and isinstance(servers[0], dict) and servers[0].get("url"):
        out += [f"Base URL: `{servers[0]['url']}`", ""]

    out += [
        auth_line(doc, ops), "",
        "Comfy API keys can also be sent as Bearer tokens. `X-API-Key` takes precedence "
        "when both credential headers are supplied. See [authentication headers]"
        "(/development/comfy-router/headers#request-headers) for the key/JWT distinction "
        "and [the Quickstart](/development/comfy-router/quickstart) for access requirements.",
        "", "## Endpoints", "",
    ]

    for entry in ops:
        op = entry["op"]
        out.append(f"### `{entry['method']} {entry['path']}`")
        out.append("")
        if op.get("summary"):
            out.append(f"**{mdx(str(op['summary']).strip())}**")
            out.append("")
        body = mdx(public_endpoint_description(entry["method"], entry["path"], op.get("description")))
        if body:
            out += [body, ""]

        params = entry["parameters"]
        if params:
            out.append("**Parameters**")
            out.append("")
            out.append("| Name | In | Required | Type | Constraints | Description |")
            out.append("| --- | --- | --- | --- | --- | --- |")
            for param_ref in params:
                param = deref(doc, param_ref)
                if not isinstance(param, dict):
                    continue
                out.append(
                    f"| `{cell(param.get('name'))}` | {cell(param.get('in'))} | "
                    f"{'yes' if param.get('required') else 'no'} | "
                    f"{type_of(doc, param.get('schema', {}))} | "
                    f"{cell(constraints_of(doc, param.get('schema', {}))) or '-'} | "
                    f"{cell(public_parameter_description(entry['path'], str(param.get('name')), param.get('description'))) or '-'} |"
                )
            out.append("")

        # Dereferenced: a body declared as `$ref: components/requestBodies/...` is
        # valid OpenAPI, and reading it raw would render an empty "Request body"
        # section -- no media type, no schema, no `required` -- instead of failing.
        request_body = deref(doc, op.get("requestBody"))
        if isinstance(request_body, dict):
            out.append("**Request body**")
            out.append("")
            for media, media_obj in (request_body.get("content") or {}).items():
                schema_ref = (media_obj or {}).get("schema", {})
                out.append(
                    f"`{media}` -- {type_of(doc, schema_ref)}"
                    f"{' (required)' if request_body.get('required') else ''}"
                )
            desc = mdx(lead(request_body.get("description")))
            if desc:
                out += ["", desc]
            out.append("")

        out.append("**Responses**")
        out.append("")
        out.append("| Status | Body | Headers | Description |")
        out.append("| --- | --- | --- | --- |")
        for status, response_ref in (op.get("responses") or {}).items():
            named = ref_name(response_ref)
            response = deref(doc, response_ref)
            if not isinstance(response, dict):
                continue
            body_cell = "-"
            body_name = None
            for media_obj in (response.get("content") or {}).values():
                body_schema = (media_obj or {}).get("schema", {})
                body_name = ref_name(body_schema)
                body_cell = type_of(doc, body_schema)
                break
            header_names = ", ".join(
                f"`{cell(h)}`" + (" (when `concurrency_limit_exceeded`)" if str(status) == "409" and h == "Retry-After" else "")
                for h in (response.get("headers") or {})
            )
            desc = cell(response_summary(status, response, named, body_name))
            if named and not desc:
                desc = f"Shared `{cell(named)}` response."
            out.append(
                f"| `{cell(status)}` | {body_cell} | {header_names or '-'} | {desc or '-'} |"
            )
        out.append("")

    out += [
        "Table descriptions are brief. Use [Using the Comfy Router API]"
        "(/development/comfy-router/models) for model selection, validation, retries, and billing, "
        "and [Headers](/development/comfy-router/headers) for header behavior.",
        "",
    ]

    render_error_types(doc, out)

    # Keyed by the WIRE name -- the key in a response's `headers` map -- and not by
    # the component name. An OpenAPI Header Object carries no `name` field, so
    # reading one off the component yielded `RouterErrorTypeHeader` where the
    # per-operation Responses tables in this same document correctly render
    # `X-Comfy-Error-Type`: a reference that contradicted itself and told an
    # integrator to read a header no response ever sets.
    used_headers: dict[str, str] = {}

    def note_headers(response: Any, router_only: bool) -> None:
        if not isinstance(response, dict):
            return
        for wire, header in (response.get("headers") or {}).items():
            name = ref_name(header)
            if name is None or name not in headers:
                continue
            if router_only and not name.startswith("Router"):
                continue
            used_headers.setdefault(str(wire), name)

    for entry in ops:
        for response in (entry["op"].get("responses") or {}).values():
            note_headers(deref(doc, response), router_only=False)
    for shared in responses.values():
        note_headers(shared, router_only=True)

    if used_headers:
        out += ["## Response headers", "", "| Header | Type | Description |", "| --- | --- | --- |"]
        for wire in sorted(used_headers):
            header = headers[used_headers[wire]]
            out.append(
                f"| `{cell(wire)}` | "
                f"{type_of(doc, header.get('schema', {}))} | "
                f"{cell(summary(header.get('description'))) or '-'} |"
            )
        out.append("")

    out += [RESULT_ASSETS, ""]

    out += [
        '<span id="per-model-input-schemas" />',
        "",
        "## Per-model input and output schemas",
        "",
        "Read each model's fields from `GET /v2/models/{provider}/{model}/openapi.json`. "
        "The operation's `requestBody` describes input validation; its `200` response "
        "describes the output shape and media type when authored. When "
        "`x-comfy-input-schema-authored` is false, Router accepts any JSON object "
        "without model-specific prevalidation. Provider requirements still apply. "
        "The output schemas describe results; Router does not validate returned "
        "provider payloads against them. An unauthored output may use `*/*` rather "
        "than `application/json`; inspect the response content type before decoding it.",
        "",
        "## Schemas",
        "",
    ]
    for name in reachable_schemas(doc, ops):
        schema = schemas[name]
        out.append(f"### {name}")
        out.append("")
        desc = mdx(public_schema_description(name, schema.get("description")))
        if desc:
            out += [desc, ""]
        composed = [
            ref_name(sub) for sub in schema.get("allOf", []) if ref_name(sub) is not None
        ]
        if composed:
            out += ["Composes " + ", ".join(schema_link(c) for c in composed) + ".", ""]
        constraints = constraints_of(doc, {"$ref": f"#/components/schemas/{name}"})
        kind = schema.get("type")
        if kind and not schema.get("properties"):
            out += [f"Type: `{kind}`" + (f" -- {constraints}" if constraints else ""), ""]
        render_properties(doc, name, schema, out)

    # Exactly one trailing newline: a generated file the drift gate byte-compares
    # must not depend on an editor's whitespace habits.
    return "\n".join(out).rstrip("\n") + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", help="path to the public router-openapi.yaml snapshot")
    parser.add_argument("out", help="path of the generated reference")
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit non-zero if the committed file is not what this run produces",
    )
    args = parser.parse_args(argv)

    with open(args.spec, encoding="utf-8") as f:
        doc = yaml.safe_load(f)

    rendered = render(doc)

    out_path = pathlib.Path(args.out)
    if args.check:
        current = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
        if current != rendered:
            print(
                f"{args.out} is stale: it is not what the current contract generates.\n"
                f"Regenerate it and commit the result:\n"
                f"  python3 {pathlib.Path(__file__).name} {args.spec} {args.out}",
                file=sys.stderr,
            )
            return 1
        print(f"{args.out} is up to date with {args.spec}")
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(rendered, encoding="utf-8")
    print(f"wrote {args.out} ({len(rendered.splitlines())} lines) from {args.spec}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
