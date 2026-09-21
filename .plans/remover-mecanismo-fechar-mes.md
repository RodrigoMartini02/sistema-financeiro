# Plano de Implementação: Remover completamente o mecanismo "Fechar mês"/"Reabrir mês"

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature — investigação exaustiva por agente Explore + validação direta de código nesta sessão)
- Data do planejamento: 2026-09-20
- Classificação: `frontend + backend + database`

## Resumo

Remove por completo o mecanismo "Fechar mês"/"Reabrir mês" do sistema: rotas backend, permissão dedicada, tabela `meses`, e todos os consumidores no frontend (botão, travas de edição em Despesas, textos de guia, simulação no modo demo). O cálculo de "saldo anterior" deixa de depender de um snapshot manual gravado ao clicar em "Fechar mês" e passa a ser sempre uma soma agregada em tempo real do histórico completo de receitas/despesas anteriores ao mês consultado (mais aporte inicial da conta, quando aplicável) — calculada por uma função compartilhada entre `months.ts` e `financial.ts`, hoje duplicada e que já divergiu uma vez no passado (correção registrada em `.plans/corrigir-cards-resumo-movimentacoes.md`).

Decisão de negócio confirmada nesta sessão: o mecanismo de fechar mês empacotava duas coisas (snapshot manual de saldo + trava de edição de lançamentos) que geravam estado inconsistente sempre que alguém esquecia de fechar um mês — causa raiz da confusão nos cards de resumo de Movimentações que motivou esta investigação. A remoção elimina essa inconsistência na origem. O redesenho dos cards de resumo em si (Saldo Anterior, Receita do Mês, Despesa do Mês, Resultado do Mês, Saldo Atual com desconto de despesas pagas) é um plano futuro separado, que só poderá ser implementado depois desta remoção.

## Escopo

### Dentro do escopo

- Backend: nova função de cálculo de saldo por agregação direta (sem snapshot, sem recursão mês-a-mês), compartilhada entre a rota de saldo mensal (`months.ts`) e o resumo anual (`financial.ts`).
- Backend: remover as rotas `POST /meses/:ano/:mes/fechar`, `POST /meses/:ano/:mes/reabrir` e `GET /meses` (listagem que só existia para ler o campo `fechado`); manter `GET /meses/:ano/:mes/saldo` com o novo cálculo.
- Backend: remover o schema Drizzle da tabela `meses` e seu export no barrel; remover a permissão dedicada `accessMonthClosing`/`acesso_fechamento_mes` (schema, middleware da rota, lista de flags configuráveis).
- Backend: ajustar `financial.ts` para não fazer mais JOIN com a tabela `meses` na rota `/anual`, usando a função de saldo agregado compartilhada.
- Banco de dados: escrever (sem executar) a migration de `DROP TABLE meses` e `ALTER TABLE membro_permissoes DROP COLUMN acesso_fechamento_mes`; atualizar o dump de referência `backend/config/schema-dev.sql`.
- Frontend: remover o botão "Fechar mês"/"Reabrir mês" e seu guia de primeiro acesso em `MovimentacoesScreen.tsx`; ajustar a fórmula de `saldoAtual` para sempre somar saldo anterior + receitas do mês (sem mais condicional de "mês anterior fechado"); ajustar o texto (`note`) do card para sempre mostrar a composição do cálculo.
- Frontend: remover a trava de edição de lançamentos (`mesFechado`) em `DespesasScreen.tsx` e a prop correspondente em `ExpenseCard.tsx` — todas as ações (marcar como pago, mover para o próximo mês, pagamento em lote) deixam de ser bloqueadas por status de mês.
- Frontend: remover a entrada "Fechamento de mês" da lista de permissões configuráveis (`permissoesService.ts`); remover a chave de guia `despesasFecharMes` (`firstAccessGuideMessages.ts`); remover as simulações de `/fechar`, `/reabrir` e `GET /meses` do modo demo (`fakeApiResolver.ts`), ajustando a simulação de `/saldo` para não depender de estado de fechamento.
- Remover a query key `mesStatus` (`queryKeys.ts`), sem consumidor após esta remoção.

### Fora do escopo

