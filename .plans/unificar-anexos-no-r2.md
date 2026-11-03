# Plano de Implementação: Unificar todos os anexos no R2 (sistema único de arquivos)

## Origem

- Arquivo de especificação: `.portal/tasks/unificar-anexos-no-r2.md`
- Data do planejamento: 2026-11-03
- Classificação: `frontend + backend + database` (com impacto em infra/deploy: o disco persistente do Render deixa de ser necessário)
- Aprovação: opção 1 ("Aprovar e salvar") do usuário em 03/11/2026, depois de responder as 6 decisões pendentes. A implementação só começa com `/implementar`, uma etapa por vez.

Motivo da classificação: o plano muda as 4 telas de anexo, as rotas e os serviços do backend e o esquema do banco (tabela nova; colunas e tabelas antigas saem). Também muda a infraestrutura, porque todo arquivo persistente passa a viver no R2.

## Resumo

Hoje há três métodos de anexo, cada um com seu próprio jeito:

| Onde | Como é guardado hoje | Problema |
|---|---|---|
| Despesas e receitas | base64 dentro do Postgres (`anexos` jsonb) | Vai junto em toda lista (saída cobrada a US$ 0,15/GB). Validado só no frontend. |
| Contratos | disco do Render (`uploads/contratos`) + `comercial.anexos` | Prende o backend ao disco. |
| Imagens do catálogo | disco do Render (`uploads/catalogo`) + `catalogo.produto_imagens` | Prende o backend ao disco. |

Passa a existir um só: tabela `anexos` (metadados), arquivo no R2, um serviço de arquivos no backend e um componente de anexos no frontend. Cada etapa apaga o método antigo que substituiu (sem sobreposição).

Ganhos:

- O backend fica sem disco, o que permite testar o plano gratuito do Render. A economia é de até ~US$ 7,23/mês (backend Starter com 1 GB de disco) e só vale se o teste da etapa D passar.
- Sai o base64 do banco e das listas (menos banda de saída cobrada, banco menor, listas mais leves).
- O download vai direto do R2, que tem saída gratuita.
- Todo anexo passa a ser validado por conteúdo no backend.
- Custo novo no R2: praticamente zero. O bucket tem 10 GB gratuitos (divididos com as Licitações); acima disso custa US$ 0,015/GB.

Riscos principais: reescrever dados financeiros reais, esquecer um endpoint de lista, descompasso de poucos minutos entre o deploy do front e o do back, comportamento do link assinado no R2 e hibernação do plano gratuito.

## Decisões aplicadas

- **Decisão 1:** tabela única `anexos`, com uma chave estrangeira opcional por tipo de dono (despesa, receita, contrato, produto), exclusão em cascata e no máximo um dono. Uploads sem dono ficam pendentes e são varridos depois de um prazo.
- **Decisão 2:** upload imediato (multipart). O lançamento envia só ids e o backend vincula na mesma transação, mantendo a regra de linha de hoje. O PUT envia a lista final e o backend compara.
- **Decisão 3:** links assinados curtos (~2 min) do R2 para anexos privados. As imagens públicas do catálogo continuam pelo backend, com cache imutável.
- **Decisão 4:** regras por tipo de dono mantidas como hoje, todas validadas no backend por conteúdo. Só PDF e imagens abrem no navegador; o resto sempre baixa.
- **Decisão 5:** etapas A (fundação), B (contratos e imagens), C (lançamentos) e D (Render), cada uma em branch própria. O método antigo é apagado ao fim da etapa correspondente.
- **Decisão 6:** troca das rotas de uma vez por etapa, sem adaptador de compatibilidade. Aceito um descompasso de poucos minutos entre os deploys de front e back.

## Escopo

### Dentro do escopo

- Tabela única `anexos` (uma FK opcional por tipo de dono: despesa, receita, contrato, produto; exclusão em cascata; no máximo um dono) e serviço único de arquivos no R2.
- Links assinados curtos para anexos privados. As imagens públicas do catálogo continuam passando pelo backend.
- Migração dos anexos existentes: jsonb para o R2 (com backup do JSON original) e disco para o R2, com dry-run e verificação.
- Componente único de anexos no frontend para os 4 tipos de dono, incluindo o assistente financeiro e o modo demo.
- Remoção dos métodos antigos ao fim de cada etapa: colunas jsonb, tabelas e rotas antigas, `uploads/*` e componentes antigos.
- Remoção dos objetos no R2 sempre que o dono for apagado (lançamento, contrato, produto, usuário/conta, "limpar dados financeiros") e varredura de uploads pendentes.
- Preparar e validar o backend sem disco (etapa D). A troca de plano e a remoção do disco no painel do Render são ações do usuário.

### Fora do escopo

