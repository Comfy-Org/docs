/**
 * Sync Mintlify navigation in docs.json from the English tree.
 *
 * Mirrors EN tab structure and page paths for each configured language,
 * prefixing paths with the language directory (e.g. ko/installation/foo).
 * Preserves localized tab/group labels, OpenAPI operation rows, and pages that
 * only exist in a locale; only the EN structure is mirrored.
 * Nav label translation is opt-in (translateLabels: true); default is path-only sync.
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { REPO_ROOT, loadI18nConfig } from "./i18n-config.mjs";
import {
  translateNavLabels,
  collectAllNavLabelsFromEn,
  lookupNavLabel,
  shouldPreserveNavLabel,
} from "./nav-label-translate.mjs";

/**
 * Walk EN + synced nav in parallel; collect en label → existing locale title.
 * @param {object} enEntry
 * @param {object} syncedEntry
 * @returns {Map<string, string>}
 */
export function collectExistingNavLabelMap(enEntry, syncedEntry) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const enTabs = enEntry.tabs ?? [];
  const syncedTabs = syncedEntry.tabs ?? [];
  for (let i = 0; i < enTabs.length; i++) {
    collectExistingTabLabels(enTabs[i], syncedTabs[i], map);
  }
  return map;
}

/** @param {object | undefined} enTab @param {object | undefined} syncedTab @param {Map<string, string>} map */
function collectExistingTabLabels(enTab, syncedTab, map) {
  if (!enTab || !syncedTab) return;
  if (enTab.tab && syncedTab.tab) map.set(enTab.tab, syncedTab.tab);
  if (enTab.pages && syncedTab.pages) {
    collectExistingPageLabels(enTab.pages, syncedTab.pages, map);
  }
}

/** @param {unknown[]} enPages @param {unknown[]} syncedPages @param {Map<string, string>} map */
function collectExistingPageLabels(enPages, syncedPages, map) {
  if (!Array.isArray(enPages) || !Array.isArray(syncedPages)) return;
  for (let i = 0; i < enPages.length; i++) {
    const en = enPages[i];
    const synced = syncedPages[i];
    if (typeof en === "string" || typeof synced === "string") continue;
    if (en?.group && synced?.group) map.set(en.group, synced.group);
    if (en?.pages && synced?.pages) {
      collectExistingPageLabels(en.pages, synced.pages, map);
    }
  }
}

/** @param {Map<string, string>} existingMap @param {string} enLabel */
function isAlreadyLocalized(existingMap, enLabel) {
  const existing = existingMap.get(enLabel);
  return Boolean(existing && existing !== enLabel);
}

export const DOCS_JSON_PATH = join(REPO_ROOT, "docs.json");

/**
 * API operation rows (for example "GET /users") are sidebar entries rendered from an
 * OpenAPI spec, not page paths. They must never be resolved against disk or pruned
 * when no matching file exists.
 * @param {unknown} value
 */
export function isApiOperationRow(value) {
  return (
    typeof value === "string" &&
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+\//.test(value)
  );
}

/**
 * Resolve a nav page path to the on-disk path (case-correct). Returns null if missing.
 * @param {string} pagePath
 */
export function resolvePagePathOnDisk(pagePath) {
  const parts = pagePath.split("/");
  let dir = REPO_ROOT;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const isLast = i === parts.length - 1;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    const want = isLast ? `${seg}.mdx` : seg;
    const match = entries.find((e) => e.toLowerCase() === want.toLowerCase());
    if (!match) return null;
    if (isLast) {
      return join(...parts.slice(0, -1), match.replace(/\.mdx$/i, ""))
        .replace(/\\/g, "/")
        .replace(/^\.\//, "");
    }
    dir = join(dir, match);
  }
  return pagePath;
}

/**
 * Fix page path casing and optionally drop paths with no MDX on disk.
 * Removes groups that become empty after pruning.
 * @param {unknown} nodes
 * @param {{ pruneMissing?: boolean }} [options]
 */
