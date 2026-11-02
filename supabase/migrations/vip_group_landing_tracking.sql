create schema if not exists repeticao_maxima;

create table if not exists repeticao_maxima.vip_group_events (
  id bigserial primary key,
  created_at timestamptz not null default timezone('utc', now()),
  landing_slug text not null default 'grupo-vip',
  event_type text not null check (event_type in ('view', 'click')),
  visitor_id text not null,
  page_url text not null default '',
  referrer_url text not null default '',
  target_url text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_content text not null default '',
  utm_term text not null default '',
  device_type text not null default 'unknown'
);

create index if not exists vip_group_events_created_at_idx
  on repeticao_maxima.vip_group_events (created_at desc);

create index if not exists vip_group_events_event_type_idx
  on repeticao_maxima.vip_group_events (event_type);

create index if not exists vip_group_events_landing_slug_idx
  on repeticao_maxima.vip_group_events (landing_slug);

create index if not exists vip_group_events_visitor_id_idx
  on repeticao_maxima.vip_group_events (visitor_id);

create index if not exists vip_group_events_utm_campaign_idx
  on repeticao_maxima.vip_group_events (utm_campaign);
