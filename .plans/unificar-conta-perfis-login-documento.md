# Plano de Implementação: Unificar Conta e Perfis + Login por Documento de Perfil Vinculado

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário a partir de screenshots da tela atual (popover de troca de perfil e modais "Novo perfil" PJ/PF), com escopo levantado por investigação de código e esclarecimentos coletados via perguntas ao longo da conversa.
- Data do planejamento: 2026-09-01
- Classificação: `frontend + backend + database`

## Resumo

Hoje o sistema trata "conta" (tabela `usuarios` — o login) e "perfil" (tabela `perfis` — PJ/Aether/Pessoal) como duas entidades com UX e regras diferentes, mesmo sendo conceitualmente a mesma coisa para o usuário: um espaço financeiro navegável. Isso gera três sintomas concretos observados no código:

1. No popover de troca de perfil (`AccountProfileMenu.tsx`), a conta principal aparece como um bloco estático sem ação, visualmente parecido mas não clicável, separado da lista de perfis que é clicável/selecionável.
2. Em Configurações, "Minha conta" e "Perfis" são telas separadas com formulários de campos diferentes — `MinhaContaTab.tsx` inclusive já tenta remendar isso, buscando o perfil tipo `empresa` e fazendo dois submits (`updateMe` + `savePerfil`) para manter `nome_fantasia` sincronizada, solução frágil que só funciona com no máximo 1 perfil empresa.
3. A API trata o perfil `pessoal` como especial: `PUT`/`DELETE /api/profiles/:id` recusam editar ou arquivar esse tipo, único ponto do sistema com essa exceção.

Este plano unifica a experiência (conta principal vira só mais um item navegável na mesma lista de perfis, com o mesmo formulário) e, numa fase separada de maior risco, permite logar diretamente pelo CPF/CNPJ de qualquer perfil vinculado à conta (mesma senha), carregando automaticamente aquele perfil como ativo — hoje o login já é por documento (não por email), mas só reconhece o documento da conta principal.

**Este plano substitui parcialmente o escopo do plano anterior** `.plans/redesign-minha-conta-bloco-unico.md` (2026-08-20, já implementado — `MinhaContaTab.tsx` hoje já é um bloco único com nome/email/documento/país/estado/cidade). Aquele plano definiu explicitamente como fora de escopo qualquer campo de perfil/empresa na tela de conta; esta é uma decisão nova do usuário que amplia esse escopo, unificando as duas telas.

## Escopo

### Dentro do escopo

**Fase 1 — Unificação de UI (baixo risco)**
- Fundir "Minha conta" e "Perfis" em um único componente/lista dentro de Configurações — a conta principal (usuário) vira o primeiro item navegável, com o mesmo formulário-base usado pelos demais perfis.
- `AccountProfileMenu.tsx`: mover o bloco estático da conta principal para dentro da lista "Trocar perfil", tornando-o clicável/selecionável como os demais.
- Padronizar os campos do formulário de perfil (ver seção "Campos padronizados" abaixo) — aplicando telefone e email também para perfis tipo empresa (hoje exclusivos do tipo pessoal).
- Indicador discreto "Perfil incompleto" dentro de Configurações, no card do perfil, quando campos-chave estiverem vazios (telefone, email, e os condicionais por tipo). Não aparece no popover do header — só dentro de Configurações.
- Backend: remover a restrição que impede editar/arquivar perfil tipo `pessoal` (`profiles.ts:119-122` e `161-164`); adicionar `telefone` e `email` como colunas aceitas em `POST`/`PUT /api/profiles` para qualquer tipo (hoje só persistidos para tipo pessoal).
- Cadastro externo (`LoginPage.tsx`, modo `register`) **permanece sem alteração** — continua enxuto (nome, CPF/CNPJ, nome fantasia se CNPJ, email, senha). Os campos adicionais (razão social, atividade, enquadramento, telefone, data de nascimento) são preenchidos depois, dentro do sistema.

**Fase 2 — Login por documento de perfil vinculado (alto risco — autenticação)**
- Nova migration: constraint `UNIQUE` em `perfis.documento` (pré-requisito técnico — hoje não existe). **Não será executada sem confirmação explícita do usuário**, e antes da escrita da migration é necessário rodar uma query somente leitura para checar se já existem documentos duplicados hoje (o que bloquearia a constraint).
- `POST /api/auth/login`: além de buscar em `users.document`, passa a buscar também em `perfis.documento`; ao encontrar em `perfis`, resolve o `usuario_id` dono, valida a senha do usuário normalmente (mesma senha, não há senha por perfil), emite o JWT do usuário dono, e sinaliza na resposta qual `perfil_id` deve carregar como ativo (o frontend já persiste isso via `localStorage.setItem('perfilAtivoId', ...)`, usado por `useActiveProfile`).

