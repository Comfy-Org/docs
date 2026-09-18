#!/usr/bin/env bun
/**
 * Fail a pull request that edits a file the Comfy API spec sync OWNS.
 *
 *   git diff --name-only --no-renames -z <base>...<head> \
 *     | bun .github/scripts/sync-owned/check-sync-owned.ts
 *
 * A set of files in this repository is written by the upstream Comfy API v2 spec
 * sync and rewritten from upstream sources on every sync run. An edit made here
 * renders on docs.comfy.org until the next sync, and is then silently reverted by
 * the sync's diff. This check refuses such an edit at pull-request time, while its
 * author can still move it upstream.
 *
 * The guarded list mirrors the sync's own final status check, which runs
 * `git status --porcelain --untracked-files=all` over: `openapi-v2.yaml`,
 * `development/comfy-router/reference.mdx`, `development/comfy-router/quickstart.mdx`,
 * `development/comfy-router/limitations.mdx`, `router-schemas`,
 * `development/comfy-router/models`, `development/comfy-router/models.mdx` and
 * `docs.json`. Two of those are deliberately NOT guarded here, because the sync
 * only owns part of them:
 *
 *   - `docs.json` is co-owned. The sync rewrites the `Models` nav group and the
 *     model-page redirects; everything else in it is this repository's to edit.
 *   - `development/comfy-router/models/**\/code.yaml` are HAND-CURATED generator
 *     inputs that live inside the generated tree. Only the sibling `code.mdx`
 *     pages are generated, so `code.yaml` stays editable and is in fact where an
 *     edit to a generated model page belongs.
 *
 * The two GENERATED page kinds (`development/comfy-router/models.mdx` and the
 * per-model `code.mdx`) are guarded CONDITIONALLY, because committing them is
 * mandatory whenever a generator input changes: `code-pages:check` fails a pull
 * request whose pages are stale, so guarding them unconditionally would put the
 * two checks in direct contradiction and make a `code.yaml` edit unshippable. A
 * pull request that also changes one of the generator's inputs is therefore
 * regenerating rather than hand-editing, and its generated pages pass; the
 * freshness check is what proves the regeneration is honest. With no input
 * changed, an edit to a generated page is a hand-edit and is refused.
 *
 * Exempt: the sync's own pull request, identified by its author or its fixed head
 * branch. Both are accepted because the sync is allowed to rewrite what it owns.
 *
 * Reads NUL-separated (or newline-separated) changed paths on stdin. Exits 1 and
 * lists every offending file, with per-file guidance, when any is guarded.
 */

/** The bot that authors the rolling sync pull request. */
export const SYNC_PR_AUTHOR = "comfy-pr-bot";
/** The fixed branch the rolling sync pull request lives on. */
export const SYNC_PR_BRANCH = "chore/sync-comfy-api-v2-spec";

const MODELS_DIR = "development/comfy-router/models";

export type SyncOwnedRule = {
  /** Stable id, used by the tests and by nothing else. */
  id: string;
  test: (path: string) => boolean;
  /** Where the edit belongs instead. One sentence, rendered under the file. */
  guidance: string;
  /**
   * True for the pages `bun run code-pages:gen` writes. They are excused when the
   * same pull request changes a generator input, since the freshness check then
   * requires them to be committed.
   */
  generated?: true;
};

/**
 * The inputs `bun run code-pages:gen` reads. Mirrors the path filter of
 * `code-pages-check.yml`, minus its two outputs (`docs.json`, and the generated
 * pages themselves) and minus `package.json`, which only names the script.
 */
export const GENERATOR_INPUTS: { label: string; test: (path: string) => boolean }[] = [
  {
    label: "a model's code.yaml spec",
    test: (p) => p.startsWith(`${MODELS_DIR}/`) && p.endsWith("/code.yaml"),
  },
  {
    label: "the router-schemas mirror",
    test: (p) => p === "router-schemas" || p.startsWith("router-schemas/"),
  },
  {
    label: "a snippets/comfy-router fragment",
    test: (p) => p.startsWith("snippets/comfy-router/"),
  },
  {
    // `.ts` only: the prose beside the generator cannot change what it emits.
    label: "the code-page generator",
    test: (p) => p.startsWith(".github/scripts/snippets/") && p.endsWith(".ts"),
  },
];

/**
 * The generator input this diff changes, if any. Iterates the inputs rather than
 * the paths, so the label names the most direct input the pull request touches
 * instead of whichever one the diff happened to list first.
 */
export function changedGeneratorInput(paths: readonly string[]): string | null {
  const input = GENERATOR_INPUTS.find((i) => paths.some((p) => i.test(p)));
  return input ? input.label : null;
}

/**
 * First match wins, so the `code.mdx` rule is written to exclude `code.yaml`
 * rather than relying on ordering to protect it.
 */
