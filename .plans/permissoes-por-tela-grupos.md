# Plano de Implementação: Sistema de Permissões por Tela (Grupos)

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário em conversa, com levantamento exaustivo da superfície do app feito por agente Explore (somente leitura) e decisões coletadas via perguntas ao longo da sessão. Usuário compartilhou uma imagem de referência de um sistema de terceiros (permissões agrupadas por categoria, com contagem e botão expandir/ocultar).
- Data do planejamento: 2026-09-04
- Classificação: `frontend + backend + database`

## Resumo

O sistema de permissões atual (Fase 3 do plano de contas familiares, já em produção) tem 7 flags focadas exclusivamente em **acesso a dados de terceiros dentro da conta compartilhada** (ex.: "ver lançamentos de outros membros"). O usuário identificou que isso não cobre a superfície real do app — há ~23 áreas/telas (Despesas, Receitas, Reservas, Relatórios, Cartões, Sócios, Contratos, Assinatura, etc.) sem nenhum controle de permissão hoje.

Este plano substitui as 7 flags atuais por um novo modelo: **~19 toggles independentes, um por tela/funcionalidade, organizados em 4 grupos visuais** (inspirado na imagem de referência do usuário, mas sem o comportamento de expandir/ocultar — grupos sempre visíveis, listados diretamente).

**Mudança de natureza do modelo, crítica de entender**: o modelo atual controla apenas "posso ver/mexer no que OUTRO membro lançou". O novo modelo é sobre **acesso à tela em si** — se o toggle "Despesas" estiver desligado para um membro, ele não acessa a tela de Despesas de jeito nenhum, nem para lançar as próprias. Isso é uma mudança de escopo confirmada explicitamente pelo usuário, não uma extensão do modelo anterior.

## Escopo

### Dentro do escopo

**Os 4 grupos e 19 toggles (nomes finais, confirmados com o usuário):**

**FINANCEIRO**
1. Despesas
2. Receitas
3. Fechamento de mês
4. Reservas
5. Planejamento/Orçamento
6. Calendário/Compromissos

**RELATÓRIOS E PAINEL**
7. Painel/Dashboard
8. Relatórios
9. Notificações
10. Assistente Financeiro

**CONFIGURAÇÕES**
11. Contas
12. Categorias
13. Cartões (inclui definir limite)
14. Catálogo de Serviços
15. Representantes
16. Sócios
17. Membros/Colaboradores
18. Assinatura/Planos

**COMERCIAL** *(visível apenas quando a conta ativa é do tipo empresa)*
19. Clientes
20. Contratos
21. Catálogo de Produtos

(A numeração acima é só de referência — na implementação os 19-21 itens comerciais podem ser 3 toggles à parte do grupo, totalizando ~21 toggles se Comercial contar os 3; confirmar contagem exata na implementação, não é uma decisão que precisa de aprovação extra.)

**Modelo de toggle — decisões confirmadas:**
- Um toggle por tela = acesso **completo** àquela tela quando ligado (criar + editar + excluir + ver), sem separar leitura de escrita em nenhum item, incluindo os sensíveis (Cartões/limite, Sócios, Assinatura).
- Todos os toggles são **independentes entre si** — sem regra de dependência (ex.: "Fechamento de mês" não exige "Despesas" ligado).
- **Assistente Financeiro depende de Despesas/Receitas**: o toggle "Assistente Financeiro" controla apenas o uso do chat em si (conversar, tirar dúvidas). Para o assistente criar uma despesa ou receita em nome do membro, os toggles "Despesas"/"Receitas" respectivamente também precisam estar ligados — o assistente nunca deve ser um atalho que ignora essas permissões.
- **Substituição, não adição**: as 7 flags atuais (`viewOthersEntries`, `editOthersEntries`, `deleteOthersEntries`, `viewAggregateSummary`, `manageCategories`, `manageCards`, `accessOtherMembersData`) são removidas e substituídas pelo novo modelo. Não convivem as duas gerações.
- **Sem acesso a lançamentos de terceiro**: decisão confirmada — com o toggle "Despesas" (ou qualquer outro) ligado, o membro só acessa/edita/exclui os **próprios** registros, nunca os de outro membro da mesma conta. O conceito de "editar/excluir lançamento de outro membro" (existente nas flags antigas `editOthersEntries`/`deleteOthersEntries`) **não existe mais** no novo modelo — simplifica o enforcement de volta ao padrão `WHERE usuario_id = req.user.id`, sem a lógica de "dono real do recurso" (`canActOnResource`) que a Fase 3 anterior introduziu.
- **Grupo "Administração" removido da lista** — o endpoint `DELETE /users/:id/clear-data` (exclusão total dos dados financeiros de um usuário) não faz parte do sistema de permissões nem agora nem depois; o modelo de desativação de membro (já implementado, Fase 2) é o único caminho de "remover" um membro, sem exclusão de dados via permissão nenhuma. Ver "Fora do escopo".
- Apresentação visual: grupos sempre expandidos (sem "Expandir"/"Ocultar" como na imagem de referência), cabeçalho de grupo com nome + contagem de toggles, lista de `ToggleRow` (componente já existente) dentro de cada grupo.