- Dados brutos das Licitações no R2 e o Cron Job (continua suspenso).
- Mudar os tipos e tamanhos que cada tela aceita (ficam como hoje).
- Domínio/CDN público para imagens da vitrine, OCR, antivírus e histórico de versões de anexos.
- Trocar o Postgres do Render (o plano gratuito de Postgres expira em 30 dias).
- Isolamento multi-tenant: o projeto não é multi-tenant; o isolamento é por `usuario_id`/`conta_id`.

## Leitura de contexto

- `/AGENT.md`: sem código sem aprovação; Node `22.17.0` e npm `10.9.2`; identificadores de código em inglês; Drizzle nas consultas novas; sem `catch` silencioso.
- `/CLAUDE.md`: fluxo `/planejar` → aprovação → `/implementar` → `/finalizar`; `.env` só com confirmação explícita; migrations só com confirmação; o banco pode ser a produção.
- `frontend/AGENT.md` e `backend/AGENT.md`: não existem no projeto (o `AGENT.md` da raiz cobre o repositório todo).
- `.portal/tasks/unificar-anexos-no-r2.md`.
- Código lido: os três métodos de anexo, o armazenamento do R2 (`backend/src/modules/tenders/objectStorage.ts`, `objectStorageTestSupport.ts`, `contractStore/service.ts`), as rotas e serviços de lançamentos, contratos e catálogo, os diálogos e telas de anexo, o assistente financeiro, o modo demo e os serviços do frontend (arquivos listados em "Arquivos provavelmente afetados").

## Situação atual verificada (03/11/2026)

- **Despesas e receitas:**
  - Coluna `attachments: jsonb('anexos')` em `backend/src/db/schema/expenses.ts` (linha ~59) e `incomes.ts` (linha ~52). Cada item é `{ id, nome, tipo, tamanho, dados, dataUpload }`, com `dados` em base64 (`src/types/finance.ts`).
  - Frontend: `src/ui/AttachmentSection.tsx` aceita pdf, jpg, jpeg, png, gif, xls, xlsx, doc, docx e txt, com 10 MB. A validação é só no frontend.
  - Backend: `readAttachments` (`backend/src/utils/requestInput.ts`) só confere que os itens são objetos. O limite de JSON é 50 MB (`backend/src/server.ts`, linha ~55). As listas devolvem tudo (`SELECT d.*`).
- **Contratos:**
  - Tabela `comercial.anexos` (`id`, `contrato_id`, `conta_id`, `usuario_id`, `nome_original`, `nome_arquivo` único, `tipo` pdf|jpg|png, `tamanho`, `created_at`) + arquivo em `uploads/contratos` (`CONTRACT_UPLOAD_DIR`, `backend/src/services/contractAttachments.ts`).
  - Aceita PDF, JPG e PNG, até 20 MB (`MAX_ATTACHMENT_BYTES`, `contractTypes.ts`), validados por conteúdo. Servido com `nosniff`, CSP e `no-store`.
  - A exclusão do contrato apaga os arquivos (`services/contracts.ts`, ~linhas 493–500, e `removeAttachmentFiles`).
- **Catálogo:**
  - Tabela `catalogo.produto_imagens` (`id` uuid, `produto_id` uuid com cascata, `nome_arquivo`, `ordem`, `created_at`) + arquivo em `uploads/catalogo` (`produtos.ts` linha ~19 e `public.ts` linha ~14).
  - A imagem é convertida por sharp para webp com 1600 px (8 MB de entrada) e servida pela rota pública com cache imutável.
- **R2:** a interface `ObjectStorage` tem `putObject(key, body, contentType)`, `getObject`, `downloadToFile`, `listKeys`, `deleteObject` e `close`. Cada ambiente usa uma pasta (`TENDERS_STORAGE_PREFIX`: `producao/` ou `local/`). O Web Service já cria um cliente R2 (`contractStore/service.ts`).
- **Render:** não existe `render.yaml` no repositório (a configuração está no painel). Última migration do projeto: 0092.

## Impacto por área

### Frontend

- Serviço novo `src/services/attachmentsService.ts`: envio multipart com progresso, pedir link e apagar. Chaves novas em `src/services/queryKeys.ts`. O tipo `Attachment` em `src/types/finance.ts` passa a ter só metadados, sem `dados`.
- Componente único `AttachmentsField` (novo, em `src/ui/`), com regras por tipo de dono. Substitui `src/ui/AttachmentSection.tsx`, `src/screens/clients/ContractAttachments.tsx` e a parte de envio de `src/components/ProdutoImagensManager.tsx`. Esse último mantém só a galeria (ordem e miniaturas).
- `src/ui/AttachmentPreviewDialog.tsx` passa a abrir o link assinado: PDF e imagem abrem no navegador e os outros tipos baixam.
- Lançamentos:
  - Os diálogos de despesa e receita (`src/screens/finance/expense-dialog/*`, `income-dialog/*`: `ExpenseDialog`, `ExpenseRow`, `IncomeDialog`, `IncomeRow`, `draftState`, `draftRules`) guardam só ids no rascunho.
  - Salvar fica bloqueado enquanto houver upload em andamento.
  - Anexo pendente removido é apagado na hora. Anexo já salvo só sai ao salvar a edição.
  - `AttachmentsPopover.tsx`, `LancamentosTable.tsx`, `ExpenseCard.tsx` e `IncomeCard.tsx` mostram nomes e contagem e abrem pelo link.
