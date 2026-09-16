# Plano de Implementação: Correções na Carteira da Família

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída a partir da descrição do usuário (print de tela + 4 pedidos) e de ajustes coletados durante o planejamento interativo.
- Data do planejamento: `2026-09-15`
- Classificação: `fullstack` (sem impacto de banco de dados — nenhuma migration necessária)

## Resumo

Cinco correções na feature "Carteira da família" do sistema financas. A causa raiz central é que 3 permissões de família (`accessFamilyEntries`, `editFamilyEntries`, `accessFamilyCards`) nunca são persistidas pelo backend ao serem ativadas na tela de permissões — isso explica em cascata por que o gráfico de categorias some para membros de família e por que a coluna de autor nunca mostra mais de um nome. Também inclui um bug crítico de SQL encontrado durante a investigação, ocultar campos exclusivos de PJ na listagem de receitas para conta PF, e renomear a coluna de autoria em receitas e despesas.

## Escopo

### Dentro do escopo

- Corrigir `PERMISSION_FLAGS` no backend para incluir os 3 flags de família, permitindo que os toggles da tela "Carteira da família" sejam salvos de fato.
- Corrigir `resolveFinancialAccount` para reconhecer contas de membros de família (não só do dono), restaurando o gráfico de categorias para membros.
- Corrigir a query SQL quebrada em `resolveOwnerForWrite` (placeholder `$1` ausente).
- Ocultar colunas/campos de cliente, representante e comissão na listagem de receitas (tabela desktop e card mobile) quando a conta for do tipo pessoal (PF).
- Renomear a coluna "Quem lançou" para "Usuário" nas telas de Receitas e Despesas.
- Validar que o nome de quem registrou a receita passa a aparecer corretamente para membros de família após a correção da permissão.

### Fora do escopo

- Qualquer criação de nova permissão (ex.: permissão de anexos) — não existe pedido válido para isso; o usuário esclareceu que o pedido original era apenas analisar as 3 permissões existentes no print.
- Mudanças em `sistema financas` além dos arquivos listados.
- Qualquer alteração em `escalacao futebol`.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo) — lido.
- `sistema financas/AGENT.md` — lido (idêntico ao da raiz neste projeto).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas` — as regras usadas são as do `AGENT.md` do projeto.
- Nenhum arquivo `.md` de especificação foi fornecido pelo usuário; a especificação foi construída interativamente nesta conversa (print de tela + 4 pedidos + esclarecimentos).
- Arquivos de código lidos/inspecionados: `src/services/permissoesService.ts`, `src/screens/config/PermissoesTab.tsx`, `backend/src/routes/accountMembers.ts`, `backend/src/middleware/permissions.ts`, `backend/src/db/schema/memberPermissions.ts`, `backend/src/services/budgetService.ts`, `backend/src/utils/familyVisibility.ts`, `backend/src/utils/ownerAndAccountWhere.ts`, `backend/src/routes/incomes.ts`, `src/screens/finance/MonthCategoriesOverview.tsx`, `src/screens/receitas/ReceitasScreen.tsx`, `src/screens/despesas/DespesasScreen.tsx`, `src/screens/finance/IncomeForm.tsx` (via agente de investigação), `src/ui/form.tsx`.

## Impacto por área

### Frontend

- `src/screens/receitas/ReceitasScreen.tsx`: condicionar cabeçalhos "Cliente / Representante" (linha ~294) e "Comissão" (linha ~299), células correspondentes (linhas ~333-347, ~356-360) e `colSpan` do rodapé (~421) à flag `isEmpresa` (já lida na linha 63); renomear cabeçalho "Quem lançou" (linha 297) para "Usuário".
- `src/screens/receitas/IncomeCard.tsx`: aplicar a mesma condição de `isEmpresa` para ocultar cliente/representante/comissão no card mobile.
- `src/screens/despesas/DespesasScreen.tsx`: renomear cabeçalho "Quem lançou" (linha 676) para "Usuário".
- Nenhuma mudança de query key, hook ou estado de loading/error/empty é necessária — os dados já trafegam corretamente; é só exibição condicional e rótulo.

### Backend

- `backend/src/routes/accountMembers.ts`: adicionar `accessFamilyEntries`, `editFamilyEntries`, `accessFamilyCards` ao array `PERMISSION_FLAGS` (linhas 554-560), para que `PUT /:id/permissions` (linha 649) passe a persistir esses campos.
- `backend/src/services/budgetService.ts`: corrigir `resolveFinancialAccount` (linhas 110-122) para aceitar a conta quando `userId` é o dono OU um membro ativo vinculado via `conta_membros` (mesmo padrão de resolução usado em `accounts.ts`/`familyVisibility.ts`), preservando a segurança de que só membros vinculados àquela conta específica a acessam.
- `backend/src/utils/familyVisibility.ts`: corrigir a query em `resolveOwnerForWrite` (linhas 135-138), que hoje está `` `SELECT usuario_id, conta_id FROM ${tabela} WHERE id = ` `` sem o placeholder `$1` — adicionar `WHERE id = $1` e manter `[registroId]` como parâmetro.

### Banco de dados

`Sem impacto esperado` — as 3 colunas de permissão de família já existem em `membro_permissoes` (`memberPermissions.ts:56-60`); nenhuma migration é necessária.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `backend/src/services/budgetService.ts`
- `backend/src/utils/familyVisibility.ts`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/receitas/IncomeCard.tsx`
- `src/screens/despesas/DespesasScreen.tsx`

