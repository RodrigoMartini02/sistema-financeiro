# Plano de Implementação: Campos da conta PJ e do colaborador

## Origem

- Arquivo de especificação: nenhum `.md` — alinhamento feito na conversa de 2026-10-01 (lista de campos conferida e aprovada pelo usuário, "sim para todos") e as 5 decisões abaixo.
- Data do planejamento: `2026-10-01`
- Classificação: `frontend + backend + database`

## Resumo

Hoje a conta PJ mistura dados da pessoa com os da empresa, e cada caminho pede campos diferentes:

- **Cadastro pelo site:**
  - o "Nome" ambíguo recebeu a razão social;
  - a razão social da conta ficou vazia;
  - o CNPJ virou o documento da pessoa.
- **Editar conta:**
  - o modal mostra "Meus dados" com o CNPJ cortado no campo "CPF";
  - ao salvar, grava só metade ("Invalid CPF/CNPJ");
  - a PJ adicional mostra "Nova senha", mas o campo não tem efeito.
- **Nova conta:** pede outros campos.

O plano deixa a conta PJ como **a própria empresa**:

- os mesmos campos da empresa no cadastro do site, na "Nova conta" e no "Editar";
- o login PJ é a empresa (CNPJ, e-mail e senha), sem dados de pessoa;
- pessoas entram como colaboradores, com dados de pessoa enxutos.

## Decisões registradas

- **Do alinhamento:**
  - login continua "CPF ou CNPJ";
  - razão social obrigatória e nome fantasia opcional;
  - enquadramento opcional;
  - sai a prévia de categorias;
  - "Saldo inicial" opcional e "atividade" removida;
  - na PJ não há dados de pessoa;
  - PF não muda;
  - nada de corrigir dados já gravados;
  - bloco "Acesso" na PJ que é o login, com logo;
  - nome do topo é o da empresa;
  - "conta incompleta" olha só a razão social;
  - CNPJ não repete entre contas do titular;
  - colaborador sem telefone e nascimento, senha de 8 e "quem lançou" mantido;
  - colaborador usar os cadastros da empresa vira tarefa separada.
- **Decisão 1:** na PJ que é o login, salvar a empresa e o acesso num pedido só, de uma vez. Nome e CNPJ do login acompanham a empresa.
- **Decisão 2:** o nome do topo vem da empresa já na entrada, e o nome do login é atualizado ao salvar.
- **Decisão 3:** apagar a coluna `contas.atividade` com a migration 0056, depois do deploy e com confirmação.
- **Decisão 4:** senha mínima de 8 na criação, para todos os membros (inclusive PF).
- **Decisão 5:** aplicar a migration 0042 só no banco local, com confirmação, para testar o cadastro e o colaborador de verdade.

## Escopo

### Dentro do escopo

**Bloco da empresa** — igual no cadastro do site (PJ), na Nova conta e no Editar conta PJ:

| Campo | Regra |
|---|---|
| Razão social | obrigatória |
| Nome fantasia | opcional |
| CNPJ | obrigatório; dígito verificador; não repete entre as contas do mesmo titular |
| Enquadramento | opcional; um da lista (MEI, ME, EPP, SLU, EIRELI, LTDA, SA) |
| Data de abertura | opcional; data válida |
| Saldo inicial | opcional; ≥ 0; coluna `aporte_inicial` (já usada no saldo) |

- O nome da conta (`contas.nome`) é calculado no servidor: nome fantasia ou, sem ele, razão social.

**Cadastro PJ pelo site**

- Bloco da empresa, mais E-mail (obrigatório) e Senha (obrigatória, mínimo 8).
- O login criado recebe:
  - nome = nome da conta;
  - sobrenome = vazio;
  - documento = CNPJ.
- Sem sobrenome, telefone e nascimento. O cadastro PF não muda.

**Nova conta** (Configurações → Contas): só o bloco da empresa.

**Editar conta PJ**

- Bloco da empresa.
- Na **PJ que é o login** (conta padrão `eh_padrao` do tipo empresa, do próprio titular), também o bloco "Acesso":
  - E-mail;
  - Nova senha (opcional, mínimo 8);
  - Logo, que é a foto do menu (envio imediato, como a foto hoje).
- Salvar é um pedido só (PUT `/contas/:id`): conta e login (nome, CNPJ, e-mail e senha) numa transação, ou nada.
- No campo CNPJ dessa conta aparece o aviso de que ele também é o documento de acesso.
- A PJ adicional não tem o bloco "Acesso".

