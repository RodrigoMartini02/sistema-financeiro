# Plano de Implementação: estoque correto, vitrine por PJ, desconto e vitrine pública nova

## Origem

- **Arquivo de especificação:** não há `.md`. O escopo foi fechado no chat em 2026-10-03, a partir da análise da tela Configurações → "Produtos e estoque". Os pedidos e respostas foram:
  - "1 sim, 2 pode conferir, 3 segunda etapa, 4 pretendo ter";
  - os pedidos de "valor percentual de desconto" e de "interface amigável ao público na tela externa com o que já existe no mercado";
  - "sim para todos" nas seis perguntas seguintes.
- **Data do planejamento:** `2026-10-03`
- **Classificação:** `frontend + backend + database`, com uma conferência de infra.

## Resumo

**Problemas de hoje:**
- Cancelar ou excluir uma receita com produto vendido não devolve o estoque.
- Duas vendas simultâneas podem passar do saldo, porque o saldo é lido sem trava.
- A lista de produtos e a vitrine são uma só por titular, e não por empresa.
- A checagem de acesso aos produtos é só pelo dono. Com duas PJs, um colaborador de uma mexeria nos produtos da outra.
- O botão "Comprar" da vitrine abre o WhatsApp sem número.
- A vitrine não tem nome, logo, busca, categorias, desconto nem "esgotado".
- Cancelar uma receita com representante cancela **todas** as comissões do mês, não só a dela.

**O que o plano entrega:**
- O estoque volta quando a venda é desfeita, uma vez só. As vendas simultâneas passam a usar trava, e o controle de estoque fica opcional por produto.
- Cada PJ tem a própria lista de produtos e a própria vitrine, com link amigável, nome, logo, descrição e WhatsApp.
- O produto ganha desconto (em R$ ou %) e categoria.
- A vitrine pública é refeita no padrão de mercado (Kyte, carrinho do WhatsApp Business). Ela tem busca, categorias, selos, detalhe com fotos, compartilhamento e uma sacola que envia o pedido pelo WhatsApp da empresa.
- A comissão passa a ser ligada à receita que a gerou. Cancelar ou excluir a receita cancela só a comissão dela, se ainda não foi paga.

## Decisões aplicadas

**Escopo fechado no chat:**
- Entram o estorno do estoque, a separação por PJ e a vitrine nova com nome, logo e WhatsApp da empresa e "Esgotado".
- Custo do produto e compra virando despesa ficam para a segunda etapa.
- O desconto fica no cadastro do produto, em R$ ou %, sem data de validade.
- O link é amigável: `fin-gerence.com.br/loja/<link>`. O link com código (`/catalogo/<uuid>`) continua funcionando.
- A categoria é um campo simples no produto, com sugestões das já usadas e sem tela nova.
- O produto esgotado continua na vitrine, com selo e sem botão de compra.
- A correção da comissão entra neste plano, com migration.
- As fotos de perfil continuam no banco, sem mudança.

**Decisões do `/planejar`:**
- **Decisão 1:** cada produto ganha a chave "Controlar estoque", desligada por padrão.
  - Sem controle, o produto nunca aparece esgotado e a venda não mexe no estoque.
  - Ao ligar, o usuário informa a quantidade inicial.
  - Os produtos que já têm movimentação ficam com a chave ligada.
  - A resposta foi "q", lida como 1 e comunicada ao usuário.
- **Decisão 2:** cancelar ou excluir a receita cancela só a comissão dela, e só se ainda não foi paga. A comissão paga fica como está.
- **Decisão 3:** a sacola pede só o nome e uma observação opcional. Entrega e pagamento são combinados na conversa.

**Infra, já resolvida fora do código (2026-10-03):** o serviço `sistema-financeiro-backend` (Starter) não tinha disco. O usuário adicionou um Persistent Disk de 1 GB em `/opt/render/project/src/backend/uploads`. O Root Directory é `backend`. O teste passou: a foto continuou depois de um Manual Deploy. As fotos de produto e os PDFs de contrato deixam de se perder.

## Escopo

### Dentro do escopo

1. **Estoque**
   - Uma função única de movimentação, com `FOR UPDATE` no produto.
   - Estorno ligado à receita e idempotente ao cancelar a receita, excluir a receita e excluir o ano.
   - A venda confere a conta e se o produto está ativo.
   - O controle de estoque é opcional por produto (`controla_estoque`), com quantidade inicial.
2. **Comissão**
   - A despesa de comissão grava a receita de origem (`despesas.receita_origem_id`).
   - Cancelar ou excluir a receita cancela só a comissão ligada e não paga.
   - As comissões antigas são ligadas por correspondência (0067).
3. **Produtos por conta PJ**
   - A lista, o cadastro e a edição usam a conta informada.
   - O acesso é conferido pela conta (dono ou colaborador dela).
   - Os produtos antigos sem conta passam para a PJ do dono.
4. **Desconto e categoria no produto**
   - O preço final é calculado no servidor e na tela.
   - O preço com desconto vem preenchido na venda (receita e assistente).
5. **Vitrine por conta**
   - Configuração com nome, descrição, WhatsApp, link e logo.
   - Rota pública por link ou código antigo, sem expor quantidade em estoque.
6. **Vitrine pública nova** em `/loja/<link>` e `/catalogo/<código>`:
   - topo com logo, nome, descrição e WhatsApp;
   - busca e filtro por categoria;
   - cards com desconto e "Esgotado";
   - detalhe com galeria e compartilhamento, com link direto do produto;
   - sacola guardada no aparelho que envia o pedido pelo WhatsApp;
   - sem o banner de cookies, o "instalar app" e a contagem de acessos do FINGERENCE;
   - rodapé "Feito com FINGERENCE".
7. **Remoção do código antigo**
   - a página pública atual;
   - a rota `GET /api/catalogo/conta`;
   - a rota pública `GET /api/catalogo/public/:contaId/produtos`;
   - a rota `DELETE /api/catalogo/produtos/:id` e o `deleteProduto` do front, que nenhuma tela usa.

### Fora do escopo

**Segunda etapa:**
- custo do produto e margem;
- compra (entrada de estoque) virando despesa;
- pedido da vitrine registrado no sistema (virando receita e reservando estoque);
- variações de tamanho e cor;
- pagamento por Pix na vitrine;
- prévia do link com o logo da loja (meta tags para o robô do WhatsApp);
- entrega, endereço e forma de pagamento na sacola;
- código/SKU e unidade de medida;
- ordenação na vitrine.

**Também fica de fora:**
- mover as fotos de perfil para o disco;
- histórico de links antigos (redirecionar um link amigável trocado);
- encerrar contrato: ele só cancela receitas `prevista` geradas pelo contrato, que nunca têm produto. Conferido em `backend/src/routes/contracts.ts:61-67`.

