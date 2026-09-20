# Plano de Implementação: Remover completamente a feature de Reservas/Cofre

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature — levantamento exaustivo por agente Explore + confirmação ao vivo no banco de produção)
- Data do planejamento: 2026-09-20
- Classificação: `frontend + backend + database` — remoção completa de feature em todas as camadas

## Resumo

Remover por completo a feature de "Reservas"/"Cofre" do sistema: rotas backend, schema Drizzle, telas/componentes frontend, permissão dedicada, modo demo público, textos institucionais/marketing/Termos de Uso, e as tabelas `reservas`/`movimentacoes_reservas` no banco de produção. Confirmado ao vivo (leitura) que hoje existem apenas 2 registros em `reservas` e 13 em `movimentacoes_reservas`, sem nenhuma tabela de terceiros referenciando essas duas — o usuário confirmou apagar sem backup, dado o volume baixo.

## Escopo

### Dentro do escopo

**Backend — remover por completo:**
- `backend/src/routes/reserves.ts`
- `backend/src/db/schema/reserves.ts`

**Backend — editar (remover trechos relacionados):**
- `backend/src/server.ts` — remover import de `reserveRoutes` e as duas montagens (`app.use('/api/reserves', ...)` e `app.use('/api/reservas', ...)`, alias EN/PT do mesmo router).
- `backend/src/db/schema/index.ts` — remover `export * from './reserves';`.
- `backend/src/routes/users.ts` — remover import de `reserves` e a linha `db.delete(reserves).where(eq(reserves.userId, userId))` da rotina de exclusão de conta.
- `backend/src/services/accountBackfill.ts` — remover import de `reserves`, o `UPDATE reserves SET accountId = ...` do backfill, e o campo `reserves` do objeto de retorno `migrated`.
- `backend/src/db/schema/memberPermissions.ts` — remover o campo `accessReserves`.
- `backend/src/routes/accountMembers.ts` — remover `'accessReserves'` da lista `PERMISSION_FLAGS`.
- `backend/config/schema-dev.sql` — atualizar o dump de referência após a migration (remover `CREATE TABLE reservas`, `CREATE TABLE movimentacoes_reservas`, sequences, índices, FKs relacionados, e a coluna `acesso_reservas` de `membro_permissoes`).
- `backend/config/staging-setup.sql` — remover o bloco equivalente (`staging.reservas`, `staging.movimentacoes_reservas`).

**Backend — nova migration (não apagar migrations antigas):**
- Criar `backend/drizzle/00XX_remover_reservas.sql`:
  ```sql
  DROP TABLE IF EXISTS movimentacoes_reservas;
  DROP TABLE IF EXISTS reservas;
  ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_reservas;
  ```
  Ordem: `movimentacoes_reservas` antes de `reservas` (FK `ON DELETE CASCADE` de `movimentacoes_reservas.reserva_id` → `reservas.id`).

**Frontend — remover por completo:**
- `src/screens/reservas/ReservasPanel.tsx`
- `src/services/reservasService.ts`
- `src/types/reservas.ts`
- `src/utils/reservaContribuicao.ts`
- `src/hooks/useMovimentacoesConsolidadas.ts` (confirmado consumidor único: `ReservasPanel.tsx`)

**Frontend — editar:**
- `src/screens/finance/MovimentacoesScreen.tsx`: remover import de `ReservasPanel`, estado `reserveDialogOpen`, o botão "Movimentar reserva" (ícone `PiggyBank`) e seu `FirstAccessGuideCard` associado, o hook `useFirstAccessGuide('reservas:movimentar-v1', ...)`, a renderização de `<ReservasPanel />`, e o import de `PiggyBank` de `lucide-react` (confirmado: só usado nesses 2 pontos do arquivo).
- `src/services/permissoesService.ts`: remover `'accessReserves'` do tipo `PermissionFlag` e a entrada `{ flag: 'accessReserves', label: 'Reservas' }` da lista de telas configuráveis.
- `src/screens/config/PermissoesTab.tsx`: remover a renderização do toggle "Reservas" (decorrente da remoção acima na lista genérica, ou remoção específica se houver).
- `src/services/queryKeys.ts`: remover `reservas: ['reservas']` e `movimentacoes: (reservaId) => [...]`, e ajustar o uso em `invalidateFinanceQueries` (linha que invalida `queryKeys.reservas`).
- `src/components/firstAccessGuideMessages.ts`: remover as 4 chaves (`reservasNova`, `reservasMovimentar`, `reservasAbaMovimentar`, `reservasContribuicaoSugerida`).
- `src/services/demo/demoFakeDatabase.ts`: remover interface `ReservaDemo` e o array `reservas` do banco fake.
- `src/services/demo/fakeApiResolver.ts`: remover a simulação dos endpoints `/reservas` (GET, POST, PUT, DELETE, `/move`, `/movements`).