### Fora do escopo

- Múltiplas senhas / autenticação independente por perfil — confirmado com o usuário: senha continua sendo uma só, do usuário dono da conta.
- Alteração no cadastro externo (tela de registro pública) — permanece com os campos atuais; confirmado com o usuário.
- Foto de perfil por perfil individual (hoje `foto` só existe em `usuarios`) — não foi pedido, fica fora.
- Correção da divergência entre o preview de categorias por `enquadramento` (`CategoryPreview` em `PerfisTab.tsx`) e o backend `ensureDefaultCategories`, que ignora `enquadramento` e cria sempre as mesmas categorias fixas por tipo (`pessoal`/`empresa`). Registrado como achado, correção fica a critério do usuário em outro momento.
- Qualquer mudança em RLS/isolamento multi-tenant — o modelo de isolamento por `usuario_id` não muda; login por documento de perfil só resolve para qual `usuario_id` autenticar, não altera como os dados são filtrados depois.

## Leitura de contexto

- `sistema financas/CLAUDE.md` — lido (regras de fluxo `/planejar → aprovação → /implementar → /finalizar`, proibição de alterar `.env`, migrations exigem confirmação explícita).
- `sistema financas/AGENT.md` — lido por completo (contexto do projeto descreve modelo multi-tenant/multi-prefeitura genérico que não se aplica literalmente a este projeto single-tenant por usuário; aplicadas as diretrizes gerais de qualidade — Drizzle, nomes claros, evitar `any`, não mascarar erros, seguir padrão existente).
- `frontend/AGENT.md` — não existe como arquivo separado neste projeto.
- `backend/AGENT.md` — não existe como arquivo separado neste projeto.
- `.plans/redesign-minha-conta-bloco-unico.md` — lido (plano anterior já implementado; este plano amplia e substitui parte do seu escopo, ver nota acima).
- `src/layout/AccountProfileMenu.tsx` — lido por completo (mecanismo do popover: lista "Trocar perfil" clicável vs. bloco estático da conta).
- `src/layout/ConfigPanel.tsx` — lido (roteamento de abas de Configurações).
- `src/screens/config/MinhaContaTab.tsx` — lido por completo (formulário atual da conta, incluindo o remendo de sincronizar `perfilEmpresa` em dois submits).
- `src/screens/config/PerfisTab.tsx` — lido por completo (`PerfilDialog`, campos condicionais por tipo, `CategoryPreview`).
- `src/hooks/useActiveProfile.ts` — lido (mecanismo de troca de perfil via `localStorage` + reload).
- `src/types/config.ts`, `src/types/auth.ts` — lidos (interfaces `Perfil` e `AuthUser`, campos divergentes entre as duas entidades).
- `src/services/usuariosService.ts`, `src/services/configService.ts` — parcialmente lidos (contratos de `fetchMe`/`updateMe`/`fetchPerfis`/`savePerfil`).
- `src/screens/public/LoginPage.tsx` — lido por completo (fluxo de login/registro externo, confirmação dos campos hoje pedidos no cadastro).
- `backend/src/routes/auth.ts` — lido por completo (login hoje já é por `documento`, não email; `register` cria usuário + perfil inicial em transação).
- `backend/src/routes/profiles.ts` — lido por completo (CRUD de perfis, restrição hardcoded ao tipo `pessoal`, ausência de `telefone`/`email` para tipo empresa).
- `backend/src/routes/users.ts` — não lido por completo nesta sessão (citado pelo plano anterior; a rota `PUT /me` já aceita `documento` desde a implementação daquele plano).
- `backend/src/db/schema/profiles.ts` — lido por completo (confirma ausência de `UNIQUE` em `document`).
- `backend/config/staging-setup.sql` — lido (schema `usuarios`/`perfis`, relação `usuario_id` como raiz do isolamento de dados, `perfil_id` como sub-filtro opcional em todas as tabelas financeiras).
- `backend/src/services/defaultCategories.ts` — lido por completo (confirma que `ensureDefaultCategories` ignora `enquadramento`, usa só `pessoal`/`empresa`).
- Repositório inteiro confirmado como isolamento sempre por `req.user!.id` (JWT), nunca diretamente por `perfil_id` — via grep em `backend/src/routes/expenses.ts` e `incomes.ts`.

