# Builds snippets/rankings/rankings-data.jsx from the internal CSV exports behind
# the Comfy model rankings dashboard. It turns credits, install counts and
# download counts into shares so no absolute volume is published.
# Usage: python3 scripts/rankings/build-rankings-data.py <csv dir> snippets/rankings/rankings-data.jsx
# The dir holds usecase_spend.csv, hardware_monthly.csv, cloud_model_speed_all.csv
# and model_downloads_typed.csv.
import csv, json, sys, collections
B = sys.argv[1]; OUT = sys.argv[2]
rd = lambda f: list(csv.DictReader(open(f"{B}/{f}.csv")))
R = lambda v: round(v, 5)

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
    cases.append({"name": u, "models": [{"m": m, "r": ranks[m]} for m in models]})
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
speed = [[r['type'], r['kind'], r['model'], num(r['p50_wait_s']), num(r['p90_wait_s']), num(r['p50_gen_s']), num(r['p90_gen_s']), R(float(r['gpu_share'] or 0))] for r in sp]

# 4. Downloads: share within output type per period, counts dropped
dl = rd('model_downloads_typed')
downloads = {}
for g in ["Weekly", "Monthly"]:
    rows = [r for r in dl if r['grain'] == g]
    ps = sorted({r['period'] for r in rows})
    tot = collections.Counter(); cell = collections.defaultdict(float)
    for r in rows:
        tot[(r['type'], r['period'])] += float(r['downloads']); cell[(r['type'], r['model'], r['period'])] += float(r['downloads'])
    types = []
    for t in ['Image', 'Video', 'Image tools', 'Audio', '3D', 'Text encoders & VAEs']:
        models = sorted({m for (tt, m, p) in cell if tt == t})
        if models:
            types.append({"name": t, "models": [{"m": m, "s": [R(cell[(t, m, p)] / tot[(t, p)]) if tot[(t, p)] else 0 for p in ps]} for m in models]})
    downloads[g] = {"periods": ps, "types": types}

data = {"usecase": usecase, "hardware": hardware, "speed": speed, "downloads": downloads}
with open(OUT, 'w') as f:
    f.write("// Static snapshot for the Rankings page. Shares and times only: no call counts,\n")
    f.write("// credits, install counts or download counts. Regenerate from the source exports\n")
    f.write("// rather than editing by hand.\n")
    f.write("export const RANKINGS_DATA = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ";\n")
