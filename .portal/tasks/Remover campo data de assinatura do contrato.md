# Task: Remover campo data de assinatura do contrato

## Contexto

O contrato (entidade `Contrato`, tabela `contratos`) possui um campo `data_assinatura`, presente no frontend (`ContratoForm` e `AditivoModal`, em `src/screens/config/ClienteDetail.tsx`), no tipo TypeScript `Contrato`/`AditivoContratoValues` (`src/services/clientesService.ts`) e nas rotas de contrato no backend (`backend/src/routes/contracts.ts`).

Investigação já realizada nesta sessão de análise:

- `data_assinatura` aparece em `backend/src/routes/contracts.ts` nas rotas de criar/editar contrato (INSERT/UPDATE, linhas ~207-304) e na rota de registrar aditivo (linhas ~414-465, como `nova_data_assinatura`).
- Uso funcional real encontrado: na rota que gera a receita de implantação (por volta da linha 672 de `contracts.ts`), `data_assinatura` é o primeiro fallback para decidir a data de referência da receita: `const dataRef = ct.data_assinatura ?? ct.data_inicio_faturamento ?? getTodayIsoInTimezone();`. Esse é o único ponto do código onde o valor de `data_assinatura` influencia um cálculo, além de ser apenas exibido/armazenado.
- Um plano anterior (`.plans/valor-total-contrato-derivado.md`, 2026-07-05) mostra que em algum momento o total do contrato foi derivado de um "período em meses" calculado a partir de `data_assinatura` até `vencimento` — essa lógica **não existe mais** no código atual (o cálculo atual usa `* 12` fixo), confirmando que essa dependência já foi removida antes desta task.
- Não foi encontrada nenhuma migration/schema Drizzle dedicado para a tabela `contratos` durante a investigação (as rotas usam SQL raw via `pool.query`, não Drizzle, nesta parte do backend) — a definição exata da coluna no banco (tipo, nullable, default) precisa ser confirmada durante o planejamento, inspecionando a migration real que criou a tabela `contratos`.

## Problema

O usuário decidiu que o campo "data de assinatura" não deve mais existir no sistema — nem como campo de formulário, nem como coluna no banco. Mantê-lo como campo morto (visível mas sem uso real) ou como coluna órfã no banco (sem uso no código) é dívida técnica desnecessária depois da decisão de remoção.

## Objetivo

Remover completamente o campo `data_assinatura` do fluxo de contrato: campo de formulário no frontend (`ContratoForm`, `AditivoModal`), tipo TypeScript, payloads de API, colunas em queries do backend, e a coluna correspondente na tabela `contratos` do banco de dados.

## Decisão Técnica Desejada

- O fallback de data de referência para a receita de implantação (`ct.data_assinatura ?? ct.data_inicio_faturamento ?? getTodayIsoInTimezone()`) passa a ser apenas `ct.data_inicio_faturamento ?? getTodayIsoInTimezone()`, já que `data_assinatura` deixa de existir.
- A remoção da coluna no banco é uma migration destrutiva (drop column) e **não deve ser executada sem confirmação explícita do usuário a cada vez** — o ambiente atual pode estar apontando para produção.

## Escopo Funcional

### Dentro do escopo

- Remover o campo "Assinatura" do `ContratoForm` (grid de identificação, modo edição e modo leitura).
- Remover o campo "Nova assinatura" do `AditivoModal`.
- Remover `data_assinatura` do tipo `Contrato` e `nova_data_assinatura` do tipo `AditivoContratoValues` em `src/services/clientesService.ts`.
- Remover `data_assinatura`/`nova_data_assinatura` das queries de INSERT/UPDATE em `backend/src/routes/contracts.ts` (criar contrato, editar contrato, registrar aditivo).
- Ajustar o fallback de data de referência da receita de implantação para não depender mais de `data_assinatura`.
- Avaliar (e remover, se confirmado) a coluna `data_assinatura` na tabela `contratos` via migration, com confirmação explícita do usuário antes de executar.

### Fora do escopo inicial

- Qualquer mudança na lógica de cálculo de total do contrato ou período (já não depende de `data_assinatura` hoje).
- Mudanças na tabela de Valores do modal de contrato ou em outros campos do formulário — tratadas na task separada `Redesign estrutural do modal de contrato`.
- Migração/preservação de dados históricos de `data_assinatura` para outro campo (ex. Observações) — só deve ser feita se o usuário confirmar explicitamente que quer preservar esse dado antes do drop da coluna.

## Requisitos de Frontend

- Remover o bloco de campo "Assinatura" em `ContratoForm` (`src/screens/config/ClienteDetail.tsx`), tanto no formulário editável quanto no modo leitura, incluindo o `useState` do form (`data_assinatura`) e o objeto enviado em `onSave`.
- Remover o campo "Nova assinatura" em `AditivoModal`, incluindo o `useState` do form (`nova_data_assinatura`) e o objeto enviado em `onSave`.
- Ajustar o grid de campos de `ContratoForm` (hoje 5 colunas: Número, Descrição, Assinatura, Vencimento, Início fatur.) para 4 colunas após a remoção, redistribuindo a largura.
- Remover `data_assinatura` de `Contrato` e `nova_data_assinatura` de `AditivoContratoValues` em `src/services/clientesService.ts`.

## Requisitos de Backend

