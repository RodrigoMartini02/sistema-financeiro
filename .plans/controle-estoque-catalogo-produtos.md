# Plano de Implementação: Controle de Estoque no Catálogo de Produtos

## Origem

- Arquivo de especificação: conversa — avaliação de mercado sobre controle de estoque (2026-09-13)
- Data do planejamento: `2026-09-13`
- Classificação: `frontend + backend + database`

## Resumo

Adiciona controle de estoque ao módulo de Catálogo de Produtos que já existe no backend/schema (`catalogo.produtos`, `catalogo.produto_imagens`), mas que hoje está **oculto da UI** por decisão anterior do usuário (`.plans/ocultar-catalogo-produtos.md`, feature considerada "inacabada"). A feature de estoque reativa essa aba e adiciona:

- Quantidade em estoque e estoque mínimo por produto.
- Histórico de movimentações (entrada/saída), com registro de quem e quando.
- Vínculo opcional entre uma receita e um produto do catálogo: ao selecionar um produto na receita, o valor é pré-preenchido automaticamente (preço do produto × quantidade), mas continua editável; sem produto selecionado, o campo de valor permanece livre como hoje. A quantidade informada desconta do estoque automaticamente, independente do valor final digitado na receita.
- Alerta de estoque baixo como um card no painel financeiro (`FinanceDashboard.tsx`), sem criar uma central de notificações nova — investigação confirmou que essa infraestrutura não existe hoje no sistema (só existe notificação de plano/assinatura, não relacionada).

## Descobertas da investigação (antes de qualquer decisão de escopo)

- **`catalogo.produtos` hoje só tem `usuario_id`, sem `conta_id`** (`backend/src/modules/catalogo/db/schema.ts:29-45`). Vincular produto a uma conta PJ específica exige coluna nova — não é ajuste trivial, é mudança de schema real.
- **Existem dois conceitos diferentes, ambos chamados "conta", dentro do módulo de catálogo**:
  - `catalogo.contas` (`schema.ts:17-27`): identificador UUID da vitrine pública de um usuário, único por `usuario_id`, usado na rota `/catalogo/:contaId`. **Não tem nenhuma relação com `accounts`/`contas` financeiras (PF/PJ).**
  - `accounts`/`contas` (schema principal, `backend/src/db/schema/accounts.ts`): a conta financeira real (PF ou PJ), já usada por despesas/receitas/cartões.
  - Este plano vincula produtos a `accounts.id` (a conta financeira), não a `catalogo.contas` (que permanece intocada, exclusiva da vitrine pública).
- **Padrão de "seleciona algo → preenche valor automaticamente, mas editável" já existe** e será reaproveitado: em `src/screens/finance/IncomeDialog.tsx`, o fluxo "Horas a faturar" (linhas ~57-59, 135-152, 677-744) já faz exatamente isso com contratos — seleciona um contrato, calcula `valorCalculado` a partir de horas × valor/hora, e usa `form.setValue('valor', valorCalculado)` num `useEffect`, mantendo o campo editável.
- **`receitas.contractId` e `receitas.representativeId`** (`backend/src/db/schema/incomes.ts:34,38`) são colunas `integer` **sem `.references()` no Drizzle** — uma FK fraca, validada em código, não no schema. Este plano segue o mesmo padrão para `produtoId`/`quantidadeVendida` em receitas, por consistência.
- **Não existe uma central de notificações genérica no sistema.** A única infraestrutura de notificação encontrada é específica de plano/assinatura (`backend/src/db/schema/plan-notification-events.ts`, `backend/src/services/plan-lifecycle.ts`), não reaproveitável para alertas de estoque. O bloco "vencidas e a vencer" que já existe no painel (`backend/src/routes/financial.ts:147,267-268,364`, exposto como `emAberto` na resposta do dashboard) é o padrão real de "alerta" hoje — o card de estoque baixo seguirá esse mesmo modelo (calculado junto com o payload do dashboard, exibido como bloco condicional na tela), não uma notificação separada.

## Escopo

### Dentro do escopo

