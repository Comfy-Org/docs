# Builds snippets/rankings/rankings-data.jsx from the internal CSVs that
# fetch-rankings-sources.py writes (or the dashboard's original exports). It turns
# generations, credits, install counts and download counts into shares so no
# absolute volume is published.
# Usage: python3 scripts/rankings/build-rankings-data.py <csv dir> snippets/rankings/rankings-data.jsx <last day, YYYY-MM-DD>
# The dir holds model_generations.csv, hardware_weekly.csv, cloud_model_speed_all.csv
# and model_downloads_typed.csv.
import csv, collections, datetime as dt, json, os, re, sys
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


# Model pages outside the hub (launch pages like /minimax-h3/), matched by
# name when the hub has no page for a model. Paths starting with / are on comfy.org.
with open(f"{HERE}/model-pages.json", encoding="utf-8") as f:
    LANDING = [(re.compile(k, re.I), v) for k, v in json.load(f).items()]


def landing_page(name):
    return next((v for k, v in LANDING if k.search(name)), None)


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


# 1. Generations: share of each output type's generations per model by week,
# month and quarter, plus each type's change between the last two periods, never counts.
with open(f"{HERE}/model-types.json", encoding="utf-8") as f:
    KNOWN = json.load(f)
TYPE_OF_CASE = {"Text to image": "Image", "Image edit": "Image", "Image tools": "Image", "Image to video": "Video",
                "Text to video": "Video", "Video to video": "Video", "Speech": "Speech", "3D": "3D"}
gen = rd('model_generations')
names = {r['model'] for r in gen} | set(KNOWN)


def final_name(model, api):
    # Preview names count toward their final release, and Meshy's "latest" alias
    # gets its provider's name.
    if model.lower() == 'latest' and (api or '').lower().startswith('meshy'):
        return 'meshy (latest)'
    if model.startswith('Other models'):
        return 'Other models'
    base = re.sub(r'-preview$', '', model)
    return base if base != model and base in names else model


weeks = sorted({r['week'] for r in gen})
calls, by_case, by_api, cell, tot = collections.Counter(), collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter), collections.Counter(), collections.Counter()
for r in gen:
    m = final_name(r['model'], r['api_name'])
    r['m'] = m
    calls[m] += int(r['calls'])
    by_case[m][r['use_case']] += float(r['generations'])
    by_api[m][r['api_name']] += int(r['calls'])
kind = {}
for m in calls:
    case = by_case[m].most_common(1)[0][0]
    t = KNOWN.get(m) or TYPE_OF_CASE.get(case)
    if t:
        kind[m] = (t, case)
# Models with fewer than 200 calls in the window are grouped as Other models.
OTHER = 'Other models'
for r in gen:
    if r['m'] not in kind:
        continue
    t = kind[r['m']][0]
    m = r['m'] if calls[r['m']] >= 200 else OTHER
    cell[(t, m, r['week'])] += float(r['generations'])
    tot[(t, r['week'])] += float(r['generations'])