- Assistente financeiro (`src/components/financial-assistant/FinancialAssistant.tsx`, `cardDraft.ts`): sobe o arquivo ao anexar e envia só ids ao confirmar.
- Contratos: `ContractWizard.tsx` continua criando o contrato primeiro e enviando os arquivos em seguida, como hoje, mas pelo serviço único. `ContractDetail.tsx` e `ContractWizardSteps.tsx` seguem o mesmo caminho. Contrato e produto mantêm ações imediatas (enviar ou apagar vale na hora).
- Catálogo e vitrine: `CatalogoTab.tsx` e `storefrontService.ts` passam a montar a URL da imagem pelo id do anexo.
- Modo demo: anexos em memória (object URL) em `src/services/demo/fakeApiResolver.ts`, `demoFakeDatabase.ts`, `fixedExpensesDemo.ts` e `fixedIncomesDemo.ts`.
- Estados: progresso de envio, erro por arquivo (tipo, tamanho, rede) e vazio.
- Testes: ver "Testes necessários".

### Backend

- **Serviço de arquivos** (novo, em `backend/src/services/`):
  - Armazenamento no R2: grava, lê, apaga e gera link assinado. A chave é `anexos/<id>` dentro da pasta do ambiente.
  - Validação por conteúdo e regras por tipo de dono. Unifica `contractAttachmentType.ts` e `productImages.ts`.
  - Serviço de anexos: criar pendente, vincular ao dono na transação, substituir pela lista final, listar em lote (1 consulta para N donos), apagar, apagar por dono e varrer pendentes.
- **Rotas novas** `/api/attachments` (em inglês, como manda o `AGENT.md`; implementadas na Etapa A):
  - `POST /api/attachments?ownerType=expense|income|contract|product[&ownerId=]`, multipart com o campo `file`. Despesa e receita não levam `ownerId` (o envio fica pendente); contrato e produto levam.
  - `GET /:id/link`, que devolve `{ url, expiresAt }`.
  - `DELETE /:id`.
  - Cada tipo de dono repete as travas da rota antiga (plano ativo, Premium, permissão de tela ou de cadastro), reaproveitando os mesmos middlewares.
  - A autorização segue o dono: visibilidade da família (`familyVisibility`) em despesa e receita, `findContractForRequester` em contrato e `findAccessibleProduct` em produto. Anexo pendente só o autor enxerga. Quem não pode recebe sempre 404.
- **ObjectStorage** (`backend/src/modules/tenders/objectStorage.ts`): `putObject` ganha opções (Content-Disposition e Cache-Control) e entra um `signedGetUrl`. Nova dependência `@aws-sdk/s3-request-presigner`, com versão alinhada ao `@aws-sdk/client-s3` e ao Node `22.17.0`. O fake em `objectStorageTestSupport.ts` acompanha. Reaproveita a mesma configuração do R2 (variáveis `TENDERS_*`), sem criar um cliente duplicado.
- **Lançamentos:**
  - `expenseInput.ts` e `incomeInput.ts` trocam `anexos` (base64) por ids.
  - Criar, editar, confirmar (`POST /:id/confirm`) e excluir passam a tratar os anexos junto. `/:id/pay` segue sem anexos.
  - Todas as listas devolvem metadados por consulta em lote: lista de despesas (`SELECT d.*`), rota de grupo (`SELECT * FROM despesas`), receitas, pendentes e previsão em `fixedExpenseService.ts` e `fixedIncomes.ts`, e séries (`expenseSeries.ts`, `seriesRenewalService.ts`).
- **Exclusões:** coletar as chaves antes de apagar e remover os objetos do R2 depois do commit, registrando falhas (sem catch silencioso). Cobrir exclusão de lançamento (rotas com DELETE direto), `clearFinancialDataService.ts`, exclusão de contrato, de produto e de usuário/conta. Um script de conferência de órfãos serve de rede de segurança.
- **Contratos e catálogo:** as rotas e o disco antigos saem. A imagem continua passando por sharp para webp 1600 px, e a rota pública serve do R2 por id, com cache imutável.
- **Limite de JSON** em `backend/src/server.ts` (50 MB, existe por causa do base64): reduzir ao fim da etapa C, só se nenhuma outra rota depender dele.

### Banco de dados

