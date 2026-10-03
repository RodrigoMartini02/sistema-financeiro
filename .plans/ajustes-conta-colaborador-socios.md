# Plano de Implementação: Ajustes na conta — colaborador com CPF repetido, logo no topo, sócios com capital e fim do "Saldo inicial"

## Origem

- Arquivo de especificação: `.portal/tasks/ajustes-conta-colaborador-socios.md` (itens 1 a 3). O item 4 foi pedido no chat em 2026-10-02: "excluir campo 'saldo inicial' do modal conta pois vai ser substituido por capital inicial".
- Data do planejamento: `2026-10-02`
- Classificação: `frontend + backend + database`

## Resumo

1. **Colaborador com o CPF de quem já tem conta própria.**
   - Hoje o cadastro é recusado com "Document already registered", em inglês.
   - O colaborador passa a ganhar um login próprio, com o mesmo CPF e outro e-mail, e entra pelo e-mail.
   - O CPF continua único entre os acessos próprios (titular e admin). O login por CPF vai para o acesso próprio.
   - O cadastro e a edição de colaborador passam a responder em português.
   - **Brecha que precisa ser fechada junto:** a aba "Acessos" (analytics) é liberada só pelo CPF do admin. Com CPF repetido, um colaborador criado com esse CPF veria a aba. Por isso a aba passa a exigir também o tipo admin.
2. **Logo:** vai para o topo do modal "Editar conta" da PJ que é o login.
3. **Sócios no modal da conta PJ,** com participação (%), capital inicial e um checkbox "Lançar como receita" por sócio.
   - O capital vira receita uma vez só e depois trava.
   - A tela "Sócios" das Configurações sai, junto com a permissão "Sócios" dos colaboradores.
4. **O "Saldo inicial" (`contas.aporte_inicial`) sai do modal e do cadastro pelo site.**
   - A conta deixa de ter saldo de abertura: o saldo passa a ser receitas − despesas.
   - O capital só entra no saldo quando é lançado como receita.

## Decisões aplicadas

- **Decisão 1:** o login por CPF vai para o acesso próprio (titular ou admin).
  - O colaborador com CPF repetido entra pelo e-mail.
  - Sem acesso próprio, vale o único colaborador com o CPF, ou o único ativo. Com mais de um, a tela pede o e-mail.
- **Decisão 2:** a tela "Sócios" sai.
  - Os sócios ficam só no modal da conta PJ, e só o titular edita.
  - Sai também a permissão "Sócios" dos colaboradores.
- **Decisão 3:** com pelo menos um sócio, a conta só salva se a soma das participações der exatamente 100%. Sem sócios, salva.
- **Decisão 4:** o capital não entra sozinho no saldo. Um checkbox opcional lança o capital como receita.
- **Decisão 5:** o checkbox é um por sócio, e cada sócio gera a própria receita.
- **Decisão 6:** o capital é lançado como receita uma vez só.
  - Depois disso, o capital e o checkbox daquele sócio travam. Correções são feitas na tela de Receitas.
  - Excluir o sócio não apaga a receita.
  - Antes do lançamento, o capital continua editável.
- **Decisão 7:** o "Saldo inicial" sai também do cadastro de empresa pelo site.
- **Padrões definidos no planejamento,** que o usuário pode ajustar:
  - **Categoria:** a receita do capital entra na categoria nova de receita da PJ "Aporte de capital".
  - **Data e descrição:** a data é a de abertura da empresa ou, se ela estiver vazia, o dia do lançamento. A descrição é "Capital inicial — Nome do sócio".
  - **Valor exibido:** depois do lançamento, o modal mostra o valor atual da receita, inclusive se ela tiver sido corrigida em Receitas.
  - **Receita apagada:** se a receita for apagada na tela de Receitas, o vínculo é desfeito e o capital daquele sócio destrava, podendo ser lançado de novo.

## Escopo

### Dentro do escopo

- **Item 1 — colaborador com CPF repetido:**
  - Regra de CPF:
    - único entre os acessos próprios;
    - pode repetir em acesso de colaborador ou membro;
    - na mesma conta, não pode repetir o CPF do titular nem o de outro colaborador ativo.
  - Índice do banco ajustado (migration 0059).
  - Login por CPF conforme a decisão 1.
  - Cadastro pelo site, "Meus dados", cadastro feito pelo admin e CNPJ da PJ que é o login: o documento só é recusado quando é de outro acesso próprio.
  - Mensagens do cadastro e da edição de colaborador em português.
  - Aba "Acessos" exige tipo admin além do CPF liberado, no servidor e no menu.
  - Rótulo do login "CPF, CNPJ ou e-mail" e dica no "Novo colaborador".
- **Item 2:** logo no topo do "Editar conta" da PJ que é o login. O bloco "Acesso" fica com e-mail e nova senha.
- **Item 3 — sócios no modal da conta PJ:**
  - Seção "Sócios" no modal da "Nova conta" e do "Editar conta" PJ.
  - Gravação junto com a conta, no mesmo pedido e na mesma transação.
  - Capital e lançamento único do capital como receita, na categoria "Aporte de capital".
  - Colunas novas em `socios` (migration 0060).
  - Rota de leitura dos sócios só para o titular.
- **Item 4 — fim do "Saldo inicial":**
  - Sai todo o código do `aporte_inicial`: leitura, gravação, saldo de abertura em Movimentações e no Painel, modal, cadastro pelo site, tipos e testes.
  - A coluna sai depois do deploy (migration 0061).
- **Saída da tela "Sócios":**
  - Saem a tela, o item do menu, os guias de primeiro acesso, a permissão `accessPartners` (a coluna sai na 0061), as rotas de gravar sócio e o atalho `/api/socios`.

### Fora do escopo

- O mesmo login em várias contas (caminho "b" da task).
- Reativar colaborador desativado, que não existe hoje, e reaproveitar o e-mail de um acesso inativo.
- Distribuição de lucros, relatórios por sócio e histórico de capital. Aportes depois do inicial continuam sendo receitas comuns.
- Traduzir as mensagens de outras rotas (desativar colaborador, permissões, painel do admin e a mensagem genérica "Validation error" do `validate`). A exceção são as linhas que este plano já altera.
- `POST /api/contas` feito por membro com `accessAccounts`, um comportamento que já existe e não é afetado.
- Atualizar o dump `backend/config/schema-dev.sql`.

## Leitura de contexto