**Frontend — textos institucionais/marketing/Termos (remover menções à feature):**
- `src/screens/public/HomePage.tsx` (linha ~85)
- `src/screens/public/PlanosPage.tsx` (linhas ~22, ~47 — "Reservas financeiras" como recurso de plano)
- `src/screens/public/FuncionalidadesPage.tsx` (linhas ~49, ~87, ~271 — seção dedicada "Reservas")
- `src/screens/public/SobrePage.tsx` (linhas ~20, ~104)
- `src/screens/public/TermosModal.tsx` (linhas ~18, ~78 — texto jurídico, revisar com cuidado para manter coerência do documento)
- `src/screens/public/components/PublicSeo.tsx` (linhas ~16, ~21, ~26 — meta descriptions/SEO)
- `src/screens/public/components/HomeBenefitsHighlights.tsx` (linha ~14)
- `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx` (linha ~11)
- `src/screens/planos/PlanosScreen.tsx` (linha ~49 — `recursos: [..., 'Reservas e metas', ...]`)
- `src/screens/config/ContasTab.tsx` (linha ~1154 — texto explicativo da tela de Contas)

### Fora do escopo

- Qualquer outra feature financeira (despesas, receitas, orçamento, fechamento de mês, categorias, cartões) — sem relação com esta remoção.
- Migrations antigas do Drizzle (`0001` a `0042`) — nunca alteradas ou apagadas; apenas uma nova migration é criada para o DROP.
- A Fase 2 do plano de visibilidade de família (pausada anteriormente) — assunto independente.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo); `backend/AGENT.md`/`frontend/AGENT.md` não existem como arquivos dedicados neste projeto
- Investigação exaustiva por agente Explore nesta conversa, cobrindo backend, frontend, modo demo e textos institucionais, com grep exaustivo e leitura de arquivos completos
- Confirmação ao vivo (leitura) no banco de produção: `SELECT COUNT(*)` em `reservas` (2 registros) e `movimentacoes_reservas` (13 registros); consulta a `information_schema` confirmando que nenhuma tabela de terceiros referencia `reservas`/`movimentacoes_reservas` além da relação já conhecida entre as duas
- Verificações pontuais desta sessão: `useMovimentacoesConsolidadas` tem consumidor único (`ReservasPanel.tsx`); `PiggyBank` só é usado nos 2 pontos do botão de reservas em `MovimentacoesScreen.tsx`

## Impacto por área

### Frontend

- Telas: o botão "Movimentar reserva" desaparece da tela de Movimentações; nenhum item de menu lateral precisa ser removido (confirmado: a feature nunca teve entrada própria no menu, `NAV_GROUPS` em `AppShell.tsx` não lista "Reservas").
- Componentes: 5 arquivos removidos por completo (painel, service, tipos, utilitário de cálculo, hook de consolidação de histórico).
- Permissões: a tela de gestão de permissões de membros (`PermissoesTab.tsx`) deixa de mostrar o toggle "Reservas".
- Modo demo: o site público (demo interativo) deixa de simular a criação/movimentação de reservas — o texto do demo interativo (`HomeInteractiveDemo.tsx`) também precisa ser ajustado, já que hoje menciona "crie uma reserva e veja tudo refletir na hora".
- Query keys: `reservas` e `movimentacoes` removidas de `queryKeys.ts`; `invalidateFinanceQueries` ajustado para não invalidar mais essa chave.
- Estados de loading/error/empty: não aplicável — os componentes inteiros são removidos, não há estado remanescente a tratar.

### Backend

