# Plano de Implementação: Licitações — selecionar todos, tela cheia, favoritos e painel de notificações

## Origem

- Arquivo de especificação: nenhum. Os pedidos foram feitos na conversa de 06/10/2026, com prints do painel de notificações de Licitações e do app de finanças para comparar.
- Data do planejamento: `2026-10-06`
- Classificação: `frontend + backend + database`

## Resumo

Quatro melhorias de usabilidade no módulo de Licitações:

1. **"Todos" e "Limpar"** nas escolhas múltiplas (UF, Modalidade e Acompanhamento).
2. **Tela toda na horizontal:** as telas do módulo têm largura máxima de 1400 px, 1152 px ou 896 px e desperdiçam espaço em monitores grandes.
3. **Favoritos com coração, de cada pessoa:** coração no card, na tabela e no edital, um item "Favoritos" no menu e o filtro "Só favoritos" em Buscar. Precisa de uma tabela nova.
4. **Painel de notificações com o visual do app de finanças:** é só visual. O sino de Licitações abre uma caixinha embaixo dele; o do app de finanças abre um painel lateral à direita. O módulo passa a usar o mesmo formato.

## Decisões aplicadas

- **Ícone do favorito:** coração.
- **Itens 1 e 2:** confirmados como descritos.
- **Favorito:** de cada pessoa. Uma pessoa não vê os favoritos de outra, nem na mesma conta.
- **Onde ver os favoritos:** os dois lugares, o item "Favoritos" no menu e o filtro "Só favoritos" em Buscar.
- **Painel de notificações:** muda só o visual, para o mesmo do app de finanças. O funcionamento continua o mesmo. O aviso de push fica de fora, porque Licitações não envia notificação para o celular.

## Escopo

### Dentro do escopo

**1. Todos e Limpar**
- `StatePicker` (UF) e `CheckList` (Modalidade e Acompanhamento) ganham, no topo, os botões **Todos** (marca todas as opções) e **Limpar** (desmarca todas).
- Os botões ficam desabilitados quando já está tudo marcado (Todos) ou nada marcado (Limpar).
- Valem no painel de filtros de Buscar e no formulário de Busca salva.

**2. Tela toda**
- Sai o `mx-auto max-w-*` das telas Início, Buscar e Acompanhamento (1400 px), Buscas salvas, Configurações e Contas habilitadas (1152 px), Edital e Notificações (896 px).
- As grades de cartões de Buscas salvas e de Contas habilitadas ganham uma coluna a mais em telas largas (`2xl:grid-cols-3`).
- O celular não muda.

**3. Favoritos**
- **Banco:** migration `0078_licitacoes_favoritos.sql`, com a tabela `licitacoes.favorito`:
  - colunas `conta_id`, `usuario_id`, `edital_id`, `criado_em`;
  - chave primária `(conta_id, usuario_id, edital_id)`, chaves estrangeiras com `ON DELETE CASCADE` e índice em `edital_id`.
- **API:**
  - `PUT /api/tenders/notices/:id/favorite` favorita e `DELETE` desfavorita. As duas são idempotentes; edital inexistente dá 404;
  - a busca (`GET /notices`) e o detalhe passam a trazer `isFavorite`, da pessoa logada na conta;
  - novo filtro `favoritesOnly` na busca.
- **Coleta:** a limpeza (`deleteExpiredNotices`) mantém os editais que alguém favoritou, como já mantém os acompanhados.
- **Telas:**
  - botão de **coração** (preenchido quando é favorito) no card, na tabela e no cabeçalho da tela do edital;
  - tela **Favoritos** (`/favoritos`), item do menu logo depois de Buscas salvas, que lista **todos** os favoritos da pessoa, inclusive os encerrados e os descartados, ordenados pelo prazo e paginados, com estado vazio;
  - filtro **"Só favoritos"** em Buscar (`favoritos=1` na URL), com chip. Com ele ligado, o prazo mínimo de 3 dias não vale, como já acontece com o filtro de acompanhados.

**4. Painel de notificações**
- O `NotificationsBell` passa a abrir um painel lateral à direita, com o mesmo visual do `NotificationPanel` do app de finanças:
  - fundo escurecido e desfocado, e clicar fora fecha;
  - largura `min(100vw, 410px)` e altura toda da tela;
  - cabeçalho "Notificações", com o subtítulo "Editais novos, alterados e prazos" e o botão X;
  - avisos em cartões arredondados, com ícone em círculo colorido pelo tipo e bolinha nas não lidas;
  - estado vazio em cartão com sino.
