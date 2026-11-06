-- Comfy Cloud speed per main diffusion model, successful jobs from {start} to {end}.
-- Latency = submitted to started, generation = started to finished (whole
-- workflow). gpu_share = share of metered GPU seconds, which is the share of
-- Cloud credits since every job runs on the same GPU.
-- {start} and {end} are filled in by fetch-rankings-sources.py.
with params as (
    select '{start}'::timestamp_ntz as start_ts, '{end}'::timestamp_ntz as end_ts
),
jobs as (
    select j.job_id,
           datediff('millisecond', j.created_at, j.execution_started_at) / 1000.0 as wait_s,
           datediff('millisecond', j.execution_started_at, j.execution_ended_at) / 1000.0 as gen_s
    from ANALYTICS_PROD.CORE.FCT_CLOUD_JOBS j, params p
    where j.is_successful
      and j.created_at >= p.start_ts and j.created_at < p.end_ts
      and j.execution_started_at is not null
      and j.execution_ended_at is not null
),
-- One main model per job: UNET slot, then diffusion model loader, then checkpoint.
main_model as (
    select mu.job_id,
           regexp_replace(regexp_replace(mu.model_name, '^.*[/\\\\]', ''), '\\.[A-Za-z0-9]+$', '') as file_model
    from ANALYTICS_PROD.CORE.FCT_CLOUD_MODEL_USAGE mu, params p
    where mu.created_at >= p.start_ts and mu.created_at < p.end_ts
      and mu.status = 'success'
      and (   (mu.node_class_type ilike '%unet%'                and mu.model_slot = 'unet_name')
           or (mu.node_class_type ilike 'DiffusionModelLoader%' and mu.model_slot = 'model_name')
           or (mu.node_class_type ilike '%checkpointloader%'    and mu.model_slot = 'ckpt_name'))
    qualify row_number() over (
        partition by mu.job_id
        order by case when mu.model_slot = 'unet_name' then 1
                      when mu.model_slot = 'model_name' then 2
                      else 3 end,
                 mu.model_name) = 1
),
-- gpu_usage and cloud_workflow_executed describe the same run; take one.
gpu as (
    select b.job_id, max(b.properties:gpu_seconds::float) as gpu_seconds
    from ANALYTICS_PROD.STAGING.STG_CLOUD__BILLING_EVENTS b, params p
    where b.event_type in ('gpu_usage', 'cloud_workflow_executed')
      and b.created_at >= p.start_ts and b.created_at < p.end_ts
      and b.job_id is not null
    group by b.job_id
),
classified as (
    select j.wait_s, j.gen_s, g.gpu_seconds,
           lower(m.file_model) as lm,
           -- Hugging Face paths (org__repo__file) are shown by file name, so
           -- copies of the same file under several names merge.
           regexp_replace(m.file_model, '^.*__', '') as model
    from jobs j
    join main_model m on m.job_id = j.job_id
    left join gpu g on g.job_id = j.job_id
),
typed as (
    select *,
        case
            when regexp_like(lm, '.*(stable_audio|minimax_music|acestep|ace_step|audio|music|yue).*') then 'Audio'
            when regexp_like(lm, '.*(trellis|pixal3d|triposplat|hunyuan3d|hunyuan_3d|tripo|3d_).*') then '3D'
            when regexp_like(lm, '.*(minimax_h3|minimaxh3|h3eros|_h3|h3_|ltx|wan2|wan_|wan22|fastvideo|seedvr|svd|hunyuanvideo|video|animatediff|scail|kandinsky5lite_i2v|kandinsky5lite_t2v|causal_forcing).*') then 'Video'
            else 'Image'
        end as type,
        -- Original = official lab releases, including Comfy's repackaged and
        -- quantized copies. Everything else is a community fine-tune or merge.
        case
            when regexp_like(lm, '^(comfy-org|black-forest-labs|circlestone-labs)__.*') then 'Original'
            when regexp_like(lm, '^(minimax_|z_image|qwen_image|qwen-image|flux-2-klein|flux2_|flux2-dev|flux1-|flux.1-|krea2_|krea2turboofficialcomfy|ltx-2|ltx-video|wan2\\.|wan_|sd_xl|sd3|v1-5-pruned|v2-1_|anima-|anima_turbov|anima_aesthetic|sam3|seedvr2|trellis|pixal3d|triposplat|stable_audio|stable-audio|acestep|ace_step|ideogram|moss_image|fastvideo|firered|lotus|sdpose|svd|hunyuan|hidream|chroma1|chroma-|omnigen2|ernie-image|boogu|mage_flow|ming_image|longcat|chrono_edit|pixeldit|pid_|kandinsky5|yue2|rt_detr|causal_forcing|newbie-image|illustrious-xl|noobai-xl|pony-v7|pony-diffusion|animagine-xl).*') then 'Original'
            else 'Community'
        end as kind
    from classified
    -- Checkpoints with explicit names are left out of a public page.
    where not regexp_like(lm, '.*(nsfw|hentai|porn|nude|naked|xxx|lewd|erotic|sex|uncensor|boob|pussy|futa|onlyfans|fembo|yiff).*')
),
agg as (
    select mode(type) as type, mode(kind) as kind, model,
           count(*) as jobs,
           median(wait_s) as p50_wait_s,
           percentile_cont(0.9) within group (order by wait_s) as p90_wait_s,
           median(gen_s) as p50_gen_s,
           percentile_cont(0.9) within group (order by gen_s) as p90_gen_s,
           sum(coalesce(gpu_seconds, 0)) as gpu_seconds
    from typed
    group by model
    having count(*) >= 100
)
select type, kind, model, jobs,
       round(p50_wait_s, 1) as p50_wait_s,
       round(p90_wait_s, 1) as p90_wait_s,
       round(p50_gen_s, 1) as p50_gen_s,
       round(p90_gen_s, 1) as p90_gen_s,
       round(gpu_seconds / nullif(sum(gpu_seconds) over (), 0), 5) as gpu_share
from agg
order by jobs desc