**Áreas que ganham enforcement de acesso à tela pela primeira vez (hoje sem nenhum gate):**
Fechamento de mês, Reservas, Planejamento/Orçamento, Calendário/Compromissos, Painel/Dashboard, Relatórios, Notificações, Assistente Financeiro (conversar), Contas, Catálogo de Serviços, Representantes, Sócios, Assinatura/Planos, Clientes, Contratos, Catálogo de Produtos.

**Áreas que já tinham algum controle (7 flags antigas) e migram para o novo modelo:**
Despesas/Receitas (edição/exclusão de terceiro), visão agregada (passa a ser coberta implicitamente por quem tem os toggles relevantes — avaliar na implementação se "ver visão agregada" continua existindo como conceito dentro de Painel/Relatórios ou se é assumido junto), Categorias, Cartões, acesso a dados de outros membros (categorias/cartões de terceiro — passa a ser coberto pelos toggles "Categorias"/"Cartões" normais, sem uma flag "acessar dados de outros" à parte).

### Fora do escopo

- **Excluir todos os dados de um usuário** (`DELETE /users/:id/clear-data`) — decisão explícita do usuário: esse endpoint não entra no sistema de permissões. Não fica nem como toggle liberável, nem como bloqueio hardcoded documentado neste plano — permanece exatamente como está hoje (endpoint sem UI, sem gate de permissão específico), já que o usuário confirmou que o modelo real de "remover" um membro é a desativação (Fase 2), não isso. Se o usuário quiser tratar esse endpoint (removê-lo, ou dar um gate próprio) deve ser um pedido explícito separado, não assumido aqui.
- **Granularidade fina dentro de uma tela** (ex.: "ver Cartões" separado de "editar Cartões") — decisão explícita do usuário de manter um toggle por tela.
- **`CatalogoTab.tsx` e `UsuariosTab.tsx` como conceito de navegação** — `UsuariosTab` já foi removida do menu (trabalho anterior). `CatalogoTab`/Catálogo de Produtos entra na lista de toggles conforme pedido do usuário, mas **não é objetivo deste plano reconectar a tela à navegação** se ela estiver de fato desconectada — isso é validado na implementação; se a tela não estiver acessível de forma alguma, o toggle correspondente fica registrado mas sem efeito prático até (se algum dia) a tela for reconectada. Não expandir esse plano para "consertar" a navegação do Catálogo de Produtos.
- **Acessos (analytics) e Integrações de IA** — confirmado nas fases anteriores como nível "operador da plataforma" (`isAdmin`/documento hardcoded), não fazem parte do modelo de permissões de membro.
- Qualquer mudança na lógica de desativação de membro, transferência de pendências, ou criação de membro — já implementado (Fase 2), não tocado aqui.
- Migração de dados de produção das 7 flags antigas para as novas — como o modelo muda de natureza (dados de terceiro → acesso a tela), não há um mapeamento 1:1 automático sensato; a Fase de implementação decide (com o usuário) se os poucos membros que já existem em produção (se houver) recebem os novos toggles todos `false` (padrão restritivo) ou algum mapeamento aproximado — ver "Perguntas em aberto".

## Leitura de contexto