export function normalizeNavTree(nodes, options = {}) {
  const { pruneMissing = false } = options;
  if (!Array.isArray(nodes)) return [];

  /** @type {unknown[]} */
  const out = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      if (isApiOperationRow(node)) {
        out.push(node);
        continue;
      }
      const resolved = resolvePagePathOnDisk(node);
      if (!resolved) {
        if (!pruneMissing) out.push(node);
        continue;
      }
      out.push(resolved);
      continue;
    }
    if (node && typeof node === "object" && Array.isArray(node.pages)) {
      const pages = normalizeNavTree(node.pages, options);
      if (pages.length === 0 && pruneMissing && node.openapi == null) continue;
      out.push({ ...node, pages });
      continue;
    }
    // OpenAPI-only groups have `openapi` and no `pages`; dropping them
    // removes the API reference from the sidebar.
    if (node && typeof node === "object" && node.openapi != null) {
      out.push(node);
    }
  }
  return out;
}

/** @param {string} path @param {string[]} langDirs */
export function hasLangDirPrefix(path, langDirs) {
  return langDirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

/** @param {string} path @param {string[]} langDirs */
export function toEnRelativePath(path, langDirs) {
  for (const dir of [...langDirs].sort((a, b) => b.length - a.length)) {
    if (path === dir) return "index";
    if (path.startsWith(`${dir}/`)) return path.slice(dir.length + 1);
  }
  return path;
}

/** @param {string} path @param {string} langDir @param {string[]} langDirs */
export function localizePagePath(path, langDir, langDirs) {
  if (hasLangDirPrefix(path, langDirs)) return path;
  return `${langDir}/${path}`;
}

/**
 * @param {unknown} nodes
 * @param {string} langDir
 * @param {string[]} langDirs
 */
export function localizeNavTree(nodes, langDir, langDirs) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    if (typeof node === "string") {
      return isApiOperationRow(node) ? node : localizePagePath(node, langDir, langDirs);
    }
    if (node && typeof node === "object") {
      const next = { ...node };
      if (node.openapi != null) {
        next.openapi = localizeOpenApi(node.openapi, langDir);
      }
      if (Array.isArray(node.pages)) {
        next.pages = localizeNavTree(node.pages, langDir, langDirs);
      }
      return next;
    }
    return node;
  });
}

/** @param {unknown} nodes @param {string[]} langDirs */
export function collectPagePaths(nodes, langDirs) {
  /** @type {string[]} */
  const paths = [];
  if (!Array.isArray(nodes)) return paths;
  for (const node of nodes) {
    if (typeof node === "string") {
      paths.push(node);
    } else if (node && typeof node === "object" && Array.isArray(node.pages)) {
      paths.push(...collectPagePaths(node.pages, langDirs));
    }
  }
  return paths;
}

/** @param {unknown} nodes @param {string[]} langDirs */
function structuralSignature(nodes, langDirs) {
  return collectPagePaths(nodes, langDirs)
    .map((p) => toEnRelativePath(p, langDirs))
    .sort()
    .join("\0");
}

/**
 * @param {unknown[]} existingPages
 * @param {string} signature
 * @param {string[]} langDirs
 */
function findGroupBySignature(existingPages, signature, langDirs) {
  if (!Array.isArray(existingPages)) return null;
  for (const node of existingPages) {
    if (typeof node === "string" || !node?.pages) continue;
    if (structuralSignature(node.pages, langDirs) === signature) return node;
  }
  return null;
}

/** @param {object} newChild @param {object} existingNode @param {string[]} langDirs */
function pathOverlapScore(newChild, existingNode, langDirs) {
  const pathsA = new Set(
    collectPagePaths(newChild.pages, langDirs).map((p) => toEnRelativePath(p, langDirs))
  );
  const pathsB = new Set(
    collectPagePaths(existingNode.pages, langDirs).map((p) =>
      toEnRelativePath(p, langDirs)
    )
  );
  if (pathsB.size === 0) return 0;
  const intersection = [...pathsB].filter((p) => pathsA.has(p)).length;
  return intersection / pathsB.size;
}

