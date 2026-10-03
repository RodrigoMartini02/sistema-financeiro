# Plano de Implementação: compra direta na vitrine (Mercado Pago) e carrinho novo

## Origem

- **Arquivo de especificação:** não há `.md`. O pedido veio do chat em 2026-10-03, depois de o usuário testar a vitrine da Aether na produção: "já faz a compra direto pelo carrinho, com os mesmos métodos de compra dos pacotes, porém esse layout está bem ruim para um carrinho de compra, dá para melhorar bastante com base em Mercado Livre, Amazon, Magalu".
- **Data do planejamento:** `2026-10-03`
- **Classificação:** `frontend + backend + database`, mais a infraestrutura das credenciais do Mercado Pago no Render.
- **Plano anterior:** `.plans/vitrine-estoque.md`, com merge na `main` em `ace9e3c2`. Este plano era a "segunda etapa" dele: pagamento na vitrine e pedido registrado no sistema.

## Resumo

- **Compra na vitrine:** o cliente passa a comprar e pagar na própria vitrine, com Pix (QR Code na página) ou cartão à vista (digitado na página), sem passar pelo WhatsApp.
- **Para onde vai o dinheiro:** cai direto na conta Mercado Pago da loja, conectada uma vez em "Configurar vitrine" (OAuth). O FINGERENCE não recebe nem repassa nada.
- **Pedido:** cada compra vira um pedido, com os itens separados enquanto o pagamento está pendente.
  - Pago: gera receitas "Vendas" na conta PJ e baixa o estoque.
  - Estornado no Mercado Pago: as receitas são canceladas e o estoque volta, usando o que já existe.
- **Sacola e checkout:** a sacola sai do modal e ganha página própria, com checkout em etapas e página do pedido, no padrão dos marketplaces.
- **Acompanhamento da loja:** a loja vê os pedidos numa tela nova de Configurações e recebe um push quando um pedido é pago.
- **Sem Mercado Pago conectado:** a sacola continua mandando o pedido pelo WhatsApp.

## Decisões aplicadas

- **Pagamento** (definido pela mensagem do usuário: "os mesmos métodos de compra dos pacotes"): Pix e cartão pelo Mercado Pago, como nos planos. O cartão é tokenizado na página com a biblioteca JS do Mercado Pago, no modelo do `CardPaymentForm` de `PlanosScreen`.
- **Decisão 1:** cada loja conecta a própria conta Mercado Pago e recebe direto, sem taxa do FINGERENCE.
- **Decisão 2:** a loja escolhe o que oferece: retirada no local (com endereço e horário) e/ou entrega com taxa fixa (com área e prazo). Não há frete por CEP.
  - O usuário respondeu "1", depois "opção 2" e por fim "opção 1 reajuste". Valeu a última resposta, comunicada a ele.
- **Decisão 3:** sem o Mercado Pago conectado, a sacola continua enviando o pedido pelo WhatsApp.
- **Decisão 4:** os itens ficam separados enquanto o pagamento está pendente (30 minutos no Pix) e voltam a ficar disponíveis se ele expirar ou for recusado. A baixa definitiva acontece na aprovação.

## Escopo

### Dentro do escopo

1. **Conexão Mercado Pago por conta PJ:**
   - OAuth com `state` assinado (JWT de 15 minutos);
   - troca do código pelos tokens da loja e renovação antes de vencer;
   - tokens cifrados (AES-256-GCM);
   - status e opção de desconectar.
2. **Configuração da vitrine:**
   - seção Pagamento: status e "Conectar Mercado Pago";
   - seção Entrega: retirada (ativa, endereço, horário) e entrega (ativa, taxa, área e prazo);
   - Política de troca: texto com sugestão que já cita o direito de arrependimento de 7 dias.
3. **Pedidos (servidor):**
   - criação pública com preço e estoque conferidos no banco;
   - número por loja;
   - separação dos itens;
   - pagamento Pix ou cartão com o token da loja;
   - página de status com conferência ativa;
   - webhook;
   - receitas "Vendas" na aprovação;
   - estorno;
   - push ao dono;
   - limite por IP.
4. **Tela "Pedidos"** em Configurações → Finanças, só PJ, com a permissão "Produtos e estoque" (`accessProductCatalog`):
   - lista com filtro por situação;
   - detalhe;
   - botões "enviado", "pronto para retirada" e "entregue".
5. **Vitrine:**
   - sacola no topo, com contador e aviso de "adicionado";
   - página da sacola;
   - checkout em três etapas;
   - página do pedido;
   - WhatsApp na página da sacola quando a loja não tem o Mercado Pago conectado.
6. **Remoção do antigo:** a sacola em modal (`StorefrontCartSheet`).

### Fora do escopo

- **Pagamento:** parcelamento no cartão (só à vista).
- **Funções de loja:** frete por CEP (decisão 2), nota fiscal, cupom de desconto e avaliações de produto.
- **Cliente:** conta e login do cliente na vitrine.
- **Taxa do FINGERENCE** sobre as vendas (decisão 1).
- **Estorno pela tela do FINGERENCE:** é feito no Mercado Pago, e o sistema acompanha pelo webhook.
- **E-mail de confirmação ao cliente:** o Mercado Pago já manda o comprovante ao pagador.
- **Aviso no sininho:** o aviso ao dono vai só por push.
- **Pedidos do WhatsApp registrados no sistema:** continuam só como mensagem.
- **Prévia do link com o logo** (meta tags).

## Leitura de contexto