## Impacto por área

### Frontend

**Fase 1:**
- `src/screens/config/MinhaContaTab.tsx` e `src/screens/config/PerfisTab.tsx`: fundir em um componente único (ex.: `PerfisTab.tsx` passa a listar também a conta principal como item; `MinhaContaTab.tsx` é removido ou vira o formulário de edição reaproveitado para qualquer item da lista, incluindo a conta).
- `PerfilDialog` (hoje em `PerfisTab.tsx`): estender para aceitar edição da conta principal (tipo especial `conta` além de `pessoal`/`empresa`, ou tratamento equivalente) e adicionar campos `telefone`/`email` também no bloco `tipo === 'empresa'` (hoje exclusivos de `pessoal`).
- `src/layout/AccountProfileMenu.tsx`: mover o bloco estático (linhas 224-234) para dentro da lista `data.map(...)` de "Trocar perfil" (linhas 172-221), tratando a conta principal como uma entrada adicional com indicador visual próprio (ex.: badge "Conta" em vez de PF/PJ).
- `src/hooks/useActiveProfile.ts`: pode precisar representar "conta principal selecionada" como um estado análogo a um perfil (ex.: `activeId` especial), a definir na implementação.
- Novo indicador visual "Perfil incompleto" no card de cada perfil dentro da lista de Configurações — lógica de completude a definir na implementação (provavelmente: campos obrigatórios por tipo vazios).
- `src/types/config.ts`: possível extensão de `Perfil` com `telefone`/`email` já tipados para todos os tipos (hoje implícitos via `PerfilFormValues` do dialog, não formalizados na interface).
- Query keys: reaproveitar `queryKeys.perfis` existente; verificar se a fusão exige invalidar também `['usuario-me']` nos mesmos pontos.

**Fase 2:**
- `src/screens/public/LoginPage.tsx`: nenhuma mudança de campos — o mesmo campo `documento` do formulário de login já cobre o novo comportamency (resolvido no backend).
- `src/services/authService.ts`: verificar se a resposta de `login()` precisa passar a repassar um `perfil_id` sugerido para popular `localStorage` antes do primeiro carregamento (a definir na implementação, dependente do contrato de resposta do backend).

Se não houver impacto adicional além do listado: não aplicável — ambas as fases têm impacto direto no frontend.

### Backend

**Fase 1:**
- `backend/src/routes/profiles.ts`:
  - `PUT /api/profiles/:id` (linhas 119-122) e `DELETE /api/profiles/:id` (linhas 161-164): remover o bloqueio a `type === 'pessoal'`.
  - `DELETE /api/profiles/:id`: adicionar checagem de "último perfil ativo" — antes de marcar `active: false`, contar perfis ativos da conta; se for o único restante, retornar 400 com mensagem clara em vez de arquivar.
  - `POST /api/profiles` e `PUT /api/profiles/:id`: aceitar e persistir `telefone`/`email` para qualquer tipo (hoje o dialog do frontend já envia esses campos só para tipo pessoal; backend precisa aceitar para `empresa` também — checar se a coluna já existe em `perfis` ou se precisa de migration, ver seção Banco de Dados).
  - Estender para tratar a "conta principal" como um item editável por este mesmo endpoint (decisão aplicada: unificar backend). Isso exige decidir, na implementação, como representar a conta principal nesta rota — provavelmente um identificador reservado (ex.: `/api/profiles/me` ou um `tipo: 'conta'` especial) que, por trás, ainda lê/escreve em `usuarios` para os campos exclusivos (senha, foto, dados de plano/billing) e em `perfis` para os campos compartilhados, apresentando uma única interface ao frontend.
- `backend/src/routes/users.ts`: `PUT /usuarios/me` provavelmente deixa de ser chamado diretamente pelo novo formulário unificado do frontend — avaliar se a rota é mantida internamente (chamada pelo novo endpoint unificado de perfis) ou se sua lógica é absorvida por `profiles.ts`. Preservar o fluxo de troca de senha e upload de foto, que continuam exclusivos da conta principal.

**Fase 2:**
- `backend/src/routes/auth.ts`, rota `POST /login`: expandir a query de busca por `documento` para incluir `perfis.documento` (join ou segunda query), resolver `usuario_id` dono, manter validação de senha contra `users.password` (não contra dado de perfil), incluir no payload de resposta o `perfil_id` resolvido.
- Validar mensagens de erro genéricas (já seguem o padrão do projeto — "Invalid document or password" sem revelar detalhes).

