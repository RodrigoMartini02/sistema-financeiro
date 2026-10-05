# Plano de Implementação: reescrita de clientes, contratos e serviços

## Origem

- **Arquivo de especificação:** não há `.md` de especificação.
  - A especificação é o **escopo de produto** aprovado no chat em 2026-10-04 (`/product-scope` em modo feature, decisões D1 a D31).
  - Também serve de base a **análise de impacto** `.plans/analise-impacto-clientes-contratos.md`.
  - As regras do escopo estão copiadas na seção "Regras de negócio identificadas". Este plano não depende do chat.
- **Data do planejamento:** `2026-10-04`
- **Classificação:** `frontend + backend + database`
- **Decisões do `/planejar`:**
  1. **Banco:** tabelas novas num schema próprio, `comercial`, com os dados existentes copiados. As tabelas antigas saem depois do deploy.
  2. **Entrega:** uma só, no fim. As etapas são validadas no banco local, cada uma num commit, e só vão para a `main` quando tudo estiver pronto.
  3. **Sem protótipo separado:** as telas são construídas direto no sistema. Visual e textos são aprovados por **prints das telas reais**, no computador e no celular, antes do `/finalizar`. Isso substitui o protótipo previsto no escopo (D15 e D31).

## Resumo

O módulo de clientes, contratos e serviços é refeito do zero, só para conta PJ, com o código antigo removido. A empresa cadastra os clientes dela (pessoa física, empresa ou órgão público) e os contratos com eles:

- **Cobranças combináveis:** mensalidade, implantação ou taxa única em parcelas, projeto em parcelas e banco de horas por tipo.
- **Receitas geradas no servidor:** dentro de uma transação, sem nunca repetir um mês.
- **Ciclo da receita:** "prevista" → "faturada" → "recebida".
- **Contrato com órgão público:** retenções (valor bruto × líquido), empenho com saldo, processo e modalidade.
- **Também:** reajuste com aviso, aditivo como hoje, comissão no recebimento, catálogo de serviços por PJ e anexos seguros (só PDF, JPG e PNG).
- **Isolamento:** tudo isolado por conta PJ.

O resto do sistema que depende do módulo é ajustado: lançamento de receita, painel PJ, relatórios, assistente, categorias, permissões, checklist e demo.

## Escopo

### Dentro do escopo

1. **Banco:** schema `comercial` com as tabelas novas, colunas novas em `receitas`, cópia dos 2 clientes e dos 14 serviços, categoria "Contratos › Projeto" e, depois do deploy, remoção das 8 tabelas antigas e da coluna `receitas.cliente`.
2. **Remoção do código antigo**, em etapa própria:
   - rotas `clients.ts`, `contracts.ts`, `contract-services.ts`, `contract-attachments.ts` e `services.ts`;
   - telas `ClientesTab`, `ClienteDetail` e `ServicosTab`;
   - `clientesService.ts`, `servicosService.ts`, `getContratosFaturamento`;
   - chaves de cache antigas;
   - dicas de primeiro acesso `clientes:*`;
   - o item "Catálogo de serviços" de Configurações.
3. **Backend novo** (módulo `contracts`):
   - clientes;
   - catálogo de serviços;
   - contratos: prévia, criação, alteração, encerramento, exclusão, aditivo, reajuste e "Faturar";
   - banco de horas;
   - empenho;
   - anexos;
   - carteira do painel;
   - contratos com horas, para o lançamento de receita;
   - completar os contratos "sem prazo".
4. **Integrações:**
   - lançamento de receita: cliente pelo cadastro, horas por tipo com bloqueio acima do saldo, retenções em contrato público;
   - recebimento: comissão da receita de contrato;
   - relatórios: nome do cliente pelo cadastro;
   - categorias: "em contrato ativo" e contagem de uso;
   - receitas fixas e rotina interna;
   - assistente, checklist, demo e permissões.
5. **Frontend novo** (`src/screens/clients/`):
   - lista com indicadores;
   - cadastro;
   - página do cliente com as abas "Contratos", "Receitas" e "Dados";
   - contrato em etapas com prévia;
   - ficha do contrato;
   - catálogo de serviços;
   - anexos.
6. **Validação:**
   - tipos, testes e build;
   - roteiro no banco local com todos os critérios de aceite;
   - teste de tela;
   - prints para aprovação.

### Fora do escopo

- Compradores da vitrine como clientes; produtos, estoque, vitrine e Mercado Pago.
- Emissão de nota fiscal, cobrança automática do cliente (boleto ou Pix) e busca automática de índice de reajuste.
- Retenções para clientes que não sejam órgão público.
- Relatório novo por cliente.
- Mudanças em lançamentos sem cliente, contas pessoais, cartões e planejamento.
- Cadastro de representantes e a regra de comissão por categoria das receitas manuais, que continua no lançamento.
- Cron Job do Render: continua desligado. O "sem prazo" é completado ao abrir o sistema e pela rotina interna já existente.

## Leitura de contexto

- `/AGENT.md`, lido integralmente:
  - Drizzle em query nova;
  - filtro do tenant (aqui, a conta PJ) em tudo;
  - tenant nunca vindo do cliente sem validação;
  - nada de `any`;
  - identificadores em inglês, com banco e textos de tela em português;
  - migrations e `.env` só com confirmação.
- `/CLAUDE.md`: fluxo `/planejar` → aprovação → `/implementar` → `/finalizar`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem** neste projeto.
- Especificação: o escopo de produto do chat de 2026-10-04 e `.plans/analise-impacto-clientes-contratos.md`.
- **Código lido:**
  - **Módulo atual:**
    - `backend/src/routes/{clients,contracts,contract-services,contract-attachments,services}.ts`;
    - `src/screens/config/{ClientesTab,ClienteDetail,ServicosTab}.tsx`;
    - `src/services/clientesService.ts`.
  - **Receitas:**
    - `backend/src/routes/incomes.ts` (inclui `/receber` e `/fixas/processar`);
    - `backend/src/services/{incomeService,incomeInput,commissionService,fixedIncomes}.ts`;
    - `backend/src/routes/internal-jobs.ts`.
  - **Categorias:**
    - `backend/src/services/incomeClassificationDefaults.ts`;
    - `backend/src/routes/income-classifications.ts`;
    - `backend/drizzle/0051_classificacoes_receita.sql`: padrões por dono e tipo, com `conta_id` nulo.
  - **Permissões:**
    - `backend/src/utils/catalogAccess.ts`;
    - `backend/src/middleware/permissions.ts` (`requireCatalogAccess`);
    - `backend/src/utils/accountAccess.ts` (`resolveCompanyAccount`);
    - `src/utils/screenAccess.ts`.
  - **Padrão de módulo:**
    - `backend/src/modules/catalogo/{db/schema.ts,routes/*}`: `pgSchema` e rotas que conferem a conta;
    - `backend/src/services/orders.ts` e os validadores puros com teste (`orderInput.ts`, `storefrontInput.ts`).
  - **Telas que dependem do módulo:**
    - `src/screens/finance/income-dialog/*` (ClientSelect, draftRules, IncomeDetailsPopover);
    - `src/screens/finance/painel/ExtrasContaEmpresa.tsx`;
    - `src/components/financial-assistant/FinancialAssistant.tsx`;
    - `src/hooks/useOnboardingChecklist.ts`;
    - `src/services/demo/fakeApiResolver.ts`;
    - `src/layout/{ConfigPanel,AppShell}.tsx`;
    - `src/App.tsx`.
  - **Validação de documento:**
    - `backend/src/middleware/validation.ts` (`isValidCpf`, `isValidCnpj`);
    - `src/utils/companyAccount.ts` (`isValidCnpj`);
    - `src/utils/storefrontCheckout.ts` (`isValidCpf`).
- **Dados, conferidos só lendo em 2026-10-04:**
  - produção: 2 clientes, 0 contratos, 14 serviços (de 2 donos), 0 receitas com contrato ou com cliente, 0 anexos, tabelas legadas vazias;
  - local: 1 cliente, 0 contratos, 3 serviços.

## Impacto por área

### Frontend

**Remoção, primeiro:**
- `src/screens/config/ClientesTab.tsx`, `ClienteDetail.tsx`, `ServicosTab.tsx`;
- `src/services/clientesService.ts`, `servicosService.ts`, `getContratosFaturamento` em `financeService.ts`;
- as chaves `clientes`, `contratos`, `servicos`, `contratosServicos`, `contratoAnexos`, `contratosAtivos` e `contratosStatusFaturamento` em `queryKeys.ts`;
- as mensagens `clientes*` e os usos de `useFirstAccessGuide('clientes:*')`;
- o item `servicos` de `ConfigPanel.tsx`, `ConfigItemId`, `screenAccess.ts` (`CONFIG_ITEM_FLAG`, `COMPANY_ONLY_ITEMS`) e `AppShell.tsx` (`CONFIG_ITEM_IDS`).

**Telas novas (`src/screens/clients/`):**

- **`ClientsScreen`** (seção "Clientes" do menu):
  - topo com indicadores: recorrente do mês, contratos vencendo em 60 dias e valores em atraso;
  - busca, filtro por tipo e filtro por situação ("Ativos" ou "Desativados");
  - linhas com nome, documento formatado, selo do tipo, valor mensal ativo e os alertas "contrato vencendo", "receita atrasada" e "Reajuste disponível";
  - botão "Novo cliente";
  - área "Catálogo de serviços" para quem tem a permissão Serviços;
  - quem tem só Serviços vê só o catálogo.