- **`/AGENT.md`:** só as regras transversais, como nos planos anteriores:
  - Drizzle em query nova;
  - nada de `any`;
  - erros claros, sem vazar dados;
  - nomes de código em inglês;
  - migrations e `.env` só com confirmação;
  - checagem de acesso no backend.
- **`/backend/AGENT.md` e `/frontend/AGENT.md`:** não existem neste projeto.
- **`/CLAUDE.md`:** fluxo `/planejar` → `/implementar` → `/finalizar`.
- **Arquivos lidos:**
  - **Planos:**
    - `backend/src/routes/plans.ts`: `mpClient` com `MP_ACCESS_TOKEN`; Pix por `Payment.create` com `date_of_expiration` de 30 min e `point_of_interaction.transaction_data`; cartão por `card_token`; webhook que busca o pagamento por id;
    - `src/screens/planos/PlanosScreen.tsx`: carregador do SDK `sdk.mercadopago.com/js/v2`, `createCardToken` e `CardPaymentForm`.
  - **SDK `mercadopago` 2.12** (cliente `oAuth` com `create`, `refresh` e `getAuthorizationURL`; resposta com `access_token`, `refresh_token`, `public_key`, `user_id`, `expires_in` e `live_mode`).
  - **Push:** `backend/src/services/webPush.ts` (`sendPushToUser(userId, { title, body })`).
  - **Categorias de receita:** `backend/src/services/incomeClassificationDefaults.ts` (a categoria padrão "Vendas" da PJ) e `backend/src/services/accountPartners.ts` (como "Aportes" é garantida).
  - **Limite por IP:** `backend/src/middleware/validation.ts` (`authRateLimiter`, o limitador em memória por IP).
  - **Abrir uma aba pela URL:** `src/layout/AppShell.tsx` (`?config=<aba>`).
  - **Código deste módulo:** `src/layout/ConfigPanel.tsx`, `src/utils/screenAccess.ts`, e tudo o que veio de `.plans/vitrine-estoque.md`:
    - `services/storefront.ts`, `stock.ts`, `incomeService.ts` (`cancelIncome`) e `routes/public.ts`;
    - na tela, `StorefrontPage`, `useStorefrontCart`, `storefrontCart.ts` e `StorefrontDialog`.

## Impacto por área

### Frontend

**Vitrine** (`src/screens/public/storefront/`)
- **Topo:** ícone da sacola com contador (em todas as páginas da vitrine) e aviso "Adicionado à sacola · Ver sacola" ao adicionar.
- **Página da sacola** (`/loja/:storefront/sacola`, `StorefrontCartPage`):
  - itens com foto grande, nome, preço "de/por", seletor de quantidade (1 até o disponível, no máximo 99) e "Excluir";
  - resumo com subtotal, "você economiza" (soma dos descontos) e total, que fica ao lado no computador e fixo embaixo no celular;
  - botão "Continuar para o pagamento" com Mercado Pago conectado e forma de entrega ativa;
  - sem isso, o bloco do WhatsApp (nome, observação e "Enviar pedido pelo WhatsApp"), aproveitando `buildOrderMessage`;
  - sacola vazia: "Sua sacola está vazia" e "Ver produtos".
- **Checkout** (`/loja/:storefront/checkout`, `StorefrontCheckoutPage`):
  - **identificação:** nome, e-mail, telefone com máscara e CPF com máscara e validação;
  - **entrega:** escolha entre retirada (mostra endereço e horário) e entrega (CEP com máscara, endereço preenchido pelo ViaCEP, número e complemento, com taxa, área e prazo);
  - **pagamento:** Pix ou cartão, este no formulário do Mercado Pago com a chave pública da loja;
  - a política de troca e uma linha sobre os dados irem para a loja (LGPD);
  - resumo ao lado (ou recolhido no celular) e botão "Pagar R$ X".
- **Página do pedido** (`/loja/:storefront/pedido/:pedidoId`, `StorefrontOrderPage`):
  - número do pedido e situação;
  - QR Code do Pix, "Copiar código" e contagem regressiva até a validade;
  - a página consulta a situação a cada 5 s enquanto o pedido está pendente;
  - resumo dos itens, entrega e total;
  - no pedido pago, "Pedido confirmado" e próximos passos (retirada ou entrega).
- **Sacola guardada:** continua no aparelho (`useStorefrontCart`) e é conferida com o disponível de agora; sai da sacola depois que o pedido é criado.
- **Biblioteca do Mercado Pago:** o carregador sai de `PlanosScreen` para `src/utils/mercadoPagoSdk.ts`, compartilhado. `PlanosScreen` só passa a importar o carregador; o formulário dos planos não muda.

**App** (`src/App.tsx`)
- Entram as rotas `/loja/:storefront/sacola`, `/loja/:storefront/checkout` e `/loja/:storefront/pedido/:pedidoId`.
- `isStorefrontPath` passa a cobrir `/loja/<link>/...` (prefixo), para esconder o SEO, o banner de cookies e o "instalar app" nessas páginas.

**Configurações**
- **`StorefrontDialog`:**
  - seção Pagamento: status, "Conectar Mercado Pago", "Desconectar" e o aviso "conecte para receber pela vitrine";
  - seção Entrega: chaves de retirada (endereço e horário) e de entrega (taxa, área e prazo);
  - Política de troca: textarea com o texto sugerido.