- `/AGENT.md`, da raiz. Ele descreve um sistema multi-prefeitura que não corresponde a este projeto, então só as regras transversais foram usadas: Drizzle em query nova, nada de `any`, erros claros, nomes de código em inglês e migrations só com confirmação.
- `/CLAUDE.md`, com o fluxo `/planejar` → aprovação → `/implementar` → `/finalizar`.
- `/frontend/AGENT.md` e `/backend/AGENT.md` não existem neste projeto.
- `.portal/tasks/ajustes-conta-colaborador-socios.md`.
- **Arquivos inspecionados no backend:**
  - rotas: `accountMembers.ts`, `auth.ts`, `users.ts`, `accounts.ts`, `partners.ts`, `analytics.ts` e `incomes.ts` (exclusão);
  - middlewares: `auth.ts`, `permissions.ts` e `validation.ts`;
  - serviços: `balanceService.ts`, `painelService.ts`, `companyAccountInput.ts` (com o teste), `incomeClassificationCatalog.ts` e `incomeClassificationDefaults.ts`;
  - utilitários: `familyVisibility.ts`, `requestInput.ts` e `date.ts`;
  - schemas: `users.ts`, `partners.ts`, `accounts.ts`, `memberPermissions.ts` e `incomes.ts`;
  - migrations: 0002, 0024 e 0028; o script `scripts/migrations.ts`.
- **Arquivos inspecionados no frontend:**
  - telas: `ContasTab.tsx`, `SociosTab.tsx` e `LoginPage.tsx`;
  - layout: `ConfigPanel.tsx` e `AppShell.tsx`;
  - serviços: `sociosService.ts`, `configService.ts`, `authService.ts`, `membrosService.ts`, `apiClient.ts`, `queryKeys.ts` e `permissoesService.ts`;
  - utilitários e tipos: `screenAccess.ts` (com o teste), `types/permissions.ts` e `types/config.ts`;
  - guias de primeiro acesso.
- **Diagnóstico na produção, só leitura, em 2026-10-02:**
  - nenhuma conta tem `aporte_inicial` preenchido;
  - há 3 sócios ativos, todos na conta 19 (PJ), somando 100%, e nenhum sem conta;
  - usuários: 1 admin, 1 titular e 1 membro, sem `tipo` nulo e sem documento nulo;
  - nenhum documento repetido;
  - 1 membro ativo em conta pessoal, sem `acesso_socios`;
  - o índice `usuarios_documento_unique_partial` existe;
  - o CPF de `ANALYTICS_ALLOWED_DOCUMENT` pertence ao usuário 1, que é admin.

## Impacto por área

### Frontend

- **`src/screens/config/ContasTab.tsx`:**
  - **`NovoMembroDialog`** (~l.126-130): a dica passa a dizer que, se a pessoa já tem conta própria com esse CPF, ela entra como colaborador (ou membro) pelo e-mail. O texto usa `termo.singular`.
  - **`ContaDialog`:**
    - **Remover:** `initialBalanceOf` (l.252), o estado `saldoInicial` (l.276 e 298), `aporte_inicial` no envio (l.331) e o campo "Saldo inicial" (l.516-519). "Data de abertura" fica sozinha na linha.
    - **Logo no topo:** com `isLoginCompany`, o `photoHeader` passa a abrir o formulário, antes do bloco da empresa, com o título "Logo da empresa" e o mesmo aviso "Toque no logo para enviar · PNG ou SVG, até 1 MB".
    - **Bloco "Acesso":** um divisor, o título "Acesso" em texto e depois e-mail, nova senha e o aviso.
    - **Seção "Sócios":** com `tipo === 'empresa'`, aparece depois do bloco da empresa e antes do "Acesso".
      - Ao editar, os sócios vêm de `useQuery(queryKeys.partners(conta.id))`. Na "Nova conta", a lista começa vazia.
      - Enquanto os sócios não carregaram, ou se o carregamento falhou, o envio **não** leva `socios`, para não apagar sócio nenhum. A seção mostra "Carregando sócios..." ou o erro.
      - Antes de enviar, valida com o helper do frontend e mostra o erro no `formError`.
    - **Alturas fixas** do corpo (l.399): ajustar para caber a seção.
  - **`ContasTab`, `saveMut.onSuccess`** (l.1105): além de `queryKeys.contas`, invalidar `['partners']`, `invalidateIncomeQueries(qc)` (o salvamento pode ter criado uma receita) e `['classificacoes-receita']` (a categoria "Aporte de capital" pode ter sido criada).
- **Novo `src/screens/config/AccountPartnersSection.tsx`:**
  - É um componente controlado. Recebe linhas, `onChange`, carregamento e erro.
  - **Cada linha:**
    - nome;
    - participação em %, com passo de 0,01;
    - capital, no `MoneyField`;
    - o checkbox "Lançar como receita";
    - o botão de remover, com `aria-label`.
  - **Linha já lançada:** o capital fica só leitura, mostrando o valor atual da receita, e no lugar do checkbox aparece "Lançado como receita em dd/mm/aaaa".
  - **Ações e totais:**
    - Botão "+ Adicionar sócio", no padrão de "+ Subcategoria".
    - Uma linha de total: "Participação: X% · Capital: R$ Y". Com algum sócio e soma diferente de 100%, ela aparece em vermelho com "A soma das participações precisa dar 100%".
  - **Lista vazia:** "Nenhum sócio cadastrado".
  - **Celular:** a linha quebra. O nome ocupa a largura toda, e os demais campos vêm na linha de baixo.
- **Novo `src/utils/accountPartners.ts`** (com teste em `src/utils/accountPartners.test.ts`):
  - tipo `PartnerRow`, com chave local, id, nome, percentual, capital, `launchAsIncome` e `launchedAt`;
  - `partnerRowFromApi`, `newPartnerRow` e `partnersTotals`, que soma o percentual em centésimos;
  - `validatePartnerRows`, com as mesmas regras e mensagens do servidor;
  - `buildPartnersPayload`.
- **`src/services/sociosService.ts` vira `src/services/partnersService.ts`:**
  - Fica só `fetchAccountPartners(accountId)` → `GET /partners?conta_id=`.
  - Os tipos são `AccountPartner` (resposta) e `AccountPartnerSaveValue` (envio).
  - Saem `saveSocio`, `deleteSocio` e o uso de `getActiveAccountId`, porque o modal edita uma conta específica.