**Nome do topo**

- Titular (`titular`/`admin`) cuja conta padrão é PJ: o menu mostra o nome da empresa, já na entrada.
- Salvar a empresa atualiza `usuarios.nome` (decisão 2).
- Membro ou colaborador continua com o próprio nome.

**Conta incompleta:** PJ sem razão social.

**Colaborador**

- **Criar:**
  - Nome (obrigatório) e Sobrenome;
  - E-mail (obrigatório);
  - CPF (opcional; em conta de empresa, só CPF);
  - Senha (obrigatória, mínimo 8).
- **Meus dados e Editar colaborador:** Foto, Nome (obrigatório), Sobrenome, E-mail, CPF e Nova senha.
- Telefone e data de nascimento aparecem só para membro de conta PF.
- Senha mínima de 8 na criação para todos os membros (decisão 4).

**Sai**

- Do modal da PJ: "Meus dados" e "Nova senha".
- A prévia "N categorias serão criadas" (`CategoryPreview` / `PREVIEW_CATEGORIAS`).
- O campo e a coluna "atividade".
- A validação de CNPJ que só contava os 14 dígitos.

### Fora do escopo

- Colaborador usar os cadastros da empresa (categorias, clientes, contratos, representantes, produtos) — tarefa B.
- Contas PF (cadastro, modal, "Meus dados" do titular PF), exceto a senha de 8 na criação de membro.
- Corrigir dados já gravados. Exemplos: razão social que foi para o nome do login, contas com CNPJ repetido.
- Mudar a forma de login. Criar categorias por enquadramento.
- Aplicar as migrations 0055 e 0056 em produção (sempre depois do deploy, com confirmação).

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`. `/frontend/AGENT.md` e `/backend/AGENT.md` **não existem** neste projeto.
- **Front:**
  - `src/screens/public/LoginPage.tsx`, `src/services/authService.ts`;
  - `src/screens/config/ContasTab.tsx` (`ContaDialog`, `NovoMembroDialog`, `EditarUsuarioDialog`, `MembrosDaConta`, `isContaIncompleta`, `handleSave`);
  - `src/services/configService.ts`, `src/types/config.ts`;
  - `src/layout/AccountMenu.tsx`, `src/utils/document.ts`;
  - `src/ui/dialogFormTokens.tsx` (`MoneyField`, `parseMoney`).
- **Servidor:**
  - `backend/src/routes/auth.ts` (`/register`), `backend/src/routes/accounts.ts`, `backend/src/routes/accountMembers.ts`, `backend/src/routes/users.ts` (`PUT /me`);
  - `backend/src/middleware/validation.ts` (`validateDocument`);
  - `backend/src/db/schema/accounts.ts`;
  - `backend/src/services/balanceService.ts` e `painelService.ts` (uso do `aporte_inicial`).
- **Banco:** `backend/drizzle/0042_renomear_papeis_titular_membro.sql`.

## Impacto por área

### Frontend

**Regras comuns** — novo `src/utils/companyAccount.ts`, com teste:

- `ENQUADRAMENTO_OPTIONS` (sai do `ContasTab`);
- `companyDisplayName({ nome_fantasia, razao_social })`;
- `isValidCnpj` (dígito verificador);
- leitura do saldo inicial (reaproveita `parseMoney`).

**Cadastro do site** — `LoginPage.tsx` e `authService.ts`:

- O formulário PJ passa a ter: Razão social, Nome fantasia, CNPJ, Enquadramento, Data de abertura, Saldo inicial, E-mail e Senha.
- Saem: Nome, Telefone e "Nome fantasia" obrigatório.
- `register` envia, para PJ: `documento`, `razao_social`, `nome_fantasia`, `enquadramento`, `data_abertura`, `aporte_inicial`, `email` e `senha`.
- O caminho PF não muda.

**Modal da conta** — `ContasTab.tsx` (`ContaDialog`):

- Bloco da empresa igual ao criar e ao editar, com Saldo inicial (`MoneyField`) e razão social obrigatória.
- Na PJ que é o login: bloco "Acesso" (e-mail, nova senha, logo) e o aviso no CNPJ. Salva num pedido só; no sucesso, invalida `session` e `contas`.
- A PJ adicional fica sem "Acesso".
- O caminho PF não muda: continua com "Meus dados" e os dois pedidos de hoje.
- `isContaIncompleta` passa a olhar só a razão social.
- Remover `CategoryPreview`, `PREVIEW_CATEGORIAS` e a leitura de `atividade`.

**Serviços e tipos:**

- `configService.saveConta`, com o payload novo:
  - para empresa, sem `nome`, com `aporte_inicial`, mais `email` e `nova_senha` quando for a PJ do login;
  - para pessoa, igual a hoje.
- `types/config.ts`: o tipo `Conta` perde `atividade` e ganha `aporte_inicial`.

**Topo** — `AccountMenu.tsx`: titular com conta padrão PJ mostra o nome da empresa.

**Colaborador** — `NovoMembroDialog`, `EditarUsuarioDialog` (via `MembrosDaConta`, que conhece o tipo da conta) e `membrosService.ts`:

- Em conta de empresa: sem telefone e nascimento; documento com máscara de CPF.
- Texto da senha: "mínimo de 8".

### Backend

**Leitura do bloco da empresa** — novo `services/companyAccountInput.ts`, com teste:

- Usa `RequestInputError` de `utils/requestInput.ts` e mensagens em português:
  - "Informe a razão social" / "Razão social: até N caracteres";
  - "CNPJ inválido";
  - "Enquadramento inválido";
  - "Data de abertura inválida";
  - "Saldo inicial inválido".
- Devolve os campos normalizados e o `displayName`.
- Para editar, diz se `aporte_inicial` veio no pedido.

**`POST /auth/register`**

- Com CNPJ: valida pela leitura nova.
- O usuário fica com:
  - nome = `displayName`;
  - sobrenome = null;
  - documento = CNPJ;
  - telefone e nascimento = null.
- A conta é criada com os campos lidos.
- Saem a exigência de `nome` e a de `nome_fantasia` para PJ.
- Com CPF, nada muda.

**`POST /contas`**

- Usa a leitura nova.
- Recusa CNPJ já existente em outra conta do mesmo titular ("Este CNPJ já está em outra conta sua").
- `name` = `displayName`.

**`PUT /contas/:id` (empresa)**

- Usa a mesma leitura e a mesma checagem de CNPJ, ignorando a própria conta.
- `aporte_inicial` só muda quando vem no pedido (`null` limpa).
- Se a conta é a PJ do login (`isDefault` e tipo empresa, do próprio titular), aceita `email` e `nova_senha`. Numa transação:
  1. atualiza a conta;
  2. atualiza o usuário:
     - nome = `displayName` e sobrenome = null;
     - documento = CNPJ, único entre usuários ("Este CNPJ já é o acesso de outro usuário");
     - e-mail, único ("E-mail já em uso");
     - senha com mínimo 8.
- Erro em qualquer passo desfaz tudo.
- O caminho PF não muda.

**`/account-members`:**

- `POST`: senha mínima 8, para todos.
- `POST` e `PUT /:id` em conta de empresa: documento só CPF ("Informe um CPF válido").

**Schema e leitura de contas:**

- `GET /contas` deixa de selecionar `atividade`.
- `db/schema/accounts.ts` perde `activity`.

### Banco de dados

- **Nova migration** `backend/drizzle/0056_remover_atividade_contas.sql`: `ALTER TABLE contas DROP COLUMN IF EXISTS atividade;`.
  - Cabeçalho no estilo das anteriores, com a ordem: aplicar só depois do deploy do código que já não usa a coluna.
  - Será escrita e **não executada**.
- **Validação local (decisão 5):** aplicar `0042_renomear_papeis_titular_membro.sql` **só no banco local** (`.env.dev`, localhost:5433), depois de pedir confirmação no momento.
- Sem colunas novas: o saldo inicial usa `aporte_inicial`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variáveis de ambiente novas.
- Em produção ficam pendentes 0055 e 0056, cada uma aplicada à mão, depois do deploy e com confirmação.
- O site antigo em cache envia o cadastro PJ no formato velho, sem razão social, e recebe erro até recarregar.

## Arquivos provavelmente afetados

**Backend:**

- `backend/src/routes/auth.ts`;
- `backend/src/routes/accounts.ts`;
- `backend/src/routes/accountMembers.ts`;
- `backend/src/db/schema/accounts.ts`;
- novos: `backend/src/services/companyAccountInput.ts`, `backend/src/services/companyAccountInput.test.ts`, `backend/drizzle/0056_remover_atividade_contas.sql`.

**Frontend:**

- `src/screens/public/LoginPage.tsx`, `src/services/authService.ts`;
- `src/screens/config/ContasTab.tsx`;
- `src/services/configService.ts`, `src/services/membrosService.ts`, `src/types/config.ts`;
- `src/layout/AccountMenu.tsx`;
- novos: `src/utils/companyAccount.ts`, `src/utils/companyAccount.test.ts`.

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `feat/R/conta-pj-campos`. Não tocar no `GLOSSARIO.md`.

**Fase 1 — Remover**

2. `CategoryPreview` e `PREVIEW_CATEGORIAS`.
3. "Meus dados" e "Nova senha" do caminho PJ do `ContaDialog`.
4. `atividade`:
   - front: payload, tipo e leitura do form;
   - servidor: leitura e gravação em POST/PUT e SELECT de `GET /contas`;
   - schema `activity`.
5. Campos de pessoa do formulário PJ do site (Nome, Telefone) e a exigência de `nome`/`nome_fantasia` no `/auth/register` para CNPJ.
6. Telefone e nascimento dos formulários do colaborador em conta de empresa.
7. A checagem de CNPJ só por tamanho em `/contas`.

**Fase 2 — Aplicar**

8. `services/companyAccountInput.ts` e teste.
9. `/auth/register` (caminho PJ).
10. `POST /contas` e `PUT /contas/:id`: unicidade do CNPJ, saldo inicial e a transação da PJ do login.
11. `/account-members`: senha 8 e CPF em conta de empresa.
12. Migration 0056 (escrever; não executar).
13. `utils/companyAccount.ts` e teste.
14. Cadastro do site e `authService.register`.
15. `ContaDialog`: bloco da empresa, "Acesso" e salvar num pedido; `handleSave` e `saveConta`; `isContaIncompleta`; tipos.
16. `AccountMenu`: nome do topo.
17. Formulários do colaborador e `membrosService`.

**Fase 3 — Validar**

18. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build`, `npm --prefix backend test`.
19. **Pedir confirmação** e aplicar a 0042 no banco local.
20. Roteiro da API contra o backend local (`.env.dev`), com dados de teste apagados no fim. Cenários em "Testes necessários / E2E".
21. Fumaça (jsdom):
    - o modal da conta na PJ do login, na PJ adicional e na PF;
    - os campos do cadastro PJ;
    - o formulário de colaborador.
