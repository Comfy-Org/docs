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
import { root, readJson, readText, norm, loadProviders, loadRouterPages, loadRouterSchemas, loadEnglishPages, productMatcher, loadTemplates } from "./lib.mjs";

const args = process.argv.slice(2);
const tplDir = resolve(root, args.includes("--templates") ? args[args.indexOf("--templates") + 1] : "../workflow_templates");
const OUT = "catalog";
const TODAY = new Date().toISOString().slice(0, 10);
const CHANGE_DAYS = 90;

const { providers, lookup } = loadProviders();
const { models: aliasModels } = readJson("catalog-src/models.json");
const { products, productOf } = productMatcher();
const routerPages = loadRouterPages().filter((r) => r.id);
const routerSchemas = loadRouterSchemas();
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
// Descriptions stay 40-160 characters and never end on a dangling word.
const clampDescription = (s) => {
  if (s.length <= 160) return s;
  const cut = s.slice(0, 156).replace(/[ ,.;:]+\S*$/, "").replace(/[ ,;:]+\b(and|or|with|for|to|of|in|from)$/i, "");
  return `${cut}...`;
};
const OUTPUT_PHRASE = { video: "video generation", image: "image generation", audio: "audio generation", "3d": "3D generation", text: "text generation", music: "music generation", speech: "speech generation" };
const outputPhrase = (out) => list(out.map((o) => OUTPUT_PHRASE[o] ?? `${o} generation`));
const MAIN_DIRS = new Set(["diffusion_models", "checkpoints"]);
const MEDIA = new Set(["text", "image", "video", "audio", "3d"]);
// Words that are initialisms in model names; "Sd3.5 Large Turbo" is not a name anyone writes.
const ACRONYM = /^(sd|svd|sdxl|ltx|llm|api|ai|hd|t2v|i2v|r2v|v2v|t2i|i2i|flf2v|hdr|uso)(.*)$/i;
const article = (word) => (/^[aeiou]/i.test(String(word)) ? "an" : "a");
const prettify = (s) =>
  String(s)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => {
      const m = ACRONYM.exec(w);
      if (m) return `${m[1].toUpperCase()}${m[2]}`;
      return cap(w);
    })
    .join(" ");
// Model names keep their initialisms: "Sd3.5" and "Sdxl" are not how anyone writes them.
const INITIALISM = /^(sd|sdxl|svd|ltx|llm|api|ai|hd|t2v|i2v|r2v|v2v|t2i|i2i|flf2v|hdr|uso)(\d.*)?$/i;
const fixInitialisms = (s) =>
  String(s)
    .split(/\s+/)
    .map((w) => {
      const m = INITIALISM.exec(w);
      return m ? `${m[1].toUpperCase()}${m[2] ?? ""}` : w;
    })
    .join(" ");
// Text to video and friends, from a template name, tag, or model ID segment.
const MOTION = [
  [/(?:text|txt)[\s_-]?to[\s_-]?video|t2v/i, "t2v", ["text"], ["video"]],
  [/(?:image|img)[\s_-]?to[\s_-]?video|i2v/i, "i2v", ["image"], ["video"]],
  [/reference[\s_-]?to[\s_-]?video|r2v/i, "r2v", ["image"], ["video"]],
  [/(?:video|vid)[\s_-]?to[\s_-]?video|v2v/i, "v2v", ["video"], ["video"]],
  [/(?:text|txt)[\s_-]?to[\s_-]?image|t2i/i, "t2i", ["text"], ["image"]],
  [/(?:image|img)[\s_-]?to[\s_-]?image|i2i/i, "i2i", ["image"], ["image"]],
  [/video[\s_-]?edit|image[\s_-]?edit|inpaint|outpaint/i, "edit", ["image"], ["image"]],
];
const motionOf = (s) => {
  const m = MOTION.find(([re]) => re.test(String(s)));
  return m ? { code: m[1], input: m[2], output: m[3] } : null;
};
const mediaTypes = (items) => [...new Set((items ?? []).map((x) => String(x?.mediaType ?? "").toLowerCase()).filter((x) => MEDIA.has(x)))];
const onlyMedia = (list_) => list_.filter((x) => MEDIA.has(x));
// What a template produces and consumes, from its io media types, its tags, and its name.
function templateSignature(t) {
  const input = new Set(mediaTypes(t.io?.inputs));
  const output = new Set(mediaTypes(t.io?.outputs));
  let code = null;
  for (const tag of t.tags ?? []) {
    const m = /^(text|image|video|audio)\s+to\s+(image|video|audio|3d)/i.exec(tag);
    if (m) { input.add(m[1].toLowerCase()); output.add(m[2].toLowerCase()); }
    if (/^image edit/i.test(tag)) { input.add("image"); output.add("image"); }
    if (/^(video|animation)$/i.test(tag)) output.add("video");
    if (/flf2v/i.test(tag)) { input.add("image"); output.add("video"); }
    const mm = motionOf(tag);
    if (mm) {
      code ??= mm.code;
      mm.input.forEach((x) => input.add(x));
      mm.output.forEach((x) => output.add(x));
    }
  }
  if (!code) code = motionOf(t.name)?.code ?? null;
  return { code, input: [...input], output: [...output] };
}
// A signature fits a model when every input and output it names is one the model takes or makes.
const signatureFits = (sig, rec) =>
  (!sig.input.length || !rec.input.length || sig.input.every((x) => rec.input.includes(x))) &&
  (!sig.output.length || !rec.output.length || sig.output.every((x) => rec.output.includes(x)));
