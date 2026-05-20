# MVP - Gerenciador Repeticao Maxima

## Objetivo

Criar um sistema interno para a marca Repeticao Maxima que centralize:

- vendas da Nuvem Shop e TikTok Shop
- controle de estoque por produto, cor e tamanho
- previsao de producao e alerta de reposicao
- acompanhamento financeiro
- controle de desempenho de influenciadores

O sistema deve nascer simples, mas preparado para crescer para automacoes, integracoes e pontuacao de influenciadores.

## Problemas Que O Sistema Resolve

Hoje a operacao precisa responder com clareza:

- o que vendeu
- em qual plataforma vendeu
- qual arte saiu
- qual cor saiu
- qual tamanho saiu
- qual influenciador gerou a venda
- quanto entrou de receita
- quanto saiu de custo ou despesa
- se o estoque atual e o estoque projetado sao suficientes

## MVP Prioritario

O MVP deve cobrir 4 modulos principais:

1. Pedidos e vendas
2. Estoque e producao
3. Financeiro
4. Influenciadores

## Modulos

### 1. Dashboard

Tela inicial com resumo do negocio.

Indicadores principais:

- faturamento do dia
- faturamento do mes
- quantidade de pedidos por periodo
- vendas por plataforma
- produtos mais vendidos
- cores mais vendidas
- pedidos em producao
- alertas de estoque
- vendas por influenciador

### 2. Pedidos

Objetivo: acompanhar tudo o que entrou de venda.

Campos principais do pedido:

- numero do pedido
- plataforma de origem
- data da venda
- cliente
- status do pedido
- status da producao
- valor total
- taxas
- frete
- observacoes

Cada pedido deve ter itens com:

- produto
- arte
- cor
- tamanho
- quantidade
- preco unitario
- custo estimado
- influenciador vinculado, se houver

Status sugeridos:

- novo
- aguardando producao
- em producao
- pronto
- enviado
- concluido
- cancelado

### 3. Estoque

Objetivo: controlar disponibilidade e prevenir falta de material.

Controles iniciais:

- estoque de camisetas por cor e tamanho
- estoque minimo por variacao
- movimentacoes de entrada, saida e ajuste
- consumo por vendas
- estoque projetado com base em pedidos pendentes

Alertas:

- abaixo do estoque minimo
- risco de ruptura nos proximos dias
- necessidade de reposicao por cor

Exemplo de variacao controlada:

- camiseta oversized / preta / M
- camiseta oversized / branca / G

### 4. Producao

Objetivo: transformar pedido vendido em previsao operacional.

Regras iniciais:

- cada item vendido entra na fila de producao
- o sistema calcula a quantidade pendente por cor e tamanho
- a equipe define um prazo medio de producao
- o painel mostra o que precisa ser produzido por periodo

Visoes uteis:

- fila do dia
- fila da semana
- pecas pendentes por cor
- pecas pendentes por arte

### 5. Financeiro

Objetivo: acompanhar faturamento, custos e despesas.

Tipos de lancamento:

- receita de venda
- taxa de plataforma
- frete
- custo de produto
- despesa operacional
- brinde
- perda
- ajuste financeiro

Indicadores principais:

- faturamento bruto
- faturamento liquido
- custo total
- margem estimada
- lucro por pedido
- lucro por item
- taxa total por venda
- resultado por plataforma
- resultado por produto
- resultado por forma de pagamento
- impacto de frete gratis na margem

Regras financeiras adicionais:

- cada plataforma pode ter taxas diferentes por forma de pagamento
- as taxas podem mudar conforme parcelamento
- pedidos com frete gratis devem mostrar o impacto real no lucro
- a margem deve considerar receita, taxas, custo do produto e demais despesas vinculadas

Campos financeiros recomendados por pedido:

- forma de pagamento
- quantidade de parcelas
- indicador de frete gratis
- custo real do frete
- percentual de taxa aplicado
- valor de taxa aplicado
- lucro bruto
- lucro liquido

### 6. Precificacao E Simulador

