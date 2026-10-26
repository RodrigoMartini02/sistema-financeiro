# Plano de Implementação: lista infinita virtualizada e cartão padrão nas Licitações

## Origem

- Arquivo de especificação: nenhum. O pedido veio da conversa de 26/10/2026: trocar o "Por página" por "começar com 50 e carregar mais ao rolar, para todo o sistema"; depois, "usar a virtualização", "padronizar os cartões iguais em todas as telas, usando o modelo de Buscar" e "eliminar a alternância para tabela e compacta".
- Planos relacionados: `.plans/licitacoes-pagina-cnpj.md` (a lista de licitações vencidas do CNPJ), `.plans/licitacoes-base-nacional.md` (Parte 7, telas) e `.plans/licitacoes-contratos-a-vencer.md` (a tela de Contratos).
- Data do planejamento: `2026-10-26`
- Classificação: `frontend-only`. Sem banco, sem migration, sem `.env`, sem deploy especial. Uma dependência nova (`@tanstack/react-virtual`) e um ajuste no README do módulo. Custo de infraestrutura: US$ 0.

## Situação

**IMPLEMENTADO em 26/10/2026**, na branch `feat/R/licitacoes-lista-infinita`, **sem commit** (falta o `/finalizar`). Conferido: `tsc --noEmit` sem erro, `npm test` com 436 testes passando (10 novos: `infiniteList.test.ts` e `listCache.test.ts`) e `npx vite build`. **Falta ele ver as telas** (o projeto não tem teste de componente; o roteiro manual está na seção "Testes necessários").

Como ficou, onde diferiu do plano:
- **Posição ao voltar do detalhe:** guardada na memória do navegador (um `Map` por entrada do histórico, `location.key`, no máximo 20), com o `scrollOffset` e o `takeSnapshot()` do virtualizador (`initialOffset` e `initialMeasurementsCache`, que a versão instalada, `@tanstack/virtual-core` 3.19.8, tem), em vez de guardar só o índice do primeiro item: assim o ponto volta exato, com as alturas já medidas. Só vale com a lista ainda em cache; sem isso, a lista abre onde a janela já estava (o virtualizador rola a janela até o `initialOffset` ao montar, então o padrão é `window.scrollY`, para a lista do meio da página, como Vencedores do CNPJ, não puxar a pessoa para o topo).
- **Consulta sem página:** `page` e `perPage` saem do estado e da URL; `toApiQuery` e `toContractApiQuery` devolvem a consulta sem eles, e `withPaging(consulta, { page, perPage })` (em `utils/infiniteList.ts`) os acrescenta. `favoritesApiQuery()` e `contractFavoritesApiQuery()` não recebem mais argumentos.
- **Chaves de cache:** `noticeInfiniteList`, `contractInfiniteList` e `notificationInfiniteList` (terceiro item `infinite`), `cnpjWinners(cnpj)` e `collectionRuns` sem página. `isInfiniteListKey` está em `services/queryKeys.ts`.
- **Cache de favorito e acompanhamento** (`services/listCache.ts`): o item muda nas listas em cache; as listas filtradas por favorito (`favoritesOnly=true`) ou por acompanhamento (`trackingStatus`) são relidas, porque o item que sai muda a posição dos seguintes. **Mudança de comportamento:** em Buscar, "Descartar" com a opção padrão de esconder descartados não tira mais o card da lista na hora; ele fica marcado como Descartado (e dá para desfazer) até a lista ser recarregada ou a busca mudar. Tirar o item na hora deixaria um edital sem aparecer na fronteira entre duas páginas.
- **Cartão:** `ListCard` e `ListCardLine` (`components/ListCard.tsx`). Quando não há selos, a ação do canto fica ao lado do título (buscas salvas). Buscas salvas ficam na grade de 2 a 3 colunas e não são virtualizadas.
- **Apagados:** `Pagination.tsx`, `NoticeTable.tsx`, `ContractTable.tsx`, `TrackingTable.tsx`, `useStoredPreference.ts`, `screenLayout.ts`, `PER_PAGE_OPTIONS`, `DEFAULT_PER_PAGE`, `CNPJ_WINNERS_PER_PAGE_OPTIONS` e o `compact` do `NotificationItem`.
- **Dependência:** `@tanstack/react-virtual` 3.14.23 (`package.json` e `package-lock.json`, só as duas entradas novas).

