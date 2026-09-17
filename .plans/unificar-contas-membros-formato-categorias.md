# Plano de Implementação: Unificar Contas e Membros no formato de Categorias

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída interativamente nesta conversa (pedido do usuário + investigação de código + decisões coletadas).
- Data do planejamento: `2026-09-17`
- Classificação: `fullstack` (sem impacto de banco de dados — `accountMembers.accountId` já existe no schema)

## Resumo

Hoje "Contas" e "Membros" são telas separadas no painel de Configurações. Todas as rotas de `account-members` (listar, criar, pendências, desativar) sempre resolvem a **conta padrão** do gestor, ignorando outras contas que ele possa ter — então um dono com múltiplas empresas nunca consegue ver/gerenciar colaboradores de uma empresa secundária. A tela de Categorias já resolve um problema estrutural parecido com uma lista hierárquica expansível (categoria → subcategorias). Este plano leva o mesmo padrão visual e de interação para Contas: cada conta vira uma linha expansível, e dentro dela aparecem os membros/colaboradores vinculados especificamente àquela conta. O item de menu "Membros" é removido, já que sua função passa a viver dentro de "Contas".

## Escopo

### Dentro do escopo

- Rotas de `/api/account-members` (listar, criar, pendências, desativar) passam a aceitar `conta_id` explícito, validando que a conta pertence ao gestor autenticado.
- `ContasTab` renderiza cada conta como linha expansível (estilo `CategoriaRow`): índice, nome, badges, chevron de expandir/recolher.
- Ao expandir uma conta, exibe a lista de membros/colaboradores vinculados a ela, reaproveitando a lógica existente de `MembrosTab` (criar, desativar, transferir pendências) — agora escopada pelo `conta_id` daquela conta específica.
- Remoção do item de menu "Membros" em `ConfigPanel.tsx`.

### Fora do escopo

