# Plano de Implementação: Restaurar proteção do Perfil Pessoal + reativação manual

## Origem

- Arquivo de especificação: descrição textual do usuário (bug crítico reportado ao vivo) + relatório de investigação profunda feito por agente Explore (somente leitura, sem edição)
- Data do planejamento: 2026-09-02
- Classificação: `frontend + backend`

## Resumo

Investigação profunda (agente dedicado, leitura de auth/JWT, todas as tabelas com `usuario_id`/`perfil_id`, cadastro, toda a superfície frontend Conta-vs-Perfil, sobreposição de rotas `users`/`profiles`, regra de arquivamento, e `git diff`/`git log`) confirmou a causa raiz de 3 bugs relatados nesta sessão (erro "Perfil financeiro não encontrado" no Planejamento, card de Categorias sumido no Painel, e a contradição visual "logado num perfil que está desativado"):

**Nesta própria sessão de trabalho, ainda não commitada** (branch `feat/R/unificar-conta-perfis`, plano de origem `.plans/unificar-conta-perfis-login-documento.md`), duas mudanças em conjunto quebraram uma invariante de segurança de dados:

1. `git diff backend/src/routes/profiles.ts` mostra que a guarda categórica que impedia arquivar ou editar o tipo do perfil `pessoal` (`if (profile.type === 'pessoal') { ... 'Cannot archive the personal profile' }`) foi **removida** e substituída por uma contagem genérica (`activeProfiles.length <= 1`), que só bloqueia se for o **último** perfil ativo de qualquer tipo — não mais uma proteção específica ao perfil Pessoal.
2. O frontend introduziu um item sintético `ContaPrincipalItem` (`src/types/config.ts`) representando "a Conta" (o próprio usuário/login) como mais um perfil navegável, com o campo `ativo: true` **hardcoded** — nunca refletindo o banco. Isso deu a impressão, na UI, de que "sempre sobra um lugar seguro para estar", mesmo quando o usuário tinha apenas 1 Perfil real restante.

Com ≥2 perfis ativos (Pessoal + ao menos 1 Empresa), a nova contagem permitiu arquivar o Perfil Pessoal do usuário sem aviso. Depois disso, o usuário ficou sem forma de recuperação pela UI: não existe endpoint de reativação; `POST /api/profiles` bloqueia recriar um "pessoal" porque a checagem de duplicidade não filtra por `ativo` (o perfil arquivado ainda conta como "já existe"); e `GET /api/profiles` só lista perfis ativos, escondendo o arquivado por completo.

Em paralelo, `resolveFinancialProfile` (`backend/src/services/budgetService.ts`) exige um perfil `pessoal` com `ativo=true` quando nenhum `perfil_id` é enviado — e "Conta selecionada" no frontend se traduz, no protocolo HTTP, em não enviar `perfil_id` (`getActiveProfileId()` retorna `null` para o sentinel `'conta'`, já que `Number('conta')` é `NaN`). Por isso a tela de Planejamento e o card de Categorias do Painel quebraram especificamente para este usuário.

**Ação emergencial já executada nesta sessão, com confirmação explícita do usuário**: `UPDATE perfis SET ativo = true WHERE id = 3` rodado diretamente em produção, reativando o Perfil Pessoal do usuário (id 3, "Pessoal", com 104 despesas e 8 receitas vinculadas). Isso destrava o uso imediato, mas não corrige a causa — sem as mudanças deste plano, o mesmo problema pode se repetar (para este ou outro usuário).

**Decisão explícita do usuário sobre o escopo da correção**: não reverter amplamente o working tree (40+ arquivos modificados não commitados, incluindo várias features/correções não relacionadas ao bug — PWA, gráfico anual, scroll mobile, gênero do assistente etc.). A correção deve ser cirúrgica, tocando apenas os arquivos listados abaixo.

## Escopo

### Dentro do escopo

- Restaurar, em `backend/src/routes/profiles.ts`, uma proteção específica ao perfil `pessoal` em `DELETE /:id` (arquivar) e `PUT /:id` (editar tipo/dados), somada à contagem já existente — não pode ser removida a checagem de "último perfil ativo", só reforçada para nunca deixar o `pessoal` ficar sem proteção adicional quando for o único de seu tipo
- Nova rota `PUT /api/profiles/:id/reactivate` (reativa um perfil arquivado, valida propriedade)
- `GET /api/profiles`: aceitar `?incluir_inativos=true` opcional, mantendo o comportamento padrão (só ativos) quando omitido
- Corrigir `POST /api/profiles`: a checagem de "perfil pessoal já existe" (branch `tipo === 'pessoal'`) deve considerar apenas perfis **ativos** — hoje bloqueia recriação mesmo com o único perfil pessoal arquivado
- Frontend `PerfisTab.tsx`: toggle "Ativos / Desativados"; botão "Reativar" nos perfis desativados; tag "Perfil original" no perfil mais antigo do usuário (por `data_criacao`)
- Frontend `useActiveProfile.ts`/`AccountProfileMenu.tsx`/`types/config.ts`: o item sintético "Conta" deixa de ter `ativo: true` hardcoded — deve refletir se há de fato algum Perfil real por trás, evitando a falsa sensação de "sempre há um lugar seguro"