- **`ClientFormDialog`:**
  - o tipo define os campos: CPF; CNPJ; ou CNPJ, esfera e órgão;
  - contato e endereço opcionais;
  - máscaras, validação, "Desativar" e "Reativar";
  - excluir só sem contrato e sem receita.
- **`ClientPage`:** cabeçalho com nome, tipo, documento e contato, e as abas "Contratos", "Receitas" e "Dados".
- **`ContractWizard`** (novo contrato e edição), em etapas:
  1. vigência: início, fim opcional ("sem prazo") e dia de vencimento de 1 a 28;
  2. cobranças: mensalidade, implantação ou taxa única (total, parcelas e primeira data), projeto (idem) e tipos de hora (nome, valor da hora, quantidade);
  3. órgão público, só se o cliente for desse tipo: processo, modalidade, retenções por tributo e empenhos por ano;
  4. representante, categorias em "mais opções", serviços (com "implantado") e anexos;
  5. prévia das receitas, vinda do servidor, antes de salvar.
- **`ContractDetail`:**
  - situação e vigência ("vence em N dias");
  - cobranças, saldo por tipo de hora, empenhos com saldo;
  - "Reajuste disponível" com "Aplicar" (percentual) e "Dispensar";
  - lista de receitas do contrato com o estado e "Faturar";
  - anexos;
  - ações "Editar", "Aditivo", "Encerrar" e "Excluir", conforme as regras.
- **`ServiceCatalog` e `ContractAttachments`:** PDF e imagem abrem para visualizar; outros tipos são recusados no envio.
- **Visual:** mesmos tokens e componentes das Configurações (`configTokens`, `ConfigListRow`, `ConfigTabHeader`, `InfoBanner`, `EmptyState`, `Dialog`) e dos modais de receita e despesa (`dialogFormTokens`, peças de `entry-dialog/`). Um único estilo de botão.
- **Formatos:** datas "dd/mm/aaaa", valores "R$ 1.234,56", percentuais com duas casas e horas com até duas casas mais "h".
- **Estados:** carregando, erro com nova tentativa, vazio ("Nenhum cliente…"). Numa falha ao salvar, o formulário mantém o que foi digitado.

**Serviços e chaves:**
- `src/services/clientsService.ts`, `contractsService.ts` e `serviceCatalogService.ts`, com tipos;
- chaves novas em `queryKeys.ts`, todas com a conta:
  - `clients(accountId)`, `client(id)`;
  - `contracts(accountId, clientId)`, `contract(id)`, `contractPreview`;
  - `serviceCatalog(accountId)`, `contractPortfolio(accountId, mes, ano)`, `contractsWithHours(accountId)`.
- Utilitários puros:
  - `src/utils/brazilDocuments.ts`: CPF e CNPJ, formatação e validação, juntando as funções que hoje estão espalhadas;
  - `src/utils/contractDisplay.ts`: rótulos de estado, "vence em N dias", alertas e indicadores.

**Integrações no front:**
- **Lançamento de receita:**
  - **`ClientSelect`:**
    - escolhe por `id` e mostra o nome atual;
    - o "+ cadastrar" abre o `ClientFormDialog`, porque agora o documento é obrigatório.
  - **`draftState`, `draftRules`, `IncomeDetailsPopover`:**
    - horas: contrato → tipo de hora (nome, valor, saldo) → quantidade, com bloqueio acima do saldo também na tela;
    - prévia de bruto, retenções e líquido quando o contrato é de órgão público;
    - `contractPrefill` usa o cliente pelo `id`.
- **`ExtrasContaEmpresa.tsx`:** carteira pela rota nova. O valor do mês é a mensalidade, pelo líquido em órgão público.
- **`FinancialAssistant.tsx`:** clientes por `id` e horas por tipo.
- **`useOnboardingChecklist.ts`:** lista de clientes nova.
- **`screenAccess.ts`:** seção `clientes` visível com `accessClients` **ou** `accessServices`.
- **`App.tsx`:** a seção `clientes` renderiza `ClientsScreen` dentro de `CONFIG_SCOPE_CLASS`.
- **`fakeApiResolver.ts` (demo):** as rotas novas devolvem listas vazias.
- **Tipos:** `IncomeBillableHours` passa a `{ hourTypeId, hours }`; a receita passa a usar `clientId`.

**Testes do front:** ver "Testes necessários".

### Backend

**Módulo `backend/src/modules/contracts/`:**
- `db/schema.ts`: tabelas do schema `comercial` no Drizzle (`pgSchema('comercial')`).
- **Rotas,** em inglês, com campos de pedido e resposta em inglês:
  - `routes/clients.ts`: `/api/clients`;
  - `routes/serviceCatalog.ts`: `/api/service-catalog`;
  - `routes/contracts.ts`: `/api/contracts`;
  - `routes/attachments.ts`: `/api/contracts/:id/attachments` e `/api/contracts/attachments/:attachmentId/file`;
  - `routes/index.ts`.
- **Montagem em `server.ts`:** com `authenticate`, `requireActivePlan` e `requireCatalogAccess('clients' | 'contracts' | 'services')`. As montagens antigas saem: `/api/clientes`, `/api/contratos`, `/api/servicos`, `/api/contratos-servicos` e `/api/contrato-anexos`.

**Endpoints:**

| Método e rota | O que faz |
| --- | --- |
| `GET /api/clients?accountId=&search=&type=&status=` | Lista com indicadores: valor mensal ativo, alertas, documento formatado no front |
| `GET /api/clients/summary?accountId=` | Recorrente do mês, contratos vencendo em 60 dias, valores atrasados |
| `POST /api/clients`, `PUT /api/clients/:id` | Cadastro e edição |
| `PUT /api/clients/:id/active` | Desativar ou reativar |
| `DELETE /api/clients/:id` | Só sem contrato e sem receita |
| `GET/POST/PUT /api/service-catalog`, `PUT /api/service-catalog/:id/active` | Catálogo por conta PJ |
| `GET /api/contracts?accountId=&clientId=` | Contratos do cliente |
| `GET /api/contracts/:id` | Ficha: saldos de horas, saldos de empenho, reajuste disponível, receitas |
| `POST /api/contracts/preview` | Prévia das receitas, com o mesmo cálculo do salvar |
| `POST /api/contracts`, `PUT /api/contracts/:id` | Criar e alterar, numa transação com as receitas |
| `POST /api/contracts/:id/close` | Encerrar: cancela as futuras previstas |
| `DELETE /api/contracts/:id` | Só sem receita faturada ou recebida; apaga as previstas |
| `POST /api/contracts/:id/amendment` | Aditivo (D9, D21) |
| `POST /api/contracts/:id/readjustment` | `{ action: 'apply', percent }` ou `{ action: 'dismiss' }` |
| `POST /api/contracts/incomes/:incomeId/invoice` | "Faturar": prevista → faturada. Devolve `warning` quando o empenho não cobre |
| `GET /api/contracts/portfolio?accountId=&month=&year=` | Carteira do painel |
| `GET /api/contracts/with-hours?accountId=` | Contratos ativos com tipos de hora e saldos, para o lançamento de receita |
| Anexos `GET/POST/DELETE` | Envio com conferência do tipo real; arquivo devolvido com o tipo fixado |

**Serviços em `backend/src/services/`.** As regras puras têm teste próprio:

- **`clientInput.ts`, puro:**
  - tipo (`individual` / `company` / `public_entity`);
  - nome de 2 a 150 caracteres;
  - documento só com dígitos e dígitos verificadores (`isValidCpf` ou `isValidCnpj`);
  - esfera e órgão obrigatórios para órgão público;
  - contato: e-mail válido e telefone de 10 ou 11 dígitos;
  - endereço: CEP de 8 dígitos e UF válida.
- **`clients.ts`:**
  - listagem com indicadores, resumo, CRUD, desativar e reativar;
  - exclusão só sem vínculos;
  - documento único por conta (409 "Já existe um cliente com este documento").
- **`serviceCatalog.ts`:** CRUD por conta PJ; desativar no lugar de excluir.
- **`contractInput.ts`, puro:**
  - contrato, cobranças (cada uma com valor maior que zero; parcelas ≥ 1 com primeira data), tipos de hora (valor e quantidade maiores que zero, nome único no contrato);
  - pelo menos uma cobrança (mensalidade, implantação, projeto ou um tipo de hora);
  - vigência (`fim ≥ inicio`), dia de 1 a 28;
  - percentuais de retenção de 0 a 100 com duas casas;
  - empenhos com ano único no contrato e valor maior que zero.
- **`contractSchedule.ts`, puro:** a agenda das receitas.
  - mensalidade mês a mês, de `inicio` até `fim`, ou até 12 meses à frente do mês atual quando é "sem prazo", vencendo no dia escolhido;
  - parcelas iguais e mensais a partir da primeira data, com a diferença de centavos na última;
  - pula os meses bloqueados: receitas já faturadas ou recebidas e meses cobertos pelo contrato anterior no aditivo.
- **`contractRetentions.ts`, puro:** valor por tributo (arredondado por tributo), total e líquido.
- **`contractReadjustment.ts`, puro:**
  - próximo aniversário a partir da data-base e do último tratado;
  - "disponível" ou não;
  - valores novos com o percentual (0,00% não altera).
