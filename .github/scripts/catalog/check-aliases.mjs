#!/usr/bin/env node
/**
 * Check catalog-src/ alias tables against every place the docs and templates name
 * a provider, model, or page. Prints what doesn't resolve so the tables can be fixed.
 *
 * Usage:
 *   node .github/scripts/catalog/check-aliases.mjs
 *   node .github/scripts/catalog/check-aliases.mjs --templates ../workflow_templates
 *   node .github/scripts/catalog/check-aliases.mjs --strict   # exit 1 on any blocking issue
 *
 * Sources: Router pages and their API IDs, router-schemas/,
 * Partner Node tutorial folders, legacy partner-node folders, docs.json (English),
 * workflow_templates (logos, model names, model files) when the folder exists,
 * and the generated catalog/ pages when they exist (schema coverage, open-weights
 * claims, queued-only routes, template tables).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { root, readJson as read, readText, dirs, norm, loadProviders, loadRouterPages, loadEnglishPages, productMatcher } from "./lib.mjs";

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

// ---- Generated catalog content
console.log("\n== Catalog content");
const show = (items, cap = 10) => `${items.slice(0, cap).join(", ")}${items.length > cap ? `, ... ${items.length - cap} more` : ""}`;
const modelPages = [];
for (const prov of dirs("catalog/models")) {
  for (const f of readdirSync(join(root, "catalog/models", prov)).filter((f) => f.endsWith(".mdx")).sort()) {
    const page = `catalog/models/${prov}/${f}`;
    const text = readText(page);
    modelPages.push({ page, provider: prov, text, id: /^Model ID: (\S+)$/m.exec(text)?.[1] });
  }
}
const pageOfModel = new Map(modelPages.filter((p) => p.id).map((p) => [p.id, p]));
let catalogFailed = 0;

// 1. Every Router page has its published request schema.
const idedRouterPages = routerPages.filter((r) => r.id);
const noSchema = idedRouterPages.filter((r) => !existsSync(join(root, "router-schemas", `${r.id}.json`))).map((r) => r.id);
console.log(`${noSchema.length ? "MISS" : "ok  "}  Router pages without router-schemas/<provider>/<model>.json: ${idedRouterPages.length - noSchema.length}/${idedRouterPages.length}${noSchema.length ? `, missing: ${show(noSchema)}` : ""}`);

if (!modelPages.length) {
  console.log(`skip  catalog/ has no pages yet; content checks need gen-catalog.mjs output.`);
} else {
  // 2. An open-weights model that Router also serves must not be described as closed.
  const openRouter = models.filter((m) => m.license === "open-weights" && (m.router_ids ?? []).length);
  const noPage = [];
  const claimedClosed = [];
  for (const m of openRouter) {
    for (const id of m.router_ids) {
      const page = pageOfModel.get(id);
      if (!page) noPage.push(`${m.id} -> ${id}`);
      else if (page.text.includes("It has no open weights")) claimedClosed.push(page.page);
    }
  }
  console.log(`${claimedClosed.length ? "MISS" : "ok  "}  Open-weights Router IDs whose page says "It has no open weights": ${claimedClosed.length}${claimedClosed.length ? ` (${show(claimedClosed)})` : ""}`);
  if (noPage.length) console.log(`info  Open-weights Router IDs with no generated page: ${noPage.length} (${show(noPage)})`);

  // 3. A queued-only schema must not be advertised on the bare synchronous route.
  const queued = [];
  for (const prov of dirs("router-schemas")) {
    for (const f of readdirSync(join(root, "router-schemas", prov)).filter((f) => f.endsWith(".json"))) {
      const schema = read(`router-schemas/${prov}/${f}`);
      const id = schema["x-comfy-router-model-id"] ?? `${prov}/${f.replace(/\.json$/, "")}`;
      const summary = schema.paths?.[`/v2/models/${id}`]?.post?.summary ?? "";
      if (/Queued-only|not_enabled/.test(summary)) queued.push(id);
    }
  }
  const wrongRoute = [];
  for (const id of queued) {
    const page = pageOfModel.get(id);
    if (!page) {
      wrongRoute.push(`${id} (no page)`);
      continue;
    }
    const at = `https://api\\.comfy\\.org/v2/models/${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    if (!new RegExp(`POST ${at}/requests`).test(page.text) || new RegExp(`POST ${at}(?![\\w/.?=-])`).test(page.text)) wrongRoute.push(page.page);
  }
  console.log(`${wrongRoute.length ? "MISS" : "ok  "}  Queued-only models documented on the bare synchronous route: ${wrongRoute.length}/${queued.length}${wrongRoute.length ? ` (${show(wrongRoute)})` : ""}`);

  // 4. Template tables: no api_* template on two providers; list the crowded ones for review.
  const rowsIn = (text, heading) => {
    const lines = text.split("\n");
    const start = lines.indexOf(heading);
    if (start < 0) return null;
    const rows = [];
    for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) rows.push(lines[i]);
    return rows;
  };
  const byTemplate = new Map(); // template -> provider -> pages
  const emptyTables = [];
  for (const p of modelPages) {
    const prov = providerOf.get(norm(p.provider)) ?? p.provider;
    for (const row of rowsIn(p.text, "## Workflow templates") ?? []) {
      const name = /^\| `([^`]+)`/.exec(row)?.[1];
      if (!name) continue;
      if (!byTemplate.has(name)) byTemplate.set(name, new Map());
      const byProv = byTemplate.get(name);
      if (!byProv.has(prov)) byProv.set(prov, []);
      byProv.get(prov).push(p.page);
    }
    const where = rowsIn(p.text, "## Where you can run it");
    const head = where ? where.findIndex((l) => l.startsWith("| ---")) : -1;
    if (head >= 0 && !where.slice(head + 1).some((l) => l.startsWith("| "))) emptyTables.push(p.page);
  }
  const leaked = [];
  const crowded = [];
  for (const [name, byProv] of byTemplate) {
    const count = [...byProv.values()].reduce((n, pages) => n + pages.length, 0);
    if (name.startsWith("api_") && byProv.size > 1) leaked.push(`${name} on ${[...byProv.keys()].join(" + ")}`);
    if (count >= 4) crowded.push(`${name} (${count})`);
  }
  console.log(`${leaked.length ? "MISS" : "ok  "}  api_* templates listed on more than one provider: ${leaked.length}${leaked.length ? ` (${show(leaked)})` : ""}`);
  console.log(`info  Templates on 4+ model pages: ${crowded.length}${crowded.length ? ` (${show(crowded)})` : ""}`);
  console.log(`info  'Where you can run it' tables with a header and no rows: ${emptyTables.length}${emptyTables.length ? ` (${show(emptyTables)})` : ""}`);

  catalogFailed = claimedClosed.length + wrongRoute.length + leaked.length;
}

const failed = unresolvedProviders + noProduct.length + badProv.length + badRouter.length + badRule.length + noSchema.length + catalogFailed;
console.log(`\n${failed ? `${failed} blocking issue(s)` : "No blocking issues"}. Template names, template pages and empty tables are for review, not blocking.`);
if (strict && failed) process.exitCode = 1;
