# Plano de Implementação: Colaborador usa o catálogo da empresa

## Origem

- Arquivo de especificação: nenhum `.md`. Tarefa B do alinhamento da PJ (fora do escopo de `.plans/conta-pj-campos.md`), analisada no código e alinhada na conversa de 2026-10-01, com as 4 decisões abaixo.
- Data do planejamento: `2026-10-01`
- Classificação: `backend-only` (mais um possível ajuste de dados em produção, pela decisão 3)

## Resumo

Na conta empresa, o colaborador hoje não enxerga os cadastros da empresa:

- o `resolveAccountOwnerId` devolve o próprio colaborador quando a conta é empresa;
- as rotas de cadastro filtram pelo usuário logado.

Com isso:

- ele fica sem categorias de despesa, clientes, contratos, representantes, produtos, sócios e serviços;
- na receita que lança, a comissão, as horas do contrato e o estoque não acham os itens da empresa;
- o que ele cadastra fica invisível para o titular.

O plano faz o catálogo ser da empresa (o dono da conta), igual ao membro na PF.

## Decisões registradas

- **Do alinhamento:**
  - os lançamentos de cada colaborador continuam isolados;
  - os cartões continuam pessoais;
  - as permissões de ver e gerenciar cada cadastro não mudam;
  - a receita e a despesa de comissão continuam com o autor (quem lançou); só as buscas no catálogo usam o dono.
- **Decisão 1:** sócios e serviços entram também.
- **Decisão 2:** o que o colaborador cadastra grava no dono da conta e aparece para todos, inclusive o titular.
- **Decisão 3:** no `/implementar`, com confirmação na hora, conferir na produção só lendo se existem cadastros no nome de colaborador. Se existirem, passar para a empresa com um SQL aprovado antes de rodar. Se não, nada a fazer.
- **Decisão 4:** a despesa só aceita categoria do catálogo da conta, com a mesma mensagem da receita: "Categoria indisponível para esta conta".

## Escopo

### Dentro do escopo

- **`resolveAccountOwnerId`:**
  - vale para conta pessoal e conta empresa;
  - sem conta informada, usa a conta à qual o solicitante está vinculado como membro ativo.
- **Cadastros que passam a ler e gravar pelo dono da conta:**
  - clientes;
  - contratos, com serviços do contrato, anexos, faturamento, aditivo e receitas previstas geradas;
  - representantes, com a categoria "Comissão" criada junto;
  - produtos, com o estoque e a conta do catálogo público;
  - sócios;
  - serviços.
- **Categorias de despesa, Painel e Planejamento:** passam a valer para o colaborador sem mudar as rotas, porque já usam o `resolveAccountOwnerId`.
- **Lançamento de receita:** o `createIncome` recebe o dono do catálogo. A comissão (representante e categoria "Comissão"), o desconto de horas do contrato e a baixa de estoque usam esse dono.
- **Despesa (POST e PUT):** a categoria precisa ser do catálogo da conta.
- **Ajuste de dados:** conferência em produção e ajuste, se necessário, pela decisão 3.

### Fora do escopo

