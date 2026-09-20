# Plano de Implementação: Corrigir cálculo de saldo (fórmula de parcelas e mistura entre contas)

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature — investigação por 2 agentes Explore + validação humana do modelo de parcelamento)
- Data do planejamento: 2026-09-20
- Classificação: `backend-only`, com uma correção pontual de timing no frontend (item 3)

## Resumo

O usuário relatou inconsistências de dados no fechamento de mês (valores que deveriam ser iguais não batem, problemas de somatória). A investigação identificou três bugs independentes e confirmados:

1. **Fórmula de parcelas errada** — `calculateBalanceBreakdown` (`months.ts`) e `GET /expenses/parcelas-futuras` (`expenses.ts`) dividem o valor da parcela 1 de uma despesa parcelada por `numero_parcelas`. Isso está errado: confirmado com o usuário que cada parcela já grava seu próprio valor individual correto na criação (seja digitado diretamente pelo usuário no modo "valor da parcela", seja derivado do preço à vista já dividido no formulário, no modo "sei o preço à vista" — `ExpenseForm.tsx`). A divisão extra na leitura subestima o saldo de qualquer mês em que caia a parcela 1, e diverge do Painel/Dashboard (`financial.ts`), que soma corretamente sem dividir.

2. **`reserves.ts` nunca filtra por conta** — `AVAILABLE_BALANCE_SQL`/`checkAvailableBalance` sempre agregam receitas, despesas, meses fechados e reservas de **todas as contas** do usuário autenticado (ex.: conta pessoal + conta empresa), incondicionalmente. A função nunca recebeu parâmetro de conta, mesmo quando o chamador já tem essa informação disponível.

3. **Condição de corrida no carregamento inicial** — entre a autenticação e o momento em que `useActiveAccount` resolve e persiste a conta ativa no `localStorage`, o dashboard (disparado imediatamente no mount de `App.tsx` via React Query) já chama `GET /meses/:ano/:mes/saldo` sem `conta_id`. Nessa janela, `months.ts` mistura receitas/despesas de todas as contas do usuário e escolhe arbitrariamente o saldo anterior de uma conta entre várias (a tabela `meses` tem unicidade por `(usuario_id, ano, mes, conta_id)`, então pode haver mais de uma linha por mês).

## Escopo

### Dentro do escopo

- `backend/src/routes/months.ts:57` — remover a divisão condicional por `numero_parcelas`; somar `valor_original`/`valor_pago` diretamente (mesmo padrão já correto de `financial.ts`).
- `backend/src/routes/months.ts:138-141` (`POST /:ano/:mes/fechar`) — remover a aceitação de `saldo_final` arbitrário vindo do body; sempre calcular via `calculateFinalBalance`.
- `backend/src/routes/expenses.ts:713-720` (`GET /parcelas-futuras`) — mesma correção de fórmula.
- `backend/src/routes/reserves.ts`:
  - `AVAILABLE_BALANCE_SQL` — adicionar filtro de conta (mesmo padrão `accountWhere`/fallback de conta pessoal já usado em `months.ts`/`expenses.ts`).
  - `checkAvailableBalance(userId, month, year, amount)` — ganha parâmetro `accountId: number | null`, propagado para a query.
  - `POST /` (linha ~208) — já recebe `conta_id` no body; passar para `checkAvailableBalance`.
  - `POST /:id/move` (linha ~367) — já busca a reserva do banco antes da checagem; usar `reserve['conta_id']` na chamada.
- Frontend: eliminar a janela em que `fetchFinanceDashboard`/`fetchMonthBalance` disparam antes de `contaAtivaId` estar resolvido no `localStorage` — abordagem exata (gate por `enabled`, resolução síncrona antecipada, ou equivalente) a decidir durante a implementação, seguindo o padrão já existente no projeto.
- Levantamento de leitura: identificar quais `(usuario_id, ano, mes)` em `meses` estão com `fechado = true` e têm despesa parcelada com `parcela_atual = 1` no período — apresentar a lista ao usuário para decisão manual de reabrir/refechar.

### Fora do escopo