- **Volta do Mercado Pago:** a URL `?config=catalogo&mercadoPago=conectado|erro` abre "Produtos e estoque" com o aviso.
- **Nova `src/screens/config/PedidosTab.tsx`:**
  - lista com número, data, cliente, total, forma e situação, com filtro por situação;
  - diálogo de detalhe com itens, cliente, entrega/endereço, pagamento (id do Mercado Pago) e as receitas geradas;
  - botões de situação;
  - selo "sem estoque" quando for o caso.
- **`ConfigPanel.tsx` e `screenAccess.ts`:** item `pedidos` ("Pedidos", grupo Finanças), só PJ, com a flag `accessProductCatalog`.

**Serviços e chaves**
- `src/services/storefrontService.ts` ganha a configuração de pagamento e entrega, a conexão Mercado Pago e os pedidos (públicos e da loja).
- `queryKeys` ganha `storefrontOrders(accountId, status)`, `storefrontOrder(id)`, `publicOrder(storefront, id)` e `mercadoPagoStatus(accountId)`.

**Remoção do antigo:** saem o `StorefrontCartSheet` e a barra que abria o modal.

**Testes:**
- resumo da sacola (economia);
- validação das etapas do checkout;
- máscaras de CPF, telefone e CEP;
- contagem regressiva do Pix.

### Backend

**Cifra e conexão Mercado Pago**
- **`backend/src/services/tokenCrypto.ts`:** `encryptSecret` e `decryptSecret` (AES-256-GCM, chave `MP_TOKENS_KEY` em base64 de 32 bytes, IV aleatório, formato `iv.tag.cipher`). Sem chave válida, falha ao iniciar a conexão, com erro claro.
- **`backend/src/services/mercadoPagoAccounts.ts`:**
  - `buildConnectUrl(accountId, userId)`: `state` = JWT `{ purpose: 'mp-connect', accountId, userId }`, com 15 min, assinado com `JWT_SECRET`;
  - `completeConnection(code, state)`: confere o `state`, chama `OAuth.create` com `client_id`, `client_secret`, `code` e `redirect_uri`, e grava os dados cifrados;
  - `getStoreClient(accountId)`: devolve o `MercadoPagoConfig` com o token da loja e renova com `OAuth.refresh` quando faltam menos de 7 dias;
  - `getConnectionStatus` e `disconnect`.
- **`backend/src/modules/catalogo/routes/mercadoPago.ts`:**
  - `GET /api/catalogo/mercado-pago/status?conta_id=` e `GET /connect?conta_id=` (devolve a URL), com `requireScreenAccess('accessProductCatalog')` e `resolveCompanyAccount`;
  - `GET /callback` (público): troca o código e redireciona para `${FRONTEND_URL}/app.html?config=catalogo&mercadoPago=conectado` (ou `erro`);
  - `DELETE /?conta_id=`.

**Pedidos**
- **`backend/src/services/orderInput.ts`** (puro, com teste): lê o pedido público.
  - itens de 1 a 30, cada um com produto (UUID) e quantidade inteira de 1 a 99;
  - cliente: nome de 2 a 80 caracteres, e-mail, telefone BR com 10 ou 11 dígitos e CPF com dígitos verificadores;
  - entrega: `retirada` ou `entrega`, com endereço (CEP de 8 dígitos, rua, número, complemento, bairro, cidade e UF);
  - pagamento: `pix` ou `cartao` (com `card_token`);
  - observação de até 300 caracteres.
- **`backend/src/services/orderPricing.ts`** (puro, com teste):
  - totais: subtotal pelo preço final, economia, taxa de entrega e total;
  - `availableQuantity(stock, reserved)`;
  - conversão da situação do Mercado Pago para a do pedido (`approved` → pago; `rejected` e `cancelled` → recusado ou expirado; `refunded` e `charged_back` → estornado; `pending` e `in_process` → aguardando).
- **`backend/src/services/orders.ts`:**
  - `createOrder(storefront, input, ip)`: tudo numa transação.
    - trava os produtos (`FOR UPDATE`) e confere se são ativos e da conta da vitrine;
    - calcula o disponível: o saldo menos o que está separado em pedidos `aguardando_pagamento` com `reservado_ate > now()`, só para produto com controle de estoque;
    - numera por loja (`UPDATE ... SET ultimo_numero_pedido = ultimo_numero_pedido + 1 RETURNING`);
    - grava o pedido e os itens com os preços do banco e `reservado_ate = now() + 30 min`.
  - **Pagamento:** depois disso, gera o pagamento com o token da loja.
    - Pix: `date_of_expiration`, `external_reference = pedido.id` e `notification_url` do webhook com `?pedido=<id>`;
    - cartão: `token`, 1 parcela e `payer.identification` com o CPF.
    - Se a criação do pagamento falhar, o pedido vai para `recusado` e libera a reserva.
  - `getPublicOrder(storefront, orderId)`: situação, itens, totais, entrega e Pix (enquanto pendente). Pedido pendente com mais de 30 s desde a última conferência é conferido ativamente no Mercado Pago.
  - `syncOrderPayment(orderId, paymentId)`: o mesmo caminho para o webhook, a conferência ativa e a resposta do cartão.
    - busca o pagamento com o token da loja e confere `external_reference` e valor;
    - aplica a situação sem processar duas vezes: trava o pedido e não repete a aprovação.
  - **Aprovação:**
    - pedido `pago` com `pago_em`;
    - para cada item, uma receita "Vendas" na conta PJ, com autor = dono, descrição `Pedido #N — <produto> (<qtd>x)`, cliente = nome, valor = subtotal do item, data = dia da aprovação (Brasília) e situação `ativa`;
    - cada receita baixa o estoque por `sellProductInIncome`. Sem saldo, a receita é registrada sem venda de produto e o item fica com `sem_estoque`;
    - a taxa de entrega vira uma receita à parte;
    - `receita_id` gravada em cada item e no pedido (entrega);
    - por último, o push "Pedido #N pago — R$ X".
  - **Estorno ou contestação:** `cancelIncome` em cada receita ligada (o estoque volta), e o pedido fica `estornado`.
  - **Categoria "Vendas":** garantida como em `accountPartners.ts` ("Aportes"), criada se não existir para o dono.
  - **Loja:** `listOrders(account, status)`, `getOrder(account, id)` e `updateOrderStatus(account, id, status)`. As transições permitidas são pago → enviado ou pronto para retirada → entregue.