- Redesenho dos 5 cards de resumo em Movimentações (Saldo Anterior, Receita do Mês, Despesa do Mês, Resultado do Mês, Saldo Atual descontando despesas pagas) — plano futuro separado, que depende desta remoção estar concluída antes.
- `backend/config/staging-setup.sql` — contém uma tabela `staging.meses` própria, com colunas diferentes (`aberto` em vez de `fechado`, sem `data_fechamento`), não referenciada por nenhum arquivo TypeScript do backend (confirmado via busca). Fica intocada por não haver evidência de uso ativo por código de produção; registrada como possível resíduo a reavaliar depois, separadamente, se for confirmado que o ambiente de staging que esse arquivo provisiona ainda está em uso.
- Qualquer mudança em relatórios, calendário (`CalendarView.tsx`) ou assistente financeiro (`financialCopilot.ts`, `assistantTools.ts`) — confirmado, nesta sessão e na investigação anterior, que nenhum desses depende da tabela `meses` ou do conceito de mês fechado.
- Qualquer texto público, institucional ou de marketing — confirmado que não existem páginas públicas mencionando esse mecanismo neste projeto.

## Leitura de contexto

- `AGENT.md` (raiz do repositório) — regras de fluxo `/planejar → aprovação → /implementar → /finalizar`, git flow. O conteúdo sobre multi-tenant/prefeitura é um template genérico não aplicável a este projeto (single-tenant por `usuario_id`); tratado apenas como convenções técnicas transferíveis (nomes claros, Drizzle-first, evitar `any`, não silenciar erros).
- `sistema financas/CLAUDE.md` — mesmas regras de fluxo, aplicadas ao subprojeto; regras específicas sobre nunca migrar sem confirmação explícita e nunca assumir ambiente local.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- `.plans/remover-feature-reservas-cofre.md` — usado como referência de nível de rigor esperado para uma remoção completa de feature (mapeamento exaustivo, busca final de confirmação, migration escrita mas não executada).
- `.plans/corrigir-cards-resumo-movimentacoes.md` e `.plans/ajustar-cards-saldo-atual-comprometimento.md` — histórico de decisões anteriores sobre os cards de Movimentações, incluindo o registro de que a lógica de saldo em `financial.ts` já divergiu de `months.ts` uma vez antes (ausência de `status = 'ativa'`, já corrigida).
- Mapeamento exaustivo produzido por agente Explore nesta sessão, cobrindo backend (rotas, schema, permissões, dumps SQL, FKs), frontend (telas, componentes, query keys, guias, modo demo) e confirmação de ausência de menções institucionais/públicas.
- Validação direta nesta sessão do conteúdo atual de `backend/src/routes/months.ts` e `backend/src/routes/financial.ts` (linhas 1-70) — código confere integralmente com o mapeamento do agente.
- Validação direta de `backend/config/staging-setup.sql` — confirma a existência da tabela `staging.meses`, com schema diferente do de produção, sem nenhuma referência a partir de código TypeScript do backend.

## Impacto por área

### Frontend

- **`src/screens/finance/MovimentacoesScreen.tsx`**:
  - Remover import de `Lock`/`LockOpen` (avaliar se algum dos dois ainda é usado em outro ponto do arquivo antes de remover o import).
  - Remover `fecharMesGuide` (`useFirstAccessGuide('despesas:fechar-mes-v1')`).
  - Remover `mesStatusQuery` e `mesAnteriorStatusQuery`/`mesAnteriorFechado`.
  - Remover `mesActionError`, `fecharMut`, `reabrirMut`.
  - Ajustar `saldoAtual = saldoAnterior + receitasMes` (incondicional — remove a checagem de `mesAnteriorFechado`).
  - Remover o botão "Fechar mês"/"Reabrir mês", o `FirstAccessGuideCard` associado, e a exibição de `mesActionError`.
  - Ajustar o `note` do card de saldo para sempre exibir a composição (`"Saldo anterior R$X + Receitas R$Y"`), removendo o texto alternativo de "mês ainda está aberto".
- **`src/screens/despesas/DespesasScreen.tsx`**:
  - Remover a segunda instância de `mesStatusQuery`/`mesFechado` (query duplicada em relação à de `MovimentacoesScreen.tsx`).
  - Remover a condição `!mesFechado` de: `hasMovableItem`, `enabled` das mutations/queries de pagamento em lote, exibição do botão "pagar selecionadas" e de guias associadas.
  - Remover a prop `mesFechado={mesFechado}` passada a `ExpenseCard`.
  - Remover `mesFechado` das condições `disabled`/`title` de marcar como pago e mover para o próximo mês, tanto em ações individuais quanto em lote.
