# Plano de Implementação: Licitações — busca com prazo mínimo de 3 dias e agenda certa na Coleta

## Origem

- Arquivo de especificação: nenhum. Os pedidos foram feitos na conversa de 06/10/2026, depois da ida da Fase 4B para a produção.
- Data do planejamento: `2026-10-06`
- Classificação: `fullstack` (front do módulo + uma tabela de horários no backend; sem banco de dados)

## Resumo

Dois ajustes no módulo de Licitações:

1. **Prazo mínimo na busca.** A tela Buscar mostra por padrão os editais que ainda recebem proposta, inclusive os que encerram em poucas horas (por exemplo, "Encerra em 4 horas"). Para o usuário, esses não servem, porque não dá tempo de preparar a proposta.
   - Pelos dados da produção em 06/10: dos 24.601 editais abertos, 2.652 encerram em até 24 h, 5.301 em até 48 h e 8.190 em até 3 dias.
   - Decisão do usuário: por padrão, mostrar só os que encerram **a partir de hoje + 3 dias**, com um filtro para incluir os demais.
2. **Agenda certa na aba Coleta.** A aba Coleta (Configurações) calcula a "próxima execução prevista" pela agenda antiga, de 4 Cron Jobs: varredura às 03:00, incremental a cada 2 h e lembretes de hora em hora.
   - A produção roda uma rotina diária às 06:00 (`npm run daily-jobs`), sem incremental.
   - A tela passa a mostrar a agenda real.

## Decisões aplicadas

- **Interpretação de "em andamento":** são os editais que encerram em pouco tempo, opção "a" do usuário. Ficam ocultos por padrão, com um filtro para mostrá-los. Não muda nada para os que já recebem proposta e têm prazo longo.
- **Prazo mínimo:** 3 dias, contados por dia do calendário. Hoje + 3 dias; em 06/10, a partir de 09/10.

## Escopo

### Dentro do escopo

**Busca (só no front do módulo)**
- **Regra padrão em Buscar:** só aparecem editais que encerram a partir de hoje + 3 dias. A regra entra como data mínima no filtro de encerramento (`closingFrom`) que a API já aceita.
- **A regra não vale quando:**
  - o novo filtro **"Incluir os que encerram em menos de 3 dias"** está ligado;
  - **"Só editais abertos"** está desligado (a pessoa quer ver tudo);
  - a busca filtra **editais acompanhados** (Analisar, Vou participar ou Descartado), como nos atalhos do Início "Encerrando em 7 dias", "Em análise" e "Vou participar";
  - o período de encerramento escolhido termina antes de hoje + 3 dias. Nesse caso vale o período escolhido inteiro, o que também evita período invertido, que a API recusa com 400.
- **Período escolhido pela pessoa:** a data mínima só sobe o início dele. Exemplo: "Próximos 7 dias" passa a mostrar do dia +3 ao dia +7, e o aviso indica quantos ficaram de fora.
- **Aviso na barra de resultados:**
  - mostra "N encerram em menos de 3 dias", com o botão **"Mostrar"**, que liga o filtro;
  - vem de uma consulta extra com uma linha por página, só quando a regra esconde algo.
- **No painel de filtros e na tela:**
  - a opção "Incluir os que encerram em menos de 3 dias" fica logo abaixo de "Só editais abertos";
  - chip "Inclui os que encerram em menos de 3 dias", que desliga o filtro;
  - "Limpar tudo" volta ao padrão.
- **No endereço:** `prazoCurto=1` quando o filtro está ligado, para o link compartilhável e o voltar do navegador.

**Coleta (backend e front)**
- **Tabela de horários (`COLLECTION_SCHEDULE`):**
  - varredura e lembretes de prazo às 06:00, todo dia;
  - limpeza às 06:00, aos domingos;
  - incremental sem agenda.
- **Próxima execução (`nextScheduledRun`):** devolve `null` para o tipo sem agenda, e `nextRuns` passa a aceitar `null`.
- **Cards da aba Coleta:** Varredura e Lembretes de prazo, no lugar de Incremental. Sem agenda, a tela mostra "—".

### Fora do escopo

- Buscas salvas: o que é salvo, a contagem "X abertos" dos cards e a prévia do formulário.
- Notificações, o Início (indicadores e listas) e o Acompanhamento.
- Prazo mínimo por horas exatas, que exigiria mudar a API.
- Configurar o número de dias pela tela, porque o mínimo de 3 dias fica fixo numa constante.
- A agenda real do Render, que já está certa, e o comando `daily-jobs`.

