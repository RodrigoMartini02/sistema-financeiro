# Plano de Implementação: cargo, setor, admissão e telefone do colaborador PJ, com telas de Setores e Cargos

## Origem

- Arquivo de especificação: não há `.md`. O pedido veio do chat em 2026-10-03: "faltou cargo, setor... para colaborador", com respostas numeradas.
- Data do planejamento: `2026-10-03`
- Classificação: `frontend + backend + database`

## Resumo

- **Hoje:** o modal do colaborador de conta PJ tem foto, nome, sobrenome, CPF, e-mail e senha.
- **Campos novos:** o colaborador passa a ter cargo, setor, data de admissão e telefone, todos opcionais, no "Novo colaborador" e no "Editar".
- **Telas novas:** cargo e setor são escolhidos em listas que o titular (ou um colaborador com permissão) mantém em duas telas novas, "Setores" e "Cargos", no grupo Pessoas das Configurações.
- **Lista de colaboradores:** a linha passa a mostrar "Nome · Cargo · Setor".
- **"Meus dados":** o colaborador vê os próprios dados de trabalho só para leitura.
- **Membro de conta PF:** nada muda.

## Decisões aplicadas

- **Campos:** cargo, setor, data de admissão e telefone, todos opcionais.
- **Listas:** setor e cargo vêm de listas próprias, cada uma com a sua tela em Configurações → Pessoas.
- **Escopo das listas:** cada conta PJ tem os próprios setores e cargos, e os dois são independentes, ou seja, qualquer cargo em qualquer setor.
- **Permissões:** as telas ficam com o titular e com quem tiver a permissão. São duas permissões, "Setores" e "Cargos", separadas.
- **Lista de colaboradores:** a linha mostra "Nome · Cargo · Setor".
- **Tipo de conta:** só PJ.
- **Decisão 1 ("Meus dados"):** cargo, setor e admissão aparecem só para leitura, e o telefone o próprio colaborador edita.

## Escopo

### Dentro do escopo

- **Migration 0062:** tabelas `setores` e `cargos`, novas colunas em `conta_membros` (setor, cargo e admissão) e em `membro_permissoes` (as duas permissões).
- **Rotas `/api/sectors` e `/api/job-titles`:** listar, criar, renomear e desativar, por conta PJ, protegidas por `requireCatalogAccess`.
- **Cadastro e edição do colaborador:**
  - aceitam `setor_id`, `cargo_id` e `data_admissao`, conferidos contra a conta;
  - a lista devolve ids, nomes e a admissão.
- **Telas e menu:**
  - as telas "Setores" e "Cargos", com uma tela genérica por baixo;
  - itens no menu, guias de primeiro acesso e permissões na tela de Permissões, só em PJ.
- **Modais e lista:**
  - modais de PJ com Telefone, Data de admissão, Cargo e Setor;
  - linha "Nome · Cargo · Setor";
  - campos só para leitura no "Meus dados".

### Fora do escopo

- Criar setor ou cargo de dentro do modal do colaborador.
- Filtros e relatórios por setor ou cargo.
- Reativar setor ou cargo desativado. O caminho é criar de novo com o mesmo nome, já que o nome é único só entre os ativos.
- Esses campos para membro de conta PF, e os de cidade, estado e país.
- Mexer na tela de Representantes ou em outros cadastros, que continuam com o código antigo.

## Leitura de contexto

- **Contexto do projeto:**
  - `/AGENT.md`, na raiz, já lido nesta sessão. Ele descreve um sistema multi-prefeitura que não corresponde a este projeto, então só as regras transversais foram usadas.
  - `/CLAUDE.md`.
  - `/frontend/AGENT.md` e `/backend/AGENT.md` não existem neste projeto.
- **Backend:**
  - rotas: `representatives.ts`, `services.ts` e `accountMembers.ts` (lista, cadastro e edição);
  - middleware: `permissions.ts` (`requireCatalogAccess`);
  - utilitários: `catalogAccess.ts` (com o teste), `accountAccess.ts` (`canWriteToAccount`) e `requestInput.ts`;
  - serviços: `memberInput.ts` (com o teste);
  - schemas: `accountMembers.ts`, `memberPermissions.ts`, `representatives.ts` e `index.ts`.
