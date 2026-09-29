# Plano de Implementação: Corrigir Bugs Funcionais — Sistema Financeiro

## Origem

- Arquivo de especificação: `não fornecido; pedido direto no chat, a partir de auditoria completa do sistema de finanças feita nesta conversa`
- Data do planejamento: `2026-07-12`
- Classificação: `frontend + backend`

## Resumo

Corrigir 4 problemas confirmados por leitura direta do código: "marcar como pago" chama uma URL que não existe (`/pagar` em vez de `/pay`); "mover para o próximo mês" chama uma rota que nunca foi criada no backend; a recuperação de senha sempre envia o código de verificação vazio; e dois bugs de indexação de mês (um em cada direção) — o filtro "Pago neste mês" compara contra o mês errado, e o painel de notificações usa fetch direto (URL relativa que quebra em produção, sem filtro de perfil, sem tratamento de sessão expirada) além de também errar o índice do mês.

Descoberta importante feita durante a investigação: `month` (do `AppContext`) é 0-indexado e usado consistentemente assim entre salvar e buscar despesas (`saveExpense`/`fetchFinanceDashboard`, ambos sem `+1`). O `NotificationPanel` soma `+1` sem necessidade (inconsistente com essa convenção), enquanto o `mesPrefixo` do `DespesasScreen` compara contra uma data ISO real (que é naturalmente 1-indexada) e por isso precisa do `+1` que falta.

## Escopo

### Dentro do escopo

1. **`financeService.ts:194`** — trocar `/despesas/${id}/pagar` por `/despesas/${id}/pay`, igual à rota real do backend.
2. **Nova rota `POST /api/despesas/:id/mover`** no backend — move a despesa pro próximo mês: confirma dono, recusa se já paga, calcula a nova `data_vencimento` (mesmo dia do mês seguinte, com ajuste se o mês seguinte não tiver esse dia), atualiza `data_vencimento`, `mes` e `ano` juntos.
3. **`LoginPage.tsx`** — adicionar estado `verifiedCode`, preenchido em `handleVerify` após o código ser aceito, usado em `handleReset` no lugar do campo oculto fixo em `value=""`.
4. **`DespesasScreen.tsx:252`** — `mesPrefixo` passa a usar `month + 1`.
5. **`AppShell.tsx` (`NotificationPanel`)** — troca o `fetch` cru por `apiRequest` + `getActiveProfileId()`. Remove o `+1` do mês (aqui é errado, compara contra a coluna `mes`, 0-indexada).

### Fora do escopo

- `FinanceDashboard.tsx:58` (`getContratosFaturamento(month + 1, year)`) — outro subsistema (contratos), não auditado nesta rodada.
- Qualquer outro achado da auditoria geral (segurança já corrigida; versão antiga e código morto/duplicação ficam para depois).
- Padronizar toda a indexação de mês do sistema numa convenção só.

## Leitura de contexto

- `/AGENT.md`
- Auditoria completa do sistema de finanças feita nesta conversa.
- Leitura direta e verificação manual de `financeService.ts`, `expenses.ts` (schema + rotas), `LoginPage.tsx`, `DespesasScreen.tsx`, `AppShell.tsx`, `apiClient.ts`, `AppContext.tsx`, `FinanceDashboard.tsx`.

## Impacto por área

### Frontend

- `financeService.ts`: corrigir URL de `pagarDespesa`.
- `LoginPage.tsx`: novo estado `verifiedCode`.
- `DespesasScreen.tsx`: correção do `mesPrefixo`.
- `AppShell.tsx`: `NotificationPanel` usando `apiRequest`.

### Backend

- `expenses.ts`: nova rota `POST /:id/mover`.

### Banco de dados

Sem impacto esperado — nenhuma mudança de schema, só leitura/escrita nas colunas já existentes (`data_vencimento`, `mes`, `ano`).

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/expenses.ts`
- `sistema financas/src/services/financeService.ts`
- `sistema financas/src/screens/public/LoginPage.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/layout/AppShell.tsx`

## Estratégia de implementação

1. `financeService.ts`: corrigir a URL em `pagarDespesa`.
2. `expenses.ts`: adicionar rota `POST /:id/mover` (busca despesa com ownership check, recusa se paga, calcula próximo mês com clamping de dia, atualiza `data_vencimento`+`mes`+`ano`).
3. `LoginPage.tsx`: adicionar `verifiedCode` state, setar em `handleVerify`, usar em `handleReset`.
4. `DespesasScreen.tsx`: adicionar `+1` no `mesPrefixo`.
5. `AppShell.tsx`: reescrever `NotificationPanel` usando `apiRequest` + `getActiveProfileId`, sem o `+1` incorreto.
6. Rodar build do backend e do frontend.
7. Testes manuais onde possível.

## Regras de negócio identificadas

- Despesa já paga não pode ser movida de mês.
- Código de recuperação de senha só é válido depois de verificado explicitamente pelo usuário.

## Regras multi-tenant e segurança

- Nova rota `/mover` deve filtrar por `usuario_id`, seguindo o mesmo padrão de `/pay` e `/cancelar`.
- `NotificationPanel` deve respeitar o perfil ativo (`perfil_id`), igual ao resto do dashboard.

## Validações necessárias

- `/mover` retorna 404 para despesa de outro usuário ou inexistente.
- `/mover` recusa mover despesa já paga.
- `/mover` lida corretamente com viradas de mês/ano e dias que não existem no mês seguinte.

## Testes necessários

### Frontend

- Fluxo completo de "esqueci minha senha" com código real.
- Filtro "Pago neste mês" mostrando os itens corretos.
- Painel de notificações carregando em produção (URL absoluta) e respeitando perfil ativo.

### Backend

- `POST /:id/pay` (já existente, sem mudança) continua funcionando.
- `POST /:id/mover` em casos normais e de borda (fim de mês, virada de ano).

### E2E

- Marcar despesa como paga → não aparece mais como pendente.
- Mover despesa → desaparece do mês atual, aparece no próximo.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Baixo/médio: aritmética de data na rota `/mover` — testar casos de borda antes de finalizar.
- Baixo: `NotificationPanel` mantém o mesmo formato de campos retornados (`valor_final`, `categoria_nome`, `forma_pagamento`), não deve exigir mudança no resto do componente.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Marcar despesa como paga funciona (sem 404).
- Mover despesa para o próximo mês funciona e ela aparece corretamente no mês seguinte.
- Reset de senha funciona de ponta a ponta com o código real digitado.
- Filtro "Pago neste mês" mostra as despesas certas.
- Painel de notificações carrega em produção, respeita o perfil ativo, e trata sessão expirada.
- Builds do frontend e do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Manter alterações pequenas e focadas nos 5 arquivos listados.
- Não executar migrations (não há nenhuma neste plano).
- Não alterar `.env`.
- Não mexer em `FinanceDashboard.tsx` (fora de escopo).