### Banco de dados

**Fase 1:**
- Verificar se `perfis` já possui colunas `telefone`/`email` fisicamente (o formulário do frontend já as envia para tipo pessoal hoje — se a tabela real (`staging-setup.sql`) não lista essas colunas explicitamente, uma migration pode ser necessária; **isso precisa ser confirmado olhando a migration mais recente do schema real antes da implementação**, já que `staging-setup.sql` pode estar desatualizado em relação às migrations incrementais em `backend/drizzle/`).

**Fase 2:**
- Nova migration: `ALTER TABLE perfis ADD CONSTRAINT perfis_documento_unique UNIQUE (documento)`.
- Pré-requisito obrigatório antes de escrever essa migration: rodar `SELECT documento, COUNT(*) FROM perfis WHERE documento IS NOT NULL GROUP BY documento HAVING COUNT(*) > 1` (somente leitura) para detectar duplicados existentes que bloqueariam a constraint. Se houver duplicados, a resolução (qual perfil mantém o documento) é decisão manual do usuário, não automática.
- Risco adicional: `perfis.documento` pode colidir com um `users.document` de outra conta (a constraint UNIQUE em `perfis` não previne colisão cruzada contra `users`). Avaliar na implementação se é necessário validar isso na escrita (`POST`/`PUT /api/profiles`) além do UNIQUE de banco.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

Sem impacto esperado.

## Campos padronizados (Fase 1)

Aplicados ao formulário único de perfil (usado para conta principal, perfis pessoa física e perfis empresa) — **não afeta o cadastro externo**, que permanece com seus campos atuais (nome, CPF/CNPJ, nome fantasia se CNPJ, email, senha):

- **Comuns a todos os tipos:** nome, CPF/CNPJ, email, telefone
- **Se CNPJ (empresa):** nome fantasia, razão social, atividade, enquadramento
- **Se CPF (pessoa física):** data de nascimento
- **Exclusivo da conta principal (não é campo de perfil):** senha — gerenciada separadamente, já existe fluxo de troca de senha (`ChangePasswordModal`/seção de senha em `MinhaContaTab` hoje).

## Arquivos provavelmente afetados

- `src/layout/AccountProfileMenu.tsx`
- `src/layout/ConfigPanel.tsx`
- `src/screens/config/MinhaContaTab.tsx` (provável remoção/fusão)
- `src/screens/config/PerfisTab.tsx` (provável componente resultante da fusão)
- `src/hooks/useActiveProfile.ts`
- `src/types/config.ts`, `src/types/auth.ts`
- `src/services/usuariosService.ts`, `src/services/configService.ts`, `src/services/authService.ts`
- `backend/src/routes/profiles.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/users.ts` (avaliação)
- `backend/src/db/schema/profiles.ts`
- Nova migration em `backend/drizzle/` (Fase 2, não aplicada sem confirmação)

## Estratégia de implementação

**Fase 1:**
1. Confirmar no schema real (migrations mais recentes, não só `staging-setup.sql`) se `perfis.telefone`/`perfis.email` já existem fisicamente; se não, preparar migration correspondente (não aplicar sem confirmação).
2. Backend: `profiles.ts` — remover restrição ao tipo `pessoal` em `PUT`/`DELETE`; aceitar `telefone`/`email` em `POST`/`PUT` para qualquer tipo.
3. Frontend: estender `PerfilDialog` com o formulário padronizado (campos comuns + condicionais), incluindo suporte a editar a conta principal.
4. Frontend: fundir `MinhaContaTab`/`PerfisTab` em uma lista única dentro de `ConfigPanel`; conta principal como primeiro item.
5. Frontend: `AccountProfileMenu.tsx` — mover conta principal para dentro da lista "Trocar perfil".
6. Frontend: indicador "Perfil incompleto" nos cards da lista de Configurações.
7. Testes manuais: editar conta principal, editar perfil pessoal (antes bloqueado), editar perfil empresa com novos campos telefone/email, verificar troca de perfil pelo popover incluindo a conta principal.