- **Frontend:**
  - telas: `ServicosTab.tsx`, que é o modelo das telas novas, e `ContasTab.tsx` (`NovoMembroDialog`, `EditarUsuarioDialog` e `MembrosDaConta`);
  - layout: `ConfigPanel.tsx` e `AppShell.tsx`;
  - `screenAccess.ts` (com o teste), `permissoesService.ts`, `PermissoesTab.tsx` e `types/permissions.ts`;
  - `membrosService.ts`, `servicosService.ts` e `representantesService.ts`;
  - guias de primeiro acesso.

## Impacto por área

### Frontend

- **Serviço novo `src/services/accountNameCatalogService.ts`:**
  - `type AccountNameCatalogKind = 'sectors' | 'job-titles'`, que corresponde às rotas;
  - `interface AccountNameItem { id; nome; ativo; data_criacao }`;
  - `fetchAccountNames(kind, accountId, includeInactive)`, `saveAccountName(kind, { nome, conta_id }, id?)` e `deactivateAccountName(kind, id)`.
- **`src/services/queryKeys.ts`:** `accountNames: (kind, accountId) => ['account-names', kind, accountId] as const`.
- **Tela genérica nova `src/screens/config/AccountNameCatalogTab.tsx`:**
  - Recebe `kind`. Os textos de cada tipo ficam num mapa no próprio arquivo:
    - "Setor/Setores" e "Cargo/Cargos";
    - "Novo setor/Novo cargo";
    - o banner;
    - a chave e a mensagem do guia (`setores:novo-v1` e `cargos:novo-v1`);
    - o ícone;
    - o estado vazio.
  - Segue o padrão de `ServicosTab`:
    - `ConfigTabHeader` com o botão "Novo…" e o `ConfigSwitch` "Mostrar desativados";
    - linhas com `ConfigListRow`;
    - modal com o Nome (obrigatório, até 100 caracteres) e "Desativar" na edição, com confirmação;
    - guia de primeiro acesso;
    - estados de carregando e vazio.
  - Usa a conta ativa (`getActiveAccountId`). A tela só aparece em conta PJ.
  - Ao salvar ou desativar, invalida `accountNames(kind, conta)` e `['membros']`, porque a linha do colaborador mostra o nome.
- **`src/layout/ConfigPanel.tsx`:**
  - `ConfigItemId` ganha `'setores' | 'cargos'`;
  - os itens entram depois de "Representantes", no grupo Pessoas, com ícones `Network` e `Briefcase`;
  - renderiza `<AccountNameCatalogTab kind="sectors" />` e `kind="job-titles"`.
- **`src/layout/AppShell.tsx`:** `CONFIG_ITEM_IDS` ganha `'setores'` e `'cargos'`.
- **`src/utils/screenAccess.ts`:**
  - `CONFIG_ITEM_FLAG` ganha `setores: 'accessSectors'` e `cargos: 'accessJobTitles'`;
  - `COMPANY_ONLY_ITEMS` ganha os dois;
  - `CatalogName` e `CATALOG_RULES` (o espelho do backend) ganham `sectors` e `jobTitles`, com `listReaders: []`.
- **Tipos e permissões:**
  - `src/types/permissions.ts`: `PERMISSION_FLAGS` ganha `'accessSectors'` e `'accessJobTitles'`;
  - `src/services/permissoesService.ts`: o item ganha `companyOnly?: boolean`, e o grupo "Configurações" ganha "Setores" e "Cargos" com `companyOnly: true`;
  - `src/screens/config/PermissoesTab.tsx`: esconde os itens com `companyOnly` quando a conta é PF.
- **Guias de primeiro acesso:**
  - `src/context/FirstAccessGuideContext.tsx`: `MODULE_PRIORITY` ganha `setores: 1` e `cargos: 1`;
  - `src/components/firstAccessGuideMessages.ts`: entram `setoresNovo` e `cargosNovo`.
- **`src/services/membrosService.ts`:**
  - `MembroListItem` ganha `setor_id`, `setor_nome`, `cargo_id`, `cargo_nome` e `data_admissao`;
  - `MembroCreateBody` e `MembroUpdateBody` ganham `setor_id?`, `cargo_id?` e `data_admissao?`. `null` limpa.