// For a provider-level name the model's own inputs are often unknown, so only the output has to agree.
const outputFits = (sig, rec) => !sig.output.length || !rec.output.length || sig.output.every((x) => rec.output.includes(x));

// ---------- models: Router pages first, then open-weights entries
const models = new Map(); // page path -> model record
const byRouterId = new Map();
for (const r of routerPages) {
  const [apiName, seg] = r.id.split("/");
  const prov = providerId(apiName);
  const path = `${OUT}/models/${prov}/${slug(seg)}`;
  const schema = routerSchemas.get(r.id);
  const rec = {
    path,
    id: r.id,
    name: fixInitialisms(r.title ?? prettify(seg)),
    provider: prov,
    license: "closed",
    input: r.input.length ? r.input : onlyMedia(schema?.input ?? []),
    output: r.output.length ? r.output : onlyMedia(schema?.output ?? []),
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
    name: m.template_names?.[0] ?? prettify(seg),
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
  // A display name from catalog-src/ beats a prettified ID; Router variants of the family get the
  // family name plus their own suffix ("Stable Diffusion 3.5" + "Large Turbo").
  const family = m.display ?? m.template_names?.[0] ?? null;
  if (family) rec.name = family;
  rec.familyName = family ?? prettify(seg);
  for (const l of linked) {
    const suffix = variantSuffix(l.id.split("/")[1], seg);
    if (family) l.name = suffix ? `${family} ${suffix}` : family;
    if (l === rec) continue;
    // These Router records serve a model whose weights are published, so they are not closed.
    l.weights = { name: rec.familyName, path: rec.path };
    l.license = "open-weights";
  }
  rec.siblings = linked.filter((l) => l !== rec);
  models.set(path, rec);
}

/** "sd3.5-large-turbo" against family "sd3.5" -> "Large Turbo". */
function variantSuffix(routerSeg, familySeg) {
  const a = slug(routerSeg).split("-").filter(Boolean);
  const b = slug(familySeg).split("-").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i ? prettify(a.slice(i).join(" ")) : "";
}

// ---------- templates -> models
// A name that is just a provider ("Google Gemini", "FLUX") says who makes the model, not which
// one, so it must not resolve to a single model page.
const providerLevel = new Set(Object.values(providers).flatMap((p) => p.names.map(norm)));
const templateName = new Map(); // norm(display name) -> [records]
for (const m of aliasModels) {
  const targets = m.license === "open-weights"
    ? [models.get(`${OUT}/models/${m.provider}/${slug(m.id.split("/")[1])}`)]
    : (m.router_ids ?? []).map((id) => byRouterId.get(id));
  // These names are on the entry itself, so they are specific even when one equals a provider
  // alias ("Hunyuan3D", "LongCat").
  for (const n of m.template_names ?? []) templateName.set(norm(n), targets.filter(Boolean));
}
for (const r of routerPages) if (r.title && !providerLevel.has(norm(r.title)) && !templateName.has(norm(r.title))) templateName.set(norm(r.title), [byRouterId.get(r.id)]);
// A Router page titled after the provider itself ("Google Gemini") is the generic page for that
// provider. It is only ever the target of a template that names no specific model.
const genericPages = new Map();
for (const r of routerPages) if (r.title && providerLevel.has(norm(r.title)) && byRouterId.get(r.id)) genericPages.set(norm(r.title), byRouterId.get(r.id));

// Size and speed words that tell Router variants of one family apart ("Seedance 2.0 Mini").
const VARIANT_WORDS = new Set(["mini", "fast", "turbo", "pro", "prime", "large", "medium", "flash", "max", "lite"]);
const variantWords = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => VARIANT_WORDS.has(w)));