- **Rotas públicas** (em `routes/public.ts` ou num `publicOrders.ts` novo):
  - `GET /api/catalogo/public/:storefront` passa a devolver também `pagamento: { online: boolean, publicKey }` (online = Mercado Pago conectado e pelo menos uma entrega ativa), `entrega: { retirada, entrega }`, `politicaTroca` e, por produto, `disponivel` (sem número), com `esgotado` considerando a reserva;
  - `POST /api/catalogo/public/:storefront/pedidos`, com limite por IP de 10 pedidos a cada 15 min, no padrão de `authRateLimiter`;
  - `GET /api/catalogo/public/:storefront/pedidos/:pedidoId`;
  - `POST /api/catalogo/public/mercado-pago/webhook?pedido=<id>`: responde 200 na hora e sincroniza depois, como o webhook dos planos.
- **Rotas da loja** (`routes/orders.ts`, com `requireScreenAccess('accessProductCatalog')` e `resolveCompanyAccount`):
  - `GET /api/catalogo/pedidos?conta_id=&situacao=`;
  - `GET /api/catalogo/pedidos/:id`;
  - `PUT /api/catalogo/pedidos/:id/situacao`.
- **`storefront.ts`:** a configuração da vitrine ganha os campos de entrega e política (no GET e no PUT, com `readStorefrontInput` estendido).

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**`backend/drizzle/0068_vitrine_pagamento_entrega.sql`** — só acrescenta; vai antes do deploy.
- **Tabela nova `catalogo.mercado_pago_contas`:**
  - `id SERIAL PK`;
  - `conta_id INTEGER UNIQUE REFERENCES contas(id) ON DELETE CASCADE`;
  - `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE`;
  - `mp_user_id VARCHAR(30)` e `public_key VARCHAR(100)`;
  - `access_token_cifrado TEXT` e `refresh_token_cifrado TEXT`;
  - `expira_em TIMESTAMP` e `live_mode BOOLEAN`;
  - `conectado_em TIMESTAMP DEFAULT NOW()` e `atualizado_em TIMESTAMP DEFAULT NOW()`.
- **Colunas novas em `catalogo.contas`** (a vitrine):
  - `retirada_ativa BOOLEAN NOT NULL DEFAULT false`, `retirada_endereco VARCHAR(280)`, `retirada_horario VARCHAR(120)`;
  - `entrega_ativa BOOLEAN NOT NULL DEFAULT false`, `entrega_taxa NUMERIC(12,2)`, `entrega_descricao VARCHAR(280)`;
  - `politica_troca TEXT`;
  - `ultimo_numero_pedido INTEGER NOT NULL DEFAULT 0`.

**`backend/drizzle/0069_pedidos_vitrine.sql`** — só acrescenta; vai antes do deploy.
- **`catalogo.pedidos`:**
  - **Identificação:**
    - `id UUID PK DEFAULT gen_random_uuid()`;
    - `vitrine_id UUID REFERENCES catalogo.contas(id) ON DELETE CASCADE`;
    - `conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE`;
    - `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE` (o dono);
    - `numero INTEGER`;
    - `situacao VARCHAR(30)`, com CHECK em `aguardando_pagamento`, `pago`, `enviado`, `pronto_retirada`, `entregue`, `recusado`, `expirado` e `estornado`;
    - `forma_pagamento VARCHAR(10)`, com CHECK em `pix` e `cartao`.
  - **Cliente:** `cliente_nome`, `cliente_email`, `cliente_telefone` e `cliente_cpf`.
  - **Entrega:**
    - `entrega_tipo VARCHAR(10)`, com CHECK em `retirada` e `entrega`;
    - `endereco_cep`, `endereco_rua`, `endereco_numero`, `endereco_complemento`, `endereco_bairro`, `endereco_cidade` e `endereco_uf`;
    - `observacao`.
  - **Valores:** `subtotal`, `desconto`, `taxa_entrega` e `total`, todos `NUMERIC(12,2)`.
  - **Pagamento:**
    - `mp_payment_id VARCHAR(30)`;
    - `pix_qr_code TEXT`, `pix_qr_code_base64 TEXT` e `pix_expira_em TIMESTAMP`;
    - `reservado_ate TIMESTAMP`;
    - `conferido_em TIMESTAMP` (última conferência ativa);
    - `pago_em TIMESTAMP`.
  - **Receita da entrega:** `receita_entrega_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL`.
  - **Datas:** `created_at` e `updated_at`.
  - **Índices:**
    - `UNIQUE (vitrine_id, numero)`;
    - índice por `(conta_id, created_at DESC)`;
    - índice parcial `(situacao, reservado_ate) WHERE situacao = 'aguardando_pagamento'`;
    - índice por `mp_payment_id`.