22. Parar o backend (`taskkill /T`), apagar tokens e dados de teste.

## Regras de negócio identificadas

**Empresa e login**

- Conta PJ é a empresa. O login PJ é a empresa: CNPJ ou e-mail, mais senha.
- Os campos da empresa são os mesmos nos três caminhos, com as mesmas regras.
- Nome da conta = nome fantasia ou razão social.
- CNPJ não repete entre as contas do mesmo titular (entre titulares diferentes, pode).
- Na PJ do login, mudar o CNPJ muda o documento de acesso.

**Telas e avisos**

- "Conta incompleta" = PJ sem razão social.
- O nome do topo para titular com conta padrão PJ é o da empresa.

**Colaborador**

- É pessoa: CPF opcional, sem telefone e nascimento.
- Senha mínima de 8 em toda criação de membro.

## Regras multi-tenant e segurança

**Dono e transação**

- O dono vem da sessão (`req.user.id`), nunca do corpo.
- `PUT /contas/:id` continua filtrando por `usuario_id` do titular.
- A atualização do login só acontece quando a conta é a conta padrão do próprio solicitante.
- A transação garante que conta e login não fiquem dessincronizados.

**Unicidade**

- CNPJ entre contas: só dentro do mesmo titular.
- Documento e e-mail do login: entre todos os usuários, como hoje.