# Months and quarters are groups of whole weeks: a week counts toward the month
# (and quarter) that holds its Thursday, so every week is in exactly one of each.
month_of = lambda w: (dt.date.fromisoformat(w) + dt.timedelta(days=3)).replace(day=1).isoformat()
quarter_of = lambda w: month_of(w)[:5] + '%02d' % (3 * ((int(month_of(w)[5:7]) - 1) // 3) + 1) + '-01'
GRAINS = [('week', lambda w: w), ('month', month_of), ('quarter', quarter_of)]


def whole_periods(key):
    # A period is kept only if every week that belongs to it is in the data.
    have = set(weeks)
    first, last = dt.date.fromisoformat(weeks[0]), dt.date.fromisoformat(weeks[-1])
    span = [(first + dt.timedelta(days=7 * i)).isoformat() for i in range(-15, (last - first).days // 7 + 16)]
    return [p for p in sorted({key(w) for w in weeks}) if all(w in have for w in span if key(w) == p)]


periods = {g: whole_periods(key) for g, key in GRAINS}
gtypes = []
for t in ['Image', 'Video', 'Speech', '3D']:
    models = sorted({m for (tt, m, w) in cell if tt == t})
    if not models:
        continue
    rows = {m: {"m": m} for m in models}
    growth = {}
    for g, key in GRAINS:
        ps = periods[g]
        cc, tt, nw = collections.Counter(), collections.Counter(), collections.Counter(key(w) for w in weeks)
        for (ty, m, w), v in cell.items():
            if ty == t:
                cc[(m, key(w))] += v
                tt[key(w)] += v
        for m in models:
            rows[m][g] = [R(cc[(m, p)] / tt[p]) if tt[p] else 0 for p in ps]
        # The type's own change in generations per week from the period before
        # (so 4- and 5-week months compare fairly). The page turns share changes
        # into growth with it.
        a_, b_ = (tt[ps[-2]] / nw[ps[-2]], tt[ps[-1]] / nw[ps[-1]]) if len(ps) > 1 else (0, 0)
        growth[g] = R(b_ / a_ - 1) if a_ else None
    for m in models:
        if m != OTHER:
            rows[m]["p"] = by_api[m].most_common(1)[0][0]
            rows[m].update(link(api_page(m, kind[m][1]) or landing_page(m)))
    gtypes.append({"name": t, "g": growth, "models": list(rows.values())})
generations = {"weeks": periods['week'], "months": periods['month'], "quarters": periods['quarter'], "types": gtypes}

# 2. Hardware: share of each week's Desktop installs, never counts
hw = rd('hardware_weekly')
hweeks = sorted({r['week'] for r in hw})
tot = collections.Counter(); cell = collections.defaultdict(float)
for r in hw:
    tot[(r['grp'], r['week'])] += float(r['value']); cell[(r['grp'], r['item'], r['week'])] += float(r['value'])
groups = []
for g in ["GPU model", "VRAM", "GPU vendor", "Operating system", "System RAM"]:
    items = sorted({i for (gg, i, w) in cell if gg == g})
    groups.append({"name": g, "items": [{"i": i, "s": [R(cell[(g, i, w)] / tot[(g, w)]) if tot[(g, w)] else 0 for w in hweeks]} for i in items]})
# The legacy Desktop app (v1) stopped sending data in May 2026, so its weekly
# shares are a fixed file (built once from its Mixpanel data in Snowflake).
with open(f"{HERE}/state/hardware-desktop-v1.json", encoding="utf-8") as f:
    hardware_v1 = json.load(f)
hardware = {"v2": {"weeks": hweeks, "groups": groups}, "v1": hardware_v1}

# 3. Speed: times and a usage rank, job counts and credit shares dropped
num = lambda v: None if v == '' else float(v)
sp = rd('cloud_model_speed_all')
# Usage rank (1 = most Cloud credits) orders the "Usage" sort; the share itself isn't published.
usage = {r['model']: i + 1 for i, r in enumerate(sorted(sp, key=lambda r: -float(r['gpu_share'] or 0)))}
speed = [[r['type'], r['kind'], r['model'], num(r['p50_wait_s']), num(r['p90_wait_s']), num(r['p50_gen_s']), num(r['p90_gen_s']), usage[r['model']], local_page(r['model']) or landing_page(r['model'])] for r in sp]

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
            types.append({"name": t, "models": [dict({"m": m, "s": [share(t, m, p) for p in ps]}, **link(repo_page(REPO_OF.get(m, "")) or landing_page(m))) for m in models]})
    downloads[g] = {"periods": ps, "types": types}

# Same start as fetch-rankings-sources.py: the last year, never before Dec 2025.
SPEED_FROM = os.environ.get("RANKINGS_SPEED_START") or max(dt.date(2025, 12, 1), dt.date.fromisoformat(THROUGH) - dt.timedelta(days=364)).isoformat()
data = {"through": THROUGH, "speedFrom": SPEED_FROM, "generations": generations, "hardware": hardware, "speed": speed, "downloads": downloads}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("// Static snapshot for the Rankings page. Shares and times only: no call counts,\n")
    f.write("// credits, install counts or download counts. Regenerate from the source exports\n")
    f.write("// rather than editing by hand.\n")
    f.write("export const RANKINGS_DATA = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + ";\n")