- **Serviços, tipos e utilitários:**
  - `src/services/configService.ts`: em `CompanyAccountSaveValues`, sai `aporte_inicial` e entra `socios?: AccountPartnerSaveValue[]`.
  - `src/types/config.ts`: sai `aporte_inicial` de `Conta`.
  - `src/services/queryKeys.ts`: `socios: ['socios']` vira `partners: (accountId: number) => ['partners', accountId] as const`.
- **`src/screens/public/LoginPage.tsx`:**
  - O rótulo do login passa a ser "CPF, CNPJ ou e-mail" (l.272).
  - O campo "Saldo inicial" sai do cadastro PJ (l.329-331), e `parseInitialBalance` sai do import e do envio (l.12 e 141).
- **Cadastro pelo site:**
  - `src/services/authService.ts`: sai `aporteInicial` (l.61 e 76).
  - `src/utils/companyAccount.ts` e o teste: sai `parseInitialBalance`.
- **Saída da tela "Sócios":**
  - Apagar `src/screens/config/SociosTab.tsx`.
  - `src/layout/ConfigPanel.tsx`:
    - saem o import (l.21), `'socios'` de `ConfigItemId` (l.29), o item do menu (l.48) e a renderização (l.178);
    - `canViewAnalytics` (l.65) passa a exigir `isAdmin` **e** o CPF.
  - `src/layout/AppShell.tsx`: sai `'socios'` de `CONFIG_ITEM_IDS` (l.217-220).
  - `src/utils/screenAccess.ts`: sai `socios` de `CONFIG_ITEM_FLAG` e de `COMPANY_ONLY_ITEMS`, com o comentário ajustado. O `screenAccess.test.ts` é ajustado (l.15, 54 e 65).
  - `src/services/permissoesService.ts`: sai `{ flag: 'accessPartners', label: 'Sócios' }` (l.47).
  - `src/types/permissions.ts`: sai `'accessPartners'` (l.6).
  - `src/context/FirstAccessGuideContext.tsx`: sai `socios: 1` (l.41).
  - `src/components/firstAccessGuideMessages.ts`: sai `sociosNovo` (l.53).
- **Estados:**
  - a seção de sócios tem carregamento, erro e vazio;
  - o erro do servidor continua aparecendo pelo `error` do modal;
  - o salvar desabilita enquanto o pedido está em andamento, como hoje.

### Backend

- **Novo `backend/src/services/loginDocument.ts`** (puro, testado):
  - `pickLoginByDocument(candidates)` → `{ kind: 'found', user } | { kind: 'ambiguous' } | { kind: 'none' }`.
  - Regras, em ordem:
    1. O acesso próprio vem primeiro: `type` diferente de `'membro'` (nulo conta como próprio). Escolhe o de menor id, e o índice garante que há no máximo um.
    2. Sem acesso próprio, com um único colaborador, ele é o escolhido.
    3. Com vários colaboradores e só um ativo, o ativo é o escolhido.
    4. Nos outros casos, o resultado é `ambiguous`.
- **Novo `backend/src/services/documentConflicts.ts`** (Drizzle, aceita a transação como executor):
  - `findOwnLoginWithDocument(executor, document, exceptUserId?)`: diz se algum acesso próprio (`tipo` nulo ou diferente de `'membro'`) já usa o documento.
  - `findAccountAccessWithDocument(executor, accountId, document, exceptUserId?)`: diz se o documento já é do titular da conta ou de um membro com vínculo **ativo** nela.
- **Novo `backend/src/services/memberInput.ts`** (puro, testado, no padrão de `companyAccountInput.ts`, com `RequestInputError`):
  - `readNewMemberInput(body)`:
    - lê nome e e-mail (em minúsculas e válido), senha com pelo menos 8 caracteres, documento só com dígitos ou `null`, sobrenome, telefone e nascimento;
    - mensagens: "Informe o nome", "Informe um e-mail válido" e "A senha precisa ter pelo menos 8 caracteres".
  - `readMemberUpdateInput(body)`:
    - o nome é obrigatório;
    - os demais campos são opcionais, e a ausência mantém o valor atual, como hoje;
    - a nova senha, se vier, precisa ter pelo menos 8 caracteres;
    - o e-mail, se vier, precisa ser válido.
- **`backend/src/routes/accountMembers.ts`:**
  - **`POST /`:**
    - saem a cadeia do express-validator e o `validate`, e entra `readNewMemberInput`;
    - conta: "Conta não encontrada";
    - e-mail global: "Este e-mail já está cadastrado";
    - documento: passa por `checkMemberDocument`, que responde "Informe um CPF válido" na PJ ou "CPF/CNPJ inválido" na PF, e depois por `findAccountAccessWithDocument` → "Esta pessoa já tem acesso a esta conta";
    - o caso 500 vai por `sendRequestError`, com "Não foi possível salvar agora. Tente de novo em instantes.".
  - **`PUT /:id`:**
    - sai a validação do express-validator, e entra `readMemberUpdateInput`;
    - mensagens:
      - "Conta não encontrada";
      - "Pessoa não encontrada nesta conta";
      - "Este e-mail já está em uso";
      - documento: `checkMemberDocument` mais `findAccountAccessWithDocument(..., memberUserId)` → "Esta pessoa já tem acesso a esta conta";
      - "A nova senha precisa ter pelo menos 8 caracteres".
    - Continua aceitando a chamada que só troca a foto.
  - **`PERMISSION_FLAGS`:** sai `'accessPartners'`.
- **`backend/src/routes/auth.ts`:**
  - **Login** (~l.91-101): sem `@`, busca os usuários com o documento (`orderBy id`, `limit 10`) e aplica `pickLoginByDocument`.
    - `none` → 401 "CPF, CNPJ ou e-mail não cadastrado", como hoje.
    - `ambiguous` → 400 "Este CPF tem mais de um acesso. Entre com o e-mail.".
    - `found` → segue o fluxo atual. O caminho por e-mail não muda.
  - **Cadastro** (~l.188-197): a checagem `or(email, documento)` dá lugar a duas.
    - E-mail global: "Este e-mail já está cadastrado".
    - `findOwnLoginWithDocument`: "Este CPF/CNPJ já está cadastrado".
- **`backend/src/routes/users.ts`:**
  - **`PUT /me`** (~l.105-128):
    - o `current` passa a trazer `type`;
    - membro com vínculo ativo → `findAccountAccessWithDocument(conta do vínculo, doc, próprio id)`;
    - titular ou admin → `findOwnLoginWithDocument(doc, próprio id)`;
    - mensagens: "CPF/CNPJ inválido" e "Este CPF/CNPJ já está em uso".
  - **`POST /`, do admin** (~l.350-355):
    - com `tipo` diferente de `'membro'`, usa `findOwnLoginWithDocument` → "Este CPF/CNPJ já está cadastrado";
    - com `'membro'`, que não tem conta de contexto, mantém a checagem global atual.