**Mensagens**

- Não revelam dados de outros usuários (sem dizer de quem é o CNPJ ou o e-mail).

**Senha**

- Continua com hash `bcrypt`. Mínimo 8 no servidor, não só no front.

## Validações necessárias

- **Razão social:** obrigatória, com tamanho máximo da coluna.
- **Nome fantasia:** opcional, com tamanho máximo.
- **CNPJ:** 14 dígitos e dígito verificador.
- **Enquadramento:** vazio ou um da lista.
- **Data de abertura:** vazia ou ISO válida.
- **Saldo inicial:** vazio ou número ≥ 0 com até 2 casas.
- **E-mail:** formato válido (cadastro e "Acesso") e único.
- **Senha:** mínimo 8 (cadastro, "Acesso", criação de membro).
- **Colaborador em conta de empresa:** documento vazio ou CPF válido.

## Testes necessários

### Frontend

- `src/utils/companyAccount.test.ts`:
  - nome exibido (fantasia, razão social);
  - CNPJ válido e inválido;
  - leitura do saldo inicial;
  - lista de enquadramento.

### Backend

- `backend/src/services/companyAccountInput.test.ts`:
  - razão social obrigatória;
  - nome fantasia opcional;
  - CNPJ com e sem dígito correto;
  - enquadramento fora da lista;
  - data inválida;
  - saldo negativo e não numérico;
  - `displayName`;
  - saldo inicial ausente versus `null` na edição.

