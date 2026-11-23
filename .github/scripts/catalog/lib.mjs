/**
 * Shared loaders for the catalog scripts (check-aliases.mjs, gen-catalog.mjs).
 *
 * Providers come from two files:
 *   catalog-src/cloud-providers.json  snapshot of cloud's curated partner catalog (source of truth)
 *   catalog-src/providers.json        docs-only aliases and open-weights makers on top of it
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "../../..");
export const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
export const readText = (p) => readFileSync(join(root, p), "utf8");
export const dirs = (p) =>
  existsSync(join(root, p)) ? readdirSync(join(root, p)).filter((d) => statSync(join(root, p, d)).isDirectory()) : [];
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Merged provider table: id -> { title, names[], source: "cloud" | "docs" } plus a name lookup. */
export function loadProviders() {
  const cloud = readJson("catalog-src/cloud-providers.json");
  const overlay = readJson("catalog-src/providers.json");
  const providers = {};
  for (const [id, p] of Object.entries(cloud.providers)) {
    providers[id] = { title: p.title, names: [id, p.title, ...p.api_names, ...p.node_categories], source: "cloud" };
  }
  for (const [id, p] of Object.entries(overlay.docs_only ?? {})) {
    providers[id] = { title: p.title, names: [id, p.title, ...(p.aliases ?? [])], source: "docs" };
  }
  const warnings = [];
  for (const [id, aliases] of Object.entries(overlay.aliases ?? {})) {
    if (!providers[id]) warnings.push(`providers.json aliases "${id}", which is not a cloud provider ID`);
    else providers[id].names.push(...aliases);
  }
  const lookup = new Map();
  for (const [id, p] of Object.entries(providers)) {
    for (const n of p.names) {
      const k = norm(n);
      if (lookup.has(k) && lookup.get(k) !== id) warnings.push(`"${n}" maps to both ${lookup.get(k)} and ${id}`);
      else lookup.set(k, id);
    }
  }
  const ignore = new Set((overlay.not_providers?.names ?? []).map(norm));
  return { providers, lookup, ignore, warnings, cloudMeta: cloud._meta };
}

/** Every Router model page: folder, API ID, title, input/output, provider line. */
export function loadRouterPages() {
  const base = "development/comfy-router/models";
  const pages = [];
  for (const prov of dirs(base)) {
    for (const model of dirs(join(base, prov))) {
      const rel = join(base, prov, model, "code.mdx");
      if (!existsSync(join(root, rel))) continue;
      const text = readText(rel);
      const id = /POST https:\/\/api\.comfy\.org\/v2\/models\/([^\s/`]+\/[^\s/`]+)/.exec(text)?.[1];
      const title = /^title:\s*"?Use (.+?) with Comfy Router"?\s*$/m.exec(text)?.[1];
      const io = /\*\*Input:\*\*\s*([^·\n]+?)\s*·\s*\*\*Output:\*\*\s*([^\n]+)/.exec(text);
      const servedBy = /served by Comfy Router from ([^.\n]+)\./.exec(text)?.[1]?.trim();
      const split = (s) => (s ?? "").split(/[,+]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      pages.push({
        folder: `${prov}/${model}`,
        page: `${base}/${prov}/${model}/code`,
        id,
        title,
        input: split(io?.[1]),
        output: split(io?.[2]),
        servedBy,
      });
    }
  }
  return pages;
}

/**
 * Router model schemas from router-schemas/<provider>/<model>.json, keyed by model ID.
 * Delivery mode is read from the synchronous route's own summary, so a model that only
 * runs on the queue is detected from the schema rather than from a list of IDs.
 */
export function loadRouterSchemas() {
  const base = "router-schemas";
  const schemas = new Map();
  for (const prov of dirs(base)) {
    for (const f of readdirSync(join(root, base, prov)).filter((x) => x.endsWith(".json"))) {
      let j;
      try {
        j = JSON.parse(readFileSync(join(root, base, prov, f), "utf8"));
      } catch {
        continue;
      }
      const id = j["x-comfy-router-model-id"] ?? `${prov}/${f.replace(/\.json$/, "")}`;
      const summary = j.paths?.[`/v2/models/${id}`]?.post?.summary ?? j.paths?.[`/v2/models/${id}/requests`]?.post?.summary ?? "";
      const modalities = (key) => [...new Set((j[key] ?? []).map((m) => String(m).toLowerCase()))];
      schemas.set(id, {
        queuedOnly: /queued-only|403\s+not_enabled/i.test(summary),
        aliasOf: j["x-comfy-router-alias-of"] ?? null,
        altProviders: (j["x-comfy-router-alt-providers"] ?? []).map((a) => a.model_id ?? a.provider).filter(Boolean),
        // Ground truth for a Router page that documents several models behind one page and so has no single Input/Output line.
        input: modalities("x-comfy-router-input-modalities"),
        output: modalities("x-comfy-router-output-modalities"),
      });
    }
  }
  return schemas;
}

/** English page paths from docs.json (only strings inside "pages" arrays). */
export function loadEnglishPages() {
  const docs = readJson("docs.json");
  const pages = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (k === "pages" && Array.isArray(v)) v.forEach((x) => (typeof x === "string" ? pages.push(x) : walk(x)));
        else if (typeof v === "object") walk(v);
      }
    }
  };
  walk(docs.navigation.languages.find((l) => l.language === "en"));
  return [...new Set(pages)].filter((p) => !/^https?:/.test(p) && /^[a-z]/.test(p));
}

/** product for a page path, using catalog-src/products.json rules. null = excluded, undefined = no rule. */
export function productMatcher() {
  const { products, rules } = readJson("catalog-src/products.json");
  const productOf = (p) => {
    for (const [prefix, prod] of rules) if (prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix) return prod;
    return undefined;
  };
  return { products, rules, productOf };
}

/** workflow_templates index and per-template model files, or null when the checkout is missing. */
export function loadTemplates(dir) {
  if (!existsSync(join(dir, "templates/index.json"))) return null;
  const index = JSON.parse(readFileSync(join(dir, "templates/index.json"), "utf8"));
  const byName = new Map();
  for (const cat of index) for (const t of cat.templates) byName.set(t.name, { ...t, category: cat.category ?? cat.title });
  const files = new Map(); // template name -> [{name, url, directory}]
  for (const f of readdirSync(join(dir, "templates")).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    let j;
    try {
      j = JSON.parse(readFileSync(join(dir, "templates", f), "utf8"));
    } catch {
      continue;
    }
    const found = [];
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o.models)) for (const m of o.models) if (m?.name && m?.directory) found.push({ name: m.name, url: m.url, directory: m.directory });
      for (const v of Object.values(o)) walk(v);
    };
    walk(j);
    files.set(f.replace(/\.json$/, ""), found);
  }
  return { index, byName, files };
}
