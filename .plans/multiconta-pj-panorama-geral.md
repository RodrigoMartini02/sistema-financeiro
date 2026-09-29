# Plano de Implementação: Colaboradores em Conta PJ + Panorama Geral Multi-Conta

## Origem

- Arquivo de especificação: conversa — análise de mercado sobre multi-CNPJ (2026-09-13)
- Data do planejamento: `2026-09-13`
- Classificação: `frontend + backend + database`

## Resumo

O usuário identificou, ao analisar soluções de mercado, que quer:

1. Poder dar acesso a **colaboradores** em contas PJ específicas (hoje esse recurso existe apenas para "membro da família" em conta pessoal, e é deliberadamente bloqueado para conta `empresa`).
2. Um **Panorama Geral**: uma visão agregada, com gráficos, comparando todas as contas do usuário dono (1 PF + N PJs), acessível a partir do painel/dashboard já existente.

Investigação prévia (Explore agent + leitura direta do código) confirmou que:

- **Multi-conta já funciona 100% hoje, sem qualquer mudança**: `POST /api/contas` (`backend/src/routes/accounts.ts:97-117`) já permite criar quantas contas `empresa` o usuário quiser (só a `pessoal` é limitada a 1, por `accounts.ts:59-69`); `ContasTab.tsx` já tem o botão "Nova conta"; `useActiveAccount.ts` já troca entre contas existentes. Isso não faz parte do escopo — já está pronto.
- **`MembrosTab.tsx`/`PermissoesTab.tsx` já são parametrizados por `contaTipo`** e já trocam o texto "membro" → "colaborador" sozinhos quando a conta é `empresa`. O bloqueio está em apenas dois lugares específicos, ambos comentados como decisão deliberada:
  - `backend/src/routes/accountMembers.ts:16-19,27` (`resolveGestorAccountId`) — recusa qualquer conta que não seja `tipo === 'pessoal'`.
  - `frontend/src/layout/ConfigPanel.tsx:93-95` — esconde os itens de menu "Membros"/"Permissões" quando `contaTipo !== 'pessoal'`.
- **Isolamento entre colaboradores em PJ é intencional e deve ser preservado**: `backend/src/utils/familyVisibility.ts:10-11,41,102` trata qualquer conta que não seja `pessoal` como "sem carteira compartilhada" — cada colaborador só vê o que lançou. Esta feature não muda isso: só passa a permitir que o **vínculo** colaborador↔conta PJ exista; a visibilidade compartilhada continua exclusiva de conta pessoal.
- **Não existe hoje nenhum endpoint que agregue dados entre contas diferentes do mesmo usuário** — todos os endpoints de relatório/dashboard (`financial.ts`, `budget.ts`, `analytics.ts`, `months.ts`) operam dentro de uma única `accountId` já resolvida. O Panorama Geral é trabalho novo, não uma extensão de algo existente.

## Escopo

### Dentro do escopo

- Remover a restrição `tipo !== 'pessoal'` em `resolveGestorAccountId` (`accountMembers.ts`), permitindo que um gestor de conta `empresa` também tenha colaboradores vinculados via `conta_membros`.
- Atualizar `ConfigPanel.tsx` para exibir os itens "Membros" e "Permissões" também quando `contaTipo === 'empresa'`, com o rótulo do item de menu dinâmico ("Membros da família" para `pessoal`, "Colaboradores" para `empresa`) — hoje o label é hardcoded como "Membros da família" independente do tipo (linha 44).
- Nova migration Drizzle (aditiva, sem alterar colunas existentes): coluna `acesso_panorama_geral` (boolean, `default false`) em `membro_permissoes`, seguindo exatamente o padrão das colunas `acesso_*` já existentes.
- Novo endpoint backend `GET /api/accounts/overview` (nome sugerido, ajustável na implementação): agrega receitas/despesas por conta pertencente ao usuário autenticado (quando ele é dono) somando todas as `contas.usuario_id = req.user.id`; quando o solicitante é um colaborador/membro, aplica a nova permissão `acesso_panorama_geral` e, se concedida, agrega apenas a(s) conta(s) às quais ele tem vínculo ativo (nunca as outras contas do dono).
- Nova seção "Panorama Geral" dentro de `FinanceDashboard.tsx` (ou componente irmão dedicado, decidido na implementação), com um controle de navegação (toggle/aba) para alternar entre "conta atual" (comportamento hoje existente, inalterado) e "Panorama Geral" (agregado).
- Gráfico(s) comparando as contas no Panorama Geral (ex: barras ou donuts por conta, reaproveitando os padrões visuais já usados em `FinanceDashboard.tsx`/`memberColors.ts` quando fizer sentido).