- **Helper novo `src/utils/collaboratorRole.ts`** (com teste):
  - `collaboratorRoleLabel({ cargo_nome, setor_nome })` → "Gerente · Financeiro", pulando o que faltar;
  - `catalogOptions(items, currentId, currentName)`: os ativos mais o atual mesmo desativado, como "Nome (desativado)".
- **`src/screens/config/ContasTab.tsx`:**
  - **`NovoMembroDialog`, em PJ:**
    - recebe `accountId`;
    - novas linhas: Telefone e Data de admissão, depois Cargo e Setor;
    - os selects buscam as listas ativas da conta em `accountNames`;
    - sem itens, o select mostra "Sem cargo" ou "Sem setor" e a dica "Cadastre em Configurações → Cargos/Setores";
    - envia `telefone`, `data_admissao`, `cargo_id` e `setor_id`.
  - **`EditarUsuarioDialog`, em PJ:**
    - edição pelo titular: Telefone, Data de admissão, Cargo e Setor editáveis, com o atual desativado continuando na lista;
    - "Meus dados" do colaborador: Telefone editável; Cargo, Setor e Admissão em texto só para leitura;
    - a PF continua igual.
  - **Envio da edição pelo titular (`updateMembro`):** inclui os campos novos.
  - **Envio do "Meus dados" (`updateMe`):** inclui o telefone e reenvia o nascimento gravado, como hoje.
  - **`MembrosDaConta`:** a linha mostra `{nome}` e, em cinza, " · {collaboratorRoleLabel}" quando houver.
- **Estados:** as listas dos selects têm carregando e erro (com o select desabilitado), e o erro do servidor aparece pelo `error` do modal.

### Backend

- **Schemas:**
  - novo `backend/src/db/schema/sectorsAndJobTitles.ts`, com uma função `accountNameCatalogTable(name: string)` que gera `sectors` (`'setores'`) e `jobTitles` (`'cargos'`), com o mesmo formato;
  - `export *` em `index.ts`.
- **`backend/src/db/schema/accountMembers.ts`:** entram `sectorId` (`setor_id`, ref `sectors.id`, `onDelete: 'set null'`), `jobTitleId` (`cargo_id`, ref `jobTitles.id`, `onDelete: 'set null'`) e `admissionDate` (`date('data_admissao')`).
- **`backend/src/db/schema/memberPermissions.ts`:** entram `accessSectors` (`acesso_setores`) e `accessJobTitles` (`acesso_cargos`), no bloco "Configurações". `PermissionFlag` vem do schema e acompanha sozinho.
- **`backend/src/utils/catalogAccess.ts`:**
  - `CatalogName` ganha `'sectors' | 'jobTitles'`;
  - as regras: `sectors: { manageFlag: 'accessSectors', listReaders: [], listPaths: ['/'] }` e `jobTitles` igual, com `accessJobTitles`;
  - o titular e o admin sempre passam, por `requireCatalogAccess`.
- **Leitor puro novo `backend/src/services/accountNameInput.ts`** (com teste):
  - `readAccountCatalogName(value, labels)`, com o nome sem espaços nas pontas, obrigatório e de até 100 caracteres;
  - mensagens: "Informe o nome do setor/cargo" e "Nome do setor/cargo: até 100 caracteres".
- **Rota genérica nova `backend/src/routes/accountNameCatalog.ts`:**
  - `createAccountNameCatalogRouter({ table, labels })`, em Drizzle, com `sendRequestError` e mensagens em português.
  - **`GET /?conta_id=&incluir_inativos=true`:**
    - `conta_id` é obrigatório ("Informe a conta");
    - a conta precisa passar em `canWriteToAccount(conta, solicitante)`, ou seja, ser do dono ou ter vínculo ativo. Senão: "Conta não encontrada" (404);
    - a conta precisa ser `empresa`. Senão: "Setores e cargos só existem em conta de empresa" (400);
    - lista `{ id, nome, ativo, data_criacao }` por nome.
  - **`POST /` `{ conta_id, nome }`:**
    - passa pelas mesmas checagens da conta;
    - nome repetido entre os ativos, sem diferenciar maiúscula: "Já existe um setor/cargo com esse nome" (400);
    - grava com `usuario_id` igual ao dono da conta (`contas.usuario_id`);
    - um conflito do índice único (23505) vira a mesma mensagem.
  - **`PUT /:id` `{ nome }`:**
    - carrega o registro e confere o acesso pela conta dele ("Setor/Cargo não encontrado", 404);
    - aplica a mesma checagem de nome repetido, fora o próprio registro.
  - **`DELETE /:id`:** desativa, com `ativo = false`. Os colaboradores que usam o item continuam com ele.