- `sistema financas/CLAUDE.md`, `sistema financas/AGENT.md` — mesmas notas de planos anteriores (modelo multi-prefeitura do `AGENT.md` não se aplica; princípios gerais de qualidade aplicados).
- `frontend/AGENT.md`, `backend/AGENT.md` — não existem como arquivos dedicados neste projeto.
- `backend/src/middleware/permissions.ts`, `backend/src/db/schema/memberPermissions.ts` — lidos por completo (modelo atual de 7 flags, `canActOnResource`/`hasPermission`, lógica de `sameAccount` que **é reaproveitada** — a checagem de "mesma conta" continua sendo pré-condição obrigatória no novo modelo, só a checagem de flag específica muda de forma).
- `backend/src/middleware/auth.ts` — lido por completo (`authenticate`, `requireGestor`, `requireAdmin`, `requireActivePlan` — o novo middleware de acesso a tela é adicional a esses, não os substitui).
- `backend/src/server.ts` — lido por completo (todas as rotas já são montadas com `authenticate, requireActivePlan` por área — o novo middleware de tela entra no mesmo ponto de montagem, coerente com o modelo "1 toggle = 1 tela/rota inteira").
- Levantamento exaustivo de telas/ações feito por agente Explore (somente leitura) cobrindo Despesas, Receitas, Fechamento de mês, Planejamento, Calendário, Painel, Reservas, Relatórios, todas as abas de Configurações, Clientes/Contratos, Catálogo de Produtos, Assistente Financeiro, Notificações, e rotas de backend sem tela dedicada (`years.ts`, `internal-jobs.ts`, `paypal.ts`, `ratings.ts`, `financial.ts`) — usado para construir a lista de 19-21 toggles e identificar riscos (endpoint `clear-data` órfão e destrutivo, Assinatura sem nenhum gate hoje, Assistente Financeiro como canal alternativo de criação de despesas/receitas).
- `.plans/permissoes-configuraveis-por-membro.md` (Fase 3 anterior) — modelo sendo substituído por este plano.
- `.plans/vinculo-membros-conta-familiar.md` (Fase 2) — vínculo membro↔conta e desativação, não tocados aqui.
- `src/screens/config/MembrosTab.tsx` — lido por completo na sessão anterior (componente `PermissoesDialog`, `ToggleRow` já usado — reaproveitado no novo desenho).
- `src/ui/form.tsx` (`ToggleRow`) — componente compartilhado já validado, reaproveitado para os novos toggles.

## Impacto por área

### Frontend

**`src/services/permissoesService.ts`:**
- `MemberPermissionsData`/`PermissionFlag` reescritos para os novos ~19-21 campos.
- Novo agrupamento de metadados: em vez de `PERMISSION_LABELS` plano, uma estrutura `PERMISSION_GROUPS` (array de grupos, cada um com `id`, `label`, e lista de `{ flag, label }`), usada tanto para renderizar a UI quanto (indiretamente) para documentar o contrato com o backend.

**`src/screens/config/MembrosTab.tsx` (`PermissoesDialog`):**
- Reescrito para renderizar por grupo: cabeçalho de grupo (nome + contagem, ex.: "FINANCEIRO · 6 permissões") seguido da lista de `ToggleRow` do grupo, sem comportamento de expandir/ocultar (sempre visível).
- Grupo "COMERCIAL" só aparece na lista quando a conta ativa (`contaTipo`, já propagado ao componente) for `empresa`.

**Frontend — enforcement de UI (esconder o que a permissão não libera), a mapear na implementação:**
- Cada tela/rota de frontend correspondente a um toggle (Despesas, Receitas, Reservas, etc.) precisa, quando o usuário logado for um `padrao` sem aquele toggle, ocultar o item de navegação e/ou mostrar um estado de acesso negado — o padrão exato (esconder do menu vs. mostrar tela bloqueada) é decidido na implementação, olhando como cada seção de navegação (`AppShell.tsx` `AppSection`, `ConfigPanel.tsx` `visibleItems`) já resolve visibilidade condicional hoje (mesmo padrão usado para `isGestor`/`isAdmin`/`contaTipo`).
- Backend sempre é a fonte de verdade (todo enforcement de UI é cosmético/UX, nunca a única proteção).

