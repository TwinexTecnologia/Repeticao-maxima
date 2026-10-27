ALTER TABLE repeticao_maxima.profiles_usuarios
  ADD COLUMN IF NOT EXISTS nuvemshop_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS nuvemshop_customer_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nuvemshop_customer_email TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS profiles_usuarios_nuvemshop_customer_id_idx
  ON repeticao_maxima.profiles_usuarios(nuvemshop_customer_id);