Objetivo: permitir validar se o preco atual faz sentido e testar novos cenarios.

Capacidades iniciais:

- simular preco de venda por produto
- simular taxa por plataforma
- simular taxa por forma de pagamento
- simular parcelamento
- simular impacto de frete gratis
- simular comissao de influenciador
- calcular margem em reais e percentual
- sugerir preco minimo para margem alvo

Perguntas que o simulador deve responder:

- se eu vender por Pix, quanto sobra por peca
- se eu vender parcelado, qual passa a ser a margem
- se eu der frete gratis, ainda vale a pena
- quanto preciso cobrar para manter uma margem minima
- qual plataforma esta mais rentavel para cada produto

### 7. Influenciadores

Objetivo: medir desempenho comercial e preparar base para expansao futura.

Cadastro inicial:

- nome
- codigo ou cupom
- rede social
- percentual de comissao, se houver
- observacoes

Indicadores:

- quantidade de pedidos
- quantidade de itens vendidos
- faturamento gerado
- ticket medio
- resultado por periodo

Expansao futura:

- ranking mensal
- programa de pontos
- niveis de parceria

## Telas Do MVP

As telas iniciais recomendadas sao:

1. Login
2. Dashboard
3. Pedidos
4. Detalhe do pedido
5. Estoque
6. Movimentacoes de estoque
7. Producao
8. Financeiro
9. Precificacao e simulador
10. Influenciadores
11. Cadastro de produtos
12. Cadastro de variacoes

## Filtros Importantes

Esses filtros devem existir em quase todos os modulos:

- por dia
- por semana
- por mes
- por periodo personalizado
- por plataforma
- por produto
- por arte
- por cor
- por tamanho
- por influenciador

## Regras De Negocio Iniciais

1. Todo pedido deve registrar plataforma de origem.
2. Todo item vendido deve baixar estoque da variacao correspondente.
3. Se o estoque nao for suficiente, o sistema deve sinalizar alerta.
4. O estoque projetado deve considerar pedidos ainda nao produzidos.
5. Lancamentos financeiros podem ser automaticos ou manuais.
6. Brindes e perdas devem ser registrados para nao distorcer resultado.
7. Influenciadores devem poder ser vinculados por pedido ou item.
8. O sistema deve aplicar taxa com base em plataforma, forma de pagamento e parcelamento.
9. O sistema deve registrar a margem por pedido e por item sempre que possivel.
10. O simulador deve permitir testar cenarios sem alterar dados reais.

## Modelo De Dados Inicial

### Entidades Principais

#### Usuario

- id
- nome
- email
- senha_hash
- perfil
- ativo
- criado_em

#### Plataforma

- id
- nome
- tipo
- ativa

Exemplos:

- Nuvem Shop
- TikTok Shop

#### FormaPagamento

- id
- nome
- tipo
- ativa

Exemplos:

- pix
- cartao_credito
- boleto

#### Produto

- id
- nome
- sku_base
- categoria
- descricao
- ativo
- preco_padrao
- custo_padrao
- criado_em

#### Arte

- id
- nome
- codigo
- descricao
- ativa

#### Cor

- id
- nome
- codigo
- ativa

#### Tamanho

- id
- nome
- ordem
- ativo

#### VariacaoProduto

- id
- produto_id
- arte_id
- cor_id
- tamanho_id
- sku
- preco_venda
- custo_unitario
- estoque_atual
- estoque_minimo
- ativo

#### Pedido

- id
- numero_externo
- plataforma_id
- forma_pagamento_id
- parcelas
- frete_gratis
- cliente_nome
- cliente_documento
- status
- status_producao
- data_pedido
- previsao_envio
- subtotal
- desconto
- frete
- custo_frete
- taxa_plataforma
- percentual_taxa_plataforma
- total
- lucro_bruto
- lucro_liquido
- observacoes
- criado_em

#### ItemPedido

- id
- pedido_id
- variacao_produto_id
- influenciador_id
- quantidade
- preco_unitario
- custo_unitario
- total_item