### Fora do escopo

- Rastreio de transferências entre contas PF/PJ (ex: retirada/pró-labore) — usuário confirmou que não é necessário agora.
- Qualquer mudança no isolamento entre colaboradores de uma mesma conta PJ — continuam isolados entre si, sem carteira compartilhada, exatamente como hoje.
- Mudanças em `RepresentantesTab.tsx`/`SociosTab.tsx` — conceitos PJ já existentes e não afetados por esta feature.
- Corrigir o bug pré-existente encontrado em `familyVisibility.ts:136` (`resolveOwnerForWrite`: a query SQL `SELECT usuario_id, conta_id FROM ${tabela} WHERE id = ` está sem o placeholder `$1`, o array de parâmetros `[registroId]` nunca é usado) — reportado aqui como achado colateral, mas tratado como um item separado, não faz parte desta feature.
- Executar a migration nova — apenas o planejamento e o SQL da migration são preparados; a execução exige confirmação explícita separada, por já haver o risco documentado de o ambiente atual apontar para produção.

## Leitura de contexto

- `/AGENT.md` — lido. Documento genérico voltado a um sistema multi-prefeitura/RLS que **não corresponde à arquitetura real deste projeto** (aqui a unidade de isolamento é `conta_id`/`usuario_id`, não existe conceito de "tenant"/"prefeitura"). Os princípios de código transferíveis foram aplicados: usar Drizzle para queries novas, evitar `any`, validar entrada no backend, evitar N+1, seguir padrões já existentes antes de criar novos.
- `sistema financas/AGENT.md` — lido, conteúdo idêntico ao da raiz, mesma ressalva acima.
- Não existem `frontend/AGENT.md` ou `backend/AGENT.md` dedicados dentro de `sistema financas/` — apenas os dois arquivos genéricos acima.
- `.plans/fix-multiperfil-menu-pf.md` — lido. Plano anterior (de uma versão mais antiga do código, em JavaScript puro com `perfil_id`, já obsoleta na forma) que já havia identificado a necessidade de esconder itens de menu específicos de PJ/PF por tipo de conta — confirma que esse tipo de cuidado já é prática estabelecida no projeto, mesmo que o código daquele plano não exista mais nesta forma.
- Arquivos de código lidos diretamente nesta investigação: `backend/src/routes/accountMembers.ts`, `backend/src/utils/familyVisibility.ts`, `backend/src/db/schema/accounts.ts`, `backend/src/routes/accounts.ts`, `src/layout/ConfigPanel.tsx`, `src/hooks/useActiveAccount.ts`, `src/screens/config/ContasTab.tsx`.
- Exploração adicional (via subagente Explore) mapeou: `backend/src/db/schema/accountMembers.ts`, `backend/src/db/schema/memberPermissions.ts`, `backend/src/middleware/permissions.ts`, `backend/src/utils/accountAccess.ts`, `src/services/membrosService.ts`, `src/screens/config/MembrosTab.tsx`, `src/screens/config/PermissoesTab.tsx`, `src/screens/finance/FinanceDashboard.tsx`, `src/screens/finance/memberColors.ts`, `src/services/queryKeys.ts`.

## Impacto por área

### Frontend

