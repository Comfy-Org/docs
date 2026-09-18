#!/usr/bin/env python3
"""Tests for gen_router_reference.py.

Run: python3 .github/scripts/router/gen_router_reference_test.py
"""

from __future__ import annotations

import importlib.util
import pathlib
import re
import unittest

import yaml

_HERE = pathlib.Path(__file__).resolve().parent
_SPEC = _HERE.parents[2] / "router-openapi.yaml"
_REFERENCE = _HERE.parents[2] / "development/comfy-router/reference.mdx"

_spec = importlib.util.spec_from_file_location("gen_router_reference", _HERE / "gen_router_reference.py")
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


def _minimal_doc(**overrides) -> dict:
    doc = {
        "servers": [{"url": "https://api.example.test"}],
        "tags": [{"name": gen.ROUTER_TAG, "description": "Router routes."}],
        "paths": {
            "/v1/things/{id}": {
                "get": {
                    "summary": "Read a thing.",
                    "description": "Statement.\nRationale nobody reading a reference wants.",
                    "tags": [gen.ROUTER_TAG],
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"$ref": "#/components/parameters/ThingId"}],
                    "responses": {
                        "200": {
                            "description": "OK",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/RouterThing"}
                                }
                            },
                        },
                        "404": {"$ref": "#/components/responses/RouterRequestError"},
                    },
                },
                "post": {
                    "summary": "Not a Router route.",
                    "tags": ["API Nodes"],
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "OK"}},
                },
            }
        },
        "components": {
            "securitySchemes": {
                "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
                "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"},
            },
            "headers": {
                "RouterRequestIdHeader": {
                    "description": "An id.",
                    "schema": {"type": "string"},
                }
            },
            "parameters": {
                "ThingId": {
                    "name": "id",
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string", "maxLength": 8},
                }
            },
            "responses": {
                "RouterRequestError": {
                    "description": "A Router failure.",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/RouterErrorResponse"}
                        }
                    },
                }
            },
            "schemas": {
                "RouterThing": {"type": "object", "properties": {"name": {"type": "string"}}},
                "RouterErrorResponse": {
                    "type": "object",
                    "properties": {"error_type": {"$ref": "#/components/schemas/RouterErrorType"}},
                    "required": ["error_type"],
                },
                "RouterErrorType": {
                    "type": "string",
                    "description": "A bucket.",
                    "x-comfy-error-types": [
                        {"value": "invalid_input", "tier": "request", "meaning": "Bad input."},
                        {"value": "internal_error", "tier": "transport", "meaning": "We broke."},
                    ],
                },
                "NotARouterSchema": {"type": "object"},
            },
        },
    }
    doc.update(overrides)
    return doc


class LeadParagraph(unittest.TestCase):
    def test_stops_at_the_first_newline(self):
        # A folded YAML scalar has already collapsed intra-paragraph breaks into
        # spaces, so a surviving newline is a paragraph boundary.
        self.assertEqual(gen.lead("Statement here.\nRationale."), "Statement here.")

    def test_normalizes_whitespace(self):
        self.assertEqual(gen.lead("  a   b \t c "), "a b c")

    def test_tolerates_a_missing_description(self):
        self.assertEqual(gen.lead(None), "")


