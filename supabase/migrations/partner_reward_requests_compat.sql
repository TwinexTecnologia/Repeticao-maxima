ALTER TABLE repeticao_maxima.parceiros_solicitacoes_resgate
  ADD COLUMN IF NOT EXISTS admin_coupon_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS partner_seen_at TIMESTAMPTZ;

ALTER TABLE repeticao_maxima.parceiros_solicitacoes_resgate
  DROP CONSTRAINT IF EXISTS parceiros_solicitacoes_resgate_status_check;

ALTER TABLE repeticao_maxima.parceiros_solicitacoes_resgate
  ADD CONSTRAINT parceiros_solicitacoes_resgate_status_check
  CHECK (status IN ('pendente', 'aprovado', 'pago', 'recusado'));