- **`backend/src/routes/accounts.ts`:**
  - **`assertLoginIdentityFree`:** o CNPJ do login passa a ser conferido por `findOwnLoginWithDocument(executor, cnpj, userId)`, mantendo a mensagem.
  - **`GET`:** sai `aporte_inicial` dos dois `SELECT` (l.80 e 90).
  - **`POST`** (Nova conta PJ):
    - lê `readAccountPartnersInput(req.body.socios)` antes de qualquer gravação;
    - grava a conta, as categorias padrão (`ensureDefaultCategories` e `ensureDefaultIncomeClassifications`, com o executor da transação) e `saveAccountPartners` numa única `db.transaction`.
  - **`PUT`, conta empresa:** dentro da transação que já existe, depois de atualizar a conta: `if (partners) await saveAccountPartners(tx, { ownerId: userId, accountId, openingDate: company.openingDate, partners })`.
  - **`PUT`, conta pessoal:** ignora `socios`.
- **Novo `backend/src/services/accountPartnersInput.ts`** (puro, testado):
  - `readAccountPartnersInput(value)` devolve `undefined` quando o campo não veio, e aí os sócios não mudam.
  - Também pode devolver uma lista de `{ id?, name, percentage, initialCapital, launchAsIncome }`.
  - Lê os campos do pedido `id`, `nome`, `percentual`, `capital_inicial` e `lancar_como_receita`.
  - As regras estão em "Validações necessárias".
- **Novo `backend/src/services/accountPartners.ts`** (Drizzle, recebe a transação):
  - **`saveAccountPartners(tx, { ownerId, accountId, openingDate, partners })`:**
    1. Carrega os sócios ativos de (`ownerId`, `accountId`).
    2. Todo `id` enviado precisa estar entre eles. Se não estiver: "Sócio não encontrado nesta conta" (400).
    3. **Sócio existente:** atualiza nome e percentual. O capital só é atualizado se ainda não foi lançado (`receita_capital_id` nulo). No sócio já lançado, o capital e `lancar_como_receita` enviados são ignorados.
    4. **Sócio novo:** é inserido com `usuario_id = ownerId` e `conta_id = accountId`.
    5. **Lançamento:** com `launchAsIncome`, sem lançamento anterior e capital maior que zero, chama `launchCapitalIncome` e grava `receita_capital_id`.
    6. **Removidos:** os sócios ativos que não vieram na lista ficam com `ativo = false`. A receita deles continua.
  - **`launchCapitalIncome`** (interna) cria a receita com:
    - `usuario_id = ownerId` e `conta_id = accountId`;
    - descrição "Capital inicial — {nome}";
    - o valor do capital;
    - `data_recebimento` = `openingDate ?? getTodayIsoInTimezone()` (`utils/date.ts`), com `mes` e `ano` tirados da data;
    - `status 'ativa'` (recebida);
    - a classificação "Aporte de capital".
  - **`ensureCapitalIncomeClassification(tx, ownerId)`** (interna):
    - faz um `INSERT ... ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING` só dessa categoria (tipo `'empresa'`), com a mesma cláusula de `ensureDefaultIncomeClassifications`, sem recriar outras categorias padrão;
    - em seguida faz o `SELECT` do id **com o executor da transação**. `findDefaultClassificationId` usa `db` e não enxerga o que a transação ainda não confirmou.
  - **`listAccountPartners(ownerId, accountId)`:**
    - lista os sócios ativos com `LEFT JOIN receitas` pelo `receita_capital_id`;
    - devolve `{ id, nome, percentual, capital_inicial: valor da receita ?? capital do sócio, capital_lancado, capital_lancado_em: data da receita ?? null }`, ordenado por nome.
- **`backend/src/routes/partners.ts`:**
  - Saem `POST`, `PUT` e `DELETE`.
  - O `GET /` é reescrito em Drizzle:
    - `conta_id` é obrigatório; sem ele, "Informe a conta" (400);
    - a conta precisa ser do solicitante; senão, "Conta não encontrada" (404);
    - responde com `listAccountPartners`.
  - Sai o parâmetro `incluir_inativos`.
- **`backend/src/server.ts`** (l.131-132):
  - `/api/partners` passa a usar `authenticate, requireActivePlan, requireTitular`;
  - sai o atalho `/api/socios`.
- **`backend/src/routes/analytics.ts`:** `requireAnalyticsAccess` lê `documento` e `tipo` em Drizzle e só libera com `tipo === 'admin'` **e** o CPF de `ANALYTICS_ALLOWED_DOCUMENT`. Um comentário explica o motivo: o CPF pode repetir em acesso de colaborador.
- **Saldo de abertura:**
  - `backend/src/services/balanceService.ts`: sai `fetchAporteInicial`. `calculatePreviousBalance` passa a ser receitas − despesas anteriores, e os comentários explicam que o capital só entra como receita.
  - `backend/src/services/painelService.ts`: `calcularSaldoAnterior` (l.251-270) perde a consulta do aporte. Se o import de `accounts` ficar sem uso, ele sai.
- **`backend/src/services/companyAccountInput.ts`:**
  - Saem `MAX_INITIAL_BALANCE`, `initialBalance`, `initialBalanceSent`, `readInitialBalance` e `initialContribution` (no `Pick` e em `companyAccountColumns`).
  - O import de `roundCents` sai se ficar sem uso, e o comentário do cabeçalho é ajustado.
  - `aporte_inicial` enviado por cliente antigo passa a ser ignorado.
- **`backend/src/services/incomeClassificationDefaults.ts`:**
  - entra `{ nome: 'Aporte de capital', subcategorias: [] }` na lista de PJ, antes de "Outros";
  - entra a constante exportada `CAPITAL_INCOME_CLASSIFICATION_NAME`, usada por `accountPartners.ts`.
- **Permissões:** como `PermissionFlag` (`middleware/permissions.ts`) vem do schema, ao tirar `accessPartners` do schema a checagem de tipos aponta todo uso que restou.

### Banco de dados

Atenção: as migrations não devem ser executadas sem confirmação explícita do usuário, porque o ambiente atual pode estar apontando para a produção.

A ferramenta (`backend/scripts/migrations.ts`) roda cada migration em `BEGIN`/`COMMIT`. As tabelas são pequenas, então dá para usar `CREATE INDEX` normal, sem `CONCURRENTLY`.