class Selection(unittest.TestCase):
    def test_only_router_tagged_operations_are_rendered(self):
        out = gen.render(_minimal_doc())
        self.assertIn("### `GET /v1/things/{id}`", out)
        self.assertNotIn("Not a Router route.", out)

    def test_error_components_survive_a_response_level_ref(self):
        # The 404 reaches RouterErrorResponse through components/responses, not
        # through components/schemas. A walk that stops at an unrecognized
        # component section drops the whole error contract.
        out = gen.render(_minimal_doc())
        self.assertIn("### RouterErrorResponse", out)
        self.assertIn("### RouterErrorType", out)

    def test_non_router_schemas_are_excluded(self):
        self.assertNotIn("NotARouterSchema", gen.render(_minimal_doc()))

    def test_rationale_is_dropped_from_operation_prose(self):
        out = gen.render(_minimal_doc())
        self.assertIn("Statement.", out)
        self.assertNotIn("Rationale nobody reading", out)

    def test_output_is_stable_under_reordered_paths(self):
        doc = _minimal_doc()
        reordered = _minimal_doc()
        reordered["paths"] = {
            "/v1/zzz": {
                "get": {
                    "summary": "Another.",
                    "tags": [gen.ROUTER_TAG],
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "OK"}},
                }
            },
            **doc["paths"],
        }
        first = gen.render(reordered)
        reordered["paths"] = {**doc["paths"], **{k: v for k, v in reordered["paths"].items() if k == "/v1/zzz"}}
        self.assertEqual(first, gen.render(reordered))


