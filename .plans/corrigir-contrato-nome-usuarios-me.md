# Plano de Implementação: Corrigir mismatch de contrato (nome/documento) entre backend e frontend nas rotas de usuário

## Origem

- Arquivo de especificação: nenhum `.md` de feature — plano originado de investigação de bug relatado pelo usuário (tela "Minha conta" com campo "Nome completo" vazio).
- Data do planejamento: 2026-08-20
- Classificação: `fullstack`

## Resumo

A tela "Minha conta" (e a tela admin "Usuários") exibem nome e documento em branco ao carregar dados de um usuário existente, mesmo esses dados existindo no banco. A causa raiz é um mismatch de contrato: as rotas em `backend/src/routes/users.ts` retornam os campos do usuário com as chaves camelCase em inglês do schema Drizzle (`name`, `document`, `type`, `status`, `createdAt`, `updatedAt`), enquanto o frontend espera português (`nome`, `documento`, `tipo`, `status`, `data_cadastro`, `data_atualizacao`) — o padrão já usado em `backend/src/routes/auth.ts` (rotas `/login`, `/verify`), que remapeia explicitamente os campos antes de responder.

A rota `POST /register` em `auth.ts` tem o mesmo problema pontualmente: ao final, envia `usuario: newUser` sem remapear, enquanto `/login` remapeia corretamente para um objeto `{ nome, email, documento, tipo, status }`.

Nenhuma coluna do banco precisa mudar — a coluna Postgres já se chama `nome`/`documento` (`name: varchar('nome', ...)` no schema). O problema é só no objeto JS de resposta da API.

## Escopo

### Dentro do escopo

- Padronizar as respostas de `backend/src/routes/users.ts` para usar chaves em português (`nome`, `documento`, `tipo`, `status`, `data_cadastro`, `data_atualizacao`), replicando o padrão já usado em `/login`, nas rotas:
  - `GET /me`
  - `PUT /me`
  - `GET /` (listagem paginada de usuários)
  - `POST /` (criação de usuário pelo admin)
  - `PUT /:id`
  - `PUT /:id/status`
- Corrigir `POST /register` em `backend/src/routes/auth.ts` para remapear `newUser` para português antes de enviar na resposta (mesmo padrão do `/login`, linhas 112-119).
- Simplificar `sistema financas/src/services/usuariosService.ts`: remover os campos ingleses de fallback (`name?`, `document?`, `type?`) das interfaces `UsuarioMe` e `UsuarioListItem`, já que deixam de ser necessários após o backend padronizar.
- Validar visualmente as duas telas afetadas (`MinhaContaTab.tsx` e `UsuariosTab.tsx`) após o fix, incluindo o fluxo de edição de usuário existente no admin.

### Fora do escopo

- Qualquer migration ou alteração de schema/coluna no Postgres.
- `DELETE /me/cancel` (não retorna dados do usuário no corpo).
- Qualquer outra rota de `auth.ts` além de `/register` (login, verify, google, forgot/reset-password já estão corretas ou não aplicáveis).
- Redesign visual das telas — este plano é só correção de contrato de dados.

## Leitura de contexto

- `sistema financas/AGENT.md` — lido. Nota: este AGENT.md descreve um contexto multi-tenant/multi-prefeitura genérico que não corresponde exatamente à natureza deste projeto (sistema financeiro pessoal/empresarial single-tenant por usuário). Foram aplicadas as diretrizes gerais de qualidade de código (Drizzle, nomes claros, evitar `any`, seguir padrão existente) e ignoradas as diretrizes específicas de isolamento multi-prefeitura, que não se aplicam aqui.
- `frontend/AGENT.md` — não existe como arquivo separado neste projeto.
- `backend/AGENT.md` — não existe como arquivo separado neste projeto.
- `sistema financas/backend/src/routes/auth.ts` — lido por completo (padrão de referência).
- `sistema financas/backend/src/routes/users.ts` — lido por completo (arquivo com o bug).
- `sistema financas/backend/src/db/schema/users.ts` — lido (confirma que as colunas Postgres já são `nome`/`documento`, sem necessidade de migration).
- `sistema financas/src/services/usuariosService.ts` — lido por completo.
- `sistema financas/src/screens/config/MinhaContaTab.tsx` — lido por completo.
- `sistema financas/src/screens/config/UsuariosTab.tsx` — lido por completo (confirma que o mesmo bug afeta a edição de usuário no admin).