- **`src/layout/ConfigPanel.tsx`**
  - Linha 95: alterar a condição `if (item.id === 'membros' || item.id === 'permissoes') return isGestor && contaTipo === 'pessoal';` para permitir também `contaTipo === 'empresa'`.
  - Linha 44: o label do item `membros` é hardcoded como `'Membros da família'`. Precisa virar dinâmico conforme `contaTipo` (`'Membros da família'` vs `'Colaboradores'`), possivelmente reaproveitando a mesma lógica de `TERMOS` já usada em `MembrosTab.tsx:17-24`.
- **`src/screens/config/MembrosTab.tsx`** e **`src/screens/config/PermissoesTab.tsx`** — já suportam `contaTipo`; validar que nenhum ajuste adicional é necessário além do desbloqueio no `ConfigPanel`.
- **`src/screens/finance/FinanceDashboard.tsx`** — adicionar controle de navegação (aba/toggle) entre visão "conta atual" (existente, inalterada) e "Panorama Geral" (nova). A nova visão consome o endpoint novo `GET /api/accounts/overview` e renderiza gráfico(s) comparando as contas do usuário.
- **`src/services/`** — novo service (ex: `accountsOverviewService.ts` ou função adicionada a serviço existente) para chamar o endpoint novo.
- **`src/services/queryKeys.ts`** — nova query key para o cache do Panorama Geral.
- Estados de loading/error/empty na nova seção, seguindo o padrão já usado no restante de `FinanceDashboard.tsx`.
- Testes: cobertura manual do toggle conta-atual/panorama, e verificação visual dos gráficos comparativos.

### Backend

- **`backend/src/routes/accountMembers.ts`**
  - `resolveGestorAccountId` (linhas 21-29): remover a checagem `account.type !== 'pessoal'` (linha 27). Atualizar o comentário nas linhas 15-19, que hoje documenta explicitamente essa restrição como intencional.
- **`backend/src/db/schema/memberPermissions.ts`** — adicionar campo `accessGeneralOverview`/`acesso_panorama_geral` (boolean, default `false`), seguindo o padrão das colunas existentes (`acesso_lancamentos_familia`, `acesso_clientes`, etc.).
- **Nova migration Drizzle** — arquivo gerado via `drizzle-kit generate` (não executado nesta etapa), adicionando a coluna `acesso_panorama_geral` em `membro_permissoes` com `DEFAULT false`.
- **Novo endpoint `GET /api/accounts/overview`** (nome definitivo a confirmar na implementação):
  - Se o solicitante é dono de contas (`contas.usuario_id = req.user.id`): agrega receitas/despesas de todas as suas contas ativas, agrupadas por `conta_id`.
  - Se o solicitante é um `conta_membros` vinculado (colaborador/membro): verificar `membro_permissoes.acesso_panorama_geral`; se `true`, agregar apenas a(s) conta(s) às quais ele está vinculado (nunca contas de outros usuários, nunca outras contas do mesmo dono às quais ele não está vinculado); se `false` ou permissão inexistente, retornar 403.
  - Seguir o padrão de `.select()` explícito (nunca `SELECT *`), com `orderBy` determinístico.
- **Middleware de permissão**: reaproveitar `requireScreenAccess`/`hasScreenAccess` de `backend/src/middleware/permissions.ts`, seguindo o mesmo padrão das demais rotas gated por `membro_permissoes`.
- Validar entrada e autenticação (`req.user!.id` como fonte confiável, nunca aceitar `usuario_id`/`conta_id` vindo do client sem checagem de posse).

### Banco de dados

