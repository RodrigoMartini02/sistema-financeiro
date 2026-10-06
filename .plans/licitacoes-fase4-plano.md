# Plano de Implementação: Licitações — Fase 4 (telas do módulo)

> **Status:** aprovado em 05/10/2026, em **duas partes** (decisão 1): a 4A e a 4B. Cada parte começa com o próprio `/implementar` e termina com conferência e `/finalizar`, que envia o branch sem merge.
>
> **Atualização de 06/10/2026 (aprovada pelo usuário):**
> - O módulo foi para a produção em 06/10, então a 4B foi feita na branch `feat/R/licitacoes-fase4b`, criada a partir da `main`, e não mais no worktree.
> - O código que já estava escrito, sem commit, no worktree foi trazido para essa branch.
> - Depois do aceite, o `/finalizar` faz o merge em `main`.

## Origem

- Arquivo de especificação: `.plans/licitacoes-escopo.md` (v1.3), seções 9.2 a 9.4, 12 e 14 (Fase 4)
- Planos anteriores: `.plans/licitacoes-plano.md`, `.plans/licitacoes-fase2-plano.md` (API) e `.plans/licitacoes-fase3-plano.md` (app base)
- Data do planejamento: `2026-10-05`
- Classificação: `frontend-only` (mais documentação). A API da Fase 2 já atende todas as telas, e o backend não muda.
- Execução: worktree `C:\Users\rodri\Music\fingerence-licitacoes`, branch `feat/R/licitacoes`

Este plano segue o escopo nos detalhes e registra só o que muda ou completa o escopo.

## Resumo

A Fase 4 troca as páginas provisórias da Fase 3 pelas telas de verdade, ligadas à API do módulo. Vai em duas partes:
- **4A, buscar e salvar:** Buscar, Detalhe do edital, Buscas salvas e Início;
- **4B, acompanhar e administrar:** Acompanhamento, Notificações (sino e página) e Configurações (Equipe e Coleta), mais o roteiro completo do escopo.

## Escopo

### Dentro do escopo

**Parte 4A**
- **Buscar** (`/buscar`):
  - **Busca:** campo com dica de aspas e `-exclusão`; "todas as palavras" (E) ou "qualquer palavra" (OU).
  - **Painel de filtros** (gaveta no celular): UF; município com busca na lista de `/domains`; modalidade; valor mínimo e máximo com máscara R$ e "incluir sem valor"; publicação; encerramento, com atalhos de 7, 15 e 30 dias; acompanhamento; órgão por CNPJ.
  - **Estado na URL:** link compartilhável, e o voltar do navegador funciona.
  - **Chips removíveis** e "Limpar tudo".
  - **Barra de resultados:** total, ordenação, cards ou tabela (com opção compacta) e "Salvar esta busca".
  - **Card:**
    - objeto em 2 linhas, com os termos destacados;
    - órgão, município e UF;
    - selos de modalidade, SRP e situação, este só se não for "Divulgada";
    - valor, ou "Não informado";
    - prazo com contagem regressiva;
    - status de acompanhamento e ações rápidas: Analisar, Vou participar, Descartar e Abrir no PNCP.
  - **Paginação:** 20 por página, com opção de 50 e 100.
- **Detalhe do edital:**
  - **Onde abre:** painel lateral sobre a lista (`?edital=<id>` na URL de Buscar) e rota própria `/editais/:id`.
  - **Cabeçalho:** objeto completo, órgão, município e UF, número da compra, processo, "Abrir no PNCP" e "Sistema de origem".
  - **Linha do tempo:** publicação → abertura → encerramento.
  - **Abas:**
    - Resumo;
    - Itens, carregada sob demanda;
    - Arquivos, carregada sob demanda, com links do PNCP;
    - Acompanhamento, com status, observação e histórico.
  - **Buscas salvas** do usuário que batem com o edital.
- **Buscas salvas** (`/buscas`):
  - **Cards:** nome, resumo dos critérios, total de abertos, interruptores "Ativa" e "Notificar".
  - **Ações:** abrir os resultados, editar, duplicar e excluir, com confirmação.
  - **Formulário** (diálogo grande):
    - react-hook-form + zod, com as mesmas regras da API;
    - máscara R$, "incluir sem valor" e SRP indiferente, sim ou não;
    - **prévia ao vivo** com debounce de 500 ms: "X editais abertos batem com esta busca" e os 5 primeiros.
  - **"Salvar esta busca" (em Buscar):** abre o mesmo formulário preenchido com os critérios entendidos (`parsedQuery`) e os filtros em comum. Período, "só abertos" e acompanhamento não entram na busca salva, e o formulário avisa.
