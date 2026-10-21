# Pulls the four source tables behind the Rankings page and writes them as CSVs
# for build-rankings-data.py. The CSVs hold internal counts and spend, so write
# them outside the repo and never commit them.
#
# Usage: python3 scripts/rankings/fetch-rankings-sources.py <out dir> <last day, YYYY-MM-DD>
#
# Sources and the secrets they need (all read-only):
#   usecase_spend, cloud_model_speed_all  Snowflake  SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER,
#       SNOWFLAKE_PRIVATE_KEY (PEM, key-pair auth) or SNOWFLAKE_PASSWORD,
#       SNOWFLAKE_WAREHOUSE, optional SNOWFLAKE_ROLE
#   hardware_monthly                      PostHog    POSTHOG_API_KEY (personal key with
#       query:read), optional POSTHOG_PROJECT_ID (default 204330), POSTHOG_HOST
#   model_downloads_typed                 Hugging Face public API, optional HF_TOKEN
#
# Hugging Face only publishes running totals, so each run stores today's total
# per Comfy-Org repo in scripts/rankings/state/hf-downloads.json (public numbers)
# and derives each week's and month's downloads from the difference.
import csv, datetime as dt, json, os, re, sys, urllib.request

OUT, THROUGH = sys.argv[1], dt.date.fromisoformat(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)


def write_csv(name, header, rows):
    with open(f"{OUT}/{name}.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}: {len(rows)} rows")


def query_file(name):
    with open(f"{HERE}/queries/{name}", encoding="utf-8") as f:
        return f.read()


def http_json(url, body=None, headers=None):
    req = urllib.request.Request(url, data=body and json.dumps(body).encode(), headers=headers or {})
    if body:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


# 1 and 3. Snowflake: spend by use case and Cloud model speed.
def snowflake_rows(sql, start, end):
    # The dates come from this script, never from input, so they're filled in
    # as text; binding would make the connector treat the % in LIKE patterns.
    sql = sql.replace("{start}", start.isoformat()).replace("{end}", end.isoformat())
    import snowflake.connector

    args = dict(account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
                warehouse=os.environ["SNOWFLAKE_WAREHOUSE"], database="ANALYTICS_PROD")
    if os.environ.get("SNOWFLAKE_ROLE"):
        args["role"] = os.environ["SNOWFLAKE_ROLE"]
    if os.environ.get("SNOWFLAKE_PRIVATE_KEY"):
        from cryptography.hazmat.primitives import serialization

        key = serialization.load_pem_private_key(os.environ["SNOWFLAKE_PRIVATE_KEY"].encode(), password=None)
        args["private_key"] = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
                                                serialization.NoEncryption())
    else:
        args["password"] = os.environ["SNOWFLAKE_PASSWORD"]
    with snowflake.connector.connect(**args) as con:
        cur = con.cursor()
        cur.execute(sql)
        return cur.fetchall()


# Weeks are Monday-start (UTC). The use case chart covers the last 8 full weeks.
week_end = THROUGH - dt.timedelta(days=(THROUGH.weekday() + 1) % 7)  # last Sunday on or before THROUGH
week_start = week_end - dt.timedelta(days=7 * 8 - 1)
rows = snowflake_rows(query_file("usecase_spend.sql"), week_start, week_end + dt.timedelta(days=1))
write_csv("usecase_spend", ["week", "use_case", "model", "credits"], [[str(r[0]), r[1], r[2], float(r[3])] for r in rows])

# Speed covers every job since this start date, so the 100-job floor stays meaningful.
SPEED_START = dt.date.fromisoformat(os.environ.get("RANKINGS_SPEED_START", "2026-08-24"))
rows = snowflake_rows(query_file("cloud_model_speed.sql"), SPEED_START, THROUGH + dt.timedelta(days=1))
write_csv("cloud_model_speed_all", ["type", "kind", "model", "jobs", "p50_wait_s", "p90_wait_s", "p50_gen_s", "p90_gen_s", "gpu_share"],
          [["" if v is None else v for v in r] for r in rows])