## Estratégia de implementação

1. Corrigir `PERMISSION_FLAGS` em `accountMembers.ts` para incluir os 3 flags de família.
2. Corrigir `resolveFinancialAccount` em `budgetService.ts` para reconhecer membro de família como solicitante válido.
3. Corrigir a query SQL quebrada em `resolveOwnerForWrite` (`familyVisibility.ts`).
4. Condicionar colunas/campos de cliente, representante e comissão a `isEmpresa` em `ReceitasScreen.tsx` e `IncomeCard.tsx`.
5. Renomear "Quem lançou" → "Usuário" em `ReceitasScreen.tsx` e `DespesasScreen.tsx`.
6. Validar manualmente: ativar as 3 permissões de família para um membro de teste, confirmar que persistem após reload, confirmar que o gráfico de categorias aparece para o membro, e confirmar que a coluna "Usuário" mostra o nome correto quando mais de uma pessoa lança na conta.

## Regras de negócio identificadas

- Permissões de família (`accessFamilyEntries`, `editFamilyEntries`, `accessFamilyCards`) só existem em conta do tipo pessoal.
- Dono da conta sempre tem acesso total, independentemente de qualquer flag de `membro_permissoes`.
- Cliente, representante e comissão são conceitos exclusivos de conta tipo empresa (PJ); conta pessoal (PF) nunca deveria exibi-los, nem no formulário (já correto) nem na listagem (a corrigir).
- A coluna de autoria ("Usuário") só é exibida quando há mais de um autor distinto nos lançamentos do período carregado — essa regra de exibição condicional é mantida, não é o alvo desta correção.

## Regras multi-tenant e segurança

- Este projeto não é multi-tenant/multi-prefeitura como o `AGENT.md` da raiz descreve (esse contexto é do outro subprojeto do monorepo, `escalacao futebol`) — o `AGENT.md` de `sistema financas` é uma cópia idêntica do template, mas na prática este projeto separa dados por `usuario_id`/`conta_id`, não por prefeitura.
- Ao corrigir `resolveFinancialAccount`, garantir que a checagem de vínculo (`conta_membros` com `status = 'ativo'`) seja aplicada exatamente como em `familyVisibility.ts`, para não abrir acesso a contas de terceiros não vinculados.
- Nenhuma alteração deve enfraquecer a exigência de que o dono da conta sempre precisa aprovar/ativar explicitamente as permissões de família — a correção só faz o toggle já existente funcionar, não muda a política de "restritivo por padrão".

## Validações necessárias

- Confirmar que o `PUT /:id/permissions` retorna os 3 novos campos persistidos corretamente após a correção (checar resposta JSON).
- Confirmar que `resolveFinancialAccount` corrigido não quebra o caso do dono (conta própria) nem do fluxo de conta empresa.
- Confirmar visualmente que a listagem de receitas em conta PF não mostra mais as colunas de cliente/representante/comissão, e que conta PJ continua mostrando normalmente.

## Testes necessários

### Frontend

- Verificar renderização condicional de colunas em `ReceitasScreen.tsx` para conta PF vs PJ.
- Verificar que `IncomeCard.tsx` esconde cliente/representante/comissão em conta PF.

### Backend

- Teste manual (ou automatizado, se o projeto tiver suíte) de `PUT /account-members/:id/permissions` enviando os 3 flags de família e verificando persistência via `GET`.
- Teste manual de `GET /orcamento/resumo` autenticado como membro de família, confirmando retorno 200 com dados da conta do dono.

### E2E

- Fluxo completo: gestor ativa as 3 permissões de família → membro loga → membro vê lançamentos de outros, vê o gráfico de categorias, e a coluna "Usuário" identifica corretamente quem lançou cada item.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- Ativar as permissões de família passa a ter efeito real em produção assim que implementado — se algum gestor já havia "ativado" esses toggles no passado (acreditando que funcionavam), o comportamento de visibilidade da conta mudará de fato após o deploy. Vale avisar o usuário disso como mudança de comportamento, não só bugfix.
- Risco de regressão em `resolveFinancialAccount`: é usado por outras chamadas do dashboard de orçamento; testar também o caminho do dono para garantir que nada quebrou.
- Ambiente pode estar apontando para produção — nenhuma migration será executada, mas testes manuais de permissão devem ser feitos com cautela quanto a dados reais de usuários.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- As 3 permissões de "Carteira da família" podem ser ativadas e desativadas pela tela de configuração, e o estado persiste após reload.
- O gráfico de categorias aparece normalmente para um membro de família com permissão `accessFamilyEntries` ativa.
- A coluna "Usuário" aparece corretamente quando há mais de um autor na conta, incluindo membros de família.
- Colunas de cliente/representante/comissão não aparecem na listagem de receitas (desktop e mobile) quando a conta é do tipo pessoal (PF).
- A coluna antes chamada "Quem lançou" agora se chama "Usuário" em Receitas e em Despesas.
- `resolveOwnerForWrite` executa sem erro de sintaxe SQL ao editar/excluir lançamento de outro membro da família.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto — não há arquivo `.md` de spec externo.
- Não executar migrations (não há necessidade neste plano).
- Seguir `AGENT.md` da raiz e de `sistema financas` (idênticos neste projeto).
- Manter alterações pequenas e focadas: são ajustes pontuais em arquivos existentes, sem novas abstrações.
- Validar manualmente o fluxo de permissões de família ponta a ponta antes de considerar concluído.
