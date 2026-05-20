CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil VARCHAR(30) NOT NULL DEFAULT 'admin',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plataformas (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL UNIQUE,
  tipo VARCHAR(40),
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE formas_pagamento (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL UNIQUE,
  tipo VARCHAR(40),
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE produtos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  sku_base VARCHAR(60),
  categoria VARCHAR(80),
  descricao TEXT,
  preco_padrao NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_padrao NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE artes (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  codigo VARCHAR(60) UNIQUE,
  descricao TEXT,
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cores (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL UNIQUE,
  codigo VARCHAR(30),
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tamanhos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(20) NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE influenciadores (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  codigo_rastreio VARCHAR(80) UNIQUE,
  rede_social VARCHAR(60),
  usuario_rede VARCHAR(120),
  percentual_comissao NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT
);

CREATE TABLE variacoes_produto (
  id BIGSERIAL PRIMARY KEY,
  produto_id BIGINT NOT NULL REFERENCES produtos(id),
  arte_id BIGINT REFERENCES artes(id),
  cor_id BIGINT NOT NULL REFERENCES cores(id),
  tamanho_id BIGINT NOT NULL REFERENCES tamanhos(id),
  sku VARCHAR(80) UNIQUE,
  preco_venda NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estoque_atual INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE pedidos (
  id BIGSERIAL PRIMARY KEY,
  numero_externo VARCHAR(80),
  plataforma_id BIGINT NOT NULL REFERENCES plataformas(id),
  forma_pagamento_id BIGINT REFERENCES formas_pagamento(id),
  parcelas INTEGER NOT NULL DEFAULT 1,
  frete_gratis BOOLEAN NOT NULL DEFAULT FALSE,
  cliente_nome VARCHAR(160),
  cliente_documento VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'novo',
  status_producao VARCHAR(30) NOT NULL DEFAULT 'aguardando_producao',
  data_pedido TIMESTAMP NOT NULL,
  previsao_envio TIMESTAMP,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  desconto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  frete NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_frete NUMERIC(12, 2) NOT NULL DEFAULT 0,
  taxa_plataforma NUMERIC(12, 2) NOT NULL DEFAULT 0,
  percentual_taxa_plataforma NUMERIC(6, 3) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  lucro_bruto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  lucro_liquido NUMERIC(12, 2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (parcelas > 0)
);

CREATE TABLE itens_pedido (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  variacao_produto_id BIGINT NOT NULL REFERENCES variacoes_produto(id),
  influenciador_id BIGINT REFERENCES influenciadores(id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_item NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE movimentacoes_estoque (
  id BIGSERIAL PRIMARY KEY,
  variacao_produto_id BIGINT NOT NULL REFERENCES variacoes_produto(id),
  tipo VARCHAR(20) NOT NULL,
  quantidade INTEGER NOT NULL,
  motivo VARCHAR(40) NOT NULL,
  referencia_tipo VARCHAR(40),
  referencia_id BIGINT,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'reserva')),
  CHECK (motivo IN ('pedido', 'reposicao', 'brinde', 'perda', 'ajuste_manual', 'producao'))
);

CREATE TABLE producoes (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'pendente',
  data_inicio TIMESTAMP,
  data_prevista TIMESTAMP,
  data_conclusao TIMESTAMP,
  observacoes TEXT
);

CREATE TABLE regras_taxa_plataforma (
  id BIGSERIAL PRIMARY KEY,
  plataforma_id BIGINT NOT NULL REFERENCES plataformas(id),
  forma_pagamento_id BIGINT NOT NULL REFERENCES formas_pagamento(id),
  parcelas_inicio INTEGER NOT NULL DEFAULT 1,
  parcelas_fim INTEGER NOT NULL DEFAULT 1,
  percentual_taxa NUMERIC(6, 3) NOT NULL DEFAULT 0,
  taxa_fixa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  repassa_frete_gratis BOOLEAN NOT NULL DEFAULT FALSE,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  vigente_de DATE,
  vigente_ate DATE,
  CHECK (parcelas_inicio > 0),
  CHECK (parcelas_fim >= parcelas_inicio)
);

CREATE TABLE lancamentos_financeiros (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL,
  categoria VARCHAR(40) NOT NULL,
  plataforma_id BIGINT REFERENCES plataformas(id),
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  influenciador_id BIGINT REFERENCES influenciadores(id) ON DELETE SET NULL,
  descricao VARCHAR(200) NOT NULL,
  valor NUMERIC(12, 2) NOT NULL,
  data_lancamento DATE NOT NULL,
  competencia CHAR(7) NOT NULL,
  observacoes TEXT,
  CHECK (tipo IN ('receita', 'despesa'))
);

CREATE TABLE simulacoes_preco (
  id BIGSERIAL PRIMARY KEY,
  produto_id BIGINT REFERENCES produtos(id) ON DELETE SET NULL,
  variacao_produto_id BIGINT REFERENCES variacoes_produto(id) ON DELETE SET NULL,
  plataforma_id BIGINT REFERENCES plataformas(id) ON DELETE SET NULL,
  forma_pagamento_id BIGINT REFERENCES formas_pagamento(id) ON DELETE SET NULL,
  parcelas INTEGER NOT NULL DEFAULT 1,
  preco_venda NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_produto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  custo_frete NUMERIC(12, 2) NOT NULL DEFAULT 0,
  taxa_percentual NUMERIC(6, 3) NOT NULL DEFAULT 0,
  taxa_valor_fixo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comissao_percentual NUMERIC(6, 3) NOT NULL DEFAULT 0,
  margem_valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  margem_percentual NUMERIC(6, 3) NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (parcelas > 0)
);

CREATE INDEX idx_variacoes_produto_lookup
  ON variacoes_produto (produto_id, cor_id, tamanho_id, arte_id);

CREATE INDEX idx_pedidos_data
  ON pedidos (data_pedido);

CREATE INDEX idx_pedidos_plataforma
  ON pedidos (plataforma_id);

CREATE INDEX idx_pedidos_pagamento
  ON pedidos (forma_pagamento_id, parcelas);

CREATE INDEX idx_itens_pedido_influenciador
  ON itens_pedido (influenciador_id);

CREATE INDEX idx_movimentacoes_estoque_variacao
  ON movimentacoes_estoque (variacao_produto_id, criado_em);

CREATE INDEX idx_lancamentos_financeiros_competencia
  ON lancamentos_financeiros (competencia, tipo, categoria);

CREATE INDEX idx_regras_taxa_lookup
  ON regras_taxa_plataforma (plataforma_id, forma_pagamento_id, parcelas_inicio, parcelas_fim);

CREATE INDEX idx_simulacoes_preco_lookup
  ON simulacoes_preco (produto_id, plataforma_id, forma_pagamento_id, criado_em);

INSERT INTO plataformas (nome, tipo) VALUES
  ('Nuvem Shop', 'ecommerce'),
  ('TikTok Shop', 'social_commerce');

INSERT INTO formas_pagamento (nome, tipo) VALUES
  ('Pix', 'instantaneo'),
  ('Cartao de Credito', 'cartao'),
  ('Boleto', 'boleto');