- **`src/screens/despesas/ExpenseCard.tsx`**: remover a prop `mesFechado` da interface, da desestruturação, e de todo lugar onde compõe `label`/`disabled`.
- **`src/services/queryKeys.ts`**: remover a entrada `mesStatus`.
- **`src/services/permissoesService.ts`**: remover `'accessMonthClosing'` do union type `PermissionFlag` e a entrada `{ flag: 'accessMonthClosing', label: 'Fechamento de mês' }` do grupo "Financeiro".
- **`src/components/firstAccessGuideMessages.ts`**: remover a chave `despesasFecharMes`.
- **`src/services/demo/fakeApiResolver.ts`**: remover a simulação de `POST /meses/:ano/:mes/fechar`, `POST /meses/:ano/:mes/reabrir` e `GET /meses`; ajustar a simulação de `GET /meses/:ano/:mes/saldo` para calcular sem depender de nenhum estado de fechamento (equivalente ao novo cálculo real, adaptado ao banco fake).
- **`src/services/financeService.ts`**: `fetchMonthBalance` (função interna não exportada) é preservada sem mudança de assinatura — só o que o backend retorna internamente muda.
- Sem novos estados de loading/error além dos já existentes; sem impacto em `ReceitasScreen.tsx` ou `CalendarView.tsx` (confirmado que não consomem `balance.saldoAnterior`/`saldoFinal` nem `mesFechado`).

### Backend

- **Novo arquivo `backend/src/services/balanceService.ts`**: função (nome sugerido `calculateBalanceUpTo(userId, year, month, accountId)`) que agrega, numa única query, a soma de receitas menos despesas de todo o histórico com `(ano * 12 + mes) < chave` (mesmo padrão de comparação já usado por `isInicioRealDoHistorico`), somando o aporte inicial da conta apenas quando não há nenhum lançamento anterior a esse ponto (reaproveitando a lógica de `isInicioRealDoHistorico`, que sobrevive). Essa função substitui a leitura de `meses.saldo_final` em ambos os consumidores atuais.
- **`backend/src/routes/months.ts`**:
  - `calculateBalanceBreakdown` passa a chamar a nova função de saldo agregado do service compartilhado, em vez de consultar a tabela `meses`.
  - Remover `POST /:ano/:mes/fechar`, `POST /:ano/:mes/reabrir` e `GET /` (listagem de meses).
  - Manter `GET /:ano/:mes/saldo`, agora 100% derivado de cálculo em tempo real.
  - `isInicioRealDoHistorico` e `fetchAporteInicial` são movidas para o novo service compartilhado (ou `fetchAporteInicial` fica só lá, evitando a duplicata que hoje existe em `financial.ts`).
- **`backend/src/routes/financial.ts`**:
  - Remover a subquery/JOIN com a tabela `meses` na rota `GET /anual` (linhas que hoje fazem `SELECT DISTINCT ON (mes) mes, saldo_final FROM meses ...`).
  - Substituir por chamada à função de saldo agregado compartilhada, para cada mês do `generate_series` já usado na rota.
  - Remover a função `fetchAporteInicial` local, duplicada — usar a do service compartilhado.
- **`backend/src/server.ts`**: manter a montagem de `/api/meses` apenas para o que sobrar (`GET /:ano/:mes/saldo`), removendo `requireScreenAccess('accessMonthClosing')` do middleware da rota.
- **Schema Drizzle**: remover `backend/src/db/schema/months.ts` por completo; remover `export * from './months';` de `backend/src/db/schema/index.ts`. Confirmado que nenhum arquivo TypeScript usa esse schema tipado (toda a lógica é SQL raw via `pool.query`), então a remoção não quebra nenhuma query tipada.
- **Permissão**: remover `accessMonthClosing: boolean('acesso_fechamento_mes')...` de `backend/src/db/schema/memberPermissions.ts`; remover `'accessMonthClosing'` do array `PERMISSION_FLAGS` em `backend/src/routes/accountMembers.ts`.
- Nenhuma rota nova além do rearranjo acima; nenhuma mudança de contrato de resposta em `GET /:ano/:mes/saldo` (mesmos campos: `saldo_anterior`, `receitas`, `despesas`, `saldo_final`).

### Banco de dados

- **Migration nova** (`backend/drizzle/00XX_remover_fechamento_mes.sql`, número exato a definir no momento da implementação conforme a última migration existente):
  ```sql
  DROP TABLE IF EXISTS meses;
  ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_fechamento_mes;
  ```
- Confirmado: nenhuma tabela tem FK apontando para `meses.id` (só `meses` tem FKs de saída para `contas` e `usuarios`) — o `DROP TABLE` pode ser feito diretamente, sem necessidade de tratar dependências de terceiros.
- Atualizar `backend/config/schema-dev.sql` (dump de referência, não uma migration em si) removendo: `CREATE TABLE public.meses`, sua sequence, seus índices (`idx_meses_conta`, `idx_meses_usuario_ano_mes`, `meses_usuario_ano_mes_conta_unique`), suas constraints de FK (`meses_conta_id_fkey`, `meses_usuario_id_fkey`), e a coluna `acesso_fechamento_mes` da tabela `membro_permissoes`.
- Não mexer em `backend/config/staging-setup.sql` neste plano (fora do escopo, ver seção acima).
- Não mexer em nenhuma migration antiga já aplicada (ex.: `0030_permissoes_por_tela.sql`, que criou a coluna de permissão) — apenas a nova migration de remoção é criada.

> Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/services/balanceService.ts` (novo)
- `backend/src/routes/months.ts`
- `backend/src/routes/financial.ts`
- `backend/src/server.ts`
- `backend/src/db/schema/months.ts` (removido)
- `backend/src/db/schema/index.ts`
- `backend/src/db/schema/memberPermissions.ts`
- `backend/src/routes/accountMembers.ts`
- `backend/config/schema-dev.sql`
- `backend/drizzle/00XX_remover_fechamento_mes.sql` (novo, não executado)
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/despesas/ExpenseCard.tsx`
- `src/services/queryKeys.ts`
- `src/services/permissoesService.ts`
- `src/components/firstAccessGuideMessages.ts`
- `src/services/demo/fakeApiResolver.ts`

## Estratégia de implementação

1. Criar `backend/src/services/balanceService.ts` com a função de saldo agregado compartilhada (agregação direta de todo o histórico anterior, sem recursão mês-a-mês, sem snapshot).
2. Atualizar `backend/src/routes/months.ts`: usar o novo service em `calculateBalanceBreakdown`; remover as rotas `fechar`, `reabrir` e `GET /`.
3. Atualizar `backend/src/routes/financial.ts`: remover o JOIN com `meses` e a `fetchAporteInicial` duplicada; usar o novo service para compor `saldo_final` de cada mês do `generate_series`.
4. Ajustar `backend/src/server.ts`: remover `requireScreenAccess('accessMonthClosing')` da montagem de `/api/meses`.
5. Remover `backend/src/db/schema/months.ts`, seu export em `index.ts`, e a permissão `accessMonthClosing` em `memberPermissions.ts`/`accountMembers.ts`.
6. Escrever a migration de remoção (sem executar) e atualizar `backend/config/schema-dev.sql`.
7. Frontend: remover UI/estado/travas em `MovimentacoesScreen.tsx`, `DespesasScreen.tsx`, `ExpenseCard.tsx`.
8. Frontend: limpar `queryKeys.ts`, `permissoesService.ts`, `firstAccessGuideMessages.ts`, `fakeApiResolver.ts`.
9. Rodar `npx tsc --noEmit` (backend e frontend) e `npx vite build`.
10. Buscar novamente por `mesFechado`, `mesAnteriorFechado`, `accessMonthClosing`, `acesso_fechamento_mes`, `/meses/:ano/:mes/fechar`, `/reabrir`, `mesStatus` em todo o projeto (backend e frontend) para confirmar que nada ficou órfão.
11. Apresentar resumo final; não executar a migration sem confirmação explícita separada do usuário.

## Regras de negócio identificadas

- O saldo de qualquer mês passa a ser sempre a soma real (receitas − despesas, por status `'ativa'`) de todo o histórico de lançamentos anteriores a ele, mais o aporte inicial da conta quando esse mês for o início real do histórico — nunca mais um valor congelado por uma ação manual.
- Nenhuma ação de edição de lançamento (marcar como pago, mover para o próximo mês, pagamento em lote) é mais bloqueada por status de "mês fechado" — essa trava deixa de existir.
- A permissão "Fechamento de mês" deixa de existir; nenhuma tela ou ação depende mais dela.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Todas as queries do novo service de saldo devem preservar o filtro por `usuario_id` e por `accountId` (via `accountWhere`, já usado hoje) exatamente como as queries atuais fazem — a mudança é só na origem do dado (agregação em vez de snapshot), não no escopo de acesso. Nenhum dado novo é exposto; a remoção da permissão `accessMonthClosing` simplesmente elimina um controle que não terá mais nada a controlar.

## Validações necessárias

Nenhuma validação de input nova é introduzida. Validação necessária é de regressão numérica: o novo cálculo de saldo agregado deve produzir o mesmo resultado que a tabela `meses` produzia para os mesmos dados históricos, antes da remoção (comparação manual com valores conhecidos em produção, antes de aplicar a migration).

## Testes necessários

### Frontend

