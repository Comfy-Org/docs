# Rankings data pipeline

The [Rankings tab](../../rankings/index) reads one generated file,
`snippets/rankings/rankings-data.jsx`. It holds ranks, shares and times only.
Raw spend, call counts and install counts never enter the repo.

## Daily refresh

`.github/workflows/rankings-data-refresh.yml` runs every day at 9am Pacific
(two UTC crons plus a clock check, so daylight saving time is handled). It:

1. Runs `fetch-rankings-sources.py <tmp dir> <yesterday>`, which writes four CSVs to the runner's temp dir:
   - `model_generations.csv`: Snowflake, `queries/model_generations.sql`, generations per model and week for the last 52 full Monday-start UTC weeks (Top models and Top movers). The build groups the weeks into months and quarters.
   - `cloud_model_speed_all.csv`: Snowflake, `queries/cloud_model_speed.sql`, every Cloud job in the last year, never before Dec 1, 2025, when Cloud started recording job start and end times. Set `RANKINGS_SPEED_START` to override the start.
   - `hardware_weekly.csv`: PostHog HogQL, `queries/hardware_weekly.hogql`, one count per Desktop install per Monday-start week for the last year, from July 6, 2026 at the earliest (the Desktop hardware report starts in June 2026).
   - `model_downloads_typed.csv`: Hugging Face public download totals for the repos in `hf-repos.json`.
2. Runs `build-rankings-data.py <tmp dir> snippets/rankings/rankings-data.jsx <yesterday>`.
3. Commits the data file and `state/hf-downloads.json` to `main`. If `main` rejects the push, it opens a PR from `chore/rankings-data-refresh` instead.

You can also start it by hand from the Actions tab (workflow_dispatch).

### Secrets

Add these as repository secrets. Until `SNOWFLAKE_ACCOUNT` and `POSTHOG_API_KEY` exist, the job logs a warning and changes nothing.

| Secret | Notes |
|--------|-------|
| `SNOWFLAKE_ACCOUNT` | Account identifier |
| `SNOWFLAKE_USER` | A read-only service user |
| `SNOWFLAKE_PRIVATE_KEY` | Unencrypted PEM for key-pair auth (preferred) |
| `SNOWFLAKE_PASSWORD` | Only if not using a key |
| `SNOWFLAKE_WAREHOUSE` | Warehouse to run the two queries |
| `SNOWFLAKE_ROLE` | Optional; needs read on `ANALYTICS_PROD.STAGING` and `ANALYTICS_PROD.CORE` |
| `POSTHOG_API_KEY` | Personal API key with `query:read` on project 204330 |
| `HF_TOKEN` | Optional, only raises Hugging Face rate limits |

## Downloads caveat

Hugging Face's API only exposes running totals, so each run saves that day's
totals in `state/hf-downloads.json`. A week's or month's downloads are the
difference between snapshots, and a period with no snapshot near its start is
skipped. Periods up to Oct 18, 2026 came from publisher analytics and keep their
shares; `build-rankings-data.py` merges new periods into the existing data file
rather than replacing it.

## Output types

`model-types.json` sets the output type (Image, Video, Speech, 3D) of every
model already on the page. A new model gets its type from its calls' use case
in `model_generations.sql`; add it to the file to fix a wrong guess.

## Model page links

Model names link to their page on the Comfy Hub (https://comfy.org/hub/models/)
when one exists. Models without a hub page link to their launch page on
comfy.org (like https://comfy.org/minimax-h3/) when a pattern in
`model-pages.json` matches the name. Add a pattern there when comfy.org adds a
launch page. The page list is `hub-pages.json`, built from a checkout of the
private Comfy-Org/comfy-website repo. Rebuild it by hand when the hub adds models:

```bash
python3 scripts/rankings/build-hub-pages.py ../comfy-website scripts/rankings/hub-pages.json
```

The next daily run picks it up.

## Running locally

```bash
python3 scripts/rankings/fetch-rankings-sources.py /tmp/rankings 2026-10-20
python3 scripts/rankings/build-rankings-data.py /tmp/rankings snippets/rankings/rankings-data.jsx 2026-10-20
```

Keep the CSVs out of the repo. Running the fetch locally also adds a snapshot to
`state/hf-downloads.json`.