- **Migration nova, aditiva**: coluna `acesso_panorama_geral BOOLEAN NOT NULL DEFAULT false` em `membro_permissoes`.
- Sem alteração em colunas existentes, sem risco de perda de dados.
- **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado. Nenhuma variável de ambiente nova.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/accountMembers.ts`
- `sistema financas/backend/src/db/schema/memberPermissions.ts`
- `sistema financas/backend/drizzle/00XX_acesso_panorama_geral.sql` (gerado pela migration)
- `sistema financas/backend/src/routes/accounts.ts` (ou novo arquivo de rota dedicado ao overview)
- `sistema financas/backend/src/middleware/permissions.ts` (possível extensão do tipo `PermissionFlag`)
- `sistema financas/src/layout/ConfigPanel.tsx`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`
- `sistema financas/src/services/queryKeys.ts`
- Novo service frontend para o endpoint de overview

## Estratégia de implementação

1. **Schema e migration**
   - Adicionar `acesso_panorama_geral` em `backend/src/db/schema/memberPermissions.ts`.
   - Gerar a migration Drizzle correspondente (sem executar).
2. **Backend — desbloquear colaborador em PJ**
   - Remover a checagem `type !== 'pessoal'` em `resolveGestorAccountId` (`accountMembers.ts`).
   - Atualizar comentários que descreviam a restrição anterior.
   - Confirmar que `familyVisibility.ts` permanece inalterado (isolamento de PJ continua).
3. **Backend — endpoint de overview**
   - Criar rota `GET /api/accounts/overview` com a lógica de agregação por conta, já checando dono vs. colaborador e a permissão nova.
   - Adicionar tipo `PermissionFlag` correspondente em `middleware/permissions.ts`, se necessário.
4. **Frontend — desbloquear menu**
   - Ajustar a condição de visibilidade em `ConfigPanel.tsx:95`.
   - Tornar o label do item `membros` dinâmico por `contaTipo`.
5. **Frontend — Panorama Geral**
   - Criar o service de consumo do endpoint novo.
   - Adicionar o controle de navegação (toggle/aba) em `FinanceDashboard.tsx`.
   - Implementar a visão agregada com gráfico(s) comparando contas.
   - Tratar estados de loading/error/empty (ex: usuário com apenas 1 conta).
6. **Validação**
   - Rodar comandos de validação (lint, typecheck, build) em frontend e backend.
   - Testar manualmente: dono com múltiplas contas vendo o Panorama; colaborador de PJ sem a permissão recebendo 403; colaborador de PJ com a permissão vendo apenas a conta dele; menu "Membros"/"Permissões" aparecendo corretamente para conta `empresa`.

## Regras de negócio identificadas

- Uma conta `pessoal` é única por usuário (`accounts.ts:59-69`); contas `empresa` não têm limite.
- Colaborador de conta PJ é um vínculo `conta_membros` como já existe para família — só o gate de `tipo` muda.
- Colaboradores em PJ continuam isolados entre si (sem carteira compartilhada) — isso não muda.
- Panorama Geral: dono sempre vê todas as suas contas; colaborador só vê o panorama se a permissão `acesso_panorama_geral` estiver concedida, e mesmo assim só enxerga as contas às quais está vinculado.

## Regras multi-tenant e segurança

(Traduzindo para o vocabulário real do projeto: "tenant" = conta/usuário dono, não prefeitura)

- O `usuario_id` do solicitante deve vir sempre de `req.user!.id` (JWT autenticado), nunca de parâmetro de rota ou body.
- O endpoint de overview nunca deve agregar contas de um usuário dono diferente do solicitante, exceto quando o solicitante é colaborador explicitamente vinculado via `conta_membros` com status `ativo`.
- A permissão `acesso_panorama_geral` deve ser checada no backend (rota), nunca apenas ocultada no frontend.
- Reverter o bloqueio de `resolveGestorAccountId` é uma mudança de comportamento deliberado documentada em comentário — checar se não há nenhum outro ponto do código que dependa implicitamente de "colaborador só existe em conta pessoal" antes de generalizar.

## Validações necessárias

- Backend: validar que a conta do gestor existe e pertence a ele antes de permitir criação de colaborador em PJ.
- Backend: validar `conta_id` do overview sempre a partir do vínculo real do solicitante, nunca de query string livre.
- Frontend: nenhuma validação de formulário nova além do que já existe em `MembrosTab`/`PermissoesTab`.