- **Início** (`/`):
  - cards Novos hoje, Encerrando em 7 dias, Em análise e Vou participar;
  - "Encerrando em breve", com contagem regressiva;
  - barras de editais abertos por UF (top 10), num componente simples de contagem. O `BarrasHorizontais` do painel financeiro formata valores em R$ e não serve para contagem;
  - "Minhas buscas salvas", com o total de abertos e atalho;
  - rodapé "Última atualização dos dados", em âmbar se a última coleta falhou.

**Parte 4B**
- **Acompanhamento** (`/acompanhamento`):
  - quadro com as colunas Analisar, Vou participar e Descartado;
  - arrastar e soltar nativo e a alternativa por menu ("Mover para…"), para teclado;
  - tabela com filtros e ordenação por prazo;
  - cards destacam prazos próximos.
- **Notificações:**
  - **Painel do sino:** as 10 mais recentes, com as não lidas em destaque, "Marcar todas como lidas" e "Ver todas".
  - **Página** (`/notificacoes`): lista paginada, com filtro por tipo e por lidas ou não lidas.
  - **Clique:** marca como lida e abre o edital, navegando pelo `link` gravado (`/editais/<id>`, relativo à base do app).
- **Configurações** (`/configuracoes`, titular e admin):
  - **Equipe:** colaboradores da conta com o interruptor de acesso, só para o titular.
  - **Coleta:** status da última varredura e do incremental, próxima execução prevista e histórico de execuções em tabela, com totais e erros.
- **Roteiro completo do escopo:** buscar → abrir edital → "Vou participar" → salvar busca → notificação no sino → abrir o edital. Roda no ambiente local, e a notificação é gerada pelo coletor no banco local.

### Fora do escopo

- Exportação (saiu na Fase 2), busca de órgão por nome e filtro de SRP na tela de busca.
- **Configurações → Coleta, "modalidades e UFs coletadas":** a API não expõe isso. Vem das variáveis do coletor, que não ficam no serviço web. Volta se o coletor passar a gravar isso.
- Troca de conta dentro do módulo, app instalável (PWA), página pública e link no rodapé do site.
- Produção, merge em `main` e regras de reescrita da hospedagem, que ficam para a ida à produção.
- Mudanças na API ou no banco.

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`. Não há `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto.
- `.plans/licitacoes-escopo.md` (v1.3), seções 9.2 a 9.4, 12 e 14.
- **Front reaproveitável:**
  - `src/ui/{form,MultiFilterPanel,DateRangeField,drawer,dialog,badge,button,KebabMenu,ConfigSwitch,states,EmptyState}.tsx`;
  - `useMoneyInput`, em `src/ui/dialogFormTokens.tsx`;
  - `src/context/ConfirmContext.tsx` (`useConfirm`);
  - `formatCurrency`, em `src/screens/finance/formatters.ts`;
  - `src/screens/finance/painel/graficos/BarrasHorizontais.tsx`, que não serve: é só para valores em R$.
- **App do módulo da Fase 3:** `src/tenders/**` (moldura, cliente da API, query keys e acesso).
- **Contrato da API da Fase 2:** seção API de `backend/src/modules/tenders/README.md` e `backend/src/modules/tenders/{services,routes}/*.ts`.

## Impacto por área

### Frontend

- **Tipos** (`src/tenders/types.ts`): respostas da API escritas à mão a partir dos serviços da Fase 2. Entre eles: `NoticeListItem`, `NoticeDetail`, `Paginated<T>`, `SavedSearch`, `DashboardView`, `DomainLists`, `NoticeDetailList<T>` e, na 4B, notificações, execuções e equipe.
- **Serviços** (`src/tenders/services/`), todos via `tendersRequest`:
  - `noticesService`: busca, detalhe, itens, arquivos, acompanhamento (PUT e DELETE) e histórico;
  - `savedSearchesService`: lista, criar, alterar, PATCH, excluir, duplicar e prévia;
  - `dashboardService` e `domainsService`;
  - na 4B: `notificationsService`, `collectionService` e `teamService`.
