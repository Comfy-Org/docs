/**
 * Sync Mintlify navigation in docs.json from the English tree.
 *
 * Mirrors EN tab structure and page paths for each configured language,
 * prefixing paths with the language directory (e.g. ko/installation/foo).
 * Preserves localized tab/group labels when subtrees overlap; translates
 * remaining English labels via the translation API.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { REPO_ROOT, loadI18nConfig } from "./i18n-config.mjs";
import {
  translateNavLabels,
  collectAllNavLabelsFromEn,
  lookupNavLabel,
  shouldPreserveNavLabel,
} from "./nav-label-translate.mjs";

export const DOCS_JSON_PATH = join(REPO_ROOT, "docs.json");

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
      return localizePagePath(node, langDir, langDirs);
    }
    if (node && typeof node === "object" && Array.isArray(node.pages)) {
      return {
        ...node,
        pages: localizeNavTree(node.pages, langDir, langDirs),
      };
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

/**
 * @param {unknown[]} newPages
 * @param {unknown[]} existingPages
 * @param {string[]} langDirs
 */
export function mergeNavPages(newPages, existingPages, langDirs) {
  if (!Array.isArray(newPages)) return [];
  return newPages.map((newChild) => {
    if (typeof newChild === "string") return newChild;
    if (!newChild?.pages) return newChild;

    const match = findGroupMatch(existingPages, newChild, langDirs);
    const merged = { ...newChild };
    if (match?.group) merged.group = match.group;
    if (match?.icon) merged.icon = match.icon;
    merged.pages = mergeNavPages(newChild.pages, match?.pages ?? [], langDirs);
    return merged;
  });
}

/**
 * Apply a full English → locale label map by walking the EN tree in parallel.
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
    if (en?.group) next.group = lookupNavLabel(en.group, labelMap);
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
  if (enTab.tab) next.tab = lookupNavLabel(enTab.tab, labelMap);
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
    return {
      tab: existingTab?.tab ?? enTab.tab,
      openapi: localizeOpenApi(enTab.openapi, lang.dir),
    };
  }

  const localizedPages = localizeNavTree(enTab.pages ?? [], lang.dir, langDirs);
  const mergedPages = mergeNavPages(
    localizedPages,
    existingTab?.pages ?? [],
    langDirs
  );

  return {
    tab: existingTab?.tab ?? enTab.tab,
    pages: mergedPages,
  };
}

/**
 * @param {object} enEntry
 * @param {object | null} langEntry
 * @param {{ code: string, dir: string }} lang
 * @param {string[]} langDirs
 */
export function syncLanguageEntry(enEntry, langEntry, lang, langDirs) {
  const syncedTabs = (enEntry.tabs ?? []).map((enTab, i) =>
    syncTab(enTab, langEntry?.tabs?.[i], lang, langDirs)
  );

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
  const allLabels = collectAllNavLabelsFromEn(enEntry);
  const toTranslate = allLabels.filter((l) => !shouldPreserveNavLabel(l));

  if (toTranslate.length === 0) {
    return { entry: syncedEntry, translatedLabels: [] };
  }

  if (options.dryRun || options.translateLabels === false) {
    return {
      entry: syncedEntry,
      translatedLabels: toTranslate,
      pendingOnly: true,
    };
  }

  console.log(
    `[${lang.code}] Translating ${toTranslate.length} nav label(s) in batch...`
  );

  const labelMap = await translateNavLabels(allLabels, lang, {
    onBatch: ({ batch, total, count }) => {
      if (total > 1) {
        console.log(`  [${lang.code}] Nav labels batch ${batch}/${total} (${count} labels)`);
      }
    },
  });

  return {
    entry: applyLabelMapToEntry(syncedEntry, enEntry, labelMap),
    translatedLabels: toTranslate.map((l) => `${l} → ${labelMap.get(l)}`),
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

  /** @type {Array<{ lang: string, added: string[], removed: string[], translatedLabels: string[], pendingLabels?: string[] }>} */
  const changes = [];

  for (const lang of languages) {
    if (!selectedCodes.includes(lang.code)) continue;

    const idx = nav.languages.findIndex((l) => l.language === lang.code);
    const existing = idx >= 0 ? nav.languages[idx] : null;
    let synced = syncLanguageEntry(enEntry, existing, lang, langDirs);

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
      labelResult.translatedLabels.length > 0 && !labelResult.pendingOnly;

    if (structureChanged || labelsChanged) {
      changes.push({
        lang: lang.code,
        added,
        removed,
        translatedLabels: labelResult.translatedLabels,
        pendingLabels: labelResult.pendingOnly
          ? labelResult.translatedLabels
          : undefined,
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
  for (const { lang, added, removed, translatedLabels, pendingLabels } of changes) {
    lines.push(`  [${lang}] +${added.length} / -${removed.length} page path(s)`);
    for (const path of added.slice(0, 12)) {
      lines.push(`    + ${path}`);
    }
    if (added.length > 12) lines.push(`    ... +${added.length - 12} more`);
    for (const path of removed.slice(0, 8)) {
      lines.push(`    - ${path}`);
    }
    if (removed.length > 8) lines.push(`    ... -${removed.length - 8} more`);
    if (pendingLabels?.length) {
      lines.push(`    nav labels batch (${pendingLabels.length} total, dry-run):`);
      for (const label of pendingLabels.slice(0, 8)) {
        lines.push(`      · ${label}`);
      }
      if (pendingLabels.length > 8) {
        lines.push(`      ... +${pendingLabels.length - 8} more`);
      }
    } else if (translatedLabels?.length) {
      lines.push(`    nav labels batch applied (${translatedLabels.length}):`);
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