# 2. PostHog: Desktop installs per month by hardware.
def hogql(sql):
    host = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")
    project = os.environ.get("POSTHOG_PROJECT_ID", "204330")
    res = http_json(f"{host}/api/projects/{project}/query/", {"query": {"kind": "HogQLQuery", "query": sql}},
                    {"Authorization": "Bearer " + os.environ["POSTHOG_API_KEY"]})
    return res["results"]


HW_FIRST_MONTH = dt.date(2026, 7, 1)  # June reported virtual adapters instead of real GPUs
TOP_GPUS = 30
hw, m = [], HW_FIRST_MONTH
while m <= THROUGH:
    nxt = (m.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    end = min(nxt, THROUGH + dt.timedelta(days=1))
    sql = query_file("hardware_monthly.hogql").replace("{start}", f"{m} 00:00:00").replace("{end}", f"{end} 00:00:00")
    hw += [[str(r[0])[:10], r[1], r[2], int(r[3])] for r in hogql(sql + "\nLIMIT 10000")]
    m = nxt
# Keep the 30 most common GPU models over the whole range; the rest is Other GPUs.
gpu_tot = {}
for month, grp, item, n in hw:
    if grp == "GPU model" and item:
        gpu_tot[item] = gpu_tot.get(item, 0) + n
top = set(sorted(gpu_tot, key=lambda k: -gpu_tot[k])[:TOP_GPUS])
total = {month: n for month, grp, item, n in hw if grp == "Total"}
out, shown = [], {}
for month, grp, item, n in hw:
    if grp == "Total" or (grp == "GPU model" and item not in top):
        continue
    if grp == "GPU model":
        shown[month] = shown.get(month, 0) + n
    out.append([month, grp, item, n])
out += [[month, "GPU model", "Other GPUs", total[month] - shown.get(month, 0)] for month in total]
write_csv("hardware_monthly", ["month", "grp", "item", "value"], out)


# 4. Hugging Face: downloads of Comfy-Org's model repos.
with open(f"{HERE}/hf-repos.json", encoding="utf-8") as f:
    REPOS = json.load(f)
STATE = f"{HERE}/state/hf-downloads.json"
with open(STATE, encoding="utf-8") as f:
    state = json.load(f)
headers = {"Authorization": "Bearer " + os.environ["HF_TOKEN"]} if os.environ.get("HF_TOKEN") else {}
url = "https://huggingface.co/api/models?author=Comfy-Org&expand[]=downloadsAllTime&limit=1000"
today = {}
while url:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        for m in json.load(r):
            if m["id"] in REPOS:
                today[m["id"]] = m.get("downloadsAllTime", 0)
        link = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link", ""))
        url = link and link.group(1)
state["totals"][THROUGH.isoformat()] = today
with open(STATE, "w", encoding="utf-8") as f:
    json.dump(state, f, indent=1, sort_keys=True)
    f.write("\n")

# A period's downloads = the total on the first snapshot after it ends (or the
# latest one) minus the first snapshot on or within 3 days after it starts.
# Periods with no starting snapshot are skipped; the build keeps their earlier shares.
snaps = sorted(state["totals"])


def first_on_or_after(day, within):
    return next((s for s in snaps if day.isoformat() <= s <= (day + dt.timedelta(days=within)).isoformat()), None)


dl = []
for grain in ("Weekly", "Monthly"):
    start = dt.date.fromisoformat(snaps[0])
    p = start - dt.timedelta(days=start.weekday()) if grain == "Weekly" else start.replace(day=1)
    while p <= THROUGH:
        nxt = p + dt.timedelta(days=7) if grain == "Weekly" else (p.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        a, b = first_on_or_after(p, 3), first_on_or_after(nxt, 3) or snaps[-1]
        if a and b > a:
            for repo, meta in REPOS.items():
                n = state["totals"][b].get(repo, 0) - state["totals"][a].get(repo, 0)
                if n > 0:
                    dl.append([grain, p.isoformat(), meta["type"], meta["name"], n])
        p = nxt
write_csv("model_downloads_typed", ["grain", "period", "type", "model", "downloads"], dl)
