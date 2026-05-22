CREATE SCHEMA IF NOT EXISTS repeticao_maxima;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT USAGE ON SCHEMA repeticao_maxima TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.dividas_internas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date DATE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta',
  impact TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'outro',
  billing_frequency TEXT NOT NULL DEFAULT 'mensal',
  installments_total INTEGER NOT NULL DEFAULT 1,
  installment_number INTEGER NOT NULL DEFAULT 1,
  group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount >= 0),
  CHECK (status IN ('aberta', 'parcial', 'paga', 'cancelada', 'consumido')),
  CHECK (payment_method IN ('pix', 'boleto', 'cartao', 'transferencia', 'dinheiro', 'outro')),
  CHECK (billing_frequency IN ('semanal', 'quinzenal', 'mensal')),
  CHECK (installments_total >= 1),
  CHECK (installment_number >= 1),
  CHECK (installment_number <= installments_total)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.dividas_internas TO anon, authenticated, service_role;

ALTER TABLE repeticao_maxima.dividas_internas
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS billing_frequency TEXT NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS installments_total INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS group_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS repeticao_maxima.estoque_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  total_qty INTEGER NOT NULL DEFAULT 0,
  printed_qty INTEGER NOT NULL DEFAULT 0,
  reserved_qty INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 10,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total_qty >= 0),
  CHECK (printed_qty >= 0),
  CHECK (reserved_qty >= 0),
  CHECK (reorder_point >= 0),
  CHECK (lead_time_days >= 0),
  CHECK (printed_qty <= total_qty),
  CHECK (reserved_qty <= total_qty - printed_qty),
  UNIQUE (sku, color, size)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.estoque_base TO anon, authenticated, service_role;