/** Pick the variant a template is about when one display name covers several Router records. */
function pickVariants(recs, sig, name) {
  if (recs.length <= 1) return recs;
  const named = variantWords(name);
  const scored = recs.map((r) => {
    const seg = r.id.split("/")[1];
    let score = 0;
    if (sig.code && motionOf(seg)?.code === sig.code) score += 10;
    if (sig.input.length && r.input.length && sig.input.every((x) => r.input.includes(x))) score += 2;
    if (sig.output.length && r.output.length && sig.output.every((x) => r.output.includes(x))) score += 2;
    if ([...variantWords(seg)].some((w) => named.has(w))) score += 4;
    return { r, score };
  });
  const best = Math.max(...scored.map((x) => x.score));
  return scored.filter((x) => x.score === best).map((x) => x.r);
}

/** Providers a template's own name points at ("api_bfl_flux1_expand_image" -> bfl). */
const templateProviderRefs = (t) => {
  const refs = new Set();
  for (const n of t.models ?? []) if (providerLevel.has(norm(n))) refs.add(lookup.get(norm(n)));
  for (const tok of String(t.name).split(/[\s._-]+/)) if (norm(tok).length >= 3 && lookup.has(norm(tok))) refs.add(lookup.get(norm(tok)));
  return refs;
};

