CREATE SCHEMA IF NOT EXISTS repeticao_maxima;

CREATE TABLE IF NOT EXISTS repeticao_maxima.financeiro_configuracoes (
  id TEXT PRIMARY KEY DEFAULT 'default',
  product_cost NUMERIC(12, 2) NOT NULL DEFAULT 28,
  print_cost NUMERIC(12, 2) NOT NULL DEFAULT 14,
  packaging_cost NUMERIC(12, 2) NOT NULL DEFAULT 3.5,
  operation_cost NUMERIC(12, 2) NOT NULL DEFAULT 2,
  freight_subsidy NUMERIC(12, 2) NOT NULL DEFAULT 0,
  desired_margin NUMERIC(6, 3) NOT NULL DEFAULT 22,
  coupon_percent NUMERIC(6, 3) NOT NULL DEFAULT 10,
  nuvem_pix_percent NUMERIC(6, 3) NOT NULL DEFAULT 0.99,
  nuvem_pix_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0,
  nuvem_card_1_percent NUMERIC(6, 3) NOT NULL DEFAULT 5.19,
  nuvem_card_1_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0.35,
  nuvem_card_2_percent NUMERIC(6, 3) NOT NULL DEFAULT 8.96,
  nuvem_card_2_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0.35,
  nuvem_card_3_percent NUMERIC(6, 3) NOT NULL DEFAULT 10.92,
  nuvem_card_3_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0.35,
  unit_quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 99,
  combo_quantity INTEGER NOT NULL DEFAULT 3,
  combo_price NUMERIC(12, 2) NOT NULL DEFAULT 199,
  tiktok_monthly_net NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 'default'),
  CHECK (unit_quantity > 0),
  CHECK (combo_quantity > 0)
);

ALTER TABLE repeticao_maxima.financeiro_configuracoes
  ADD COLUMN IF NOT EXISTS tiktok_monthly_net NUMERIC(12, 2) NOT NULL DEFAULT 0;

INSERT INTO repeticao_maxima.financeiro_configuracoes (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