ALTER TABLE repeticao_maxima.estoque_base
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS repeticao_maxima.estoque_dtf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nuvemshop_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  art_type TEXT NOT NULL DEFAULT 'outro',
  available_qty INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 5,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (art_type IN ('minimalista', 'full', 'outro')),
  CHECK (available_qty >= 0),
  CHECK (reorder_point >= 0),
  CHECK (lead_time_days >= 0),
  UNIQUE (nuvemshop_product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.estoque_dtf TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.promocoes_carrinho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  rule_mode TEXT NOT NULL DEFAULT 'categoria',
  category_id TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  category_ids TEXT[] NOT NULL DEFAULT '{}',
  category_names TEXT[] NOT NULL DEFAULT '{}',
  combo_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  product_names TEXT[] NOT NULL DEFAULT '{}',
  minimum_quantity INTEGER NOT NULL DEFAULT 3,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (rule_mode IN ('categoria', 'misto')),
  CHECK (minimum_quantity >= 1),
  CHECK (discount_amount >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.promocoes_carrinho TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.parceiros_cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  coupon_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'influenciador',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (role IN ('influenciador', 'atleta')),
  UNIQUE (coupon_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.parceiros_cupons TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.parceiros_resgates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  coupon_code TEXT NOT NULL DEFAULT '',
  partner_role TEXT NOT NULL DEFAULT 'influenciador',
  stock_item_id UUID REFERENCES repeticao_maxima.estoque_base(id) ON DELETE SET NULL,
  sku TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  granted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'entregue',
  create_marketing_debt BOOLEAN NOT NULL DEFAULT FALSE,
  debt_id UUID REFERENCES repeticao_maxima.dividas_internas(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (partner_role IN ('influenciador', 'atleta')),
  CHECK (status IN ('previsto', 'entregue', 'compensado')),
  CHECK (quantity >= 1),
  CHECK (unit_cost >= 0),
  CHECK (total_cost >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.parceiros_resgates TO anon, authenticated, service_role;

ALTER TABLE repeticao_maxima.estoque_dtf
  ADD COLUMN IF NOT EXISTS art_type TEXT NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS available_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

ALTER TABLE repeticao_maxima.promocoes_carrinho
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rule_mode TEXT NOT NULL DEFAULT 'categoria',
  ADD COLUMN IF NOT EXISTS category_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_names TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS combo_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product_names TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS minimum_quantity INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nuvemshop_promotion_id TEXT,
  ADD COLUMN IF NOT EXISTS nuvemshop_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS nuvemshop_message TEXT NOT NULL DEFAULT 'Ainda nao sincronizada com a Nuvemshop.',
  ADD COLUMN IF NOT EXISTS nuvemshop_callback_url TEXT,
  ADD COLUMN IF NOT EXISTS nuvemshop_last_synced_at TIMESTAMPTZ;

ALTER TABLE repeticao_maxima.parceiros_cupons
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coupon_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'influenciador',
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

ALTER TABLE repeticao_maxima.parceiros_resgates
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coupon_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS partner_role TEXT NOT NULL DEFAULT 'influenciador',
  ADD COLUMN IF NOT EXISTS stock_item_id UUID REFERENCES repeticao_maxima.estoque_base(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS granted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'entregue',
  ADD COLUMN IF NOT EXISTS create_marketing_debt BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS debt_id UUID REFERENCES repeticao_maxima.dividas_internas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

ALTER DEFAULT PRIVILEGES IN SCHEMA repeticao_maxima
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.profiles_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  coupon_partner_id UUID UNIQUE REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  user_type TEXT NOT NULL DEFAULT 'parceiro',
  partner_type TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  shirt_size TEXT NOT NULL DEFAULT '',
  payout_method TEXT NOT NULL DEFAULT 'pix',
  pix_key TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_agency TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_account_type TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_type IN ('funcionario', 'parceiro')),
  CHECK (partner_type IS NULL OR partner_type IN ('influenciador', 'atleta', 'afiliado')),
  CHECK (payout_method IN ('pix', 'bancario'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.profiles_usuarios TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.permissoes_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES repeticao_maxima.profiles_usuarios(id) ON DELETE CASCADE,
  can_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  can_compras BOOLEAN NOT NULL DEFAULT FALSE,
  can_estoque BOOLEAN NOT NULL DEFAULT FALSE,
  can_pedidos BOOLEAN NOT NULL DEFAULT FALSE,
  can_financeiro BOOLEAN NOT NULL DEFAULT FALSE,
  can_nuvemshop BOOLEAN NOT NULL DEFAULT FALSE,
  can_influenciadores BOOLEAN NOT NULL DEFAULT FALSE,
  can_empresa BOOLEAN NOT NULL DEFAULT FALSE,
  can_usuarios BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.permissoes_usuario TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS repeticao_maxima.parceiros_solicitacoes_resgate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES repeticao_maxima.profiles_usuarios(id) ON DELETE CASCADE,
  coupon_partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  coupon_code TEXT NOT NULL DEFAULT '',
  partner_role TEXT NOT NULL DEFAULT 'influenciador',
  request_type TEXT NOT NULL DEFAULT 'roupa',
  support_goal TEXT NOT NULL DEFAULT '',
  requested_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  available_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  minimum_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  window_start_date DATE,
  window_end_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  notes TEXT NOT NULL DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (partner_role IN ('influenciador', 'atleta')),
  CHECK (request_type IN ('roupa', 'apoio')),
  CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  CHECK (requested_amount >= 0),
  CHECK (available_amount >= 0),
  CHECK (minimum_amount >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repeticao_maxima.parceiros_solicitacoes_resgate TO anon, authenticated, service_role;

ALTER TABLE repeticao_maxima.profiles_usuarios
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS coupon_partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'parceiro',
  ADD COLUMN IF NOT EXISTS partner_type TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS shirt_size TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS pix_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_agency TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

ALTER TABLE repeticao_maxima.permissoes_usuario
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES repeticao_maxima.profiles_usuarios(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS can_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_compras BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_estoque BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_pedidos BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_financeiro BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_nuvemshop BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_influenciadores BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_empresa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_usuarios BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE repeticao_maxima.parceiros_solicitacoes_resgate
  ADD COLUMN IF NOT EXISTS user_profile_id UUID REFERENCES repeticao_maxima.profiles_usuarios(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS coupon_partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coupon_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS partner_role TEXT NOT NULL DEFAULT 'influenciador',
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'roupa',
  ADD COLUMN IF NOT EXISTS support_goal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_start_date DATE,
  ADD COLUMN IF NOT EXISTS window_end_date DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO repeticao_maxima.dividas_internas (
  title,
  category,
  due_date,
  amount,
  status,
  impact,
  payment_method,
  billing_frequency,
  installments_total,
  installment_number,
  group_id
)
VALUES
  ('Pedido atual da fabrica', 'Fornecedor', CURRENT_DATE + INTERVAL '15 day', 2000, 'aberta', 'Primeira parcela do lote atual', 'transferencia', 'mensal', 3, 1, gen_random_uuid()),
  ('Pedido atual da fabrica', 'Fornecedor', CURRENT_DATE + INTERVAL '30 day', 2000, 'aberta', 'Segunda parcela do lote atual', 'transferencia', 'mensal', 3, 2, gen_random_uuid()),
  ('Cartao operacional', 'Cartao', CURRENT_DATE + INTERVAL '12 day', 1434, 'aberta', 'Embalagem, frete e pequenas compras', 'cartao', 'mensal', 1, 1, gen_random_uuid())
ON CONFLICT DO NOTHING;

INSERT INTO repeticao_maxima.estoque_base (
  sku,
  color,
  size,
  total_qty,
  printed_qty,
  reserved_qty,
  reorder_point,
  lead_time_days,
  notes
)
VALUES
  ('Oversized', 'Preta', 'M', 30, 8, 5, 25, 10, 'Comprar junto no proximo lote'),
  ('Oversized', 'Preta', 'G', 24, 4, 3, 20, 10, 'Monitorar se o ritmo subir'),
  ('Oversized', 'Branca', 'M', 28, 3, 2, 18, 10, 'Saudavel por enquanto'),
  ('Oversized', 'Roxa', 'G', 18, 5, 2, 12, 10, 'Pode esperar a proxima leitura'),
  ('Minimalista', 'Branca', 'P', 21, 9, 6, 15, 10, 'Estampar so o necessario')
ON CONFLICT (sku, color, size) DO NOTHING;