- Continuam "Marcar todas como lidas" e "Ver todas". O clique continua marcando como lida e abrindo o edital.
- O Esc fecha, e o foco volta para o sino.

### Fora do escopo

- O app de finanças, incluindo o painel de notificações dele.
- A página `/notificacoes`, que continua como está.
- Favoritos compartilhados com a equipe e notificações sobre favoritos.
- "Todos" e "Limpar" em Município e Órgão, que são busca por nome ou CNPJ, com limite de itens.
- Notificação de push para Licitações.

## Leitura de contexto

- `/AGENT.md` e `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- **Front:**
  - `src/tenders/components/ChoicePickers.tsx`, `SearchFiltersPanel.tsx`, `SavedSearchFormDialog.tsx`, `NoticeCard.tsx`, `NoticeTable.tsx`, `NoticeDetailView.tsx`;
  - `src/tenders/layout/TendersShell.tsx` (o `main` não tem largura máxima; os limites estão nas telas) e `NotificationsBell.tsx`;
  - `src/tenders/utils/searchFilters.ts` e `navigation.ts`;
  - as telas com `max-w-*`;
  - `src/layout/AppShell.tsx`, só o `NotificationPanel`, como referência visual.
- **Backend:**
  - `services/noticeSearch.ts` (`searchNotices` é chamado pela rota de busca, pela prévia da busca salva e pelo painel do Início);
  - `services/noticeDetail.ts`, `routes/notices.ts`, `routes/validators.ts` e `routes/requestReaders.ts`;
  - `collector/repository.ts` (`deleteExpiredNotices`) e `db/schema.ts`;
  - última migration: `0077`.
- **Prints do usuário:** painel do sino de Licitações e painel de notificações do app de finanças.

## Impacto por área

### Frontend

- **`ChoicePickers.tsx`:** ações Todos e Limpar no `StatePicker` e no `CheckList`, com `aria-label` ("Selecionar todas as UFs" e "Limpar UFs", por exemplo).
- **Telas sem `max-w`:** `HomeScreen`, `SearchScreen`, `TrackingScreen`, `SavedSearchesScreen`, `SettingsScreen`, `AdminAccountsScreen`, `NoticeScreen` e `NotificationsScreen`. Grades com `2xl:grid-cols-3` onde couber.
- **Favoritos:**
  - `types.ts`: `isFavorite` em `NoticeListItem` e `NoticeDetail`;
  - `services/noticesService.ts`: `addFavorite` e `removeFavorite`;
  - hook `useToggleFavorite`: invalida `tendersQueryKeys.notices` (buscas, detalhe e favoritos) e mostra o novo estado enquanto grava;
  - `components/FavoriteButton.tsx` (novo): `Heart` do lucide, `aria-pressed`, rótulo "Favoritar" ou "Remover dos favoritos";
  - `NoticeCard`, `NoticeTable` e `NoticeDetailView` mostram o botão;
  - `screens/FavoritesScreen.tsx` (novo): lista com `NoticeCard`, `Pagination`, estados de carregando, erro e vazio;
  - `utils/navigation.ts`: rota `favoritos`, depois de `buscas`, e ícone `Heart` no `TendersSidebar`;
  - `utils/searchFilters.ts`: `favoritesOnly` no estado, `favoritos=1` na URL, chip "Só favoritos", `favoritesOnly=true` na query da API e `appliesMinimumDeadline` falso com o filtro ligado;
  - `SearchFiltersPanel.tsx`: opção "Só favoritos".
- **Painel do sino:** `layout/NotificationsBell.tsx` reescrito no formato de painel lateral, com o `Z_SYSTEM_OVERLAY` e as classes do painel de finanças. Os ícones por tipo:
  - novo edital: `Sparkles`, ciano;
  - edital alterado: `RefreshCw`, âmbar;
  - prazo em 3 dias: `Clock`, âmbar;
  - prazo em 1 dia: `AlertTriangle`, rosa.

### Backend

- **`db/schema.ts`:** tabela `tenderFavorites` (`licitacoes.favorito`).
- **`services/noticeSearch.ts`:**
  - `NoticeSearchFilters.favoritesOnly`;
  - `searchNotices` recebe também o `userId`, ou seja, o `Requester` da conta;
  - `isFavorite` sai de um `EXISTS` da pessoa;
  - o filtro `favoritesOnly` também é um `EXISTS`;
  - `criteriaOnlyFilters` usa `favoritesOnly: false`;
  - as chamadas da prévia da busca salva e do painel do Início passam o `userId`.
- **`services/noticeDetail.ts`:** `isFavorite` no detalhe, mais `addFavorite` e `removeFavorite`:
  - os dois conferem antes se o edital existe (`assertNoticeExists`);
  - `INSERT ... ON CONFLICT DO NOTHING` e `DELETE`, por conta, pessoa e edital.
- **`routes/notices.ts`:** `PUT` e `DELETE` em `/notices/:id/favorite`, com `idParam`. O `favoritesOnly` entra nos validators e no leitor da query.
- **`collector/repository.ts`:** novo `notExists(favorito)` em `deleteExpiredNotices`.
- **Testes de banco** (banco local): ver abaixo.

### Banco de dados

**Migration `backend/drizzle/0078_licitacoes_favoritos.sql`:**
```sql
CREATE TABLE licitacoes.favorito (
  conta_id   INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  edital_id  BIGINT  NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id, edital_id)
);
CREATE INDEX favorito_edital_idx ON licitacoes.favorito (edital_id);
```
O tipo de `edital_id` deve seguir o de `licitacoes.edital.id`; conferir na implementação.

- **Antes do deploy:** a migration precisa ser aplicada na produção antes do código novo. A busca e o detalhe consultam a tabela e quebrariam sem ela. O cabeçalho do `.sql` avisa isso.
- **Usuário restrito `licitacoes_coletor`:** se um dia for criado, precisa de `GRANT` na tabela nova. Hoje ele não existe na produção.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Ordem:**
  1. aplicar a 0078 no banco local, para os testes;
  2. aplicar a 0078 na produção, com a confirmação do usuário e fora do modo automático;
  3. só então fazer o merge em `main`.
- Sem variáveis novas.

## Arquivos provavelmente afetados

- **Banco:** `backend/drizzle/0078_licitacoes_favoritos.sql`
- **Backend:**
  - `backend/src/modules/tenders/db/schema.ts`;
  - `services/noticeSearch.ts`, `noticeDetail.ts`, `savedSearches.ts` (prévia) e `dashboard.ts`;
  - `routes/notices.ts`, `routes/validators.ts` e `routes/requestReaders.ts`;
  - `collector/repository.ts`;
  - os testes de banco correspondentes e o `README.md` do módulo.
- **Front** (`src/tenders`):
  - `components/ChoicePickers.tsx`, `FavoriteButton.tsx` (novo), `NoticeCard.tsx`, `NoticeTable.tsx`, `NoticeDetailView.tsx`, `SearchFiltersPanel.tsx`;
  - `screens/FavoritesScreen.tsx` (novo), mais as 8 telas;
  - `layout/NotificationsBell.tsx` e `TendersSidebar.tsx`;
  - `TendersApp.tsx` (rota `favoritos`);
  - `utils/searchFilters.ts` e `navigation.ts`, com os testes;
  - `services/noticesService.ts`, `queryKeys.ts` e `types.ts`;
  - hooks.

## Estratégia de implementação

1. Criar a branch `feat/R/licitacoes-usabilidade-favoritos` a partir de `main`.
2. **Banco:**
   - escrever a 0078;
   - mostrar ao usuário o status das migrations nos dois bancos, só leitura;
   - aplicar **no banco local**.
3. **Backend:** schema, busca e detalhe com `isFavorite`, `favoritesOnly`, as rotas de favorito, a limpeza e os testes de banco.
4. **Front:**
   - Todos e Limpar;
   - tela cheia;
   - favoritos (botão, hook, tela, menu e filtro de Buscar);
   - painel do sino.
5. README do módulo (API e telas).
6. **Conferir no navegador**, no ambiente local:
   - coração no card, na tabela e no edital;
   - tela Favoritos e "Só favoritos";
   - Todos e Limpar;
   - telas em 1920 px e no celular;
   - painel do sino, claro e escuro.
7. Rodar os checks.
8. **No `/finalizar`, antes do merge:** pedir a confirmação para aplicar a 0078 na produção, e só depois fazer o merge.

## Regras de negócio identificadas

- **Favorito por pessoa:**
  - é ligado à conta em uso no módulo e à pessoa logada;
  - colaborador também tem os seus;
  - favoritar duas vezes não duplica, e desfavoritar o que não é favorito não dá erro.
- **Tela Favoritos:** lista todos os favoritos da pessoa, inclusive encerrados e descartados, pelo prazo.
- **"Só favoritos" em Buscar:** respeita "Só editais abertos" como os outros filtros. O prazo mínimo de 3 dias não vale com ele ligado.
- **Limpeza da coleta:** não apaga edital favoritado.
- **Todos e Limpar:** marcar todas as UFs, ou todas as modalidades, dá o mesmo resultado que não filtrar. O botão serve para marcar tudo e desmarcar só algumas.

## Regras multi-tenant e segurança

- A conta e a pessoa vêm da trava do módulo (`tenderAccessOf`), nunca do corpo da requisição.
- Os favoritos são filtrados por `conta_id` e `usuario_id` em todas as consultas. Ninguém vê nem altera o favorito de outra pessoa.
- O id do edital é validado (`idParam`), e a existência é conferida antes de gravar.

## Validações necessárias

- `:id` é inteiro positivo, e o edital precisa existir (404 se não existir).
- `favoritesOnly` na query aceita `true`, `false`, `1` ou `0`, como os outros booleanos.
- Na URL do front, só `favoritos=1` liga o filtro.

## Testes necessários

### Frontend

- `ChoicePickers`, de forma indireta: a função que marca tudo devolve todas as opções, e a que limpa devolve vazio. Se o componente não tiver lógica pura, conferir no navegador.
- `searchFilters`:
  - ida e volta de `favoritos=1`;
  - chip "Só favoritos";
  - `favoritesOnly=true` na query da API;
  - `appliesMinimumDeadline` falso com favoritos.
- `navigation`: "Favoritos" no menu, depois de Buscas salvas.

### Backend

Testes de banco, no banco local:
- favoritar e desfavoritar, idempotentes;
- o `isFavorite` aparece certo na busca e no detalhe;
- o favorito de A não aparece para B na mesma conta;
- `favoritesOnly` traz só os da pessoa;
- edital inexistente dá 404;
- a limpeza mantém um edital encerrado há mais de 12 meses que esteja favoritado;
- rotas HTTP com 200 e 404.

### E2E

- Conferência no navegador, no ambiente local (passo 6 da estratégia).

## Comandos de validação sugeridos

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0078 --banco local
npx tsc --noEmit -p .
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

## Riscos e pontos de atenção

- **Ordem do deploy:** se o código for para a produção antes da migration, a busca e o detalhe do módulo falham. Por isso a migration entra antes do merge.
- **`searchNotices` muda de assinatura:** os três pontos que o chamam (busca, prévia e Início) precisam passar o `userId`. A verificação de tipos acusa se faltar algum.
- **Linhas longas:** sem largura máxima, o texto dos cards fica com linhas longas em monitores muito largos. Os cards continuam em uma coluna.
- **Painel do sino:** passa a cobrir a tela, como o de finanças. O Esc e o clique fora fecham.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- UF, Modalidade e Acompanhamento tiverem Todos e Limpar, em Buscar e no formulário de Busca salva;
- as telas do módulo usarem a largura toda, e o celular continuar igual;
- o coração favoritar e desfavoritar no card, na tabela e no edital;
- a tela Favoritos e o filtro "Só favoritos" mostrarem só os favoritos da pessoa;
- o sino abrir o painel lateral com o visual do app de finanças, sem mudar o funcionamento;
- a migration 0078 estiver aplicada no banco local, e na produção só com confirmação, antes do merge;
- os testes e checks de front e backend passarem.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não mexer no app de finanças: `AppShell` é só referência visual.
- Aplicar a 0078 só no banco local durante a implementação. A produção fica para o `/finalizar`, com a confirmação do usuário e antes do merge.
- Seguir o AGENT.md: Drizzle nas queries novas, nomes em inglês no código e textos em português na tela.
- React Query com chaves centralizadas; estados de carregando, vazio e erro.