- **`contracts.ts`:**
  - **Criar e alterar:**
    - numa transação: contrato, cobranças, tipos de hora, serviços, empenhos e as receitas da agenda;
    - alterar refaz só as **futuras ainda previstas** (competência a partir do mês atual);
    - faturadas, recebidas e as passadas ainda previstas ficam como estão;
    - o índice único garante que nenhum mês se repete.
  - **Encerrar, excluir, aditivo, reajuste, faturar, carteira, contratos com horas.**
  - **Completar "sem prazo":** `topUpOpenEndedContracts`, por usuário ou para todos.
  - **Receitas geradas:**
    - `cliente_id`, `contrato_id`, `cobranca_id`, `competencia` e `representante_id` do contrato;
    - categoria do tipo de cobrança, com as padrão quando vazia;
    - em órgão público: `valor_bruto`, `retencoes` e `valor` = líquido;
    - **sem** comissão na criação.
  - **Descrição:** "Mensalidade - {cliente}", "Implantação 1/3 - {cliente}", "Projeto 2/5 - {cliente}". O texto final é aprovado nos prints.
- **`contractHours.ts`:**
  - saldo por tipo = quantidade − horas dos consumos cuja receita não está cancelada;
  - conferência com o tipo de hora travado (`FOR UPDATE`);
  - erro 400 "Saldo de horas insuficiente: restam X h".
- **`contractEmpenho.ts`, puro, com a consulta:**
  - saldo por ano = valor − bruto das receitas do contrato faturadas ou recebidas, com `COALESCE(competencia, data_recebimento)` naquele ano;
  - aviso "Empenho sem saldo suficiente" quando não há empenho no ano ou quando o saldo não cobre.
- **`contractAttachments.ts`:**
  - tipo real pelos primeiros bytes (`%PDF-`, PNG, JPEG), extensão coerente, até 20 MB;
  - nome gerado no servidor;
  - devolve com `Content-Type` do tipo conferido e `inline`;
  - diretório `uploads/contratos`, no disco do Render.

**Permissões e isolamento:**
- **Tenant:** toda rota resolve a conta pela fonte confiável: `resolveCompanyAccount(requesterId, accountId)` para listas e criação.
- **Rota por id:** carrega o registro e confere a conta dele. Sem acesso, devolve 404, igual a "não encontrado", como em `routes/orders.ts`.
- **`catalogAccess.ts`:**
  - `clients` com `listPaths` `/` (leitores: `accessIncomes`);
  - `contracts` com `listPaths` `/with-hours` (leitores: `accessIncomes`);
  - `services` com `listPaths` `/` (leitores: `accessContracts`).
- **Membro:** só a conta PJ vinculada (`resolveCompanyAccount` já garante).

**Integrações no backend:**
- **`incomeInput.ts` e teste:** `client` (texto) vira `clientId` (número ou nulo); `billableHours` vira `{ hourTypeId, hours }`.
- **`incomeService.ts`:**
  - o cliente precisa ser da mesma conta da receita;
  - horas: grava em `comercial.consumos_hora` na mesma transação, com bloqueio acima do saldo, e preenche `contrato_id`; `debitContractHours` sai;
  - contrato de órgão público: `valor_bruto` = valor digitado, retenções pelos percentuais do contrato, `valor` = líquido;
  - na edição de receita com `valor_bruto`, o valor editado é o bruto e as retenções são recalculadas.
- **`routes/incomes.ts` (`/receber`):** numa transação.
  - Se a receita tem `cobranca_id` ou `contrato_id`, tem representante e ainda não tem comissão, gera a comissão (`findCommissionRule` + `createCommissionExpense`) com base no valor recebido.
  - A receita manual não muda: comissão no lançamento, como hoje.
- **`routes/incomes.ts` (`/fixas/processar`) e `routes/internal-jobs.ts`:** chamam `topUpOpenEndedContracts`.
- **`reportService.ts` e `reportPdf.ts`:** nome do cliente via `LEFT JOIN comercial.clientes` por `receitas.cliente_id`.
- **`routes/income-classifications.ts`:** "em contrato ativo" e a contagem de uso passam a olhar as três categorias de `comercial.contratos`.
- **`incomeClassificationDefaults.ts`:**
  - `projeto: 'Projeto'` em `CONTRACT_INCOME_CLASSIFICATION` e nas subcategorias padrão de empresa;
  - garantia sob demanda (`ensureCompanyIncomeClassification`), se faltar.
- **Conferir na implementação:** `entryQueries.ts` e o assistente do backend leem `receitas.cliente`? Se sim, trocar pelo nome via cadastro.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**`backend/drizzle/0070_comercial_clientes_contratos.sql` — antes do deploy.** Só acrescenta.

- **`CREATE SCHEMA comercial`.**
- **`comercial.clientes`:**
  - **Identificação:**
    - `id SERIAL`;
    - `conta_id INTEGER NOT NULL → contas ON DELETE CASCADE`;
    - `usuario_id INTEGER NOT NULL → usuarios ON DELETE CASCADE` (dono);
    - `tipo VARCHAR(20)` com CHECK `pessoa_fisica | empresa | orgao_publico`;
    - `nome VARCHAR(150) NOT NULL`;
    - `documento VARCHAR(14) NOT NULL` (só dígitos).
  - **Órgão público:** `esfera VARCHAR(10)` com CHECK `municipal | estadual | federal` e `orgao VARCHAR(150)`. CHECK: órgão público exige `esfera` e `orgao`; tamanho do documento por tipo (11 ou 14).
  - **Contato e endereço:** `contato_nome VARCHAR(100)`, `contato_email VARCHAR(150)`, `contato_telefone VARCHAR(11)`, `cep VARCHAR(8)`, `rua VARCHAR(150)`, `numero VARCHAR(20)`, `complemento VARCHAR(80)`, `bairro VARCHAR(80)`, `cidade VARCHAR(80)`, `uf CHAR(2)`.
  - **Situação e datas:** `ativo BOOLEAN NOT NULL DEFAULT true`; `created_at` e `updated_at TIMESTAMPTZ`.
  - **Índices:** UNIQUE (`conta_id`, `documento`); (`conta_id`, `nome`).
- **`comercial.servicos`:**
  - `id`, `conta_id NOT NULL → contas CASCADE`, `usuario_id NOT NULL`;
  - `nome VARCHAR(150) NOT NULL`, `ativo BOOLEAN NOT NULL DEFAULT true`, `created_at`;
  - UNIQUE (`conta_id`, `LOWER(nome)`).
- **`comercial.contratos`:**
  - **Identificação:**
    - `id`, `conta_id NOT NULL → contas CASCADE`, `usuario_id NOT NULL`;
    - `cliente_id INTEGER NOT NULL → comercial.clientes`, sem ação: cliente com contrato não é excluído;
    - `numero VARCHAR(50)`, `descricao VARCHAR(255)`, `observacoes TEXT`.
  - **Vigência e situação:**
    - `inicio DATE NOT NULL`, `fim DATE` (nulo = sem prazo; CHECK `fim >= inicio`);
    - `dia_vencimento SMALLINT NOT NULL` com CHECK de 1 a 28;
    - `status VARCHAR(10)` com CHECK `ativo | encerrado`, e `encerrado_em DATE`;
    - aditivo: `contrato_anterior_id → comercial.contratos ON DELETE SET NULL` e `numero_aditivo INTEGER NOT NULL DEFAULT 0`.
  - **Representante e categorias:** `representante_id → representantes ON DELETE SET NULL`; `classificacao_mensalidade_id`, `classificacao_implantacao_id` e `classificacao_projeto_id → classificacoes_receita ON DELETE SET NULL`.
  - **Órgão público:** `processo VARCHAR(100)`, `modalidade VARCHAR(100)`; `retencao_ir`, `retencao_pis_cofins_csll`, `retencao_iss` e `retencao_inss NUMERIC(5,2)` com CHECK de 0 a 100.
  - **Reajuste:** `reajuste_data_base DATE NOT NULL`, `reajuste_tratado_ate DATE` (último aniversário aplicado ou dispensado).
  - **Datas:** `created_at`, `updated_at`.
  - **Índices:** (`conta_id`, `status`), (`cliente_id`).
- **`comercial.cobrancas`:**
  - `id`, `contrato_id → comercial.contratos ON DELETE CASCADE`;
  - `tipo VARCHAR(12)` com CHECK `mensalidade | implantacao | projeto`;
  - `valor NUMERIC(12,2) CHECK > 0`: mensal na mensalidade, total nas parceladas;
  - `parcelas SMALLINT` e `primeira_data DATE`: nulos na mensalidade e obrigatórios nas parceladas (CHECK);
  - UNIQUE (`contrato_id`, `tipo`).
- **`comercial.tipos_hora`:**
  - `id`, `contrato_id → CASCADE`;
  - `nome VARCHAR(60) NOT NULL`, `valor_hora NUMERIC(12,2) CHECK > 0`, `quantidade NUMERIC(10,2) CHECK > 0`;
  - UNIQUE (`contrato_id`, `LOWER(nome)`).
- **`comercial.consumos_hora`:**
  - `id`, `tipo_hora_id → comercial.tipos_hora CASCADE`;
  - `receita_id INTEGER NOT NULL UNIQUE → receitas ON DELETE CASCADE`;
  - `horas NUMERIC(10,2) CHECK > 0`, `created_at`.
- **`comercial.empenhos`:**
  - `id`, `contrato_id → CASCADE`;
  - `ano SMALLINT NOT NULL`, `numero VARCHAR(50) NOT NULL`, `valor NUMERIC(14,2) CHECK > 0`;
  - UNIQUE (`contrato_id`, `ano`).
- **`comercial.contrato_servicos`:**
  - `contrato_id → CASCADE`, `servico_id → comercial.servicos`;
  - `implantado BOOLEAN NOT NULL DEFAULT false`;
  - PK (`contrato_id`, `servico_id`).
