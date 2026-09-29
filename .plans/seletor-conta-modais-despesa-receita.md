# Plano de Implementação: Seletor de Conta nos Modais de Despesa e Receita

## Origem

- Arquivo de especificação: conversa — gap identificado após implementar `.plans/multiconta-pj-panorama-geral.md` (2026-09-13)
- Data do planejamento: `2026-09-13`
- Classificação: `frontend-only`

## Resumo

Ao implementar colaboradores em conta PJ e o Panorama Geral (plano anterior), ficou de fora uma parte da ideia original do usuário: o dono de múltiplas contas (1 PF + N PJs) hoje só consegue lançar uma despesa/receita numa conta específica trocando a **conta ativa global** (`localStorage.contaAtivaId`, via `useActiveAccount.select()`) e recarregando a página inteira — não há como escolher a conta destino de dentro do próprio modal de lançamento.

Investigação confirmou que **o backend já suporta tudo que é necessário**: `POST/PUT /despesas` e `/receitas` já aceitam `conta_id` no body e já validam com `canWriteToAccount` (`backend/src/routes/expenses.ts:373,471`); `GET /categorias` e `GET /cartoes` já filtram por `conta_id` via query string. O gap é inteiramente no frontend: `saveExpense`, `saveIncome`, `fetchCategorias` e `fetchCartoes` sempre usam `getActiveAccountId()` (a conta ativa global) internamente, sem receber a conta como parâmetro, e os modais não expõem nenhum controle para escolher outra.

A feature adiciona um seletor de conta no topo de `ExpenseDialog`/`IncomeDialog`, visível apenas para o dono de mais de uma conta (colaborador vinculado a uma única conta PJ não precisa dele — não tem outra conta para escolher, `resolveMemberAccountId` já resolve isso implicitamente). Trocar a conta no seletor recarrega as categorias e cartões filtrados pela conta escolhida, e o lançamento é gravado com essa conta.

## Escopo

### Dentro do escopo

- `types/finance.ts`: adicionar campo opcional `contaId?: number | null` em `ExpenseFormValues` e `IncomeFormValues`.
- `services/financeService.ts`: `saveExpense`/`saveIncome` passam a usar `values.contaId ?? getActiveAccountId()` no lugar da chamada fixa a `getActiveAccountId()`.
- `services/configService.ts`: `fetchCategorias`, `fetchCartoes`, `saveCategoria`, `saveCartao` passam a aceitar um parâmetro opcional `accountId?: number | null`, com fallback para `getActiveAccountId()` quando omitido — todos os call sites existentes continuam funcionando sem alteração.
- `services/queryKeys.ts`: `categorias` e `cartoes` deixam de ser arrays fixos e viram funções `(accountId?: number | null) => [...]`, preservando uma chave estável (`['categorias', accountId ?? 'ativa']`) para não invalidar cache de quem já usa sem argumento.
- Novo seletor de conta no topo de `ExpenseForm.tsx` (usado dentro de `ExpenseDialog.tsx`) e dentro de `IncomeDialog.tsx`:
  - Busca a lista de contas do usuário (reaproveitando `fetchContas`/`useActiveAccount`), exibe o seletor **somente se houver mais de 1 conta**.
  - Valor inicial = conta ativa atual (`getActiveAccountId()`), preservando o comportamento hoje existente quando o usuário não mexe no campo.
  - Ao trocar a seleção, dispara refetch de categorias e cartões filtrados pela conta escolhida (usando as novas query keys parametrizadas).
- Fluxo de "criar categoria/cartão rápido" de dentro do modal: passa a associar a categoria/cartão novo à **conta selecionada no seletor do lançamento**, não à conta ativa global (via `saveCategoria`/`saveCartao` recebendo o `accountId` do formulário).
- Submit do formulário grava `conta_id` = conta selecionada no seletor (via `values.contaId`).

### Fora do escopo