Tabela nova `anexos`, no schema `public`. Enquanto `comercial.anexos` existir, todo SQL deve qualificar o schema.

- **Colunas (como ficou na migration 0093):**
  - `id` uuid, `usuario_id` (autor, `ON DELETE SET NULL`) e `tipo_dono` (`expense`, `income`, `contract` ou `product`: valores em inglês, como o código).
  - FKs opcionais `despesa_id`, `receita_id`, `contrato_id` e `produto_id`, todas com `ON DELETE CASCADE`.
  - CHECK de no máximo um dono, coerente com `tipo_dono`.
  - `nome_original`, `tipo_conteudo`, `tamanho`, `chave` (única), `ordem` (imagens do catálogo) e `created_at`.
  - Sem `conta_id`: o acesso vem do dono (o lançamento tem o `conta_id` dele, e contrato e produto também), e guardar a conta aqui duplicaria um dado que muda quando o lançamento muda de conta. As chaves para apagar no R2 saem pelos ids dos donos (`collectAttachmentKeys`).
- **Índices:** parciais por dono e um índice dos pendentes (sem dono, por data).
- **Migrations** (SQL escrito à mão em `backend/drizzle`, a partir de 0093):
  - 0093 (etapa A): cria `anexos`.
  - 0094 (fim da etapa B): remove `comercial.anexos` e `catalogo.produto_imagens`.
  - 0095 (fim da etapa C): remove as colunas jsonb `anexos` de `despesas` e `receitas`.
- **Cópia dos dados:** feita por script, no padrão de `backend/scripts/migrations.ts` (`--banco local|producao`, `--dry-run`, `--confirmo`).
  - O script é idempotente: o `id` do anexo migrado é derivado de forma determinística da identidade antiga (UUID baseado em nome), então rodar de novo não duplica.
  - Verifica contagem e tamanho.
  - Na etapa C, faz backup do JSON original no R2 antes de qualquer remoção.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Variáveis:** nenhuma nova. O Web Service já tem `TENDERS_ARCHIVE_*` e `TENDERS_STORAGE_PREFIX`.
- **Teste real no R2:** usa só a pasta `local/` (nunca `producao/`), com chave descartável apagada no fim. Confirma o Content-Disposition no PutObject, o link assinado e a exibição de PDF e imagem no navegador. CORS do bucket só é necessário se algum ponto usar `fetch` direto do navegador; o preferido é `<img>`, `<iframe>` e `<a>`.
- **CSP:** se o frontend tiver CSP, liberar o host do R2 para imagem e quadro.
- **Cópia dos arquivos do disco:** só dá para fazer dentro do serviço do Render (Shell), onde o disco está montado. O script precisa existir no build de produção. Se o Shell não estiver disponível, definir a alternativa com o usuário antes (sem rota administrativa temporária).
- **Etapa D:** remover o disco, passar para o plano gratuito, suspender `escalacao-futebol-1` e acompanhar a hibernação (~1 min para acordar). Manter o caminho de volta ao plano pago.

## Arquivos provavelmente afetados

**Backend (existentes)**

- Armazenamento e servidor: `backend/src/modules/tenders/objectStorage.ts`, `backend/src/modules/tenders/objectStorageTestSupport.ts`, `backend/src/server.ts`, `backend/package.json` (e o lockfile).
- Contratos: `backend/src/services/contractAttachments.ts` (sai), `contractAttachmentType.ts` (vai para a validação única), `contractViews.ts`, `contracts.ts`, `contractTypes.ts`, `backend/src/modules/contracts/routes/attachments.ts` (sai), `backend/src/modules/contracts/db/schema.ts`.
- Catálogo: `backend/src/modules/catalogo/routes/produtos.ts`, `public.ts`, `storefront.ts`, `backend/src/modules/catalogo/db/schema.ts`, `backend/src/services/productImages.ts`, `catalogo.ts`, `storefront.ts`.
- Lançamentos: `backend/src/db/schema/expenses.ts`, `incomes.ts`, `backend/src/routes/expenses.ts`, `incomes.ts`, `backend/src/services/expenseInput.ts`, `incomeInput.ts`, `expenseService.ts`, `incomeService.ts`, `fixedExpenseService.ts`, `fixedIncomes.ts`, `expenseSeries.ts`, `seriesRenewalService.ts`, `clearFinancialDataService.ts`, `backend/src/utils/requestInput.ts`, `familyVisibility.ts`, `accountAccess.ts`.

**Backend (novos)**

- Serviço de arquivos (`attachmentRules`, `attachmentFile`, `attachmentModel`, `attachmentStorage`, `attachmentService`, `attachmentAccess` e `productAccess`, em `backend/src/services/`) e rotas `/api/attachments` (`backend/src/routes/attachments.ts`). Tabela no Drizzle em `backend/src/db/schema/attachments.ts`.
- Scripts de cópia, verificação e varredura em `backend/scripts/`.
- Migrations 0093 a 0095 em `backend/drizzle/`.