- Validação manual: tela de Movimentações carrega normalmente, sem o botão "Fechar mês"/"Reabrir mês".
- Validação manual: em Despesas, qualquer lançamento (de qualquer mês, passado ou presente) pode ser marcado como pago, movido para o próximo mês, ou incluído em pagamento em lote, sem bloqueio.
- Validação manual: tela de Permissões de membro não exibe mais a opção "Fechamento de mês".
- Validação manual: modo demo interativo continua funcionando sem erros de endpoint inexistente.

### Backend

- Validação manual: `GET /meses/:ano/:mes/saldo` retorna o mesmo `saldo_final` que a tabela `meses` retornava antes da remoção, para pelo menos um mês que já estava fechado em produção (comparação de regressão).
- Validação manual: `POST /meses/:ano/:mes/fechar` e `/reabrir` retornam 404 (rota removida).
- Validação manual: `GET /financial/anual` continua retornando os mesmos valores de `saldo_final` por mês, comparando antes/depois da mudança.

### E2E

Não aplicável — não há suíte E2E no projeto.

## Comandos de validação sugeridos

```bash
cd backend
npx tsc --noEmit

cd "sistema financas"
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Performance**: a nova query soma todo o histórico de lançamentos anteriores a cada chamada, em vez de ler um único valor pré-calculado. Para contas com muitos anos de lançamentos, isso pode ficar mensuravelmente mais lento que a leitura direta de `meses.saldo_final` — recomendável validar com volume de dados real de produção após a implementação, e considerar índice em `(usuario_id, ano, mes)` nas tabelas `receitas`/`despesas` se a query se mostrar lenta (a comparação `(ano * 12 + mes) < chave` já é usada hoje em `isInicioRealDoHistorico`, então o padrão de acesso não é inédito).
- **Perda de "congelamento" histórico**: qualquer edição futura em uma despesa/receita de um mês antigo agora recalcula o saldo de todos os meses seguintes, até o atual — comportamento desejado e confirmado nesta sessão, mas é uma mudança de garantia (antes, "fechar" um mês protegia o número contra alterações futuras).
- **`staging-setup.sql`** fica com uma tabela `meses` de mesmo nome, em schema diferente (`staging`), sem relação com esta remoção — risco técnico não identificado, mas vale reavaliar depois se o ambiente de staging que esse script provisiona ainda estiver ativo.
- **Volume de arquivos tocados** (mais de 15) — risco individual baixo por arquivo, recomenda-se revisar o diff em blocos (backend de cálculo, backend de permissão/schema, frontend de UI, frontend de modo demo) antes de considerar a implementação concluída.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões de arquitetura (cálculo por agregação em vez de recursão, função compartilhada entre as duas rotas, remoção completa da permissão) foram confirmadas nesta sessão de planejamento.

## Critérios de aceite do plano

- Nenhuma rota, componente, schema, permissão, query key ou texto relacionado a "fechar/reabrir mês" permanece no código, backend ou frontend.
- `GET /meses/:ano/:mes/saldo` retorna o mesmo valor numérico que a lógica antiga (baseada na tabela `meses`) retornava para os mesmos dados históricos.
- `GET /financial/anual` continua retornando `saldo_final` correto por mês, sem depender mais da tabela `meses`.
- Nenhuma ação de edição de despesa é mais bloqueada por status de mês.
- Migration de remoção de tabela e coluna está escrita e revisada, mas não executada até confirmação explícita separada do usuário.
- `npx tsc --noEmit` (backend e frontend) e `npx vite build` passam sem erros novos.
- Busca final por `mesFechado`, `accessMonthClosing`, `/meses/.../fechar`, `/reabrir`, `mesStatus` no projeto inteiro não retorna nenhuma ocorrência relacionada ao mecanismo removido.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration SQL sem confirmação explícita separada do usuário — o ambiente pode apontar para produção, e a operação (`DROP TABLE`) é destrutiva e irreversível.
- Fazer uma busca final exaustiva por `mesFechado`, `mesAnteriorFechado`, `accessMonthClosing`, `acesso_fechamento_mes`, `mesStatus`, `/meses/:ano/:mes/fechar` e `/reabrir` em todo o projeto antes de considerar a implementação concluída.
- Não tocar em `backend/config/staging-setup.sql` — fora do escopo deste plano.
- Não implementar o redesenho dos 5 cards de Movimentações — isso é um plano futuro separado, que só deve começar depois desta remoção estar concluída e validada.
- Seguir `AGENT.md` da raiz e `CLAUDE.md` de `sistema financas/`.
- Revisar o diff em blocos (cálculo de saldo, permissão/schema, UI de Movimentações/Despesas, modo demo) antes de considerar a implementação concluída, dado o volume de arquivos tocados.
