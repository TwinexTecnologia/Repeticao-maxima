ALTER TABLE repeticao_maxima.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS correction_root_id UUID REFERENCES repeticao_maxima.estoque_movimentacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_parent_id UUID REFERENCES repeticao_maxima.estoque_movimentacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_role TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS correction_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correction_request_token TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

UPDATE repeticao_maxima.estoque_movimentacoes
SET
  correction_role = COALESCE(NULLIF(correction_role, ''), 'original'),
  correction_note = COALESCE(correction_note, ''),
  correction_root_id = COALESCE(correction_root_id, id)
WHERE correction_role IS NULL
   OR correction_role = ''
   OR correction_note IS NULL
   OR correction_root_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estoque_movimentacoes_correction_request_token_idx
  ON repeticao_maxima.estoque_movimentacoes(correction_request_token)
  WHERE correction_request_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_correction_root_id_idx
  ON repeticao_maxima.estoque_movimentacoes(correction_root_id);

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_correction_parent_id_idx
  ON repeticao_maxima.estoque_movimentacoes(correction_parent_id);

CREATE OR REPLACE FUNCTION repeticao_maxima.apply_stock_movement_correction(
  p_target_movement_id UUID,
  p_sku TEXT,
  p_color TEXT,
  p_size TEXT,
  p_quantity INTEGER,
  p_origin_reference TEXT DEFAULT '',
  p_notes TEXT DEFAULT '',
  p_request_token TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok BOOLEAN,
  message TEXT,
  root_movement_id UUID,
  reversal_movement_id UUID,
  correction_movement_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target repeticao_maxima.estoque_movimentacoes%ROWTYPE;
  v_active repeticao_maxima.estoque_movimentacoes%ROWTYPE;
  v_source_stock repeticao_maxima.estoque_base%ROWTYPE;
  v_target_stock repeticao_maxima.estoque_base%ROWTYPE;
  v_existing_request repeticao_maxima.estoque_movimentacoes%ROWTYPE;
  v_root_id UUID;
  v_reversal_id UUID;
  v_correction_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_requested_qty INTEGER := GREATEST(COALESCE(p_quantity, 0), 0);
  v_source_plain_before INTEGER := 0;
  v_source_plain_after_reversal INTEGER := 0;
  v_target_plain_before INTEGER := 0;
  v_target_plain_after INTEGER := 0;
  v_same_base BOOLEAN := FALSE;
  v_next_source_total INTEGER := 0;
  v_next_target_total INTEGER := 0;
BEGIN
  IF p_target_movement_id IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel identificar a baixa que sera corrigida.';
  END IF;

  IF BTRIM(COALESCE(p_sku, '')) = ''
     OR BTRIM(COALESCE(p_color, '')) = ''
     OR BTRIM(COALESCE(p_size, '')) = '' THEN
    RAISE EXCEPTION 'Selecione a base, a cor e o tamanho corretos antes de confirmar a correcao.';
  END IF;

  IF v_requested_qty <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade valida para corrigir a baixa.';
  END IF;

  IF BTRIM(COALESCE(p_request_token, '')) <> '' THEN
    SELECT *
    INTO v_existing_request
    FROM repeticao_maxima.estoque_movimentacoes
    WHERE correction_request_token = BTRIM(p_request_token)
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY
      SELECT
        TRUE,
        'Essa correcao ja foi aplicada anteriormente.',
        COALESCE(v_existing_request.correction_root_id, v_existing_request.id),
        NULL::UUID,
        v_existing_request.id;
      RETURN;
    END IF;
  END IF;

  SELECT *
  INTO v_target
  FROM repeticao_maxima.estoque_movimentacoes
  WHERE id = p_target_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nao foi possivel localizar a movimentacao original para corrigir.';
  END IF;

  v_root_id := COALESCE(v_target.correction_root_id, v_target.id);

  SELECT *
  INTO v_active
  FROM repeticao_maxima.estoque_movimentacoes
  WHERE COALESCE(correction_root_id, id) = v_root_id
    AND movement_type = 'saida'
    AND review_status = 'aprovado'
    AND stock_effect_applied = TRUE
    AND reversed_at IS NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa baixa nao possui um movimento ativo para corrigir.';
  END IF;

  SELECT *
  INTO v_source_stock
  FROM repeticao_maxima.estoque_base
  WHERE sku = v_active.sku
    AND color = v_active.color
    AND size = v_active.size
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nao foi possivel localizar a combinacao original no estoque.';
  END IF;

  SELECT *
  INTO v_target_stock
  FROM repeticao_maxima.estoque_base
  WHERE sku = BTRIM(p_sku)
    AND color = BTRIM(p_color)
    AND size = BTRIM(p_size)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nao existe a combinacao correta no estoque para receber a baixa.';
  END IF;

  v_same_base := v_source_stock.id = v_target_stock.id;
  v_source_plain_before := GREATEST(v_source_stock.total_qty - LEAST(v_source_stock.printed_qty, v_source_stock.total_qty), 0);
  v_source_plain_after_reversal := v_source_plain_before + v_active.quantity;

  IF v_same_base THEN
    IF v_source_plain_after_reversal < v_requested_qty THEN
      RAISE EXCEPTION 'Nao ha lisa suficiente para corrigir a baixa nessa mesma combinacao.';
    END IF;

    v_target_plain_before := v_source_plain_after_reversal;
    v_target_plain_after := v_target_plain_before - v_requested_qty;
    v_next_source_total := v_source_stock.total_qty + v_active.quantity - v_requested_qty;

    UPDATE repeticao_maxima.estoque_base
    SET
      total_qty = GREATEST(v_next_source_total, 0),
      updated_at = v_now
    WHERE id = v_source_stock.id;
  ELSE
    v_target_plain_before := GREATEST(v_target_stock.total_qty - LEAST(v_target_stock.printed_qty, v_target_stock.total_qty), 0);

    IF v_target_plain_before < v_requested_qty THEN
      RAISE EXCEPTION 'Nao ha lisa suficiente na combinacao correta para aplicar a correcao.';
    END IF;

    v_target_plain_after := v_target_plain_before - v_requested_qty;
    v_next_source_total := v_source_stock.total_qty + v_active.quantity;
    v_next_target_total := v_target_stock.total_qty - v_requested_qty;

    UPDATE repeticao_maxima.estoque_base
    SET
      total_qty = GREATEST(v_next_source_total, 0),
      updated_at = v_now
    WHERE id = v_source_stock.id;

    UPDATE repeticao_maxima.estoque_base
    SET
      total_qty = GREATEST(v_next_target_total, 0),
      updated_at = v_now
    WHERE id = v_target_stock.id;
  END IF;

  INSERT INTO repeticao_maxima.estoque_movimentacoes (
    stock_item_id,
    sku,
    color,
    size,
    movement_date,
    movement_type,
    quantity,
    plain_before,
    plain_after,
    art_name,
    art_product_id,
    origin_type,
    origin_reference,
    reason_category,
    reason_text,
    source_module,
    review_status,
    stock_effect_applied,
    updated_at,
    correction_root_id,
    correction_parent_id,
    correction_role,
    correction_note
  )
  VALUES (
    v_source_stock.id,
    v_source_stock.sku,
    v_source_stock.color,
    v_source_stock.size,
    CURRENT_DATE,
    'entrada',
    v_active.quantity,
    v_source_plain_before,
    v_source_plain_after_reversal,
    v_active.art_name,
    v_active.art_product_id,
    COALESCE(NULLIF(v_active.origin_type, ''), 'correcao'),
    COALESCE(NULLIF(BTRIM(p_origin_reference), ''), v_active.origin_reference),
    'estorno_correcao_baixa',
    COALESCE(NULLIF(BTRIM(p_notes), ''), 'Estorno da baixa anterior para aplicar a combinacao correta.'),
    'estoque_correcao',
    'aprovado',
    TRUE,
    v_now,
    v_root_id,
    v_active.id,
    'estorno',
    COALESCE(BTRIM(p_notes), '')
  )
  RETURNING id INTO v_reversal_id;

  INSERT INTO repeticao_maxima.estoque_movimentacoes (
    stock_item_id,
    sku,
    color,
    size,
    movement_date,
    movement_type,
    quantity,
    plain_before,
    plain_after,
    art_name,
    art_product_id,
    origin_type,
    origin_reference,
    reason_category,
    reason_text,
    source_module,
    review_status,
    stock_effect_applied,
    updated_at,
    correction_root_id,
    correction_parent_id,
    correction_role,
    correction_note,
    correction_request_token
  )
  VALUES (
    v_target_stock.id,
    BTRIM(p_sku),
    BTRIM(p_color),
    BTRIM(p_size),
    CURRENT_DATE,
    'saida',
    v_requested_qty,
    v_target_plain_before,
    v_target_plain_after,
    v_active.art_name,
    v_active.art_product_id,
    COALESCE(NULLIF(v_active.origin_type, ''), 'correcao'),
    COALESCE(NULLIF(BTRIM(p_origin_reference), ''), v_active.origin_reference),
    'correcao_baixa',
    COALESCE(NULLIF(BTRIM(p_notes), ''), 'Baixa corrigida para a combinacao certa.'),
    'estoque_correcao',
    'aprovado',
    TRUE,
    v_now,
    v_root_id,
    v_active.id,
    'correcao',
    COALESCE(BTRIM(p_notes), ''),
    NULLIF(BTRIM(p_request_token), '')
  )
  RETURNING id INTO v_correction_id;

  UPDATE repeticao_maxima.estoque_movimentacoes
  SET
    reversed_at = v_now,
    updated_at = v_now
  WHERE id = v_active.id
    AND reversed_at IS NULL;

  RETURN QUERY
  SELECT
    TRUE,
    'Correcao aplicada com estorno da baixa anterior e nova baixa registrada.',
    v_root_id,
    v_reversal_id,
    v_correction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION repeticao_maxima.apply_stock_movement_correction(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;