## Resumo

Todas as listas de Licitações que hoje têm paginação passam a ter rolagem infinita: a lista começa com 50 itens e carrega mais 50 quando a pessoa chega perto do fim. A lista é virtualizada (só os cartões visíveis ficam na tela), para aguentar milhares de itens. Somem o seletor "Por página", os botões Anterior e Próxima, a alternância Cards/Tabela e o botão Compacta. Os cartões das telas de dados passam a usar um cartão-base único, extraído do cartão do Buscar, para o sistema ter um só jeito de mostrar um item de lista.

## Decisões do usuário

Respondidas neste planejamento (26/10/2026):

1. **Escopo:** todas as listas que hoje têm paginação: Buscar (editais), Contratos, Favoritos (as duas abas), Notificações (página), Vencedores do CNPJ e o histórico de execuções da Coleta. O `Pagination.tsx` é apagado.
2. **Carregamento:** automático ao rolar, sem botão.
3. **Virtualização:** sim, desde já, com `@tanstack/react-virtual`.
4. **Cartão-base do Buscar** em: editais, contratos, vencedores, buscas salvas (editais e contratos), notificações (página) e execuções da Coleta. Ficam como estão: Equipe, Admin › contas, Início, o painel do sino e o quadro de Acompanhamento.
5. **Acompanhamento:** sai a tabela e o botão Quadro/Tabela; o quadro fica como está (cartões estreitos, arrastar e soltar, até 100 por coluna).
6. **Pedido extra:** sem alternância Cards/Tabela e sem modo Compacta em Buscar, Contratos e Coleta.

Assumido sem decisão (o usuário pode corrigir):

- **Lote de 50 em todas as listas**, inclusive Vencedores do CNPJ, que hoje tem 10 por página. O backend já aceita 50 (`MAX_CNPJ_WINNERS_PER_PAGE = 50`; as demais rotas aceitam até 100).
- **Buscas salvas mantêm a grade de 2 a 3 colunas** em telas largas (poucas, limite `MAX_SAVED_SEARCHES`, com interruptores): o cartão é o mesmo, só o arranjo na página é diferente. Não são virtualizadas nem infinitas, porque a lista já vem inteira.
- **Trocar de aba nos Favoritos** recomeça a lista do topo, com 50.
- As preferências antigas guardadas no navegador (`licitacoes.buscar.visao`, `licitacoes.buscar.tabela`, `licitacoes.contratos.visao`, `licitacoes.contratos.tabela`, `licitacoes.acompanhamento.visao`) ficam sem uso e inofensivas. Não há limpeza delas.

## Escopo

### Dentro do escopo

- **Rolagem infinita virtualizada** nas seis listas da decisão 1, com lote de 50.
- **Cartão-base `ListCard`** e seu uso em editais, contratos, vencedores, buscas salvas (as duas), notificações (página) e execuções da Coleta.
- **Remover** a alternância Cards/Tabela e o botão Compacta (Buscar e Contratos), as tabelas (`NoticeTable`, `ContractTable`, `TrackingTable` e a tabela do histórico da Coleta) e o botão Quadro/Tabela do Acompanhamento.
- **URL sem `pagina` e `porPagina`** nas telas de lista; links antigos com esses parâmetros abrem do início.
- **Coração e acompanhamento** passam a atualizar o item na lista em cache, em vez de reler todas as páginas já carregadas.
- **Voltar ao topo** quando o filtro ou a ordem mudam.
- **Restaurar a posição da rolagem** ao voltar de uma página de detalhe (melhor esforço).
- **Limpeza** do que ficar sem uso e atualização do README do módulo.
- Testes das funções novas e das que mudam.

### Fora do escopo

- Mudar o backend, as rotas, o tamanho máximo de página ou as consultas do armazém.
- Equipe, Admin › contas, Início, painel do sino e quadro de Acompanhamento (os cartões e o formato próprio deles ficam).
- Carregar mais itens por coluna no quadro de Acompanhamento (o corte em 100 por coluna fica como está).
- Telas de Finanças e de outros módulos (não têm paginação).
- As listas curtas fixas da página do CNPJ (10 contratos e 10 editais) e o resumo do Início.
- Limpar as preferências antigas do navegador.
- Virtualizar as buscas salvas.

## Leitura de contexto