**Fase 2 (após Fase 1 validada e com aprovação separada):**
1. Rodar query de diagnóstico (somente leitura) para checar documentos duplicados em `perfis`.
2. Reportar resultado ao usuário; se houver duplicados, aguardar decisão manual antes de prosseguir.
3. Preparar migration de `UNIQUE` em `perfis.documento` — aguardar confirmação explícita antes de aplicar.
4. Backend: `auth.ts` — expandir lógica de login para checar `perfis.documento`, resolver usuário dono, incluir `perfil_id` na resposta.
5. Frontend: `authService.ts`/fluxo de login — persistir o `perfil_id` retornado em `localStorage` antes do primeiro carregamento do app.
6. Testes manuais: login com documento de conta principal (comportamento atual preservado), login com documento de perfil vinculado (novo), login com documento inexistente (mensagem genérica preservada).

## Regras de negócio identificadas

- Login sempre usa a senha do usuário dono da conta — nunca senha por perfil.
- Um perfil vinculado autentica com seu próprio CPF/CNPJ, mas resulta em sessão do usuário dono, com o perfil correspondente marcado como ativo.
- Perfil tipo `pessoal` deixa de ser um caso especial na API — pode ser editado e arquivado como qualquer outro perfil.
- Não é permitido arquivar o último perfil ativo restante da conta — a API deve bloquear essa ação com mensagem de erro clara, garantindo que sempre exista ao menos 1 perfil ativo vinculado.
- Cadastro externo continua criando a conta com o mínimo de campos; completude de perfil é incentivada, não obrigatória.

## Regras multi-tenant e segurança

- O projeto é single-tenant por usuário (isolamento por `usuario_id`, não por prefeitura/tenant compartilhado) — o `AGENT.md` do projeto descreve um modelo multi-prefeitura genérico que não se aplica literalmente aqui; a preocupação real de isolamento é entre contas de usuários diferentes.
- Login por documento de perfil não deve permitir, sob nenhuma circunstância, autenticar como o usuário dono sem a senha correta — a resolução de "qual usuário" muda, a verificação de senha não.
- `perfis.documento` precisa ser único no sistema (não só dentro da conta) antes de virar credencial de login, para evitar ambiguidade sobre qual conta autenticar.
- Mensagens de erro de login devem continuar genéricas ("Invalid document or password"), sem revelar se o documento pertence a um perfil, a uma conta principal, ou não existe.
- Nenhuma mudança nas regras de filtro de dados financeiros por `usuario_id`/`perfil_id` já existentes — login por documento de perfil só afeta a resolução de identidade no momento da autenticação.

## Validações necessárias

- `perfis.documento`: formato válido de CPF/CNPJ (reaproveitar `validateDocument` já usado em `auth.ts`/`users.ts`), unicidade (constraint de banco + validação amigável na escrita).
- `telefone`/`email` em perfis tipo empresa: mesmas regras de formato já aplicadas ao tipo pessoal hoje (a confirmar exatamente quais validações existem no dialog atual).
- Backend `POST /login`: nenhuma mudança na validação de entrada (`documento`/`senha` continuam obrigatórios); mudança é só na lógica de busca.

## Testes necessários

### Frontend

- Editar conta principal pelo novo formulário unificado (nome, email, telefone, documento).
- Editar perfil pessoal (antes bloqueado) — confirmar que agora salva.
- Editar perfil empresa — confirmar que telefone/email agora aparecem e salvam.
- Trocar perfil pelo popover do header, incluindo selecionar a conta principal como "perfil" ativo.
- Verificar indicador "Perfil incompleto" aparece/desaparece corretamente conforme campos são preenchidos.

### Backend

- `PUT /api/profiles/:id` com perfil tipo `pessoal` — deve salvar (antes retornava 400).
- `DELETE /api/profiles/:id` com perfil tipo `pessoal` — deve arquivar (antes retornava 400), desde que não seja o último perfil ativo da conta.
- `DELETE /api/profiles/:id` quando é o único perfil ativo restante (de qualquer tipo) — deve retornar 400 com mensagem clara, sem arquivar.
- `POST`/`PUT /api/profiles` com `telefone`/`email` em perfil tipo `empresa` — deve persistir.
- Editar a conta principal pelo endpoint unificado — deve persistir corretamente os campos exclusivos de usuário (nome, email, documento) e refletir no formulário compartilhado.
- (Fase 2) `POST /api/auth/login` com documento de perfil vinculado — deve autenticar como o usuário dono e sinalizar o `perfil_id` correto.
- (Fase 2) `POST /api/auth/login` com documento de perfil vinculado mas senha errada — deve falhar com a mesma mensagem genérica de sempre.

### E2E

