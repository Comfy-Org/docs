-- Generations per week, model and use case for partner API calls (Router, Cloud and
-- local API nodes), {start} (a Monday) up to {end} (the Monday after the last full
-- week). A generation is a call, or the number of outputs a call asks for (1 to 16).
-- Only shares and growth reach the page. {start} and {end} are filled in by
-- fetch-rankings-sources.py.
with bounds as (
    select '{start}'::date as start_week, '{end}'::date as end_week
),
calls as (
    select
        c.call_id,
        c.created_at,
        lower(coalesce(c.api_name, ''))                         as api,
        c.api_name                                              as api_name,
        c.model                                                 as model_raw,
        lower(c.model)                                          as m,
        lower(coalesce(p:endpoint::string, ''))                 as ep,
        lower(coalesce(p:video_type::string, ''))               as vt,
        lower(coalesce(p:mode::string, ''))                     as md,
        (coalesce(p:input_images::float, 0) > 0
          or coalesce(p:input_image_tokens::float, 0) > 0
          or coalesce(p:num_reference_images::float, 0) > 0
          or p:has_reference_images::boolean = true
          or lower(coalesce(p:operation::string, '')) = 'image_to_image') as has_img,
        (coalesce(p:input_video_tokens::float, 0) > 0
          or p:input_video_duration is not null)                as has_vid,
        greatest(1, least(16, coalesce(
            try_to_number(p:generated_images::string), try_to_number(p:num_images::string),
            try_to_number(p:n::string), try_to_number(p:number_results::string),
            try_to_number(p:sample_count::string), try_to_number(p:num_outputs::string), 1))) as outputs
    from ANALYTICS_PROD.STAGING.INT_PARTNER_API_CALLS c
    cross join bounds bd
    left join ANALYTICS_PROD.STAGING.STG_REGISTRY__AUDIT_LOGS a
        on c.billing_rail = 'legacy' and a.audit_log_id = c.usage_row_id
    left join ANALYTICS_PROD.STAGING.STG_CLOUD__BILLING_EVENTS b
        on c.billing_rail = 'cloud' and b.billing_event_id = c.usage_row_id,
    lateral (select coalesce(try_parse_json(a.params), b.properties) as p) j
    where c.created_at >= bd.start_week
      and c.created_at <  bd.end_week
      -- Calls with no model name (some Kling, Recraft and Freepik calls) can't be ranked.
      and c.model is not null
    qualify row_number() over (partition by c.call_id order by c.created_at) = 1
),
classified as (
    select *,
        case
            -- LLM / text models: excluded
            when ep in ('responses', 'v1/messages', 'api/v1/chat/completions', 'api/v3/responses')
              or api in ('anthropic')
              or (api = 'openrouter' and ep not like '%image%')
              or (api = 'vertexai' and m like 'gemini%' and m not like '%image%' and m not like '%banana%')
              or m regexp '^(gpt-[0-9].*|o[0-9].*|claude.*|deepseek.*|qwen[0-9].*|grok-[0-9].*|seed-2.*)'
                then null
            -- Speech
            when ep regexp '.*(tts|text-to-speech|speech-to-speech|speech-to-text|asr|voices|text-to-dialogue).*'
                then 'Speech'
            -- Audio (SFX / music)
            when ep regexp '.*(sound-generation|t2m|v2m|music|sfx).*' or m like '%sfx%'
                then 'Audio'
            -- 3D
            when ep like '%3d%' or api in ('tripo', 'rodin') or api like 'meshy%'
                then '3D'
            -- Video, explicit request type first
            when vt = 'image-to-video' then 'Image to video'
            when vt = 'video-to-video' then 'Video to video'
            when vt = 'text-to-video'  then 'Text to video'
            when md in ('image_to_video', 'reference_to_video') then 'Image to video'
            when md in ('text_to_video') then 'Text to video'
            when ep regexp '.*(video_to_video|videoedit|video-edit|video/edit|videos/edits|extensions|video_regeneration|motion-control|lip-sync|enhance-video|video-upscale|flashvsr|seedvr|switchx|v2/generate).*'
              or m regexp '.*(aleph|sync-|videoedit|video-edit).*'
                then 'Video to video'
            when ep regexp '.*(text2video|text-to-video).*' then 'Text to video'
            when ep regexp '.*(image2video|img2video|image-to-video|start-end2video|reference2video|reference-to-video|avatar).*'
                then 'Image to video'
            when ep regexp '.*(video|contents/generations/tasks|predictlongrunning).*'
              or m regexp '.*(video|seedance|veo|ltx|ray-|hailuo|omni-1|omni-flash|heygen).*'
              or api in ('gemini-interactions', 'heygen')
                then case when has_vid then 'Video to video'
                          when has_img then 'Image to video'
                          else 'Text to video' end
            -- Image tools
            when ep regexp '.*(remove_?background|upscal|enhance|increase_resolution|vectorize|erase|expand|skin-enhancer|crispupscale|styles|vto|flux-tools|relight).*'
              or api in ('topaz', 'hitpaw')
                then 'Image tools'
            -- Image edit vs text to image
            when ep regexp '.*(edit|image2image|kontext|fill|character-ref).*' or has_img
                then 'Image edit'
            else 'Text to image'
        end as use_case
    from calls
)
-- LLM calls (use_case null) are dropped; build-rankings-data.py turns use cases into output types.
select
    dateadd(day, 1 - dayofweekiso(created_at::date), created_at::date)::date as week,
    model_raw::varchar                                                       as model,
    api_name::varchar                                                        as api_name,
    use_case::varchar                                                        as use_case,
    count(*)                                                                 as calls,
    sum(outputs)                                                             as generations
from classified
where use_case is not null
group by 1, 2, 3, 4
order by 1, 6 desc