- `/AGENT.md` (raiz) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem** no projeto; vale o `/AGENT.md` da raiz (código em inglês, textos em português, sem `any`, sem `catch` silencioso, nomes claros).
- `backend/src/modules/tenders/README.md` (tabelas de parâmetros da URL e a descrição da paginação).
- Front lido: `components/Pagination.tsx`, `NoticeCard.tsx`, `ContractCard.tsx`, `WinnerCard.tsx`, `SavedSearchCard.tsx`, `ContractSearchCard.tsx`, `NotificationItem.tsx`, `TrackingBoard.tsx`, `TrackingTable.tsx`, `CnpjLists.tsx` e `CollectionPanel.tsx` (`RunsHistory`); `screens/SearchScreen.tsx`, `ContractsScreen.tsx`, `FavoritesScreen.tsx`, `NotificationsScreen.tsx`, `TrackingScreen.tsx` e `SavedSearchesScreen.tsx`; `layout/TendersShell.tsx`; `services/queryKeys.ts` e `noticesService.ts`; `hooks/useNoticeFavorite.ts`; `utils/searchFilters.ts`, `contractFilters.ts`, `trackingBoard.ts` e `screenLayout.ts`.
- Backend lido (só para confirmar que não muda): `routes/validators.ts` (`MAX_PER_PAGE = 100`; `MAX_CNPJ_WINNERS_PER_PAGE = 50`), `requestReaders.ts`, `cnpj.ts` e `overview.ts`.
- Conferências feitas no planejamento (só leitura, 26/10/2026):
  - a página rola pela janela: o `<main>` do `TendersShell` não tem contêiner de rolagem próprio, e as telas usam `window.scrollTo`; por isso vale o virtualizador de janela;
  - em Buscar e Contratos o detalhe abre num painel (`?edital=`, `?contrato=`) por cima da lista, que continua montada: a posição da rolagem se preserva. Em Favoritos, Notificações e Vencedores do CNPJ o detalhe é uma página inteira;
  - `@tanstack/react-virtual` 3.14.23: peer `react` de 16 a 19, sem `engines` declarado (compatível com o Node 22.17 do `/AGENT.md`);
  - não há `useInfiniteQuery` em nenhum lugar do front hoje;
  - o `compact` do `NotificationItem` não é passado por nenhum chamador (o sino tem o componente próprio `PanelNotification`);
  - `useStoredPreference` só é usado por Buscar, Contratos e Acompanhamento; `useTelaDesktop` também é usado por `AppShell` e `CartaoTab`, e fica;
  - `SCREEN_MIN_HEIGHT_CLASS` só existe para descer a paginação até o rodapé (usado por Buscar, Contratos e Favoritos);
  - os testes são só de funções (`tsx --test src/tenders/**/*.test.ts`); não há teste de componente.

## Impacto por área

### Frontend

**Dependência.** `@tanstack/react-virtual` (versão atual 3.14.x), instalada com `npm install`, conferindo o `package-lock.json`. Sem `--force` e sem mexer em outras versões.

**Montador da consulta** (`utils/searchFilters.ts`, `contractFilters.ts`, `cnpjPage.ts`, `trackingBoard.ts`):
- `page` e `perPage` saem de `SearchState`, `ContractSearchState`, `parseSearchParams`, `toSearchParams`, `withFilters` e `withContractFilters` (e das constantes de URL `pagina` e `porPagina`);
- `toApiQuery(state, paging)` e `toContractApiQuery(state, paging)` recebem a página como argumento, com padrão `{ page: 1, perPage: LIST_PAGE_SIZE }` (50);
- quem usa tamanho próprio passa o argumento: `closingSoonCountQuery` (1 e 1), `trackingColumnQuery` (1 e 100, `BOARD_COLUMN_LIMIT`), `cnpjContractsApiQuery` e `cnpjNoticesApiQuery` (1 e 10, `CNPJ_LIST_SIZE`);
- `favoritesApiQuery` e `contractFavoritesApiQuery` deixam de receber página e tamanho.

