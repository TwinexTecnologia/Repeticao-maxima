CREATE UNIQUE INDEX IF NOT EXISTS estoque_movimentacoes_nuvemshop_origin_unique_idx
  ON repeticao_maxima.estoque_movimentacoes(source_module, origin_reference)
  WHERE source_module = 'nuvemshop_webhook'
    AND correction_role = 'original'
    AND origin_reference <> '';

CREATE OR REPLACE FUNCTION repeticao_maxima.apply_paid_order_stock_movement(
  p_sku TEXT,
  p_color TEXT,
  p_size TEXT,
  p_quantity INTEGER,
  p_movement_date DATE DEFAULT CURRENT_DATE,
  p_origin_reference TEXT DEFAULT '',
  p_origin_type TEXT DEFAULT 'venda',
  p_art_name TEXT DEFAULT '',
  p_art_product_id TEXT DEFAULT '',
  p_reason_category TEXT DEFAULT 'saida_automatica_venda',
  p_reason_text TEXT DEFAULT '',
  p_source_module TEXT DEFAULT 'nuvemshop_webhook'
)
RETURNS TABLE (
  ok BOOLEAN,
  duplicate BOOLEAN,
  applied BOOLEAN,
  review_status TEXT,
  movement_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing repeticao_maxima.estoque_movimentacoes%ROWTYPE;
  v_stock repeticao_maxima.estoque_base%ROWTYPE;
  v_plain_before INTEGER := 0;
  v_plain_after INTEGER := 0;
  v_movement_id UUID;
BEGIN
  IF COALESCE(TRIM(p_origin_reference), '') = '' THEN
    RAISE EXCEPTION 'A referencia da origem da venda e obrigatoria.';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RETURN QUERY
    SELECT
      TRUE,
      FALSE,
      FALSE,
      'ignorado'::TEXT,
      NULL::UUID,
      'Item ignorado por quantidade invalida.';
    RETURN;
  END IF;

  SELECT *
  INTO v_existing
  FROM repeticao_maxima.estoque_movimentacoes
  WHERE source_module = p_source_module
    AND origin_reference = p_origin_reference
    AND correction_role = 'original'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      TRUE,
      TRUE,
      COALESCE(v_existing.stock_effect_applied, FALSE),
      COALESCE(v_existing.review_status, 'aprovado'),
      v_existing.id,
      'Pedido ja processado anteriormente.';
    RETURN;
  END IF;

  SELECT *
  INTO v_stock
  FROM repeticao_maxima.estoque_base
  WHERE sku = p_sku
    AND color = p_color
    AND size = p_size
  FOR UPDATE;

  IF FOUND THEN
    v_plain_before := GREATEST(
      COALESCE(v_stock.total_qty, 0) - LEAST(COALESCE(v_stock.printed_qty, 0), COALESCE(v_stock.total_qty, 0)),
      0
    );
  END IF;

  IF NOT FOUND OR v_stock.id IS NULL THEN
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
      updated_at
    )
    VALUES (
      NULL,
      p_sku,
      p_color,
      p_size,
      COALESCE(p_movement_date, CURRENT_DATE),
      'saida',
      p_quantity,
      0,
      0,
      COALESCE(p_art_name, ''),
      COALESCE(p_art_product_id, ''),
      COALESCE(p_origin_type, 'venda'),
      p_origin_reference,
      'saida_site_pendente_alerta',
      COALESCE(NULLIF(TRIM(p_reason_text), ''), 'Venda recebida sem combinacao valida no estoque.'),
      COALESCE(NULLIF(TRIM(p_source_module), ''), 'nuvemshop_webhook'),
      'pendente',
      FALSE,
      NOW()
    )
    RETURNING id INTO v_movement_id;

    RETURN QUERY
    SELECT
      TRUE,
      FALSE,
      FALSE,
      'pendente'::TEXT,
      v_movement_id,
      'Venda registrada em pendencia porque a combinacao nao existe no estoque.';
    RETURN;
  END IF;

  IF v_plain_before < p_quantity THEN
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
      updated_at
    )
    VALUES (
      v_stock.id,
      p_sku,
      p_color,
      p_size,
      COALESCE(p_movement_date, CURRENT_DATE),
      'saida',
      p_quantity,
      v_plain_before,
      v_plain_before,
      COALESCE(p_art_name, ''),
      COALESCE(p_art_product_id, ''),
      COALESCE(p_origin_type, 'venda'),
      p_origin_reference,
      'saida_site_pendente_alerta',
      COALESCE(
        NULLIF(TRIM(p_reason_text), ''),
        FORMAT(
          'Venda recebida com estoque insuficiente. Restam %s unidades, mas o pedido exige %s.',
          v_plain_before,
          p_quantity
        )
      ),
      COALESCE(NULLIF(TRIM(p_source_module), ''), 'nuvemshop_webhook'),
      'pendente',
      FALSE,
      NOW()
    )
    RETURNING id INTO v_movement_id;

    RETURN QUERY
    SELECT
      TRUE,
      FALSE,
      FALSE,
      'pendente'::TEXT,
      v_movement_id,
      'Venda registrada em pendencia por falta de estoque.';
    RETURN;
  END IF;

  UPDATE repeticao_maxima.estoque_base
  SET
    total_qty = GREATEST(total_qty - p_quantity, 0),
    updated_at = NOW()
  WHERE id = v_stock.id
  RETURNING * INTO v_stock;

  v_plain_after := GREATEST(
    COALESCE(v_stock.total_qty, 0) - LEAST(COALESCE(v_stock.printed_qty, 0), COALESCE(v_stock.total_qty, 0)),
    0
  );

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
    updated_at
  )
  VALUES (
    v_stock.id,
    p_sku,
    p_color,
    p_size,
    COALESCE(p_movement_date, CURRENT_DATE),
    'saida',
    p_quantity,
    v_plain_before,
    v_plain_after,
    COALESCE(p_art_name, ''),
    COALESCE(p_art_product_id, ''),
    COALESCE(p_origin_type, 'venda'),
    p_origin_reference,
    COALESCE(NULLIF(TRIM(p_reason_category), ''), 'saida_automatica_venda'),
    COALESCE(NULLIF(TRIM(p_reason_text), ''), 'Baixa automatica do pedido pago na Nuvemshop.'),
    COALESCE(NULLIF(TRIM(p_source_module), ''), 'nuvemshop_webhook'),
    'aprovado',
    TRUE,
    NOW()
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY
  SELECT
    TRUE,
    FALSE,
    TRUE,
    'aprovado'::TEXT,
    v_movement_id,
    'Baixa automatica aplicada com sucesso.';
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM repeticao_maxima.estoque_movimentacoes
    WHERE source_module = COALESCE(NULLIF(TRIM(p_source_module), ''), 'nuvemshop_webhook')
      AND origin_reference = p_origin_reference
      AND correction_role = 'original'
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
      TRUE,
      TRUE,
      COALESCE(v_existing.stock_effect_applied, FALSE),
      COALESCE(v_existing.review_status, 'aprovado'),
      v_existing.id,
      'Pedido ja processado anteriormente.';
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION repeticao_maxima.apply_paid_order_stock_movement(
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  DATE,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO anon, authenticated, service_role;