class ErrorTable(unittest.TestCase):
    def test_buckets_are_split_by_tier(self):
        out = gen.render(_minimal_doc())
        self.assertIn("### Request-level buckets", out)
        self.assertIn("| `invalid_input` | Bad input. |", out)
        self.assertIn("### Transport-level buckets", out)
        self.assertIn("| `internal_error` | We broke. |", out)

    def test_missing_extension_fails_loudly(self):
        doc = _minimal_doc()
        del doc["components"]["schemas"]["RouterErrorType"]["x-comfy-error-types"]
        with self.assertRaises(ValueError):
            gen.render(doc)

    def test_no_router_operations_fails_loudly(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["tags"] = ["API Nodes"]
        with self.assertRaises(ValueError):
            gen.render(doc)


class Withholding(unittest.TestCase):
    """A tagged route is not automatically a publishable one."""

    def test_an_x_internal_operation_is_not_published(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["x-internal"] = True
        # The only other Router operation is gone with it, so the generator
        # refuses rather than emitting an endpoint-less reference.
        with self.assertRaises(ValueError):
            gen.render(doc)

    def test_an_internal_tagged_operation_is_not_published(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/hidden"] = {
            "get": {
                "summary": "Hidden route.",
                "tags": [gen.ROUTER_TAG, "internal"],
                "security": [{"BearerAuth": []}],
                "responses": {"200": {"description": "OK"}},
            }
        }
        out = gen.render(doc)
        self.assertNotIn("Hidden route.", out)
        self.assertNotIn("/v1/hidden", out)


class InheritedParameters(unittest.TestCase):
    def test_a_path_item_parameter_reaches_the_table(self):
        doc = _minimal_doc()
        item = doc["paths"]["/v1/things/{id}"]
        # Hoisted to the Path Item, which OpenAPI lets an operation inherit.
        item["parameters"] = [item["get"].pop("parameters")[0]]
        out = gen.render(doc)
        self.assertIn("| `id` | path |", out)

    def test_an_operation_overrides_the_inherited_declaration(self):
        doc = _minimal_doc()
        item = doc["paths"]["/v1/things/{id}"]
        item["parameters"] = [
            {"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}
        ]
        out = gen.render(doc)
        # The operation's own `$ref`-ed declaration (a string) wins, and the
        # parameter is listed exactly once.
        self.assertEqual(out.count("| `id` | path |"), 1)
        self.assertIn("| `id` | path | yes | string |", out)


class Authentication(unittest.TestCase):
    """The auth sentence is derived, because nothing else checks it."""

    def test_a_jwt_bearer_scheme_is_described_as_a_bearer_token(self):
        out = gen.render(_minimal_doc())
        self.assertIn("Send `Authorization: Bearer <jwt>`.", out)
        # The old hardcoded sentence called this an API key, which on this
        # platform is an X-API-Key credential, not an Authorization bearer one.
        self.assertNotIn("bearer API key", out)

    def test_an_api_key_scheme_names_its_own_header(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["security"] = [{"ApiKeyAuth": []}]
        self.assertIn("Send `X-API-Key: <api-key>`.", gen.render(doc))

    def test_an_undeclared_scheme_fails_loudly(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["security"] = [{"NoSuchScheme": []}]
        with self.assertRaises(ValueError):
            gen.render(doc)

    def test_disagreeing_operations_fail_rather_than_pick_one(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/other"] = {
            "get": {
                "summary": "Other.",
                "tags": [gen.ROUTER_TAG],
                "security": [{"ApiKeyAuth": []}],
                "responses": {"200": {"description": "OK"}},
            }
        }
        with self.assertRaises(ValueError):
            gen.render(doc)

    def test_two_schemes_in_one_entry_are_refused_not_joined_with_or(self):
        # OpenAPI reads the keys WITHIN one `security` entry as a conjunction:
        # this operation requires BOTH credentials. Phrasing that as "Send A or
        # B." would tell an integrator one is enough, so it must fail instead.
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["security"] = [
            {"BearerAuth": [], "ApiKeyAuth": []}
        ]
        with self.assertRaisesRegex(ValueError, "several security schemes at once"):
            gen.render(doc)

    def test_two_separate_entries_stay_an_alternative(self):
        # The sibling of the case above: two ENTRIES really are alternatives,
        # so "or" is the right word and the guard must not reject them.
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["security"] = [
            {"BearerAuth": []},
            {"ApiKeyAuth": []},
        ]
        self.assertIn(
            "Send `X-API-Key: <api-key>` or `Authorization: Bearer <jwt>`.",
            gen.render(doc),
        )


class Escaping(unittest.TestCase):
    """Spec-authored text is interpolated into GFM tables inside MDX."""

    def test_a_pipe_in_a_pattern_does_not_split_the_row(self):
        doc = _minimal_doc()
        doc["components"]["parameters"]["ThingId"]["schema"]["pattern"] = "^(fal|openai)/"
        row = next(
            line for line in gen.render(doc).splitlines() if line.startswith("| `id` |")
        )
        self.assertIn("^(fal\\|openai)/", row)
        # Six columns, as the header declares - not the seven an unescaped `|`
        # in the pattern would have produced. Split on UNESCAPED pipes only,
        # which is the split GFM itself performs.
        columns = re.split(r"(?<!\\)\|", row.strip("|"))
        self.assertEqual(len(columns), 6)

    def test_a_brace_outside_a_code_span_is_neutralized(self):
        doc = _minimal_doc()
        doc["components"]["parameters"]["ThingId"]["description"] = "Pass {id} here."
        out = gen.render(doc)
        self.assertIn("Pass &#123;id&#125; here.", out)
        self.assertNotIn("Pass {id} here.", out)

    def test_a_brace_inside_a_code_span_is_left_literal(self):
        # Escaping inside a code span would render the entity, not the brace.
        self.assertEqual(gen.mdx("see `{id}` now"), "see `{id}` now")

    def test_an_angle_bracket_outside_a_code_span_is_neutralized(self):
        self.assertEqual(gen.mdx("a <b> c"), "a &lt;b&gt; c")


class RequestBody(unittest.TestCase):
    def test_a_referenced_request_body_is_dereferenced(self):
        doc = _minimal_doc()
        doc["components"]["requestBodies"] = {
            "ThingInput": {
                "required": True,
                "description": "The body.",
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/RouterThing"}
                    }
                },
            }
        }
        doc["paths"]["/v1/things/{id}"]["get"]["requestBody"] = {
            "$ref": "#/components/requestBodies/ThingInput"
        }
        out = gen.render(doc)
        self.assertIn("`application/json` -- [`RouterThing`](#routerthing) (required)", out)
        self.assertIn("The body.", out)


class ResponseHeaders(unittest.TestCase):
    def test_the_table_carries_the_wire_name_not_the_component_name(self):
        doc = _minimal_doc()
        doc["paths"]["/v1/things/{id}"]["get"]["responses"]["200"]["headers"] = {
            "X-Comfy-Request-Id": {"$ref": "#/components/headers/RouterRequestIdHeader"}
        }
        out = gen.render(doc)
        self.assertIn("| `X-Comfy-Request-Id` | string | An id. |", out)
        # An OpenAPI Header Object has no `name`, so the component name is not a
        # wire name and must never be presented as one.
        self.assertNotIn("| `RouterRequestIdHeader` |", out)


class RealSpec(unittest.TestCase):
    """The generator against the contract it actually ships against."""

    @classmethod
    def setUpClass(cls):
        with open(_SPEC, encoding="utf-8") as f:
            cls.doc = yaml.safe_load(f)
        cls.out = gen.render(cls.doc)

    def test_every_router_route_appears(self):
        for entry in gen.collect_router_operations(self.doc):
            self.assertIn(f"### `{entry['method']} {entry['path']}`", self.out)

    def test_the_closed_error_set_appears_with_meanings(self):
        # The SIZE of the closed set is not restated here. routererr's
        # TestErrorTypeMeaningsMatchClosedSet pins x-comfy-error-types against
        # routererr.AllErrorTypes(), which is the only authority on it; a
        # literal count in this file is a second copy that goes stale the next
        # time a milestone appends a bucket (BE-8478 appended deadline_exceeded
        # and this assertion is what failed). What this test owns is that every
        # documented bucket reaches the rendered table.
        buckets = self.doc["components"]["schemas"]["RouterErrorType"]["x-comfy-error-types"]
        values = [b["value"] for b in buckets]
        self.assertEqual(len(values), len(set(values)), "a bucket is documented twice")
        self.assertEqual(
            sorted(b["value"] for b in buckets if b["tier"] == "request"),
            sorted(
                [
                    "invalid_input",
                    "content_policy_violation",
                    "provider_error",
                    "provider_timeout",
                    "insufficient_credits",
                    "model_not_found",
                ]
            ),
            "the request-level tier is the six M1 request buckets; everything else is transport",
        )
        for bucket in buckets:
            self.assertIn(f"| `{bucket['value']}` |", self.out)

    def test_per_model_schemas_are_linked_not_inlined(self):
        self.assertIn("GET /v2/models/{provider}/{model}/openapi.json", self.out)

    def test_the_response_header_table_lists_wire_names(self):
        for wire in ("X-Comfy-Error-Type", "X-Comfy-Request-Id", "ETag", "Cache-Control"):
            self.assertIn(f"| `{wire}` |", self.out)
        for component in ("RouterErrorTypeHeader", "RouterRequestIdHeader"):
            self.assertNotIn(f"| `{component}` |", self.out)

    def test_the_auth_sentence_matches_the_declared_scheme(self):
        # Both credentials are served, so both are declared -- as SEPARATE
        # entries, because OpenAPI reads keys within one entry as AND. The
        # server reads `X-API-Key` first and falls back to `Authorization`
        # (server/middleware/authentication/comfy_firebase_auth.go), which is
        # why the published sentence names the key first.
        schemes = self.doc["components"]["securitySchemes"]
        for entry in gen.collect_router_operations(self.doc):
            self.assertEqual(
                entry["op"].get("security"),
                [{"BearerAuth": []}, {"ApiKeyAuth": []}],
                f"{entry['method']} {entry['path']} changed its security requirement",
            )
        self.assertEqual(schemes["BearerAuth"]["bearerFormat"], "JWT")
        self.assertEqual(schemes["ApiKeyAuth"]["in"], "header")
        self.assertEqual(schemes["ApiKeyAuth"]["name"], "X-API-Key")
        self.assertIn(
            "Send `X-API-Key: <api-key>` or `Authorization: Bearer <jwt>`.", self.out
        )
        self.assertNotIn("<your-api-key>", self.out)

    def test_the_committed_reference_is_current(self):
        self.assertTrue(_REFERENCE.exists(), f"{_REFERENCE} has never been generated")
        self.assertEqual(
            _REFERENCE.read_text(encoding="utf-8"),
            self.out,
            "the committed Router reference is stale; regenerate it",
        )


if __name__ == "__main__":
    unittest.main()