**Frontend**

- Novos: `src/services/attachmentsService.ts` e `src/ui/AttachmentsField.tsx`.
- Existentes: `src/ui/AttachmentSection.tsx` (sai), `src/ui/AttachmentPreviewDialog.tsx`, `src/screens/finance/entry-dialog/AttachmentsPopover.tsx`, `src/screens/finance/LancamentosTable.tsx`, `src/screens/despesas/ExpenseCard.tsx`, `src/screens/receitas/IncomeCard.tsx`, `src/screens/finance/expense-dialog/*`, `src/screens/finance/income-dialog/*`, `src/screens/clients/ContractAttachments.tsx` (sai), `ContractDetail.tsx`, `ContractWizard.tsx`, `ContractWizardSteps.tsx`, `src/components/ProdutoImagensManager.tsx`, `src/screens/config/CatalogoTab.tsx`, `src/components/financial-assistant/FinancialAssistant.tsx`, `cardDraft.ts`.
- Serviços e tipos: `src/services/contractsService.ts`, `catalogoService.ts`, `storefrontService.ts`, `financeService.ts`, `fixedExpensesService.ts`, `fixedIncomesService.ts`, `apiClient.ts`, `queryKeys.ts`, `src/types/finance.ts`.
- Demo: `src/services/demo/fakeApiResolver.ts`, `demoFakeDatabase.ts`, `fixedExpensesDemo.ts`, `fixedIncomesDemo.ts`.

**Documentação**

- `AGENT.md`, o README do módulo de Licitações (`backend/src/modules/tenders/README.md`, se citar o R2) e a memória do projeto em `.claude/`.

## Estratégia de implementação

Cada etapa tem branch própria (nomes sugeridos), passa por `/implementar` e `/finalizar`, e só começa depois que a anterior estiver verificada, mergeada e sem o método antigo.

Sequência segura para as etapas que copiam dados (B e C):

1. Medir o volume em produção (somente leitura) e confirmar a situação do backup do Postgres. Ambos dependem do "sim" do usuário.
2. Aplicar a migration que só cria estruturas (compatível com o código antigo), com confirmação.
3. Rodar a cópia com `--dry-run`, depois no local e depois na produção, com confirmação. O código antigo continua atendendo.
4. Fazer o deploy do código novo, que lê e grava só em `anexos`.
5. Rodar a cópia de novo (idempotente) para pegar o que entrou entre a cópia e o deploy.
6. Rodar a verificação (contagem e tamanho) e usar o app.
7. Só depois, e com novo "sim", aplicar a migration que apaga o antigo.

### Etapa A: Fundação, sem mudança visível (`feat/R/anexos-fundacao`)

1. Migration 0093 (criar `anexos`), aplicada primeiro no local e, em produção, só com o "sim" do usuário.
2. `ObjectStorage` com opções de gravação e `signedGetUrl`, mais a dependência do presigner e o fake de teste.
3. Serviço de arquivos: armazenamento, validação por conteúdo, regras por dono, serviço de anexos e rotas `/api/attachments`. A varredura de pendentes roda no próprio upload e por script manual, com prazo de 24 h.
4. Teste real no R2 (`local/`): gravar com Content-Disposition, gerar link assinado, abrir PDF e imagem no navegador, apagar.
5. Conferir que o código das Licitações no R2 nunca lista nem apaga fora das suas pastas. `anexos/` e `backups/` ficam intactos.
6. Testes e build.

Nesta etapa não há método antigo a apagar.

### Etapa B: Contratos e imagens do catálogo, libera o disco (`feat/R/anexos-contratos-catalogo`)

1. Backend: contratos e catálogo passam a usar o serviço. O upload com dono existente já vincula direto. Ajustar `contractViews.ts`, a exclusão de contrato e de produto, e a rota pública de imagem, que passa a usar o id.
2. Frontend: `AttachmentsField` e o serviço novo, usados primeiro em contratos (wizard e detalhe) e na galeria do catálogo. URLs da vitrine pelo id.
3. Dados: scripts de cópia e de verificação, seguindo a sequência segura acima. Em produção a cópia roda pelo Shell do Render, onde o disco está montado.
4. Apagar o antigo: migration 0094, `contractAttachments.ts`, a rota de anexos de contratos, as constantes `uploads/*` e os componentes e funções de serviço antigos. Os arquivos do disco ficam como cópia de segurança até a etapa D.
5. Testes e build.

### Etapa C: Despesas, receitas e assistente (`feat/R/anexos-lancamentos`)

1. Backend:
   - O contrato passa a usar ids em criar, editar e confirmar.
   - O vínculo acontece na mesma transação e mantém a regra de linha de hoje: parcelado vai na primeira parcela, recorrente na ocorrência atual, edição de série na linha editada.
   - O PUT envia a lista final e o backend compara.
   - As listas devolvem metadados em lote.
   - Rever os fluxos que copiam anexos entre linhas (renovação de série).
   - Cobrir as exclusões.