- **Reativar a exposição do Catálogo de Produtos na UI**: reverter o que `.plans/ocultar-catalogo-produtos.md` implementou — reintroduzir a entrada `catalogo` em `ITEMS` (`src/layout/ConfigPanel.tsx`), a renderização condicional de `CatalogoTab`, e a rota pública `/catalogo/:contaId` em `App.tsx`.
- **Schema — `catalogo.produtos`**: novas colunas `conta_id` (integer, referência a `accounts.id`), `quantidade_estoque` (numeric, default 0), `estoque_minimo` (numeric, nullable).
- **Schema — nova tabela `catalogo.movimentacoes_estoque`**: `id`, `produto_id` (FK para `catalogo.produtos.id`), `tipo` (`entrada` | `saida`), `quantidade`, `motivo` (texto opcional), `usuario_id` (quem registrou), `receita_id` (nullable, quando a saída vem de uma venda), `created_at`.
- **Schema — `receitas`**: novas colunas `produto_id` (integer, FK fraca sem `.references()`, seguindo o padrão de `contract_id`) e `quantidade_vendida` (numeric, nullable).
- **Backend — endpoints novos**:
  - `POST /api/catalogo/produtos/:id/estoque/entrada` — registra entrada, incrementa `quantidade_estoque`.
  - `POST /api/catalogo/produtos/:id/estoque/saida` — registra saída manual, decrementa `quantidade_estoque` (com checagem de saldo insuficiente).
  - `GET /api/catalogo/produtos/:id/estoque/movimentacoes` — histórico paginado.
- **Backend — ajuste em `POST/PUT /api/receitas`**: quando `produto_id` e `quantidade_vendida` vierem no body, validar que o produto existe e pertence à conta do usuário, descontar o estoque numa transação junto com a criação/atualização da receita (rollback se qualquer etapa falhar), e registrar a movimentação de saída vinculada à receita.
- **Backend — dashboard**: adicionar ao payload de `financial.ts` (ou endpoint equivalente do dashboard) uma lista de produtos com `quantidade_estoque <= estoque_minimo`, para o card de alerta.
- **Frontend — `CatalogoTab.tsx`**: campos de quantidade em estoque e estoque mínimo no formulário de produto; ação "Registrar entrada/saída" por produto, abrindo um formulário simples (quantidade + motivo opcional).
- **Frontend — `IncomeDialog.tsx`**: seletor opcional de "Produto do estoque" (lista de produtos ativos da conta selecionada no lançamento — reaproveitando o `contaId` já adicionado pela feature anterior), campo de quantidade vendida, e o mesmo mecanismo de pré-preenchimento automático do valor já usado para "Horas a faturar".
- **Frontend — `FinanceDashboard.tsx`**: card de alerta "Estoque baixo", no mesmo estilo visual do bloco "vencidas e a vencer" já existente, listando os produtos abaixo do mínimo.

### Fora do escopo

- Central de notificações genérica — decisão já tomada de não criar essa infraestrutura agora.
- Mudanças na vitrine pública (`catalogo.contas`, rota `/catalogo/:contaId`, `CatalogoPublicoPage.tsx`) além da reativação já prevista — o conceito de vitrine pública não é tocado por este plano.
- Suporte a múltiplos depósitos/localizações de estoque — um saldo único por produto.
- Relatórios de estoque (giro, curva ABC, previsão de reposição, etc.) — fica para uma iteração futura.
- Vínculo de produto/estoque em despesas (ex: compra de insumo para repor estoque) — este plano cobre apenas a saída via venda (receita).
- Qualquer navegação especial "para celular" — a tela de registro de entrada/saída vive dentro de Configurações, junto do Catálogo, com a mesma responsividade padrão esperada de qualquer tela do sistema, sem tratamento diferenciado por dispositivo.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — mesma ressalva de todos os planos anteriores desta sessão: documentos genéricos multi-prefeitura/RLS que não correspondem à arquitetura real deste projeto. Princípios de código aplicados: Drizzle para queries novas, sem `any`, validar no backend, evitar N+1, transação para operações que precisam ser atômicas (estoque + receita).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados dentro de `sistema financas/`.
- `.plans/ocultar-catalogo-produtos.md` — lido integralmente. Confirma que a ocultação foi implementada (verificado diretamente no código: `ConfigPanel.tsx` não tem mais o item `catalogo` em `ITEMS`, `App.tsx` não tem mais a rota `/catalogo/:contaId`), e que os arquivos de código da feature (`CatalogoTab.tsx`, `CatalogoPublicoPage.tsx`, `catalogoService.ts`, `ProdutoImagensManager.tsx`) foram mantidos intactos para retomada futura — que é exatamente o que este plano faz.
- Arquivos de código lidos diretamente: `backend/src/modules/catalogo/db/schema.ts`, `backend/src/modules/catalogo/routes/produtos.ts`, `backend/src/modules/catalogo/routes/contas.ts`, `backend/src/modules/catalogo/routes/public.ts`, `backend/src/db/schema/incomes.ts`, `backend/src/routes/financial.ts` (trechos de `emAberto`), `src/screens/finance/IncomeDialog.tsx` (padrão de contrato/horas a faturar).
- Não foi encontrado `frontend/src/screens/config/CatalogoTab.tsx` em detalhe nesta investigação — será lido integralmente na etapa de implementação antes de qualquer edição.