- **`backend/drizzle/0059_documento_unico_acesso_proprio.sql`:**
  - **SQL:** `CREATE UNIQUE INDEX IF NOT EXISTS usuarios_documento_acesso_proprio_unique ON usuarios(documento) WHERE documento IS NOT NULL AND (tipo IS NULL OR tipo <> 'membro');` seguido de `DROP INDEX IF EXISTS usuarios_documento_unique_partial;`.
  - **Efeito:** só afrouxa a regra. Na produção, entra **antes** do merge e do deploy. Sem ela, o código novo falha ao criar colaborador com CPF repetido.
- **`backend/drizzle/0060_socios_capital_inicial.sql`:**
  - **SQL:** `ALTER TABLE socios ADD COLUMN IF NOT EXISTS capital_inicial DECIMAL(12,2) NOT NULL DEFAULT 0;` e `ALTER TABLE socios ADD COLUMN IF NOT EXISTS receita_capital_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL;`.
  - **Efeito:** só acrescenta colunas. O código antigo usa `SELECT *` e ignora as colunas novas. Na produção, entra **antes** do merge.
  - Os 3 sócios atuais ficam com capital 0 e sem lançamento.
- **`backend/drizzle/0061_remover_aporte_inicial_e_permissao_socios.sql`:**
  - **SQL:** `ALTER TABLE contas DROP COLUMN IF EXISTS aporte_inicial;` e `ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_socios;`.
  - O cabeçalho registra o diagnóstico: nenhuma conta com `aporte_inicial` e nenhum membro com `acesso_socios`.
  - Na produção, entra **só depois do deploy**, porque o código antigo lê as duas colunas: o `GET /api/contas` e o `select()` de `membro_permissoes`.
- **Schemas Drizzle:**
  - `partners.ts`: entram `initialCapital` (`decimal('capital_inicial', { precision: 12, scale: 2 }).notNull().default('0')`) e `capitalIncomeId` (`integer('receita_capital_id').references(() => incomes.id, { onDelete: 'set null' })`).
  - `accounts.ts`: sai `initialContribution`.
  - `memberPermissions.ts`: sai `accessPartners`.
- **Cabeçalho das migrations:** o mesmo padrão da 0058. Explica o motivo e a ORDEM (antes ou depois do deploy) e traz o aviso de não executar sem confirmação.

### Infra/Deploy

- Sem variável de ambiente nova e sem mudança no Render, além do deploy automático no merge para a `main`.
- **Ordem obrigatória na produção:**
  1. 0059;
  2. 0060;
  3. merge e deploy;
  4. 0061.
- **Modo automático:** o classificador bloqueia migration na produção. O usuário sai do modo automático e aprova, ou roda o SQL.
- O Cron Job continua desativado e não é afetado.

## Arquivos provavelmente afetados

- **Banco:**
  - `backend/drizzle/0059_documento_unico_acesso_proprio.sql` (novo)
  - `backend/drizzle/0060_socios_capital_inicial.sql` (novo)
  - `backend/drizzle/0061_remover_aporte_inicial_e_permissao_socios.sql` (novo)
  - `backend/src/db/schema/partners.ts`, `accounts.ts` e `memberPermissions.ts`
- **Backend — rotas:**
  - `backend/src/routes/accountMembers.ts`, `auth.ts`, `users.ts`, `accounts.ts`, `partners.ts` e `analytics.ts`
  - `backend/src/server.ts`
- **Backend — serviços novos:**
  - `loginDocument.ts` (+ teste)
  - `documentConflicts.ts`
  - `memberInput.ts` (+ teste)
  - `accountPartnersInput.ts` (+ teste)
  - `accountPartners.ts`
- **Backend — serviços alterados:**
  - `balanceService.ts`
  - `painelService.ts`
  - `companyAccountInput.ts` (+ teste)
  - `incomeClassificationDefaults.ts` (+ teste)
- **Frontend — novos:**
  - `src/screens/config/AccountPartnersSection.tsx`
  - `src/utils/accountPartners.ts` (+ teste)
  - `src/services/partnersService.ts`, que substitui `sociosService.ts`
- **Frontend — alterados:**
  - telas: `src/screens/config/ContasTab.tsx` e `src/screens/public/LoginPage.tsx`;
  - serviços: `src/services/configService.ts`, `authService.ts`, `queryKeys.ts` e `permissoesService.ts`;
  - tipos: `src/types/config.ts` e `permissions.ts`;
  - utilitários: `src/utils/companyAccount.ts` (+ teste) e `screenAccess.ts` (+ teste);
  - layout: `src/layout/ConfigPanel.tsx` e `AppShell.tsx`;
  - guias de primeiro acesso: `src/context/FirstAccessGuideContext.tsx` e `src/components/firstAccessGuideMessages.ts`.
- **Frontend — apagado:** `src/screens/config/SociosTab.tsx`.

## Estratégia de implementação

1. **Branch:** `git checkout main && git pull`, depois `git checkout -b feat/R/conta-socios-colaborador`. `.portal/` e `GLOSSARIO.md` continuam fora do trabalho, sem rastreamento.
2. **Migrations (arquivos):**
   - Escrever a 0059, a 0060 e a 0061.
   - Pedir confirmação e aplicar no banco local, **uma por vez**, a 0059 e depois a 0060.
   - A 0061 local só entra no passo 7, depois que o código parar de usar as colunas.
3. **Remover o antigo:**
   - **3a. "Saldo inicial":**
     - **Backend:** `companyAccountInput` e o teste, `GET /api/contas`, `balanceService`, `painelService` e o schema `accounts`.
     - **Frontend:** `types/config`, `configService`, o estado e o campo do `ContaDialog`, o campo e o envio do `LoginPage`, `authService` e `parseInitialBalance` com o teste.
   - **3b. Tela "Sócios":**
     - **Frontend:** apagar `SociosTab.tsx` e tirar as referências em `ConfigPanel`, `AppShell`, `screenAccess` (com o teste), `permissoesService`, `types/permissions` e os guias.
     - **Backend:** `PERMISSION_FLAGS`, o schema `memberPermissions`, as rotas `POST`/`PUT`/`DELETE` de `partners.ts` e o atalho `/api/socios`.
   - Rodar a checagem de tipos dos dois lados para confirmar que não sobrou referência.