- Qualquer mudança na tela "Permissões" — ela continua restrita à conta ativa selecionada no cabeçalho do app, sem seletor de conta adicional.
- Qualquer mudança de schema/migration — `accountMembers.accountId` já existe e já é `notNull`.
- Mudanças em `escalacao futebol` ou qualquer outro subprojeto.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo) — lido.
- `sistema financas/AGENT.md` — lido (idêntico ao da raiz neste projeto).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas` — as regras usadas são as do `AGENT.md` do projeto.
- Nenhum arquivo `.md` de especificação foi fornecido; a especificação foi construída interativamente.
- Arquivos de código lidos/inspecionados: `src/screens/config/CategoriasTab.tsx`, `src/screens/config/ContasTab.tsx`, `src/screens/config/MembrosTab.tsx`, `src/screens/config/PermissoesTab.tsx`, `src/layout/ConfigPanel.tsx`, `src/services/membrosService.ts`, `backend/src/routes/accountMembers.ts`, `backend/src/db/schema/accountMembers.ts`.

## Impacto por área

### Frontend

- `src/screens/config/ContasTab.tsx`: adicionar estado de expansão por conta (`collapsed: number[]`, mesmo padrão de `CategoriasTab`); ao expandir, renderizar a lista de membros daquela conta (reaproveitando `NovoMembroDialog`, `TransferirPendenciasDialog` e a lógica de mutations hoje em `MembrosTab.tsx`); adaptar `ConfigListRow`/criar variante de linha com chevron de expandir, similar a `CategoriaRow`.
- `src/screens/config/MembrosTab.tsx`: lógica de UI (diálogos, mutations) é movida/reaproveitada dentro de `ContasTab.tsx`; o arquivo pode deixar de ser usado como tela própria, mas seus componentes internos (`NovoMembroDialog`, `TransferirPendenciasDialog`) podem continuar existindo como exports reaproveitados, ou serem colocados em `ContasTab.tsx` diretamente — decisão de implementação a critério de quem implementar, seguindo o padrão mais simples e menos duplicado.
- `src/services/membrosService.ts`: `fetchMembros`, `createMembro`, `fetchMembroPendencias`, `deactivateMembro` passam a aceitar um `contaId` opcional, repassado como query param/body para o backend.
- `src/layout/ConfigPanel.tsx`: remover o item `membros` de `ITEMS` e do bloco de renderização condicional (`{current.id === 'membros' && <MembrosTab .../>}`). Nenhuma mudança na tela de Permissões.
- Query keys: `queryKeys.contas`, e a atual `['membros-list']` (hoje hardcoded, fora do padrão `queryKeys` centralizado) devem passar a incluir o `contaId` na chave, para que a invalidação e o cache funcionem corretamente por conta.

### Backend

- `backend/src/routes/accountMembers.ts`: adicionar uma função `resolveAccountIdForGestor(gestorId, contaIdParam)` que, se `contaIdParam` for informado, valida `accounts.id = contaIdParam AND accounts.userId = gestorId` (rejeitando contas de outro dono); sem `contaIdParam`, mantém o fallback atual (`resolveGestorAccountId`, conta padrão) para compatibilidade.
- Aplicar essa função em: `GET /` (listar membros), `POST /` (criar membro), `GET /:id/pending`, `PUT /:id/deactivate`.
- Nenhuma mudança nas rotas `GET /summary`, `GET /overview`, `GET /me/permissions`, `GET /:id/permissions`, `PUT /:id/permissions` (fora do escopo, conforme decisão 2).

### Banco de dados

`Sem impacto esperado` — `accountMembers.accountId` já existe no schema e já é obrigatório (`notNull`, referencia `accounts.id`). Nenhuma migration necessária.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `src/screens/config/ContasTab.tsx`
- `src/screens/config/MembrosTab.tsx`
- `src/services/membrosService.ts`
- `src/layout/ConfigPanel.tsx`
- `src/services/queryKeys.ts` (se `membros-list` for migrado para o padrão centralizado)

## Estratégia de implementação

1. Backend: criar `resolveAccountIdForGestor` em `accountMembers.ts` e aplicá-la nas 4 rotas relevantes (`GET /`, `POST /`, `GET /:id/pending`, `PUT /:id/deactivate`), aceitando `conta_id` opcional via query/body conforme o verbo.
2. Frontend: atualizar `membrosService.ts` para repassar `contaId` opcional em cada chamada.
3. Frontend: adaptar `ContasTab.tsx` para renderizar linhas expansíveis por conta, reaproveitando diálogos e mutations de `MembrosTab.tsx` (criar, desativar, transferir pendências), escopados pelo `conta_id` da conta expandida.
4. Frontend: remover o item `membros` de `ConfigPanel.tsx` (menu e renderização condicional).
5. Validar manualmente: criar conta secundária de teste, adicionar membro/colaborador a ela, confirmar que aparece só ao expandir aquela conta (não a padrão), desativar e confirmar fluxo de transferência de pendências.

## Regras de negócio identificadas

- Um usuário só pode ser membro de **uma** conta por vez (`accountMembers.userId` é `unique()`), então não há ambiguidade de "a quem pertence" um membro.
- Em conta tipo `pessoal`, membros são chamados de "membro" (carteira compartilhada); em conta tipo `empresa`, de "colaborador" (isolados entre si) — mesmo dado, termo diferente por tipo de conta (`TERMOS` em `MembrosTab.tsx`).
- Gestão de permissões (`PermissoesTab`) nunca é delegável a outro membro, e continua restrita à conta ativa — não precisa navegar entre contas.
- A conta a ser usada em cada rota de `account-members` deve sempre pertencer ao gestor autenticado — nunca confiar em `conta_id` vindo do client sem validar propriedade.

## Regras multi-tenant e segurança

- Este projeto não é multi-tenant/multi-prefeitura como o `AGENT.md` da raiz descreve (esse contexto pertence ao outro subprojeto do monorepo, `escalacao futebol`) — aqui a separação é por `usuario_id`/`conta_id` de cada gestor.
- Toda rota que passa a aceitar `conta_id` do client deve validar que `accounts.userId = req.user.id` antes de usá-la — nunca confiar no valor recebido sem essa checagem, para não permitir que um gestor veja/gerencie membros de conta de outro usuário.
- Nenhuma alteração deve enfraquecer `requireGestor` (gestão de membros nunca delegável a um membro comum).

## Validações necessárias

- Backend: validar que `conta_id` informado existe e pertence ao gestor autenticado antes de usá-lo em qualquer query.
- Backend: manter validações existentes (email único, documento único/válido, senha mínima 6 caracteres) inalteradas.
- Frontend: tratar estados de loading/error/empty por conta expandida (ex: conta recém-criada sem membros ainda).

## Testes necessários

### Frontend

- Expandir uma conta sem membros → mostra estado vazio apropriado.
- Expandir uma conta com membros → lista aparece corretamente, escopada àquela conta.
- Criar membro dentro de uma conta específica → aparece só nela, não em outras contas expandidas.

### Backend

- `GET /account-members?conta_id=X` retorna só membros de X.
- `POST /account-members` com `conta_id` de conta que não pertence ao gestor autenticado → deve ser rejeitado (403/404).
- Comportamento sem `conta_id` (compatibilidade) continua idêntico ao atual (conta padrão).

### E2E

- Fluxo completo: gestor com 2 contas (PF + empresa) cria um colaborador na empresa, expande a conta PF e confirma que o colaborador não aparece lá; expande a empresa e confirma que aparece.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

## Riscos e pontos de atenção

- Mudança de navegação visível a todo gestor (remoção do item "Membros") — usuários acostumados com o menu atual precisam se adaptar ao novo local dentro de "Contas".
- Risco de regressão: as chamadas existentes de `fetchMembros()`/`createMembro()` sem `contaId` (ex.: dentro de `FinanceDashboard.tsx`, que usa `fetchMembros` para saber se `temMembros`) precisam continuar funcionando com o comportamento atual (conta padrão) — checar todos os consumidores de `membrosService.ts` antes de mudar a assinatura das funções.
- `PermissoesTab` não muda neste plano, mas continua com a mesma limitação de mostrar só membros da conta ativa — isso é intencional pela decisão 2, não um bug remanescente.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as duas decisões necessárias já foram coletadas.

## Critérios de aceite do plano

- Cada conta na tela "Contas" pode ser expandida para mostrar seus membros/colaboradores vinculados.
- Criar, desativar e transferir pendências de membro funciona corretamente escopado à conta expandida.
- O item de menu "Membros" não existe mais separadamente.
- `PermissoesTab` continua funcionando exatamente como hoje, sem alteração.
- Chamadas existentes que dependem do comportamento de conta padrão (sem `conta_id`) continuam funcionando sem regressão.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto — não há arquivo `.md` de spec externo.
- Não executar migrations (não há necessidade neste plano).
- Seguir `AGENT.md` da raiz e de `sistema financas` (idênticos neste projeto).
- Antes de mudar a assinatura de `membrosService.ts`, mapear todos os consumidores existentes (`FinanceDashboard.tsx` usa `fetchMembros` para `temMembros`) para garantir que o parâmetro `contaId` seja opcional e não quebre chamadas atuais.
- Reaproveitar componentes existentes de `MembrosTab.tsx` em vez de duplicar lógica de diálogos/mutations.