## Impacto por área

### Frontend

- **`src/layout/ConfigPanel.tsx`**: reintroduzir a entrada `catalogo` em `ITEMS` e sua renderização condicional (reverter a remoção feita por `ocultar-catalogo-produtos.md`).
- **`src/App.tsx`**: reintroduzir a rota `/catalogo/:contaId` → `CatalogoPublicoPage`.
- **`src/screens/config/CatalogoTab.tsx`**: adicionar campos de estoque no formulário de produto (quantidade atual — somente leitura, calculada pelo histórico; estoque mínimo — editável); nova ação por produto "Registrar entrada" / "Registrar saída" abrindo um mini-formulário (quantidade, motivo opcional).
- **`src/screens/finance/IncomeDialog.tsx`**: novo seletor "Produto do estoque" (opcional), campo de quantidade vendida, `useEffect` que pré-preenche `valor` a partir de `produtoSelecionado.valor * quantidade` (reaproveitando o padrão já usado por `contratoSelecionado`), mantendo o campo sempre editável pelo usuário.
- **`src/screens/finance/FinanceDashboard.tsx`**: novo card de alerta "Estoque baixo", condicional (só aparece se houver produtos abaixo do mínimo), no mesmo padrão visual dos alertas de "vencidas e a vencer" já existentes.
- **Novos services**: funções para os três endpoints novos de estoque (entrada, saída, histórico), seguindo o padrão de `catalogoService.ts` existente.
- **Query keys**: novas entradas em `queryKeys.ts` para estoque/movimentações do produto.
- Estados de loading/error/empty: seguir o padrão já usado no restante de `CatalogoTab.tsx`/`FinanceDashboard.tsx`.

### Backend

- **`backend/src/modules/catalogo/db/schema.ts`**: adicionar `contaId`, `quantidadeEstoque`, `estoqueMinimo` em `catalogoProdutos`; criar tabela `catalogoMovimentacoesEstoque`.
- **`backend/src/db/schema/incomes.ts`**: adicionar `produtoId` (integer, sem `.references()`, padrão de `contractId`) e `quantidadeVendida` (numeric, nullable).
- **`backend/src/modules/catalogo/routes/produtos.ts`**: três rotas novas de estoque (entrada, saída, histórico), todas com `authenticate` + `requireScreenAccess('accessProductCatalog')`, filtrando sempre por `usuario_id`/`conta_id` do solicitante.
- **`backend/src/routes/incomes.ts` (ou equivalente)**: ao criar/atualizar receita com `produto_id` presente, validar posse do produto, descontar estoque em transação, criar registro em `catalogo.movimentacoes_estoque` vinculado à receita.
- **`backend/src/routes/financial.ts`**: adicionar ao payload do dashboard a lista de produtos com estoque abaixo do mínimo, filtrada pela conta do usuário.
- Validação de saldo insuficiente na saída manual (não permitir estoque negativo, a menos que o usuário confirme — a definir na implementação se deve bloquear ou apenas avisar).

### Banco de dados