4. **Backend do item 1:**
   - `loginDocument.ts` e o teste, `documentConflicts.ts`, `memberInput.ts` e o teste;
   - rotas `accountMembers`, `auth` (login e cadastro), `users` (`me` e admin) e `accounts` (`assertLoginIdentityFree`);
   - trava da aba Acessos em `analytics.ts`.
5. **Backend dos sócios e do capital:**
   - schema `partners`, categoria "Aporte de capital" (defaults e teste);
   - `accountPartnersInput.ts` e o teste, `accountPartners.ts`;
   - `POST`/`PUT /api/contas` numa única transação, `GET /api/partners` e o mount `requireTitular`.
6. **Frontend novo:**
   - logo no topo e bloco "Acesso";
   - `partnersService`, `queryKeys.partners`, `utils/accountPartners` e o teste, `AccountPartnersSection` e a integração no `ContaDialog`, com envio e invalidações;
   - rótulo do login, dica do "Novo colaborador" e `canViewAnalytics` só para admin.
7. **Validação:**
   - testes, checagem de tipos e builds (ver "Comandos");
   - aplicar a 0061 no banco local, com confirmação;
   - roteiro local e teste de renderização (ver "Testes").
8. **Fechamento:** resumo curto e a pergunta sobre o envio para a produção. A produção fica com o `/finalizar`:
   1. 0059 e 0060 na produção, com confirmação;
   2. commit, push e merge;
   3. deploy;
   4. 0061 na produção, com confirmação.

## Regras de negócio identificadas

- **CPF/CNPJ e login:**
  - O documento é único entre os acessos próprios (`tipo` titular ou admin, ou nulo) e pode repetir em acesso `membro`.
  - O e-mail continua único em todo o sistema.
  - Na mesma conta, não dá para cadastrar ou editar um colaborador (ou membro) com o CPF do titular ou de um colaborador ativo dessa conta.
  - O login por CPF segue a ordem da decisão 1. O login por e-mail não muda.
  - Cadastro pelo site, "Meus dados" de titular ou admin, cadastro feito pelo admin (tipo titular ou admin) e CNPJ da PJ que é o login só recusam documento de outro acesso próprio. O "Meus dados" de membro segue a regra da conta do vínculo.
- **Aba "Acessos":** só para admin com o CPF liberado.
- **Sócios:**
  - Só em conta PJ, no modal da conta, editados só pelo titular e gravados no mesmo "Salvar" da conta.
  - Excluir um sócio é desativá-lo.
  - Com pelo menos um sócio, a soma das participações dos sócios ativos precisa dar exatamente 100,00%.
- **Capital:**
  - É opcional, com padrão 0.
  - Vira receita uma vez só, se o checkbox estiver marcado e o capital for maior que zero.
  - Depois do lançamento, o capital e o checkbox travam, e o modal mostra o valor atual da receita.
  - Se a receita for apagada, o capital destrava.
  - Excluir o sócio mantém a receita.
- **Saldo:** não existe mais saldo de abertura. O saldo é receitas − despesas, em Movimentações (`/api/meses`) e no Painel.

## Regras multi-tenant e segurança

- **Isolamento:** o projeto não é multi-tenant. O isolamento é por usuário e por conta.
- **Item 1:**
  - **Logins separados:** o colaborador com CPF repetido é outro usuário, com vínculo único em `conta_membros` (o `usuario_id` é UNIQUE). As permissões e a visibilidade dele continuam presas à conta do vínculo e não vazam para a conta própria da pessoa, nem o contrário.
  - **Login sem ambiguidade:** a escolha do login por CPF é determinística e nunca entra num acesso escolhido ao acaso.
  - **Brecha do analytics:** sem a trava por tipo admin, o item 1 permitiria que um colaborador ganhasse a aba Acessos. A trava vale no servidor, que é a fonte de verdade, e no menu.
  - **Sem vazar CPF de outras contas:** o cadastro de colaborador deixa de revelar que o CPF existe em outra conta. Só avisa quando a pessoa já tem acesso **à mesma conta**, que é um dado do próprio gestor.
- **Sócios:**
  - A gravação só acontece por `POST`/`PUT /api/contas`. O `PUT` já confere que a conta é do solicitante, e o `POST` cria a conta no nome dele.
  - Os `id` de sócio enviados são conferidos contra conta e dono, para impedir que se altere sócio de outra conta.
  - A leitura (`GET /api/partners`) exige titular ou admin e uma conta do próprio solicitante.
- **Erros:** respostas em português, sem dado de outro usuário. Os erros 500 só registram contexto no log.

## Validações necessárias

- **`readNewMemberInput` e `readMemberUpdateInput`:** as regras e mensagens estão em "Impacto por área → Backend".
  - O documento é limpo para só dígitos.
  - A validade do documento depende do tipo da conta: só CPF na PJ, CPF ou CNPJ na PF.
- **`readAccountPartnersInput(value)`:**
  - **Formato:**
    - Ausente → `undefined`.
    - Precisa ser um array: "Sócios inválidos".
    - No máximo 50 itens: "Até 50 sócios por conta".
  - **Item:**
    - Precisa ser um objeto. O `id`, se vier, precisa ser um inteiro positivo: "Sócio inválido".
    - Ids repetidos: "Sócio repetido na lista".
  - **`nome`:** texto sem espaços nas pontas, obrigatório ("Informe o nome do sócio") e com até 100 caracteres ("Nome do sócio: até 100 caracteres").
  - **`percentual`:** número finito, maior que 0 e até 100, arredondado em 2 casas. Senão: "Participação de {nome}: de 0,01% a 100%".
  - **`capital_inicial`:** se vier, número finito, de 0 até `MAX_AMOUNT` (`utils/requestInput.ts`, 99.999.999,99, que cabe em `receitas.valor`), arredondado em 2 casas. Senão: "Capital de {nome} inválido". Ausente vale 0.
  - **`lancar_como_receita`:** boolean opcional. Marcado com capital 0: "Informe o capital de {nome} para lançar como receita".
  - **Soma:** com pelo menos um item, a soma em centésimos precisa dar 10000. Senão: "A soma das participações precisa dar 100%".
- **No serviço:** um id que não pertence aos sócios ativos da conta e do dono → "Sócio não encontrado nesta conta".
- **`GET /api/partners`:**
  - `conta_id` precisa ser um inteiro positivo: "Informe a conta".
  - A conta precisa ser do solicitante: "Conta não encontrada" (404).
- **No frontend:** `validatePartnerRows` aplica as mesmas regras antes do envio, mas a validação que vale é a do servidor.

## Testes necessários

### Frontend