- **`comercial.anexos`:**
  - `id`, `contrato_id → CASCADE`, `conta_id NOT NULL`, `usuario_id → usuarios` (quem enviou);
  - `nome_original VARCHAR(255)`, `nome_arquivo VARCHAR(255) UNIQUE`;
  - `tipo VARCHAR(4)` com CHECK `pdf | jpg | png`, `tamanho INTEGER` com CHECK ≤ 20 MB;
  - `created_at`.
- **`receitas`:**
  - colunas novas:
    - `cliente_id → comercial.clientes ON DELETE SET NULL`;
    - `cobranca_id → comercial.cobrancas ON DELETE SET NULL`;
    - `competencia DATE`;
    - `valor_bruto NUMERIC(10,2)`;
    - `retencoes JSONB`;
  - índices em `cliente_id` e `contrato_id`;
  - **índice único parcial** (`cobranca_id`, `competencia`) `WHERE cobranca_id IS NOT NULL AND status <> 'cancelada'`;
  - **`contrato_id`:**
    - a migration **aborta** (`RAISE EXCEPTION`) se existir `receitas.contrato_id` preenchido;
    - remove a chave estrangeira antiga, procurando o nome no catálogo;
    - cria a nova, `→ comercial.contratos ON DELETE SET NULL`.
- **Dados:**
  - **Clientes:**
    - `public.clientes` vira `comercial.clientes` com tipo `empresa` e `documento` só com dígitos;
    - `conta_id` = a do cliente, ou a primeira PJ do dono;
    - sem PJ ou sem CNPJ de 14 dígitos: não copia. O roteiro confere os casos;
    - `ON CONFLICT DO NOTHING`.
  - **Receitas antigas:** recebem `cliente_id` quando o texto em `receitas.cliente` casa com o nome de um cliente da mesma conta. Hoje são 0 linhas.
  - **Serviços:** `public.servicos` (por dono) vira `comercial.servicos`, uma cópia para **cada** conta PJ do dono, com `ON CONFLICT DO NOTHING`.
  - **Categorias:** "Projeto" sob "Contratos" para cada dono com o padrão de empresa (`conta_id` nulo, como na 0051), com `ON CONFLICT DO NOTHING`.
- **Cabeçalho:** "ORDEM: aplicar ANTES do deploy do código novo".

**`backend/drizzle/0071_remover_clientes_contratos_antigos.sql` — depois do deploy.**
- Confere que o código novo está no ar (passo do `/finalizar`).
- `DROP TABLE` de `public.contrato_anexos`, `contratos_servicos`, `servicos_tecnicos_contrato`, `consumo_horas`, `modulos_contrato`, `contratos`, `servicos` e `clientes`, nessa ordem.
- `ALTER TABLE receitas DROP COLUMN cliente`.
- Cabeçalho: "ORDEM: aplicar DEPOIS do deploy".

**Schema do Drizzle:**
- `backend/src/modules/contracts/db/schema.ts`: tabelas novas, nomes do banco em português, campos em inglês;
- `backend/src/db/schema/incomes.ts`: `clientId`, `chargeId`, `competence`, `grossAmount` e `withholdings`. O campo `client` sai junto com a 0071.

**RLS:** o projeto não usa. O isolamento é por conta, no código.

### Infra/Deploy

- **Sem variáveis novas.**
- **Ordem na produção:**
  1. 0070, antes do merge e fora do modo automático, com confirmação;
  2. merge e deploy (cerca de 1 minuto fora do ar, por causa do disco);
  3. 0071, depois do deploy, com confirmação.
- **Anexos:** em `uploads/contratos`, no disco do Render, que já existe.
- **"Sem prazo":** completado pela chamada que o app já faz ao abrir (`/incomes/fixas/processar`) e pela rotina interna (`internal-jobs`). O Cron Job do Render continua desligado.

## Arquivos provavelmente afetados

**Backend (novos):**
- `backend/drizzle/0070_comercial_clientes_contratos.sql`
- `backend/drizzle/0071_remover_clientes_contratos_antigos.sql`
- `backend/src/modules/contracts/db/schema.ts`
- `backend/src/modules/contracts/routes/{index,clients,serviceCatalog,contracts,attachments}.ts`
- `backend/src/services/{clients,serviceCatalog,contracts,contractHours,contractAttachments}.ts`
- `backend/src/services/{clientInput,contractInput,contractSchedule,contractRetentions,contractReadjustment,contractEmpenho}.ts`, cada um com teste

**Backend (alterados):**
- `backend/src/server.ts`
- `backend/src/db/schema/incomes.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/internal-jobs.ts`
- `backend/src/routes/income-classifications.ts`
- `backend/src/services/{incomeService,incomeInput,fixedIncomes,reportService,reportPdf,incomeClassificationDefaults}.ts` e os testes correspondentes
- `backend/src/utils/catalogAccess.ts`

**Backend (removidos):**
- `backend/src/routes/{clients,contracts,contract-services,contract-attachments,services}.ts`

**Frontend (novos):**
- `src/screens/clients/*`
- `src/services/{clientsService,contractsService,serviceCatalogService}.ts`
- `src/utils/brazilDocuments.ts` e teste
- `src/utils/contractDisplay.ts` e teste

**Frontend (alterados):**
- `src/App.tsx`
- `src/layout/{ConfigPanel,AppShell}.tsx`
- `src/utils/screenAccess.ts` e teste
- `src/services/{queryKeys,financeService}.ts`
- `src/types/finance.ts`
- `src/screens/finance/income-dialog/{ClientSelect,IncomeDialog,IncomeRow,IncomeDetailsPopover,draftState,draftRules}.ts(x)` e teste
- `src/screens/finance/painel/ExtrasContaEmpresa.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/hooks/useOnboardingChecklist.ts`
- `src/services/demo/fakeApiResolver.ts`
- `src/components/firstAccessGuideMessages.ts`
- `src/utils/storefrontCheckout.ts` e `src/utils/companyAccount.ts`: passam a importar de `brazilDocuments.ts`

**Frontend (removidos):**
- `src/screens/config/{ClientesTab,ClienteDetail,ServicosTab}.tsx`
- `src/services/{clientesService,servicosService}.ts`

## Estratégia de implementação

1. **Branch e preparação:**
   - branch `feat/R/clientes-contratos`, criada da `main` atualizada;
   - reler os 2 clientes e os 14 serviços da produção, só lendo, para confirmar a cópia da 0070 (documentos, contas PJ dos donos).
2. **Banco:**
   - escrever a 0070 e o schema do Drizzle;
   - **pedir confirmação** e aplicar a 0070 no banco local;
   - conferir a cópia dos dados locais.
3. **Remoção do antigo**, em etapa própria, antes do código novo:
   - apagar as rotas e telas antigas, os serviços do front, as chaves de cache e as dicas `clientes:*`;
   - tirar as montagens do `server.ts` e o item "Catálogo de serviços" das Configurações;
   - o sistema compila sem o módulo; as telas que dependiam dele ficam temporariamente sem a parte de clientes;
   - commit.
4. **Regras puras com testes:** `clientInput`, `contractInput`, `contractSchedule`, `contractRetentions`, `contractReadjustment` e `contractEmpenho`, com os testes. Commit.
5. **Backend do módulo:**
   - serviços: clientes, catálogo, contratos, horas e anexos;
   - rotas e montagem;
   - `catalogAccess`;
   - isolamento por conta em todas as rotas.
   - Commit.
6. **Integrações no backend:**
   - `incomeInput` e `incomeService`: cliente, horas e retenções;
   - `/receber`: comissão da receita de contrato;
   - `/fixas/processar` e `internal-jobs`: "sem prazo";
   - relatórios, categorias e padrões ("Projeto").
   - Commit.
7. **Telas novas:**
   - `ClientsScreen`, `ClientFormDialog`, `ClientPage`, `ContractWizard`, `ContractDetail`, `ServiceCatalog` e `ContractAttachments`;
   - serviços e chaves;
   - utilitários com teste.
   - Commit.
8. **Integrações no front:**
   - lançamento de receita: cliente por `id`, cadastro completo pelo "+ cadastrar", horas por tipo, prévia de retenções;
   - painel, assistente, checklist, menu e permissões, demo.
   - Commit.
9. **Validação técnica:**
   - `tsc`, testes e build do front e do back;
   - roteiro no banco local com o backend em outra porta, cobrindo **todos os critérios de aceite** deste plano;
   - teste de tela no jsdom;
   - limpeza dos dados de teste;
   - registro neste plano.
10. **Aprovação visual:**
    - prints das telas reais (Edge headless, HTML do SSR com o CSS do build; no celular, um quadro de 390 px) de:
      - lista com indicadores;
      - cadastro (os três tipos);
      - página do cliente (três abas);
      - as cinco etapas do contrato com a prévia;
      - ficha (reajuste disponível, empenho, horas, receitas com "Faturar", anexos);
      - catálogo;
      - lançamento de receita com horas e retenções;
    - **A implementação para aqui** até o usuário aprovar visual e textos. Ajustes viram commits.
11. **`/finalizar`:**
    - commit e push;
    - 0070 na produção antes do merge, fora do modo automático, com confirmação;
    - merge e deploy, com conferência;
    - 0071 depois do deploy, com confirmação;
    - conferência das tabelas na produção, só lendo.

## Regras de negócio identificadas

Do escopo aprovado (D1–D30). D31: os textos são definidos na implementação e aprovados nos prints.

**Acesso**
- O módulo é **só de conta PJ**. Conta pessoal não vê o menu "Clientes" nem o campo "Cliente" da receita.
- Permissões, com o mesmo efeito de hoje:
  - "Clientes": menu e cadastro;
  - "Contratos": contratos e anexos;
  - "Serviços": catálogo.