- **`catalogo.pedido_itens`:**
  - **Identificação:**
    - `id UUID PK`;
    - `pedido_id UUID REFERENCES catalogo.pedidos(id) ON DELETE CASCADE`;
    - `produto_id UUID REFERENCES catalogo.produtos(id) ON DELETE SET NULL`;
    - `nome VARCHAR(255)` (cópia da hora da compra).
  - **Preço e quantidade:** `preco_original NUMERIC(12,2)`, `preco_unitario NUMERIC(12,2)` (final), `quantidade INTEGER` e `subtotal NUMERIC(12,2)`.
  - **Venda:** `receita_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL` e `sem_estoque BOOLEAN NOT NULL DEFAULT false`.
  - **Índices:** por `pedido_id` e por `produto_id`, este para somar o que está separado.

**Schema do Drizzle:** as tabelas novas vão em `backend/src/modules/catalogo/db/schema.ts`, com os campos no padrão em português do módulo.

**RLS:** o projeto não usa. O isolamento é por conta e dono, no código.

### Infra/Deploy

- **Variáveis novas no backend** (Render e `.env.dev`), cada uma com a confirmação do usuário (regra do `.env`):
  - `MP_CLIENT_ID` e `MP_CLIENT_SECRET`, do aplicativo do FINGERENCE no Mercado Pago Developers;
  - `MP_TOKENS_KEY`, 32 bytes em base64, gerada na hora e guardada só no Render e no `.env.dev`.
- **Conferir no Render:** `FRONTEND_URL` deve apontar para `https://fin-gerence.com.br`, porque é para lá que o callback volta. O padrão do código é o endereço `onrender`.
- **Mercado Pago Developers (passo do usuário):** cadastrar a URL de retorno `https://sistema-financeiro-backend-o199.onrender.com/api/catalogo/mercado-pago/callback`. Para o teste, criar contas de teste de vendedor e comprador.
- **Site estático:** as regras `/loja/*` → `/index.html` (Rewrite) que já existem cobrem as subpáginas.
- **Ordem na produção:**
  1. 0068 e 0069 antes do merge, com confirmação e fora do modo automático;
  2. variáveis no Render antes do merge;
  3. merge e deploy;
  4. teste real.

## Arquivos provavelmente afetados

**Backend**
- `backend/drizzle/0068_vitrine_pagamento_entrega.sql` (novo)
- `backend/drizzle/0069_pedidos_vitrine.sql` (novo)
- `backend/src/modules/catalogo/db/schema.ts`
- `backend/src/modules/catalogo/routes/index.ts`
- `backend/src/modules/catalogo/routes/public.ts`
- `backend/src/modules/catalogo/routes/storefront.ts`
- `backend/src/modules/catalogo/routes/mercadoPago.ts` (novo)
- `backend/src/modules/catalogo/routes/orders.ts` (novo)
- `backend/src/services/storefront.ts`
- `backend/src/services/storefrontInput.ts` + teste
- `backend/src/services/tokenCrypto.ts` + teste (novo)
- `backend/src/services/mercadoPagoAccounts.ts` (novo)
- `backend/src/services/orderInput.ts` + teste (novo)
- `backend/src/services/orderPricing.ts` + teste (novo)
- `backend/src/services/orders.ts` (novo)
- `backend/src/middleware/validation.ts` (limitador por IP genérico, se fizer sentido extrair do `authRateLimiter`)

**Frontend**
- `src/App.tsx`
- `src/screens/public/storefront/StorefrontPage.tsx`
- `src/screens/public/storefront/StorefrontCartPage.tsx` (novo)
- `src/screens/public/storefront/StorefrontCheckoutPage.tsx` (novo)
- `src/screens/public/storefront/StorefrontOrderPage.tsx` (novo)
- `src/screens/public/storefront/StorefrontCartSheet.tsx` (sai)
- `src/screens/public/storefront/useStorefrontCart.ts`
- `src/screens/config/StorefrontDialog.tsx`
- `src/screens/config/PedidosTab.tsx` (novo)
- `src/layout/ConfigPanel.tsx`
- `src/layout/AppShell.tsx` (aviso da volta do Mercado Pago, se necessário)
- `src/utils/screenAccess.ts`
- `src/utils/mercadoPagoSdk.ts` (novo)
- `src/screens/planos/PlanosScreen.tsx` (só passa a importar o carregador)
- `src/utils/storefrontCart.ts` + teste
- `src/utils/storefrontCheckout.ts` + teste (novo: máscaras e validação das etapas)
- `src/services/storefrontService.ts`
- `src/services/queryKeys.ts`

## Estratégia de implementação