export const SYNC_OWNED_RULES: SyncOwnedRule[] = [
  {
    id: "openapi-v2",
    test: (p) => p === "openapi-v2.yaml",
    guidance:
      "Vendored projection of the public Comfy API v2 specification. Edit the API contract upstream; the sync reprojects this file on every run.",
  },
  {
    id: "reference",
    test: (p) => p === "development/comfy-router/reference.mdx",
    guidance:
      "GENERATED from the upstream Comfy API contract. Edit the contract upstream, not this copy.",
  },
  {
    id: "quickstart",
    test: (p) => p === "development/comfy-router/quickstart.mdx",
    guidance:
      "Hand-written upstream and published here verbatim. Edit the upstream quickstart.mdx.",
  },
  {
    id: "limitations",
    test: (p) => p === "development/comfy-router/limitations.mdx",
    guidance:
      "Hand-written upstream and published here verbatim. Edit the upstream limitations.mdx.",
  },
  {
    id: "router-schemas",
    test: (p) => p === "router-schemas" || p.startsWith("router-schemas/"),
    guidance:
      "Mirror of the upstream GET /v2/models/{id}/openapi.json documents. The whole directory is re-mirrored on every sync. Edit the upstream contract.",
  },
  {
    id: "models-index",
    test: (p) => p === `${MODELS_DIR}.mdx`,
    guidance:
      "GENERATED provider index, hand-edited: this pull request changes none of the generator's inputs. Change a model's code.yaml (or the upstream contract) and re-run `bun run code-pages:gen`.",
    generated: true,
  },
  {
    id: "model-code-page",
    test: (p) => p.startsWith(`${MODELS_DIR}/`) && p.endsWith("/code.mdx"),
    guidance:
      "GENERATED model page, hand-edited: this pull request changes none of the generator's inputs. Edit the sibling code.yaml (or the upstream contract) and re-run `bun run code-pages:gen`.",
    generated: true,
  },
];

export type Offence = { path: string; guidance: string };

/** Normalize a path as git prints it: repo-relative, POSIX, no leading `./`. */
const normalize = (path: string) => path.trim().replace(/^\.\//, "");

export type Report = {
  offences: Offence[];
  /** Generated pages let through because the same diff changes a generator input. */
  excused: string[];
  /** Set when generated-page rules were suppressed, naming the input that did it. */
  regeneratedBecause: string | null;
  /** How many paths were considered, after normalizing and de-duplicating. */
  checked: number;
};

export function check(rawPaths: readonly string[]): Report {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawPaths) {
    const path = normalize(raw);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  const regeneratedBecause = changedGeneratorInput(paths);
  const offences: Offence[] = [];
  const excused: string[] = [];
  for (const path of paths) {
    const rule = SYNC_OWNED_RULES.find((r) => r.test(path));
    if (!rule) continue;
    if (rule.generated && regeneratedBecause) {
      excused.push(path);
      continue;
    }
    offences.push({ path, guidance: rule.guidance });
  }
  return { offences, excused, regeneratedBecause, checked: paths.length };
}

/** Convenience wrapper for callers that only want the offending files. */
export const classify = (paths: readonly string[]): Offence[] => check(paths).offences;

/**
 * The exemption reason, or `null` when the pull request is not the sync's own.
 * Author OR branch: a re-pushed sync branch and a bot-authored run each have to
 * pass on their own, since neither signal is guaranteed present in every event.
 */
export function exemptionReason(author: string | undefined, headRef: string | undefined): string | null {
  if (author === SYNC_PR_AUTHOR) return `pull request is authored by ${SYNC_PR_AUTHOR}`;
  if (headRef === SYNC_PR_BRANCH) return `pull request head branch is ${SYNC_PR_BRANCH}`;
  return null;
}

export function formatFailure(offences: readonly Offence[]): string {
  const lines = [
    `❌ This pull request edits ${offences.length} file(s) owned by the Comfy API spec sync:`,
    "",
  ];
  for (const { path, guidance } of offences) {
    lines.push(`  ${path}`);
    lines.push(`    ${guidance}`);
    lines.push("");
  }
  lines.push(
    "These files are rewritten from upstream sources on every sync run, so an edit made here is published now and reverted by the next sync. Move the change upstream (or into the generator input named above) and drop it from this pull request.",
  );
  lines.push(
    "The open sync pull request on the chore/sync-comfy-api-v2-spec branch describes each file's source; see also \"Sync-owned files\" in README.md.",
  );
  return lines.join("\n");
}

/** Split on NUL or newline, so the script works with or without `git diff -z`. */
export function parsePaths(input: string): string[] {
  return input.split(/[\0\n]/).map(normalize).filter(Boolean);
}

async function main() {
  const reason = exemptionReason(process.env.PR_AUTHOR, process.env.PR_HEAD_REF);
  if (reason) {
    console.log(`✅ Sync-owned file check skipped: ${reason}.`);
    return;
  }

  const report = check(parsePaths(await Bun.stdin.text()));
  if (report.excused.length > 0) {
    console.log(
      `ℹ️ ${report.excused.length} generated page(s) allowed: this pull request also changes ${report.regeneratedBecause}, so they are a regeneration. code-pages:check verifies they are fresh.`,
    );
  }
  if (report.offences.length === 0) {
    console.log(`✅ No sync-owned files edited (${report.checked} changed file(s) checked).`);
    return;
  }

  console.error(formatFailure(report.offences));
  process.exitCode = 1;
}

if (import.meta.main) await main();
