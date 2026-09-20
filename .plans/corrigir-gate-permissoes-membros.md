# Plano de Implementação: Corrigir gate de "ver outros membros" e esconder UI sem permissão

## Origem

- Arquivo de especificação: nenhum (originado de auditoria conduzida diretamente na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `fullstack`

## Resumo

Três ajustes decorrentes da auditoria de permissões desta conversa: (1) o gate de `GET /api/account-members` usa hoje `accessMembers`, uma flag rotulada como "acesso à tela de Membros" mas que na prática controla se um membro vê outros lançamentos da família/equipe nas telas financeiras — troca para `accessFamilyEntries`, que já expressa essa intenção; (2) a aba "Assinatura" no painel de configurações aparece para qualquer usuário, incluindo membros, quando deveria ser exclusiva de titular/admin; (3) o toggle "Panorama Geral" no Dashboard aparece sem checar permissão, resultando em erro 403 só depois do clique — passa a se esconder de antemão.

## Escopo

### Dentro do escopo

- Trocar a checagem em `GET /api/account-members` de `accessMembers` para `accessFamilyEntries`.
- Esconder o item "Assinatura" do `ConfigPanel` para quem não é titular/admin.
- Esconder a opção "Panorama Geral" do toggle em `FinanceDashboard.tsx` quando `accessGeneralOverview` estiver desligada.

### Fora do escopo

- Remoção da coluna/flag `accessMembers` (fica sem consumidor real após esta mudança, mas será tratada em decisão futura separada).
- Ajuste de rótulo de `accessFamilyEntries` para contexto de conta empresa (aceito reaproveitar tal como está).
- As outras ~18 permissões que só bloqueiam API sem gate visual (decisão já tomada anteriormente: manter como está).
- Investigação do seletor de "Carteira da família" (decisão já tomada: não investigar agora).
- Qualquer mudança em `PermissoesTab.tsx` (labels, agrupamento).

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `backend/src/routes/accountMembers.ts`, `backend/src/middleware/permissions.ts`, `src/services/membrosService.ts`, `src/screens/despesas/DespesasScreen.tsx`, `src/layout/ConfigPanel.tsx`, `src/layout/AppShell.tsx`, `src/screens/finance/FinanceDashboard.tsx`.

## Impacto por área

### Frontend

- `src/layout/ConfigPanel.tsx`: adicionar filtro `if (item.id === 'assinatura') return isGestor;` dentro de `visibleItems` (linha ~88-100), mesmo padrão já usado para `acessos`/`integracoes-ia`/`permissoes`.
- `src/screens/finance/FinanceDashboard.tsx`: consultar `fetchOwnPermissions` via `useQuery` (mesma queryKey `['own-permissions']` e padrão já usado em `src/layout/AppShell.tsx:174-179`, aproveitando o cache compartilhado do React Query) e filtrar a opção `{ id: 'panorama', label: 'Panorama Geral' }` do array de opções do toggle (linha ~299-302) com base em `ownPermissions?.accessGeneralOverview ?? true`.
- Sem mudança de query keys novas, hooks novos, ou schemas de formulário.

### Backend

- `backend/src/routes/accountMembers.ts`, rota `GET /` (linha ~80): trocar `hasScreenAccess(req.user!.id, 'accessMembers')` por `hasScreenAccess(req.user!.id, 'accessFamilyEntries')`.
- Atualizar o comentário da rota (linhas 52-61) para refletir a nova regra de negócio.
- Sem mudança de schema, sem nova rota, sem nova validação de payload.

### Banco de dados

`Sem impacto esperado`. Nenhuma alteração de schema, tabela ou coluna.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `src/layout/ConfigPanel.tsx`
- `src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Backend: em `accountMembers.ts`, trocar a chamada `hasScreenAccess(..., 'accessMembers')` por `hasScreenAccess(..., 'accessFamilyEntries')` na rota `GET /`; atualizar o comentário explicativo acima da rota.
2. Frontend: em `ConfigPanel.tsx`, adicionar a condição de visibilidade do item `assinatura` ao filtro `visibleItems`.
3. Frontend: em `FinanceDashboard.tsx`, adicionar `useQuery` para `fetchOwnPermissions` (importar de `permissoesService.ts` ou de onde `AppShell.tsx` importa) e usar o resultado para filtrar a opção "Panorama Geral" do array de toggle antes de renderizar.
4. Rodar build (`tsc --noEmit` frontend e backend, `vite build`) e validar visualmente: (a) membro sem `accessFamilyEntries` não vê mais outros membros/opção família; (b) membro comum não vê mais aba Assinatura; (c) membro sem `accessGeneralOverview` não vê mais a opção Panorama Geral.

## Regras de negócio identificadas

- `accessFamilyEntries` passa a ser a permissão única que controla tanto "ver lançamentos de outros membros" quanto "ver a lista de outros membros" (que alimenta a decisão de mostrar a opção "Família" nas telas financeiras).
- Aba "Assinatura"/gerenciamento de plano é exclusiva de titular/admin — membro nunca deve vê-la, independentemente de qualquer flag futura.
- "Panorama Geral" só deve ser oferecido como opção quando `accessGeneralOverview` estiver ligada (ou o usuário for titular/admin, que sempre recebe `true` do backend).

## Regras multi-tenant e segurança

- Nenhuma mudança de autorização no backend além da troca de flag verificada — a validação de propriedade de conta (`resolveMemberAccountId`, `resolveAccountIdForGestor`) permanece intocada.
- O gate de segurança real (backend) para Panorama Geral já existe e não muda (`accountMembers.ts:635`); esta mudança é só de UX (esconder antes de tentar), não de segurança.
- Sem risco de vazamento entre contas: a troca de flag não altera o filtro de `conta_id`, só qual permissão booleana é consultada.

## Validações necessárias

- Confirmar que `hasScreenAccess` aceita `'accessFamilyEntries'` como valor válido de `PermissionFlag` (já é uma das 23 flags existentes, portanto sim).
- Confirmar visualmente nas 3 áreas afetadas, com um usuário membro de teste com diferentes combinações de flags.

## Testes necessários

### Frontend

- Membro sem `accessFamilyEntries`: não vê a opção "Família" em Despesas/Receitas/Dashboard/Orçamento/Cartões (comportamento herdado, deve continuar).
- Membro sem `accessSubscription`/comum: aba "Assinatura" não aparece no ConfigPanel.
- Titular/admin: aba "Assinatura" continua aparecendo normalmente.
- Membro sem `accessGeneralOverview`: toggle do Dashboard mostra só "Esta conta", sem "Panorama Geral".
- Membro com `accessGeneralOverview`: toggle mostra as duas opções normalmente.

### Backend

- `GET /api/account-members` com membro sem `accessFamilyEntries`: retorna só o próprio registro.
- `GET /api/account-members` com membro com `accessFamilyEntries`: retorna lista completa da conta.
- Titular/admin: sempre lista completa, como já é hoje (não depende de flag).

### E2E

Não aplicável — mudanças pequenas e cobertas pelos testes manuais acima.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Titulares que já configuraram `accessMembers=true` para algum membro terão esse membro perdendo a visão de lista/família após o deploy, até que liguem `accessFamilyEntries` manualmente — não há migração de dados neste plano, é troca de comportamento, não de dados armazenados.
- `accessMembers` fica sem nenhum consumidor real no código após esta mudança — risco de confusão futura se alguém assumir que ela ainda faz algo; fica registrado como pendência conhecida, não tratada aqui.
- Rótulo de `accessFamilyEntries` ("Ver lançamentos dos outros membros") pode soar levemente deslocado em contexto de conta empresa (colaboradores, não família) — aceito explicitamente pelo usuário, sem ajuste de texto neste plano.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — ambas as decisões pendentes foram resolvidas.

## Critérios de aceite do plano

- `GET /api/account-members` usa `accessFamilyEntries` em vez de `accessMembers` para decidir escopo de listagem.
- Aba "Assinatura" só visível para titular/admin no `ConfigPanel`.
- Toggle "Panorama Geral" só aparece quando `accessGeneralOverview` está ligada (ou usuário é titular/admin).
- Build (`tsc --noEmit` backend e frontend, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Mudança pequena e cirúrgica em 3 arquivos — não tocar em `PermissoesTab.tsx`, `permissoesService.ts`, nem em `accessMembers` como schema/coluna.
- Não executar migrations (não há nenhuma neste plano).
- Não remover `accessMembers` — isso é pendência futura, fora deste escopo.
