# Builds scripts/rankings/hub-pages.json, the list of model pages on
# https://comfy.org/hub/models/ that the Rankings tables link to. It reads the
# page lists from a checkout of Comfy-Org/comfy-website (private), so run it by
# hand when the hub adds models, then rerun build-rankings-data.py.
# Usage: python3 scripts/rankings/build-hub-pages.py <comfy-website checkout> scripts/rankings/hub-pages.json
import json, re, sys, collections

SITE, OUT = sys.argv[1], sys.argv[2]
CFG = f"{SITE}/apps/website/src/config"

with open(f"{CFG}/model-urls.ts", encoding="utf-8") as f:
    src = f.read()
pages = re.findall(r"oldSlug: '([^']+)',\s*newSlug: '([^']+)'", src)
aliases = re.findall(r"alias: '([^']+)',\s*newSlug: '([^']+)'", src)
with open(f"{CFG}/generated-models.json", encoding="utf-8") as f:
    files = [m for m in json.load(f) if m["directory"] != "partner_nodes"]

# API models: page ids are provider--model--task, aliases provider--model.
# A model id that two providers share (like "v3") is ambiguous, so it's dropped.
by_model = collections.defaultdict(set)
for old, new in pages + aliases:
    p = old.split("--")
    by_model[p[1].lower()].add((p[0], new))
api = {m: sorted({n for _, n in v}) for m, v in by_model.items() if len({p for p, _ in v}) == 1}

# Local model files: one page per file under /hub/models/local, quantized
# copies point at their main file's page.
local = {}
for m in files:
    local[m["slug"]] = m.get("canonicalSlug") or m["slug"]

# Hugging Face repo -> its file pages, for the downloads table.
repos = collections.defaultdict(list)
for m in files:
    r = re.match(r"https://huggingface.co/([^/]+/[^/?#]+)", m.get("huggingFaceUrl") or "")
    if r and not m.get("canonicalSlug"):
        repos[r.group(1)].append(m["slug"])

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"api": api, "pages": sorted({n for _, n in pages}), "local": local, "repos": repos}, f, indent=1, sort_keys=True)
    f.write("\n")
