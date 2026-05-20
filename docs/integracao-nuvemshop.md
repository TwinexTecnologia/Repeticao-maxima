# Integracao Nuvem Shop

## Objetivo

Este documento registra como a integracao da Nuvem Shop deve alimentar o sistema
da Repeticao Maxima antes da modelagem final das tabelas.

## Recomendacao Inicial

A melhor estrategia e:

1. usar webhooks para receber mudancas importantes de pedido
2. ao receber um webhook, buscar o pedido completo na API
3. salvar no banco apenas depois de normalizar os campos relevantes para o negocio

Essa abordagem e mais segura do que depender apenas de importacoes periodicas.

## O Que A Documentacao Oficial Indica

### 1. Pedidos sao o ponto central

O recurso de pedidos da Nuvem Shop entrega os principais dados que precisamos:

- identificador interno do pedido
- numero do pedido
- cliente
- lista de produtos comprados
- subtotal, desconto e total
- gateway e nome do gateway
- status do pedido
- status do pagamento
- status de envio
- payment_details com metodo, bandeira e parcelas
- paid_at, created_at e updated_at

Fonte oficial:

- Order API: https://tiendanube.github.io/api-documentation/resources/order

### 2. O frete no nivel do pedido esta em transicao

A documentacao atual deixa claro que os campos de envio no pedido estao
depreciados e que o recomendado e usar Fulfillment Orders.

Na pratica:

- nao devemos modelar frete apenas em `pedidos`
- o ideal e considerar uma estrutura de `pedido -> fulfillments`
- um mesmo pedido pode ter mais de um envio

Fonte oficial:

- Access Order guide: https://tiendanube.github.io/api-documentation/guides/multi-inventory/access-order
- Fulfillment Order API: https://tiendanube.github.io/api-documentation/resources/fulfillment-order

### 3. Para frete completo, o ideal e buscar o pedido com agregacao

A recomendacao oficial e usar:

```text
GET /orders/{id}?aggregates=fulfillment_orders
```

Ou consultar diretamente:

```text
GET /orders/{order_id}/fulfillment-orders
```

Isso entrega:

- tipo de envio (`ship`, `pickup`, `non-shippable`)
- custo do lojista no frete
- custo do cliente no frete
- transportadora
- opcao de envio
- prazo minimo e maximo
- destino detalhado
- tracking
- status do fulfillment
- eventos de rastreio

## Campos Que Devem Vir Da Nuvem Shop

### Pedido

Campos que claramente devem ser importados:

- `id`
- `number`
- `store_id`
- `storefront`
- `status`
- `payment_status`
- `shipping_status`
- `gateway`
- `gateway_id`
- `gateway_name`
- `gateway_link`
- `payment_details.method`
- `payment_details.credit_card_company`
- `payment_details.installments`
- `subtotal`
- `discount`
- `total`
- `currency`
- `created_at`
- `updated_at`
- `paid_at`
- `cancelled_at`
- `closed_at`
- `cancel_reason`
- `owner_note`
- `note`
- `coupon`
- `total_paid_by_customer`
- `total_paid_by_customer_including_fees`

### Cliente

Importar apenas o necessario para operacao:

- `customer.id`
- `customer.name`
- `customer.email`
- `customer.phone`
- `customer.identification`

Observacao:

- se quisermos reduzir dados sensiveis no banco interno, podemos salvar apenas o
  minimo operacional

### Itens do pedido

Cada item em `products` traz:

- `id` do line item
- `product_id`
- `variant_id`
- `name`
- `price`
- `quantity`
- `sku`
- `barcode`
- `variant_values`
- `properties`
- `free_shipping`
- `weight`
- `width`
- `height`
- `depth`

Observacao importante:

- a documentacao informa que o mesmo `product_id` e `variant_id` podem aparecer
  em multiplas linhas do mesmo pedido se houver `properties` diferentes
- por isso, o identificador correto do item e o `products.id`, nao apenas o
  produto ou a variante
- a documentacao tambem alerta que `products.id` pode ultrapassar `int32`, entao
  precisamos tratar isso como `bigint` ou string grande

## O Que Talvez Nao Venha Pronto

Esses campos sao criticos para a operacao da Repeticao Maxima, mas podem nao vir
de forma padronizada da Nuvem Shop:

- arte
- cor
- tamanho, se nao estiver corretamente estruturado em variante
- influenciador
- custo interno da peca
- margem calculada
- regra de reposicao
- fila de producao