## Leitura de contexto

- **`/AGENT.md`:** descreve um sistema multi-prefeitura, que não corresponde a este projeto. Valem só as regras transversais, como nos planos anteriores:
  - Drizzle em query nova;
  - nada de `any`;
  - erros claros, sem vazar dados;
  - nomes de código em inglês;
  - migrations só com confirmação;
  - checagem de acesso no backend.
- **`/backend/AGENT.md` e `/frontend/AGENT.md`:** não existem neste projeto.
- **`/CLAUDE.md`:** fluxo `/planejar` → `/implementar` → `/finalizar`, migrations e `.env` só com confirmação.
- **Arquivos lidos:**
  - **Catálogo (servidor):** `backend/src/modules/catalogo/db/schema.ts`, `routes/{index,produtos,public,contas}.ts`; `backend/src/services/{estoque,catalogo}.ts`.
  - **Receitas, comissão e painel:** `incomeService.ts`, `incomeInput.ts`, `commissionService.ts`, `painelService.ts`, `entryQueries.ts`.
  - **Rotas:** `backend/src/routes/{incomes,years,contracts,accountNameCatalog}.ts`.
  - **Utilitários e middleware:** `backend/src/utils/{accountAccess,familyVisibility,requestInput}.ts`, `backend/src/middleware/permissions.ts`.
  - **Schema:** `backend/src/db/schema/{accounts,incomes,expenses,users,index}.ts` e `backend/src/db/client.ts`.
  - **Migrations e scripts:** `backend/drizzle/0026`, `0037`, `0038` e `0062`; `backend/scripts/migrations.ts`.
  - **Tela:**
    - `src/screens/config/CatalogoTab.tsx`, `src/components/ProdutoImagensManager.tsx` e `src/components/AvatarUploadDialog.tsx`;
    - `src/screens/public/CatalogoPublicoPage.tsx` e `src/App.tsx`;
    - `src/services/{catalogoService,apiClient,queryKeys,financeService,accountNameCatalogService}.ts`;
    - `src/screens/finance/income-dialog/{IncomeDialog.tsx,draftRules.ts,IncomeDetailsPopover.tsx}`;
    - `src/components/financial-assistant/FinancialAssistant.tsx`, `src/screens/finance/LancamentosTable.tsx` e `src/hooks/useFinanceDashboard.ts`;
    - `src/layout/ConfigPanel.tsx`, `src/types/finance.ts`, `scripts/generate-public-route-html.mjs` e `vite.config.ts`.