- **`backend/src/server.ts`:**
  - `app.use('/api/sectors', authenticate, requireActivePlan, requireCatalogAccess('sectors'), sectorRoutes)`;
  - `app.use('/api/job-titles', …, requireCatalogAccess('jobTitles'), jobTitleRoutes)`.
- **`backend/src/services/memberInput.ts`:**
  - `NewMemberInput` ganha `sectorId: number | null`, `jobTitleId: number | null` e `admissionDate: string | null`;
  - `MemberUpdateInput` ganha `sectorId?`, `jobTitleId?` e `admissionDate?`, onde `undefined` mantém e `null` limpa;
  - os ids precisam ser inteiros positivos ou vazios. Senão: "Setor inválido" ou "Cargo inválido";
  - a data passa por `readOptionalIsoDate`. Senão: "Data de admissão inválida".
- **`backend/src/routes/accountMembers.ts`:**
  - **`GET /`:**
    - as duas consultas ganham `m.setor_id, st.nome AS setor_nome, m.cargo_id, cg.nome AS cargo_nome, m.data_admissao`;
    - entram `LEFT JOIN setores st ON st.id = m.setor_id` e `LEFT JOIN cargos cg ON cg.id = m.cargo_id`.
  - **Helper `checkMemberPlacement(accountId, { sectorId, jobTitleId, admissionDate }, current)`:**
    - em conta PF, se vier qualquer um dos três: "Cargo, setor e admissão só existem em conta de empresa" (400);
    - cada id precisa ser da mesma conta e estar ativo, ou ser igual ao atual do colaborador (na edição). Senão: "Setor não encontrado nesta conta" ou "Cargo não encontrado nesta conta".
  - **`POST /`:** grava `sectorId`, `jobTitleId` e `admissionDate` no insert de `conta_membros`.
  - **`PUT /:id`:**
    - carrega o vínculo atual (com setor, cargo e admissão);
    - a atualização de `usuarios` e de `conta_membros` passa a rodar em `db.transaction`;
    - a resposta inclui os campos novos.
  - **`PERMISSION_FLAGS`:** ganha `'accessSectors'` e `'accessJobTitles'`.
- **`PUT /users/me`:** não muda. Ele grava só o cadastro da pessoa e nunca recebe cargo nem setor.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**`backend/drizzle/0062_setores_cargos_colaborador.sql`**, só com acréscimos. Na produção, entra antes do merge e do deploy:

```sql
CREATE TABLE IF NOT EXISTS setores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_setores_conta ON setores(conta_id);
CREATE UNIQUE INDEX IF NOT EXISTS setores_conta_nome_ativo_unique ON setores(conta_id, LOWER(nome)) WHERE ativo;
-- cargos: igual, com idx_cargos_conta e cargos_conta_nome_ativo_unique
ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS cargo_id INTEGER REFERENCES cargos(id) ON DELETE SET NULL;
ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS data_admissao DATE;
ALTER TABLE membro_permissoes ADD COLUMN IF NOT EXISTS acesso_setores BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membro_permissoes ADD COLUMN IF NOT EXISTS acesso_cargos BOOLEAN NOT NULL DEFAULT false;
```

- **Cabeçalho:** o mesmo padrão das migrations anteriores (motivo, ORDEM e o aviso de não executar sem confirmação).
- **Compatibilidade com o código anterior:** a lista de membros usa colunas explícitas, e o `select()` de `membro_permissoes` lê só as colunas do schema dele. Por isso a ordem "migration antes" é segura.
- **Índice único parcial:** fica só no SQL, como os outros índices parciais do projeto. O schema do Drizzle declara só o índice comum de `conta_id`.

### Infra/Deploy

- Sem variável de ambiente nova.
- **Ordem na produção:**
  1. 0062, com confirmação e fora do modo automático;
  2. merge na `main`, que faz o deploy pelo Render.