- Trava de integridade que impeça editar lançamentos de um mês já fechado.
- Recálculo em cascata automático de meses fechados quando um lançamento antigo é alterado.
- Fase 2 do plano de visibilidade de família (fechamento de mês, reservas, calendário, relatórios) — permanece pausada até esta correção ser validada.
- Migration de dados em `despesas` — os valores já gravados estão corretos; o erro está apenas na fórmula de leitura.
- Correção retroativa automática dos `saldo_final` já gravados em meses fechados — apenas levantamento para decisão manual.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo); `backend/AGENT.md`/`frontend/AGENT.md` não existem como arquivos dedicados neste projeto
- Investigação por 2 agentes Explore nesta conversa:
  - A primeira (fórmulas de parcela) partiu de uma suposição incorreta sobre o modelo de gravação, corrigida pelo usuário e revalidada por leitura direta de `ExpenseForm.tsx` (`valorInputMode: 'parcela' | 'avista'`) e `expenses.ts` (`createFutureInstallments`).
  - A segunda (ambiguidade multi-conta) confirmou a condição de corrida no carregamento inicial e a falta estrutural de filtro de conta em `reserves.ts`.
- Leitura direta nesta sessão: `backend/src/routes/months.ts`, `expenses.ts`, `reserves.ts`, `backend/src/utils/accountFilter.ts`, `src/screens/finance/ExpenseForm.tsx`, `src/hooks/useActiveAccount.ts`, `src/services/apiClient.ts`, `src/services/financeService.ts`

## Impacto por área

### Frontend

- Ajuste no fluxo de carregamento inicial (`App.tsx`, `useActiveAccount.ts`, `useFinanceDashboard.ts` ou equivalente) para que a busca de saldo/dashboard só dispare depois que a conta ativa estiver resolvida — ou, alternativamente, que a resolução da conta ativa aconteça de forma síncrona/antecipada no login, eliminando a janela de `getActiveAccountId() === null` com contas já existentes.
- Sem novas telas, componentes ou query keys — ajuste de sequenciamento/timing.
- Estados de loading precisam continuar cobrindo essa janela adicional de espera, se a abordagem escolhida for "aguardar resolução antes de buscar".

### Backend

- `months.ts`: correção pontual de fórmula SQL (linha 57) e remoção de validação insegura (linhas 138-141) — sem mudança de assinatura de função, sem impacto em contrato de API.
- `expenses.ts`: correção pontual de fórmula SQL (linhas 713-720).
- `reserves.ts`: `checkAvailableBalance` e `AVAILABLE_BALANCE_SQL` ganham parâmetro de conta — mudança de assinatura interna, propagada nos 2 call sites já identificados.
- Nenhuma mudança de permissão/autorização; nenhuma nova rota.

### Banco de dados