2. Frontend: diálogos, popover, tabela, cards, assistente e demo. Remover a leitura em base64.
3. Dados, seguindo a sequência segura acima:
   - Script com `--dry-run`.
   - Backup do JSON original no R2 (por exemplo `backups/anexos-jsonb/`).
   - Cópia do base64 para o R2.
   - Verificação.
   - Arquivo inválido é reportado, nunca descartado em silêncio.
4. Inventário final de endpoints por grep de `anexos`/`attachments` em todo o backend, incluindo exportações, relatórios e assistente. Só depois apagar o antigo: migration 0095, `readAttachments`, `AttachmentSection.tsx` e o campo `dados`. Reduzir o limite de JSON se possível.
5. Testes e build.

### Etapa D: Render sem disco (`chore/R/render-sem-disco`)

Pré-requisito: etapas A e B verificadas. A C não depende do disco, então a D pode vir antes dela se o usuário quiser economizar mais cedo.

1. Código: nenhuma referência restante a `uploads/`. Atualizar a documentação e acrescentar ao `AGENT.md` a regra "arquivo persistente vai para o R2 pelo serviço de arquivos", com a aprovação do usuário.
2. Ações do usuário no painel do Render (com orientação): conferir nos logs que nada lê o disco, apagar o disco (irreversível), trocar para o plano gratuito e suspender `escalacao-futebol-1`.
3. Uso real por cerca de uma semana. Se a espera ao acordar atrapalhar, volta ao plano pago, sem disco.
4. Atualizar a memória do projeto com o novo estado.

## Regras de negócio identificadas

| Dono | Tipos aceitos | Limite | Tratamento | Acesso |
|---|---|---|---|---|
| Despesa / receita | pdf, jpg, jpeg, png, gif, xls, xlsx, doc, docx, txt | 10 MB | guarda como enviado | quem vê o lançamento (conta/família) |
| Contrato | pdf, jpg, png | 20 MB | guarda como enviado | quem acessa o contrato |
| Produto (imagem) | imagens aceitas hoje | 8 MB | converte para webp 1600 px | público na vitrine; gestão pela conta |

- Só PDF e imagens abrem no navegador. Os demais tipos sempre baixam.
- O link assinado dura cerca de 2 minutos, é gerado sob demanda e nunca é guardado.
- Entrada de despesa/receita: o upload é imediato e fica pendente. O lançamento envia só os ids e o backend vincula tudo na mesma transação. Ao editar, vale a lista final de ids.
- Contrato e produto já existem no momento do upload, então o anexo nasce vinculado.
- Upload pendente sem dono expira (24 h) e é apagado. Apagar o dono apaga o objeto no R2.
- O tipo do arquivo é decidido pelo servidor, por conteúdo, e nunca pelo que o cliente declara.
- A regra de qual linha recebe os anexos continua a de hoje (parcelado: primeira parcela; recorrente: ocorrência atual; edição de série: linha editada).
- A ordem das imagens do catálogo (`ordem`) é preservada.

## Regras multi-tenant e segurança

- O projeto não é multi-tenant. O isolamento é por `usuario_id`/`conta_id`.
- Toda rota confere o acesso ao dono do anexo. Pendente só o autor vê. Quem não tem acesso recebe 404.
- A chave do R2 nunca sai na API. O link é curto e não é registrado em log, porque contém assinatura.
- Documentos do Office e TXT sempre baixam e nunca abrem no navegador. As respostas servidas pelo backend levam `nosniff`.
- As credenciais do R2 ficam só no backend.
- Scripts e migrations rodam com `--banco local` por padrão. O `.env` da raiz é a produção.

## Validações necessárias

- **Upload:**
  - Tipo do dono válido; dono existente e acessível.
  - Tamanho dentro do limite do tipo do dono.
  - Conteúdo coerente com a extensão: PDF e imagens por assinatura, Office por família OLE/ZIP mais extensão, TXT sem bytes NUL.
  - Arquivo vazio rejeitado.
  - Nome sanitizado, sem caminho e com no máximo 255 caracteres.
- **Vínculo:** os ids pertencem ao usuário, estão pendentes e a finalidade bate com o dono.
- **Corpo do lançamento:** `attachmentIds` é uma lista de uuids sem repetição (`readAttachmentIds`, até 100 por pedido).
- **Link e exclusão:** uuid válido e acesso ao dono.
- **Imagens do catálogo:** conversão para webp 1600 px, com 8 MB de entrada.

## Testes necessários

### Frontend