- **Query keys** centralizadas, ampliando `tendersQueryKeys`.
  - Invalidações:
    - acompanhamento → busca, edital, histórico e painel;
    - buscas salvas → lista, painel e o edital aberto;
    - na 4B, notificações → lista e contador.
  - Paginação com `placeholderData` (mantém a página anterior enquanto carrega).
- **Utilitários puros, com testes** (`src/tenders/utils/`):
  - `searchFilters`: URL ↔ estado da busca, com os padrões fora da URL; estado → query da API; chips (rótulo e remoção) e "limpar tudo";
  - `countdown`: rótulo e tom da contagem regressiva (âmbar abaixo de 7 dias, vermelho abaixo de 2, encerrado);
  - `highlight`: marcadores `<<`/`>>` → trechos (texto e destaque), com marcador desparelhado tratado como texto;
  - `savedSearchForm`:
    - schema zod com as regras da API (nome de 1 a 120; ao menos um critério; mínimo ≤ máximo; até 30 termos e 30 exclusões, de 2 a 80 caracteres; UF, IBGE, CNPJ e modalidade válidos);
    - formulário → corpo da API;
    - estado de Buscar → formulário ("Salvar esta busca", com a lista do que não vai junto);
    - resumo dos critérios para o card;
  - conversão de valores R$ (reais ↔ decimal da API);
  - formatação de data e hora em pt-BR a partir do ISO -03:00.
- **Componentes** (`src/tenders/components/`):
  - **4A:** `NoticeCard`, `NoticeTable` (opção compacta guardada no navegador), `CountdownBadge`, `HighlightedText` (sem `dangerouslySetInnerHTML`), `TrackingActions`, `SearchFiltersPanel`, `FilterChips`, `MunicipalityPicker`, `MoneyField` (via `useMoneyInput`), `NoticeDetailContent`, `NoticeDetailDrawer` (usa `Drawer`), `SavedSearchForm`, `SavedSearchCard`, `CountBars` e `DashboardCards`;
  - **4B:** `TrackingBoard` (arrastar nativo e menu), `NotificationsPanel`, `NotificationList`, `TeamList` (`ConfigSwitch`), `CollectionStatusCard` e `RunsTable`.
- **Telas** (`src/tenders/screens/`):
  - **4A:** `HomeScreen`, `SearchScreen`, `NoticeScreen` e `SavedSearchesScreen`;
  - **4B:** `TrackingScreen`, `NotificationsScreen` e `SettingsScreen`;
  - as páginas provisórias da Fase 3 saem à medida que cada tela entra.
- **Provedores:** `ConfirmProvider` entra no `main.tsx` do módulo.
- **Barra superior (4B):** o sino abre o painel em vez de ir direto para a página.
- **Estados** em todas as telas: carregando, vazio com ação sugerida e erro com "tentar de novo". Nas abas do PNCP, "dados desatualizados" (`stale`), "PNCP ainda não tem esta compra" (`foundOnPncp: false`) e "há mais itens no PNCP" (`hasMore`).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Esta fase não tem migration. O roteiro da 4B grava notificações no banco **local** com `tenders:dev -- reprocess-notifications --since <data>`, que é dado de teste e não migration.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- **Novos:**
  - `src/tenders/types.ts`;
  - `src/tenders/services/*Service.ts`;
  - `src/tenders/utils/{searchFilters,countdown,highlight,savedSearchForm,money,dates}.ts`, com testes;
  - `src/tenders/components/**`;
  - `src/tenders/screens/{Home,Search,Notice,SavedSearches}Screen.tsx` (4A) e `{Tracking,Notifications,Settings}Screen.tsx` (4B).
- **Alterados:**
  - `src/tenders/TendersApp.tsx` (rotas reais);
  - `src/tenders/main.tsx` (`ConfirmProvider`);
  - `src/tenders/services/queryKeys.ts`;
  - `src/tenders/layout/TendersTopBar.tsx` (painel do sino, na 4B);
  - `src/tenders/screens/PlaceholderScreens.tsx`, de onde saem as provisórias substituídas.
- **Documentação:** `backend/src/modules/tenders/README.md` (seção do app) e `.plans/licitacoes-plano.md` (registro).

## Estratégia de implementação