- Alterações em `useActiveAccount.ts` ou no conceito de "conta ativa" global — continuam existindo como estão, o seletor do modal é independente e não altera a conta ativa da sessão.
- Réplica mensal de receita (`replicarAte`) usando uma conta diferente por mês — toda a série replicada usa a mesma conta escolhida no lançamento original.
- Lote de despesas (`ExpenseDialog` permite empilhar múltiplas despesas): todos os itens do lote seguem a conta escolhida no formulário do topo — não haverá seletor por item individual do lote nesta primeira versão.
- Qualquer alteração de backend — endpoints e filtros por `conta_id` já existem e não são tocados.
- Qualquer mudança em telas de configuração (`CategoriasTab`, `CartaoTab`) além do necessário para manter compatibilidade de assinatura das funções alteradas.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — mesma ressalva do plano anterior: documentos genéricos multi-prefeitura/RLS que não correspondem à arquitetura real (aqui a unidade é `conta_id`/`usuario_id`). Princípios de código aplicados: Drizzle não se aplica aqui (frontend-only), mas seguem os princípios de nomes claros, sem `any`, validar no backend (já validado), e reaproveitar padrões existentes antes de criar novos.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados dentro de `sistema financas/`.
- Arquivos de código lidos diretamente: `src/screens/finance/ExpenseDialog.tsx`, `src/screens/finance/ExpenseForm.tsx` (parcial), `src/screens/finance/IncomeDialog.tsx` (parcial), `src/services/apiClient.ts`, `src/services/financeService.ts` (trechos de `saveExpense`/`saveIncome`), `src/services/configService.ts` (trechos de `fetchCategorias`/`fetchCartoes`/`saveCartao`), `src/services/queryKeys.ts`, `src/types/finance.ts` (interfaces `ExpenseFormValues`/`IncomeFormValues`), `backend/src/routes/expenses.ts` (trechos de `conta_id`/`canWriteToAccount`).
- `.plans/multiconta-pj-panorama-geral.md` — plano anterior já implementado nesta mesma branch (`feat/R/multiconta-pj-panorama-geral`); este plano é a continuação direta do gap identificado após aquela implementação.

## Impacto por área

### Frontend

- **`src/types/finance.ts`**: adicionar `contaId?: number | null` a `ExpenseFormValues` (~linha 90-109) e `IncomeFormValues` (~linha 42-56).
- **`src/services/financeService.ts`**: `saveExpense` (linha 161-187) e `saveIncome` (linha 121-155) trocam `const accountId = getActiveAccountId();` por `const accountId = values.contaId ?? getActiveAccountId();`.
- **`src/services/configService.ts`**: `fetchCategorias`, `fetchCartoes`, `saveCategoria`, `saveCartao` ganham parâmetro opcional `accountId?: number | null`, usado no lugar de `getActiveAccountId()` quando fornecido.
- **`src/services/queryKeys.ts`**: `categorias: ['categorias']` e `cartoes: ['cartoes']` viram `categorias: (accountId?: number | null) => ['categorias', accountId ?? 'ativa']` e equivalente para `cartoes`. Todos os call sites que hoje usam `queryKeys.categorias`/`queryKeys.cartoes` como valor direto precisam ser ajustados para `queryKeys.categorias()`/`queryKeys.cartoes()` (chamando a função sem argumento preserva o comportamento atual).
- **`src/screens/finance/ExpenseForm.tsx`**: novo campo de seleção de conta no topo do formulário (antes de descrição/valor); estado local do formulário passa a incluir a conta escolhida; queries de categorias/cartões (linha 135-136) passam a usar a conta selecionada como parâmetro e dependem dela na query key.
- **`src/screens/finance/IncomeDialog.tsx`**: mesmo tratamento — seletor de conta no topo, estado local, queries relacionadas (representantes/clientes/contratos, se filtrados por conta, devem seguir o mesmo padrão a confirmar na implementação).
- **`src/screens/finance/ExpenseDialog.tsx`**: `isEmpresa` (linha 51, hoje fixo por `contaAtivaTipo`) precisa refletir o tipo da conta **selecionada no seletor**, não da conta ativa global, para os campos condicionais (ex: campos comerciais) continuarem coerentes com a conta escolhida.
- Estados de loading/error ao trocar de conta: enquanto categorias/cartões da nova conta carregam, os selects correspondentes mostram estado de carregamento (padrão já usado no restante do formulário).
- Testes: verificar manualmente que trocar a conta no seletor atualiza corretamente categorias/cartões e que o lançamento final é salvo na conta certa.