- Remover `data_assinatura`/`nova_data_assinatura` de todas as queries SQL em `backend/src/routes/contracts.ts` que fazem INSERT/UPDATE na tabela `contratos` (criar contrato, editar contrato, registrar aditivo).
- Ajustar a linha `const dataRef = ct.data_assinatura ?? ct.data_inicio_faturamento ?? getTodayIsoInTimezone();` para remover a referência a `data_assinatura`.
- Remover `data_assinatura` do tipo inline usado para ler o resultado da query de contrato (linha ~647 de `contracts.ts`, `data_assinatura: string | null`).
- Confirmar se `data_assinatura`/`nova_data_assinatura` aparece em outras rotas do backend além de `contracts.ts` (ex. relatórios, exports) durante o planejamento, já que a investigação desta task cobriu apenas o arquivo de rotas de contrato.

## Requisitos de Banco de Dados

- Coluna `data_assinatura` na tabela `contratos` deve ser removida via migration (`ALTER TABLE contratos DROP COLUMN data_assinatura`), **somente após confirmação explícita do usuário**, dado que o ambiente pode estar apontando para produção e a operação é destrutiva/irreversível para dados já preenchidos.
- Antes de propor a migration, a skill `planejar` deve localizar e inspecionar a migration original que criou a coluna `data_assinatura` na tabela `contratos`, para confirmar tipo, nullability e se há índice ou constraint dependente dela.
- Avaliar se existem contratos em produção com essa data preenchida — se o usuário quiser, considerar preservar o dado em `observacoes` antes do drop, como registro histórico (decisão do usuário, não assumir).

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant no sentido de múltiplas organizações isoladas; sem isolamento de tenant a considerar. Nenhuma mudança de permissão/autorização é esperada — a remoção do campo não expõe nem restringe dados de forma diferente do atual.

## Requisitos de Migração ou Compatibilidade

- Remover `data_assinatura` dos payloads de API é uma mudança de contrato — confirmar que nenhum outro consumidor do backend (além do frontend deste projeto) depende desse campo antes de remover das rotas.
- A remoção da coluna do banco é irreversível sem restaurar de um backup — o usuário deve confirmar explicitamente antes da execução da migration, ciente de que dados já preenchidos em `data_assinatura` seriam perdidos permanentemente, salvo decisão de preservá-los em outro campo antes do drop.
- Nomenclatura nova de código deve seguir inglês; código em português já existente é tratado como legado (não é necessário renomear campos vizinhos que não fazem parte desta remoção).

## Requisitos de Testes

### Frontend

- Testar manualmente (via `/run`): criar contrato, editar contrato, registrar aditivo — confirmar que o campo "Assinatura"/"Nova assinatura" não aparece mais em nenhum dos formulários, e que salvar continua funcionando sem erros de payload.

### Backend

- Testar que criar/editar contrato e registrar aditivo continuam funcionando sem `data_assinatura` no payload.
- Testar que a rota de receita de implantação (`criarReceitaImplantacao`) continua gerando a data de referência corretamente usando `data_inicio_faturamento` como fallback.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/config/ClienteDetail.tsx` (`ContratoForm`, `AditivoModal`)
- `src/services/clientesService.ts` (tipos `Contrato`, `AditivoContratoValues`)

### Backend

- `backend/src/routes/contracts.ts`
- Outras rotas que leiam `data_assinatura` — a identificar durante o planejamento.

### Banco de Dados

- Migration de `ALTER TABLE contratos DROP COLUMN data_assinatura` — migration exata a ser escrita durante o planejamento, localizando primeiro a migration original de criação da coluna.

## Critérios de Aceite

- Campo "Assinatura"/"Nova assinatura" não aparece mais em `ContratoForm` nem em `AditivoModal`, em nenhum modo (edição/leitura).
- Tipo `Contrato` e `AditivoContratoValues` não possuem mais `data_assinatura`/`nova_data_assinatura`.
- Rotas de criar/editar contrato e registrar aditivo no backend não referenciam mais `data_assinatura`.
- Receita de implantação continua sendo gerada corretamente usando `data_inicio_faturamento` como fallback (sem `data_assinatura`).
- Migration de remoção da coluna só é executada após confirmação explícita do usuário, com o usuário ciente do caráter destrutivo/irreversível da operação.
- `npm run build` (frontend) e o build do backend concluem sem erros.

## Perguntas Para o Planejamento

- Existem contratos em produção com `data_assinatura` preenchida hoje? Se sim, o usuário quer preservar esse dado em algum lugar (ex. Observações) antes do drop da coluna, ou aceita a perda permanente?
- Existe alguma rota de relatório, export ou PDF que leia `data_assinatura` além das rotas de CRUD de contrato já identificadas?
- A migration de drop da coluna deve ser feita na mesma entrega desta task, ou o usuário prefere primeiro parar de gravar/ler o campo no código (feito nesta task) e só depois, em confirmação separada, remover a coluna do banco?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz) e `sistema financas/AGENT.md`.
- Inspecione `src/screens/config/ClienteDetail.tsx`, `src/services/clientesService.ts` e `backend/src/routes/contracts.ts` (especialmente o trecho por volta da linha 672 com o fallback de `dataRef`) antes de escrever o plano.
- Localize a migration original de criação da coluna `data_assinatura` na tabela `contratos` antes de propor a migration de remoção.
- Classifique a implementação como `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations — apenas descreva a migration necessária no plano.
- Considere separar em duas fases claras no plano: (1) parar de ler/gravar o campo no código, (2) remover a coluna do banco — permitindo ao usuário aprovar cada fase de forma independente.
- Gere um plano em `.plans/` com etapas pequenas, revisáveis e seguras para produção.