1. **Branch:** criar `feat/R/vitrine-checkout` a partir da `main` atualizada (a `feat/R/vitrine-estoque` já está na `main`).
2. **Migrations e schema:** escrever a 0068 e a 0069 e o schema do Drizzle, e aplicar no banco local com confirmação.
3. **Remoção do antigo,** em passo próprio: apagar o `StorefrontCartSheet` e a barra que abria o modal.
4. **Cifra e conexão Mercado Pago (servidor):** `tokenCrypto`, `mercadoPagoAccounts` e `routes/mercadoPago.ts`.
5. **Pedidos (servidor):** `orderInput`, `orderPricing`, `orders` e as rotas públicas e da loja; o webhook; a categoria "Vendas"; o push; o limite por IP.
6. **Vitrine pública (servidor):** a resposta ganha pagamento, entrega, política e disponível com reserva.
7. **Configurações:** `StorefrontDialog` (Pagamento, Entrega, Política) e `PedidosTab`, com o item no menu e a permissão.
8. **Vitrine (tela):** topo com a sacola, página da sacola (com o WhatsApp quando não há Mercado Pago), checkout, página do pedido, rotas e `isStorefrontPath`.
9. **Biblioteca do Mercado Pago:** extrair o carregador para `mercadoPagoSdk.ts` e usá-lo nos planos e no checkout.
10. **Validação:**
    - `tsc` do front e do back, testes e build;
    - roteiro local com o Mercado Pago simulado;
    - render do checkout e da sacola;
    - limpeza dos dados de teste;
    - registro no plano.
11. **Teste real, com o usuário:** variáveis no `.env.dev` com as credenciais de teste, conexão da loja de teste, compra com cartão de teste e conferência da receita e do estoque.

## Regras de negócio identificadas

**Preço e total**
- Os preços e o total vêm sempre do banco: o navegador manda só produto e quantidade.
- O pedido guarda nome e preços da hora da compra.

**Quando aparece o pagamento online**
- Só com o Mercado Pago conectado e pelo menos uma entrega ativa.
- Sem isso, a sacola usa o WhatsApp.

**Separação dos itens**
- Os itens de um pedido pendente ficam separados por 30 minutos.
- O disponível público é o saldo menos o que está separado, e só vale para produto com controle de estoque.
- Uma venda pela receita (no balcão) não respeita a separação.

**Aprovação**
- Só o webhook ou a conferência ativa marcam como pago, sempre buscando o pagamento no Mercado Pago com o token da loja e conferindo a referência e o valor.
- Aprovar duas vezes não gera receitas em dobro.
- A aprovação gera uma receita "Vendas" por item e uma para a entrega, na conta PJ da vitrine, com autor = dono e situação `ativa`. Cada item baixa o estoque.
- Sem saldo na hora: a receita sai sem baixa e o item fica "sem estoque".

**Recusa, expiração e estorno**
- Pix expirado ou pagamento recusado: o pedido fica `expirado` ou `recusado` e os itens são liberados. Nenhuma receita é gerada.
- Estorno ou contestação: o pedido fica `estornado`, as receitas são canceladas (`cancelIncome`) e o estoque volta.

**Situações e entrega**
- Situações que a loja muda: pago → enviado (entrega) ou pronto para retirada (retirada) → entregue.
- A taxa de entrega vale só para a opção "entrega". A retirada é sem custo.

