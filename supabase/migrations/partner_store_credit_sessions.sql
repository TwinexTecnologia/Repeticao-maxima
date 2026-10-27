ALTER TABLE repeticao_maxima.parceiros_solicitacoes_resgate
  ADD COLUMN IF NOT EXISTS consumed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS repeticao_maxima.parceiros_sessoes_credito_loja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES repeticao_maxima.parceiros_solicitacoes_resgate(id) ON DELETE CASCADE,
  user_profile_id UUID NOT NULL REFERENCES repeticao_maxima.profiles_usuarios(id) ON DELETE CASCADE,
  coupon_partner_id UUID REFERENCES repeticao_maxima.parceiros_cupons(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  coupon_code TEXT NOT NULL DEFAULT '',
  partner_role TEXT NOT NULL DEFAULT 'influenciador',
  promotion_id TEXT NOT NULL DEFAULT '',
  session_token TEXT NOT NULL DEFAULT '',
  approved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  consumed_amount_snapshot NUMERIC(12, 2) NOT NULL DEFAULT 0,
  available_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'ativa',
  order_id TEXT,
  order_number TEXT,
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (partner_role IN ('influenciador', 'atleta')),
  CHECK (approved_amount >= 0),
  CHECK (consumed_amount_snapshot >= 0),
  CHECK (available_amount >= 0),
  CHECK (status IN ('ativa', 'consumida', 'expirada', 'cancelada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS parceiros_sessoes_credito_loja_session_token_key
  ON repeticao_maxima.parceiros_sessoes_credito_loja(session_token);

CREATE UNIQUE INDEX IF NOT EXISTS parceiros_sessoes_credito_loja_promotion_id_key
  ON repeticao_maxima.parceiros_sessoes_credito_loja(promotion_id);

CREATE INDEX IF NOT EXISTS parceiros_sessoes_credito_loja_request_status_idx
  ON repeticao_maxima.parceiros_sessoes_credito_loja(request_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON repeticao_maxima.parceiros_sessoes_credito_loja
  TO anon, authenticated, service_role;