**`utils/infiniteList.ts` (novo, funções puras e testáveis):**
- `LIST_PAGE_SIZE = 50`, a única definição do lote;
- `nextPageNumber(lastPage)`: `page + 1` enquanto `page < totalPages`, senão `undefined`;
- `flattenPages(pages, getKey)`: junta as páginas e tira repetidos pela chave do item, mantendo a primeira ocorrência (a API pagina por posição, e um item pode repetir se a base mudar durante a rolagem);
- `patchListItems(data, matches, patch)`, `removeListItems(data, matches)` e o ajuste do `total`, para o cache (ver "Cache" abaixo).

**`hooks/useInfiniteList.ts` (novo):** envolve `useInfiniteQuery` (`initialPageParam: 1`, `getNextPageParam`, `placeholderData: keepPreviousData` para a lista antiga ficar esmaecida enquanto a nova chega, como hoje). Devolve `items` (já sem repetidos), `total`, `parsedQuery` da primeira página (quando houver), `isPending`, `isError`, `error`, `isFetching`, `isPlaceholderData`, `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`, `nextPageError` e `refetch`. O `refetchInterval` das telas de contratos (a "atualização do armazém") só vale enquanto a primeira página não chegou; um erro numa página seguinte vira "Tentar de novo" no rodapé, sem reler tudo.

**`components/VirtualCardList.tsx` (novo):** a lista virtualizada.
- Usa `useWindowVirtualizer` com `scrollMargin` (a distância do topo da lista até o topo da página), `overscan` de cerca de 6, `estimateSize` próximo da média (cerca de 176 px) e `gap`; cada linha é medida (`measureElement`), porque o cartão tem altura variável.
- Recebe `items`, `getKey`, `renderItem`, `total`, `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`, `nextPageError` e `onRetry`.
- Quando um dos últimos 5 itens aparece e há próxima página, sem carga nem erro em andamento, chama `fetchNextPage`.
- Rodapé: "Mostrando N de T", "Carregando…", "Fim da lista" e, no erro, a mensagem com "Tentar de novo". O rodapé fica em região `aria-live="polite"`.
- Acessibilidade: contêiner com `role="list"`, linhas com `role="listitem"`, `aria-setsize` (o total) e `aria-posinset` (a posição).
- Guarda `window.scrollY` num `sessionStorage` (com `try/catch`, como o app já faz com `localStorage`), por rota da lista, e restaura na volta quando as páginas ainda estão em cache. Se a restauração não ficar firme, a lista volta ao topo, e isso é registrado.

**`components/ListCard.tsx` (novo), o cartão-base.** A casca do cartão do Buscar (`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`, com o escuro e o `hover`), com encaixes: selos (à esquerda do topo), ação do topo (à direita: coração, menu de três pontos), título (nó; normalmente o link com `line-clamp-2`), linhas de contexto (`truncate`), métricas (lista `dl` de rótulo e valor), rodapé de ações (com a borda de cima). Variações por propriedade: `muted` (borda tracejada, para a busca salva pausada) e `highlighted` (fundo de destaque, para a notificação não lida). O cartão não tem comportamento de clique; cada tela encaixa o seu.

**Cartões por tela (cada um vira um fino preenchedor do `ListCard`):**
- `NoticeCard`, `ContractCard`, `WinnerCard`: o conteúdo de hoje, nos encaixes (a casca copiada três vezes sai).
- `SavedSearchCard`, `ContractSearchCard`: nome e selo "Pausada" nos selos e no título, critérios nas linhas, "N editais abertos" e "Ver editais" nas métricas e ações, menu editar, duplicar e excluir no canto do topo, interruptores "Ativa" e "Notificar" no rodapé.
- Notificação (página): o tipo e a data como selos, o título como botão que cobre o cartão (o clique continua marcando como lida e abrindo o edital ou o contrato), a mensagem em até 3 linhas, `highlighted` quando não lida. O `compact` do `NotificationItem` sai.
- Execução da Coleta: o tipo no título, o status (`RunStatusPill`) nos selos, "início · duração" no contexto, e as métricas Lidos, Novos, Atualizados, Notificações e Erros (as colunas da tabela de hoje). A tabela do desktop e o cartão curto do celular saem; vale o mesmo cartão em todos os tamanhos.