### Backend

`Sem impacto esperado` — endpoints e filtros por `conta_id` já existem e já são usados por outras partes do sistema (ex: troca de conta ativa global). Nenhuma rota, validação ou schema precisa mudar.

### Banco de dados

`Sem impacto esperado` — nenhuma migration necessária.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/types/finance.ts`
- `sistema financas/src/services/financeService.ts`
- `sistema financas/src/services/configService.ts`
- `sistema financas/src/services/queryKeys.ts`
- `sistema financas/src/screens/finance/ExpenseForm.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- Possíveis ajustes pontuais em quem consome `queryKeys.categorias`/`queryKeys.cartoes` hoje como valor direto (ex: `CategoriasTab.tsx`, `CartaoTab.tsx`) — apenas para adequar à nova assinatura de função, sem mudança de comportamento.

## Estratégia de implementação

1. **Tipos**: adicionar `contaId` opcional em `ExpenseFormValues`/`IncomeFormValues`.
2. **Services de gravação**: ajustar `saveExpense`/`saveIncome` para usar `values.contaId ?? getActiveAccountId()`.
3. **Services de leitura**: ajustar `fetchCategorias`/`fetchCartoes`/`saveCategoria`/`saveCartao` para aceitar `accountId` opcional com o mesmo fallback.
4. **Query keys**: converter `categorias`/`cartoes` em funções parametrizadas; localizar e ajustar todos os call sites existentes (`CategoriasTab.tsx`, `CartaoTab.tsx`, `ExpenseForm.tsx` e quaisquer outros) para chamar a função (sem argumento mantém comportamento atual).
5. **Seletor no formulário de despesa** (`ExpenseForm.tsx`): buscar lista de contas do usuário; renderizar o seletor no topo apenas quando houver mais de uma conta; conectar ao estado do formulário; propagar a conta escolhida para as queries de categoria/cartão e para o payload final.
6. **Seletor no formulário de receita** (`IncomeDialog.tsx`): mesmo tratamento.
7. **Ajuste de `isEmpresa`** em `ExpenseDialog.tsx`/`IncomeDialog.tsx` para refletir o tipo da conta selecionada, não da conta ativa global.
8. **Criação rápida de categoria/cartão dentro do modal**: garantir que usa a conta selecionada no lançamento (via `accountId` passado a `saveCategoria`/`saveCartao`).
9. **Validação**: rodar `tsc --noEmit` e `vite build` no frontend; testar manualmente o fluxo com um usuário com múltiplas contas.

## Regras de negócio identificadas

- O seletor de conta só aparece para quem tem mais de 1 conta (dono de PF+PJs). Colaborador vinculado a uma única conta PJ não vê o seletor.
- Trocar a conta no seletor não altera a conta ativa global da sessão — é uma escolha local ao lançamento sendo criado/editado.
- Categoria/cartão criado de dentro do modal nasce associado à conta selecionada no lançamento, não à conta ativa da sessão.
- Lote de despesas: todos os itens do lote usam a mesma conta escolhida no formulário do topo.

## Regras multi-tenant e segurança

(Vocabulário real do projeto: "tenant" = conta/usuário dono)

- O backend já valida `canWriteToAccount(contaIdFinal, req.user!.id)` antes de gravar — o frontend nunca pode assumir que enviar um `conta_id` arbitrário terá sucesso; a UI deve tratar uma eventual rejeição do backend (usuário tentando gravar em conta à qual perdeu acesso entre abrir o modal e salvar) com mensagem de erro clara, não crash.
- O seletor de conta deve listar apenas contas que o usuário realmente possui ou às quais está vinculado (reaproveitar `fetchContas`, que já filtra corretamente por `usuario_id`/`conta_membros` no backend) — nunca uma lista construída no frontend sem essa validação de origem.
- Nenhuma mudança nas regras de `familyVisibility.ts`/`accountAccess.ts` — este plano é puramente sobre qual conta um NOVO lançamento aponta, não sobre quem pode ver lançamentos de quem.

## Validações necessárias

- Frontend: ao submeter, garantir que `contaId` enviado corresponde a uma conta realmente disponível para o usuário (a lista já vem filtrada de `fetchContas`, então a validação principal é não permitir enviar um id fora dessa lista por manipulação de estado).
- Nenhuma validação de backend nova é necessária — `canWriteToAccount` já cobre isso.

