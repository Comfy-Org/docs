# Builds snippets/rankings/rankings-data.jsx from the internal CSVs that
# fetch-rankings-sources.py writes (or the dashboard's original exports). It turns
# credits, install counts and download counts into ranks and shares so no
# absolute volume is published.
# Usage: python3 scripts/rankings/build-rankings-data.py <csv dir> snippets/rankings/rankings-data.jsx <last day, YYYY-MM-DD>
# The dir holds usecase_spend.csv, hardware_monthly.csv, cloud_model_speed_all.csv
# and model_downloads_typed.csv.
import csv, json, os, re, sys, collections
B, OUT, THROUGH = sys.argv[1], sys.argv[2], sys.argv[3]
HERE = os.path.dirname(os.path.abspath(__file__))


def rd(name):
    with open(f"{B}/{name}.csv", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


R = lambda v: round(v, 5)

# Hub links: each table row links to its model page on comfy.org/hub/models/
# when one exists. Paths are stored relative to that URL.
with open(f"{HERE}/hub-pages.json", encoding="utf-8") as f:
    HUB = json.load(f)
PAGES = set(HUB["pages"])
TASK = {"Text to image": "text-to-image", "Image edit": "image-edit", "Image tools": "image-edit",
        "Image to video": "image-to-video", "Text to video": "text-to-video", "Video to video": "video",
        "Speech": "speech", "Audio": "audio"}
AUX = re.compile(r"vae|clip|encoder|t5|gemma|llama|lora|whisper|mistral|byt5|llava|dino|jina|qwen-2-5|qwen-3|qwen3vl|qwen-0|qwen-4b|ovis-2|gpt-oss|enhancer|projector|squish|darkbrush|talkvid")
tokens = lambda s: set(re.findall(r"[a-z]+|[0-9]+", s.lower()))


link = lambda path: {"h": path} if path else {}


def api_page(model, use_case):
    slugs = HUB["api"].get(model.lower())
    if not slugs:
        return None
    t = TASK.get(use_case)
    hit = next((s for s in slugs if t and t in s), None)
    if hit:
        return hit
    # The model's page for another task often has a sibling for this one,
    # like seedance-2-0-text-to-video and seedance-2-0-image-to-video.
    for s in slugs:
        for other in ("text-to-video", "image-to-video", "text-to-image", "image-edit", "video-to-video", "video-edit"):
            twin = t and other in s and s.replace(other, t)
            if twin and twin in PAGES:
                return twin
    return slugs[0]


def local_page(file_name):
    slug = HUB["local"].get(re.sub(r"[^a-z0-9]+", "-", file_name.lower()).strip("-"))
    return slug and "local/" + slug


def repo_page(repo):
    files = HUB["repos"].get(repo, [])
    main = [s for s in files if not AUX.search(s)] or files
    fam = tokens(repo.split("/", 1)[1])
    best = max(main, key=lambda s: (len(tokens(s) & fam), -len(s)), default=None)
    return best and "local/" + best


# 1. Use case: weekly rank by spend, never credits or shares
uc = rd('usecase_spend')
weeks = sorted({r['week'] for r in uc})
tot = collections.Counter(); case_tot = collections.Counter(); cell = collections.defaultdict(float)
for r in uc:
    c = float(r['credits']); tot[(r['use_case'], r['week'])] += c; case_tot[r['use_case']] += c
    cell[(r['use_case'], r['model'], r['week'])] += c
# Only the weekly rank is kept (1 = most spend); "Other models" is left out.
cases = []
for u, _ in case_tot.most_common():
    models = sorted({m for (uu, m, w) in cell if uu == u and m != 'Other models'})
    ranks = {m: [None] * len(weeks) for m in models}
    for wi, w in enumerate(weeks):
        live = sorted((m for m in models if cell[(u, m, w)] > 0), key=lambda m: -cell[(u, m, w)])
        for i, m in enumerate(live):
            ranks[m][wi] = i + 1
    cases.append({"name": u, "models": [dict({"m": m, "r": ranks[m]}, **link(api_page(m, u))) for m in models]})
usecase = {"weeks": weeks, "cases": cases}

# 2. Hardware: share of each month's installs, never counts
hw = rd('hardware_monthly')
months = sorted({r['month'] for r in hw})
tot = collections.Counter(); cell = collections.defaultdict(float)
for r in hw:
    tot[(r['grp'], r['month'])] += float(r['value']); cell[(r['grp'], r['item'], r['month'])] += float(r['value'])
groups = []
for g in ["GPU model", "VRAM", "GPU vendor", "Operating system", "System RAM"]:
    items = sorted({i for (gg, i, m) in cell if gg == g})
    groups.append({"name": g, "items": [{"i": i, "s": [R(cell[(g, i, m)] / tot[(g, m)]) if tot[(g, m)] else 0 for m in months]} for i in items]})
hardware = {"months": months, "groups": groups}

# 3. Speed: times and share of credits only, job counts dropped
num = lambda v: None if v == '' else float(v)
sp = rd('cloud_model_speed_all')
speed = [[r['type'], r['kind'], r['model'], num(r['p50_wait_s']), num(r['p90_wait_s']), num(r['p50_gen_s']), num(r['p90_gen_s']), R(float(r['gpu_share'] or 0)), local_page(r['model'])] for r in sp]

# 4. Downloads: share within output type per period, counts dropped
with open(f"{HERE}/hf-repos.json", encoding="utf-8") as f:
    REPO_OF = {v["name"]: k for k, v in json.load(f).items()}
dl = rd('model_downloads_typed')
# The live feed only has the periods since daily snapshots started, so periods
# it doesn't cover keep the shares already in the output file.
old = {}
if os.path.exists(OUT):
    with open(OUT, encoding='utf-8') as f:
        prev = f.read()
    old = json.loads(prev[prev.index('{'):prev.rindex('}') + 1]).get('downloads', {})
downloads = {}
for g in ["Weekly", "Monthly"]:
    rows = [r for r in dl if r['grain'] == g]
    fresh = {r['period'] for r in rows}
    o = old.get(g, {"periods": [], "types": []})
    kept = {}
    for t in o["types"]:
        for mm in t["models"]:
            for p, v in zip(o["periods"], mm["s"]):
                if p not in fresh:
                    kept[(t["name"], mm["m"], p)] = v
    ps = sorted(fresh | {p for (_, _, p) in kept})
    tot = collections.Counter(); cell = collections.defaultdict(float)
    for r in rows:
        tot[(r['type'], r['period'])] += float(r['downloads']); cell[(r['type'], r['model'], r['period'])] += float(r['downloads'])
    share = lambda t, m, p: kept.get((t, m, p), 0) if p not in fresh else (R(cell[(t, m, p)] / tot[(t, p)]) if tot[(t, p)] else 0)
    types = []
    for t in ['Image', 'Video', 'Image tools', 'Audio', '3D', 'Text encoders & VAEs']:
        models = sorted({m for (tt, m, p) in cell if tt == t} | {m for (tt, m, p) in kept if tt == t})
        if models:
            types.append({"name": t, "models": [dict({"m": m, "s": [share(t, m, p) for p in ps]}, **link(repo_page(REPO_OF.get(m, "")))) for m in models]})
    downloads[g] = {"periods": ps, "types": types}

data = {"through": THROUGH, "speedFrom": os.environ.get("RANKINGS_SPEED_START", "2026-08-24"), "usecase": usecase, "hardware": hardware, "speed": speed, "downloads": downloads}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("// Static snapshot for the Rankings page. Shares and times only: no call counts,\n")
    f.write("// credits, install counts or download counts. Regenerate from the source exports\n")
    f.write("// rather than editing by hand.\n")
    f.write("export const RANKINGS_DATA = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + ";\n")
