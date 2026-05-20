# Acesso Nuvemshop

## Objetivo

Gerar as credenciais minimas para o projeto conseguir ler dados reais da loja e
descobrir como pedidos, produtos, variacoes e categorias chegam pela API.

## O Que Precisamos

- `store_id`
- `access_token`

Opcional:

- `client_id`
- `client_secret`

## Como Gerar

### 1. Criar um app no portal de parceiros

No portal de parceiros da Nuvemshop, crie um app privado ou de clientes e
habilite pelo menos estes escopos:

- `read_products`
- `read_orders`

Se depois quisermos clientes e webhooks mais completos, podemos ampliar.

### 2. Configurar URL de redirecionamento

No cadastro do app, informe uma URL de callback valida.

Para desenvolvimento inicial, o importante e ter uma URL onde a Nuvemshop
consiga devolver o `code` de autorizacao.

### 3. Instalar o app na loja

Depois de instalado, a Nuvemshop redireciona com um `code`.

Esse `code` e temporario e deve ser trocado por `access_token`.

### 4. Trocar o code por token

A troca e feita por `POST` no endpoint de autorizacao da Nuvemshop, enviando:

- `client_id`
- `client_secret`
- `grant_type=authorization_code`
- `code`

Na resposta, a Nuvemshop devolve:

- `access_token`
- `token_type`
- `scope`
- `user_id`

Importante:

- o `user_id` devolvido funciona como `store_id`

## Onde Colocar No Projeto

No app `web`, copie:

```bash
.env.example -> .env.local
```

Preencha:

```env
NUVEMSHOP_STORE_ID=seu_store_id
NUVEMSHOP_ACCESS_TOKEN=seu_access_token
NUVEMSHOP_API_BASE_URL=https://api.nuvemshop.com.br/v1
NUVEMSHOP_USER_AGENT=Repeticao Maxima (contato@repeticaomaxima.com.br)
```

## Como Testar

Com o app rodando, abrir:

- `http://localhost:3000/integracoes/nuvemshop`

Ou consultar:

- `GET /api/integracoes/nuvemshop/diagnostico`

## O Que Ja Esta Preparado No Codigo

- leitura inicial de `produtos`
- leitura inicial de `categorias`
- leitura inicial de `pedidos`
- tela para mostrar status e amostras da API
- rota de diagnostico para testar credenciais

## Proximo Passo Depois Do Token

Assim que as credenciais existirem, vamos observar:

1. como `cor` e `tamanho` chegam nas variantes
2. se a `arte` vem no produto, SKU ou properties
3. como o pedido devolve `parcelas`, `metodo` e `status`
4. o que existe de inventario utilisavel para estoque real
