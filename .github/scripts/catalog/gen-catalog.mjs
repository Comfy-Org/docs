#!/usr/bin/env node
/**
 * Generate the hidden catalog/ pages the Comfy Docs MCP serves to agents.
 *
 * Usage:
 *   node .github/scripts/catalog/gen-catalog.mjs                       # write catalog/ and the docs.json Catalog group
 *   node .github/scripts/catalog/gen-catalog.mjs --templates ../workflow_templates
 *
 * Inputs (nothing here is hand-written per model):
 *   Router pages (development/comfy-router/models/<provider>/<model>/code.mdx): model IDs, input/output
 *   Pricing: none in the docs. Model pages point to router.comfy.org and the estimate endpoint (#2443).
 *   catalog-src/: provider IDs (cloud snapshot + docs layer), model aliases, product rules
 *   workflow_templates: templates per model, local model files and folders, nodes
 *   English tutorial pages: linked when they name the model's ID, files, or templates
 *   changelog/index.mdx, the Cloud CMS changelog, and git history: the per-product changes pages
 *
 * Owns catalog/ entirely: every .mdx in it is rewritten or removed on each run.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { root, readJson, readText, norm, loadProviders, loadRouterPages, loadEnglishPages, productMatcher, loadTemplates } from "./lib.mjs";

const args = process.argv.slice(2);
const tplDir = resolve(root, args.includes("--templates") ? args[args.indexOf("--templates") + 1] : "../workflow_templates");
const OUT = "catalog";
const TODAY = new Date().toISOString().slice(0, 10);
const CHANGE_DAYS = 90;

const { providers, lookup } = loadProviders();
const { models: aliasModels } = readJson("catalog-src/models.json");
const { products, productOf } = productMatcher();
const routerPages = loadRouterPages().filter((r) => r.id);
const enPages = loadEnglishPages();
const enPageSet = new Set(enPages);
const tpl = loadTemplates(tplDir);
if (!tpl) console.warn(`workflow_templates not found at ${tplDir}; pages will have no templates or local files.`);
const tplCommit = tpl ? execSync("git rev-parse --short HEAD", { cwd: tplDir }).toString().trim() : null;

// ---------- helpers
const slug = (s) => s.toLowerCase().replace(/[._]/g, "-").replace(/[^a-z0-9-]/g, "");
const providerId = (name) => lookup.get(norm(name)) ?? name;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
const mdEscape = (s) => String(s).replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
const yamlQuote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const clampDescription = (s) => (s.length <= 160 ? s : `${s.slice(0, 156).replace(/[ ,.;:]+\S*$/, "")}...`);
const OUTPUT_PHRASE = { video: "video generation", image: "image generation", audio: "audio generation", "3d": "3D generation", text: "text generation", music: "music generation", speech: "speech generation" };
const outputPhrase = (out) => list(out.map((o) => OUTPUT_PHRASE[o] ?? `${o} generation`));
const MAIN_DIRS = new Set(["diffusion_models", "checkpoints"]);

// ---------- models: Router pages first, then open-weights entries
const models = new Map(); // page path -> model record
const byRouterId = new Map();
for (const r of routerPages) {
  const [apiName, seg] = r.id.split("/");
  const prov = providerId(apiName);
  const path = `${OUT}/models/${prov}/${slug(seg)}`;
  const rec = {
    path,
    id: r.id,
    name: r.title ?? seg,
    provider: prov,
    license: "closed",
    input: r.input,
    output: r.output,
    routerIds: [r.id],
    routerPages: [r],
    templates: new Set(),
    filePrefixes: [],
  };
  models.set(path, rec);
  byRouterId.set(r.id, rec);
}
for (const m of aliasModels) {
  if (m.license !== "open-weights") continue;
  const [, seg] = m.id.split("/");
  const path = `${OUT}/models/${m.provider}/${slug(seg)}`;
  const linked = (m.router_ids ?? []).map((id) => byRouterId.get(id)).filter(Boolean);
  const existing = models.get(path);
  const rec = existing ?? {
    path,
    id: m.id,
    name: m.template_names?.[0] ?? seg,
    provider: m.provider,
    input: [],
    output: [],
    routerIds: [],
    routerPages: [],
    templates: new Set(),
    filePrefixes: [],
  };
  rec.license = "open-weights";
  rec.filePrefixes.push(...(m.files ?? []).map((p) => p.toLowerCase()));
  for (const l of linked) if (!rec.routerIds.includes(l.id)) { rec.routerIds.push(l.id); rec.routerPages.push(...l.routerPages); }
  if (!rec.input.length) rec.input = [...new Set(linked.flatMap((l) => l.input))];
  if (!rec.output.length) rec.output = [...new Set(linked.flatMap((l) => l.output))];
  rec.aliasNames = m.template_names ?? [];
  models.set(path, rec);
}

// ---------- templates -> models
const templateName = new Map(); // norm(display name) -> [records]
for (const m of aliasModels) {
  const targets = m.license === "open-weights"
    ? [models.get(`${OUT}/models/${m.provider}/${slug(m.id.split("/")[1])}`)]
    : (m.router_ids ?? []).map((id) => byRouterId.get(id));
  for (const n of m.template_names ?? []) templateName.set(norm(n), targets.filter(Boolean));
}
for (const r of routerPages) if (r.title && !templateName.has(norm(r.title))) templateName.set(norm(r.title), [byRouterId.get(r.id)]);

const nodeUse = new Map();
const templateRecs = new Map(); // template name -> how many catalog models it maps to
if (tpl) {
  for (const [name, t] of tpl.byName) {
    const targets = new Set();
    for (const n of t.models ?? []) for (const rec of templateName.get(norm(n)) ?? []) targets.add(rec);
    for (const f of tpl.files.get(name) ?? []) {
      if (!MAIN_DIRS.has(f.directory)) continue;
      for (const rec of models.values()) if (rec.filePrefixes.some((p) => f.name.toLowerCase().startsWith(p))) targets.add(rec);
    }
    for (const rec of targets) rec.templates.add(name);
    templateRecs.set(name, targets.size);
  }
  // node usage counts, to keep only model-specific nodes
  for (const name of tpl.byName.keys()) {
    const file = join(tplDir, "templates", `${name}.json`);
    if (!existsSync(file)) continue;
    let j;
    try { j = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    const types = new Set([...(j.nodes ?? []), ...((j.definitions?.subgraphs ?? []).flatMap((s) => s.nodes ?? []))].map((n) => n.type).filter(Boolean));
    tpl.byName.get(name).nodeTypes = types;
    for (const t of types) nodeUse.set(t, (nodeUse.get(t) ?? 0) + 1);
  }
}

// ---------- tutorials -> models (English pages that name the model's ID, main file, or template)
const tutorialPages = enPages.filter((p) => p.startsWith("tutorials/"));
const tutorialText = new Map(tutorialPages.filter((p) => existsSync(join(root, `${p}.mdx`))).map((p) => [p, readText(`${p}.mdx`)]));
const titleOf = (p) => {
  const file = join(root, `${p}.mdx`);
  if (!existsSync(file)) return p;
  return /^title:\s*"?(.+?)"?\s*$/m.exec(readFileSync(file, "utf8"))?.[1] ?? p;
};

for (const rec of models.values()) {
  const tplList = [...rec.templates].map((n) => tpl?.byName.get(n)).filter(Boolean);
  const files = new Map();
  const fileSource = tplList.filter((t) => (templateRecs.get(t.name) ?? 0) <= 1);
  for (const t of fileSource.length ? fileSource : tplList) for (const f of tpl.files.get(t.name) ?? []) if (!files.has(f.name)) files.set(f.name, f);
  rec.files = [...files.values()];
  const mainFiles = rec.files.filter((f) => MAIN_DIRS.has(f.directory) && rec.filePrefixes.some((p) => f.name.toLowerCase().startsWith(p)));
  rec.mainFiles = mainFiles;
  // Templates that use several models (showcase apps, multi-step pipelines) list this model but are not about it.
  // Only dedicated templates (one model name) drive tutorial links, nodes, and the Cloud link.
  const dedicated = tplList.filter((t) => (templateRecs.get(t.name) ?? 0) <= 1);
  rec.dedicated = dedicated;
  const needles = [...rec.routerIds, ...mainFiles.map((f) => f.name), ...dedicated.map((t) => t.name)];
  // Partner Node tutorials also have to sit in the model's provider folder: other providers' pages
  // sometimes name a model as a replacement or comparison.
  const partnerFolderOk = (p) => {
    const m = /^tutorials\/partner-nodes\/([^/]+)\//.exec(p);
    return !m || providerId(m[1]) === rec.provider;
  };
  rec.tutorials = [...tutorialText].filter(([p, text]) => partnerFolderOk(p) && needles.some((n) => text.includes(n))).map(([p]) => p);
  // A node belongs to the model when its class name carries the provider or model family name.
  const tokens = [...new Set([...(providers[rec.provider]?.names ?? []), rec.name.split(/[\s.-]/)[0]].map(norm).filter((t) => t.length >= 3))];
  const nodes = new Set();
  for (const t of dedicated) for (const type of t.nodeTypes ?? []) {
    if (enPageSet.has(`built-in-nodes/${type}`) && tokens.some((tok) => norm(type).includes(tok))) nodes.add(type);
  }
  rec.nodes = [...nodes].sort();
  rec.templateList = tplList.sort((a, b) => Number((templateRecs.get(b.name) ?? 0) <= 1) - Number((templateRecs.get(a.name) ?? 0) <= 1) || (b.date ?? "").localeCompare(a.date ?? ""));
  // Open-weights models without a Router page: take input/output from their dedicated templates.
  if (!rec.output.length && dedicated.length) {
    const MEDIA = new Set(["image", "video", "audio", "3d", "text"]);
    const outs = new Set();
    const ins = new Set();
    for (const t of dedicated) {
      for (const o of t.io?.outputs ?? []) if (MEDIA.has(String(o.mediaType).toLowerCase())) outs.add(String(o.mediaType).toLowerCase());
      for (const i of t.io?.inputs ?? []) if (MEDIA.has(String(i.mediaType).toLowerCase())) ins.add(String(i.mediaType).toLowerCase());
      for (const tag of t.tags ?? []) {
        const m = /^(text|image|video|audio)\s+to\s+(image|video|audio|3d)/i.exec(tag);
        if (m) { ins.add(m[1].toLowerCase()); outs.add(m[2].toLowerCase()); }
        if (/^image edit/i.test(tag)) { ins.add("image"); outs.add("image"); }
      }
    }
    rec.output = [...outs];
    rec.input = [...ins].filter(Boolean);
  }
  rec.cloudTemplate = [...dedicated].sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0))[0] ?? null;
}

// ---------- page writers
const written = [];
function write(path, frontmatter, body) {
  const file = join(root, `${path}.mdx`);
  mkdirSync(dirname(file), { recursive: true });
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${yamlQuote(v)}`).join("\n");
  writeFileSync(file, `---\n${fm}\n---\n\n{/* GENERATED by .github/scripts/catalog/gen-catalog.mjs. Do not edit; edit catalog-src/ or the generator. */}\n\n${body.trim()}\n`);
  written.push(path);
}
const tagBlock = (tags) => Object.entries(tags).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");

function modelProducts(rec) {
  const p = [];
  if (rec.routerIds.length) p.push("router");
  if (rec.license === "open-weights") p.push("local");
  if (rec.templateList.length) p.push("cloud", "workflows");
  if (rec.nodes.length) p.push("nodes");
  if (rec.tutorials.length && !p.includes("workflows")) p.push("workflows");
  return [...new Set(p)];
}

function modelPage(rec) {
  const prov = providers[rec.provider]?.title ?? rec.provider;
  const outs = rec.output.length ? rec.output : ["media"];
  const phrase = rec.output.length ? outputPhrase(rec.output) : "generation";
  const open = rec.license === "open-weights";
  const title = `${rec.name} ${phrase} model (${rec.id}): where to run it${rec.routerIds.length ? " and pricing" : ""}`;
  const ways = [rec.routerIds.length && "Comfy Router", open && "ComfyUI locally", rec.templateList.length && "Comfy Cloud"].filter(Boolean);
  const description = clampDescription(`${rec.name} is a ${phrase} model from ${prov}. Run it with ${list(ways.length ? ways : ["ComfyUI"])}; templates, files, nodes, and pricing.`);

  const products_ = modelProducts(rec);
  let body = `${tagBlock({
    "Model ID": rec.id,
    Provider: rec.provider,
    Product: products_,
    Input: rec.input,
    Output: rec.output,
    License: rec.license,
    "Router ID": rec.routerIds.length > 1 || (rec.routerIds[0] && rec.routerIds[0] !== rec.id) ? rec.routerIds : null,
  })}\n\n`;

  body += `${rec.name} is a ${phrase} model from ${prov}${rec.input.length ? `. It takes ${list(rec.input)} as input and produces ${list(outs)}` : ""}. `;
  body += open
    ? `It has open weights, so you can download the files and run it locally in ComfyUI${rec.routerIds.length ? ", or call the hosted version through Comfy Router" : ""}.`
    : `It has no open weights. It runs on ${prov}'s servers, so you use it through ${list([rec.routerIds.length && "Comfy Router", rec.templateList.length && "Partner Nodes in ComfyUI and Comfy Cloud"].filter(Boolean)) || "Comfy Router"}.`;
  body += "\n\n## Where you can run it\n\n| Where | Page | Use it when |\n| --- | --- | --- |\n";
  for (const r of rec.routerPages) body += `| Comfy Router (API) | [${mdEscape(r.title ?? r.id)} with Comfy Router](/${r.page}) | You call \`${r.id}\` from your own code with \`COMFY_API_KEY\` |\n`;
  for (const t of rec.tutorials) {
    const partner = t.startsWith("tutorials/partner-nodes/");
    body += `| ${partner ? "Partner Nodes (ComfyUI and Comfy Cloud)" : open ? "ComfyUI (local or Comfy Cloud)" : "ComfyUI"} | [${mdEscape(titleOf(t))}](/${t}) | ${partner ? "You build a workflow with the hosted model" : "You follow a step-by-step workflow tutorial"} |\n`;
  }
  if (rec.cloudTemplate) body += `| Comfy Cloud | [Open \`${rec.cloudTemplate.name}\` on Comfy Cloud](https://cloud.comfy.org/?template=${rec.cloudTemplate.name}) | You want to run a ready-made workflow without installing anything |\n`;
  if (!rec.routerPages.length && !rec.tutorials.length && !rec.templateList.length) body += `| ComfyUI | No dedicated page yet | Search the docs for ${rec.name} |\n`;

  if (rec.routerIds.length) {
    body += `\n## Call it with Comfy Router\n\n`;
    for (const id of rec.routerIds) body += `- \`POST https://api.comfy.org/v2/models/${id}\`. Live request schema: \`GET /v2/models/${id}/openapi.json\`.\n`;
  }

  if (open && rec.files.length) {
    body += `\n## Model files for running it locally\n\nPut each file in the matching folder under \`ComfyUI/models/\`. These come from the workflow templates below${tplCommit ? ` (workflow_templates at \`${tplCommit}\`)` : ""}.\n\n| File | Folder | Download |\n| --- | --- | --- |\n`;
    const own = (f) => Number(rec.filePrefixes.some((p) => f.name.toLowerCase().startsWith(p)));
    const sorted = [...rec.files].sort((a, b) => own(b) - own(a) || Number(MAIN_DIRS.has(b.directory)) - Number(MAIN_DIRS.has(a.directory)) || a.directory.localeCompare(b.directory));
    for (const f of sorted.slice(0, 20)) body += `| \`${f.name}\` | \`models/${f.directory}/\` | ${f.url ? `[Download](${f.url})` : "See template"} |\n`;
    if (sorted.length > 20) body += `\n${sorted.length - 20} more files are listed in the templates.\n`;
  }

  if (rec.templateList.length) {
    body += `\n## Workflow templates\n\n| Template | Title | Added |\n| --- | --- | --- |\n`;
    for (const t of rec.templateList.slice(0, 15)) body += `| \`${t.name}\` | ${mdEscape(t.title ?? "")} | ${t.date ?? ""} |\n`;
    if (rec.templateList.length > 15) body += `\n${rec.templateList.length - 15} more templates use this model.\n`;
  }

  if (rec.nodes.length) {
    body += `\n## Nodes\n\n${rec.nodes.map((n) => `- [${n}](/built-in-nodes/${n})`).join("\n")}\n`;
  }

  if (rec.routerIds.length) {
    body += `\n## Pricing\n\nComfy Router charges the model maker's list price, billed from your workspace credits (211 credits = $1 USD). Current per-model prices are on [router.comfy.org](https://router.comfy.org).\n\n`;
    body += `- Price a call before you run it: \`POST https://api.comfy.org/v2/models/${rec.routerIds[0]}/estimate\`.\n`;
    body += `- Billing facts, such as whether a refused request is charged: the \`billing\` field from \`GET https://api.comfy.org/v2/models/${rec.routerIds[0]}\`.\n`;
    body += `\nSee [Comfy Router pricing](/development/comfy-router/pricing) and [Billing](/development/comfy-router/billing#model-billing-facts).\n`;
  }
  write(rec.path, { title, description }, body);
}