- Telas, porque o front já envia a conta ativa.
- Cartões, que continuam pessoais.
- Visibilidade dos lançamentos entre colaboradores.
- Permissões.
- Registrar "quem cadastrou" nos itens do catálogo (a PF também não tem).

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`. `/frontend/AGENT.md` e `/backend/AGENT.md` **não existem** neste projeto.
- **Regra do dono:**
  - `backend/src/utils/familyVisibility.ts` (`resolveAccountOwnerId`);
  - `backend/src/utils/accountAccess.ts` (`canWriteToAccount`);
  - `backend/src/utils/accountFilter.ts`;
  - `backend/src/middleware/permissions.ts` (`resolveMemberAccountId`, `requireCatalogAccess`).
- **Rotas de cadastro:**
  - `backend/src/routes/categories.ts`, `clients.ts`, `contracts.ts`, `contract-services.ts`, `contract-attachments.ts`;
  - `backend/src/routes/representatives.ts`, `partners.ts`, `services.ts`;
  - `backend/src/modules/catalogo/routes/produtos.ts` e `contas.ts`.
- **Lançamentos:**
  - `backend/src/services/incomeService.ts`, `commissionService.ts`, `estoque.ts`, `incomeClassificationCatalog.ts`;
  - `backend/src/routes/incomes.ts` e `expenses.ts`.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

**`resolveAccountOwnerId`**

- Sai a regra "só conta pessoal".
- Com conta nula, o dono é o titular da conta do vínculo ativo do solicitante. Sem vínculo, é o próprio solicitante.
- Continua devolvendo o próprio solicitante quando ele informa uma conta à qual não está vinculado.

**Rotas de cadastro**

- Cada rota resolve o dono uma vez: `resolveAccountOwnerId(req.user.id, conta informada ou null)`.
- Esse dono substitui o usuário logado em todas as consultas: listar, ler, criar, editar, excluir, gerar receitas previstas, faturar e aditivo.
- O filtro de conta (`accountWhere`) não muda.

**Produtos**

- A checagem da conta (`resolveContaDoUsuario`) usa o dono.
- O get-or-create da conta do catálogo também usa o dono.

**Receita**

- `createIncome(autor, donoDoCatalogo, input)`.
- `findCommissionRule`, `debitContractHours` e a movimentação de estoque usam o dono.
- `createCommissionExpense` busca o representante e a categoria "Comissão" no dono, e grava a despesa com o autor.
- A rota `/incomes` resolve o dono pela conta do lançamento.

**Despesa**

- Verificador novo `isExpenseCategoryAllowed`, no molde de `isClassificationAllowed`:
  - categoria nula é válida;
  - senão, a categoria tem de ser do dono da conta e uma destas: padrão do tipo da conta, exclusiva da conta, ou órfã em conta pessoal (a mesma regra do `GET /categories`).
- Entra no POST, pela conta do pedido, e no PUT, pela conta da despesa.
- Categorias inativas continuam aceitas, para não travar a edição de lançamentos antigos.

### Banco de dados

Sem mudança de schema.

Decisão 3 — conferência só de leitura dos cadastros com `usuario_id` de colaborador ativo de conta empresa, nas tabelas:

- clientes, contratos, representantes, sócios, serviços;
- `catalogo.produtos` e `catalogo.contas`;
- categorias com `conta_id`.

Se existir algum, o SQL de ajuste é mostrado e só roda com aprovação.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

**Regra do dono:**

- `backend/src/utils/familyVisibility.ts`.

**Rotas de cadastro:**

- `backend/src/routes/clients.ts`;
- `backend/src/routes/contracts.ts`;
- `backend/src/routes/contract-services.ts`;
- `backend/src/routes/contract-attachments.ts`;
- `backend/src/routes/representatives.ts`;
- `backend/src/routes/partners.ts`;
- `backend/src/routes/services.ts`;
- `backend/src/modules/catalogo/routes/produtos.ts` e `contas.ts`.

**Lançamentos:**

- `backend/src/services/incomeService.ts`;
- `backend/src/services/commissionService.ts`;
- `backend/src/routes/incomes.ts`;
- `backend/src/routes/expenses.ts`.

**Novo:**

- o verificador de categoria da despesa (por exemplo, `backend/src/services/expenseCategoryCatalog.ts`).

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `fix/R/colaborador-catalogo-empresa`. Não tocar no `GLOSSARIO.md`.

**Fase 1 — Remover**

2. A regra "só conta pessoal" do `resolveAccountOwnerId`.
3. O usuário logado como dono nas rotas de cadastro.
4. O usuário logado como dono nas buscas do lançamento de receita.

**Fase 2 — Aplicar**

5. O novo `resolveAccountOwnerId`.
6. As rotas de cadastro com o dono.
7. A receita com o dono do catálogo, mantendo o autor.
8. O `isExpenseCategoryAllowed` no POST e no PUT de despesa.

**Fase 3 — Validar**

9. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build`, `npm --prefix backend test`.
10. Roteiro da API com o backend local (`.env.dev`, numa porta livre). Personagens: um titular PJ (T), um colaborador dele (C), uma PF (P) com um membro (M). Cenários:
    - C vê os cadastros de T: categorias de despesa, clientes, contratos, representantes, produtos, sócios e serviços.
    - C cria um cliente, e T vê.
    - Receita de C com os itens de T:
      - a comissão gera a despesa de comissão;
      - as horas do contrato baixam;
      - o estoque baixa.
    - Despesa de C com categoria de T funciona; com categoria de P, responde 400.
    - Isolamento:
      - M continua vendo as categorias de P;
      - M não vê nada de T;
      - um usuário sem vínculo vê só o que é dele;
      - os lançamentos de C continuam só dele.