## Testes necessários

### Frontend

- Usuário com apenas 1 conta: seletor não aparece, comportamento idêntico ao atual.
- Usuário com múltiplas contas: seletor aparece, valor inicial é a conta ativa.
- Trocar a conta no seletor recarrega categorias e cartões corretamente (lista da nova conta, sem itens desabilitados).
- Criar categoria/cartão novo dentro do modal com uma conta não-ativa selecionada: o novo item aparece associado à conta selecionada, não à conta ativa.
- Salvar uma despesa/receita com uma conta diferente da ativa: o lançamento aparece na conta correta ao consultar depois (ex: trocando a conta ativa para lá).
- Campos condicionais por tipo de conta (ex: campos comerciais) respeitam o tipo da conta selecionada no seletor, não da conta ativa.

### Backend

Nenhum teste novo necessário — comportamento já coberto pelos testes/validações existentes de `canWriteToAccount` e filtros de `conta_id`.

### E2E

- Fluxo completo: usuário dono de PF + 1 PJ abre o modal de despesa com a conta ativa em PF, troca o seletor para a PJ, categoria muda para a lista da PJ, salva, e o lançamento aparece no Panorama Geral (feature anterior) e na tela de despesas da PJ, não da PF.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm run build
```

(Executar de dentro de `sistema financas/`; sem impacto em backend, não é necessário rodar `tsc --noEmit` do backend para esta feature.)

## Riscos e pontos de atenção

- **Quebra de call sites existentes de `queryKeys.categorias`/`queryKeys.cartoes`**: essas chaves são usadas em outras telas (`CategoriasTab.tsx`, `CartaoTab.tsx`, possivelmente outras). A mudança de array fixo para função precisa ser aplicada em TODOS os call sites simultaneamente, ou o build quebra. É importante fazer uma busca completa antes de alterar a assinatura.
- **`isEmpresa` em `ExpenseDialog.tsx`/`IncomeDialog.tsx`**: hoje é calculado uma única vez via `useMemo` na montagem do componente a partir da conta ativa global. Precisa virar reativo à conta selecionada no seletor, não mais um valor fixo — atenção ao recalcular corretamente quando o seletor muda.
- **Lote de despesas com contas diferentes**: like ficou fora do escopo (todos os itens seguem a conta do topo), mas se o usuário tentar isso intuitivamente e não funcionar, pode gerar confusão — vale um texto de ajuda no formulário deixando claro que o lote inteiro vai para a mesma conta.
- **Categoria "órfã" (sem tipo/conta)**: o backend tem uma regra de fallback para categorias órfãs (`expenses.ts:243-251`) que precisa continuar funcionando corretamente ao trocar de conta no seletor — testar esse caso específico.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões sobre recarregamento de categorias/cartões, posição do seletor, e associação de categoria/cartão criado no modal já foram coletadas e aplicadas acima.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Seletor de conta aparece no topo de `ExpenseForm`/`IncomeDialog` apenas para usuários com mais de 1 conta.
- Trocar a conta no seletor atualiza corretamente categorias e cartões disponíveis.
- Lançamento salvo reflete a conta escolhida no seletor, não necessariamente a conta ativa global.
- Categoria/cartão criado de dentro do modal é associado à conta selecionada no lançamento.
- Nenhuma tela existente que consome `queryKeys.categorias`/`queryKeys.cartoes` quebra.
- `tsc --noEmit` e `vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, em conjunto com o plano anterior já implementado (`multiconta-pj-panorama-geral.md`) na mesma branch.
- Antes de alterar `queryKeys.categorias`/`queryKeys.cartoes`, fazer uma busca completa por todos os usos atuais no frontend para garantir que nenhum call site fique quebrado.
- Não alterar backend — não é necessário para esta feature.
- Não executar migrations — nenhuma é necessária.
- Manter alterações pequenas e focadas: o seletor é aditivo, o comportamento padrão (sem mexer no seletor) deve ficar idêntico ao atual.
- Não abrir PR sem instrução explícita do usuário — projeto vai direto para `main` via skill `finalizar`.