- **Conferência do deploy:** sem login, `GET /api/sectors` responde 404 no código antigo e 401 no novo.

## Arquivos provavelmente afetados

- **Banco:**
  - `backend/drizzle/0062_setores_cargos_colaborador.sql` (novo);
  - schemas: `backend/src/db/schema/sectorsAndJobTitles.ts` (novo), `index.ts`, `accountMembers.ts` e `memberPermissions.ts`.
- **Backend:**
  - novos: `backend/src/routes/accountNameCatalog.ts`, `backend/src/services/accountNameInput.ts` e o teste dele;
  - `backend/src/server.ts` e `backend/src/routes/accountMembers.ts`;
  - `backend/src/services/memberInput.ts` e o teste;
  - `backend/src/utils/catalogAccess.ts` e o teste.
- **Frontend:**
  - novos:
    - `src/screens/config/AccountNameCatalogTab.tsx`;
    - `src/services/accountNameCatalogService.ts`;
    - `src/utils/collaboratorRole.ts` e o teste;
  - `src/screens/config/ContasTab.tsx` e `src/services/membrosService.ts`;
  - `src/services/queryKeys.ts`, `src/layout/ConfigPanel.tsx` e `src/layout/AppShell.tsx`;
  - `src/utils/screenAccess.ts` e o teste;
  - `src/types/permissions.ts`, `src/services/permissoesService.ts` e `src/screens/config/PermissoesTab.tsx`;
  - guias de primeiro acesso: `src/context/FirstAccessGuideContext.tsx` e `src/components/firstAccessGuideMessages.ts`.

## Estratégia de implementação

1. **Branch:** `git checkout main && git pull`, depois `git checkout -b feat/R/colaborador-cargo-setor`. `.portal/` e `GLOSSARIO.md` ficam fora do commit.
2. **Migration 0062:** escrever o arquivo e aplicar no banco local, com confirmação.
3. **Backend:**
   1. schemas (tabelas novas, colunas do vínculo e permissões) e `catalogAccess`, com o teste;
   2. `accountNameInput`, com o teste, a rota genérica e os mounts no `server.ts`;
   3. `memberInput`, com o teste: os campos novos;
   4. `accountMembers`: a lista com os nomes, `checkMemberPlacement`, o cadastro e a edição em transação, e `PERMISSION_FLAGS`.
4. **Frontend:**
   1. serviço, `queryKeys` e helper `collaboratorRole`, com o teste;
   2. tela genérica, `ConfigPanel`, `AppShell`, `screenAccess` (com o teste), permissões (tipos, grupos, `companyOnly` na `PermissoesTab`) e guias;
   3. `membrosService` e `ContasTab` (modais, "Meus dados" só leitura e linha da lista).
5. **Validação:**
   - testes, checagem de tipos e builds;
   - roteiro local com o backend na porta 3013 e o `.env.dev`;
   - teste de tela;
   - limpeza dos usuários de teste.
6. **Fechamento:** resumo curto e a pergunta sobre a produção. A 0062 vai para a produção antes do merge, no `/finalizar`.

## Regras de negócio identificadas

- **Abrangência:** cargo, setor, data de admissão e telefone valem só para colaborador de conta PJ, e todos são opcionais.
- **Setores e cargos:**
  - pertencem a uma conta PJ e são independentes entre si;
  - o nome é único entre os ativos da conta, sem diferenciar maiúscula;
  - excluir significa desativar, sem reativação.
- **Item desativado:**
  - continua ligado ao colaborador que já o usa e aparece como "(desativado)" na edição;
  - não pode ser escolhido para outro colaborador.
- **Quem mantém as telas:** o titular, o admin e o colaborador com a permissão daquela tela.
- **Quem altera cargo, setor e admissão do colaborador:** só o titular, porque cadastro e edição de colaborador já são exclusivos dele.
- **"Meus dados" do colaborador:** ele vê os dados de trabalho só para leitura e edita o próprio telefone.
- **Lista da conta:** a linha mostra "Nome · Cargo · Setor", pulando o que estiver vazio.

## Regras multi-tenant e segurança

- **Isolamento:** o projeto não é multi-tenant. O isolamento é por usuário e por conta.
- **Telas de setores e cargos:**
  - a conta vem do pedido e é conferida em `canWriteToAccount`, por dono ou vínculo ativo;
  - a rota recusa conta PF;
  - a permissão vale no servidor (`requireCatalogAccess`), e o menu só esconde.