- `AttachmentsField`: regras por dono, progresso, erro por arquivo, remover pendente e salvo, e Salvar bloqueado durante o upload.
- Diálogos de despesa e receita, e assistente: o rascunho guarda ids e o PUT envia a lista final.
- Pré-visualização: abre o link, e os tipos não visualizáveis baixam.
- Modo demo.

### Backend

- Validação por conteúdo, incluindo extensão falsa e arquivo vazio.
- Serviço de anexos com R2 fake: pendente, vincular, comparar lista, listar em lote, apagar e varrer.
- Rotas: acesso entre contas, visibilidade da família, pendente só do autor, link e cabeçalhos da imagem pública.
- Banco (`*.db.test.ts`): CHECK de um dono e cascata.
- Scripts: idempotência, dry-run sem escrita, base64 inválido reportado e verificação que detecta falta.
- Regressão: toda lista de lançamentos devolve `anexos`.
- Exclusões que removem objetos no R2: lançamento, contrato, produto, usuário/conta e limpar dados.
- Os testes de serviço ficam em `backend/src/services/` (padrão do `npm test` do backend).

### E2E

Não há suíte E2E identificada. Haverá um roteiro manual por etapa, em ambiente local com a pasta `local/` do R2.

## Comandos de validação sugeridos

Um de cada vez, por causa da memória do computador:

```bash
npx vite build
npm test
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:finance-db
```

O último roda só contra o banco local. Migrations e scripts de cópia seguem o padrão `scripts/migrations.ts ... --banco local|producao --confirmo`, e a produção só com "sim" explícito.

## Riscos e pontos de atenção

- **Dados financeiros reais reescritos (etapa C):** mitigado com backup no R2, dry-run, verificação, remoção do antigo só em migration separada e o "sim" do usuário a cada passo.
- **Endpoint de lista esquecido:** mostraria "0 anexos". Mitigado com inventário por grep, teste que percorre as listas e coluna removida só no fim.
- **Descompasso de deploy front/back:** poucos minutos, aceito (decisão 6). Fazer o deploy fora do horário de uso.
- **Link assinado do R2:** cabeçalhos e exibição inline podem se comportar diferente do esperado. Validado no teste real da etapa A. Se o PutObject não aplicar o Content-Disposition como esperado, usar o override `response-content-*` no link.
- **CSP ou CORS bloqueando a pré-visualização:** conferir nas etapas A e B.
- **Plano gratuito:** hiberna (~1 min ao acordar), divide as 750 h/mês do workspace com `escalacao-futebol-1`, tem CPU bem menor (conversão de imagens e primeira carga mais lentas) e um upload grande logo após acordar pode estourar o tempo limite. A etapa D só prepara e testa, com caminho de volta.
- **Volume desconhecido em produção:** medir (somente leitura) antes da etapa B.
- **Backup do Postgres desconhecido:** verificar antes da etapa C.
- **Objetos órfãos no R2:** exclusões em cascata não passam pelo código. Mitigado coletando as chaves antes e com o script de conferência.
- **Rodar scripts no Render:** Shell e build ainda não confirmados.
- **Renovação de séries:** pode copiar anexos entre linhas. Apurar na etapa C.
- **URLs antigas das imagens da vitrine:** deixam de existir, sem redirecionamento. Aceito, porque ainda não há clientes.
- **Limpeza do R2 das Licitações:** confirmar na etapa A que ela nunca apaga `anexos/` nem `backups/`.

## Perguntas em aberto

1. Quantos anexos e quantos MB existem hoje em produção, no banco e no disco? A medição é só leitura e depende do "sim" do usuário, antes da etapa B.
2. O Postgres do plano atual no Render tem backup ou restauração disponível? Isso define o cuidado extra da etapa C.
3. O Shell do Render está disponível para o backend com disco? É necessário para copiar os arquivos do disco.
4. Teto de anexos por lançamento: hoje não há teto no backend. O padrão do plano é manter sem teto.

Premissas adotadas (ajustáveis):

- Varredura de pendentes sem cron, com prazo de 24 h.
- Variáveis `TENDERS_*` do R2 mantidas.
- Tabela `anexos` no schema `public`. API em inglês, como manda o `AGENT.md`: rota `/api/attachments`, envio `attachmentIds`, resposta `attachments` com `{ id, name, contentType, size, createdAt }`. As listas de lançamentos trocam o campo antigo `anexos` pelo novo na Etapa C, junto com o frontend.
- Testes de serviço em `backend/src/services/` e testes de banco em `*.db.test.ts`.
- Branches com os nomes sugeridos nas etapas.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Nenhum upload novo grava base64 no Postgres ou arquivo em disco. Tudo passa pelo serviço único e vai para o R2.
- As colunas jsonb, as tabelas antigas, as rotas, os componentes e os caminhos `uploads/*` foram removidos (grep zerado).
- Os anexos existentes foram migrados e a verificação confere contagem e tamanho. O backup do JSON original está no R2.
- Todas as listas de lançamentos mostram os anexos, e nenhuma resposta de lista carrega conteúdo de arquivo.
- Abrir ou baixar anexo privado usa link curto. Sem acesso, o usuário recebe 404, e o link expira.
- Apagar lançamento, contrato, produto, usuário ou dados financeiros remove os objetos no R2.
- Um arquivo com extensão falsa é rejeitado no backend.
- A vitrine continua pública, com webp e cache imutável.
- O backend sobe e funciona sem a pasta `uploads/` (smoke local só com o R2 `local/`).
- Build e testes passam, as migrations rodaram com a confirmação do usuário e, na etapa D, o Render sem disco foi usado por cerca de uma semana.