- **Migration nova 1**: `ALTER TABLE catalogo.produtos ADD COLUMN conta_id INTEGER REFERENCES contas(id), ADD COLUMN quantidade_estoque NUMERIC(12,3) NOT NULL DEFAULT 0, ADD COLUMN estoque_minimo NUMERIC(12,3)`.
- **Migration nova 2**: `CREATE TABLE catalogo.movimentacoes_estoque (...)`.
- **Migration nova 3**: `ALTER TABLE receitas ADD COLUMN produto_id INTEGER, ADD COLUMN quantidade_vendida NUMERIC(12,3)`.
- Todas aditivas, sem alterar dados existentes. Produtos já cadastrados (se houver, dado que a feature estava oculta) nascem com `quantidade_estoque = 0` e `conta_id = null` até serem editados.
- **Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

Sem impacto esperado. Nenhuma variável de ambiente nova.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/modules/catalogo/db/schema.ts`
- `sistema financas/backend/src/modules/catalogo/routes/produtos.ts`
- `sistema financas/backend/src/db/schema/incomes.ts`
- `sistema financas/backend/src/routes/incomes.ts` (ou nome real da rota de receitas)
- `sistema financas/backend/src/routes/financial.ts`
- `sistema financas/backend/drizzle/00XX_*.sql` (três migrations novas)
- `sistema financas/src/layout/ConfigPanel.tsx`
- `sistema financas/src/App.tsx`
- `sistema financas/src/screens/config/CatalogoTab.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`
- `sistema financas/src/services/catalogoService.ts` (ou equivalente)
- `sistema financas/src/services/queryKeys.ts`

## Estratégia de implementação

1. **Reativar Catálogo de Produtos**: reverter `ConfigPanel.tsx` e `App.tsx` para reexpor a feature.
2. **Schema**: adicionar colunas em `catalogo.produtos` e `receitas`; criar `catalogo.movimentacoes_estoque`. Gerar as três migrations (sem executar).
3. **Backend — estoque**: implementar os três endpoints de entrada/saída/histórico, com transação e validação de posse por `conta_id`.
4. **Backend — receita vinculada a produto**: ajustar a rota de criação/atualização de receita para descontar estoque quando aplicável, em transação.
5. **Backend — alerta no dashboard**: adicionar a lista de produtos abaixo do mínimo ao payload existente.
6. **Frontend — CatalogoTab**: campos de estoque no formulário, ação de registrar entrada/saída.
7. **Frontend — IncomeDialog**: seletor de produto, quantidade, pré-preenchimento automático do valor (editável).
8. **Frontend — FinanceDashboard**: card de alerta de estoque baixo.
9. **Validação**: rodar `tsc --noEmit` e `vite build` (frontend), `tsc --noEmit` (backend).

## Regras de negócio identificadas

- Produto pertence a uma conta PJ específica (`accounts.id`), não mais apenas ao usuário.
- Estoque nasce zerado; só muda por movimentações registradas (entrada/saída), nunca editado diretamente.
- Vincular uma receita a um produto desconta a quantidade vendida do estoque, independentemente do valor final da receita.
- O valor da receita é pré-preenchido a partir do produto (preço × quantidade) apenas como sugestão — sempre editável.
- Sem produto selecionado na receita, o comportamento é idêntico ao atual (campo de valor livre).
- Alerta de estoque baixo aparece apenas no painel financeiro, sem notificação separada.

## Regras multi-tenant e segurança

(Vocabulário real do projeto: "tenant" = conta/usuário dono, não prefeitura)

- Toda operação de estoque deve validar que o produto pertence à `conta_id` do solicitante — nunca confiar em `produto_id` vindo do client sem essa checagem, seguindo o padrão já usado em `accountAccess.ts`/`canWriteToAccount`.
- A baixa de estoque ao criar uma receita deve ocorrer na mesma transação da criação da receita — se a receita falhar ao ser salva, o estoque não pode ser descontado (e vice-versa).
- Nenhuma mudança nas regras de `familyVisibility.ts` — este plano não introduz novo compartilhamento entre membros/colaboradores.

## Validações necessárias

- Backend: quantidade de entrada/saída deve ser positiva; saída não pode exceder o saldo atual (ou, se permitida negativa, isso deve ser uma decisão explícita a confirmar na implementação).
- Backend: `produto_id` em receita deve pertencer à mesma `conta_id` selecionada no lançamento.
- Frontend: campo de quantidade vendida obrigatório quando um produto é selecionado.

## Testes necessários

### Frontend

- Selecionar produto na receita pré-preenche o valor corretamente (preço × quantidade) e permanece editável.
- Sem produto selecionado, campo de valor continua livre, sem regressão no comportamento atual.
- Card de estoque baixo aparece apenas quando há produtos abaixo do mínimo.
- Formulário de produto em `CatalogoTab` exibe e salva corretamente quantidade/estoque mínimo.

### Backend

- Registrar entrada incrementa corretamente `quantidade_estoque`.
- Registrar saída manual decrementa corretamente e recusa saldo insuficiente (conforme decisão a confirmar).
- Criar receita com produto vinculado desconta o estoque e cria o registro de movimentação correspondente.
- Falha na criação da receita não deixa o estoque descontado (teste de rollback da transação).
- Produto de uma conta não pode ser vinculado a receita de outra conta do mesmo usuário nem de outro usuário.

### E2E

- Fluxo completo: cadastrar produto com estoque inicial → lançar receita vinculada ao produto → conferir que o estoque foi descontado → cadastrar estoque mínimo alto o suficiente para disparar o alerta → conferir card no painel financeiro.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Migrations múltiplas em ambiente potencialmente de produção**: três migrations novas, todas aditivas, mas exigem confirmação explícita antes de executar, individualmente ou em conjunto.
- **Transação estoque+receita**: é o ponto de maior risco técnico — uma implementação incorreta pode descontar estoque sem criar a receita (ou vice-versa) em caso de erro parcial. Precisa de teste explícito de falha no meio da operação.
- **Reativação do Catálogo de Produtos**: como a feature estava marcada como "inacabada" antes de ser ocultada, vale revisar rapidamente se há outras pendências conhecidas naquela feature além do estoque (a confirmar lendo `CatalogoTab.tsx`/`catalogoService.ts` por completo na implementação).
- **Ambiguidade de nomenclatura "conta"**: como o próprio módulo de catálogo já usa "conta" para a vitrine pública, a implementação precisa ter cuidado redobrado para não confundir `catalogo.contas` com `accounts`/`contas` financeiras ao escrever queries — nomear variáveis de forma explícita (`contaFinanceiraId` vs `catalogoContaId`, por exemplo) ajuda a evitar esse erro.

## Perguntas em aberto

- Saída de estoque maior que o saldo disponível: deve ser **bloqueada** (erro 400) ou **permitida com aviso** (estoque pode ficar negativo, ex: venda registrada antes da entrada correspondente)? A decidir na implementação, com bloqueio como padrão mais seguro caso não haja resposta explícita antes de começar.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Catálogo de Produtos volta a aparecer na navegação de Configurações.
- Produto pode ser vinculado a uma conta PJ e ter quantidade em estoque e estoque mínimo.
- Registrar entrada/saída atualiza corretamente o saldo do produto.
- Selecionar um produto numa receita pré-preenche o valor (editável) e desconta o estoque corretamente na gravação.
- Card de estoque baixo aparece no painel financeiro quando aplicável.
- `tsc --noEmit` e `vite build`/`build` (backend) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Ler `CatalogoTab.tsx` e `catalogoService.ts` por completo antes de editá-los — não foram lidos em detalhe nesta etapa de planejamento.
- Resolver a pergunta em aberto (bloquear vs. permitir saldo negativo) antes de implementar a rota de saída manual — usar bloqueio como padrão seguro se não houver resposta explícita.
- Não executar migrations sem confirmação explícita do usuário.
- Não alterar `.env`.
- Ter cuidado redobrado com a ambiguidade de nomenclatura "conta" (vitrine pública vs. conta financeira) — nomear de forma explícita no código novo.
- Manter as alterações de reativação do Catálogo (`ConfigPanel.tsx`, `App.tsx`) mínimas e cirúrgicas — apenas reverter o que foi ocultado, sem refatorar.
- Não abrir PR sem instrução explícita do usuário — projeto vai direto para `main` via skill `finalizar`.