## Impacto por área

### Frontend

- `sistema financas/src/services/usuariosService.ts`: remover campos `name?`, `document?`, `type?` das interfaces `UsuarioMe` e `UsuarioListItem` (ficam redundantes após o backend padronizar).
- Nenhuma mudança de lógica necessária em `MinhaContaTab.tsx` ou `UsuariosTab.tsx` — ambos já leem `user.nome`/`usuario.documento`/`usuario.tipo` corretamente; o bug está 100% na resposta do backend.
- Query keys (`['usuario-me']`, `['usuarios-list', ...]`) não mudam.
- Sem novos estados de loading/error/empty necessários.

### Backend

- `backend/src/routes/users.ts`:
  - `GET /me` (linha ~12-44): remapear o objeto retornado para `{ id, nome, email, documento, pais, estado, cidade, tipo, status, plano_status, plano_tipo, plano_expiracao, data_cadastro }`.
  - `PUT /me` (linha ~46-122): remapear o `updated` retornado (linha ~111-117) para o mesmo formato português.
  - `GET /` (listagem, linha ~271+): remapear cada item da lista para português, incluindo `data_cadastro`/`data_atualizacao` (já usados por `UsuariosTab.tsx`/`ConfigListRow`).
  - `POST /` (linha ~366+): remapear o `.returning()` para português.
  - `PUT /:id` (linha ~533+): remapear o `.returning()` para português.
  - `PUT /:id/status` (linha ~585+): remapear o `.returning()` para português.
- `backend/src/routes/auth.ts`:
  - `POST /register` (linha ~183-218): remapear `newUser` para `{ id, nome, email, documento, tipo, status }` antes de `usuario: newUser`, replicando o padrão do `/login`.
- Nenhuma mudança de validação, permissão ou regra de negócio — só formato de resposta.

### Banco de dados