- Rotas: `reserves.ts` removido; duas montagens de rota (`/api/reserves`, `/api/reservas`) removidas de `server.ts`.
- Permissões: `accessReserves`/`acesso_reservas` removida do middleware de permissões, da lista `PERMISSION_FLAGS`, e da coluna no banco.
- Backfill de conta: `accountBackfill.ts` perde a etapa de reservas — usada só em migração de dados legados, sem impacto em fluxo ativo do sistema.
- Exclusão de usuário: `users.ts` deixa de tentar deletar reservas em cascata (a tabela não existirá mais).
- Nenhuma outra rota (`financial.ts`, `months.ts`, `budget.ts`, `reports.ts`, etc.) depende de `reservas`/`movimentacoes_reservas` para compor totais exibidos em outras telas — confirmado pela investigação, reduzindo o risco de quebra colateral.

### Banco de dados

- `DROP TABLE movimentacoes_reservas;`
- `DROP TABLE reservas;`
- `ALTER TABLE membro_permissoes DROP COLUMN acesso_reservas;`
- Riscos: perda permanente de 2 registros em `reservas` e 13 em `movimentacoes_reservas` — **já confirmado e aceito pelo usuário, sem necessidade de backup**.
- Nenhuma outra tabela referencia essas duas (confirmado ao vivo via `information_schema`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

**Backend:**
- `backend/src/routes/reserves.ts` (removido)
- `backend/src/db/schema/reserves.ts` (removido)
- `backend/src/db/schema/index.ts`
- `backend/src/server.ts`
- `backend/src/routes/users.ts`
- `backend/src/services/accountBackfill.ts`
- `backend/src/db/schema/memberPermissions.ts`
- `backend/src/routes/accountMembers.ts`
- `backend/config/schema-dev.sql`
- `backend/config/staging-setup.sql`
- `backend/drizzle/00XX_remover_reservas.sql` (nova)

**Frontend:**
- `src/screens/reservas/ReservasPanel.tsx` (removido)
- `src/services/reservasService.ts` (removido)
- `src/types/reservas.ts` (removido)
- `src/utils/reservaContribuicao.ts` (removido)
- `src/hooks/useMovimentacoesConsolidadas.ts` (removido)
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/services/permissoesService.ts`
- `src/screens/config/PermissoesTab.tsx`
- `src/services/queryKeys.ts`
- `src/components/firstAccessGuideMessages.ts`
- `src/services/demo/demoFakeDatabase.ts`
- `src/services/demo/fakeApiResolver.ts`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/FuncionalidadesPage.tsx`
- `src/screens/public/SobrePage.tsx`
- `src/screens/public/TermosModal.tsx`
- `src/screens/public/components/PublicSeo.tsx`
- `src/screens/public/components/HomeBenefitsHighlights.tsx`
- `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx`
- `src/screens/planos/PlanosScreen.tsx`
- `src/screens/config/ContasTab.tsx`

## Estratégia de implementação

1. Backend: remover `reserves.ts` e `db/schema/reserves.ts`.
2. Backend: editar `server.ts`, `db/schema/index.ts`, `users.ts`, `accountBackfill.ts`, `memberPermissions.ts`, `accountMembers.ts` para remover todas as referências.
3. Escrever a migration de DROP (sem executar).
4. Atualizar `config/schema-dev.sql` e `config/staging-setup.sql`.
5. Frontend: remover os 5 arquivos dedicados.
6. Frontend: editar `MovimentacoesScreen.tsx`, `permissoesService.ts`, `PermissoesTab.tsx`, `queryKeys.ts`, `firstAccessGuideMessages.ts`.
7. Frontend: editar o modo demo (`demoFakeDatabase.ts`, `fakeApiResolver.ts`).
8. Frontend: revisar e ajustar os 10 textos institucionais/marketing/Termos listados.
9. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
10. Buscar novamente por "reserva"/"cofre"/"PiggyBank"/"movimentacoes_reservas" em todo o projeto (backend e frontend) para confirmar que nada ficou órfão.
11. Apresentar resumo final; pedir confirmação explícita separada antes de executar a migration em produção (regra do projeto: nunca migrar sem esse passo extra, mesmo com o plano já aprovado).

## Regras de negócio identificadas

- A feature de Reservas nunca teve item de menu próprio — era acessada só via botão dentro de Movimentações; removê-la não deixa "buraco" de navegação a tratar.
- Nenhum valor de reserva compõe totais exibidos em Painel, Panorama Geral ou Orçamento — a remoção não altera nenhum número exibido em outras telas.

## Regras multi-tenant e segurança

- A remoção da coluna de permissão `acesso_reservas` não afeta nenhuma outra permissão existente — é uma coluna isolada em `membro_permissoes`.
- Nenhuma rota remanescente depende de `checkAvailableBalance`/`AVAILABLE_BALANCE_SQL` (confirmado: uso exclusivo dentro de `reserves.ts`) — seguro remover junto com o arquivo, sem risco de quebrar validação de saldo em outro lugar.

## Validações necessárias

- Confirmar, após a implementação de código, que nenhum import quebrado ou referência morta a `reservas`/`ReservasPanel`/`reservasService` permanece (build deve falhar se houver).
- Confirmar que a migration de DROP roda sem erro em ambiente de teste/consulta antes de aplicar em produção (ex.: validar sintaxe via leitura, já que não será executada nesta etapa).

## Testes necessários

### Frontend

- Tela de Movimentações carrega normalmente sem o botão "Movimentar reserva".
- Tela de Permissões não mostra mais o toggle "Reservas".
- Páginas públicas (Home, Planos, Funcionalidades, Sobre, Termos) carregam sem menção a reservas/cofre.
- Modo demo interativo funciona sem erros de endpoint inexistente.

### Backend

- `GET/POST /api/reserves` e `/api/reservas` retornam 404 (rota não existe mais).
- Exclusão de usuário continua funcionando sem tentar deletar reservas.
- Backfill de conta continua funcionando para incomes/expenses/months, sem a etapa de reservas.

### E2E

- Fluxo completo: usuário acessa Movimentações, Permissões, e as páginas públicas — nenhuma menção ou erro relacionado a reservas em lugar nenhum.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Perda permanente de dados** (2 reservas, 13 movimentações) — já confirmado e aceito pelo usuário, sem backup.
- Textos jurídicos (Termos de Uso) precisam de edição cuidadosa — não é só remover uma linha, é garantir que o documento continue coerente e juridicamente consistente após a remoção da menção.
- Escopo grande em número de arquivos (mais de 25 arquivos tocados) — risco individual baixo por arquivo, mas alto em quantidade; recomenda-se revisão cuidadosa do diff completo antes do commit, e possivelmente dividir a revisão em blocos (backend, frontend funcional, textos institucionais).
- A migration de banco só deve ser executada após confirmação explícita separada, mesmo com este plano já aprovado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões já tomadas (apagar dados sem backup; remover textos institucionais e Termos de Uso no mesmo plano).

## Critérios de aceite do plano

- Nenhuma rota, componente, tipo, service, hook ou permissão relacionado a reservas permanece no código.
- Nenhuma menção a "reserva"/"cofre" como feature do produto permanece em textos institucionais, marketing, SEO ou Termos de Uso.
- Migration de remoção das tabelas e da coluna de permissão escrita e revisada, mas não executada até confirmação explícita separada do usuário.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.
- Busca final por "reserva"/"cofre"/"PiggyBank" no projeto inteiro não retorna nenhuma ocorrência relacionada à feature removida (exceto falsos positivos já identificados como "preserva"/"reservado" em outros contextos).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration SQL sem confirmação explícita do usuário — o ambiente aponta para produção, e a operação é destrutiva e irreversível.
- Revisar o diff completo em blocos (backend, frontend funcional, textos institucionais) antes de considerar a implementação concluída, dado o volume de arquivos.
- Ao editar os Termos de Uso (`TermosModal.tsx`), ter cuidado especial para manter a coerência jurídica do texto após a remoção da menção — não apenas deletar a palavra "reservas" sem revisar a frase ao redor.
- Fazer uma busca final exaustiva por "reserva", "cofre" e "PiggyBank" em todo o projeto antes de finalizar, para confirmar que nada ficou órfão.
- Não executar migrations sem confirmação explícita.