for (const rec of models.values()) modelPage(rec);
const allModels = [...models.values()];

// ---------- Router lists by output
const routerModels = allModels.filter((m) => m.routerIds.length);
const outputs = [...new Set(routerModels.flatMap((m) => m.output))].sort();
for (const out of outputs) {
  const rows = routerModels.filter((m) => m.output.includes(out)).sort((a, b) => a.id.localeCompare(b.id));
  const phrase = OUTPUT_PHRASE[out] ?? `${out} generation`;
  let body = `${tagBlock({ Product: "router", Output: out, Count: String(rows.length) })}\n\nEvery ${phrase} model you can call through Comfy Router, with its model ID. Call any of them with \`POST https://api.comfy.org/v2/models/<model ID>\` and your \`COMFY_API_KEY\`.\n\n| Model | Model ID | Provider | Input | Catalog page |\n| --- | --- | --- | --- | --- |\n`;
  for (const m of rows) body += `| ${mdEscape(m.name)} | \`${m.routerIds.join("`, `")}\` | ${m.provider} | ${m.input.join(", ")} | [Details](/${m.path}) |\n`;
  write(`${OUT}/router/${slug(out)}`, {
    title: `Comfy Router ${phrase} models: all ${rows.length} model IDs`,
    description: clampDescription(`Every ${phrase} model on Comfy Router: model IDs, providers, and inputs, with links to where to run each one and its pricing.`),
  }, body);
}