**Telas:**
- `SearchScreen` e `ContractsScreen`: saem `view`, `density`, `isDesktop`, `VIEW_OPTIONS`, `DENSITY_OPTIONS`, o `ToggleGroup` Cards/Tabela, o botão Compacta, `NoticeTable`, `ContractTable`, `goToPage`, `Pagination`, o estado vazio "Esta página não tem…" (não existe mais página vazia) e o `mt-auto`. A lista passa a `useInfiniteList` e `VirtualCardList`. O "Salvar esta busca" usa o `parsedQuery` da primeira página. O `ToggleGroup` continua só para o modo de termos (E/OU).
- `FavoritesScreen`: o `FavoritesList` genérico passa a usar a lista infinita; a aba e a URL ficam como estão (sem `pagina` e `porPagina`).
- `NotificationsScreen`: sai o estado de página e tamanho; os filtros de tipo e "não lidas" entram na chave da consulta.
- `CnpjWinnersList` (`CnpjLists.tsx`): sai o `Pagination`, o `topRef` e a escolha de tamanho; lote de 50. As listas curtas do CNPJ (10 contratos e 10 editais) não mudam.
- `CollectionPanel` › `RunsHistory`: a lista infinita com `ListCard`; sai o `useTelaDesktop` dali.
- `SavedSearchesScreen`: só troca os cartões.
- `TrackingScreen`: saem `view`, `VIEW_OPTIONS`, o `ToggleGroup` Quadro/Tabela, `showTable`, `TrackingTable` e `useStoredPreference`. O `useTelaDesktop` fica, só para o texto "Arraste um card…".

**Chaves de cache (`services/queryKeys.ts`):**
- novas chaves das listas infinitas dentro dos mesmos grupos (por exemplo `['tenders', 'notices', 'list', apiQuery]`, `['tenders', 'contracts', 'list', apiQuery]`, uma para notificações, uma para vencedores do CNPJ e uma para as execuções da Coleta), porque o formato dos dados é diferente do `useQuery` e não pode dividir chave com ele;
- todas ficam sob o prefixo `['tenders', ...]`, para a troca de conta continuar invalidando tudo (`tendersQueryKeys.all`);
- `noticeSearch` e `contractSearch` continuam (contagem do prazo mínimo, quadro de Acompanhamento e listas curtas do CNPJ); `cnpjWinners(cnpj, page, perPage)`, `collectionRuns(page, perPage)` e a de página das notificações saem se ficarem sem uso.

**Cache depois de favoritar ou acompanhar** (`useNoticeFavorite`, `useContractFavorite`, `useNoticeTracking`): hoje o `onSuccess` invalida o grupo inteiro, e numa lista infinita isso relê todas as páginas carregadas, uma por vez. Passa a ser:
- atualizar o item em todas as listas infinitas em cache (`setQueriesData` com as funções puras de `infiniteList.ts`, que só tocam dados em formato de lista infinita);
- na lista de Favoritos, o item que deixou de ser favorito sai dela e o `total` diminui;
- invalidar o restante do grupo como hoje (detalhe, histórico, painel), mas sem reler as listas infinitas ativas (por exemplo com `predicate` que ignora as chaves `list`).

**Limpeza (apagar o antigo, como pede a regra de "sem sobreposição"):** `components/Pagination.tsx`, `NoticeTable.tsx`, `ContractTable.tsx`, `TrackingTable.tsx`, `hooks/useStoredPreference.ts`, `utils/screenLayout.ts` (se ficar sem uso), `PER_PAGE_OPTIONS`, `DEFAULT_PER_PAGE`, `CNPJ_WINNERS_PER_PAGE_OPTIONS`, imports e utilitários que só as tabelas usavam, e as menções a "tabela", "compacta" e "por página" em textos do app, README e comentários.

### Backend

Sem impacto esperado. A API já recebe `page` e `perPage` (máximo 100; 50 nos vencedores do CNPJ) e devolve `total` e `totalPages`. O front passa a mandar sempre `perPage=50` e `page` crescente. Só o README do módulo muda (ver abaixo).

### Banco de dados

Sem impacto esperado. Não há migration.

### Infra/Deploy

Sem impacto esperado. Sem variável de ambiente nova, sem job. É só o build do site (`npx vite build`); a conferência no ar segue o procedimento de sempre (nome do pacote `tenders-*.js` no ar e uma frase nova nele).

## Arquivos provavelmente afetados

Novos:
- `src/tenders/components/ListCard.tsx`
- `src/tenders/components/VirtualCardList.tsx`
- `src/tenders/hooks/useInfiniteList.ts`
- `src/tenders/utils/infiniteList.ts` e `infiniteList.test.ts`