const nodeUse = new Map();
const templateRecs = new Map(); // template name -> how many catalog models it maps to
if (tpl) {
  for (const [name, t] of tpl.byName) {
    const sig = templateSignature(t);
    const targets = new Set();
    const names = t.models ?? [];
    const resolved = names.some((n) => templateName.has(norm(n)));
    const providerNames = names.filter((n) => providerLevel.has(norm(n)));
    for (const n of names) for (const rec of pickVariants(templateName.get(norm(n)) ?? [], sig, name)) targets.add(rec);
    // A provider-level name with no entry of its own is weak: it only reaches the provider's
    // generic Router page, and only when the template names no model through an entry.
    if (!resolved) for (const n of providerNames) if (genericPages.has(norm(n))) targets.add(genericPages.get(norm(n)));
    for (const f of tpl.files.get(name) ?? []) {
      if (!MAIN_DIRS.has(f.directory)) continue;
      for (const rec of models.values()) if (rec.filePrefixes.some((p) => f.name.toLowerCase().startsWith(p))) targets.add(rec);
    }
    // An api_* template that names another provider belongs to that provider, not this one, and a
    // template that consumes or makes only media this model does not is a multi-model pipeline.
    const refs = templateProviderRefs(t);
    const apiNamed = /^api[_-]|_api[_-]|_api$/i.test(name);
    for (const rec of [...targets]) {
      const providerOk = !refs.size || refs.has(rec.provider);
      // A name that points at one model is evidence enough; a provider-level target is not.
      const fits = (targets.size <= 1 && resolved) || (resolved ? signatureFits(sig, rec) : outputFits(sig, rec));
      if ((apiNamed && !providerOk) || !fits) targets.delete(rec);
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
// A needle only counts as a whole token ("api_google_gemini" is not named by
// "api_google_gemini_4_hydrogen") and never when it only appears in a markdown link target: the
// Ideogram 4.5 page links 4.0, and a link target is not a mention of the model.
const linkTarget = /\]\([^)\n]*\)/g;
const mentionRe = (needle) => new RegExp(`(?<![A-Za-z0-9_-])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`);
const mentions = (text, needle) => mentionRe(needle).test(text.replace(linkTarget, "]"));
const versionTokens = (s) => String(s).match(/\d+(?:\.\d+)?/g) ?? [];
const familyOf = (s) => String(s).split(":")[0].replace(/\s+(?:in|for|with|and)\s+.*$/i, "").replace(/\d+(?:\.\d+)?/g, " ").replace(/[^A-Za-z ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
// "Ideogram 4.5" is not the page for Ideogram 4.0 even when the page mentions it.
const otherVariant = (recName, title) => {
  const family = familyOf(recName);
  if (!family || family !== familyOf(title)) return false;
  const mine = versionTokens(recName);
  const theirs = versionTokens(title);
  return Boolean(theirs.length && mine.length && !theirs.some((v) => mine.includes(v)));
};
const runDestination = (p) => !/\/(pricing|policy|changelog)$/.test(p) && !/pricing|policy|changelog/i.test(titleOf(p));
// A tutorial page named after another catalog model is that model's tutorial: the FLUX.1 Krea Dev
// walkthrough is not the FLUX.1 Dev page's workflow.
const owners = new Map(); // norm(page name) -> records with that model ID segment
for (const rec of models.values()) {
  const k = norm(rec.id.split("/")[1]);
  if (!owners.has(k)) owners.set(k, new Set());
  owners.get(k).add(rec);
}
const tutorialOwnerOk = (rec, p) => {
  // The longest model ID segment the page name carries as a whole token: "beeble-switchx" and
  // "krea-2-t2i" belong to switchx and krea-2, while "qwen-image-edit-2511" is not the page for
  // qwen-image-edit.
  const name = norm(p.split("/").pop());
  let best = "";
  for (const s of owners.keys()) {
    const at = name.indexOf(s);
    if (at < 0 || s.length <= best.length) continue;
    // A short segment away from the start ("image" in "flux-1-text-to-image") is not an owner.
    if (at > 0 && s.length < 6) continue;
    if (at > 0 && /\d/.test(name[at - 1])) continue;
    if (/^\d/.test(name.slice(at + s.length))) continue;
    best = s;
  }
  return !best || owners.get(best).has(rec);
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
  // A tutorial titled after another provider is that provider's page, not this model's, even when
  // it uses this model's files ("ByteDance USO" builds on FLUX.1). Only the leading brand segment
  // of the title counts: provider names double as ordinary words ("Sync", "Light"), so a token
  // further into the title says nothing about who the tutorial is for.
  const providerTitleOk = (p) => {
    const title = String(titleOf(p));
    // Titled after this model: the brand in the title is the model's, not a rival provider's
    // (FLUX.1 Krea Dev is a Krea model served by BFL).
    if (/\d/.test(rec.name) && norm(rec.name).length >= 4 && norm(title).includes(norm(rec.name))) return true;
    const head = title.split(/:\s|\s+(?:in|for|with)\s+/i)[0];
    const ids = new Set(head.split(/[^A-Za-z0-9.]+/).map(norm).filter((t) => t.length >= 3 && lookup.has(t)).map((t) => lookup.get(t)));
    return !ids.size || ids.has(rec.provider);
  };
  const mentionsModel = (p, text) => needles.some((n) => mentions(text, n) || mentions(p, n));
  // A tutorial titled after the model is about it even when the body never spells the Router ID
  // ("Runway Gen4 Turbo in ComfyUI", "Wan2.1 InfiniteTalk"). Provider-titled pages carry no
  // discriminating power — "Google Gemini" is on every Gemini tutorial — so they are excluded.
  const titleNamesModel = (p) => {
    if (norm(rec.name) === norm(providers[rec.provider]?.title ?? rec.provider)) return false;
    // The name has to be specific enough to mean something: a version number and a real name,
    // not a bare modality word like "Image" (every image tutorial would match it).
    if (!/\d/.test(rec.name)) return false;
    const n = norm(rec.name);
    return n.length >= 6 && norm(titleOf(p)).includes(n);
  };
  rec.tutorials = [...tutorialText]
    .filter(([p, text]) => partnerFolderOk(p) && providerTitleOk(p) && tutorialOwnerOk(rec, p) && (mentionsModel(p, text) || titleNamesModel(p)))
    .map(([p]) => p)
    .filter((p) => !otherVariant(rec.name, titleOf(p)));
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
    const outs = new Set();
    const ins = new Set();
    for (const t of dedicated) {
      for (const o of t.io?.outputs ?? []) if (MEDIA.has(String(o.mediaType).toLowerCase())) outs.add(String(o.mediaType).toLowerCase());
      for (const i of t.io?.inputs ?? []) if (MEDIA.has(String(i.mediaType).toLowerCase())) ins.add(String(i.mediaType).toLowerCase());
      for (const tag of t.tags ?? []) {
        const m = /^(text|image|video|audio)\s+to\s+(image|video|audio|3d)/i.exec(tag);
        if (m) ins.add(m[1].toLowerCase());
        if (/^image edit/i.test(tag)) ins.add("image");
      }
    }
    // The template's recorded outputs are the reliable signal; its tags are only a last resort,
    // because "Image to Video" on an image-upscale template says nothing about the model.
    if (!outs.size) for (const t of dedicated) for (const tag of t.tags ?? []) {
      const m = /^(?:text|image|video|audio)\s+to\s+(image|video|audio|3d)/i.exec(tag);
      if (m) outs.add(m[1].toLowerCase());
    }
    rec.output = [...outs];
    rec.input = [...ins].filter(Boolean);
  }
  rec.cloudTemplate = [...dedicated].sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0))[0] ?? null;
  // The Cloud link a page falls back to when nothing else points anywhere: its most used template.
  rec.cloudLink = rec.cloudTemplate ?? [...rec.templateList].sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0))[0] ?? null;
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