**Cliente e loja**
- Dados do cliente: nome, e-mail, telefone, CPF e, na entrega, o endereço. Ficam só com a loja.
- Número do pedido: sequencial por loja (#1, #2...).
- A conexão Mercado Pago é por conta PJ: uma loja, uma conta Mercado Pago.

## Regras multi-tenant e segurança

- **Rotas da loja:** pedidos, conexão e configuração passam por `resolveCompanyAccount` (dono ou colaborador da conta, só PJ) e `requireScreenAccess('accessProductCatalog')`.
- **Pedido por id:** é sempre filtrado pela conta. Pedido de outra conta dá 404.
- **Rotas públicas:**
  - pedido só pelo id (UUID), da mesma vitrine do endereço;
  - respostas sem `usuario_id`, `conta_id`, dados de outros pedidos nem quantidade em estoque;
  - criação com limite por IP.
- **Tokens:**
  - cifrados em repouso e nunca devolvidos por nenhuma rota;
  - a chave pública da loja é a única coisa exposta, e é pública por natureza.
- **OAuth:** `state` assinado e com validade, ligado à conta e ao usuário que iniciou. O callback confere tudo antes de gravar.
- **Webhook:**
  - nunca confia no corpo da notificação: busca o pagamento no Mercado Pago com o token da loja do pedido;
  - confere `external_reference === pedido.id` e o valor;
  - responde 200 rápido.
- **Erros públicos:** não revelam se uma loja tem o Mercado Pago conectado nem detalhes de outros pedidos.
- **LGPD:**
  - dados do cliente só para a loja;
  - CPF mostrado mascarado na lista (só o detalhe mostra completo);
  - linha de aviso no checkout.

## Validações necessárias

**Pedido público**
- Itens: de 1 a 30, cada um com UUID e quantidade inteira de 1 a 99. Produto ativo, da conta da vitrine e com disponível suficiente.
- Cliente:
  - nome de 2 a 80 caracteres;
  - e-mail válido de até 150 caracteres;
  - telefone com 10 ou 11 dígitos;
  - CPF com dígitos verificadores válidos.
- Entrega: o tipo precisa estar ativo na vitrine. Na entrega:
  - CEP de 8 dígitos;
  - rua de 2 a 150 caracteres;
  - número de 1 a 20;
  - complemento de até 80;
  - bairro de 2 a 80;
  - cidade de 2 a 80;
  - UF entre as 27 válidas.
- Pagamento: `pix` ou `cartao`, com `card_token` não vazio no cartão.
- Observação: até 300 caracteres.

**Configuração da vitrine**
- **Retirada:**
  - endereço até 280 caracteres, obrigatório quando a retirada está ativa;
  - horário até 120.
- **Entrega:**
  - taxa entre 0 e `MAX_AMOUNT`, obrigatória quando a entrega está ativa (pode ser 0, entrega grátis);
  - área e prazo até 280.
- **Política de troca:** até 5000 caracteres.

**Situação do pedido (loja):** só as transições permitidas.

**OAuth:** `code` e `state` presentes; `state` válido, do propósito certo e dentro da validade.

## Testes necessários

### Frontend

- `src/utils/storefrontCart.test.ts`: sacola com "você economiza", limite pelo disponível e retirada do item esgotado.
- `src/utils/storefrontCheckout.test.ts`:
  - máscaras e validação de CPF, telefone e CEP;
  - validação de cada etapa;
  - taxa de entrega no total;
  - formato da contagem regressiva do Pix.

### Backend

- `orderInput.test.ts`: cada campo, a entrega conforme o tipo, os itens e o pagamento.
- `orderPricing.test.ts`:
  - subtotal, economia, taxa e total;
  - disponível com reserva;
  - conversão de todas as situações do Mercado Pago.
- `tokenCrypto.test.ts`: cifra e decifra; texto adulterado é recusado; chave inválida dá erro claro.
- `storefrontInput.test.ts` (estendido): entrega, retirada e política.
- O `state` do OAuth (assinatura, propósito e validade), num teste puro do módulo, se extraído.

### E2E

- **Roteiro local,** com os serviços rodando no banco local e o cliente do Mercado Pago simulado (troca do gateway por injeção, só no script de teste):
  1. criar pedido Pix: total do banco, número 1, itens separados, e o disponível público cai;
  2. dois pedidos disputando o último item: um passa e o outro recebe "Só resta…";
  3. aprovação: o pedido fica pago, gera uma receita por item mais a da entrega, o estoque baixa, sai o push simulado e aprovar de novo não duplica;
  4. expiração e recusa: os itens são liberados e nenhuma receita é gerada;
  5. estorno: as receitas são canceladas e o estoque volta;
  6. referência ou valor diferente do pagamento simulado: o pedido não muda;
  7. isolamento: a loja A não vê o pedido da loja B, e a rota pública de outra vitrine dá 404;
  8. limite por IP: o 11º pedido em 15 min dá 429;
  9. sem Mercado Pago conectado: a vitrine pública devolve `online: false`;
  10. situação: as transições válidas passam e as inválidas dão 400.
- **Render (SSR) temporário:** sacola (com e sem Mercado Pago), checkout em cada etapa, página do pedido (Pix pendente e pago), "Configurar vitrine" e "Pedidos".
- **Teste real com o usuário,** no ambiente de testes do Mercado Pago:
  - conectar a loja de teste;
  - comprar com cartão de teste aprovado e recusado;
  - gerar um Pix e conferir a página do pedido;
  - conferir a receita, o estoque e o push.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit                      # frontend (raiz)
npm test                              # frontend
npm run build                         # frontend

npm --prefix backend run build        # tsc --noEmit do backend
npm --prefix backend test

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0068 --banco local   # com confirmação, uma por vez
```

## Riscos e pontos de atenção

- **Credenciais do Mercado Pago:** sem o aplicativo e as variáveis, não há pagamento real. O código precisa falhar com mensagem clara ("pagamento online indisponível") enquanto elas não existirem.
- **Dinheiro:**
  - qualquer erro na aprovação pode gerar receita errada; por isso a aprovação é idempotente e conferida com o Mercado Pago;
  - estorno e contestação só pelo Mercado Pago.
- **Webhook perdido:** se o aviso chegar no meio de um deploy (cerca de 1 min fora do ar por causa do disco), o Mercado Pago tenta de novo e a página do pedido confere ativamente. Um pedido pago sem ninguém abrir a página depende da nova tentativa do Mercado Pago.
- **Cartão em análise:** pode passar dos 30 min de separação e cair no "sem estoque".
- **Venda no balcão:** ignora a separação, então um pedido pago pode ficar "sem estoque".
- **Validade dos tokens:** os tokens da loja vencem (cerca de 180 dias) e dependem da renovação. Se ela falhar, a vitrine volta para o WhatsApp até a loja reconectar.
- **LGPD:** a vitrine passa a guardar CPF, e-mail, telefone e endereço de terceiros.
- **Biblioteca do Mercado Pago:** é carregada de fora (`sdk.mercadopago.com`). Já é assim nos planos.
- **Tamanho:** é a maior entrega até agora. A implementação pode precisar de mais de uma sessão; nesse caso, registrar o andamento neste plano.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação estará pronta quando:

- A loja conectar e desconectar o Mercado Pago em "Configurar vitrine", com os tokens cifrados e renovados.
- A loja configurar retirada, entrega com taxa e a política de troca.
- O cliente, numa vitrine com o Mercado Pago conectado, comprar pela página da sacola e pelo checkout em etapas, pagar com Pix (QR Code e copia-e-cola) ou cartão, e ver o pedido confirmado sozinho, com número.
- O pedido pago gerar as receitas "Vendas" na conta PJ (uma por item e uma para a entrega) e baixar o estoque, e o estorno desfizer isso.
- Os itens ficarem separados por 30 min no Pix pendente e voltarem quando ele expirar ou for recusado.
- A tela "Pedidos" listar, detalhar e avançar a situação, e o dono receber o push no pedido pago.
- Sem o Mercado Pago conectado, a página da sacola enviar o pedido pelo WhatsApp.
- A sacola em modal sair, sem sobras.
- O `tsc` do front e do back, os testes e o build passarem, e o roteiro local, o render e o teste real ficarem registrados neste plano.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal de contexto e seguir as regras transversais do `/AGENT.md` e do `/CLAUDE.md`.
- **Branch:** `feat/R/vitrine-checkout`, a partir da `main`.
- **Migrations:**
  - Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
  - No banco local, uma por vez. Na produção, 0068 e 0069 antes do merge, fora do modo automático.
- **Variáveis de ambiente:** não alterar o `.env` nem o `.env.dev` sem confirmação a cada alteração. As credenciais do Mercado Pago são do usuário; pedir que ele mesmo as coloque, ou confirmar antes.
- **Remoção do antigo:** a sacola em modal sai antes do código novo, como passo próprio.
- **Código:**
  - nomes novos em inglês;
  - campos de pedido e resposta no padrão em português do módulo;
  - Drizzle em query nova (dentro de transação de receita, `drizzle(client)`);
  - nada de `any` (os tipos do SDK do Mercado Pago, quando incompletos, viram interfaces locais pequenas);
  - mensagens em português.
- **Não mexer no fluxo de pagamento dos planos:** só extrair o carregador da biblioteca.
- **O que já existe e deve ser reaproveitado:**
  - `sellProductInIncome`, `cancelIncome`, `listImagesByProduct` e `buildProductPricing`;
  - na tela, `buildOrderMessage` e `useStorefrontCart`.
- **Validação:** roteiro local com o Mercado Pago simulado e render temporário em `tmpclaude-*` (ignorado pelo git; os imports precisam ser estáticos, no estilo do app, para não carregar duas cópias do `react-router`). Apagar os dados de teste.
- **Registro:** anotar os resultados e os desvios neste plano antes do `/finalizar`.

## Registro da implementação (2026-10-03)

- **Branch:** `feat/R/vitrine-checkout`, criada da `main` `ace9e3c2`. Código todo escrito, ainda sem commit.
- **Banco local:** 0068 e 0069 aplicadas com a confirmação do usuário, uma por vez. Nenhuma pendente.

### Validação

- `tsc` do front e do back sem erro; testes do front 106/106 e do back 280/280; `npm run build` ok.
- **Teste de tela, 75/75.** Rodou no jsdom, instalado fora do projeto, com a rede e o Mercado Pago simulados, clicando como o cliente:
  - **vitrine:** sacola no topo com contador e aviso "Adicionado à sacola · Ver sacola";
  - **sacola:** com e sem Mercado Pago (o WhatsApp), quantidade, excluir e vazia;
  - **checkout nas três etapas:** validação, máscaras, ViaCEP, Pix, cartão recusado, erro do servidor e cartão aprovado;
  - **página do pedido:** Pix pendente que vira pago sozinho em 5 s, cartão em análise, Pix vencido, expirado, estornado, enviado e não encontrado;
  - **"Configurar vitrine":** seções, salvar, conectar, desconectar e indisponível;
  - **"Pedidos":** lista, filtro, detalhe e mudança de situação;
  - a volta do Mercado Pago em "Produtos e estoque".
- **Roteiro do servidor no banco local, 38/38.** O servidor subiu na porta 3016 dentro do processo do roteiro, e os serviços de pedido rodaram com o gateway simulado.
  - Cobre os 10 cenários do plano.
  - E também: cartão aprovado, recusado e em análise; falha ao gerar o pagamento (502, pedido recusado e item liberado); conferência ativa da página do pedido; venda no balcão com o pedido pago ficando "sem estoque"; número sequencial; lista e detalhe da loja; webhook.
- **Limpeza:** dados de teste apagados (2 usuários, nenhum pedido órfão); scripts temporários removidos.
- **Observação:** no item 1e do roteiro, a página pública do pedido (via HTTP, com o gateway real) fez a conferência ativa no Mercado Pago com o token falso do teste. O Mercado Pago respondeu 401 e a página respondeu normalmente, com o erro só no log.

### Desvios do plano

1. **Seletor de quantidade da sacola:** vai de 1 a 99. O disponível não é exposto na vitrine (regra de segurança do próprio plano). Acima do disponível, o servidor responde "Não há estoque suficiente…".
2. **Sacola no aparelho:** é gravada na hora, não num efeito, e lida já no primeiro render. Assim o checkout nunca acha a sacola vazia por engano.
3. **Cartão recusado na hora:** o checkout mantém a sacola e mostra o aviso; o pedido fica registrado como recusado. A sacola só sai quando abre a página do pedido.
4. **Observação do pedido:** fica na etapa de entrega.
5. **"Conectar Mercado Pago":** salva antes o que foi preenchido em "Configurar vitrine", porque a conexão sai do app.
6. **Volta do Mercado Pago:**
   - o histórico do navegador é refeito para "Fechar" voltar ao app, e não à página do Mercado Pago;
   - `catalogo` e `pedidos` entraram nos itens que abrem pela URL (`?config=`).
7. **CEP:** pelo ViaCEP, direto do navegador (`src/services/cepService.ts`).
8. **Pedido de outra conta na rota da loja:** responde como pedido inexistente (404 "Pedido não encontrado"), e não "Conta não encontrada".
9. **Render temporário:** no lugar do SSR, teste de tela com cliques no jsdom, que cobre as etapas do checkout.

### Pendente

- `/finalizar`.
- **Produção:** 0068 e 0069 antes do merge (fora do modo automático); variáveis no Render; conferir `FRONTEND_URL`.
- **Teste real com o Mercado Pago:** o usuário cria o aplicativo e as contas de teste.
- Conferência visual no navegador.