/**
 * @param {unknown[]} existingPages
 * @param {object} newChild
 * @param {string[]} langDirs
 */
function findGroupMatch(existingPages, newChild, langDirs) {
  const signature = structuralSignature(newChild.pages, langDirs);
  const exact = findGroupBySignature(existingPages, signature, langDirs);
  if (exact) return exact;

  if (!Array.isArray(existingPages)) return null;
  let best = null;
  let bestScore = 0.35;
  for (const node of existingPages) {
    if (typeof node === "string" || !node?.pages) continue;
    const score = pathOverlapScore(newChild, node, langDirs);
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

/** @param {unknown} openapi @returns {string | null} */
export function openApiSourceKey(openapi) {
  if (typeof openapi === "string") return openapi;
  if (openapi && typeof openapi === "object" && typeof openapi.source === "string") {
    return openapi.source;
  }
  return null;
}

/**
 * @param {unknown[]} existingPages
 * @param {object} newChild
 */
function findOpenApiMatch(existingPages, newChild) {
  const source = openApiSourceKey(newChild?.openapi);
  if (!source || !Array.isArray(existingPages)) return null;
  return (
    existingPages.find(
      (node) =>
        node && typeof node === "object" && openApiSourceKey(node.openapi) === source
    ) ?? null
  );
}

/**
 * EN-relative page path -> locale label of the group that contains it, built from the
 * existing localized tree. Keeps localized labels when the EN tree is restructured and
 * findGroupMatch() can no longer line the old and new nodes up.
 * @param {unknown[]} nodes
 * @param {string[]} langDirs
 */
function buildLocaleLabelIndex(nodes, langDirs) {
  /** @type {Map<string, string>} */
  const index = new Map();
  /**
   * @param {unknown[]} list
   * @param {string | null} inherited
   */
  const walk = (list, inherited) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      if (typeof node === "string") {
        if (inherited) index.set(toEnRelativePath(node, langDirs), inherited);
        continue;
      }
      if (node && typeof node === "object") {
        const sourceKey = openApiSourceKey(node.openapi);
        if (sourceKey && node.group) {
          index.set(`openapi:${sourceKey}`, node.group);
        }
        if (Array.isArray(node.pages)) {
          walk(node.pages, node.group ?? inherited);
        }
      }
    }
  };
  walk(nodes, null);
  return index;
}

/**
 * Most common locale label among the pages of an EN group. Labels already used by an
 * ancestor group are skipped, so a new EN subgroup does not inherit the parent's label.
 * @param {unknown[]} pages
 * @param {Map<string, string>} labelIndex
 * @param {string[]} langDirs
 * @param {Set<string>} [claimed]
 */