## Testes necessários

### Frontend

- Menu de Configurações com conta `empresa` ativa exibe "Colaboradores"/"Permissões".
- Menu de Configurações com conta `pessoal` ativa continua exibindo "Membros da família" como hoje.
- Toggle "conta atual" ↔ "Panorama Geral" no dashboard funciona e preserva a visão atual inalterada.
- Panorama Geral exibe corretamente quando o usuário tem apenas 1 conta (estado quase-vazio) e quando tem várias.

### Backend

- `POST /api/account-members` aceita criação de colaborador quando a conta padrão do gestor é `empresa`.
- `GET /api/accounts/overview` retorna 403 para colaborador sem a permissão nova.
- `GET /api/accounts/overview` retorna apenas as contas corretas para dono vs. colaborador.
- `familyVisibility.ts` permanece com o mesmo comportamento de isolamento para `empresa` (nenhuma regressão).

### E2E

- Fluxo completo: gestor de conta PJ cria colaborador → concede `acesso_panorama_geral` → colaborador loga e vê o Panorama Geral restrito às contas dele.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

(Ajustar nomes de script conforme o que existir de fato em cada `package.json` — confirmar na implementação.)

## Riscos e pontos de atenção

- **Migration em ambiente potencialmente de produção**: a coluna nova é aditiva e de baixo risco técnico, mas não deve ser executada sem confirmação explícita, por instrução do projeto.
- **Reversão de decisão deliberada**: o bloqueio de colaborador em PJ tinha um motivo documentado (isolamento). É preciso validar que nenhuma outra parte do sistema assume implicitamente essa restrição (ex: telas de faturamento/contratos que usam `socios`/`representantes` como as únicas "pessoas" de uma PJ).
- **Vazamento entre contas no endpoint de overview**: é o ponto de maior atenção de segurança desta feature — uma query mal filtrada agregaria contas de outro usuário. Exige teste explícito de colaborador tentando acessar overview de conta à qual não está vinculado.
- **Bug pré-existente identificado em `familyVisibility.ts:136`**: fora do escopo, mas deve ser comunicado como achado — a função `resolveOwnerForWrite` tem uma query sem placeholder de parâmetro, o que pode estar causando erro silencioso ou comportamento incorreto ao resolver o dono de um registro de despesa/receita para edição por terceiros.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões (isolamento de colaborador PJ, localização do Panorama Geral, modelo de permissão) foram coletadas e aplicadas acima.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Gestor de conta `empresa` consegue criar e gerenciar colaboradores, com o menu exibindo "Colaboradores"/"Permissões" corretamente.
- Conta `pessoal` mantém o comportamento atual sem nenhuma regressão.
- Migration da coluna `acesso_panorama_geral` está gerada (não necessariamente executada).
- Endpoint `GET /api/accounts/overview` agrega corretamente por conta, respeitando dono vs. colaborador e a nova permissão.
- Painel exibe o Panorama Geral com gráfico(s) comparando contas, acessível por navegação a partir do dashboard existente.
- `lint`, `typecheck` e `build` passam em frontend e backend.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration sem confirmação explícita do usuário.
- Não alterar `.env`.
- Seguir `/AGENT.md` e `sistema financas/AGENT.md` apenas nos princípios de código transferíveis (Drizzle, sem `any`, validação no backend); ignorar o vocabulário "prefeitura/tenant" que não existe neste projeto — usar `conta_id`/`usuario_id` como unidade real de isolamento.
- Manter alterações pequenas e focadas: a remoção do bloqueio de colaborador PJ deve ser cirúrgica (`accountMembers.ts:27` + comentário), sem tocar em `familyVisibility.ts`.
- Não corrigir o bug de `familyVisibility.ts:136` como parte desta feature — apenas reportar, a menos que o usuário peça explicitamente para incluir a correção.
- Não abrir PR sem instrução explícita do usuário — projeto vai direto para `main` via skill `finalizar`.