Alterados:
- Telas: `screens/SearchScreen.tsx`, `ContractsScreen.tsx`, `FavoritesScreen.tsx`, `NotificationsScreen.tsx`, `TrackingScreen.tsx`, `SavedSearchesScreen.tsx`.
- Componentes: `components/CnpjLists.tsx`, `CollectionPanel.tsx`, `NoticeCard.tsx`, `ContractCard.tsx`, `WinnerCard.tsx`, `SavedSearchCard.tsx`, `ContractSearchCard.tsx`, `NotificationItem.tsx`, `LoadStates.tsx` (se o rodapé reaproveitar algo).
- Hooks, serviços e utilitários: `hooks/useNoticeFavorite.ts`, `useContractFavorite.ts`, `useNoticeTracking.ts`, `services/queryKeys.ts`, `utils/searchFilters.ts`, `contractFilters.ts`, `cnpjPage.ts`, `trackingBoard.ts`, `tabs.ts` (parâmetros da aba dos Favoritos).
- Testes: `utils/searchFilters.test.ts`, `contractFilters.test.ts`, `cnpjPage.test.ts` e, se preciso, `trackingBoard.test.ts` e `notifications.test.ts`.
- Documentação e pacote: `backend/src/modules/tenders/README.md`, `package.json` e `package-lock.json`.

Apagados: `components/Pagination.tsx`, `NoticeTable.tsx`, `ContractTable.tsx`, `TrackingTable.tsx`, `hooks/useStoredPreference.ts` e `utils/screenLayout.ts` (se ficar sem uso).

## Estratégia de implementação

Uma branch, `feat/R/licitacoes-lista-infinita`, a partir da `main`, com um commit por etapa:

1. **Base.** Instalar `@tanstack/react-virtual`. Criar `infiniteList.ts` (com os testes), `useInfiniteList`, `VirtualCardList` e `ListCard`. Tirar `page` e `perPage` do estado e da URL e passar a página como argumento do montador da consulta, atualizando os testes de `searchFilters`, `contractFilters` e `cnpjPage`. Criar as chaves novas.
2. **Buscar, Contratos e Favoritos.** Trocar para a lista infinita virtualizada, remover Cards/Tabela, Compacta, `NoticeTable`, `ContractTable` e `Pagination` dessas telas, e voltar ao topo quando filtro ou ordem mudam. Trocar a atualização do cache dos corações e do acompanhamento. Restaurar a posição ao voltar.
3. **Vencedores do CNPJ, Notificações e Coleta.** Lista infinita nas três; a Coleta perde a tabela.
4. **Cartão padrão.** `NoticeCard`, `ContractCard`, `WinnerCard`, `SavedSearchCard`, `ContractSearchCard`, a notificação e a execução da Coleta passam a preencher o `ListCard`.
5. **Acompanhamento.** Remover a tabela e o botão Quadro/Tabela.
6. **Limpeza e documentação.** Apagar os arquivos e constantes sem uso, procurar menções a "tabela", "compacta" e "por página" em textos, atualizar as tabelas de parâmetros da URL do README (tirar `pagina` e `porPagina`; a frase de que a API pagina "com 20 por página e no máximo 100" continua verdadeira, porque a API não muda).
7. **Validação.** `npx vite build` e `npm test`, um de cada vez, e o roteiro manual.

Se o usuário preferir duas entregas, o corte natural é entre as etapas 2 e 3: primeiro a base com Buscar, Contratos e Favoritos, depois o resto e a padronização dos cartões.

## Regras de negócio identificadas

- A lista começa com 50 itens e carrega mais 50 por vez; o total aparece no rodapé ("Mostrando N de T").
- Mudar busca, filtro ou ordem recomeça a lista do topo, com 50.
- A URL das telas de lista não guarda página nem tamanho; guarda só os filtros, a ordem, a aba e o item aberto no painel.
- Não existe visão em tabela nem densidade compacta em nenhuma lista de Licitações. O quadro de Acompanhamento tem uma só visão.
- O cartão de um item de lista tem sempre a mesma estrutura: selos e ação no topo, título, contexto, métricas e ações.
- O contrato ou edital favorito que deixa de ser favorito sai da lista de Favoritos na hora.
- A notificação não lida continua em destaque, e o clique continua marcando como lida e abrindo o edital ou o contrato.
- A busca salva pausada continua com a borda tracejada e o selo "Pausada".