### Backend

**`backend/src/db/schema/memberPermissions.ts`:**
- Reescrito com as ~19-21 novas colunas booleanas (nomes em português, mesmo padrão do arquivo atual, ex.: `acesso_despesas`, `acesso_receitas`, `acesso_fechamento_mes`, `acesso_reservas`, `acesso_planejamento`, `acesso_calendario`, `acesso_painel`, `acesso_relatorios`, `acesso_notificacoes`, `acesso_assistente`, `acesso_contas`, `acesso_categorias`, `acesso_cartoes`, `acesso_servicos`, `acesso_representantes`, `acesso_socios`, `acesso_membros`, `acesso_assinatura`, `acesso_clientes`, `acesso_contratos`, `acesso_catalogo_produtos` — nomes finais a confirmar na implementação, mantendo padrão `snake_case` do restante do schema).
- Todas nascem `false` (restritivo por padrão), mesma filosofia do modelo atual.
- Linha de permissões continua sendo criada automaticamente na criação do membro (endpoint em `accountMembers.ts`, já implementado — só o conjunto de colunas muda).

**`backend/src/middleware/permissions.ts`:**
- `PermissionFlag` (union type) reescrito para os novos ~19-21 valores.
- Novo helper `hasScreenAccess(userId, flag)`: resolve se `userId` é gestor (sempre `true`, sem depender de flag — mesma regra já existente) ou membro (`true` apenas se a flag correspondente estiver ligada em `member_permissions`). Diferente de `hasPermission`/`canActOnResource` atuais (que comparam `viewer` vs `resourceOwner` de um recurso de terceiro), este helper é sobre "o próprio usuário pode acessar esta tela", então não precisa da lógica de `sameAccount`/comparação de dois usuários — é uma checagem direta sobre o próprio `req.user.id`.
- Novo middleware Express `requireScreenAccess(flag: PermissionFlag)` que usa `hasScreenAccess` e retorna 403 se negado — para plugar diretamente em `server.ts` nas rotas relevantes.
- **Remover `canActOnResource`/`hasPermission` e todos os seus usos** — confirmado que não existe mais o conceito de "editar dado de terceiro". Toda rota que hoje resolve o "dono real do recurso" antes de decidir se autoriza (`resolveExpenseOwnerId`, `resolveIncomeOwnerId`, `resolveCategoryOwnerId` em `expenses.ts`/`incomes.ts`/`categories.ts`/`cards.ts`) volta ao padrão simples anterior: `WHERE id = X AND usuario_id = req.user!.id`, sem a etapa extra de checar permissão sobre terceiro.