11. Limpar os dados de teste e encerrar o backend pela árvore de processos.
12. Decisão 3: conferência em produção, só leitura e com confirmação.

## Regras de negócio identificadas

**Catálogo**

- O catálogo é da conta. Na PF e na PJ, o dono é o titular.
- Membro e colaborador leem e gravam no catálogo do titular.

**O que não muda**

- Os lançamentos, o autor e os cartões.
- Ver e gerenciar cada cadastro continua dependendo da permissão de cada um.

**Despesa**

- A despesa só aceita categoria do catálogo da conta.

## Regras multi-tenant e segurança

- O dono vem sempre do banco (conta e vínculo ativo), nunca do corpo do pedido.
- Conta informada sem vínculo devolve o próprio solicitante, sem acesso a catálogo alheio.
- O `requireCatalogAccess` continua barrando quem não tem permissão.
- A despesa deixa de aceitar categoria de outra conta, o que fecha a exibição do nome de categoria alheia.

## Validações necessárias

- **Categoria da despesa:** segue a regra do verificador novo; a mensagem é "Categoria indisponível para esta conta".
- **Demais:** as de hoje (`canWriteToAccount` e as validações de entrada de cada rota).

## Testes necessários

### Frontend

- Sem mudança.

### Backend

- O roteiro da API do passo 10. Os helpers dependem do banco, e o projeto não tem testes de rota.

### E2E

- Roteiro local, com limpeza no fim.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build

npm --prefix backend run build
npm --prefix backend test
```

Backend local: `cd backend && PORT=<porta livre> DOTENV_CONFIG_PATH=../.env.dev NODE_ENV=development npx tsx src/server.ts` (nunca `dev:prod-db`).

## Riscos e pontos de atenção

**Escopo**

- São muitas rotas, e é fácil esquecer um ponto. Por isso o roteiro cobre cada cadastro e os três pontos da receita.

**Catálogo compartilhado**

- Com a permissão de gerenciar, o colaborador também edita e exclui os itens do titular. É consequência da decisão 2.
- Na PF, o membro passa a ver os clientes e produtos do titular quando tiver acesso a essas telas. É o mesmo princípio de antes, e essas telas ficam escondidas na PF.

**Dados**

- Decisão 3: se existirem cadastros antigos, o ajuste pode esbarrar em nome ou código repetido. Cada caso vai para aprovação.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

**Colaborador**

- Vê as categorias de despesa, clientes, contratos, representantes, produtos, sócios e serviços da empresa.
- O que ele cadastra aparece para o titular.
- A receita dele gera a comissão, desconta as horas e baixa o estoque com os itens da empresa.

**Despesa e regressão**

- Despesa com categoria de outra conta responde 400.
- A PF, o titular e o isolamento dos lançamentos ficam como estavam.
- tsc, testes e builds passam.

**Decisão 3**

- A conferência foi feita, com ajuste quando necessário, sempre com confirmação.

## Observações para a skill implementar

**Fonte e ordem**

- Este plano é a fonte principal. A Fase 1 remove e a Fase 2 aplica.

**Produção**

- Nada em produção sem confirmação.
- Em auto mode, o classificador bloqueia ações em produção. Nesse caso, entregar o SQL ou pedir que o usuário saia do auto mode e aprove o aviso.

**Testes**

- Subir o backend local numa porta livre e encerrar pela árvore de processos (`taskkill /T`, com autorização).

**Código**

- Identificadores em inglês e textos ao usuário em português.
- Não alterar `.env`. Não fazer commit nem push: isso é do `/finalizar`.