## Regras multi-tenant e segurança

- O módulo é por conta (não por prefeitura): o backend continua filtrando tudo pela conta da sessão e pelas travas do módulo (404, 403, 402) e o limite de pedidos. Nada disso muda; o front não passa a mandar nenhum identificador novo.
- As chaves de cache novas ficam sob `['tenders', ...]`, para a troca de conta invalidar todas as listas e nenhuma lista de uma conta aparecer em outra.
- A posição da rolagem guardada no `sessionStorage` é só um número por rota; não guarda dados de editais, contratos ou pessoas.
- Cada página nova é um pedido a mais por rolagem. O limite de 60 pedidos por minuto por pessoa nas rotas de CNPJ e as demais travas continuam valendo; o lote de 50 reduz o número de pedidos em relação ao de 20.
- Nenhuma mensagem de erro nova vaza dado: o rodapé mostra a mensagem que a API já devolve.

## Validações necessárias

- `perPage` mandado à API é sempre 50 nas listas infinitas (dentro do máximo de 100, e de 50 nos vencedores do CNPJ); `page` é sempre um inteiro maior que zero.
- Parâmetros `pagina` e `porPagina` que ainda vierem numa URL antiga são ignorados, sem erro.
- Itens repetidos entre páginas são removidos pela chave do item: o `id` do edital, a chave do contrato (`pncpControlNumber`), o `purchaseControlNumber` do vencedor, o `id` da notificação e o `id` da execução.
- `getNextPageParam` devolve `undefined` quando `page >= totalPages`, e o rodapé mostra "Fim da lista".

## Testes necessários

### Frontend (automáticos, `tsx --test`)

- `infiniteList.test.ts` (novo): próxima página (com e sem mais páginas), junção de páginas sem repetidos mantendo a ordem, atualização de um item, remoção de um item com ajuste do `total`, e o formato que não é lista infinita ficando intacto.
- `searchFilters.test.ts` e `contractFilters.test.ts`: o estado e a URL sem `page` e `perPage`; `toApiQuery` e `toContractApiQuery` com o argumento de página (padrão 1 e 50); URL antiga com `pagina` e `porPagina` ignorada; `clearAll` sem `perPage`; `favoritesApiQuery` e `contractFavoritesApiQuery` sem parâmetros.
- `cnpjPage.test.ts`: as listas curtas continuam pedindo 10, agora pelo argumento.
- `trackingBoard.test.ts`: a coluna continua pedindo 100.
- `notifications.test.ts`: o painel do sino continua pedindo 10.

### Backend

- Nenhum teste novo. A API não muda; os testes existentes servem de rede.

### E2E (manual, porque o projeto não tem teste de componente)

Roteiro, nos temas claro e escuro, no desktop e no celular:
- **Buscar e Contratos:** abrem com 50; rolar carrega mais; chegar ao fim mostra "Fim da lista"; mudar filtro ou ordem volta ao topo; abrir e fechar o painel de detalhe preserva a posição; o coração e o acompanhamento atualizam o item sem recarregar a lista; "Salvar esta busca" continua funcionando.
- **Favoritos:** as duas abas; descurtir tira o item da lista; abrir um item e voltar reaparece no mesmo ponto (ou no topo, se a restauração não ficar firme).
- **Notificações:** filtros de tipo e "não lidas"; o clique marca como lida e abre o edital ou o contrato.
- **Vencedores do CNPJ:** a lista no meio da página carrega ao rolar até o fim dela; as listas curtas do CNPJ seguem iguais.
- **Coleta:** o histórico em cartões, sem tabela, no desktop e no celular.
- **Buscas salvas:** os dois tipos com o cartão padrão, o menu e os interruptores, e a grade de 2 a 3 colunas.
- **Acompanhamento:** o quadro sem o botão Quadro/Tabela, e arrastar e "Mover para…" funcionando.
- **Falhas:** uma página que falha mostra "Tentar de novo" sem perder as anteriores; a lista de 1.000 itens ou mais rola sem travar.
- **Teclado e leitor de tela:** o foco e o anúncio do rodapé funcionam.

## Comandos de validação sugeridos

Um de cada vez (o computador não tem arquivo de paginação):

```bash
npm test
npx vite build
```

