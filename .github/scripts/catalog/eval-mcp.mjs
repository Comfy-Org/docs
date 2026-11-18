#!/usr/bin/env node
/**
 * Run the fixed catalog questions against a Comfy Docs MCP server and score them.
 *
 * Usage:
 *   node .github/scripts/catalog/eval-mcp.mjs                                # production
 *   node .github/scripts/catalog/eval-mcp.mjs --url https://<preview>/mcp
 *   node .github/scripts/catalog/eval-mcp.mjs --out results/eval-<label>.json
 *   node .github/scripts/catalog/eval-mcp.mjs --compare results/eval-baseline.json
 *
 * No LLM is involved. Each question is one MCP call plus a string check, so a
 * run is free and repeatable. Tool names are discovered with tools/list because
 * Mintlify makes them site-specific.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]);
    return acc;
  }, []),
);
const url = args.url ?? "https://docs.comfy.org/mcp";
const { questions } = JSON.parse(readFileSync(join(here, "eval-questions.json"), "utf8"));

let rpcId = 0;
async function rpc(method, params = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await res.text();
  const line = body.split("\n").find((l) => l.startsWith("data: "));
  const msg = JSON.parse(line ? line.slice(6) : body);
  if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
  return msg.result;
}

const { tools } = await rpc("tools/list");
const searchTool = tools.find((t) => t.name.startsWith("search_"))?.name;
const fsTool = tools.find((t) => t.name.startsWith("query_docs_filesystem"))?.name;
if (!searchTool || !fsTool) throw new Error(`Unexpected tool list: ${tools.map((t) => t.name).join(", ")}`);

async function ask(call) {
  if (call.tool === "search") {
    const a = { query: call.query, ...(call.language ? { language: call.language } : {}) };
    const r = await rpc("tools/call", { name: searchTool, arguments: a });
    const pages = r.content.map((c) => /Page: (\S+)/.exec(c.text ?? "")?.[1]).filter(Boolean);
    return { pages };
  }
  if (call.tool === "fs") {
    const r = await rpc("tools/call", { name: fsTool, arguments: { command: call.command } });
    const text = r.content.map((c) => c.text ?? "").join("\n");
    const exit = Number(/^exit: (\d+)/m.exec(text)?.[1] ?? -1);
    return { exit, text };
  }
  if (call.tool === "resources") {
    const r = await rpc("resources/list");
    return { resources: r.resources.map((x) => x.name) };
  }
  throw new Error(`Unknown tool ${call.tool}`);
}

function check(expect, got) {
  if (got.pages) {
    const top = got.pages.slice(0, expect.within ?? 10);
    if (expect.pageStartsWith) return top.some((p) => p.startsWith(expect.pageStartsWith));
    if (expect.pageEquals) return top.includes(expect.pageEquals);
    if (expect.pageIn) return top.some((p) => expect.pageIn.includes(p));
  }
  if ("exit" in got) {
    return got.exit === (expect.exit ?? 0) && (expect.contains ?? []).every((s) => got.text.includes(s));
  }
  if (got.resources) return got.resources.some((n) => n !== expect.resourceOtherThan);
  return false;
}

const results = [];
for (const q of questions) {
  let got;
  try {
    got = await ask(q.call);
  } catch (e) {
    got = { error: String(e.message ?? e) };
  }
  const pass = !got.error && check(q.expect, got);
  const evidence = got.pages?.slice(0, 5) ?? got.resources ?? got.error ?? got.text?.slice(0, 160);
  results.push({ id: q.id, question: q.question, guard: !!q.guard, pass, evidence });
}

const score = results.filter((r) => !r.guard && r.pass).length;
const total = results.filter((r) => !r.guard).length;
const guardsOk = results.filter((r) => r.guard).every((r) => r.pass);
const report = { url, ranAt: new Date().toISOString(), tools: tools.map((t) => t.name), score: `${score}/${total}`, guardsOk, results };

let baseline;
if (args.compare) baseline = JSON.parse(readFileSync(args.compare, "utf8"));
for (const r of results) {
  const was = baseline?.results.find((b) => b.id === r.id)?.pass;
  const delta = was === undefined ? "" : was === r.pass ? "" : r.pass ? "  (fixed)" : "  (REGRESSED)";
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${String(r.id).padStart(2)}  ${r.guard ? "[guard] " : ""}${r.question}${delta}`);
}
console.log(`\nScore ${report.score} · guards ${guardsOk ? "ok" : "FAILING"} · ${url}`);

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(report, null, 2) + "\n");
  console.log(`Wrote ${args.out}`);
}
process.exitCode = guardsOk ? 0 : 1;