- O menu "Clientes" aparece com "Clientes" **ou** "Serviços". Quem tem só "Serviços" vê só o catálogo. Sem "Contratos", a página do cliente não mostra contratos.

**Clientes**
- Tipos e campos:
  - Pessoa física: nome e CPF;
  - Empresa: nome e CNPJ;
  - Órgão público: nome, CNPJ, esfera (municipal, estadual ou federal) e órgão ou secretaria.
- Documento obrigatório, validado e sem repetir na mesma PJ. Contato e endereço opcionais.
- Cliente com contrato ou receita **não é excluído**, só desativado.
  - O desativado sai da lista padrão (filtro "Desativados") e não pode ser escolhido em contrato ou receita nova.
  - Mantém os contratos e as receitas e pode ser reativado.

**Cobranças**
- **Mensalidade:** valor digitado maior que zero. É o **único valor do mês** na tela, nas receitas e no painel. Os serviços não alteram valores (D6 b).
- **Implantação ou taxa única, e projeto:** total maior que zero, dividido em N parcelas iguais e mensais.
  - A primeira vence na data informada, e a diferença de centavos fica na última.
  - Categorias: "Contratos › Implantação" e "Contratos › Projeto" (nova).
- **Banco de horas:**
  - tipos com nome livre, cada um com valor da hora e quantidade maiores que zero;
  - a receita lançada com "Horas a faturar" desconta o saldo do tipo;
  - lançar acima do saldo é bloqueado, informando as horas restantes;
  - cancelar ou excluir a receita devolve as horas;
  - não há preço de excedente.
- O contrato precisa de **ao menos uma cobrança**.

**Serviços**
- Catálogo por conta PJ, dentro do módulo.
- No contrato, lista informativa com o nome e "implantado" (sim/não), sem valor.

**Vigência e receitas**
- Data final opcional. "Sem prazo" mantém sempre **12 mensalidades previstas à frente** do mês atual.
- Vencimento num dia de 1 a 28, escolhido no contrato.
- Salvar gera as previstas da vigência e as parcelas.
- Alterar refaz só as **futuras ainda previstas**. Faturadas e recebidas nunca mudam.
- **Nunca** repete o mesmo mês da mesma cobrança.
- Encerrar cancela as futuras previstas.
- Estados: "Prevista" → "Faturada" (ação "Faturar") → "Recebida".

**Órgão público**
- **Retenções:**
  - percentuais por tributo (IR, PIS/COFINS/CSLL, ISS, INSS), com duas casas;
  - aplicados a todas as receitas do contrato, inclusive as de horas;
  - campo vazio é igual a 0,00%: sem retenção daquele tributo;
  - a receita mostra bruto, retenções e líquido; o recebido é o líquido;
  - nos totais (painel, relatórios, a receber), previstas e faturadas também contam pelo líquido;
  - só em contrato de órgão público.
- **Empenho:**
  - um por ano (número, ano, valor);
  - o saldo baixa quando uma receita daquele ano é faturada (e continua baixado na recebida);
  - faturar acima do saldo, ou sem empenho no ano, mostra "Empenho sem saldo suficiente", sem bloquear.
- **Processo e modalidade:** em texto.

**Reajuste**
- Data-base = início do contrato, editável.
- A partir de cada aniversário anual aparece "Reajuste disponível" (na ficha e na lista de clientes) até o reajuste ser aplicado ou dispensado.
- Aplicar pede o percentual, obrigatório e com duas casas, e altera a mensalidade e o valor da hora das receitas futuras ainda previstas. 0,00% não altera.
- As parcelas não reajustam.

**Aditivo**
- Encerra o contrato e cria outro com os mesmos termos: cobranças, serviços, retenções, empenhos com o saldo atual, processo.
- O número do aditivo sobe 1, e o banco de horas recomeça no saldo inicial.
- O contrato novo gera a partir do mês de início do aditivo. O anterior tem as previstas desse mês em diante canceladas.
- Nenhum mês já faturado ou recebido pelo anterior é gerado de novo.

**Comissão e cliente na receita**
- **Representante:**
  - as receitas do contrato herdam o representante do contrato;
  - a comissão é gerada **quando a receita é marcada como recebida**, pela regra de comissão por categoria que já existe, com base no valor recebido;
  - a receita manual continua com a comissão no lançamento.
- **Cliente na receita:** ligada ao cadastro, mostra sempre o nome atual. Opcional.

**Exclusão de contrato**
- Só sem receita faturada ou recebida. Apaga as previstas dele.
- Com receita faturada ou recebida, só "Encerrar".

**Anexos**
- Só PDF, JPG e PNG, até 20 MB. Abrem para visualizar e **nunca** como página do sistema.
- Outros tipos e tamanhos são recusados.

**Painel e dados existentes**
- **Painel PJ:** a "Carteira de contratos" mostra a mensalidade (pelo líquido em órgão público) e a situação da receita do mês.
- **Dados existentes:** os 2 clientes viram "Empresa". Os 14 serviços vão para a conta PJ do titular, ou para todas, se houver mais de uma.

**Lista de clientes**
- **Valor mensal ativo:** soma das mensalidades dos contratos ativos.
- **"Contrato vencendo":** data final nos próximos 60 dias. Contrato sem prazo nunca vence.
- **"Receita atrasada":** receita do contrato prevista ou faturada, vencida e não recebida.
- **Topo:** recorrente do mês, contratos vencendo e valores atrasados, pelo líquido.

## Regras multi-tenant e segurança

- **Tenant = conta PJ.** Nunca vem do pedido sem validação:
  - toda rota usa `resolveCompanyAccount(requesterId, accountId)`: dono ou membro ativo da conta, e só PJ;
  - rota por id carrega o registro e confere a conta dele.
- **Sem acesso:** devolve **404 igual ao de "não encontrado"**, sem revelar que o registro existe em outra conta.
- **Joins:** toda consulta com junção (clientes × contratos × receitas × consumos × empenhos) filtra pela conta em todas as tabelas envolvidas.
  - Relatórios e carteira do painel nunca misturam contas.
  - O cliente escolhido numa receita precisa ser da conta da receita, e o tipo de hora precisa ser de contrato da mesma conta.
- **Permissões:** `requireCatalogAccess` na montagem, com as regras de lista do `catalogAccess`.
- **Anexos:**
  - o tipo é conferido pelo conteúdo, não pela extensão nem pelo tipo enviado;
  - o nome é gerado no servidor;
  - o caminho usa `path.basename`;
  - o arquivo é devolvido com o tipo conferido;
  - a tela abre o `blob` só com tipo PDF ou imagem.
- **Dados pessoais:** CPF, e-mail e telefone de clientes ficam só com a conta dona. Logs sem documento nem e-mail.
- **Mensagens de erro:** em português, sem dado de outra conta.

## Validações necessárias

- **Cliente:**
  - `type` ∈ {`individual`, `company`, `public_entity`};
  - `name` de 2 a 150 caracteres;
  - `document`: só dígitos, CPF (11) ou CNPJ (14) com dígitos verificadores, único na conta;
  - órgão público: `sphere` ∈ {municipal, estadual, federal} e `agency` de 2 a 150 caracteres;
  - contato: e-mail até 150, telefone com 10 ou 11 dígitos;
  - endereço: CEP de 8 dígitos e UF entre as 27.
- **Contrato:**
  - `clientId` da mesma conta e ativo;
  - `start` válido; `end` ≥ `start` ou nulo; `dueDay` de 1 a 28;
  - pelo menos uma cobrança;
  - mensalidade maior que zero;
  - parceladas: total maior que zero, `installments` ≥ 1 e `firstDate` válida;
  - tipos de hora: nome de 1 a 60 caracteres, único no contrato, valor e quantidade maiores que zero;
  - serviços do catálogo da conta;
  - órgão público:
    - retenções de 0 a 100 com duas casas;
    - empenhos com `year` único, `number` de 1 a 50 caracteres e `amount` maior que zero;
    - `process` e `modality` até 100 caracteres;
  - `representativeId` e categorias do catálogo da conta.
- **Aditivo:** `start` dentro ou depois da vigência do anterior, e mesmos campos do contrato.
- **Reajuste:** `action` ∈ {apply, dismiss}; `percent` obrigatório no "apply", com duas casas.
- **Receita com horas:** `hourTypeId` de contrato ativo da mesma conta; `hours` maior que zero e menor ou igual ao saldo.
- **Faturar:** só receita "prevista" de contrato da conta.
- **Anexo:** PDF, JPG ou PNG pelos primeiros bytes; até 20 MB.
- **Query strings:** `accountId`, `clientId`, `month` e `year` inteiros válidos.

## Testes necessários

### Frontend

- **`brazilDocuments.test.ts`:** máscaras e validação de CPF e CNPJ (válido, inválido, todos os dígitos iguais).
- **`contractDisplay.test.ts`:** "vence em N dias", alerta de 60 dias, receita atrasada, rótulos de estado, indicadores do topo.
- **`draftRules.test.ts`:**
  - horas por tipo com bloqueio acima do saldo;
  - prévia de bruto, retenções e líquido;
  - cliente por `id` no preenchimento a partir do contrato.
- **`screenAccess.test.ts`:**
  - "Clientes" visível com Clientes ou Serviços;
  - item "servicos" fora de Configurações;
  - conta pessoal sem o menu.

### Backend

- **`clientInput.test.ts`:** cada tipo, documento (CPF e CNPJ válidos e inválidos), esfera e órgão do órgão público, contato e endereço.
- **`contractInput.test.ts`:**
  - pelo menos uma cobrança;
  - valores maiores que zero;
  - parcelas e data;
  - tipos de hora únicos;
  - retenções de 0 a 100;
  - empenho com ano único;
  - `fim ≥ inicio`;
  - dia de 1 a 28.