Se o `tsc` for um passo à parte do build do projeto, rodá-lo também. O backend não muda, então `npm --prefix backend run build` não é necessário.

## Riscos e pontos de atenção

1. **Ctrl+F do navegador** só acha o que está desenhado na tela; a busca do sistema continua filtrando por termo.
2. **Voltar de uma página inteira de detalhe** (Favoritos, Notificações, Vencedores do CNPJ): hoje a página fica na URL e volta no mesmo ponto; na lista infinita, a posição é restaurada em regime de melhor esforço, e volta ao topo se não ficar firme. Buscar e Contratos não sofrem isso (o detalhe abre num painel).
3. **Altura variável dos cartões** pode dar um salto de rolagem quando um cartão é medido. Mitigação: estimativa próxima da média e medição por linha.
4. **Ao voltar a uma lista longa**, o React Query pode reler as páginas carregadas, uma por vez, mostrando o cache na hora. Se pesar na prática, um `staleTime` curto nas listas.
5. **Acessibilidade** da lista virtualizada: posição, tamanho e anúncio do rodapé precisam ser conferidos com teclado e leitor de tela.
6. **Painel de detalhe aberto** pode mexer na rolagem da janela (o painel pode travar a rolagem do corpo da página). Conferir na implementação.
7. **Vencedores do CNPJ** ficam no meio de uma página com outras seções: conferir o carregamento ao chegar ao fim da lista e o que vem depois dela.
8. **Itens repetidos ou faltando** se a base mudar entre duas páginas (paginação por posição): a junção remove repetidos; a falta se resolve ao recarregar.
9. **Tamanho da mudança:** cerca de 25 arquivos e sem teste de componente. Mitigação: um commit por etapa, o roteiro manual e a possibilidade de dividir em duas entregas.
10. **Dependência nova:** mexe no `package-lock.json`; conferir que a versão instalada é compatível com o Node 22.17 e com o React 19.
11. **Cartão de notificação:** hoje a linha inteira é um botão; no cartão, o título como botão que cobre o cartão precisa manter o mesmo comportamento de clique e de teclado.

## Perguntas em aberto

Nenhuma que bloqueie. Vale o usuário conferir as quatro suposições da seção "Decisões do usuário".

## Critérios de aceite do plano

A implementação está pronta quando:

- nenhuma lista de Licitações tem "Por página", Anterior e Próxima, Tabela ou Compacta;
- todas as listas da decisão 1 começam com 50 itens, carregam mais ao rolar, são virtualizadas e mostram "Mostrando N de T", "Carregando…", "Fim da lista" e o erro com "Tentar de novo";
- editais, contratos, vencedores, buscas salvas, notificações (página) e execuções da Coleta usam o mesmo `ListCard`;
- o quadro de Acompanhamento continua com arrastar e soltar, sem o botão Quadro/Tabela;
- o coração e o acompanhamento não relêem todas as páginas carregadas;
- mudar filtro ou ordem volta ao topo, e links antigos com `pagina` e `porPagina` abrem do início sem erro;
- o `Pagination.tsx`, as tabelas, o `useStoredPreference` e o que ficou sem uso foram apagados, e o README do módulo foi atualizado;
- `npm test` e `npx vite build` passam, e o roteiro manual foi conferido.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto. Seguir o `/AGENT.md` e o `/CLAUDE.md` (nada de código sem aprovação, e a sequência `/implementar` → `/finalizar`).
- Criar a branch `feat/R/licitacoes-lista-infinita` e fazer um commit por etapa só quando o usuário mandar (o `/finalizar` cuida do commit, do push e do merge).
- A dependência `@tanstack/react-virtual` está aprovada por este plano; instalar sem `--force` e sem atualizar outras versões.
- Não há migration nem mudança de `.env`. Não mexer no backend.
- Identificadores em inglês; textos para o usuário em português.
- Rodar `npm test` e `npx vite build` um de cada vez.
- Antes de apagar `screenLayout.ts`, os utilitários e as constantes, conferir com busca que ninguém mais os usa.
- Não commitar `CLAUDE.md` nem `.portal/`, que estão alterados na árvore e não fazem parte deste trabalho.
- Atualizar a seção "Situação" deste plano ao final, como nos planos anteriores.
- Ao fim do `/implementar`, perguntar se quer enviar para produção, e só fazer o merge com a confirmação explícita.