/** Titles stay short: the full form only when it fits in 65 characters. */
function modelTitle(rec) {
  const options = [`${rec.name}: where to run it (${rec.id})`, `${rec.name} (${rec.id})`, `${rec.name}: where to run it`, rec.name];
  return options.find((s) => s.length <= 65) ?? rec.name.slice(0, 62).replace(/[ ,;:]+\S*$/, "");
}

function modelPage(rec) {
  const prov = providers[rec.provider]?.title ?? rec.provider;
  const outs = rec.output.length ? rec.output : ["media"];
  const phrase = rec.output.length ? outputPhrase(rec.output) : "generation";
  const open = rec.license === "open-weights";
  const makerEcho = norm(rec.name) === norm(prov);
  const from = makerEcho ? "" : ` from ${prov}`;
  const title = modelTitle(rec);
  const ways = [rec.routerIds.length && "Comfy Router", open && "ComfyUI locally", rec.templateList.length && "Comfy Cloud"].filter(Boolean);
  // Promise only the sections this page actually has.
  const sections = [
    rec.templateList.length && "templates",
    open && rec.files?.length && "model files",
    rec.nodes.length && "nodes",
    rec.routerIds.length && "pricing",
  ].filter(Boolean);
  const description = clampDescription(
    `${rec.name} is ${article(phrase)} ${phrase} model${from}. Run it with ${list(ways.length ? ways : ["ComfyUI"])}${sections.length ? `, with ${list(sections)}` : ""}.`,
  );

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

  body += `${rec.name} is ${article(phrase)} ${phrase} model${from}${rec.input.length ? `. It takes ${list(rec.input)} as input and produces ${list(outs)}` : ""}. `;
  const servedBy = [...new Set(rec.routerPages.map((r) => r.servedBy).filter(Boolean))];
  body += rec.weights
    ? `Its weights are published: [${mdEscape(rec.weights.name)}](/${rec.weights.path}) has the model files and folders for running it locally in ComfyUI, while Comfy Router serves this hosted version.`
    : open
      ? `It has open weights, so you can download the files and run it locally in ComfyUI${rec.routerIds.length ? ", or call the hosted version through Comfy Router" : ""}.`
      // Who runs the model is not in the model's own page: quote the Router page's line instead of
      // assuming the maker's servers (Comfy hosts some models its partners publish).
      : `It has no open weights. ${servedBy.length ? `Comfy Router serves it from ${list(servedBy)}.` : ""} You use it through ${list([rec.routerIds.length && "Comfy Router", rec.templateList.length && "Partner Nodes in ComfyUI and Comfy Cloud"].filter(Boolean)) || "Comfy Router"}.`;
  body += "\n\n## Where you can run it\n\n| Where | Page | Use it when |\n| --- | --- | --- |\n";
  let destinations = 0;
  const pageLabel = (r) => (rec.routerPages.length === 1 && rec.name ? rec.name : fixInitialisms(r.title ?? r.id));
  for (const r of rec.routerPages) {
    body += `| Comfy Router (API) | [${mdEscape(pageLabel(r))} with Comfy Router](/${r.page}) | You call \`${r.id}\` from your own code with \`COMFY_API_KEY\` |\n`;
    destinations++;
  }
  for (const t of rec.tutorials.filter(runDestination)) {
    const partner = t.startsWith("tutorials/partner-nodes/");
    body += `| ${partner ? "Partner Nodes (ComfyUI and Comfy Cloud)" : open ? "ComfyUI (local or Comfy Cloud)" : "ComfyUI"} | [${mdEscape(titleOf(t))}](/${t}) | ${partner ? "You build a workflow with the hosted model" : "You follow a step-by-step workflow tutorial"} |\n`;
    destinations++;
  }
  if (rec.cloudTemplate) {
    body += `| Comfy Cloud | [Open \`${rec.cloudTemplate.name}\` on Comfy Cloud](https://cloud.comfy.org/?template=${rec.cloudTemplate.name}) | You want to run a ready-made workflow without installing anything |\n`;
    destinations++;
  }
  // A table with a header and no rows says nothing; every page gets at least one way to reach it.
  if (!destinations) {
    const t = rec.cloudLink;
    body += t
      ? `| Comfy Cloud | [Open \`${t.name}\` on Comfy Cloud](https://cloud.comfy.org/?template=${t.name}) | You want to run a ready-made workflow without installing anything |\n`
      : `| ComfyUI | No dedicated page yet | Search the docs for ${rec.name} |\n`;
  }

  if (rec.routerIds.length) {
    body += `\n## Call it with Comfy Router\n\n`;
    for (const id of rec.routerIds) {
      if (routerSchemas.get(id)?.queuedOnly) {
        body += `- \`POST https://api.comfy.org/v2/models/${id}/requests\`. Live request schema: \`GET /v2/models/${id}/openapi.json\`. The synchronous \`POST /v2/models/${id}\` answers \`403 not_enabled\` for this model, so the queue is the supported path: submit, poll the status route, then collect the result.\n`;
      } else body += `- \`POST https://api.comfy.org/v2/models/${id}\`. Live request schema: \`GET /v2/models/${id}/openapi.json\`.\n`;
    }
    if (rec.siblings?.length) body += `\nThe family's Router versions have their own pages: ${list(rec.siblings.map((s) => `[${mdEscape(s.name)}](/${s.path})`))}.\n`;
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
  let body = `${tagBlock({ Product: "router", Output: out, Count: String(rows.length) })}\n\nEvery ${phrase} model you can call through Comfy Router, with its model ID. Call any of them with \`POST https://api.comfy.org/v2/models/<model ID>\` and your \`COMFY_API_KEY\`. Models marked queued run on the queue route only: submit to \`POST https://api.comfy.org/v2/models/<model ID>/requests\` and collect the result later.\n\n| Model | Model ID | Provider | Delivery | Input | Catalog page |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const m of rows) {
    const delivery = m.routerIds.some((id) => routerSchemas.get(id)?.queuedOnly) ? "queued" : "sync";
    body += `| ${mdEscape(m.name)} | \`${m.routerIds.join("`, `")}\` | ${m.provider} | ${delivery} | ${m.input.join(", ")} | [Details](/${m.path}) |\n`;
  }
  write(`${OUT}/router/${slug(out)}`, {
    title: `Comfy Router ${phrase} models: all ${rows.length} model IDs`,
    description: clampDescription(`Every ${phrase} model on Comfy Router: model IDs, providers, delivery mode, and inputs, with links to where to run each one and its pricing.`),
  }, body);
}