## Leitura de contexto

- `/AGENT.md` e `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- Código lido:
  - `src/tenders/utils/searchFilters.ts` (estado, parâmetros da URL, `toApiQuery`, `withFilters`, chips e `closingWithinDays`);
  - `src/tenders/screens/SearchScreen.tsx` (`todayIso` com `getLocalTodayIso`);
  - `src/tenders/components/SearchFiltersPanel.tsx` ("Só editais abertos");
  - `src/tenders/components/DashboardCards.tsx` (atalhos do Início);
  - `src/tenders/utils/trackingBoard.ts` (o quadro usa `openOnly=false`, então a regra não o afeta);
  - `src/tenders/components/CollectionPanel.tsx` e `src/tenders/types.ts`;
  - `backend/src/modules/tenders/services/collectionOverview.ts` e o teste dele;
  - `backend/src/modules/tenders/routes/requestReaders.ts` (`assertDateRange` recusa período invertido);
  - SQL `licitacoes.fn_edital_aberto`, na migration 0076: prazo não vencido e situação 1.
- **Produção, só leitura:**
  - os três primeiros da lista (Inhumas, Tabira e Nova Ubiratã) recebem proposta desde setembro e encerram em 06/10 às 06:59 e 07:00;
  - distribuição dos prazos: 2.652 em até 24 h, 5.301 em até 48 h, 8.190 em até 3 dias e 10.494 em até 7 dias.

## Impacto por área

### Frontend

**`src/tenders/utils/searchFilters.ts`**
- `SearchState` ganha `includeClosingSoon: boolean`, `false` por padrão.
- O parâmetro da URL é `prazoCurto` (`1` quando ligado).
- Constante `MIN_DAYS_TO_CLOSE = 3`.
- Funções puras:
  - `minimumClosingDate(todayIso)`: hoje + 3 dias, em AAAA-MM-DD;
  - `appliesMinimumDeadline(state, todayIso)`: diz se a regra vale (ligada, com abertos, sem filtro de acompanhado e sem período que termina antes do mínimo);
  - `withMinimumDeadline(state, todayIso)`: o estado efetivo, com o início do encerramento elevado ao mínimo quando a regra vale;
  - `closingSoonCountQuery(state, todayIso)`: a query da contagem dos ocultos, do início escolhido (ou sem início) até o dia anterior ao mínimo, com `perPage=1`. É `null` quando a regra não vale ou não esconde nada.
- Chip "Inclui os que encerram em menos de 3 dias".
- `parseSearchParams` e `toSearchParams` tratam `prazoCurto`.

**`src/tenders/screens/SearchScreen.tsx`**
- A busca usa `toApiQuery(withMinimumDeadline(state, todayIso))`.
- `useQuery` da contagem dos ocultos, com a chave `tendersQueryKeys.noticeSearch(query)` e `enabled` só quando há query.
- Na barra: "N encerram em menos de 3 dias · Mostrar".

**`src/tenders/components/SearchFiltersPanel.tsx`**
- `ToggleRow` "Incluir os que encerram em menos de 3 dias", com a descrição "Por padrão, a busca mostra só os que encerram a partir de DD/MM".
- Fica desabilitado com "Só editais abertos" desligado.

**`src/tenders/components/CollectionPanel.tsx`**
- Os cards de resumo passam a ser `['VARREDURA', 'LEMBRETES']`.
- A próxima prevista é tratada como `null`.

**`src/tenders/types.ts`**
- `nextRuns: Record<ScheduledRunType, string | null>`.

### Backend

**`backend/src/modules/tenders/services/collectionOverview.ts`**
- `COLLECTION_SCHEDULE` com a rotina diária: VARREDURA e LEMBRETES às 06:00, LIMPEZA às 06:00 no domingo e INCREMENTAL `[]`.
- `nextScheduledRun` devolve `string | null` (`null` sem agenda).
- O comentário aponta para o Cron Job único (`daily-jobs`, 09:00 UTC).
- O `readLastDataUpdate` não muda: varredura e incremental gravam editais.

**`backend/src/modules/tenders/services/collectionOverview.test.ts`**
- Atualizar para a agenda nova.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado. Nada muda no Render.

## Arquivos provavelmente afetados

- `src/tenders/utils/searchFilters.ts`
- `src/tenders/utils/searchFilters.test.ts`
- `src/tenders/screens/SearchScreen.tsx`
- `src/tenders/components/SearchFiltersPanel.tsx`
- `src/tenders/components/CollectionPanel.tsx`
- `src/tenders/types.ts`
- `backend/src/modules/tenders/services/collectionOverview.ts`
- `backend/src/modules/tenders/services/collectionOverview.test.ts`
- `backend/src/modules/tenders/README.md`

## Estratégia de implementação

1. Criar a branch `feat/R/licitacoes-prazo-minimo-busca` a partir de `main`.
2. **Busca, parte pura:** campo novo, URL, chip, `minimumClosingDate`, `appliesMinimumDeadline`, `withMinimumDeadline` e `closingSoonCountQuery`, com testes.
3. **Busca, telas:** `SearchScreen` (estado efetivo, contagem dos ocultos e aviso com "Mostrar") e `SearchFiltersPanel` (novo filtro).
4. **Coleta:** agenda e `null` no backend, com teste; tipo e cards no front.
5. **README do módulo:** a tabela de parâmetros da URL ganha `prazoCurto`, e a descrição da aba Coleta passa a ser Varredura e Lembretes.
6. **Conferir no navegador** (ambiente local):
   - a contagem cai, o aviso aparece e "Mostrar" funciona;
   - o chip e o voltar do navegador funcionam;
   - "Próximos 7 dias" e um período curto se comportam como o plano diz;
   - os atalhos do Início com acompanhados não são afetados;
   - a aba Coleta mostra os horários novos.
7. Rodar os checks.

## Regras de negócio identificadas

- **Prazo mínimo padrão:** hoje + 3 dias (calendário de Brasília, pela data local do navegador, como os outros filtros de data).
- **Exceções:** a regra não vale com o filtro ligado, sem "Só editais abertos", com filtro de acompanhado, ou com período de encerramento que termina antes do mínimo.
- **Período escolhido:** só tem o início elevado ao mínimo, nunca invertido.
- **Ocultos:** a contagem aparece sempre que a regra esconde algo.
- **Busca salva:** o filtro novo não entra nela, como "Só editais abertos" e o período já não entram.
- **Coleta:** a próxima execução prevista segue a rotina diária às 06:00. O incremental não tem agenda.

## Regras multi-tenant e segurança

- O projeto não é multi-prefeitura. A busca segue a trava de conta do módulo, que não muda.
- O filtro só restringe a consulta. Não há dado novo exposto.

## Validações necessárias

- O estado efetivo nunca gera período de encerramento invertido.
- `prazoCurto` na URL: só `1` liga o filtro; qualquer outro valor vale como desligado.

## Testes necessários

### Frontend

- `withMinimumDeadline`:
  - padrão: o início do encerramento passa a ser o mínimo;
  - início escolhido depois do mínimo: fica como está;
  - período que termina antes do mínimo: a regra não vale;
  - com filtro de acompanhado, sem "Só editais abertos" e com o filtro ligado: a regra não vale.
- `closingSoonCountQuery`: o intervalo certo, `null` quando a regra não vale e `null` quando o início escolhido já é depois do mínimo.
- URL: ida e volta de `prazoCurto`, e o chip com a remoção.

### Backend

- `nextScheduledRun`:
  - varredura e lembretes: a próxima às 06:00, hoje ou amanhã;
  - limpeza: no domingo às 06:00;
  - incremental: `null`.

### E2E

- Conferência no navegador, no ambiente local (passo 6 da estratégia).

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Diferença com o card da busca salva:** a contagem "X abertos" é maior do que a lista aberta por padrão. O aviso "N encerram em menos de 3 dias · Mostrar" explica.
- **Contagem por dia, e não por horas:** perto da meia-noite, um edital que encerra no dia +3 de madrugada ainda aparece. É aceitável e segue os outros filtros de data.
- **Consulta extra da contagem dos ocultos:** é leve (uma linha) e só roda quando a regra esconde algo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- a tela Buscar, por padrão, não mostrar editais que encerram antes de hoje + 3 dias, e o aviso com "Mostrar" trouxer esses de volta;
- as exceções da regra se comportarem como o plano diz, inclusive os atalhos do Início;
- a aba Coleta mostrar Varredura e Lembretes, com a próxima execução às 06:00;
- os testes e checks de front e backend passarem.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não mudar a API de busca nem o banco.
- Não executar migrations (não há nenhuma).
- Seguir o padrão de `searchFilters.ts`: funções puras com testes e a URL em português.
- React Query com chaves centralizadas.