**Rotas afetadas (montagem de middleware em `server.ts`, um `requireScreenAccess(flag)` por linha relevante):**
- `/api/expenses`, `/api/despesas` → `requireScreenAccess('acesso_despesas')`
- `/api/incomes`, `/api/receitas` → `requireScreenAccess('acesso_receitas')`
- `/api/meses` → `requireScreenAccess('acesso_fechamento_mes')` (confirmar se este router cobre só fechamento ou also outras coisas de "mês" — avaliar na implementação)
- `/api/reserves`, `/api/reservas` → `requireScreenAccess('acesso_reservas')`
- `/api/orcamento` → `requireScreenAccess('acesso_planejamento')`
- `/api/appointments`, `/api/compromissos` → `requireScreenAccess('acesso_calendario')`
- `/api/relatorios` → `requireScreenAccess('acesso_relatorios')`
- `/api/contas` → `requireScreenAccess('acesso_contas')`
- `/api/categories`, `/api/categorias` → `requireScreenAccess('acesso_categorias')`
- `/api/cards`, `/api/cartoes` → `requireScreenAccess('acesso_cartoes')`
- `/api/representatives`, `/api/representantes` → `requireScreenAccess('acesso_representantes')`
- `/api/partners`, `/api/socios` → `requireScreenAccess('acesso_socios')`
- `/api/clientes` → `requireScreenAccess('acesso_clientes')`
- `/api/contratos`, `/api/contratos-servicos`, `/api/contrato-anexos` → `requireScreenAccess('acesso_contratos')`
- `/api/servicos` → `requireScreenAccess('acesso_servicos')`
- `/api/assistant`, `/api/assistente` → `requireScreenAccess('acesso_assistente')` (checagem adicional dentro da rota de criação de despesa/receita via assistente: também exigir `acesso_despesas`/`acesso_receitas`, conforme decisão de dependência confirmada)
- `/api/plans`, `/api/planos` → `requireScreenAccess('acesso_assinatura')` (avaliar cuidadosamente: rotas de consulta de status podem precisar ficar sempre acessíveis mesmo sem o toggle, para não quebrar a experiência básica do app — ver "Riscos")
- `/api/catalogo` → `requireScreenAccess('acesso_catalogo_produtos')`
- Painel/Dashboard e Notificações: identificar o(s) endpoint(s) exatos que alimentam essas telas no frontend (não mapeados explicitamente no levantamento — provavelmente reaproveitam `/api/expenses`/`/api/incomes`/`/api/reports` com agregação; avaliar na implementação se precisam de gate próprio ou se já ficam cobertos pelos toggles de Despesas/Receitas/Relatórios).
- **Gestor nunca é bloqueado por `requireScreenAccess`** — o middleware deve checar `req.user.type` e liberar automaticamente para `gestor`/`admin`, sem consultar `member_permissions` (mesma regra já usada em `hasPermission` atual).
- **Todas as rotas atuais que usavam `canActOnResource`/`hasPermission` com as 7 flags antigas** (`expenses.ts`, `incomes.ts`, `categories.ts`, `cards.ts`, `users.ts` self-only endpoints, `ownerAndAccountWhere.ts`) revertem para o padrão simples de posse direta (`usuario_id = req.user!.id`), sem checagem de permissão sobre terceiro — a lógica de "editar/excluir recurso de terceiro dentro da conta" é removida por completo, não substituída. `ownerAndAccountWhere.ts` também reverte: a expansão para múltiplos autores (introduzida pela Fase 3 para `viewOthersEntries`) é removida, voltando a filtrar sempre por `usuario_id = req.user!.id` (exceto o caso já existente de `admin` inspecionando outro usuário via query param).

### Banco de dados