- **Ids enviados:**
  - os de setor e cargo são conferidos contra a conta do colaborador, para impedir que se ligue um cargo de outra empresa;
  - na edição de setor ou cargo, o acesso é conferido pela conta do próprio registro.
- **Dados de trabalho:** o colaborador nunca altera os próprios, porque `PUT /users/me` não recebe esses campos.
- **Erros:** respostas em português, sem dado de outra conta. "Conta não encontrada" cobre tanto a conta inexistente quanto a alheia.

## Validações necessárias

- **Rotas de setores e cargos:**
  - `conta_id` é um inteiro positivo obrigatório;
  - o nome é obrigatório, sem espaços nas pontas e com até 100 caracteres;
  - nome repetido entre os ativos é recusado;
  - o `:id` é um inteiro positivo.
- **Cadastro e edição do colaborador:**
  - `setor_id` e `cargo_id` são inteiros positivos ou vazios;
  - `data_admissao` é uma data ISO válida ou vazia;
  - na conta PF, os três precisam vir vazios;
  - os ids precisam ser da conta e estar ativos, ou ser os atuais.
- **No frontend:** o nome é obrigatório no modal das telas, e a data usa um `input type="date"`. A validação que vale é a do servidor.

## Testes necessários

### Frontend

- **`src/utils/collaboratorRole.test.ts`:**
  - rótulo com os dois, só um ou nenhum;
  - opções com o atual desativado.
- **`src/utils/screenAccess.test.ts`:**
  - "Setores" e "Cargos" aparecem para o titular em PJ e não em PF;
  - membro com `accessSectors` vê só "Setores";
  - as regras de `CATALOG_RULES` para `sectors` e `jobTitles`.
- **Teste de tela (jsdom, no scratchpad, fora do commit):**
  - a tela "Setores" lista, cria, renomeia e desativa;
  - o "Novo colaborador" de PJ tem Telefone, Admissão, Cargo e Setor, e o de PF não;
  - a edição mostra o cargo atual mesmo desativado;
  - o "Meus dados" do colaborador mostra os campos só para leitura;
  - a linha mostra "Nome · Cargo · Setor";
  - a tela de Permissões mostra "Setores" e "Cargos" só em PJ.

### Backend

- **`accountNameInput.test.ts`:** nome vazio, com espaços e acima de 100 caracteres, com as mensagens de setor e de cargo.
- **`memberInput.test.ts`:**
  - ids inválidos ("Setor inválido" e "Cargo inválido");
  - data inválida;
  - na edição, ausente mantém e `null` limpa.
- **`catalogAccess.test.ts`:** `sectors` e `jobTitles` liberados com a própria permissão e negados sem ela, inclusive na listagem.

### E2E

Roteiro local `roteiro_cargos.mjs`, com o backend na porta 3013 e os usuários em `@roteiro-cargos.test`:

1. **Cadastro de setores e cargos pelo titular PJ:**
   - o titular cria os setores "Financeiro" e "Comercial" e o cargo "Gerente" → 201;
   - "financeiro" repetido → 400 "Já existe um setor com esse nome".
2. **Conta PF:** listar ou criar setor numa conta PF → 400.
3. **Permissões do colaborador:**
   - sem permissão → 403 em `/api/sectors`;
   - com `accessSectors` → consegue cadastrar setores e leva 403 em `/api/job-titles`.
4. **Colaborador com cargo e setor:**
   - criar colaborador com cargo, setor, admissão e telefone → 201;
   - a lista traz `cargo_nome`, `setor_nome` e `data_admissao`.
5. **Recusas no colaborador:**
   - cargo de outra conta → 400 "Cargo não encontrado nesta conta";
   - membro PF com setor → 400.
6. **Setor desativado:**
   - desativar "Financeiro" → o colaborador continua com ele;
   - editar mantendo o mesmo setor → 200;
   - trocar por outro setor desativado → 400.
7. **"Meus dados":** o colaborador manda `PUT /users/me` com o telefone novo → 200, e o cargo e o setor não mudam.
8. **Exclusão do colaborador:** o `GET /api/sectors` de outra conta não traz os setores da conta testada.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx vite build
npm --prefix backend test
npm --prefix backend run build

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0062 --banco local