- **`src/utils/accountPartners.test.ts`:**
  - soma em centésimos (33,33 + 33,33 + 33,34 = 100);
  - mensagens de `validatePartnerRows`;
  - `buildPartnersPayload` com sócio novo, existente e já lançado;
  - `partnerRowFromApi`, com o capital vindo da receita e `launchedAt`.
- **`src/utils/screenAccess.test.ts`:** sem `socios`.
- **`src/utils/companyAccount.test.ts`:** sem `parseInitialBalance`.
- **Teste de renderização (jsdom, no scratchpad, fora do commit):**
  - no "Editar conta" da PJ que é o login, o bloco "Logo da empresa" vem antes de "Razão social";
  - não existe "Saldo inicial";
  - a seção "Sócios" mostra as linhas da consulta simulada, adiciona uma linha, avisa quando a soma não dá 100% e mostra "Lançado como receita em" na linha lançada;
  - no `LoginPage`, o cadastro PJ não tem "Saldo inicial" e o rótulo do login é "CPF, CNPJ ou e-mail";
  - o `ConfigPanel` não tem "Sócios", e "Acessos" fica oculto para quem não é admin, mesmo com o CPF liberado.

### Backend

- **`loginDocument.test.ts`:**
  - o acesso próprio vence os membros, inclusive quando está bloqueado (o bloqueio aparece depois da senha);
  - `tipo` nulo conta como próprio;
  - um membro sozinho é escolhido;
  - com dois membros e um ativo, o ativo é escolhido;
  - com dois ativos, o resultado é `ambiguous`;
  - com nenhum, `none`.
- **`memberInput.test.ts`:**
  - nome vazio, e-mail inválido, senha curta e documento só com dígitos;
  - campos opcionais;
  - na atualização: nova senha curta e e-mail inválido.
- **`accountPartnersInput.test.ts`:**
  - ausente → `undefined`, e lista vazia é aceita;
  - nome vazio ou longo;
  - percentual fora da faixa;
  - capital negativo, acima do máximo e com arredondamento;
  - ids repetidos;
  - soma 99,99 e 100,01 são recusadas; 33,33 + 33,33 + 33,34 é aceita;
  - lançar com capital 0 é recusado.
- **`companyAccountInput.test.ts`:** sem os casos de aporte, e `aporte_inicial` enviado é ignorado.
- **`incomeClassificationDefaults.test.ts`:** a lista de PJ tem "Aporte de capital".

### E2E

Roteiro local, fora do commit, como `roteiro_conta_socios.mts` no scratchpad:
- Usa o backend local em **outra porta** (ex.: 3013) com `.env.dev`, e aborta se o banco não for o local.
- Os usuários de teste ficam em `@roteiro-paridade.test` ou num domínio equivalente, com limpeza no fim.

**Colaborador e login:**
1. Cadastrar B (PF, CPF X) e A (PJ, CNPJ).
2. A cria o colaborador C1 com o CPF X → 201. Um segundo colaborador com o CPF X → 400 "Esta pessoa já tem acesso a esta conta". Um e-mail repetido → 400 "Este e-mail já está cadastrado".
3. Login com o CPF X → B. Login com o e-mail de C1 → C1. O `GET /api/contas` de C1 traz só a conta de A.
4. Membro com o CPF Y criado em A. Depois, cadastro D (PF) pelo site com o CPF Y → 201, e o login com o CPF Y → D.
5. O CPF Z em membros de duas contas, sem acesso próprio → o login com o CPF Z responde 400 "Este CPF tem mais de um acesso. Entre com o e-mail.".
6. A cria um colaborador com o CPF de `ANALYTICS_ALLOWED_DOCUMENT`. Ele entra pelo e-mail, e o `GET` de uma rota de `/api/analytics` → 403.

**Sócios e capital:**
7. `PUT /api/contas/:A` com `data_abertura` e os sócios Ana (60%, R$ 6.000, lançar) e Bia (40%, R$ 4.000) → 200.
   - A receita "Capital inicial — Ana" é criada com valor 6000, a data de abertura, `status 'ativa'`, a categoria "Aporte de capital" e `conta_id` A.
   - O `GET /api/partners?conta_id=A` mostra Ana lançada e Bia não.
8. Mandar de novo com o capital de Ana em 9999 e Bia com lançar.
   - O capital de Ana continua 6000 e a receita dela não muda.
   - A receita de Bia é criada.
9. Apagar a receita de Ana (`DELETE /api/incomes/:id`) → no `GET`, Ana aparece destravada.
10. Soma 90% → 400 "A soma das participações precisa dar 100%". Lista vazia → 200, os sócios são desativados e a receita de Bia continua.
11. **Nova conta:**
    - `POST /api/contas` com sócios e lançamento → conta, sócios e receita criados.
    - Com sócios inválidos → 400 e **nenhuma** conta criada, porque a transação é desfeita.
12. **Saldo:** o saldo de `/api/meses` (anterior e final) é receitas − despesas, sem aporte, e inclui a receita de capital no mês dela.
13. **Rotas de sócio:**
    - C1 em `GET /api/partners?conta_id=A` → 403;
    - `POST /api/partners` → 404;
    - `GET /api/socios` → 404.
14. **Cadastro PJ sem aporte:** → 201. O `aporte_inicial` enviado é ignorado e o `GET /api/contas` não traz `aporte_inicial`.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx vite build
npm --prefix backend test
npm --prefix backend run build

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0059 --banco local
npm --prefix backend run migrations:aplicar -- 0060 --banco local
npm --prefix backend run migrations:aplicar -- 0061 --banco local