### Fora do escopo

- Qualquer reversão ampla do working tree — os 40+ arquivos modificados não relacionados a este bug permanecem intocados
- Unificação estrutural completa de `usuarios`+`perfis` numa tabela só (mudança de schema maior, identificada pela investigação como possível direção futura, mas não decidida nem autorizada agora)
- Consolidar as rotas duplicadas `users.ts`/`profiles.ts` (8 campos sobrepostos: nome, email, documento, telefone, data_nascimento, foto, ativo/status, tipo) — mapeado pela investigação, mas tratado como problema separado, não bloqueante para este bug
- Migrations de schema novas — reaproveita colunas já existentes (`perfis.ativo`, `perfis.data_criacao`)
- Qualquer mudança na feature de foto por perfil, no bug de telefone/data de nascimento da Conta, ou no filtro de período do Painel — todos tratados em planos separados já existentes

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Relatório do agente Explore (leitura completa de `backend/src/middleware/auth.ts`, `backend/src/routes/auth.ts`, todos os schemas com `usuario_id`/`perfil_id`, `backend/src/utils/profileFilter.ts`, `backend/src/utils/ownerAndProfileWhere.ts`, `backend/src/services/budgetService.ts`, `backend/src/routes/users.ts`, `backend/src/routes/profiles.ts`, `src/hooks/useActiveProfile.ts`, `src/layout/AccountProfileMenu.tsx`, `src/types/config.ts`, `src/screens/config/PerfisTab.tsx`, `src/layout/ConfigPanel.tsx`, `src/layout/AppShell.tsx`, `src/services/apiClient.ts`, e `git log`/`git diff` relevantes)
- `.plans/unificar-conta-perfis-login-documento.md` (plano de origem da feature em andamento, não commitada)
- `backend/src/services/profileBackfill.ts` (função `ensureUserHasProfile`, já implementada nesta sessão em plano anterior — não corrige este caso, pois só age quando o usuário tem **zero** perfis ativos)

## Impacto por área

### Frontend

- `src/types/config.ts`: `ContaPrincipalItem.ativo` deixa de ser o tipo literal `true` — passa a refletir se existe algum Perfil real ativo, ou é removido do item sintético se não fizer mais sentido semântico após a correção
- `src/hooks/useActiveProfile.ts`: revisar o comportamento quando "Conta" está selecionada mas não há nenhum Perfil ativo — hoje a auto-correção (`useEffect` que faz fallback para `data[0]`) é pulada especificamente nesse caso (`if (!enabled || isContaSelecionada) return;`), o que precisa ser reavaliado para não repetir a falsa sensação de segurança
- `src/layout/AccountProfileMenu.tsx`: sem mudança estrutural obrigatória, mas validar que a tag "Conta" não sugere uma falsa garantia de disponibilidade de dados financeiros
- `src/screens/config/PerfisTab.tsx`: novo toggle "Ativos / Desativados" (estado local, filtra a lista exibida); botão "Reativar" chamando a nova rota; tag "Perfil original" calculada client-side pelo menor `data_criacao` entre os perfis do usuário
- `src/services/configService.ts`: nova função `reactivatePerfil(id)`; `fetchPerfis` ganha parâmetro opcional para incluir inativos

### Backend

- `backend/src/routes/profiles.ts`:
  - `DELETE /:id`: adicionar checagem específica — se `profile.type === 'pessoal'` e não há nenhum outro perfil `pessoal` ativo do mesmo usuário, bloquear arquivamento com mensagemclara, independente da contagem geral de perfis ativos
  - `PUT /:id`: mesma checagem para impedir mudança de `type` que deixaria o usuário sem nenhum perfil pessoal (se aplicável ao fluxo atual de edição — confirmar se `PUT` permite trocar `type` hoje; se não permitir, não é necessário mexer aqui)
  - `POST /:id/reactivate` (nova rota): valida propriedade (`eq(profiles.id, profileId), eq(profiles.userId, req.user!.id)`), seta `active: true`
  - `GET /`: aceitar `req.query.incluir_inativos === 'true'` para remover o filtro `AND ativo = true` da query SQL
  - `POST /`: no branch `tipo === 'pessoal'`, adicionar `eq(profiles.active, true)` à checagem de duplicidade
- Sem mudança em `resolveFinancialProfile`/`budgetService.ts` — a causa já está sendo corrigida na origem (impedir o estado inválido), não no consumo
- Sem impacto em relatórios/PDFs

### Banco de dados