`Sem impacto esperado` — nenhuma migration necessária. Os dados em `despesas.valor_original` já estão corretos; a correção é de fórmula de leitura e de filtro de conta. O levantamento de meses afetados é uma consulta de leitura (`SELECT`), não uma migration.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/months.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/reserves.ts`
- `src/App.tsx`, `src/hooks/useActiveAccount.ts`, `src/hooks/useFinanceDashboard.ts` (nomes exatos e abordagem a confirmar durante a implementação)

## Estratégia de implementação

1. Corrigir a fórmula em `months.ts:57` (remover divisão condicional por `numero_parcelas`).
2. Remover a aceitação de `saldo_final` arbitrário do body em `months.ts:138-141`.
3. Corrigir a mesma fórmula em `expenses.ts:713-720`.
4. Adicionar parâmetro de conta a `AVAILABLE_BALANCE_SQL`/`checkAvailableBalance` em `reserves.ts`, propagando `conta_id`/`reserve.conta_id` nos 2 call sites.
5. Investigar a forma mais simples de eliminar a janela de corrida no carregamento inicial do frontend, seguindo padrões já existentes no projeto (ex: `enabled` condicional em `useQuery`, ou resolução antecipada da conta ativa).
6. Escrever e rodar a consulta de leitura para levantar meses já fechados potencialmente afetados pela fórmula de parcelas; apresentar a lista ao usuário.
7. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
8. Testar manualmente: saldo de Fechamento de Mês batendo com o Painel para um mês com despesa parcelada; saldo disponível de reservas respeitando a conta ativa para um usuário com conta pessoal + conta empresa; nenhuma chamada de saldo disparando sem `conta_id` durante um login normal.

## Regras de negócio identificadas

- Cada parcela de uma despesa parcelada tem seu próprio valor individual, já correto no momento da gravação — nenhuma fórmula de leitura deve dividir esse valor novamente.
- Saldo disponível de reservas deve ser calculado por conta, nunca agregando contas diferentes do mesmo usuário (pessoal e empresa são carteiras financeiras distintas).
- Cálculo de saldo (mês ou reservas) nunca deve depender de uma condição de timing do frontend — deve sempre operar sobre uma conta explicitamente resolvida.

## Regras multi-tenant e segurança

- Esta correção não envolve family/membros — é inteiramente sobre múltiplas contas do mesmo `usuario_id` (pessoal + empresa), preservando o isolamento já existente entre elas.
- Nenhuma mudança na validação de propriedade de conta (`canWriteToAccount`, já usada em `months.ts`) — a correção apenas garante que o filtro de conta seja aplicado consistentemente em todos os cálculos de saldo.

## Validações necessárias

- Confirmar que a fórmula corrigida em `months.ts`/`expenses.ts` produz o mesmo resultado que `financial.ts` para uma despesa parcelada de teste.
- Confirmar que `checkAvailableBalance` com `accountId` informado não retorna mais valores agregados de outra conta.
- Confirmar que a consulta de levantamento de meses afetados é somente leitura (`SELECT`), sem nenhum `UPDATE`/`INSERT`.

## Testes necessários

### Backend

- Criar uma despesa parcelada (ex: 3x de R$100) e comparar o saldo do mês da parcela 1 (`GET /meses/:ano/:mes/saldo`) com o total do Painel (`GET /financial/anual` ou `/panorama`) para o mesmo mês — devem bater.
- Usuário com conta pessoal + conta empresa: criar reserva/lançamentos em cada conta separadamente e confirmar que `checkAvailableBalance` de uma conta não soma valores da outra.
- `POST /:ano/:mes/fechar` sem enviar `saldo_final` no body (comportamento já correto hoje) continua funcionando; enviar um `saldo_final` arbitrário não deve mais ser aceito.

### Frontend

- Login com uma conta já existente: confirmar (via inspeção de rede) que nenhuma chamada a `/meses/.../saldo` ou `/financial/...` ocorre antes de `conta_id` estar presente na query string.

### E2E

- Fluxo completo: usuário com PF+PJ loga, o dashboard carrega direto com a conta correta, fecha o mês, reabre, fecha de novo, e os valores permanecem consistentes entre Painel e Fechamento de Mês.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Meses **já fechados** mantêm o `saldo_final` gravado com a fórmula antiga até serem reabertos e fechados novamente manualmente — a correção vale para novos fechamentos e para toda consulta dinâmica de saldo (`GET /saldo`), mas não corrige snapshots antigos automaticamente.
- A correção de timing no frontend precisa ser cuidadosa para não travar a tela indefinidamente caso a resolução da conta ativa falhe por algum motivo — garantir um estado de erro/fallback razoável.
- Baixo risco técnico nas correções de fórmula e de `reserves.ts` — são mudanças pontuais e bem localizadas, sem alteração de schema ou contrato de API externo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Saldo de Fechamento de Mês bate com o Painel para qualquer mês com despesa parcelada.
- Saldo disponível de reservas respeita a conta informada, sem misturar contas diferentes do mesmo usuário.
- Nenhuma chamada de saldo/dashboard ocorre sem `conta_id` resolvido durante o carregamento normal da sessão.
- Lista de meses já fechados potencialmente afetados foi levantada e apresentada ao usuário.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.
- Nenhuma migration executada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Este plano precede e bloqueia a retomada da Fase 2 de visibilidade de família (fechamento de mês, reservas, calendário, relatórios) — não misturar os dois escopos.
- Não executar nenhuma migration nem alterar dados diretamente no banco além da consulta de leitura de levantamento.
- Manter as alterações focadas nos três bugs descritos — não aproveitar para adicionar trava de integridade em mês fechado ou recálculo em cascata, que ficaram explicitamente fora do escopo.
- Ao corrigir a fórmula de parcelas, verificar se não há mais nenhuma outra ocorrência do mesmo padrão de divisão condicional em outros arquivos do backend antes de considerar a correção completa.