`Sem impacto esperado`. As colunas Postgres já são `nome`, `documento`, `tipo`, `status`, `data_cadastro`, `data_atualizacao` — o schema Drizzle já mapeia corretamente (`name: varchar('nome', ...)`). O problema é exclusivamente na chave do objeto JS usada no `.select()`/`.returning()`/resposta, não na coluna do banco.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/users.ts`
- `sistema financas/backend/src/routes/auth.ts`
- `sistema financas/src/services/usuariosService.ts`

## Estratégia de implementação

1. Em `backend/src/routes/users.ts`, ajustar `GET /me` para selecionar os campos com alias explícito em português (ex: `nome: users.name`, `documento: users.document`, `tipo: users.type`, `data_cadastro: users.createdAt`), replicando a técnica de remapeamento usada em `/login` de `auth.ts`.
2. Aplicar o mesmo remapeamento em `PUT /me`, no objeto `updated` retornado.
3. Aplicar o mesmo remapeamento em `GET /` (listagem), preservando paginação (`data`/`pagination`) e os filtros existentes (`search`, `tipo`, `status`).
4. Aplicar o mesmo remapeamento em `POST /`, `PUT /:id` e `PUT /:id/status`.
5. Em `auth.ts`, ajustar `POST /register` para remapear `newUser` antes de enviar em `usuario: newUser`, igual ao `/login`.
6. Em `usuariosService.ts`, remover os campos ingleses de fallback (`name?`, `document?`, `type?`) de `UsuarioMe` e `UsuarioListItem` — remoção só depois que o backend já estiver padronizado (regra "redesign remove then apply": remover o mapeamento morto depois de confirmar que o novo contrato cobre tudo).
7. Rodar o projeto localmente (`/run` ou equivalente) e validar visualmente:
   - Login e conferir "Minha conta" mostra nome preenchido.
   - Editar nome/email e salvar, conferir persistência.
   - Abrir tela admin "Usuários" (se aplicável ao tipo da conta testada) e conferir nome/documento aparecem na listagem e no formulário de edição.
   - Testar cadastro de novo usuário (`/register`) e conferir que o retorno não quebra o fluxo de login automático pós-cadastro.

## Regras de negócio identificadas

- Nenhuma regra de negócio nova. O comportamento funcional (autenticação, validação de duplicidade, hashing de senha, etc.) permanece inalterado — apenas o formato de serialização da resposta muda.

## Regras multi-tenant e segurança

Não aplicável — este projeto não é multi-tenant (é um sistema financeiro por usuário individual/empresa, sem isolamento de prefeitura). Nenhuma mudança em autenticação, autorização ou validação de permissão está no escopo.

## Validações necessárias

- Nenhuma validação nova de input. As validações existentes (`express-validator` em `users.ts`/`auth.ts`) permanecem como estão — este plano não adiciona nem remove regras de validação.

## Testes necessários

### Frontend

- Verificação manual: "Minha conta" carrega nome/email corretamente após login.
- Verificação manual: salvar alteração de nome em "Minha conta" reflete na UI e persiste após reload.
- Verificação manual: tela admin "Usuários" mostra nome/documento na listagem e no dialog de edição.

### Backend

- Não há suíte de testes automatizados identificada para essas rotas — validação via chamadas manuais (Postman/curl) ou pela própria UI é suficiente dado o escopo pequeno e mecânico da mudança.

### E2E

- Não aplicável — sem framework E2E identificado no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run lint
```

## Riscos e pontos de atenção

- Risco baixo: a resposta da API muda de formato (inglês → português) nas rotas listadas. Não há indicação de consumidores externos (apps de terceiros, integrações) além do próprio frontend deste repositório — mas vale confirmar antes de implementar que nenhuma integração externa consome `GET /usuarios` ou `/usuarios/me` esperando os campos em inglês.
- Atenção ao remapear `GET /` (listagem): preservar exatamente os mesmos filtros e paginação já existentes, só mudando as chaves do objeto de cada item.
- Ambiente atual pode apontar para produção (banco Render confirmado via `.env` durante a investigação) — nenhuma migration é necessária, mas testes manuais pós-implementação devem ser feitos com cautela para não alterar dados de usuários reais sem necessidade.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `GET /usuarios/me` retorna `{ id, nome, email, documento, tipo, status, ... }` em português.
- `PUT /usuarios/me` retorna o usuário atualizado no mesmo formato português.
- `GET /usuarios` (listagem) retorna cada item no formato português, incluindo `data_cadastro`/`data_atualizacao`.
- `POST /usuarios`, `PUT /usuarios/:id`, `PUT /usuarios/:id/status` retornam no formato português.
- `POST /auth/register` retorna `usuario` remapeado para português, igual ao `/login`.
- Tela "Minha conta" mostra nome completo preenchido ao carregar.
- Tela admin "Usuários" mostra nome e documento preenchidos na listagem e no formulário de edição.
- `usuariosService.ts` não possui mais campos de fallback em inglês nas interfaces `UsuarioMe`/`UsuarioListItem`.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária.
- Seguir `sistema financas/AGENT.md` para convenções de código (Drizzle, nomes claros, evitar `any`), ignorando as seções específicas de multi-tenant/prefeitura que não se aplicam a este projeto.
- Manter alterações pequenas e focadas — só remapeamento de campos, sem mudança de lógica de negócio.
- Aplicar a remoção dos campos de fallback no frontend (`usuariosService.ts`) somente depois de confirmar que o backend já está padronizado, seguindo a diretriz do projeto de remover código morto/duplicado como etapa explícita após aplicar a mudança principal.
