create schema if not exists repeticao_maxima;

create table if not exists repeticao_maxima.financeiro_configuracoes (
  id text primary key default 'default',
  product_cost numeric(10, 2) not null default 30,
  print_cost numeric(10, 2) not null default 19,
  packaging_cost numeric(10, 2) not null default 2,
  operation_cost numeric(10, 2) not null default 0,
  freight_subsidy numeric(10, 2) not null default 0,
  desired_margin numeric(10, 2) not null default 25,
  coupon_percent numeric(10, 2) not null default 10,
  nuvem_pix_percent numeric(10, 2) not null default 0.99,
  nuvem_pix_fixed numeric(10, 2) not null default 0,
  nuvem_card_1_percent numeric(10, 2) not null default 5.19,
  nuvem_card_1_fixed numeric(10, 2) not null default 0.35,
  nuvem_card_2_percent numeric(10, 2) not null default 6.38,
  nuvem_card_2_fixed numeric(10, 2) not null default 0.35,
  nuvem_card_3_percent numeric(10, 2) not null default 10.92,
  nuvem_card_3_fixed numeric(10, 2) not null default 0.35,
  unit_quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 99,
  combo_quantity integer not null default 3,
  combo_price numeric(10, 2) not null default 199,
  tiktok_monthly_net numeric(10, 2) not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financeiro_configuracoes_default_id check (id = 'default')
);

insert into repeticao_maxima.financeiro_configuracoes (id)
values ('default')
on conflict (id) do nothing;

grant usage on schema repeticao_maxima to anon, authenticated, service_role;
grant select, insert, update on repeticao_maxima.financeiro_configuracoes to service_role;