**Parte 4A**
1. Tipos, serviços e query keys da 4A.
2. Utilitários com testes: filtros ↔ URL, chips, contagem, destaque, busca salva (schema, corpo, "Salvar esta busca", resumo), valores R$ e datas.
3. Componentes comuns: contagem, destaque, ações de acompanhamento, card, tabela, painel de filtros, chips, município e campo R$.
4. **Buscar:** estado na URL, painel, chips, cards e tabela, ordenação, paginação, ações rápidas e "Salvar esta busca".
5. **Detalhe:** painel lateral em Buscar (`?edital=`), rota `/editais/:id`, abas, itens e arquivos sob demanda, acompanhamento e histórico.
6. **Buscas salvas:** lista, interruptores, ações com confirmação e formulário com prévia ao vivo.
7. **Início:** painel com cards, lista, barras, buscas salvas e última atualização.
8. **Validação:**
   - testes do front, tipos sem erro e build;
   - conferência no navegador com dados reais do banco local (Edge sem janela e prints), no desktop e no celular, nos temas claro e escuro.
9. Registro no plano geral, README e **parada para o aceite da 4A**. O `/finalizar` envia o branch sem merge.

**Parte 4B** (novo `/implementar`, depois do aceite da 4A)

10. Tipos e serviços da 4B.
11. **Acompanhamento:**
    - dados pela busca com `trackingStatus` (os 3 status, `hideDiscarded=false`, `openOnly=false`, ordem por prazo, até 100 por coluna);
    - arrastar nativo e menu "Mover para…" (PUT do acompanhamento);
    - tabela.
12. **Notificações:** painel do sino na barra superior e página com filtros. O clique marca como lida e navega para o `link`.
13. **Configurações:** Equipe (`PUT /team/:userId`) e Coleta (status e histórico paginado), conforme as permissões de `/access`.
14. **Roteiro completo do escopo** no ambiente local:
    - salvar uma busca;
    - rodar `tenders:dev -- reprocess-notifications --since <hoje>` (notificações no banco local);
    - ver no sino e abrir o edital.
15. Validação, prints, registro, README e **parada para o aceite da 4B**. Depois, `/finalizar`.

## Regras de negócio identificadas

Só o que completa o escopo:

- **"Salvar esta busca":**
  - leva os critérios em comum com a busca salva: termos, modo, exclusões, UF, município, órgão, modalidade, faixa de valor e "incluir sem valor";
  - período, "só abertos" e acompanhamento ficam de fora, e o formulário avisa;
  - o modo vem da tela (E por padrão).
- **Contagem regressiva:** âmbar com menos de 7 dias, vermelho com menos de 2; sem prazo, "Sem prazo informado"; vencido, "Encerrado".
- **Ações rápidas:**
  - o mesmo status de novo não muda nada (a API já não grava histórico);
  - "Remover acompanhamento" fica no detalhe.
- **Acompanhamento:** mostra também editais já encerrados que estão acompanhados, porque o quadro é da conta.
- **Configurações:**
  - a aba Equipe aparece só com `permissions.manageTeam`;
  - a aba Coleta aparece com `viewCollectionRuns`;
  - o status da coleta é para todos.
- **Notificação:** o clique marca como lida e navega para o `link` gravado, que é relativo à base do app.
- **Tabela compacta:** preferência do navegador (localStorage), por pessoa.

## Regras multi-tenant e segurança

- O front não decide acesso nem conta: tudo vem da API, que aplica as travas da Fase 2. O `accountId` não é enviado; vale a conta padrão do titular, como na Fase 3.
- Conteúdo do PNCP e da API aparece só como texto. O destaque é montado com elementos React, sem `dangerouslySetInnerHTML`.
- Links externos (PNCP e sistema de origem) com `target="_blank"` e `rel="noopener noreferrer"`.
- Mensagens de erro da API são mostradas como vieram, e elas não vazam dado de outra conta.

## Validações necessárias

- **Formulário de busca salva:** schema zod com as mesmas regras da API, com erro por campo.
- **Filtros da busca:** datas válidas e início ≤ fim; CNPJ só com dígitos (14); valores ≥ 0 e mínimo ≤ máximo, antes de ir para a URL e para a API.
- **Observação do acompanhamento:** até 2.000 caracteres.
- **Erros 400 da API:** a mensagem e os campos voltam para a tela.

## Testes necessários

### Frontend

- **Filtros ↔ URL:**
  - ida e volta com todos os parâmetros;
  - padrões fora da URL;
  - chips e remoção de cada um;
  - "limpar tudo".
