create schema if not exists repeticao_maxima;

drop view if exists repeticao_maxima.vip_group_daily_metrics;

create view repeticao_maxima.vip_group_daily_metrics as
with normalized_events as (
  select
    timezone('America/Sao_Paulo', created_at)::date as metric_date,
    created_at,
    coalesce(nullif(trim(landing_slug), ''), 'grupo-vip') as landing_slug,
    coalesce(nullif(trim(utm_source), ''), 'Direto') as utm_source,
    coalesce(nullif(trim(utm_medium), ''), 'Sem medium') as utm_medium,
    coalesce(nullif(trim(utm_campaign), ''), 'Sem campanha') as utm_campaign,
    coalesce(nullif(trim(utm_content), ''), 'Sem conteudo') as utm_content,
    coalesce(nullif(trim(utm_term), ''), 'Sem termo') as utm_term,
    coalesce(nullif(trim(device_type), ''), 'unknown') as device_type,
    event_type,
    visitor_id
  from repeticao_maxima.vip_group_events
)
select
  metric_date,
  landing_slug,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  device_type,
  count(*) filter (where event_type = 'view')::bigint as total_views,
  count(*) filter (where event_type = 'click')::bigint as total_clicks,
  count(distinct visitor_id) filter (where event_type = 'view')::bigint as unique_visitors,
  count(distinct visitor_id) filter (where event_type = 'click')::bigint as unique_click_visitors,
  round(
    (count(*) filter (where event_type = 'click'))::numeric
    / nullif(count(*) filter (where event_type = 'view'), 0),
    4
  ) as ctr,
  min(created_at) as first_event_at_utc,
  max(created_at) as last_event_at_utc
from normalized_events
group by
  metric_date,
  landing_slug,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  device_type;