### E2E

Roteiro local, depois da 0042:

**Cadastro PJ**

1. Sem razão social → 400.
2. Sem nome fantasia → cria:
   - conta com nome = razão social;
   - login com nome = razão social e documento = CNPJ.
3. CNPJ com dígito errado → 400.

**Nova conta**

4. CNPJ repetido no mesmo titular → 400.
5. CNPJ de outro titular → cria.

**Editar PJ do login**

6. Mudar o nome fantasia → login e topo com o nome novo.
7. E-mail já usado por outro → 400 e **nada** salvo (a conta não muda).
8. Nova senha válida → login com a nova senha.

**Editar sem `aporte_inicial` no corpo** → saldo inicial mantido.

**Colaborador em conta de empresa**

9. Documento CNPJ → 400.
10. Senha de 7 → 400.
11. CPF e senha de 8 → cria.

**Membro de conta PF**

12. Senha de 7 → 400.

**Contas**

13. `GET /contas` sem `atividade`.

**Fumaça**

14. Campos dos modais e do cadastro conforme a tabela; PJ adicional sem "Acesso"; PF igual a antes.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build

npm --prefix backend run build
npm --prefix backend test
```

Backend local: `cd backend && DOTENV_CONFIG_PATH=../.env.dev NODE_ENV=development npx tsx src/server.ts` (nunca `dev:prod-db`).

## Riscos e pontos de atenção

**Contrato e dados**

- O contrato do cadastro PJ mudou: o site antigo em cache recebe erro até recarregar.
- Titular que já tem duas contas com o mesmo CNPJ não consegue salvar a segunda até corrigir.

**Login**

- Na PJ do login, mudar o CNPJ muda o documento de entrada. Por isso o aviso no campo.
- O topo derivado da empresa vale só para titular, para não trocar o nome de colaboradores.

**Migrations**

- 0055 (já pendente) e 0056 (nova) ficam pendentes em produção. A ordem é sempre deploy → migration, com confirmação.
- A 0042 no banco local muda a regra de tipo de usuário. O único usuário local é admin, e não é afetado.

**Saldo**

- O saldo inicial passa a ser editável. Isso muda o "saldo anterior" das contas que o preencherem, que é o comportamento esperado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

**Cadastro PJ e contas**

- O cadastro PJ do site mostra só o bloco da empresa, E-mail e Senha.
- Ele cria a conta só com razão social (sem nome fantasia).
- O login fica com o nome da conta e o CNPJ.
- Nova conta e Editar conta PJ têm os mesmos 6 campos da empresa.
- CNPJ inválido, ou repetido no mesmo titular, é recusado com mensagem clara.

**PJ do login**

- Tem o bloco "Acesso".
- Salvar com e-mail já usado não grava nada.
- Mudar o nome fantasia muda o nome do topo.
- A PJ adicional não tem "Acesso" nem "Nova senha".
- Uma PJ que já existia mostra o nome da empresa no topo logo depois do deploy.

**Outros**

- "Conta incompleta" aparece só sem razão social.
- O colaborador é criado sem telefone e nascimento, só com CPF.
- Senha com menos de 8 é recusada na criação de qualquer membro.
- `atividade` sumiu das telas, do servidor e do schema. A migration 0056 está escrita e não executada.
- tsc, testes e builds passando. A PF continua igual, salvo a senha de 8 na criação de membro.

## Observações para a skill implementar

**Fontes**

- Usar este plano como fonte principal. A Fase 1 remove, a Fase 2 aplica.

**Migrations**

- 0056: só escrever.
- 0042: só no banco local, depois de pedir confirmação no momento.
- Nenhuma migration em produção.

**Testes e código**

- Testes manuais só com o backend em `.env.dev`. Nunca `dev:prod-db`.
- Queries novas em Drizzle (a transação da PJ do login também).
- Identificadores em inglês e textos ao usuário em português.
- Os campos do corpo de `/contas` e `/auth/register` mantêm os nomes atuais (`razao_social`, `nome_fantasia`, `aporte_inicial`...), para não quebrar quem já chama.
- Não alterar `.env`. Não fazer commit nem push: isso é do `/finalizar`.
