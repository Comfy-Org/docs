import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const config = JSON.parse(read("docs.json"));
const schema = JSON.parse(read("router-schemas/bfl/flux-2-pro.json"));
const runPath = Object.keys(schema.paths).find((path) => schema.paths[path].post);
assert.ok(runPath, "The example model schema must declare an invocation route.");
const routePrefix = runPath.slice(0, runPath.indexOf("/bfl/"));
assert.equal(routePrefix, "/v2/models", "Update the Router guides when the model contract changes.");

const navigation = new Set();
function collect(value) {
  if (typeof value === "string") navigation.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
}
collect(config.navigation);

const pages = ["quickstart", "models", "limitations", "headers", "reference"];
for (const page of pages) {
  const path = `development/comfy-router/${page}`;
  assert.ok(navigation.has(path), `${path} must be reachable from navigation.`);
  const text = read(`${path}.mdx`);
  assert.ok(!/\/v1\/models\b/.test(text), `${path} uses an obsolete Router route.`);
  assert.ok(!/\]\(\/comfy-router-(?:quickstart|reference|limitations)/.test(text),
    `${path} must link directly to the canonical Router pages.`);
  assert.ok(!/an authenticated call answers `404` today/.test(text),
    `${path} must not hardcode an unverified deployment state.`);
}

for (const page of ["quickstart", "reference", "limitations"]) {
  const oldPath = `/comfy-router-${page}`;
  const canonical = `/development/comfy-router/${page}`;
  assert.ok(!existsSync(join(root, `${oldPath.slice(1)}.mdx`)),
    `${oldPath} was recreated: the upstream sync must write the canonical page.`);
  assert.ok(config.redirects.some((entry) => entry.source === oldPath && entry.destination === canonical),
    `${oldPath} must redirect to ${canonical}.`);
}

assert.ok(!existsSync(join(root, "development/comfy-router/reliability.mdx")),
  "Reliability content belongs on the Using the Comfy Router API page.");
assert.ok(config.redirects.some((entry) =>
  entry.source === "/development/comfy-router/reliability" &&
  entry.destination === "/development/comfy-router/models"
), "The old Reliability URL must redirect to Using the Comfy Router API.");

assert.ok(read("development/comfy-router/quickstart.mdx").includes(routePrefix),
  "The Quickstart must show the invocation route from the model schema.");
console.log("Router docs: canonical navigation, redirects, and invocation routes agree.");