- Fluxo completo: logar com documento da conta principal → trocar para um perfil vinculado pelo popover → deslogar → (Fase 2) logar novamente já usando o documento daquele perfil → confirmar que abre direto nele.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas" run build
```

(Ajustar caminhos exatos dos scripts durante a implementação, conforme `package.json` de cada pacote.)

## Riscos e pontos de atenção

- **Alto risco (Fase 2):** qualquer regressão em `POST /api/auth/login` bloqueia acesso de todos os usuários em produção — mudança deve ser pequena, testada isoladamente, e revisada com cuidado antes de qualquer deploy.
- Migration de `UNIQUE` em `perfis.documento` pode falhar se já existirem duplicados — diagnóstico prévio obrigatório.
- Colisão entre `perfis.documento` e `users.document` de contas diferentes não é prevenida só pela constraint UNIQUE em `perfis` — pode exigir validação cruzada adicional.
- A checagem de "último perfil ativo" precisa ser feita com cuidado para não haver race condition entre contagem e arquivamento (usar transação ou query atômica na implementação).
- Unificar o backend da conta principal com o endpoint de perfis aumenta o escopo da Fase 1 (era possível fazer só na UI) — campos exclusivos de usuário (senha, foto, `plano_status`/`plano_tipo`) precisam continuar tratados com sua própria lógica/rota interna, só a superfície exposta ao frontend é que fica única.
- Fundir `MinhaContaTab`/`PerfisTab` pode quebrar o fluxo atual de troca de senha, que hoje vive em `MinhaContaTab`/`ChangePasswordModal` — precisa ser preservado explicitamente na Fase 1, já que senha não é campo de perfil.
- `staging-setup.sql` pode estar desatualizado em relação ao schema real (`backend/drizzle/*.sql` incrementais) — não confiar nele como fonte única da verdade sobre colunas existentes antes de implementar.

## Decisões aplicadas

- Arquivar o último perfil ativo restante: **bloqueado com mensagem de erro** — sempre precisa sobrar pelo menos 1 perfil ativo vinculado à conta.
- Endpoint da conta principal na lista unificada: **backend também será unificado** — a conta principal passa a ser editada pelo mesmo endpoint dos perfis (`PUT /api/profiles/:id` ou equivalente), tratando campos exclusivos de usuário (senha, foto, dados de plano) dentro dessa mesma rota/fluxo.

## Perguntas em aberto

1. Confirmar colunas físicas atuais de `perfis` (telefone/email já existem ou precisam de migration) antes de iniciar a Fase 1 — não foi possível confirmar com certeza usando apenas `staging-setup.sql`; é uma verificação técnica a ser feita no início da implementação, não uma decisão do usuário.

## Critérios de aceite do plano

- Conta principal aparece como item navegável/editável na mesma lista de perfis, tanto em Configurações quanto no popover do header.
- Formulário de perfil usa os campos padronizados definidos acima, incluindo telefone/email para perfis empresa.
- Perfil tipo `pessoal` pode ser editado e arquivado pela API como qualquer outro, exceto quando for o último perfil ativo restante (bloqueado com erro claro).
- Conta principal editável pelo mesmo endpoint unificado usado pelos demais perfis, preservando fluxos exclusivos (senha, foto) sem regressão.
- Indicador "Perfil incompleto" funcional dentro de Configurações.
- (Fase 2, aprovação separada) Login aceita documento de qualquer perfil vinculado, mesma senha, carregando o perfil correto.
- Nenhuma migration executada sem confirmação explícita do usuário.
- Cadastro externo permanece inalterado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Implementar a Fase 1 primeiro; Fase 2 só deve começar após aprovação explícita separada do usuário, dado o risco em autenticação.
- Não executar migrations sem confirmação explícita — incluindo a verificação de colunas físicas (pergunta em aberto 3) antes de assumir que telefone/email já existem em `perfis`.
- Antes de escrever a migration de `UNIQUE` em `perfis.documento` (Fase 2), rodar a query de diagnóstico de duplicados e reportar ao usuário.
- Preservar o fluxo de troca de senha existente ao fundir as telas de conta/perfis — senha não é campo de perfil.
- Seguir `/AGENT.md` da raiz do projeto (regras gerais de qualidade — Drizzle, nomes claros, evitar `any`, não mascarar erros).
- Manter alterações pequenas e focadas; preferir PRs/commits separados por fase se o fluxo do projeto (`/finalizar`) permitir.
- Resolver as 3 perguntas em aberto com o usuário antes ou no início da implementação da Fase 1 (perguntas 1 e 2) e antes de qualquer edição de schema (pergunta 3).