- **`contractSchedule.test.ts`:**
  - 12 meses com data final e vencimento no dia 10;
  - "sem prazo" com 12 à frente do mês atual;
  - parcelas de R$ 1.000,00 em 3 (333,33 / 333,33 / 333,34);
  - meses bloqueados pulados;
  - aditivo começando no mês seguinte ao último recebido;
  - dia 28 em fevereiro.
- **`contractRetentions.test.ts`:**
  - R$ 4.500,00 com IR de 4,80% e ISS de 5,00%: retenções de R$ 441,00 e líquido de R$ 4.059,00;
  - campo vazio igual a zero;
  - arredondamento por tributo.
- **`contractReadjustment.test.ts`:**
  - aniversário disponível ou não;
  - aplicar 4,62% em R$ 4.500,00 resulta em R$ 4.707,90;
  - 0,00% não altera;
  - próximo ciclo depois de tratado.
- **`contractEmpenho.test.ts`:** saldo do ano; aviso sem empenho; aviso acima do saldo.
- **`incomeInput.test.ts`, atualizado:** `clientId` e `billableHours` com `hourTypeId`.
- **`incomeClassificationDefaults.test.ts`, atualizado:** "Projeto" entre as padrão de empresa.
- **Anexos:** conferência de tipo com bytes de PDF, PNG e JPEG válidos e com HTML disfarçado de `.pdf`.

### E2E

**Roteiro no banco local**, com o backend em outra porta, usuários de teste apagados no fim e todos os critérios de aceite:

- **Isolamento:**
  - titular com as PJs A e B; membro da A não vê nem altera nada da B, nem por id;
  - conta pessoal sem acesso;
  - membro só com "Serviços": vê só o catálogo;
  - membro sem "Contratos": vê o cliente, mas não os contratos.
- **Clientes:**
  - documento inválido ou repetido recusado;
  - órgão público sem esfera recusado;
  - renomear reflete nas receitas e nos relatórios;
  - excluir cliente com contrato negado e desativar permitido.
- **Contratos e receitas:**
  - 12 previstas no dia 10;
  - salvar de novo não duplica;
  - alterar preserva faturada e recebida;
  - "sem prazo" com 12 à frente;
  - sem cobrança é recusado;
  - encerrar cancela as futuras;
  - excluir com faturada é negado;
  - "Faturar" e "receber" mudam o estado.
- **Parcelas e horas:**
  - implantação de R$ 1.000,00 em 3;
  - horas: 40 → 35 → 40 ao cancelar a receita; bloqueio acima do saldo.
- **Órgão público, comissão e reajuste:**
  - retenções: bruto, retenções e líquido; recebido igual ao líquido; totais pelo líquido;
  - empenho: aviso ao faturar acima do saldo;
  - comissão só no recebimento da receita de contrato; receita manual igual a hoje;
  - reajuste de 4,62% nas futuras previstas;
  - aditivo sem mês repetido.
- **Anexos, painel e categorias:**
  - anexos: PDF aceito; `.html` e arquivo de 25 MB recusados;
  - carteira do painel;
  - categoria "Projeto";
  - categorias "em contrato ativo".
- **Migração:** a 0070 copiou o cliente local e os 3 serviços.

**Teste de tela no jsdom**, com rede simulada:
- lista e filtros;
- cadastro por tipo;
- contrato em etapas com prévia;
- "Faturar";
- reajuste;
- horas e retenções no lançamento de receita;
- recusa de anexo.

**Prints no Edge headless** (computador e celular) para a aprovação do passo 10.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit                      # frontend
npm test                              # frontend
npm run build                         # frontend (vite build + páginas públicas)