function labelFromIndex(pages, labelIndex, langDirs, claimed = new Set()) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const path of collectPagePaths(pages, langDirs)) {
    const label = labelIndex.get(toEnRelativePath(path, langDirs));
    if (label && !claimed.has(label)) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

export function mergeNavPages(
  newPages,
  existingPages,
  langDirs,
  labelIndex = new Map(),
  claimed = new Set()
) {
  if (!Array.isArray(newPages)) return [];
  return newPages.map((newChild) => {
    if (typeof newChild === "string") return newChild;
    if (newChild?.openapi != null && !Array.isArray(newChild.pages)) {
      const match = findOpenApiMatch(existingPages, newChild);
      if (!match) return newChild;
      const merged = { ...newChild };
      if (match.group) merged.group = match.group;
      if (match.icon) merged.icon = match.icon;
      return merged;
    }
    if (!newChild?.pages) return newChild;

    const match = findGroupMatch(existingPages, newChild, langDirs);
    const merged = { ...newChild };
    const sourceKey = openApiSourceKey(newChild.openapi);
    const localizedLabel =
      match?.group ??
      (sourceKey ? labelIndex.get(`openapi:${sourceKey}`) : undefined) ??
      labelFromIndex(newChild.pages, labelIndex, langDirs, claimed);
    const descendantClaims = new Set(claimed);
    if (localizedLabel) {
      merged.group = localizedLabel;
      descendantClaims.add(localizedLabel);
    }
    if (match?.icon) merged.icon = match.icon;
    merged.pages = mergeNavPages(
      newChild.pages,
      match?.pages ?? [],
      langDirs,
      labelIndex,
      descendantClaims
    );
    return merged;
  });
}

/**
 * Prefer an already-localized sidebar label over EN or API output.
 * @param {string | undefined} syncedLabel
 * @param {string | undefined} enLabel
 * @param {Map<string, string>} labelMap
 */
function resolveNavLabel(syncedLabel, enLabel, labelMap) {
  if (!enLabel) return syncedLabel ?? enLabel;
  if (syncedLabel && syncedLabel !== enLabel) return syncedLabel;
  return lookupNavLabel(enLabel, labelMap);
}

/**
 * Apply a full English → locale label map by walking the EN tree in parallel.
 * Never overwrites labels that already differ from English (manual or prior translations).
 * @param {unknown[]} syncedPages
 * @param {unknown[]} enPages
 * @param {Map<string, string>} labelMap
 */
function applyLabelMapToPages(syncedPages, enPages, labelMap) {
  if (!Array.isArray(syncedPages) || !Array.isArray(enPages)) return syncedPages;
  return syncedPages.map((synced, i) => {
    if (typeof synced === "string") return synced;
    const en = enPages[i];
    const next = { ...synced };
    if (en?.group) next.group = resolveNavLabel(synced.group, en.group, labelMap);
    if (synced.pages && en?.pages) {
      next.pages = applyLabelMapToPages(synced.pages, en.pages, labelMap);
    }
    return next;
  });
}

/** @param {object} syncedTab @param {object | undefined} enTab @param {Map<string, string>} labelMap */
function applyLabelMapToTab(syncedTab, enTab, labelMap) {
  if (!enTab) return syncedTab;
  if (enTab.openapi != null) return syncedTab;
  const next = { ...syncedTab };
  if (enTab.tab) next.tab = resolveNavLabel(syncedTab.tab, enTab.tab, labelMap);
  if (syncedTab.pages && enTab.pages) {
    next.pages = applyLabelMapToPages(syncedTab.pages, enTab.pages, labelMap);
  }
  return next;
}

/** @param {object} syncedEntry @param {object} enEntry @param {Map<string, string>} labelMap */
function applyLabelMapToEntry(syncedEntry, enEntry, labelMap) {
  const enTabs = enEntry.tabs ?? [];
  const syncedTabs = syncedEntry.tabs ?? [];
  return {
    ...syncedEntry,
    tabs: syncedTabs.map((syncedTab, i) =>
      applyLabelMapToTab(syncedTab, enTabs[i], labelMap)
    ),
  };
}

/** @param {unknown} openapi @param {string} langDir */
export function localizeOpenApi(openapi, langDir) {
  if (typeof openapi === "string") return openapi;
  if (openapi && typeof openapi === "object" && typeof openapi.directory === "string") {
    const directory = openapi.directory.startsWith(`${langDir}/`)
      ? openapi.directory
      : `${langDir}/${openapi.directory}`;
    return { ...openapi, directory };
  }
  return openapi;
}

/** @param {unknown} tabs @param {string[]} langDirs */
function collectTabPagePaths(tabs, langDirs) {
  /** @type {string[]} */
  const paths = [];
  if (!Array.isArray(tabs)) return paths;
  for (const tab of tabs) {
    if (tab?.pages) paths.push(...collectPagePaths(tab.pages, langDirs));
  }
  return paths;
}

/**
 * @param {object} enTab
 * @param {object | undefined} existingTab
 * @param {{ dir: string }} lang
 * @param {string[]} langDirs
 */
export function syncTab(enTab, existingTab, lang, langDirs) {
  if (enTab.openapi != null) {
    /** @type {Record<string, unknown>} */
    const synced = {
      tab: existingTab?.tab ?? enTab.tab,
      openapi: localizeOpenApi(enTab.openapi, lang.dir),
    };
    // EN lists the operations the spec renders as sidebar entries (for example
    // "GET /users"). Carry them over, otherwise localized API references lose
    // their operation list.
    if (Array.isArray(enTab.pages) && enTab.pages.length > 0) {
      synced.pages = normalizeNavTree(enTab.pages, { pruneMissing: false });
    }
    return synced;
  }

  const localizedPages = localizeNavTree(enTab.pages ?? [], lang.dir, langDirs);
  const labelIndex = buildLocaleLabelIndex(existingTab?.pages ?? [], langDirs);
  const mergedPages = mergeNavPages(
    localizedPages,
    existingTab?.pages ?? [],
    langDirs,
    labelIndex
  );
  const normalizedPages = normalizeNavTree(mergedPages, {
    pruneMissing: lang.code !== "en",
  });

  return {
    tab: existingTab?.tab ?? enTab.tab,
    pages: normalizedPages,
  };
}

/**
 * @param {object} enEntry
 * @param {object | null} langEntry
 * @param {{ code: string, dir: string }} lang
 * @param {string[]} langDirs
 */
export function syncLanguageEntry(enEntry, langEntry, lang, langDirs, onLocaleOnlyPages) {
  const syncedTabs = (enEntry.tabs ?? []).map((enTab, i) =>
    syncTab(enTab, langEntry?.tabs?.[i], lang, langDirs)
  );

  // Pages that exist only in this locale (their English source was removed) keep their
  // nav row: dropping it silently makes a published translation unreachable.
  const enPaths = new Set(
    collectTabPagePaths(enEntry.tabs ?? [], langDirs).map((p) =>
      toEnRelativePath(p, langDirs)
    )
  );
  /** @type {string[]} */
  const localeOnlyPages = [];
  syncedTabs.forEach((tab, i) => {
    const syncedPaths = new Set(
      collectPagePaths(tab.pages ?? [], langDirs).map((p) =>
        toEnRelativePath(p, langDirs)
      )
    );
    const extra = collectPagePaths(langEntry?.tabs?.[i]?.pages ?? [], langDirs).filter(
      (path) =>
        !enPaths.has(toEnRelativePath(path, langDirs)) &&
        !syncedPaths.has(toEnRelativePath(path, langDirs)) &&
        resolvePagePathOnDisk(path)
    );
    if (extra.length > 0) {
      syncedTabs[i] = { ...tab, pages: [...(tab.pages ?? []), ...extra] };
      localeOnlyPages.push(...extra);
    }
  });
  if (localeOnlyPages.length > 0 && typeof onLocaleOnlyPages === "function") {
    onLocaleOnlyPages(localeOnlyPages);
  }

  return {
    ...(langEntry ?? {}),
    language: lang.code,
    tabs: syncedTabs,
  };
}

/**
 * @param {object} enEntry
 * @param {object} syncedEntry
 * @param {{ name: string }} lang
 * @param {{ dryRun?: boolean, translateLabels?: boolean }} options
 */
async function translateNavLabelsForEntry(enEntry, syncedEntry, lang, options) {
  const translateLabels = options.translateLabels === true;
  const allLabels = collectAllNavLabelsFromEn(enEntry);
  const existingMap = collectExistingNavLabelMap(enEntry, syncedEntry);
  const kept = allLabels.filter(
    (l) => shouldPreserveNavLabel(l) || isAlreadyLocalized(existingMap, l)
  );
  const needsTranslation = allLabels.filter(
    (l) => !shouldPreserveNavLabel(l) && !isAlreadyLocalized(existingMap, l)
  );

  // Default: path-only sync — mergeNavPages/syncTab already kept existing tab/group titles.
  if (!translateLabels) {
    return {
      entry: syncedEntry,
      translatedLabels: [],
      pendingLabels: needsTranslation.length > 0 ? needsTranslation : undefined,
      keptLabels: kept.length,
    };
  }

  if (needsTranslation.length === 0) {
    return {
      entry: syncedEntry,
      translatedLabels: [],
      keptLabels: kept.length,
    };
  }

  if (options.dryRun) {
    return {
      entry: syncedEntry,
      translatedLabels: needsTranslation,
      keptLabels: kept.length,
      pendingOnly: true,
    };
  }

  console.log(
    `[${lang.code}] Nav labels: ${kept.length} kept, ${needsTranslation.length} to translate` +
      (kept.length > 0 ? ` (${kept.length} existing as reference)` : "")
  );

  const labelMap = await translateNavLabels(needsTranslation, lang, {
    existingMap,
    onBatch: ({ batch, total, count }) => {
      if (total > 1) {
        console.log(`  [${lang.code}] Nav labels batch ${batch}/${total} (${count} labels)`);
      }
    },
  });

  for (const l of allLabels) {
    if (!labelMap.has(l)) {
      labelMap.set(l, lookupNavLabel(l, existingMap));
    }
  }

  return {
    entry: applyLabelMapToEntry(syncedEntry, enEntry, labelMap),
    translatedLabels: needsTranslation.map((l) => `${l} → ${labelMap.get(l)}`),
    keptLabels: kept.length,
  };
}

/**
 * @param {object} docsJson
 * @param {Array<{ code: string, dir: string }>} languages
 * @param {{ selectedCodes?: string[] }} [options]
 */
export async function syncDocsJsonNavigation(docsJson, languages, options = {}) {
  const selectedCodes = options.selectedCodes ?? languages.map((l) => l.code);
  const langDirs = languages.map((l) => l.dir);
  const nav = docsJson.navigation;
  if (!nav?.languages) {
    throw new Error("docs.json missing navigation.languages");
  }

  const enEntry = nav.languages.find((l) => l.language === "en");
  if (!enEntry) {
    throw new Error("docs.json missing English (en) navigation entry");
  }

  // Fix EN path casing to match on-disk MDX filenames (case-sensitive hosts / Mintlify).
  const normalizedEnTabs = (enEntry.tabs ?? []).map((tab) => {
    if (tab?.openapi != null || !tab?.pages) return tab;
    return { ...tab, pages: normalizeNavTree(tab.pages, { pruneMissing: false }) };
  });
  if (JSON.stringify(normalizedEnTabs) !== JSON.stringify(enEntry.tabs)) {
    enEntry.tabs = normalizedEnTabs;
  }

  /** @type {Array<{ lang: string, added: string[], removed: string[], translatedLabels: string[], localeOnlyPages?: string[], pendingLabels?: string[] }>} */
  const changes = [];

  for (const lang of languages) {
    if (!selectedCodes.includes(lang.code)) continue;

    const idx = nav.languages.findIndex((l) => l.language === lang.code);
    const existing = idx >= 0 ? nav.languages[idx] : null;
    /** @type {string[]} */
    const localeOnlyPages = [];
    let synced = syncLanguageEntry(enEntry, existing, lang, langDirs, (pages) =>
      localeOnlyPages.push(...pages)
    );

    /** @type {{ entry: object, translatedLabels: string[], pendingOnly?: boolean }} */
    let labelResult;
    try {
      labelResult = await translateNavLabelsForEntry(enEntry, synced, lang, {
        dryRun: options.dryRun,
        translateLabels: options.translateLabels,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${lang.code}] Nav label translation skipped: ${msg}`);
      labelResult = { entry: synced, translatedLabels: [] };
    }
    synced = labelResult.entry;

    const oldPaths = new Set(
      collectTabPagePaths(existing?.tabs, langDirs).map((p) =>
        toEnRelativePath(p, langDirs)
      )
    );
    const newPaths = new Set(
      collectTabPagePaths(synced.tabs, langDirs).map((p) =>
        toEnRelativePath(p, langDirs)
      )
    );

    const added = [...newPaths].filter((p) => !oldPaths.has(p)).sort();
    const removed = [...oldPaths].filter((p) => !newPaths.has(p)).sort();
    const structureChanged = JSON.stringify(existing?.tabs) !== JSON.stringify(synced.tabs);
    const labelsChanged =
      options.translateLabels === true &&
      labelResult.translatedLabels.length > 0 &&
      !labelResult.pendingOnly;

    if (structureChanged || labelsChanged) {
      changes.push({
        lang: lang.code,
        added,
        removed,
        translatedLabels: labelResult.translatedLabels,
        localeOnlyPages,
        pendingLabels: labelResult.pendingOnly
          ? labelResult.translatedLabels
          : labelResult.pendingLabels,
      });
      if (idx >= 0) {
        nav.languages[idx] = synced;
      } else {
        nav.languages.push(synced);
      }
    }
  }

  return { docsJson, changes };
}

/**
 * @param {{ selectedCodes?: string[], dryRun?: boolean, docsJsonPath?: string }} [options]
 */
export async function syncDocsJsonFile(options = {}) {
  const config = loadI18nConfig();
  const docsJsonPath = options.docsJsonPath ?? DOCS_JSON_PATH;
  const docsJson = JSON.parse(readFileSync(docsJsonPath, "utf-8"));
  const { changes } = await syncDocsJsonNavigation(docsJson, config.languages, {
    selectedCodes: options.selectedCodes,
    dryRun: options.dryRun,
    translateLabels: options.translateLabels,
  });

  if (changes.length === 0) {
    return { changed: false, changes, docsJsonPath };
  }

  if (!options.dryRun) {
    writeFileSync(docsJsonPath, `${JSON.stringify(docsJson, null, 2)}\n`, "utf-8");
  }

  return { changed: true, changes, docsJsonPath };
}

/**
 * @param {Array<{ lang: string, added: string[], removed: string[] }>} changes
 */
export function formatNavSyncReport(changes) {
  if (changes.length === 0) {
    return "docs.json navigation: already in sync with English structure.";
  }

  const lines = ["docs.json navigation updates:"];
  for (const { lang, added, removed, translatedLabels, localeOnlyPages, pendingLabels } of changes) {
    lines.push(`  [${lang}] +${added.length} / -${removed.length} page path(s)`);
    for (const path of added.slice(0, 12)) {
      lines.push(`    + ${path}`);
    }
    if (added.length > 12) lines.push(`    ... +${added.length - 12} more`);
    for (const path of removed.slice(0, 8)) {
      lines.push(`    - ${path}`);
    }
    if (removed.length > 8) lines.push(`    ... -${removed.length - 8} more`);
    if (localeOnlyPages?.length) {
      lines.push(
        `    kept ${localeOnlyPages.length} page(s) that exist only in ${lang} (no English source):`
      );
      for (const path of localeOnlyPages.slice(0, 8)) {
        lines.push(`      · ${path}`);
      }
      if (localeOnlyPages.length > 8) {
        lines.push(`      ... +${localeOnlyPages.length - 8} more`);
      }
    }
    if (pendingLabels?.length) {
      lines.push(
        `    nav labels still English (${pendingLabels.length} total, not auto-translated):`
      );
      for (const label of pendingLabels.slice(0, 8)) {
        lines.push(`      · ${label}`);
      }
      if (pendingLabels.length > 8) {
        lines.push(`      ... +${pendingLabels.length - 8} more`);
      }
    } else if (translatedLabels?.length) {
      lines.push(`    nav labels translated (${translatedLabels.length} new):`);
      for (const label of translatedLabels.slice(0, 8)) {
        lines.push(`      · ${label}`);
      }
      if (translatedLabels.length > 8) {
        lines.push(`      ... +${translatedLabels.length - 8} more`);
      }
    }
  }
  return lines.join("\n");
}