## Observações para a skill implementar

- Usar este plano como fonte principal. Fazer uma etapa por vez, cada uma com seu `/implementar` e seu `/finalizar`.
- Não executar migrations nem scripts de cópia em produção sem "sim" explícito. Alterar `.env` só com confirmação.
- Seguir o `AGENT.md` da raiz: identificadores em inglês, Drizzle nas consultas novas, sem catch silencioso, Node `22.17.0` e npm `10.9.2`.
- Sem adaptador de compatibilidade: trocar as rotas de uma vez por etapa.
- Manter alterações pequenas e focadas. Atualizar os testes conforme descrito.
- Build e testes um de cada vez.
- Não commitar `.portal/`, `CLAUDE.md` nem `GLOSSARIO.md`.
- Ao fim de cada etapa, remover do código e do banco o método antigo que ela substituiu, sem deixar sobras.

## Registro de andamento

### Etapa A: implementada em 03/11/2026 (branch `feat/R/anexos-fundacao`)

Entregue: migration `0093_attachments_table.sql` (não aplicada em produção), tabela no Drizzle, extensão do `ObjectStorage` (Content-Disposition, Cache-Control e `signedGetUrl`) com a dependência `@aws-sdk/s3-request-presigner@3.1146.0` (mesma versão do client-s3), serviço de arquivos, rotas `/api/attachments`, varredura de pendentes (no envio, no máximo uma vez por hora, e pelo script) e `backend/scripts/attachments.ts` com `check-r2` e `sweep`. Sem mudança no frontend e sem método antigo a apagar.

Verificado: build do backend, 1054 testes (1053 passam; o 1 pulado é a suíte de banco, que só roda com `FINANCE_DB_TESTS=1`), 10 testes de banco contra o Postgres local, e a verificação real no R2 (`local/`), com 12 passos OK: o R2 aplica o Content-Disposition e o Cache-Control gravados no objeto, PDF abre no navegador, planilha baixa, o link vence (403) e o arquivo apagado dá 404. O override `response-content-*` não foi necessário.

Decisões e achados que valem para as próximas etapas:

1. **Banco local defasado:** as migrations 0088 a 0092 estão pendentes no local, e o script recusa aplicar a 0093 antes delas. A 0088 ainda tem trava própria (exige `notices-payload-export` conferido neste banco). Os testes de banco da Etapa A rodaram num schema temporário (`attachments_scratch`, com `DB_SCHEMA` apontando para ele, o SQL da 0093 nele e o schema apagado no fim), com autorização do usuário. Nas etapas B e C repetir isso, ou atualizar o banco local antes. `despesas` e `receitas` locais também não têm as colunas das migrations 0089 a 0091, então os testes inserem nelas por SQL direto.
2. **Rota e campos em inglês** (`AGENT.md`): `/api/attachments`, `ownerType`, `ownerId`, `attachmentIds`, resposta com `name`, `contentType`, `size`, `createdAt`. O texto original do plano dizia `/api/anexos`.
3. **Sem `conta_id` na tabela** (ver "Banco de dados"). Valores de `tipo_dono` em inglês.
4. **Nome do arquivo com acento:** o envio usa `defParamCharset: 'utf8'` no multer. A rota antiga de contratos usa o padrão `latin1` e pode estragar nomes acentuados; a Etapa B corrige isso ao migrar.
5. **Proteções novas:** teto de 64 milhões de pixels na imagem de entrada (sharp) e teto de 100 envios pendentes por pessoa (429). A rota antiga do catálogo não tinha nenhum dos dois.
6. **Reaproveitamento:** `findAccessibleProduct` saiu de `routes/produtos.ts` para `services/productAccess.ts`, e as duas rotas usam a mesma função.
7. **Limpeza das Licitações:** as duas que listam e apagam no R2 só olham a pasta `contratos/arquivos/` do armazém; um teste do gravador agora garante que `anexos/` sobrevive a uma publicação.
8. **Ordem em produção:** aplicar a 0093 (com o "sim" do usuário) antes do deploy do código da Etapa A. Nada chama as rotas novas até a Etapa B, mas sem a tabela elas responderiam 500.