// ---------- open-weights list
// A Router variant of an open-weights family reports published weights but has no files of its
// own; the family page is the one that belongs in the local list.
const openModels = allModels.filter((m) => m.license === "open-weights" && !m.weights).sort((a, b) => a.id.localeCompare(b.id));
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
  let body = `${tagBlock({ Product: prod, Updated: TODAY })}\n\n${c.title}: ${c.what}.\n\n`;
  if (c.blocks) body += c.blocks.length ? c.blocks.join("\n\n") : "No published entries yet.";
  else body += c.rows.length ? `Last ${CHANGE_DAYS} days:\n\n${c.header}\n${c.rows.slice(0, 80).join("\n")}${c.rows.length > 80 ? `\n\n${c.rows.length - 80} older entries are not shown.` : ""}` : `No changes in the last ${CHANGE_DAYS} days.`;
  write(`${OUT}/changes/${prod}`, {
    title: `${c.title}: recent changes`,
    description: clampDescription(`Recent changes in ${c.title}: ${c.what.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`/g, "")}.`),
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
${Object.keys(changes).map((p) => `| [/catalog/changes/${p}](/catalog/changes/${p}) | Recent changes in ${changes[p].title} |`).join("\n")}

Model IDs are Comfy Router IDs (\`provider/model\`), such as \`kling/kling-v3\`. Open-weights models without a Router version use \`<provider>/<model>\`, such as \`bfl/flux-2-dev\`. Provider IDs match Comfy's partner catalog.

Router models are called with \`POST https://api.comfy.org/v2/models/<model ID>\`, except the ones marked queued: their synchronous route answers \`403 not_enabled\`, so they run on \`POST https://api.comfy.org/v2/models/<model ID>/requests\` and the result is collected later. The [Router pages by output](/catalog/router/video) carry a Delivery column, and each model page shows its own route.

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