#### MovimentacaoEstoque

- id
- variacao_produto_id
- tipo
- quantidade
- motivo
- referencia_tipo
- referencia_id
- observacoes
- criado_em

Tipos sugeridos:

- entrada
- saida
- ajuste
- reserva

#### Producao

- id
- pedido_id
- status
- data_inicio
- data_prevista
- data_conclusao
- observacoes

#### LancamentoFinanceiro

- id
- tipo
- categoria
- plataforma_id
- pedido_id
- influenciador_id
- descricao
- valor
- data_lancamento
- competencia
- observacoes

Tipos sugeridos:

- receita
- despesa

Categorias sugeridas:

- venda
- taxa_plataforma
- frete
- custo_produto
- marketing
- brinde
- perda
- operacional

#### RegraTaxaPlataforma

- id
- plataforma_id
- forma_pagamento_id
- parcelas_inicio
- parcelas_fim
- percentual_taxa
- taxa_fixa
- repassa_frete_gratis
- ativa
- vigente_de
- vigente_ate

#### SimulacaoPreco

- id
- produto_id
- variacao_produto_id
- plataforma_id
- forma_pagamento_id
- parcelas
- preco_venda
- custo_produto
- custo_frete
- taxa_percentual
- taxa_valor_fixo
- comissao_percentual
- margem_valor
- margem_percentual
- criado_em

#### Influenciador

- id
- nome
- codigo_rastreio
- rede_social
- usuario_rede
- percentual_comissao
- ativo
- observacoes

## Fluxos Principais

### Fluxo 1: Venda Entrando

1. O pedido entra vindo da Nuvem Shop ou TikTok Shop.
2. O sistema registra o pedido e seus itens.
3. O sistema identifica forma de pagamento, parcelamento e regra de taxa.
4. O estoque da variacao e reservado ou baixado.
5. O pedido entra na fila de producao.
6. O financeiro registra receita, taxas, frete e margem.
7. Se houver influenciador vinculado, a venda entra no painel dele.

### Fluxo 2: Reposicao

1. O sistema compara estoque atual com estoque minimo.
2. O sistema considera tambem pedidos pendentes.
3. Se o saldo projetado ficar abaixo do limite, gera alerta.
4. A equipe faz entrada manual quando compra ou recebe reposicao.

### Fluxo 3: Brindes E Saidas Nao Comerciais

1. A equipe registra uma saida manual.
2. Define se foi brinde, perda, amostra ou ajuste.
3. O estoque e reduzido.
4. O financeiro registra o impacto se necessario.

## Prioridade De Implementacao

### Fase 1

- autenticacao simples
- cadastro de produtos, artes, cores e tamanhos
- cadastro de variacoes
- pedidos manuais
- controle de estoque
- painel basico
- financeiro manual
- cadastro de regras de taxa por plataforma e pagamento
- calculo de lucro por pedido
- cadastro de influenciadores

### Fase 2

- importacao de pedidos
- integracao com Nuvem Shop
- integracao com TikTok Shop
- dashboard avancado
- relatorios por plataforma e por influenciador
- simulador de precificacao e margem

### Fase 3

- programa de pontos para influenciadores
- comissoes automatizadas
- previsao de demanda
- notificacoes automativas

## Stack Recomendada

Para ter velocidade e boa escalabilidade:

- frontend: Next.js
- backend: Next.js API ou Supabase
- banco de dados: PostgreSQL
- autenticacao: Supabase Auth ou NextAuth
- design system: componentes com identidade roxa e laranja

## Identidade Visual

Direcao visual inicial:

- cor primaria: roxo
- cor secundaria: laranja
- interface limpa e objetiva
- foco em leitura rapida de indicadores
- destaque visual forte para alertas e numeros de venda

## Proximo Passo Recomendado

Depois deste documento, a sequencia ideal e:

1. definir a modelagem final do banco
2. criar o projeto base
3. montar as telas principais
4. conectar cadastro, estoque e pedidos
5. adicionar financeiro e influenciadores