**Migration nova** (substituindo o schema atual de `membro_permissoes`):
- Opção A (mais segura): `ALTER TABLE membro_permissoes` — remover as 7 colunas antigas, adicionar as ~19-21 novas, todas `DEFAULT false NOT NULL`.
- Opção B: `DROP TABLE membro_permissoes` + recriar — mais simples de escrever, mas perde qualquer dado já configurado em produção (a confirmar quantos membros/configurações existem hoje antes de decidir — ver "Perguntas em aberto").
- Diagnóstico prévio obrigatório antes de escrever a migration final: `SELECT COUNT(*) FROM membro_permissoes` e, se houver linhas com alguma flag `true`, reportar ao usuário antes de decidir Opção A vs. B.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/memberPermissions.ts`
- `backend/src/middleware/permissions.ts`
- `backend/src/server.ts`
- `backend/src/routes/accountMembers.ts` (criação de linha de permissão — ajustar para os novos campos)
- `backend/src/routes/expenses.ts`, `incomes.ts`, `categories.ts`, `cards.ts`, `users.ts`, `utils/ownerAndAccountWhere.ts` (remoção/revisão do uso das 7 flags antigas)
- `backend/src/routes/assistant.ts` (dependência de Despesas/Receitas)
- Nova migration em `backend/drizzle/`
- `src/services/permissoesService.ts`
- `src/screens/config/MembrosTab.tsx` (`PermissoesDialog`)
- Possivelmente `src/layout/AppShell.tsx`, `src/layout/ConfigPanel.tsx` (visibilidade condicional de navegação por permissão — a mapear na implementação)

## Estratégia de implementação

1. Rodar diagnóstico somente leitura (`SELECT COUNT(*) FROM membro_permissoes`, e quantas linhas têm alguma flag `true`) para decidir Opção A vs. B da migration, e reportar ao usuário.
2. Escrever (sem executar) a migration escolhida.
3. Backend: reescrever `memberPermissions.ts` (schema) com as novas colunas.
4. Backend: reescrever `permissions.ts` — novo `PermissionFlag`, `hasScreenAccess`, `requireScreenAccess`; decidir o que fazer com `canActOnResource`/`hasPermission` (remover ou manter para um caso de uso residual — depende da resposta à pergunta em aberto sobre "editar de terceiro dentro de tela liberada").
5. Backend: plugar `requireScreenAccess(flag)` em cada `app.use(...)` relevante em `server.ts`.
6. Backend: ajustar `accountMembers.ts` (criação de membro cria a linha de permissões com os novos campos).
7. Backend: revisar `expenses.ts`/`incomes.ts`/`categories.ts`/`cards.ts`/`users.ts` — remover ou adaptar os pontos que usavam `canActOnResource` com as flags antigas.
8. Backend: `assistant.ts` — checagem adicional de `acesso_despesas`/`acesso_receitas` no fluxo de confirmação de rascunho.
9. Rodar `cd backend && npm run build`.
10. Frontend: `permissoesService.ts` — novo contrato de dados, `PERMISSION_GROUPS`.
11. Frontend: `MembrosTab.tsx` (`PermissoesDialog`) — renderização agrupada, grupo "Comercial" condicional a `contaTipo === 'empresa'`.
12. Frontend: avaliar e implementar (se necessário) ocultação de itens de navegação (`AppShell.tsx`/`ConfigPanel.tsx`) conforme toggles do membro logado.
13. Rodar build do frontend.
14. Apresentar resumo, pedir confirmação explícita separada para aplicar a migration em produção.
15. Testes manuais completos: para um membro de teste, desligar cada toggle individualmente e confirmar que a tela/rota correspondente fica inacessível (backend retorna 403); ligar de volta e confirmar acesso restaurado; confirmar que o gestor nunca é bloqueado por nenhum toggle; confirmar que o Assistente Financeiro respeita a dependência de Despesas/Receitas.

## Regras de negócio identificadas

- Um toggle por tela = acesso completo (criar/editar/excluir/ver) àquela tela.
- Todos os toggles nascem `false` (restritivo por padrão).
- Gestor sempre tem acesso total, nunca depende de toggle.
- Assistente Financeiro só cria despesas/receitas se os toggles correspondentes também estiverem ligados.
- Grupo "Comercial" só é relevante/visível em conta tipo empresa.
- Exclusão de dados de usuário (`clear-data`) não faz parte deste sistema de permissões.

## Regras multi-tenant e segurança

- A pré-condição de "mesma conta" (`sameAccount`, já implementada) continua válida como conceito, mas o novo `hasScreenAccess` é mais simples: como é sempre sobre o próprio `req.user.id` (não sobre acessar dado de terceiro), não precisa comparar dois usuários — só checar o papel (`gestor`/`admin` sempre passa) e, se `padrao`, consultar a própria linha de `member_permissions`.
- Todo enforcement real acontece no backend (middleware `requireScreenAccess` nas rotas). Qualquer ocultação de UI no frontend é cosmética, nunca a única proteção.
- Atenção especial em `/api/plans`/`/api/planos`: bloquear acesso total a essas rotas para um membro sem o toggle "Assinatura" pode impedir o app de sequer verificar o status do plano/trial corretamente — avaliar se algumas sub-rotas (ex.: `GET /plans/status`, usado por `requireActivePlan` em outras partes do fluxo) precisam ficar fora do gate por `requireScreenAccess`, para não quebrar o funcionamento básico do app para membros sem essa permissão.

## Validações necessárias

- Confirmar, antes da migration, quantos membros existem em produção e se algum tem flag antiga configurada como `true` — decide se a migration é destrutiva (Opção B) ou incremental (Opção A).
- Confirmar que nenhuma rota crítica ao funcionamento básico do app (ex.: verificação de plano/trial) fica bloqueada por engano por um `requireScreenAccess` mal posicionado.
- Confirmar que o Assistente Financeiro realmente bloqueia a criação de despesa/receita quando o toggle correspondente estiver desligado, não só o "abrir o chat".

## Testes necessários

### Backend

- Para cada um dos ~19-21 toggles: membro sem o toggle → rota(s) correspondente(s) retornam 403; com o toggle ligado → acesso normal.
- Gestor sempre acessa todas as rotas, independente de qualquer toggle.
- Assistente Financeiro: toggle "Assistente" ligado mas "Despesas" desligado → conversar funciona, mas confirmar rascunho de despesa é bloqueado.
- Criação de novo membro → linha de `member_permissions` criada automaticamente com todos os novos campos em `false`.

### Frontend

- Tela de permissões (`PermissoesDialog`) renderiza os 4 grupos corretamente, com "Comercial" aparecendo só em conta empresa.
- Alternar um toggle persiste e reflete no backend.
- Navegação (menu/abas) reflete a permissão do membro logado, se essa parte for implementada nesta rodada.

### E2E

- Fluxo completo: gestor desliga "Reservas" para um membro → membro loga → tenta acessar Reservas → recebe bloqueio consistente (backend 403, frontend trata o erro de forma clara, sem quebrar a navegação geral do app).

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Maior risco deste plano**: mudança de natureza do modelo (de "dados de terceiro" para "acesso a tela inteira") toca praticamente toda rota do backend que hoje assume implicitamente que todo `padrao` sempre acessa seus próprios dados sem checagem nenhuma — isso é uma superfície de enforcement muito maior que a Fase 3 anterior. Cada rota precisa ser revisitada com cuidado para não quebrar o uso normal do gestor nem bloquear demais/de menos um membro.
- **Rota de Planos/Assinatura**: bloquear totalmente pode quebrar a verificação básica de trial/plano ativo do app para membros sem esse toggle — exige desenho cuidadoso de quais sub-rotas ficam de fora do gate.
- **Painel/Dashboard e Notificações**: não têm endpoint dedicado claramente identificado no levantamento — a implementação precisa localizar exatamente quais chamadas alimentam essas telas antes de decidir onde plugar o middleware.
- Migration pode ser destrutiva (Opção B) dependendo do que existir em produção — diagnóstico prévio é obrigatório.
- Este é o plano de maior escopo de enforcement desde o início da iniciativa de contas familiares — recomenda-se implementação e revisão em etapas (por grupo, não tudo de uma vez), mesmo que o plano deva ser aprovado como um todo primeiro.

## Perguntas em aberto

1. **Migration Opção A vs. B**: depende do diagnóstico de produção (quantos membros/flags configuradas existem hoje) — a decidir no início da implementação, com o resultado do diagnóstico em mãos.
2. **Visão agregada da família**: a flag antiga `viewAggregateSummary` não tem um toggle equivalente explícito na nova lista de 19-21 itens — assumir que fica implícito em "Painel/Dashboard" e/ou "Relatórios" (quem tem acesso a essas telas vê a visão agregada quando ligado), ou precisa continuar existindo como toggle separado? A avaliar na implementação; se o usuário quiser um toggle dedicado, é um ajuste pequeno de escopo, não bloqueia o início do trabalho.

## Critérios de aceite do plano

- As 7 flags antigas são removidas do schema e do código.
- Os ~19-21 novos toggles existem, agrupados em 4 grupos na UI (Financeiro, Relatórios e Painel, Configurações, Comercial), sem comportamento de expandir/ocultar.
- Grupo Comercial só aparece em conta tipo empresa.
- Cada toggle bloqueia de fato o acesso à rota/tela correspondente no backend quando desligado, para membros `padrao`.
- Gestor nunca é bloqueado por nenhum toggle.
- Assistente Financeiro respeita a dependência de Despesas/Receitas para criar lançamentos.
- Nenhuma migration executada sem confirmação explícita separada do usuário.
- Build do backend e do frontend passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Rodar o diagnóstico de produção (Pergunta em aberto 1) antes de escrever a migration final.
- Não executar migrations sem confirmação explícita separada — ambiente pode ser produção.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados).
- Dado o tamanho (toca quase toda rota do backend), considerar implementar e validar por grupo (primeiro Financeiro, depois Configurações, etc.) em vez de tudo de uma vez, mesmo dentro de uma única aprovação de plano — reduz risco de regressão ampla de uma só vez.
- Este plano substitui integralmente `.plans/permissoes-configuraveis-por-membro.md` (Fase 3 anterior) como fonte de verdade sobre o sistema de permissões.
