"""Exercise the published Python reliability examples without network access."""

import os
from pathlib import Path
import re
import textwrap
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
PAGE = ROOT / "development/comfy-router/models.mdx"


class HTTPError(Exception):
    pass


class Response:
    def __init__(self, status, headers=None, body=None):
        self.status_code = status
        self.headers = headers or {}
        self.body = body
        self.is_success = 200 <= status < 300

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body

    def raise_for_status(self):
        if not self.is_success:
            raise HTTPError(self.status_code)


class ReliabilityExamples(unittest.TestCase):
    def setUp(self):
        blocks = re.findall(r"^[ \t]*```python[^\n]*\n([\s\S]*?)```", PAGE.read_text(), re.M)
        self.requests = []
        self.responses = []
        test = self

        class Client:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def post(self, url, **kwargs):
                test.requests.append((url, kwargs))
                response = test.responses.pop(0)
                if isinstance(response, Exception):
                    raise response
                return response

        httpx = types.ModuleType("httpx")
        httpx.Client = Client
        httpx.Timeout = lambda *args, **kwargs: None
        self.namespace = {}
        with patch.dict("sys.modules", {"httpx": httpx}):
            for block in blocks:
                exec(compile(textwrap.dedent(block), str(PAGE), "exec"), self.namespace)
        self.read_error = self.namespace["read_router_error"]
        self.collect = self.namespace["collect"]

    def test_validation_fields_and_request_id_survive(self):
        entries = [{"loc": ["body", "prompt"], "msg": "Field required", "type": "missing"}]
        result = self.read_error(Response(422, {
            "content-type": "application/json",
            "X-Comfy-Error-Type": "invalid_input",
            "X-Comfy-Request-Id": "request-123",
        }, {"detail": entries}))
        self.assertEqual(result["validation"], entries)
        self.assertEqual(result["request_id"], "request-123")
        self.assertEqual(result["error_type"], "invalid_input")

    def test_invalid_json_and_non_json_preserve_status(self):
        for content_type in ["application/json", "text/html"]:
            with self.subTest(content_type=content_type):
                result = self.read_error(Response(502, {"content-type": content_type}, ValueError("bad JSON")))
                self.assertEqual(result["status"], 502)
                self.assertEqual(result["error_type"], "internal_error")
                self.assertEqual(result["validation"], [])

    def test_missing_headers_and_empty_body(self):
        result = self.read_error(Response(503))
        self.assertEqual(result["message"], "HTTP 503")
        self.assertIsNone(result["request_id"])

    def run_collect(self, **kwargs):
        with patch.dict(os.environ, {"COMFY_API_KEY": "comfyui-test"}), patch("time.sleep") as sleep:
            result = self.collect("bfl/flux-2-pro", {"prompt": "test"}, "saved-key", **kwargs)
            return result, sleep

    def test_collection_reuses_the_original_key_and_body(self):
        self.responses = [
            Response(504, {"X-Comfy-Error-Type": "deadline_exceeded", "Retry-After": "2"}),
            Response(200, body={"result": {"sample": "https://example.invalid/image"}}),
        ]
        result, sleep = self.run_collect()
        self.assertIn("result", result)
        sleep.assert_called_once_with(2)
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[0], self.requests[1])
        self.assertEqual(self.requests[0][1]["headers"]["Idempotency-Key"], "saved-key")

    def test_non_collectable_errors_do_not_start_another_attempt(self):
        for response in [
            Response(409, {"X-Comfy-Error-Type": "invalid_input"}),
            Response(504, {"X-Comfy-Error-Type": "deadline_exceeded"}),
            Response(500, {"X-Comfy-Error-Type": "internal_error"}),
        ]:
            with self.subTest(status=response.status_code):
                self.requests = []
                self.responses = [response]
                with self.assertRaises(HTTPError):
                    self.run_collect()
                self.assertEqual(len(self.requests), 1)

    def test_collection_stops_at_attempt_limit(self):
        self.responses = [Response(409, {
            "X-Comfy-Error-Type": "concurrency_limit_exceeded", "Retry-After": "1",
        }) for _ in range(3)]
        with self.assertRaises(HTTPError):
            self.run_collect(attempts=3)
        self.assertEqual(len(self.requests), 3)

    def test_transport_error_is_reported_without_a_new_key(self):
        self.responses = [OSError("connection lost")]
        with self.assertRaises(OSError):
            self.run_collect()
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0][1]["headers"]["Idempotency-Key"], "saved-key")


if __name__ == "__main__":
    unittest.main()