- **Referências de mercado:**
  - [Catálogo Digital Kyte](https://www.kyteapp.com/digital-catalog);
  - [Pedidos online no Catálogo Kyte](https://docs.kyteapp.com/pt-BR/articles/9504323-como-ativar-pedidos-online-no-catalogo-kyte);
  - [Carrinho do WhatsApp Business](https://faq.whatsapp.com/1184376605821468/?locale=pt_BR&eea=0).

## Impacto por área

### Frontend

**Tela "Produtos e estoque"** (`src/screens/config/CatalogoTab.tsx`)
- **Lista:**
  - mostra a conta ativa (`getActiveAccountId()`), com a query por conta;
  - selos de preço final, com o original riscado e "-X%" quando há desconto;
  - selo de categoria;
  - selo "N em estoque" e botão "Estoque" só quando o controle está ligado.
- **Cadastro** (`ProdutoDialog`):
  - Categoria: `input` com `datalist` das categorias já usadas na conta, calculadas da lista carregada;
  - Desconto: seletor "Sem desconto | R$ | %", com valor e prévia "Preço final: R$ X";
  - chave "Controlar estoque";
  - com a chave ligada: "Quantidade inicial" (produto novo, ou produto que nunca teve movimentação) ou "Em estoque" (somente leitura), mais "Estoque mínimo".
  - O desativar/ativar (`toggleAtivoMut`) reenvia também os campos novos.
- **Banner:** "Apenas produtos ativos aparecem na vitrine." com os botões **Configurar vitrine**, **Copiar link** ("Copiado" por 2 s, mesmo padrão do Pix em `PlanosScreen`) e **Abrir** (`${origin}/loja/<link>`).

**Novo `src/screens/config/StorefrontDialog.tsx`** ("Configurar vitrine"):
- logo, pelo `AvatarUploadDialog` com novas props opcionais `title` e `description`, com prévia, "Trocar" e "Remover"; sem logo próprio, mostra o logo padrão quando houver;
- Nome da loja (placeholder: nome fantasia ou nome da conta);
- Descrição (até 280 caracteres, com contador);
- WhatsApp (máscara `(00) 00000-0000`);
- Link (prefixo `fin-gerence.com.br/loja/`, normalizado enquanto digita);
- botão "Salvar". O erro `409` mostra "Esse link já está em uso".

**Receita e assistente**
- **`IncomeDialog.tsx`:** busca os produtos da conta da receita (`fetchProdutos(accountId)`, chave por conta). Sai o filtro `contaId === null || contaId === accountId`; o filtro `ativo` continua.
- **`draftRules.ts` (`productSaleInfo`):**
  - o total usa o preço final;
  - `insufficient` só vale com `controlaEstoque`;
  - sem controle, não há selo de estoque.
- **`IncomeDetailsPopover.tsx`:** a opção mostra o preço final, e o texto de estoque só aparece com controle.
- **`FinancialAssistant.tsx`:**
  - a lista de produtos vem pela conta;
  - sai o filtro manual de conta;
  - o pré-preenchimento usa o preço final (hoje é `quantidade × valor`, perto da linha 758);
  - o aviso de estoque só aparece com controle.

**Cancelar e excluir receita** (`LancamentosTable.tsx`, `useFinanceDashboard.ts`)
- A confirmação acrescenta "A quantidade vendida volta para o estoque." quando há produto.
- Acrescenta também "A comissão desta receita também é cancelada, se ainda não foi paga." quando há representante.
- No sucesso, além do que já invalida, chama `invalidateIncomeQueries` e `invalidateExpenseQueries`, para atualizar produtos, comissões e painel.
- `src/types/finance.ts` ganha `produtoId`, e `financeService.ts` mapeia `produto_id`.

**Vitrine pública nova:** pasta `src/screens/public/storefront/`, com `StorefrontPage.tsx` e componentes de topo, card, detalhe e sacola, em Tailwind e pensada primeiro para celular.
- **Estados:** carregando (esqueleto), loja não encontrada, vazia ("Nenhum produto disponível no momento").
- **Topo:** logo redondo, nome, descrição e botão WhatsApp (`wa.me/<número>`).
- **Busca:** sem acento e sem diferença de maiúsculas, por nome e descrição.
- **Categorias:** chips de categoria; "Todos" é o padrão.
- **Grade:** 2 colunas no celular, 3 no tablet e 4 no computador.
- **Card:** foto quadrada, nome em 2 linhas, preço final, original riscado e "-X%" quando há desconto.
  - Se estiver esgotado: foto em cinza e selo "Esgotado", sem botão.
  - Se não estiver: botão "Adicionar".
- **Detalhe:** folha que sobe de baixo no celular e modal no computador.
  - galeria com rolagem por encaixe (CSS scroll-snap, sem biblioteca), pontos e setas no computador;
  - descrição completa, quantidade (1–99) e "Adicionar à sacola";
  - "Compartilhar": `navigator.share` ou copiar `?produto=<id>`;
  - abrir `?produto=<id>` mostra o detalhe direto.
- **Sacola:**
  - barra fixa "Ver sacola · N itens · R$ X";
  - folha com itens, +/−, remover e subtotal;
  - campos Nome (obrigatório) e Observação (opcional);
  - botão "Enviar pedido pelo WhatsApp", que abre `wa.me` com a mensagem pronta;
  - fica guardada no `localStorage` por vitrine, com `try/catch`;
  - ao abrir de novo, é conferida contra os produtos atuais: tira o que saiu ou esgotou e usa o preço atual.
- **Loja sem WhatsApp:** a vitrine funciona como catálogo, sem sacola, sem botões de compra e sem botão de WhatsApp.
- **Título e descrição da página:** são os da loja.
- **Rodapé:** "Feito com FINGERENCE" (link para o site).

**`src/App.tsx`**
- As rotas `/loja/:storefront` e `/catalogo/:storefront` levam à página nova.
- Nessas rotas não aparecem `PublicSeo`, `PublicPageTracker`, `CookieBanner` e `InstallPwaBanner`.

**Serviços e chaves**
- **`catalogoService.ts`:**
  - os tipos ganham `descontoTipo`, `descontoValor`, `categoria`, `controlaEstoque`, `valorFinal` e `descontoPercentual`;
  - `fetchProdutos(accountId)`;
  - o formulário ganha os campos novos;
  - saem `deleteProduto`, `fetchCatalogoConta`, `CatalogoConta`, `fetchProdutosPublicos`, `ProdutoPublico` e `getProdutoImagemPublicaUrl`, que vão para o serviço da vitrine.
- **Novo `src/services/storefrontService.ts`:** configuração (ler e salvar), vitrine pública e URL de imagem pública.
- **`queryKeys.ts`:**
  - `catalogoProdutos(accountId)` usa o prefixo `'catalogo-produtos'`, que continua em `INCOME_DEPENDENT_QUERIES`;
  - nova `storefrontConfig(accountId)`;
  - sai `catalogoConta`.
- **Novos `src/utils/productPricing.ts` e `src/utils/storefrontCart.ts`:** ficam na pasta coberta por `npm test`.

### Backend

**Estoque:** `backend/src/services/estoque.ts` vira `backend/src/services/stock.ts`, com identificadores em inglês.
- **`recordStockMovement(executor, { productId, ownerId, type, quantity, reason, incomeId })`**
  - é a função única que hoje existe em duas cópias (`registrarMovimentacaoEstoque` em Drizzle e `registrarMovimentacaoEstoqueNaTransacao` em SQL);
  - recebe um executor do Drizzle: a transação do `db` ou o `drizzle(client, { schema })` da transação da receita;
  - trava o produto com `.for('update')`, nunca deixa o saldo negativo e grava o histórico.
- **`sellProductInIncome(executor, { productId, accountId, ownerId, quantity, incomeId })`**
  - o produto precisa ser do dono, da conta da receita e estar ativo;
  - com controle, grava a saída;
  - sem controle, não grava nada.
- **`returnSoldStock(executor, { incomeId, reason })`**
  - acha a saída da receita sem entrada correspondente, trava o produto, soma a quantidade da saída e grava uma entrada com `receita_id`;
  - não faz nada se o produto foi apagado ou se o estorno já existe;
  - o índice único da 0064 garante que acontece uma vez só.
- **`StockError`** substitui `EstoqueError`, com as mensagens em português de hoje e uma nova: "Ligue o controle de estoque deste produto".

**Receitas**
- **`incomeService.ts`:**
  - `createIncome` usa `sellProductInIncome` e passa o id de cada linha para a comissão;
  - novas `cancelIncome(ownerId, incomeId)` e `deleteIncome(ownerId, incomeId)`, numa transação: travam a receita; se ela não estava cancelada, devolvem o estoque e cancelam a comissão ligada e não paga; depois cancelam ou apagam;
  - cancelar uma receita já cancelada não faz nada.
- **`incomes.ts`:**
  - as rotas de cancelar e excluir chamam o serviço;
  - sai o `UPDATE despesas ... LIKE 'Comissão - %'` do mês inteiro, que também usava `req.user` em vez do dono;
  - o POST trata `StockError` (produto não encontrado → 404; os demais → 400).
- **`years.ts`:** excluir o ano roda numa transação.
  - Primeiro, para cada receita do ano que não está cancelada, chama `returnSoldStock` com o motivo "Estorno — ano excluído". É uma operação rara, então o laço por receita é aceitável.
  - Depois vêm os `DELETE` de hoje, no mesmo cliente.

**Comissão** (`commissionService.ts`)
- `createCommissionExpense` recebe `incomeId` e grava `receita_origem_id`.
- Nova `cancelLinkedCommission(executor, incomeId)` faz `status = 'cancelada'` onde `receita_origem_id = incomeId AND status = 'ativa' AND pago IS NOT TRUE`.

**Produtos** (`backend/src/modules/catalogo/routes/produtos.ts`)
- **Conta e acesso:**
  - `resolveCompanyAccount(requesterId, accountId, message)` sai de `accountNameCatalog.ts` e vai para `backend/src/utils/accountAccess.ts`, compartilhada pelas duas rotas. Ela faz `canWriteToAccount` e confere se a conta é PJ;
  - novo `loadAccessibleProduct(productId, requesterId)` traz o produto quando a conta dele (`conta_id`) é acessível ao solicitante. Produto sem conta ou de conta alheia dá 404.
- **`GET /?conta_id=`** (`requireCatalogAccess('products')`): produtos da conta e do dono, por nome, com imagens em lote, `valorFinal` e `descontoPercentual`.
- **`POST /`:**
  - valida com `readProductInput`;
  - `conta_id` é obrigatório e precisa ser PJ;
  - `usuario_id` é o dono da conta;
  - com controle e quantidade inicial > 0, grava a entrada "Estoque inicial" na mesma transação.
- **`PUT /:id`:**
  - valida com `readProductInput`;
  - a conta não muda;
  - ao ligar o controle num produto sem movimentação, a quantidade inicial > 0 vira entrada "Estoque inicial".
- **Imagens** (`POST /:id/imagens`, `GET /imagens/:arquivo`, `DELETE /imagens/:id`): passam a usar `loadAccessibleProduct`.
- **`POST /:id/estoque`:** usa `loadAccessibleProduct` e exige controle ligado.
- **`GET /:id/estoque/movimentacoes`:** usa `loadAccessibleProduct`.
- **`DELETE /:id`:** sai, porque nenhuma tela usa.
- **Novo `backend/src/services/productInput.ts`** (no padrão de `incomeInput.ts`): `readProductInput(body)` para nome, descrição, valor, desconto, categoria, `controla_estoque`, `quantidade_inicial`, `estoque_minimo` e `ativo`.
- **Novo `backend/src/services/productPricing.ts`:** `calculateFinalPrice`, `calculateDiscountPercent` e a validação do desconto. Os helpers que hoje estão em `services/catalogo.ts` podem ir para cá.

**Vitrine**
- `routes/contas.ts` dá lugar a **`routes/storefront.ts`**, montado em `/api/catalogo/storefront`, com `requireScreenAccess('accessProductCatalog')`.
- **`GET /?conta_id=`:**
  - faz `resolveCompanyAccount` e depois lê ou cria a vitrine da conta;
  - na criação, ou quando a vitrine migrada não tem link, o link é gerado do nome fantasia ou do nome da conta, sem acento, com sufixo `-2`, `-3`… se já existir;
  - devolve `{ id, conta_id, link, nome, nome_padrao, descricao, whatsapp, logo, logo_padrao }`;
  - o `logo_padrao` é a `usuarios.foto` do dono quando a conta é a PJ padrão dele (a PJ do login).
- **`PUT /`:** recebe `{ conta_id, nome, descricao, whatsapp, link, logo }` e valida com `readStorefrontInput`. A violação do índice único do link devolve `409` "Esse link já está em uso".
- **Novo `backend/src/services/storefrontInput.ts`:** `slugify`, `isValidStorefrontSlug`, `normalizeWhatsapp`, `isValidLogoDataUrl`, `parseStorefrontParam` e `readStorefrontInput`.
- **Novo `backend/src/services/storefront.ts`:** acesso a dados (ler ou criar, salvar, achar a vitrine pública e listar os produtos públicos), deixando as rotas finas.

**Rota pública** (`routes/public.ts`)
- **`GET /:vitrine`:**
  - aceita UUID (código antigo) ou link; qualquer outra coisa dá 404;
  - a vitrine precisa ter `conta_id`, e a conta precisa estar ativa e ser PJ;
  - devolve `{ loja: { nome, descricao, whatsapp, logo, link }, produtos: [{ id, nome, descricao, categoria, valor, valorFinal, descontoPercentual, esgotado, imagens }] }`, só com produtos ativos da conta, ordenados por nome;
  - `esgotado = controla_estoque AND quantidade_estoque <= 0`;
  - nunca devolve `quantidade_estoque`, `usuario_id` nem `conta_id`.
- **`GET /:vitrine/imagens/:arquivo`:**
  - a imagem precisa ser de um produto ativo da conta da vitrine;
  - leva o cabeçalho `Cache-Control: public, max-age=31536000, immutable`, porque o nome do arquivo é único.
- **`GET /:contaId/produtos`:** sai.

**Montagem** (`routes/index.ts`): entra `/storefront` e sai `/conta`.

**Painel** (`painelService.ts`, `buscarEstoqueBaixo`): passa a exigir `controla_estoque = true`.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**`backend/drizzle/0064_produtos_desconto_categoria_controle.sql`** — vai para a produção **antes** do deploy.
- **Colunas novas em `catalogo.produtos`:**
  - `desconto_tipo VARCHAR(10) CHECK (desconto_tipo IN ('valor','percentual'))`;
  - `desconto_valor NUMERIC(12,2)`;
  - `categoria VARCHAR(60)`;
  - `controla_estoque BOOLEAN NOT NULL DEFAULT false`.
- **Restrição** `CHECK ((desconto_tipo IS NULL) = (desconto_valor IS NULL))`.
- **`controla_estoque = true`** onde existe movimentação ou `quantidade_estoque <> 0`.
- **Produtos com `conta_id IS NULL`** ganham a PJ do dono, escolhida por `eh_padrao DESC, id`. Dono sem PJ continua nulo, e o produto some das listas, como já acontece no painel PJ.
- **Índice** `UNIQUE (receita_id) WHERE tipo = 'entrada' AND receita_id IS NOT NULL` em `catalogo.movimentacoes_estoque`, para que o estorno aconteça uma vez só.
- **Compatível com o código antigo:** ele não lê nem grava as colunas novas, e não grava entrada com `receita_id`.

**`backend/drizzle/0065_vitrine_por_conta.sql`** — vai para a produção **antes** do deploy.
- **Colunas novas em `catalogo.contas`** (a vitrine; o nome da tabela fica):
  - `conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE`;
  - `slug VARCHAR(60)`;
  - `nome VARCHAR(100)`;
  - `descricao VARCHAR(280)`;
  - `whatsapp VARCHAR(13)`;
  - `logo TEXT`;
  - `updated_at TIMESTAMP NOT NULL DEFAULT NOW()`.
- **Vitrine de hoje:** fica com a PJ do dono que tem mais produtos (desempate por `eh_padrao DESC, id`).
- **Índices:**
  - sai `idx_catalogo_contas_usuario_unique` e entra um índice comum por `usuario_id`;
  - `UNIQUE (conta_id) WHERE conta_id IS NOT NULL`;
  - `UNIQUE (slug) WHERE slug IS NOT NULL`.
- **O link fica nulo na migration:** o código gera o link na primeira leitura, porque tirar acento em SQL exigiria `unaccent`.
- **Compatível com o código antigo:** ele lê por `usuario_id` com `LIMIT 1` e encontra a linha migrada.

**`backend/drizzle/0066_despesa_receita_origem.sql`** — vai para a produção **antes** do deploy.
- `despesas.receita_origem_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL`, mesmo padrão de `socios.receita_capital_id`.
- Índice parcial `WHERE receita_origem_id IS NOT NULL`.

**`backend/drizzle/0067_vincular_comissoes_antigas.sql`** — vai para a produção **depois** do deploy. Só tem dados e é idempotente.
- Liga cada despesa `descricao LIKE 'Comissão - %'` sem vínculo à receita com `valor_comissao`.
- A correspondência é pelo mesmo `usuario_id`, `conta_id IS NOT DISTINCT FROM`, `valor_original = valor_comissao` e `data_vencimento = data_recebimento`.
- Os pares são formados um a um com `ROW_NUMBER()` por chave. Assim, duas comissões iguais no mesmo dia não caem na mesma receita.
- O que não bater fica sem vínculo.

**Schema do Drizzle**
- **`catalogo/db/schema.ts`:**
  - as colunas e índices novos;
  - os campos novos seguem o padrão em português do módulo: `descontoTipo`, `descontoValor`, `categoria`, `controlaEstoque`, `contaId`, `slug`, `nome`, `descricao`, `whatsapp`, `logo`;
  - comentário: `catalogo.contas` é a vitrine.
- **`db/schema/expenses.ts`:** `sourceIncomeId` → `receita_origem_id`, com referência a `incomes`. Não há import circular, porque `incomes.ts` não importa `expenses.ts`.

**RLS:** o projeto não usa RLS. O isolamento é por dono e conta, no código.

### Infra/Deploy

- **Variáveis de ambiente:** nenhuma.
- **Disco do Render:** já configurado (ver "Decisões aplicadas"). Por causa dele, cada deploy fica alguns segundos fora do ar.
- **Site:** depois do deploy, conferir que `https://fin-gerence.com.br/loja/<link>` abre o app, como `/catalogo/<código>`. Se o servidor do site tiver uma regra de reescrita específica, acrescentar `/loja/*` → `/index.html`.
- **Ordem na produção:**
  1. 0064, 0065 e 0066 antes do merge, com confirmação e fora do modo automático;
  2. merge, que dispara o deploy;
  3. conferir o deploy, por exemplo pela nova rota pública respondendo;
  4. aplicar a 0067.

## Arquivos provavelmente afetados

**Backend**
- `backend/drizzle/0064_produtos_desconto_categoria_controle.sql` (novo)
- `backend/drizzle/0065_vitrine_por_conta.sql` (novo)
- `backend/drizzle/0066_despesa_receita_origem.sql` (novo)
- `backend/drizzle/0067_vincular_comissoes_antigas.sql` (novo)
- `backend/src/modules/catalogo/db/schema.ts`
- `backend/src/modules/catalogo/routes/index.ts`
- `backend/src/modules/catalogo/routes/produtos.ts`
- `backend/src/modules/catalogo/routes/public.ts`
- `backend/src/modules/catalogo/routes/contas.ts` (sai) → `backend/src/modules/catalogo/routes/storefront.ts` (novo)
- `backend/src/services/estoque.ts` (sai) → `backend/src/services/stock.ts` (novo)
- `backend/src/services/catalogo.ts` e `catalogo.test.ts` (helpers movidos para `productPricing`/`productInput`/`storefrontInput`, se fizer sentido)
- `backend/src/services/productPricing.ts` + teste (novo)
- `backend/src/services/productInput.ts` + teste (novo)
- `backend/src/services/storefrontInput.ts` + teste (novo)
- `backend/src/services/storefront.ts` (novo)
- `backend/src/services/incomeService.ts`
- `backend/src/services/commissionService.ts`
- `backend/src/services/painelService.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/years.ts`
- `backend/src/routes/accountNameCatalog.ts` (só passa a importar `resolveCompanyAccount`)
- `backend/src/utils/accountAccess.ts`
- `backend/src/db/schema/expenses.ts`

**Frontend**
- `src/screens/config/CatalogoTab.tsx`
- `src/screens/config/StorefrontDialog.tsx` (novo)
- `src/components/AvatarUploadDialog.tsx` (props opcionais de título/descrição)
- `src/screens/public/CatalogoPublicoPage.tsx` (sai)
- `src/screens/public/storefront/` (novo: página e componentes)
- `src/App.tsx`
- `src/services/catalogoService.ts`
- `src/services/storefrontService.ts` (novo)
- `src/services/queryKeys.ts`
- `src/services/financeService.ts`
- `src/types/finance.ts`
- `src/utils/productPricing.ts` + teste (novo)
- `src/utils/storefrontCart.ts` + teste (novo)
- `src/screens/finance/income-dialog/IncomeDialog.tsx`
- `src/screens/finance/income-dialog/draftRules.ts` + `draftRules.test.ts`
- `src/screens/finance/income-dialog/IncomeDetailsPopover.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/screens/finance/LancamentosTable.tsx`
- `src/hooks/useFinanceDashboard.ts`

## Estratégia de implementação

1. **Branch.** Criar `feat/R/vitrine-estoque` a partir da `main` atualizada. A branch `feat/R/setores-cargos-padrao` já está toda na `main`.
2. **Migrations e schema.**
   - Escrever a 0064, a 0065, a 0066 e a 0067 e ajustar o schema do Drizzle.
   - Mostrar o SQL e aplicar no banco local (`--banco local`) **com confirmação**, conferindo com `migrations:status`.
3. **Remoção do antigo,** em um passo separado, antes do código novo:
   - apagar `CatalogoPublicoPage.tsx` e a rota que a usa;
   - apagar `routes/contas.ts` e `fetchCatalogoConta`;
   - apagar a rota pública `/:contaId/produtos` e `fetchProdutosPublicos`;
   - apagar `DELETE /api/catalogo/produtos/:id` e `deleteProduto`;
   - apagar `estoque.ts`, que será substituído.
   - Nada fica comentado nem escondido.
4. **Estoque.** Criar o `stock.ts`, com `recordStockMovement`, `sellProductInIncome`, `returnSoldStock` e `StockError`, e trocar todos os usos.
5. **Comissão e receitas.**
   - `createCommissionExpense` passa a gravar `receita_origem_id`, e entra a `cancelLinkedCommission`;
   - `cancelIncome` e `deleteIncome` vão para o `incomeService`;
   - as rotas de cancelar e excluir passam a usar o serviço;
   - excluir o ano passa a devolver o estoque.
6. **Produtos.**
   - mover `resolveCompanyAccount` para `utils/accountAccess.ts`;
   - criar `loadAccessibleProduct`, `productPricing` e `productInput`;
   - ajustar as rotas de produto: conta, desconto, categoria, controle, quantidade inicial e acesso pela conta;
   - ajustar o painel (estoque baixo só com controle).
7. **Vitrine (servidor).** Criar `storefrontInput`, `storefront.ts` (serviço) e `routes/storefront.ts`, reescrever `routes/public.ts` e acertar a montagem.
8. **Frontend (base).** Ajustar `catalogoService`, `storefrontService` e `queryKeys`, e criar `productPricing.ts` e `storefrontCart.ts`, ambos com testes.
9. **Tela "Produtos e estoque".** Cadastro, lista, banner e `StorefrontDialog`, com as props novas do `AvatarUploadDialog`.
10. **Receita e assistente.** Ajustar `IncomeDialog`, `draftRules` (com teste), `IncomeDetailsPopover`, `FinancialAssistant`, `LancamentosTable`, `useFinanceDashboard`, `finance.ts` e `financeService`.
11. **Vitrine pública nova.** Criar a pasta `storefront/` e ajustar as rotas e os componentes envolventes no `App.tsx`.
12. **Validação.**
    - `tsc` do frontend e do backend, testes, build e `limpar` mental: sem código morto, sem duplicação, sem `any`.
    - Rodar o roteiro de API no banco local e a conferência no navegador (seção "Testes necessários").
    - Apagar os dados de teste.
13. **Registro.** Anotar no plano os resultados da validação e qualquer desvio, para o `/finalizar`.

## Regras de negócio identificadas

**Estoque**
- A saída nunca deixa o saldo negativo. Quando duas vendas disputam a última unidade, uma passa e a outra recebe "Saldo insuficiente".
- **Sem controle de estoque:** a venda não mexe no estoque nem é barrada, e a vitrine nunca mostra "Esgotado". Entrada e saída manual ficam indisponíveis.
- **Com controle:** a venda baixa o estoque e é barrada sem saldo.
- **Desfazer a venda:** cancelar a receita, excluir a receita e excluir o ano devolvem ao estoque exatamente a quantidade da saída registrada.
  - O estorno vira uma entrada no histórico ("Estorno — receita cancelada", "Estorno — receita excluída" ou "Estorno — ano excluído"), ligada à receita, uma vez só.
  - Receita cancelada e depois excluída não devolve de novo.
  - Venda feita sem controle não tem saída, então não há estorno.
- **Desligar o controle:** o saldo fica guardado e escondido. Religar volta a mostrar o mesmo saldo.
- **Quantidade inicial:** só existe ao ligar o controle num produto sem movimentação, e vira a entrada "Estoque inicial".
- **Venda pela receita:** o produto precisa ser da conta da receita, do dono dela e estar ativo.

**Comissão**
- A despesa de comissão guarda a receita que a gerou: a original ou cada réplica mensal.
- Cancelar ou excluir a receita cancela só a comissão ligada, e só se ainda não foi paga (`pago IS NOT TRUE`).

**Desconto**
- Pode ser em R$ ou em %, ou não existir.
  - Percentual: maior que 0 e menor que 100, com até 2 casas.
  - Em R$: maior que 0 e menor que o preço.
  - O preço final é de pelo menos R$ 0,01.
- Preço final: `valor − desconto` ou `valor × (1 − %/100)`, arredondado em centavos.
- O selo "-X%" usa o percentual. No desconto em R$, ele é calculado e arredondado.
- O valor da receita continua livre: o preço final só pré-preenche o campo.

**Categoria**
- Texto opcional de até 60 caracteres, sem espaços nas pontas; vazio vira nulo.
- Na vitrine, o agrupamento ignora maiúsculas e acentos.

**Produtos e vitrine por conta**
- Os produtos e a vitrine pertencem a uma conta PJ.
- O produto não muda de conta na edição.
- Cada PJ tem no máximo uma vitrine.

**Link da vitrine**
- Tem de 3 a 60 caracteres, só `a-z`, `0-9` e hífen, sem hífen nas pontas e sem hífen duplo.
- É único entre todas as vitrines.
- Trocar o link derruba o amigável anterior. O código (UUID) sempre continua funcionando.

**Nome, logo e WhatsApp da vitrine**
- **Nome exibido:** o nome da vitrine; se não houver, o nome fantasia; se não houver, o nome da conta.
- **Logo exibido:** o logo da vitrine; se não houver e a conta for a PJ padrão do dono, a foto do login; se não houver, nenhum.
- **WhatsApp:** guardado só com dígitos, com o DDI 55, em 12 ou 13 dígitos. Sem WhatsApp, a vitrine não tem sacola nem botões de compra.

**Exibição na vitrine**
- Mostra só os produtos ativos da conta.
- O esgotado aparece com selo e sem botão de compra.
- A quantidade em estoque nunca aparece.

**Sacola**
- Cada item vai de 1 a 99 unidades inteiras.
- O nome do cliente é obrigatório (até 80 caracteres) e a observação é opcional (até 300).
- A mensagem leva os itens (quantidade, nome e subtotal pelo preço final), o total, o nome e a observação.
- O preço atual é conferido ao abrir; a confirmação final é do vendedor, na conversa.

**Permissões**
- A tela, os produtos e a configuração da vitrine seguem a permissão "Produtos e estoque" (`accessProductCatalog`).
- A lista de produtos continua liberada para quem lança receita com produto (`requireCatalogAccess('products')`).

## Regras multi-tenant e segurança

- **Conta:** o `conta_id` vem do navegador e é tratado como entrada do usuário. Toda rota de produto e de vitrine confere o acesso pela conta (`canWriteToAccount`, que aceita o dono ou um vínculo ativo) e se ela é PJ, com a mesma resposta para conta inexistente e conta alheia.
- **Produto por id:** é sempre carregado com `loadAccessibleProduct`, e só o id não basta. Isso fecha o caso de um colaborador de uma PJ mexer em outra PJ do mesmo dono.
- **Rota pública:**
  - resolve a vitrine pelo UUID ou pelo link validado, e a conta precisa estar ativa;
  - devolve só os campos públicos, sem `usuario_id`, `conta_id` nem quantidade;
  - a imagem precisa pertencer a um produto ativo da conta da vitrine.
- **Receitas:**
  - o cancelamento e a exclusão continuam com `resolveOwnerForWrite`;
  - a venda confere se o produto é da conta da receita;
  - o estorno usa o produto e a quantidade registrados na própria saída, e não dados do cliente.
- **Logo:** só aceita data URL de imagem (jpeg, png ou webp) de até cerca de 300 KB.
- **Erros:** não revelam se um link ou uma conta existe em outra empresa. O 409 diz só "Esse link já está em uso".

## Validações necessárias

**Produto** (`readProductInput`)
- `nome`: obrigatório, até 255 caracteres.
- `valor`: maior que 0, dentro de `MAX_AMOUNT`.
- `descricao`: opcional.
- `desconto_tipo` e `desconto_valor`: os dois juntos ou nenhum, com as faixas da regra de desconto.
- `categoria`: até 60 caracteres.
- `controla_estoque`: booleano.
- `quantidade_inicial`: maior ou igual a 0, até 3 casas, aceita só quando cabe.
- `estoque_minimo`: maior ou igual a 0.
- `ativo`: booleano, opcional no PUT.
- `conta_id`: inteiro, obrigatório no POST e ignorado no PUT.

**Lista de produtos e configuração da vitrine**
- `conta_id` na query é inteiro e obrigatório (`readQueryId`).

**Vitrine** (`readStorefrontInput`)
- `nome`: até 100 caracteres; vazio usa o nome padrão.
- `descricao`: até 280 caracteres.
- `whatsapp`: normalizado e validado; vazio vira nulo.
- `link`: no formato do link.
- `logo`: data URL válida ou nulo.

**Parâmetro público** (`parseStorefrontParam`): UUID ou link válido; o resto dá 404.

**Movimentação manual**
- `tipo`: `entrada` ou `saida`.
- `quantidade`: maior que 0.
- O produto precisa estar com o controle ligado.

**Sacola** (na tela): nome obrigatório, observação limitada e quantidades inteiras de 1 a 99.

## Testes necessários

### Frontend

- **`src/utils/productPricing.test.ts`:**
  - preço final em R$ e em %;
  - arredondamento;
  - selo "-X%" no desconto em R$;
  - limites inválidos.
- **`src/utils/storefrontCart.test.ts`:**
  - adicionar, mudar a quantidade (limite 99) e remover;
  - totais pelo preço final;
  - conferir a sacola salva contra os produtos atuais (removido, inativo, esgotado, preço mudou);
  - formato da mensagem;
  - URL `wa.me` com o texto codificado.
- **`src/screens/finance/income-dialog/draftRules.test.ts`:**
  - o total usa o preço com desconto;
  - sem controle, nunca há estoque insuficiente nem selo;
  - com controle, o comportamento continua o de hoje.

### Backend

- **`backend/src/services/productPricing.test.ts`:** mesmas regras do front.
- **`backend/src/services/productInput.test.ts`:**
  - campos obrigatórios;
  - desconto incompleto ou fora da faixa;
  - categoria (sem espaços nas pontas, vazio, limite);
  - quantidade inicial;
  - `conta_id` no POST.
- **`backend/src/services/storefrontInput.test.ts`:**
  - `slugify` (acentos, símbolos, vazio → `loja`, limite de 60);
  - formato do link;
  - WhatsApp (com e sem 55, com máscara, inválidos);
  - parâmetro público (UUID, link, inválido);
  - data URL do logo.

### E2E

**Roteiro de API no banco local**, com usuários de teste apagados no fim:

*Estoque e receitas*
1. Produto com controle e quantidade inicial 10 → saldo 10 e entrada "Estoque inicial".
2. Receita vendendo 3 → saldo 7 e saída ligada à receita.
3. Cancelar a receita → saldo 10 e entrada de estorno ligada. Cancelar de novo → nada muda.
4. Excluir a receita já cancelada → saldo continua 10, sem segundo estorno.
5. Nova venda de 2 e exclusão direta → o saldo volta.
6. Excluir o ano com duas vendas ativas e uma cancelada → só as duas ativas voltam.
7. Duas vendas simultâneas da última unidade → uma `201` e outra `400` "Saldo insuficiente".
8. Produto sem controle, saldo 0, venda de 5 → `201`, sem movimentação e saldo inalterado.
9. Entrada manual em produto sem controle → `400`.
10. Ligar o controle num produto antigo sem movimentação, com quantidade inicial 4 → saldo 4.
11. Venda de produto de outra PJ do mesmo dono → recusada.
12. Venda de produto inativo → recusada.

*Comissão*
13. Duas receitas com representante no mesmo mês, cancelar uma → só a comissão dela é cancelada.
14. Comissão já paga, cancelar a receita → a comissão paga continua ativa.
15. Excluir uma receita com comissão não paga → a comissão é cancelada.
16. "Repetir até" com comissão mensal → cada réplica tem a sua comissão ligada.
17. 0067 → as comissões antigas correspondentes são ligadas, e as sem correspondência continuam sem vínculo.

*Produtos por conta e desconto*
18. Dono com duas PJs → a lista de cada conta mostra só os próprios produtos.
19. Colaborador da PJ A → lista e edita os produtos da A; produto da B → `404`, inclusive imagens e movimentações.
20. Criar produto em conta PF → `400`.
21. Desconto:
    - 20% sobre R$ 100 → `valorFinal` 80;
    - R$ 30 sobre R$ 100 → 70;
    - 100% → `400`;
    - R$ maior ou igual ao preço → `400`;
    - tipo sem valor → `400`.
22. Categoria → sem espaços nas pontas; vazio vira nulo; acima de 60 caracteres → `400`.

*Vitrine*
23. `GET /storefront` → cria a vitrine com o link gerado do nome fantasia, sem acento. Uma segunda PJ com o mesmo nome ganha sufixo.
24. `PUT` com o link de outra vitrine → `409`. Link, WhatsApp ou logo inválidos → `400`.
25. Rota pública pelo link e pelo código antigo → mesma loja, só produtos ativos da conta, sem quantidade e `esgotado` só com controle e saldo 0.
26. Rota pública com link inexistente ou conta desativada → `404`.
27. Imagem pública de produto de outra conta pela vitrine → `404`. Imagem válida → `200` com `Cache-Control` longo.
28. Vitrine migrada → mantém o mesmo código (UUID).

*Painel*
29. Estoque baixo → lista só os produtos com controle.

**Conferência no navegador**, no celular (cerca de 400 px) e no computador:
- **Produtos e estoque:**
  - a lista é da conta ativa;
  - o cadastro tem desconto (com prévia), categoria (com sugestões), controle e quantidade inicial;
  - os selos aparecem certos;
  - o "Configurar vitrine" salva logo, nome, descrição, WhatsApp e link;
  - "Copiar link" e "Abrir" funcionam.
- **Receita com produto e assistente:**
  - o preço vem com desconto;
  - sem controle, não aparece estoque.
- **Cancelar e excluir receita:** a confirmação traz o aviso, e a lista de produtos e as despesas se atualizam.
- **Vitrine:**
  - aparecem topo, busca, categorias, selos de desconto e "Esgotado";
  - o detalhe tem galeria e compartilhar, e `?produto=` abre o detalhe;
  - a sacola soma, muda a quantidade e remove itens, e recarregar a página mantém a sacola;
  - "Enviar pedido" abre `wa.me` com a mensagem certa.
- **Vitrine sem WhatsApp:** fica sem sacola.
- **Vitrine em geral:** sem o banner de cookies e sem o "instalar app".
- **Link antigo:** `/catalogo/<código>` abre a mesma vitrine.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit                      # frontend (raiz)
npm test                              # frontend
npm run build                         # frontend: vite build + HTML das rotas públicas

npm --prefix backend run build        # tsc --noEmit do backend
npm --prefix backend test

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0064 --banco local   # só com confirmação, uma por vez (0064 → 0067)
```

## Riscos e pontos de atenção

- **Mudança de comportamento:**
  - Os produtos que nunca tiveram movimentação ficam sem controle de estoque. A venda pela receita deixa de ser recusada por falta de saldo, e a vitrine não os mostra como esgotados.
  - Excluir o ano passa a devolver ao estoque as vendas do ano.
- **Venda existente:** unificar a função de estoque mexe no fluxo de venda que já funciona. Os itens 1 a 12 do roteiro cobrem isso.
- **Links:**
  - O código (UUID) sempre funciona. Trocar o link amigável derruba o amigável anterior, porque não há histórico.
  - O site pode estar em cache (PWA). Até recarregar, uma vitrine aberta com o código antigo do site pode chamar a rota pública removida e mostrar "Loja não encontrada".
- **Endereço `/loja/...`:** depende do servidor do site abrir o app nesse endereço. É conferido depois do deploy.
- **Produtos antigos sem conta:**
  - quem tiver mais de uma PJ fica com a padrão;
  - dono sem PJ fica com o produto sem conta e fora das listas, como já acontece no painel PJ.
- **Comissões antigas:** as que não baterem com nenhuma receita na 0067 ficam sem vínculo e não são canceladas automaticamente.
- **Tamanho da resposta pública:** o logo vai embutido (data URL de 256 px, normalmente abaixo de 50 KB; o limite é cerca de 300 KB).
- **Deploy:** com o disco, o sistema fica alguns segundos fora do ar a cada deploy.
- **Produção:** migrations e leituras na produção são bloqueadas no modo automático. O usuário sai do modo automático e aprova cada comando.
- **Nomes em português:** os campos de pedido e resposta, e os do Drizzle no módulo do catálogo, seguem o padrão em português que já existe, como nos planos anteriores. Funções, arquivos e componentes novos ficam em inglês.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação estará pronta quando:

- Cancelar a receita, excluir a receita ou excluir o ano devolver exatamente a quantidade vendida, uma vez só, com o registro no histórico.
- Duas vendas simultâneas da última unidade resultarem em uma venda e uma recusa.
- Um produto sem controle de estoque vender sem mexer no estoque e nunca aparecer esgotado. Ao ligar o controle, a quantidade inicial deve virar a entrada "Estoque inicial".
- Cancelar ou excluir a receita cancelar só a comissão ligada, e só se ainda não foi paga.
- Cada PJ ver só os próprios produtos e ter a própria vitrine, e o colaborador de uma PJ não acessar os produtos de outra.
- O desconto aparecer na lista, na vitrine (preço riscado e "-X%") e no pré-preenchimento da venda, na receita e no assistente.
- A vitrine abrir pelo link novo e pelo código antigo e mostrar só produtos ativos. "Esgotado" deve aparecer só com controle e saldo 0, e a quantidade nunca deve aparecer.
- A vitrine ter topo, busca, categorias, detalhe com galeria, compartilhar e sacola. A sacola deve enviar ao WhatsApp da empresa os itens, o total, o nome e a observação.
- A configuração da vitrine salvar logo, nome, descrição, WhatsApp e link, com 409 para link repetido.
- O código antigo removido não deixar referências, comentários nem trechos escondidos.
- O `tsc` do frontend e do backend, os testes e o build passarem, e o roteiro de API e a conferência no navegador estarem registrados no plano.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Criar a branch `feat/R/vitrine-estoque` a partir da `main`.
- Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
  - Aplicar primeiro no banco local, uma por vez, com confirmação.
  - Na produção: 0064 a 0066 antes do merge e 0067 depois do deploy, fora do modo automático.
- Não alterar `.env`.
- Fazer a remoção do código antigo (passo 3) **antes** do código novo e como passo próprio, sem deixar nada comentado nem escondido.
- Seguir as regras transversais do `/AGENT.md`:
  - Drizzle em query nova; dentro das transações de receita, usar `drizzle(client, { schema })`;
  - nada de `any`;
  - erros em português, claros e sem vazar dados;
  - nomes novos de código em inglês.
- Manter os textos da tela em português e o visual da tela de configuração (tokens `C`, `CFG`, `ConfigListRow`, `InfoBanner`, `Dialog`).
- Na vitrine pública, usar Tailwind, como as páginas públicas, sem nenhuma biblioteca nova.
- Rodar o roteiro de API e a conferência no navegador, apagar os dados de teste e registrar os resultados e os desvios neste plano antes do `/finalizar`.

## Notas da implementação (2026-10-03)

- **Branch:** `feat/R/vitrine-estoque`, criada a partir da `main` `ff6d33b7`.
- **Checagens:** o `tsc` do front e do back passa. Os testes passam: 98/98 no front e 260/260 no back. O `vite build` e o build do back terminam sem erro.
- **Desvios do plano:**
  - **Índice extra:** a 0064 ganhou o índice `idx_catalogo_movimentacoes_receita` (por `receita_id`), usado pelo estorno para achar as movimentações da receita.
  - **WhatsApp:** número com "+" e código de outro país é recusado. "+1 415 555 0100" tem 11 dígitos e passaria como celular de DDD 14.
  - **Utilitários compartilhados:** `resolveCompanyAccount` (com a mensagem de conta pessoal por parâmetro), `isUniqueViolation` (`utils/dbErrors.ts`) e `readRequiredId` (`utils/requestInput.ts`). Setores e cargos passaram a usá-los.
  - **Funções renomeadas ou removidas:** `isValidCatalogoContaId` virou `isUuid`. Saiu `isValidProdutoValor`, porque o cadastro passou a usar `readAmount`.
  - **Erro de estoque:** `StockError` estende `RequestInputError`. A resposta de estoque insuficiente vem sem o campo `code`, que nenhuma tela lia.
  - **Regras puras da tela:** além de `productPricing` e `storefrontCart`, entraram `storefrontConfig` (link e WhatsApp enquanto a pessoa digita) e `storefrontCatalog` (busca e categorias), com testes. O compartilhar da vitrine fica em `src/screens/public/storefront/shareLink.ts`.
- **Validação local (2026-10-03, após o "faça a sequência segura e correta" do usuário):**
  - **Migrations:** 0064 a 0067 aplicadas no banco local, uma por vez. O `migrations:status --banco local` ficou sem pendentes.
  - **Roteiro de API** (`roteiro_vitrine.mjs`, backend local na porta 3015 com o `.env.dev`): 29/29. A primeira rodada deu 26/29 e achou um bug, corrigido no commit seguinte.
    - A consulta pública juntava `catalogo.contas` com `contas`, e o Postgres acusava "referência a tabela contas é ambígua".
    - A vitrine passou a usar o apelido `vitrine` na consulta (`alias` do Drizzle, em `services/storefront.ts`).
  - **Teste de renderização no servidor** (temporário, em `src/tmpclaude-*`, apagado depois): 12/12. Ele cobriu a vitrine (com e sem WhatsApp), o detalhe por `?produto=`, a sacola, a tela "Produtos e estoque" e "Configurar vitrine".
  - **Limpeza:** os usuários `@roteiro-vitrine.test` e as imagens enviadas no teste foram apagados.
  - **Porta 3014:** já estava ocupada por um processo `node` de antes desta sessão, que não foi mexido.
- **Ainda não feito:** a conferência no navegador (layout da tela e da vitrine no celular e no computador).