npm --prefix backend run build        # tsc --noEmit do backend
npm --prefix backend test

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0070 --banco local    # só com confirmação
```

## Riscos e pontos de atenção

- **Tamanho:** é a maior entrega até agora. Leva várias sessões; registrar no fim deste plano o andamento por etapa (o que foi feito e os commits).
- **Receitas, a tabela central:**
  - colunas novas e um índice único parcial;
  - em contrato público, `valor` passa a ser o líquido, com `valor_bruto` ao lado;
  - painel, relatórios e "a receber" precisam continuar certos, e o roteiro confere.
- **Comissão:** muda só para receita de contrato (no recebimento). A receita manual continua no lançamento, coberta pelo roteiro como regressão.
- **Janela entre a 0070 e o deploy:**
  - o código antigo ainda grava `receitas.contrato_id` apontando para a tabela antiga;
  - não há contratos, mas a 0070 aborta se encontrar algum vínculo, e o deploy vem logo depois.
- **"Sem prazo":** depende de alguém abrir o sistema ou da rotina interna, já que o Cron está desligado. Uma conta sem acesso por meses fica com menos de 12 previstas até o próximo acesso.
- **Visual sem protótipo:** os ajustes acontecem no código. O passo 10 é o portão de aprovação.
- **Demo do site:** a API falsa precisa das rotas novas, senão a demo quebra (critério de regressão).
- **Assistente:** usa clientes e horas; precisa acompanhar as rotas novas.
- **Anexos:** ficam no disco do Render. O deploy tira o backend do ar por cerca de 1 minuto.
- **Migrations:**
  - nunca editar as antigas;
  - a 0070 vai antes do deploy e a 0071 depois;
  - no modo automático, a escrita na produção pode ser bloqueada: o usuário sai do modo automático e aprova.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

Os textos literais (D31) são definidos na implementação e aprovados nos prints do passo 10.

## Critérios de aceite do plano

A implementação estará pronta quando:

**Isolamento e acesso**
- Um membro da PJ A não vê nem altera nada da PJ B, nem por link. Conta pessoal não vê o módulo nem o campo "Cliente".
- Quem tem só "Serviços" vê só o catálogo. Sem "Contratos", a página do cliente não mostra contratos.

**Clientes**
- Documento inválido ou repetido e órgão público sem esfera são recusados com a indicação do campo.
- Renomear o cliente atualiza receitas e relatórios.
- Cliente com contrato não é excluído, só desativado. O desativado não aparece para receita nova.

**Contratos e receitas**
- Um contrato com mensalidade de R$ 4.500,00, de 01/01/2027 a 31/12/2027, com vencimento no dia 10, gera 12 previstas no dia 10.
- Salvar de novo não duplica. Alterar a mensalidade preserva faturadas e recebidas.
- "Sem prazo" mostra 12 previstas à frente.
- Contrato sem cobrança é recusado. Encerrar cancela as futuras previstas.
- "Faturar" e o recebimento mudam o estado.
- Excluir contrato com receita faturada só permite "Encerrar".

**Cobranças**
- Implantação de R$ 1.000,00 em 3 gera 333,33 / 333,33 / 333,34, com a primeira na data informada.
- Horas: 40 h → lançar 5 h → 35 h → cancelar → 40 h. Lançar acima do saldo é bloqueado, informando as horas restantes.

**Órgão público**
- Mensalidade de R$ 4.500,00 com IR de 4,80% e ISS de 5,00%: bruto R$ 4.500,00, retenções R$ 441,00, líquido R$ 4.059,00; o recebido é R$ 4.059,00.
- Faturar acima do saldo do empenho mostra "Empenho sem saldo suficiente" e fatura.

**Reajuste, aditivo e comissão**
- Reajuste de 4,62% leva as futuras previstas de R$ 4.500,00 para R$ 4.707,90 e o aviso some.
- Aditivo começando em fevereiro, com janeiro e fevereiro recebidos, gera a partir de março; o anterior fica encerrado.
- A comissão da receita de contrato sai no recebimento, não antes. A receita manual mantém a comissão no lançamento.

**Anexos e painel**
- PDF abre para visualizar. `.html` e arquivos de 25 MB são recusados. Nenhum anexo abre como página do sistema.
- A carteira do Painel PJ mostra a mensalidade e a situação da receita do mês.

**Falhas e regressão**
- Numa falha ao salvar, a mensagem aparece, os campos ficam preenchidos e nada é gravado.
- A demo do site abre. Receita sem cliente funciona como hoje.

**Técnica**
- `tsc`, testes e build passam no front e no back.
- O roteiro local e o teste de tela ficam registrados neste plano.
- Os prints são aprovados pelo usuário.
- A 0070 e a 0071 são aplicadas na produção na ordem certa, com confirmação.
- Não sobra código, tabela ou dica do módulo antigo.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal e seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch:** `feat/R/clientes-contratos`, a partir da `main` atualizada. Um commit por etapa da estratégia.
- **Redesenho:** **primeiro sai o código antigo** (passo 3), em etapa própria, e depois entra o novo. Nada de código antigo convivendo com o novo.
- **Migrations:**
  - Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
  - Uma por vez. No local, a 0070 no passo 2. Na produção, a 0070 antes do merge e a 0071 depois do deploy, fora do modo automático.
- **Código:**
  - identificadores, rotas e campos de pedido e resposta em inglês; tabelas, colunas e textos de tela em português;
  - Drizzle em toda query nova (SQL cru só com motivo claro e parametrizado);
  - nada de `any`;
  - regras puras em arquivos próprios, com teste.
- **Não alterar:** `.env`, regras de comissão da receita manual, produtos e vitrine, planos e assinatura.
- **Arquivos temporários:** scripts de roteiro e de tela em `tmpclaude-*`, ignorados pelo git e apagados no fim. Imports estáticos nos testes de tela (uma só cópia do `react-router`).
- **Aprovação visual:** o passo 10 é obrigatório antes do `/finalizar`. Mostrar os prints e esperar a aprovação.
- **Várias sessões:** registrar no fim deste plano, a cada etapa concluída, o que foi feito, os commits e os desvios.

## Registro de andamento

### Etapas 1 e 2 — branch, conferência na produção e banco (commit `a78cebdc`)

- Branch `feat/R/clientes-contratos` criada da `main` (`2afc51ce`).
- **Produção, só lendo (2026-10-04):**
  - os 2 clientes têm CNPJ com dígito verificador errado. O que está numa conta PJ é copiado pela 0070 e vai pedir a correção do CNPJ na próxima edição. O outro está na conta pessoal de um dono sem PJ: **não é copiado**;
  - dos 14 serviços, 11 vão para as contas PJ dos donos. Os 3 de um dono sem PJ **não são copiados**;
  - a 0071 apaga as tabelas antigas, e com elas esses dados. Avisar o usuário no `/finalizar`, antes da 0071.
- Escritos: a 0070, a 0071, o schema do Drizzle (`modules/contracts/db/schema.ts`), `services/contractTypes.ts` e as colunas novas de `receitas` no Drizzle.

### Etapa 3 — remoção do antigo (commit `d73688dd`)

- Saíram as 5 rotas antigas, as 3 telas, `servicosService.ts`, as dicas `clientes:*` e `servicosNovo`, o item "Catálogo de serviços" e as chaves `contratos`, `servicos`, `contratosServicos` e `contratoAnexos`.
- Testes: front 106/106 e back 280/280; `tsc` sem erros nos dois.

### Etapa 4 — regras puras com testes

- Arquivos:
  - `clientInput.ts`: cadastro, situação e filtros da lista;
  - `contractInput.ts`: contrato, aditivo (início), reajuste e serviço do catálogo;
  - `contractSchedule.ts`, `contractRetentions.ts`, `contractReadjustment.ts` e `contractCommitments.ts`;
  - cada um com o seu teste.
- Testes do back: 324/324; `tsc` sem erros.
- **Agenda das receitas, como ficou:**
  - mensalidade: uma por mês do calendário da vigência, no dia do vencimento (o mês do início conta mesmo que o início seja depois do dia);
  - "sem prazo": até o 12º mês contado do mês atual, ou do início, quando o contrato ainda não começou;
  - parcelas: partes iguais com os centavos na última, todas no dia da primeira data (dia 31 vira o último dia dos meses curtos);
  - cada cobrança tem o seu limite:
    - alteração: a partir do mês atual nas cobranças que já existiam e sem limite nas novas, pulando os meses que têm receita mantida;
    - aditivo: a partir do mês de início, pulando os meses já faturados ou recebidos pelo anterior;
    - complemento do "sem prazo": a partir do mês seguinte ao último existente.
- **Retenções:** a receita guarda bruto e retenções só quando algum percentual do contrato é maior que zero.
- **Reajuste:**
  - aplicar ou dispensar grava o aniversário mais recente já alcançado, o que fecha de uma vez os ciclos atrasados;
  - percentual de 0 a 100, com duas casas.

### Desvios do plano até aqui

1. **Valores fixos da API:** iguais aos do banco, em português, como os status das receitas:
   - tipo: `pessoa_fisica`, `empresa`, `orgao_publico` (no lugar de `individual`, `company`, `public_entity`);
   - cobrança: `mensalidade`, `implantacao`, `projeto`;
   - contrato: `ativo`, `encerrado`.
   
   Os nomes dos campos continuam em inglês (`type`, `document`, `sphere`, `agency`…).
2. **Nome do módulo do empenho:** `contractCommitments.ts`, em inglês, no lugar de `contractEmpenho.ts`.
3. **Remoção parcial na etapa 3:** as telas que dependem do módulo (lançamento de receita, painel, assistente, checklist, demo) continuam chamando as rotas antigas por um `clientesService.ts` reduzido até a etapa 8. A seção "Clientes" mostra um aviso temporário ("Clientes em reconstrução").
4. **Campo `client` do Drizzle de `receitas`:** sai nesta entrega (etapa 6), porque a 0071 apaga a coluna.
5. **Auxiliares de leitura compartilhados:** `digitsOf`, `readRequiredText`, `EMAIL_PATTERN` e `BRAZIL_STATES` saíram de `orderInput.ts` para `utils/requestInput.ts`, para os validadores novos usarem.
6. **0070 no banco local:** adiada para a etapa 9, com confirmação. Nenhuma etapa antes dela usa o banco.

### Etapa 5 — backend do módulo

- **Serviços** (`backend/src/services/`):
  - `clients.ts`: lista com os indicadores dos contratos (só para quem tem "Contratos"), resumo do topo, cadastro, desativar e reativar, exclusão sem vínculos, receitas do cliente (com a regra de visibilidade da família) e troca do nome nas previstas de contrato ao renomear;
  - `serviceCatalog.ts`: lista com a contagem de contratos, cadastro, renomear, desativar e reativar;
  - `contracts.ts`: prévia, criar, alterar, encerrar, excluir, aditivo, reajuste e "Faturar";
  - `contractIncomes.ts`: receitas da agenda, plano da alteração e do aditivo, cancelamento das previstas e complemento do "sem prazo";
  - `contractViews.ts`: ficha, contratos do cliente, carteira do painel e contratos com horas;
  - `contractIndicators.ts`, `contractHours.ts` e `contractAttachments.ts`;
  - regras puras novas, com teste: `contractAlerts.ts` (vencendo e atrasada) e `contractAttachmentType.ts` (tipo pelo conteúdo);
  - `incomeClassificationCatalog.ts`: `ensureContractIncomeClassification`, que cria "Contratos › Mensalidade/Implantação/Projeto" se faltar;
  - `incomeClassificationDefaults.ts`: "Projeto" nas padrão de empresa (adiantado da etapa 6, porque o gerador de receitas precisa) e a função morta `canChangeContractSetupClassification` removida.
- **Rotas:** `modules/contracts/routes/{clients,serviceCatalog,contracts,attachments,index}.ts`, montadas em `/api/clients`, `/api/contracts` e `/api/service-catalog`; `catalogAccess`: a lista aberta de contratos é só `/with-hours`.
- Testes do back: 332/332; `tsc` sem erros.
- **Regras decididas na implementação:**
  - **Autor das receitas geradas:** o dono da conta (titular), como o catálogo da conta.
  - **Alteração:** refaz a partir do mês atual em todas as cobranças, inclusive nas acrescentadas agora. Canceladas também travam o mês: o mês cancelado não volta.
  - **Cobrança que sai do contrato:** só sem receita faturada, recebida ou de mês anterior; senão, a mensagem indica o aditivo.
  - **Tipo de hora:** com horas lançadas não sai, e a quantidade não fica abaixo do já lançado.
  - **Encerrar:** cancela as previstas a partir do mês seguinte; a do mês atual fica (menos perda que cancelar um mês já trabalhado).
  - **Excluir contrato:** cancela as previstas (desfaz a comissão de alguma receita de horas) e apaga as receitas restantes, os anexos e o contrato.
  - **Aditivo:** com a mesma data-base, o ciclo de reajuste já tratado continua tratado.
  - **Reajuste:** atualiza a mensalidade, o valor da hora e as mensalidades previstas a partir do mês atual.
  - **Contrato encerrado:** não é alterado, não recebe aditivo nem reajuste; anexos continuam.

### Etapa 6 — integrações no backend

- **Lançamento de receita** (`incomeInput.ts`, `incomeService.ts`, `routes/incomes.ts`):
  - `client` (texto) virou `clientId`, conferido no cadastro da conta da receita (ativo; o que a receita já tinha continua valendo);
  - `billableHours` virou `{ hourTypeId, hours }`: grava em `comercial.consumos_hora` na transação da receita, com o tipo de hora travado e o bloqueio acima do saldo; a receita aponta para o contrato e o cliente dele;
  - horas de contrato com órgão público: o valor digitado é o bruto e a receita vale o líquido;
  - edição de receita com bruto: o valor editado é o bruto, com as retenções recalculadas; na receita de contrato, o cliente não muda;
  - `debitContractHours` saiu;
  - sugestões e duplicata usam `clientId` (as sugestões trazem também o nome atual);
  - a lista (`GET /incomes`) devolve `cliente_nome`, pelo cadastro.
- **Recebimento** (`/receber`): a regra saiu da rota para `receiveIncome`, numa transação, com o mesmo pedido de antes. A receita de contrato com representante e sem comissão gera a comissão pelo valor recebido.
- **"Sem prazo":** `/fixas/processar` (ao abrir o sistema) e a rotina diária (`internal-jobs`, a mesma do alerta de despesas) chamam `topUpOpenEndedContracts`.
- **Relatórios:** o nome do cliente vem do cadastro (`LEFT JOIN comercial.clientes`, filtrando pela conta).
- **Categorias** (`income-classifications.ts`): "em contrato ativo" e a contagem de uso olham as três categorias de `comercial.contratos`.
- **Contrato:** grava a categoria padrão resolvida quando a da cobrança fica vazia (como o módulo antigo fazia).
- Testes do back: 333/333; `tsc` sem erros.
- **Desvios desta etapa:**
  1. **Vitrine:** a venda paga gravava o nome do comprador em `receitas.cliente`, coluna que a 0071 apaga. O nome passa para a observação da receita ("Comprador: …"), que a lista de lançamentos já mostra embaixo da descrição. A coluna "Pagamento" deixa de mostrar o comprador. O plano não tinha previsto esse uso da coluna.
  2. **Comissão "única" na receita de contrato:** sai uma vez por contrato e categoria, na primeira receita recebida.
  3. **Horas de contrato público com representante (comissão no lançamento):** a base passa a ser o líquido.

### Etapa 7 — telas novas

- **`src/screens/clients/`:**
  - `ClientsScreen.tsx`: seção "Clientes", com as abas "Clientes" e "Catálogo de serviços" (cada uma pela sua permissão); indicadores do topo, busca, filtro por tipo, "desativados" e "Novo cliente";
  - `ClientFormDialog.tsx`: o tipo define os campos; máscaras, conferência de CPF e CNPJ, CEP que preenche o endereço (ViaCEP, como no checkout), "Desativar", "Reativar" e "Excluir";
  - `ClientPage.tsx`: cabeçalho e as abas "Contratos", "Receitas" e "Dados";
  - `ContractWizard.tsx` e `ContractWizardSteps.tsx`: contrato em etapas (novo, alteração e aditivo) com a prévia do servidor;
  - `ContractDetail.tsx`: ficha com reajuste ("Aplicar"/"Dispensar"), empenhos, horas, receitas com "Faturar" e anexos;
  - `ServiceCatalog.tsx`, `ContractAttachments.tsx` e `clientStyles.ts`.
- **Serviços e chaves:** `clientsService.ts`, `contractsService.ts`, `serviceCatalogService.ts` e as chaves novas em `queryKeys.ts`; contrato e cliente gravados usam `invalidateIncomeQueries`, que passou a incluir as chaves do módulo.
- **Utilitários com teste:**
  - `brazilDocuments.ts`: CPF, CNPJ, telefone, CEP e UFs. `companyAccount.ts` deixou de ter o CNPJ (a conta e o login importam daqui); `storefrontCheckout.ts` reexporta para as telas da vitrine não mudarem; `document.ts` usa as máscaras daqui;
  - `contractDisplay.ts`;
  - `contractForm.ts` (novo, fora da lista do plano): o estado das etapas, a conferência de cada etapa e o corpo da API, com as regras do servidor.
- **`App.tsx`:** a seção `clientes` mostra a `ClientsScreen` dentro de `CONFIG_SCOPE_CLASS`.
- **Limpeza:** saíram de `dialogFormTokens.tsx` os estilos da tabela de valores do contrato antigo, que ficaram sem uso.
- **Anexos escolhidos no contrato em etapas** sobem logo depois de salvar. Se algum falhar, a ficha avisa quais.
- Testes do front: 120/120; `tsc` sem erros.

### Etapa 8 — integrações no front

- **Lançamento de receita** (`income-dialog/`):
  - cliente pelo id (`clientId`), com o nome atual; na edição, um cliente desativado continua aparecendo pelo nome;
  - "+ cadastrar" abre o cadastro completo por cima do modal de receita, com o nome já digitado. O Esc fecha só o cadastro;
  - horas: contrato → tipo de hora (nome, valor, saldo) → quantidade, com aviso e bloqueio acima do saldo;
  - contrato com órgão público: o valor digitado é o bruto; a prévia mostra o líquido e as retenções, e a comissão sai do líquido;
  - as horas trazem o cliente do contrato; cliente diferente do contrato é recusado ("use o cliente do contrato das horas");
  - editar receita com retenção abre com o bruto.
- **Lista de lançamentos e cartão da receita:** nome do cliente pelo cadastro (`cliente_nome`).
- **Painel PJ:** a carteira usa `/contracts/portfolio`, pelo líquido, só para quem vê contratos.
- **Assistente:** cliente pelo id e horas por tipo de hora, com o aviso de saldo e de retenções.
- **Checklist:** conta os clientes da lista nova.
- **Menu:** "Clientes" aparece com a permissão de Clientes ou a de Serviços (teste atualizado).
- **Demo:** as rotas novas devolvem listas vazias; as receitas da demo usam `cliente_id`.
- **Limpeza:** saiu `clientesService.ts`, as chaves `clientes`, `contratosAtivos` e `contratosStatusFaturamento` e `getContratosFaturamento`.
- Testes do front: 121/121; `tsc` e build sem erros.

### Etapa 9 — validação

- **Teste de tela no jsdom** (rede simulada, arquivos `tmpclaude-*`): 15/15.
  - Cobre: lista, busca e filtro por tipo; cadastro por tipo, com erros no campo, documento repetido e envio só com dígitos; contrato em etapas com a prévia do servidor e a gravação; ficha com retenções, empenho e banco de horas; "Faturar" com o aviso do empenho; reajuste com a prévia (R$ 4.500,00 → R$ 4.707,90); anexo HTML recusado e PDF enviado; horas de contrato público no lançamento de receita (líquido, cliente do contrato, bloqueio acima do saldo e o corpo gravado).
  - **Defeitos achados e corrigidos:**
    1. enquanto as permissões carregavam, a seção começava na aba do catálogo e ficava presa nela. Agora começa em "Clientes" e só aparece com as permissões carregadas;
    2. os campos com erro trocavam só a cor da borda, e o React avisava ao limpar o erro. Agora trocam a borda inteira (`inputStyle` em `clientStyles.ts`).
- **Banco local** (com a confirmação do usuário em 2026-10-05):
  - 0070 aplicada. Cópia conferida: o cliente antigo (conta pessoal 17) foi para a PJ 18 do dono; os 3 serviços também; "Projeto" entrou sob "Contratos"; `receitas.contrato_id` aponta para `comercial.contratos`;
  - depois do roteiro, 0071 aplicada: saíram as tabelas antigas e `receitas.cliente`. Nenhuma migration pendente no local.
- **Roteiro de ponta a ponta** (backend na porta 3016 com o banco local; usuários `*@roteiro-clientes.test` apagados no fim): **39/39**, antes e depois da 0071, sem erro no log do servidor.
  - Cobre todos os critérios de aceite: isolamento entre PJs (também pelo id), conta pessoal, só "Serviços", sem "Contratos"; documento inválido, repetido e órgão público sem esfera; 12 previstas no dia 10; salvar de novo sem duplicar; alterar preservando faturada e recebida; "sem prazo" com 12 à frente e o complemento ao abrir o sistema; encerrar; excluir com e sem faturada; implantação 333,33/333,33/333,34; projeto em "Contratos › Projeto"; horas 40 → 35 → 40 e o bloqueio; retenções (bruto 4.500,00, retenções 441,00, líquido 4.059,00, recebido 4.059,00); aviso do empenho; comissão só no recebimento e a manual no lançamento; reajuste 4,62% (4.707,90) e 0,00%; aditivo a partir de março; renomear refletindo nas receitas e no relatório; desativar e excluir; anexos (PDF aceito e devolvido como PDF, HTML disfarçado e 25 MB recusados, arquivo apagado ao remover); carteira do painel; resumo do topo; "em contrato ativo"; falha ao salvar sem gravar nada; receita sem cliente.
- **Verificações finais:** back `tsc` e 333/333; front `tsc`, 121/121 e build.

### Etapa 10 — aprovação visual

- **Prints** (HTML do jsdom com o CSS do build, abertos no Edge; celular = quadro de 390 px): 16 no computador e 10 no celular. Cobrem lista, os três cadastros (órgão público com erros), catálogo, as três abas do cliente, as cinco etapas do contrato, a ficha, o reajuste e o lançamento de receita com horas e retenções.
- **Defeitos achados nos prints e corrigidos:**
  1. no celular, a lista de clientes e a ficha do contrato ficavam mais largas que a tela: a coluna das páginas crescia com os textos cortados por reticências. Agora a coluna é `minmax(0, 1fr)` (`stackStyle` em `clientStyles.ts`), e a seta da linha do cliente fica sempre na ponta (commit `2af41f5d`);
  2. o ícone do período do contrato saía numa linha própria, porque o reset do Tailwind deixa o `svg` em bloco (commit `6f6b9491`);
  3. na prévia do contrato, no celular, os valores só apareciam rolando para o lado. Agora o vencimento fica embaixo da descrição (commit `43b153d2`).
- **Ajuste de leitura:** a aba "Dados" do cliente em duas colunas no computador (commit `2af41f5d`).
- Aprovado pelo usuário em 2026-10-05, ao seguir para o `/finalizar`.
- Testes do front: 121/121 e 15/15 de tela; `tsc` e build sem erros.

### Etapa 11 — `/finalizar`

- Checks antes do push: front `tsc`, 121/121 e build; back `tsc` e 333/333.
- Migrations: local sem pendências; produção com 0070 e 0071 pendentes.
- **Produção (2026-10-05):**
  - **0070** aplicada fora do modo automático, com a confirmação do usuário. Conferência só lendo:
    - as 9 tabelas do schema `comercial` existem;
    - 1 dos 2 clientes e 11 dos 14 serviços foram copiados, para a PJ 19;
    - "Projeto" ficou sob "Contratos" (dono 16);
    - `receitas.contrato_id` aponta para `comercial.contratos`.
  - **Merge** na `main` em `7992eebc`, com o deploy conferido:
    - o backend novo entrou em cerca de 83 s (sem login, `/api/clients` passou de 404 para 401 e `/api/clientes` de 401 para 404);
    - o front publicado tem as rotas novas.
  - **0071 não aplicada.** O usuário decidiu deixar para depois ("está funcional, ainda vou melhorar").
    - Ela apaga as tabelas antigas (com dados só em `clientes`, 2, e `servicos`, 14) e `receitas.cliente` (vazia em todas as receitas).
    - Perdem-se 1 cliente (conta pessoal) e 3 serviços de donos sem PJ, que não foram copiados.
    - Enquanto ela estiver pendente, nenhuma migration a partir da 0072 pode ser aplicada na produção.