`Sem impacto esperado` — nenhuma migration nova; reaproveita colunas já existentes (`perfis.ativo`, `perfis.data_criacao`, `perfis.tipo`)

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/src/routes/profiles.ts`
- `src/types/config.ts`
- `src/hooks/useActiveProfile.ts`
- `src/layout/AccountProfileMenu.tsx`
- `src/screens/config/PerfisTab.tsx`
- `src/services/configService.ts`

## Estratégia de implementação

1. `backend/src/routes/profiles.ts`: adicionar checagem específica de proteção ao perfil `pessoal` em `DELETE /:id`
2. Adicionar rota `PUT /:id/reactivate`
3. Corrigir `GET /` (parâmetro `incluir_inativos`) e `POST /` (checagem de duplicidade considerar só ativos)
4. Rodar `cd backend && npm run build`
5. `src/services/configService.ts`: `reactivatePerfil`, ajustar `fetchPerfis` para aceitar flag de inativos
6. `src/types/config.ts`: corrigir `ContaPrincipalItem`
7. `src/hooks/useActiveProfile.ts`: revisar comportamento sem perfil ativo
8. `src/screens/config/PerfisTab.tsx`: toggle, botão reativar, tag "Perfil original"
9. Rodar `npx tsc --noEmit -p .` e `npx vite build`
10. Testar manualmente: tentar arquivar o único perfil pessoal restante (deve bloquear); reativar um perfil arquivado; conferir toggle ativos/desativados; conferir tag de perfil original

## Regras de negócio identificadas

- Um usuário nunca deve poder ficar sem nenhum perfil `pessoal` ativo através da ação de arquivar — essa é a invariante que foi rompida e que este plano restaura
- "Conta" (o item sintético do login) não deve ser considerada, em nenhum lugar do sistema, um substituto válido para um Perfil real ativo
- O "perfil original" é uma etiqueta puramente informativa (o mais antigo do usuário) — não implica em regras de negócio adicionais (ainda pode ser editado, mas a proteção de "não pode arquivar o único pessoal" já cobre o caso crítico)

## Regras multi-tenant e segurança

- Não há dimensão multi-tenant/prefeitura neste projeto
- Todas as rotas novas/alteradas continuam validando propriedade via `eq(profiles.userId, req.user!.id)` — nenhum novo vetor de acesso a dados de outro usuário
- Esta correção é, em si, uma correção de segurança de dados (evitar perda de acesso a dados financeiros do próprio usuário por arquivamento indevido)

## Validações necessárias

- Tentar arquivar o único perfil `pessoal` ativo → deve ser bloqueado com mensagem clara
- Arquivar um perfil `pessoal` quando existe outro perfil `pessoal` ativo (caso improvável, mas o schema permite múltiplos `pessoal` por usuário) → não deve ser bloqueado indevidamente
- Reativar um perfil arquivado → deve aparecer novamente em `GET /api/profiles` (sem `incluir_inativos`) e ser selecionável
- Criar um novo perfil `pessoal` quando o único existente está arquivado → deve ser permitido (após a correção do item 3)

## Testes necessários

### Frontend

- Toggle ativos/desativados exibe a lista correta em cada estado
- Botão "Reativar" chama a rota e atualiza a lista (invalidação de query)
- Tag "Perfil original" aparece no perfil de menor `data_criacao`

### Backend

- `DELETE /:id` no único perfil pessoal ativo → 400 com mensagem específica
- `POST /:id/reactivate` em perfil de outro usuário → 404 (não deve reativar perfil alheio)
- `GET /?incluir_inativos=true` retorna perfis arquivados; sem o parâmetro, comportamento inalterado
- `POST /` com tipo pessoal, quando só existe um pessoal arquivado → sucesso (cria um novo)

### E2E

- Fluxo completo: tentar arquivar o único perfil pessoal (bloqueado) → arquivar um perfil empresa (permitido) → nenhuma regressão no Planejamento/Painel

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- O working tree já tem `PerfisTab.tsx`, `useActiveProfile.ts`, `AccountProfileMenu.tsx` e `types/config.ts` modificados por trabalho não commitado desta sessão — cada edição deve reler o arquivo atual antes de aplicar, para não conflitar ou reverter partes não relacionadas a este bug
- `.env` atual aponta para produção — qualquer teste real (arquivar/reativar) deve ser feito com cuidado, idealmente com um perfil de teste, não repetindo o incidente na conta principal do usuário
- A reativação emergencial do Perfil id=3 já foi feita nesta sessão (fora deste plano, com confirmação explícita separada) — este plano previne a recorrência, não repete essa ação

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Não é mais possível arquivar o único perfil `pessoal` ativo de um usuário pela API
- Existe uma forma de reativar um perfil arquivado, tanto via API quanto via UI
- O item sintético "Conta" não afirma mais `ativo: true` de forma incondicional
- Toggle ativos/desativados e tag "Perfil original" funcionam na tela de Perfis
- `cd backend && npm run build`, `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhum arquivo fora do escopo listado é modificado

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Antes de editar qualquer um dos arquivos já modificados pelo working tree (`PerfisTab.tsx`, `useActiveProfile.ts`, `AccountProfileMenu.tsx`, `types/config.ts`, `profiles.ts`, `configService.ts`), reler o conteúdo atual completo — não assumir o estado descrito no relatório de investigação, que pode já estar levemente desatualizado
- Não reverter, tocar ou fazer `git stash`/`checkout` em nenhum arquivo fora da lista de "Arquivos provavelmente afetados"
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Manter alterações pequenas e focadas exatamente no escopo acima
