#!/usr/bin/env node
/**
 * Check catalog-src/ alias tables against every place the docs and templates name
 * a provider, model, or page. Prints what doesn't resolve so the tables can be fixed.
 *
 * Usage:
 *   node .github/scripts/catalog/check-aliases.mjs
 *   node .github/scripts/catalog/check-aliases.mjs --templates ../workflow_templates
 *   node .github/scripts/catalog/check-aliases.mjs --strict   # exit 1 on any unresolved provider or page
 *
 * Sources: Router pages and their API IDs, router-schemas/,
 * Partner Node tutorial folders, legacy partner-node folders, docs.json (English),
 * and workflow_templates (logos, model names, model files) when the folder exists.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { root, readJson as read, dirs, norm, loadProviders, loadRouterPages, loadEnglishPages, productMatcher } from "./lib.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const tplArg = args[args.indexOf("--templates") + 1];
const templatesDir = resolve(root, args.includes("--templates") ? tplArg : "../workflow_templates");

const { providers, lookup: providerOf, ignore, warnings, cloudMeta } = loadProviders();
const { models } = read("catalog-src/models.json");
const { products, rules, productOf } = productMatcher();
for (const w of warnings) console.log(`WARN ${w}`);
console.log(`Providers: ${Object.keys(providers).length} (cloud snapshot ${cloudMeta.commit} + docs-only ${Object.values(providers).filter((p) => p.source === "docs").length})`);

const routerDir = "development/comfy-router/models";
const routerPages = loadRouterPages();
const routerIds = new Set(routerPages.map((r) => r.id).filter(Boolean));

// ---- Collect provider names per source
const sources = {
  "Router page folders": dirs(routerDir),
  "Router API prefixes": [...new Set([...routerIds].map((id) => id.split("/")[0]))],
  "router-schemas/": dirs("router-schemas"),
  "Pricing model_id prefixes": [],
  "Pricing serving_provider": [],
  "Partner Node tutorial folders": dirs("tutorials/partner-nodes"),
  "Legacy partner-node folders": [...new Set(dirs("built-in-nodes/partner-node").flatMap((d) => dirs(join("built-in-nodes/partner-node", d))))],
  "Template logos": [],
};

let tplIndex = null;
if (existsSync(join(templatesDir, "templates/index.json"))) {
  tplIndex = JSON.parse(readFileSync(join(templatesDir, "templates/index.json"), "utf8"));
  const logos = new Set();
  for (const cat of tplIndex) for (const t of cat.templates) for (const l of t.logos ?? []) [l.provider].flat().forEach((p) => p && logos.add(p));
  sources["Template logos"] = [...logos];
} else {
  delete sources["Template logos"];
}

let unresolvedProviders = 0;
console.log("== Providers");
for (const [src, names] of Object.entries(sources)) {
  const miss = names.filter((n) => !providerOf.has(norm(n)) && !ignore.has(norm(n)));
  unresolvedProviders += miss.length;
  console.log(`${miss.length ? "MISS" : "ok  "}  ${src}: ${names.length} names${miss.length ? `, unresolved: ${miss.join(", ")}` : ""}`);
}
const unused = Object.keys(providers).filter((slug) => !Object.values(sources).flat().some((n) => providerOf.get(norm(n)) === slug) && !models.some((m) => m.provider === slug));
if (unused.length) console.log(`info  Providers no source or model uses yet: ${unused.join(", ")}`);

// ---- Models
console.log("\n== Models");
const badProv = models.filter((m) => !providers[m.provider]);
const badRouter = models.flatMap((m) => (m.router_ids ?? []).filter((id) => !routerIds.has(id)).map((id) => `${m.id} -> ${id}`));
const dupIds = models.map((m) => m.id).filter((id, i, a) => a.indexOf(id) !== i);
console.log(`${badProv.length ? "MISS" : "ok  "}  ${models.length} entries, unknown provider: ${badProv.map((m) => m.id).join(", ") || "none"}`);
console.log(`${badRouter.length ? "MISS" : "ok  "}  router_ids not found on a Router page: ${badRouter.join(", ") || "none"}`);
console.log(`${dupIds.length ? "MISS" : "ok  "}  duplicate ids: ${dupIds.join(", ") || "none"}`);
const noIdPages = routerPages.filter((r) => !r.id).map((r) => r.folder);
console.log(`${noIdPages.length ? "info" : "ok  "}  Router pages: ${routerPages.length}, with an API ID: ${routerPages.length - noIdPages.length}${noIdPages.length ? `, missing: ${noIdPages.join(", ")}` : ""}`);

if (tplIndex) {
  const byName = new Map();
  for (const m of models) for (const n of m.template_names ?? []) byName.set(norm(n), m.id);
  const byTitle = new Map(routerPages.filter((r) => r.title && r.id).map((r) => [norm(r.title), r.id]));
  const names = new Map();
  for (const cat of tplIndex) for (const t of cat.templates) for (const n of t.models ?? []) names.set(n, (names.get(n) ?? 0) + 1);
  const unresolved = [...names].filter(([n]) => !byName.has(norm(n)) && !byTitle.has(norm(n)) && !providerOf.has(norm(n)) && n !== "None");
  unresolved.sort((a, b) => b[1] - a[1]);
  console.log(`${unresolved.length ? "MISS" : "ok  "}  Template model names: ${names.size}, resolved: ${names.size - unresolved.length}, unresolved: ${unresolved.length}`);
  if (unresolved.length) console.log(`      ${unresolved.map(([n, c]) => `${n} (${c})`).join(", ")}`);
  console.log(`      (names equal to a provider, like "Kling" or "Google", count as provider-level and resolve.)`);

  // Model files under the main model folders
  const files = new Map();
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.models)) for (const m of o.models) if (m?.name && m?.directory) files.set(m.name, m.directory);
    for (const v of Object.values(o)) walk(v);
  };
  for (const f of readdirSync(join(templatesDir, "templates")).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    try { walk(JSON.parse(readFileSync(join(templatesDir, "templates", f), "utf8"))); } catch {}
  }
  const main = [...files].filter(([, d]) => d === "diffusion_models" || d === "checkpoints");
  const prefixes = models.flatMap((m) => (m.files ?? []).map((p) => p.toLowerCase()));
  const unmatched = main.filter(([n]) => !prefixes.some((p) => n.toLowerCase().startsWith(p))).map(([n]) => n).sort();
  console.log(`${unmatched.length ? "MISS" : "ok  "}  Template model files (diffusion_models + checkpoints): ${main.length}, matched: ${main.length - unmatched.length}, unmatched: ${unmatched.length}`);
  if (unmatched.length) console.log(`      ${unmatched.join(", ")}`);
} else {
  console.log(`skip  workflow_templates not found at ${templatesDir}. Pass --templates <path>.`);
}

// ---- Products
console.log("\n== Products");
const enPages = loadEnglishPages();
const counts = Object.fromEntries(Object.keys(products).map((k) => [k, 0]));
const noProduct = [];
const badRule = rules.filter(([, prod]) => prod !== null && !products[prod]).map(([p]) => p);
for (const p of enPages) {
  const prod = productOf(p);
  if (prod === null) continue;
  if (prod === undefined) noProduct.push(p);
  else counts[prod]++;
}
console.log(`${noProduct.length ? "MISS" : "ok  "}  English pages: ${enPages.length}, without a product: ${noProduct.length}${noProduct.length ? ` (${noProduct.slice(0, 20).join(", ")}${noProduct.length > 20 ? ", ..." : ""})` : ""}`);
console.log(`${badRule.length ? "MISS" : "ok  "}  rules pointing at an unknown product: ${badRule.join(", ") || "none"}`);
console.log(`      ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

const failed = unresolvedProviders + noProduct.length + badProv.length + badRouter.length + badRule.length;
console.log(`\n${failed ? `${failed} blocking issue(s)` : "No blocking issues"}. Template names and files are for review, not blocking.`);
if (strict && failed) process.exitCode = 1;