# Produção — só no /finalizar, com confirmação explícita, ANTES do merge:
npm --prefix backend run migrations:status -- --banco producao
npm --prefix backend run migrations:aplicar -- 0062 --banco producao --confirmo
```

## Riscos e pontos de atenção

- **Ordem do deploy:** a 0062 precisa estar na produção antes do deploy. Sem ela, a lista de colaboradores e as permissões quebram, porque o código novo lê as colunas novas.
- **Edição do colaborador:** passa a gravar em duas tabelas (`usuarios` e `conta_membros`). A transação evita que só uma parte seja salva.
- **Setor ou cargo desativado:** precisa continuar visível no colaborador que já o usa. Os helpers de opções e a validação no servidor ("ou é o atual") cuidam disso.
- **Contas sem setores ou cargos:** o modal precisa funcionar com as listas vazias, e os campos são opcionais.
- **Membros com permissão:** só passam a ver as telas novas depois que o titular liberar. As permissões nascem desligadas, como as demais.
- **Layout:** os modais ficam maiores e não foram vistos no navegador. Vale conferir depois do deploy.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Telas "Setores" e "Cargos":**
  - aparecem em Configurações → Pessoas só em conta PJ, para o titular e para quem tem a permissão de cada uma;
  - permitem criar, renomear e desativar;
  - recusam nome repetido.
- **"Novo colaborador" e "Editar" de PJ:**
  - têm Telefone, Data de admissão, Cargo e Setor, todos opcionais;
  - o servidor recusa cargo ou setor de outra conta;
  - a linha da lista mostra "Nome · Cargo · Setor".
- **"Meus dados" do colaborador:** mostra cargo, setor e admissão só para leitura e deixa editar o telefone.
- **Membro de conta PF:** nada muda.
- **Tela de Permissões:** tem "Setores" e "Cargos" separadas, só em conta PJ.
- **Validação técnica:**
  - testes, checagem de tipos e builds passam;
  - o roteiro local e o teste de tela passam;
  - a 0062 é aplicada com confirmação, antes do deploy.

## Observações para a skill implementar

- **Fonte de contexto:** usar este plano. Seguir `/CLAUDE.md` e as regras transversais do `/AGENT.md`.
- **Execução enxuta:** só status curto no chat, sem relatórios longos nem diffs.
- **Migrations:**
  - pedir confirmação antes da 0062, mesmo no banco local;
  - na produção, só no `/finalizar` e antes do merge.
- **Código genérico:** uma rota e uma tela servem setores e cargos. Não duplicar código.
- **Código novo:** Drizzle, mensagens em português e nomes de código em inglês. Os campos do pedido seguem o padrão em português que já existe (`setor_id`, `cargo_id`, `data_admissao`, `setor_nome`, `cargo_nome`, `nome`, `conta_id`).
- **Testes sem `.env`:** os leitores puros (`accountNameInput`, `memberInput`) não importam `db/client`.
- **Backend local do roteiro:** na porta 3013, confirmando que o banco carregado é o local. No fim, conferir se sobrou processo na porta e avisar o usuário.
- **Fechamento:** "A implementação está pronta localmente. Deseja enviar para produção?".

## Notas da implementação (2026-10-03)

- **Validação local:**
  - A 0062 foi aplicada no banco local com a confirmação do usuário.
  - Roteiro de API (`roteiro_cargos.mjs`, backend local na porta 3013): 31/31.
  - Teste de renderização (`smoke_cargos.mts`): 10/10.
  - Os usuários de teste `@roteiro-cargos.test` foram apagados depois.
- **Formulários:**
  - O frontend lê setor, cargo e admissão com `readCollaboratorWorkFields` (`src/utils/collaboratorRole.ts`, com teste).
  - Campo ausente não muda nada. É o caso do select que ainda não carregou e do "Meus dados", que só mostra.
- **Chaves de cache novas em `queryKeys`:** `accountNames`, `accountNamesOfKind` e `membrosAll`.
- **Limpeza:** o cabeçalho de seção "Sócios", que ficou vazio em `firstAccessGuideMessages.ts` depois do plano anterior, virou a seção "Setores e cargos".