# Produção — só no /finalizar, cada uma com confirmação explícita:
npm --prefix backend run migrations:status -- --banco producao
npm --prefix backend run migrations:aplicar -- 0059 --banco producao --confirmo   # antes do merge
npm --prefix backend run migrations:aplicar -- 0060 --banco producao --confirmo   # antes do merge
npm --prefix backend run migrations:aplicar -- 0061 --banco producao --confirmo   # depois do deploy
```

## Riscos e pontos de atenção

- **Ordem das migrations na produção:**
  - Sem a 0059 antes do deploy, criar colaborador com CPF repetido dá erro (violação do índice antigo).
  - A 0061 antes do deploy quebra o código antigo, no `GET /api/contas` e nas permissões dos membros.
- **Brecha do analytics:** se o item 1 for para a produção sem a trava por tipo admin, um gestor consegue dar a aba Acessos a um colaborador. A trava faz parte do mesmo deploy.
- **Titular que troca o próprio CPF:** se ele passar a usar o CPF de um colaborador, o login por CPF desse colaborador cai no titular, e o colaborador passa a entrar pelo e-mail. É um caso raro.
- **Checagem de "mesma conta" no código:** ela não cabe no índice, porque cruza tabelas. Dois cadastros simultâneos do mesmo CPF na mesma conta passariam, o que é improvável com um gestor só.
- **Receita de capital:** entra nos totais de receita do Painel e dos relatórios. A categoria "Aporte de capital" ajuda a separá-la de vendas e serviços.
- **Valor após correção:** depois do lançamento, o capital guardado no sócio pode ficar diferente da receita corrigida. Por isso o modal mostra o valor da receita.
- **Fim do saldo de abertura:** nenhuma conta da produção usa hoje, então nenhum número muda.
- **Envio parcial de sócios:** o modal não pode mandar `socios` antes de carregar a lista, porque isso desativaria os sócios existentes. A regra no `ContaDialog` evita isso, e o roteiro e o teste de renderização conferem.
- **`POST /api/contas` transacional:** a conta, as categorias padrão, os sócios e as receitas passam a ser gravados juntos. Um erro desfaz tudo.
- **Layout:** o modal fica maior e nunca foi visto no navegador. Vale conferir depois do deploy, como nos modais anteriores.
- **Links antigos:** `?config=socios` passa a cair no item padrão das Configurações.

## Perguntas em aberto

Nenhuma pergunta impede a implementação. Os padrões de "Decisões aplicadas" foram definidos no planejamento e podem ser ajustados: categoria "Aporte de capital", data e descrição da receita, valor atual da receita no modal e receita apagada destravando o capital.

## Critérios de aceite do plano

- **Colaborador e login:**
  - Uma pessoa com conta própria pode ser cadastrada como colaboradora de outra conta, com o mesmo CPF, e os dois logins funcionam.
  - O login por CPF entra na conta própria, e o colaborador entra pelo e-mail.
  - Cada login vê só o que lhe cabe.
- **Recusas:**
  - O mesmo CPF duas vezes na mesma conta é recusado com mensagem em português.
  - E-mail repetido é recusado com mensagem em português.
  - Um CPF só com acessos de colaborador, e mais de um, recebe no login "Este CPF tem mais de um acesso. Entre com o e-mail.".
- **Cadastro com CPF de colaborador:** o cadastro pelo site com um CPF que só existe como colaborador funciona.
- **Aba Acessos:** um colaborador com o CPF do admin não acessa a aba. O servidor responde 403 e o menu fica oculto.
- **Login:** o rótulo é "CPF, CNPJ ou e-mail". O "Novo colaborador" mostra a dica do e-mail.
- **Logo:** no "Editar conta" da PJ que é o login, o logo aparece no topo e o envio continua funcionando.
- **Sócios no modal:**
  - O modal da conta PJ ("Nova conta" e "Editar conta") permite incluir, editar e excluir sócios com participação e capital.
  - A conta só salva com 100% quando há sócio.
  - O checkbox lança o capital como receita uma vez, na categoria "Aporte de capital", e depois trava.
  - Excluir um sócio mantém a receita.
  - Os sócios atuais aparecem no modal.
- **Fim do "Saldo inicial":**
  - O campo não existe mais no modal nem no cadastro.
  - O saldo é receitas − despesas.
  - Não sobra código de `aporte_inicial`.
- **Tela "Sócios":** a tela, o item do menu e a permissão "Sócios" não existem mais. `/api/partners` só lê e só para o titular.
- **Validação técnica:**
  - Testes, checagem de tipos e builds passam, com o roteiro local completo.
  - As migrations são aplicadas com confirmação, na ordem descrita.

## Observações para a skill implementar

- **Fonte de contexto:** usar este plano como fonte principal. Seguir `/CLAUDE.md` e as regras transversais do `/AGENT.md`.
- **Remover antes de criar:** o passo 3 vem antes dos passos 4 a 6, sem deixar código morto nem código antigo convivendo com o novo.
- **Execução enxuta:** sem relatórios longos, listas de arquivos ou diffs no chat. Só status curto quando precisar.
- **Migrations:**
  - Pedir confirmação explícita antes de **cada** migration, mesmo no banco local.
  - Nunca aplicar na produção dentro do `/implementar`. Isso fica no `/finalizar`, na ordem descrita.
- **Backend local para o roteiro:**
  - Subir em **outra porta**. O `TaskStop` deixa processos node filhos vivos, então avisar o usuário para encerrar o que sobrar.
  - Confirmar que o `DATABASE_URL` carregado é o local antes de gravar.
- **Arquivos fora do escopo:** não mexer no `.env` e não incluir `.portal/` nem `GLOSSARIO.md` no commit.
- **Nomes de código em inglês.** Campos do pedido e da resposta da conta e dos sócios seguem o padrão em português que já existe no pedido da conta (`socios`, `nome`, `percentual`, `capital_inicial`, `lancar_como_receita`, `capital_lancado`, `capital_lancado_em`).
- **Arquivos puros, sem importar `db/client`:** `loginDocument.ts`, `memberInput.ts` e `accountPartnersInput.ts`, para os testes não carregarem o `.env`. Os acessos ao banco ficam em `documentConflicts.ts` e `accountPartners.ts`.
- **Fechamento:** terminar com o resumo curto e a pergunta "A implementação está pronta localmente. Deseja enviar para produção?".

## Notas da implementação (2026-10-03)

- **Nome da categoria:** a categoria do capital ficou "Aportes", e não "Aporte de capital". O projeto tem a regra, conferida em `incomeClassificationDefaults.test.ts`, de uma palavra por categoria raiz de receita. Falta a confirmação do usuário; se ele preferir o nome do plano, a regra e o teste precisam mudar junto.
- **Aba Acessos:** a regra do frontend saiu do `ConfigPanel` para `isAnalyticsViewer` em `src/utils/screenAccess.ts`, que agora tem teste.
- **Leitores puros:** os leitores sem acesso ao banco ficaram em `loginDocument.ts`, `memberInput.ts` e `accountPartnersInput.ts`, para que os testes não carreguem o `.env`. As consultas ao banco ficaram em `documentConflicts.ts` e `accountPartners.ts`.
- **Validação local ainda não feita:** o roteiro de API (`roteiro_socios.mjs`) e o teste de renderização (`smoke_socios.mts`) estão prontos no scratchpad. Eles dependem de 0059, 0060 e 0061 no banco local, que esperam a confirmação do usuário.