Conclusao:

- `cor` e `tamanho` idealmente devem vir da variante
- `arte` pode ter que ser inferida pelo produto, SKU, custom field ou cadastro interno
- `influenciador` provavelmente sera regra interna por cupom, link, utm ou pedido enriquecido

## Webhooks Recomendados

A documentacao de webhooks permite registrar eventos de pedido como:

- `order/created`
- `order/updated`
- `order/paid`
- `order/packed`
- `order/fulfilled`
- `order/cancelled`
- `order/custom_fields_updated`
- `order/edited`
- `order/pending`
- `order/voided`
- `order/unpacked`

Para o nosso caso, a base minima recomendada e:

1. `order/created`
2. `order/updated`
3. `order/paid`
4. `order/cancelled`
5. `order/fulfilled`

Se formos controlar envio com mais profundidade, tambem vale assinar:

- `fulfillment_order/status_updated`
- `fulfillment_order/tracking_event_created`
- `fulfillment_order/tracking_event_updated`

Fonte oficial:

- Webhook API: https://tiendanube.github.io/api-documentation/resources/webhook
- Fulfillment Order webhooks: https://tiendanube.github.io/api-documentation/resources/fulfillment-order

## Regras Tecnicas Importantes

### Webhooks precisam ser idempotentes

A documentacao avisa que:

- mensagens podem chegar fora de ordem
- mensagens podem ser reenviadas
- o backend deve tratar isso com idempotencia

Entao o fluxo certo e:

1. receber webhook
2. registrar log do evento
3. deduplicar por evento + pedido + timestamp quando aplicavel
4. buscar pedido atualizado na API
5. aplicar upsert no banco

### Validacao de origem

A Nuvem Shop envia assinatura no header:

```text
x-linkedstore-hmac-sha256
```

Precisamos validar isso no backend antes de processar o payload.

### Fulfillments podem nao vir imediatamente

A propria documentacao alerta que um pedido pode ser concluido e ainda assim os
fulfillments virem vazios por um tempo.

Entao:

- nao devemos assumir que `fulfillments` sempre vira preenchido no primeiro fetch
- precisamos implementar retry para completar os dados de envio

## Mapeamento Inicial Para O Sistema

### Vai direto para o banco

- pedido
- cliente minimo
- itens do pedido
- totais
- pagamento
- parcelas
- status
- frete e envio

### Vai para enriquecimento interno

- arte
- influenciador
- custo unitario interno
- margem
- prioridade de producao
- alerta de estoque

## Como Isso Impacta O Banco

Antes de criar as tabelas finais, devemos considerar estas entidades:

1. `pedidos`
2. `pedido_itens`
3. `pedido_clientes` ou cliente embutido no pedido
4. `pedido_pagamentos`
5. `pedido_fulfillments`
6. `pedido_fulfillment_tracking_events`
7. `pedido_webhook_logs`
8. `pedido_enriquecimento_interno`

Observacao:

- talvez nao seja necessario separar tudo em tabelas diferentes no MVP
- mas `fulfillments` merece entidade propria por causa do modelo novo da API

## Decisoes Recomendadas Antes Das Tabelas

Precisamos responder estas perguntas:

1. A arte vai ser identificada por SKU, nome do produto ou campo interno?
2. O influenciador sera identificado por cupom, utm, observacao do pedido ou regra manual?
3. Vamos salvar cliente completo ou apenas o minimo operacional?
4. O custo de cada peca vira de cadastro interno ou de planilha externa?
5. O frete gratis sera calculado por fulfillment ou consolidado por pedido?

## Proximo Passo Recomendado

Antes de criar as tabelas:

1. validar quais campos a loja realmente usa hoje em produto e variante
2. confirmar como voces identificam `arte`, `cor` e `tamanho`
3. decidir como reconhecer `influenciador`
4. so depois montar o schema final no Supabase

## Referencias Oficiais

- Order API: https://tiendanube.github.io/api-documentation/resources/order
- Fulfillment Order API: https://tiendanube.github.io/api-documentation/resources/fulfillment-order
- Webhook API: https://tiendanube.github.io/api-documentation/resources/webhook
- ERP Integration Guide: https://dev.tiendanube.com/en/docs/erp-guide/overview
- Multi-inventory Order Guide: https://tiendanube.github.io/api-documentation/guides/multi-inventory/access-order
