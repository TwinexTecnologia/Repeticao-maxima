ALTER TABLE repeticao_maxima.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS art_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS art_product_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origin_reference TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'aprovado',
  ADD COLUMN IF NOT EXISTS stock_effect_applied BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE repeticao_maxima.estoque_movimentacoes
SET
  review_status = COALESCE(NULLIF(review_status, ''), 'aprovado'),
  stock_effect_applied = COALESCE(stock_effect_applied, movement_type = 'entrada'),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE review_status IS NULL
   OR review_status = ''
   OR stock_effect_applied IS NULL
   OR updated_at IS NULL;