// ---------- open-weights list
const openModels = allModels.filter((m) => m.license === "open-weights").sort((a, b) => a.id.localeCompare(b.id));
{
  let body = `${tagBlock({ Product: "local", License: "open-weights", Count: String(openModels.length) })}\n\nOpen-weights models you can download and run locally in ComfyUI, or run on Comfy Cloud. Each catalog page lists the model files, the folder each goes in, the templates, and the tutorials.\n\n| Model | Model ID | Provider | Output | Templates | Catalog page |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const m of openModels) body += `| ${mdEscape(m.name)} | \`${m.id}\` | ${m.provider} | ${m.output.join(", ")} | ${m.templateList.length} | [Details](/${m.path}) |\n`;
  write(`${OUT}/local/models`, {
    title: `Open-weights models you can run locally in ComfyUI: ${openModels.length} models`,
    description: "Open-weights models for ComfyUI with model files, folders, templates, and tutorials for each, so you can run them locally or on Comfy Cloud.",
  }, body);
}

// ---------- changes per product
function gitLines(cmd) {
  try { return execSync(cmd, { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split("\n"); } catch { return []; }
}
const since = new Date(Date.now() - CHANGE_DAYS * 864e5).toISOString().slice(0, 10);
function gitAdded(pathspec, filter = "A") {
  const out = [];
  let date = null;
  for (const l of gitLines(`git log --since=${since} --diff-filter=${filter} --format=@%cs --name-only -- ${pathspec}`)) {
    if (l.startsWith("@")) date = l.slice(1);
    else if (l.trim()) out.push({ date, path: l.trim() });
  }
  return out;
}
const changes = {};

{ // router: one row per model. Pages are regenerated often, so keep each current model's first add
  // date and report a removal only when the model is gone now.
  const current = new Map(routerPages.map((r) => [r.page, r]));
  const firstAdd = new Map();
  for (const x of gitAdded("'development/comfy-router/models/*/*/code.mdx'")) {
    const page = x.path.replace(/\.mdx$/, "");
    if (!firstAdd.has(page) || x.date < firstAdd.get(page)) firstAdd.set(page, x.date);
  }
  const lastRemove = new Map();
  for (const x of gitAdded("'development/comfy-router/models/*/*/code.mdx'", "D")) {
    const page = x.path.replace(/\.mdx$/, "");
    if (!current.has(page) && (!lastRemove.has(page) || x.date > lastRemove.get(page))) lastRemove.set(page, x.date);
  }
  const rows = [
    ...[...firstAdd].filter(([page]) => current.has(page)).map(([page, date]) => ({ date, kind: "Added", r: current.get(page), page })),
    ...[...lastRemove].map(([page, date]) => ({ date, kind: "Removed", r: null, page })),
  ].sort((a, b) => b.date.localeCompare(a.date)).map((x) => {
    const rec = x.r && byRouterId.get(x.r.id);
    return `| ${x.date} | ${x.kind} | \`${x.r ? x.r.id : x.page.split("/").slice(3, 5).join("/")}\` | ${rec ? `[${mdEscape(rec.name)}](/${rec.path})` : ""} |`;
  });
  changes.router = { title: "Comfy Router", what: "models added to or removed from Comfy Router", rows, header: "| Date | Change | Model ID | Catalog page |\n| --- | --- | --- | --- |" };
}
{ // nodes
  const rows = gitAdded("'built-in-nodes/*.mdx'").sort((a, b) => b.date.localeCompare(a.date)).map((x) => {
    const n = x.path.replace(/^built-in-nodes\//, "").replace(/\.mdx$/, "");
    return `| ${x.date} | [${n}](/built-in-nodes/${n}) |`;
  });
  changes.nodes = { title: "Node reference", what: "new built-in node reference pages", rows, header: "| Date | Node |\n| --- | --- |" };
}
{ // workflows: new templates
  const rows = tpl ? [...tpl.byName.values()].filter((t) => t.date && t.date >= since).sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
    const recs = allModels.filter((m) => m.templates.has(t.name));
    return `| ${t.date} | \`${t.name}\` | ${mdEscape(t.title ?? "")} | ${recs.map((m) => `[${mdEscape(m.name)}](/${m.path})`).join(", ")} |`;
  }) : [];
  changes.workflows = { title: "Workflow templates", what: `new workflow templates${tplCommit ? ` (workflow_templates at \`${tplCommit}\`)` : ""}`, rows, header: "| Date | Template | Title | Models |\n| --- | --- | --- | --- |" };
}
function updateBlocks(text, limit) {
  const blocks = [...text.matchAll(/<Update label="([^"]+)" description="([^"]+)">([\s\S]*?)<\/Update>/g)];
  return blocks.slice(0, limit).map(([, label, date, inner]) => `### ${label} (${date})\n\n${inner.trim()}`);
}
{ // local: ComfyUI releases
  changes.local = { title: "ComfyUI", what: "ComfyUI releases, newest first, from the [ComfyUI changelog](/changelog)", blocks: updateBlocks(readText("changelog/index.mdx"), 6) };
}
{ // cloud: published Cloud changelog versions only
  const pub = readJson(".github/scripts/cms/published-versions.json").published.filter((p) => p.project === "cloud").map((p) => p.version);
  const staged = existsSync(join(root, ".github/scripts/cms/staging/cloud/en/changelog/index.mdx")) ? readText(".github/scripts/cms/staging/cloud/en/changelog/index.mdx") : "";
  const blocks = [...staged.matchAll(/<Update label="v?([^"]+)" description="([^"]+)">([\s\S]*?)<\/Update>/g)]
    .filter(([, v]) => pub.includes(v))
    .slice(0, 6)
    .map(([, label, date, inner]) => `### v${label} (${date})\n\n${inner.trim()}`);
  changes.cloud = { title: "Comfy Cloud", what: "Comfy Cloud releases that have been published to the in-app changelog", blocks };
}
for (const [prod, c] of Object.entries(changes)) {
  let body = `${tagBlock({ Product: prod, Updated: TODAY })}\n\nWhat's new in ${c.title}: ${c.what}.\n\n`;
  if (c.blocks) body += c.blocks.length ? c.blocks.join("\n\n") : "No published entries yet.";
  else body += c.rows.length ? `Last ${CHANGE_DAYS} days:\n\n${c.header}\n${c.rows.slice(0, 80).join("\n")}${c.rows.length > 80 ? `\n\n${c.rows.length - 80} older entries are not shown.` : ""}` : `No changes in the last ${CHANGE_DAYS} days.`;
  write(`${OUT}/changes/${prod}`, {
    title: `What's new in ${c.title}: recent changes`,
    description: clampDescription(`What changed recently in ${c.title}: ${c.what.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`/g, "")}.`),
  }, body);
}

// ---------- products
{
  const counts = Object.fromEntries(Object.keys(products).map((k) => [k, 0]));
  const firstPages = Object.fromEntries(Object.keys(products).map((k) => [k, []]));
  for (const p of enPages) {
    const prod = productOf(p);
    if (!prod) continue;
    counts[prod]++;
    if (firstPages[prod].length < 4 && !p.startsWith("built-in-nodes/") && !p.includes("/models/")) firstPages[prod].push(p);
  }
  let body = `Comfy has ${Object.keys(products).length} products. Every docs page belongs to exactly one. Start with a product's catalog pages, then its docs pages.\n\n| Product ID | Product | What it covers | Docs pages | Start here | Catalog |\n| --- | --- | --- | ---: | --- | --- |\n`;
  for (const [id, p] of Object.entries(products)) {
    const cat = [
      existsSync(join(root, `${OUT}/changes/${id}.mdx`)) && `[What's new](/${OUT}/changes/${id})`,
      id === "router" && outputs.map((o) => `[${o}](/${OUT}/router/${slug(o)})`).join(" · "),
      id === "local" && `[Open-weights models](/${OUT}/local/models)`,
    ].filter(Boolean).join(" · ");
    body += `| \`${id}\` | ${p.title} | ${mdEscape(p.description)} | ${counts[id]} | ${firstPages[id].map((x) => `[${x}](/${x})`).join(", ")} | ${cat} |\n`;
  }
  write(`${OUT}/products`, {
    title: "Comfy products: Cloud, ComfyUI, Desktop, Router, and more",
    description: "Every Comfy product with what it covers and where its docs start: Comfy Cloud, ComfyUI local, Desktop, Comfy Router, nodes, developers, and agents.",
  }, `${tagBlock({ Product: Object.keys(products) })}\n\n${body}`);
}

// ---------- catalog home
{
  const body = `This catalog is written for AI agents. Each page starts with plain tag lines (\`Product:\`, \`Model ID:\`, \`Output:\`, \`License:\`) so you can filter pages with the docs filesystem tool, for example \`rg -l "Output: video" /catalog/models\`.

| Page | What it answers |
| --- | --- |
| [/catalog/products](/catalog/products) | What products Comfy has and where each one's docs start |
${outputs.map((o) => `| [/catalog/router/${slug(o)}](/catalog/router/${slug(o)}) | Which ${OUTPUT_PHRASE[o] ?? o} models Comfy Router serves |`).join("\n")}
| [/catalog/local/models](/catalog/local/models) | Which open-weights models run locally, with files and folders |
| \`/catalog/models/<provider>/<model>\` | Where one model runs (Router, local, Cloud, Partner Nodes), its templates, nodes, and where to find Router prices |
${Object.keys(changes).map((p) => `| [/catalog/changes/${p}](/catalog/changes/${p}) | What's new in ${changes[p].title} |`).join("\n")}

Model IDs are Comfy Router IDs (\`provider/model\`), such as \`kling/kling-v3\`. Open-weights models without a Router version use \`<provider>/<model>\`, such as \`bfl/flux-2-dev\`. Provider IDs match Comfy's partner catalog.

${allModels.length} model pages, generated ${TODAY}.`;
  write(`${OUT}/index`, {
    title: "Comfy model and product catalog for AI agents",
    description: "Index of the Comfy catalog: products, Comfy Router models by output, open-weights models to run locally, and what's new in each product.",
  }, body);
}

// ---------- remove stale pages, update docs.json Catalog group
const keep = new Set(written.map((p) => join(root, `${p}.mdx`)));
const walkFiles = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(join(d, e.name)) : [join(d, e.name)])) : []);
let removed = 0;
for (const f of walkFiles(join(root, OUT))) if (f.endsWith(".mdx") && !keep.has(f)) { rmSync(f); removed++; }

const docsPath = join(root, "docs.json");
const docs = JSON.parse(readFileSync(docsPath, "utf8"));
let group = null;
const find = (o) => {
  if (group || !o || typeof o !== "object") return;
  if (o.group === "Catalog" && o.hidden) { group = o; return; }
  Object.values(o).forEach(find);
};
find(docs.navigation.languages.find((l) => l.language === "en"));
if (!group) throw new Error('docs.json has no hidden "Catalog" group in the English navigation');
const order = (p) => (p === `${OUT}/index` ? 0 : p.startsWith(`${OUT}/models/`) ? 2 : 1);
group.pages = [...written].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
writeFileSync(docsPath, `${JSON.stringify(docs, null, 2)}\n`);

const withTpl = allModels.filter((m) => m.templateList.length).length;
const withTut = allModels.filter((m) => m.tutorials.length).length;
console.log(`Wrote ${written.length} pages (${allModels.length} models: ${routerModels.length} on Router, ${openModels.length} open-weights), removed ${removed} stale.`);
console.log(`Models with templates: ${withTpl}, with tutorials: ${withTut}, with nodes: ${allModels.filter((m) => m.nodes.length).length}.`);
console.log(`Router outputs: ${outputs.join(", ")}. Changes: ${Object.entries(changes).map(([k, c]) => `${k} ${(c.rows ?? c.blocks).length}`).join(", ")}.`);