- **Contagem regressiva:** limites de 7 e 2 dias, sem prazo e encerrado.
- **Destaque:** trechos marcados, sem marcador e marcador desparelhado.
- **Busca salva:**
  - schema: nome, ao menos um critério, mínimo ≤ máximo e limites de termos;
  - corpo da API;
  - "Salvar esta busca", inclusive a lista do que não vai junto;
  - resumo dos critérios.
- **Valores R$ e datas:** conversões e formatação.
- **4B:** agrupamento do quadro por status e destino do clique na notificação.

### Backend

Sem testes novos. `npm --prefix backend test` entra como regressão.

### E2E

Conferência no navegador em cada parte (Edge sem janela e prints).
- **4A:** fluxo buscar → detalhe → Vou participar → salvar busca → Buscas salvas e Início.
- **4B:** roteiro completo do escopo.

O login de verdade pelo link do módulo fica para o usuário conferir, porque não há senha de usuário local.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit -p tsconfig.json     # sem erro
npm run build
npm --prefix backend test             # regressão (com DOTENV_CONFIG_PATH=../.env.dev no worktree)
npm --prefix backend run tenders:dev -- reprocess-notifications --since AAAA-MM-DD   # só no roteiro da 4B, banco local
```

## Riscos e pontos de atenção

- **Contrato com a API:** os tipos do front são escritos à mão a partir da Fase 2. Divergências aparecem na conferência com dados reais.
- **Estado na URL:** sincronizar filtros, página e painel do edital sem laços de renderização. Cuidado com objetos novos a cada render nos efeitos, como no caso do `LancamentosTable` do app.
- **Arrastar e soltar:** a acessibilidade vem pelo menu "Mover para…". O arrastar nativo não funciona no toque do celular, onde o menu é o caminho.
- **PNCP lento ou fora do ar** nas abas Itens e Arquivos: os estados vêm da API (cópia desatualizada ou 503) e a tela mostra.
- **Tamanho:** a fase é grande. A divisão em 4A e 4B reduz o tamanho de cada revisão.

## Perguntas em aberto

Continuam abertas e não bloqueiam a Fase 4:
- **3:** conta da empresa;
- **4:** Cron Jobs pagos;
- **6:** espaço do Postgres no Render.

## Critérios de aceite do plano

**Parte 4A**
- O fluxo buscar → abrir edital (painel e rota) → Vou participar → salvar busca → ver em Buscas salvas e no Início funciona com dados reais no ambiente local.
- Filtros na URL de ida e volta (link e voltar do navegador), com chips e "Limpar tudo".
- Prévia ao vivo no formulário, e "Salvar esta busca" preenche os critérios e avisa o que não vai junto.
- Abas de itens e arquivos carregam sob demanda e mostram os estados do PNCP.
- Estados de carregando, vazio e erro nas quatro telas.
- Testes do front, tipos sem erro e build passando.
- Telas conferidas no desktop e no celular, nos temas claro e escuro.

**Parte 4B**
- Quadro de acompanhamento com arrastar e com o menu, e a tabela.
- Sino com painel e página de notificações, e o clique abre o edital.
- Configurações com Equipe (só titular) e Coleta.
- Roteiro completo do escopo funcionando no ambiente local, com a notificação gerada pelo coletor.
- Testes do front, tipos sem erro, build e telas conferidas.

**Nas duas partes:** nada em produção, sem merge e sem mudança na API ou no banco.

## Observações para a skill implementar

- Implementar **só a Parte 4A** no primeiro `/implementar` e parar para o aceite. A 4B vem num `/implementar` seguinte.
- Trabalhar no worktree `C:\Users\rodri\Music\fingerence-licitacoes`, no branch `feat/R/licitacoes`.
- Seguir o `CLAUDE.md` e o `AGENT.md`:
  - React Query com query keys centralizadas;
  - sem `fetch` dentro de componente;
  - estados de carregando, vazio e erro;
  - acessibilidade;
  - sem `any`.
- Reaproveitar `src/ui`, `useMoneyInput`, `useConfirm` e `formatCurrency`. Sem biblioteca nova: arrastar e soltar nativo e barras simples.
- Não mexer no backend, no banco, no `.env` nem no app de finanças.
- Commits pequenos, em Conventional Commits e em português.
