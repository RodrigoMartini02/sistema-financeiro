# Plano de Implementação: documentação para licitações

## Origem

- Arquivo de especificação: `.plans/analise-documentacao-licitacoes.md` (análise de 2026-10-13, com as direções do usuário nas seções 14 a 18)
- Data do planejamento: `2026-10-13`
- Classificação: `frontend + backend + database`, com impacto em infra (disco do Render, rotina diária e bibliotecas novas)

## Resumo

Licitações ganha a área **Documentação**, que monta o pacote que cada edital pede. O objetivo é cadastrar uma vez e preparar cada licitação em minutos, sem os erros que inabilitam: certidão vencida, processo errado, declaração faltando, assinatura de quem não pode.

São quatro peças:
- **Empresas e pessoas:** várias empresas por conta, e cada pessoa com o seu papel (sócio-administrador, procurador, sem representação, contador ou responsável técnico).
- **Cofre de documentos:** validade e aviso de vencimento no sino.
- **Modelos com variáveis:** editor TipTap, gerando PDF e DOCX do mesmo conteúdo, com 20 modelos padrão.
- **Área de trabalho por pendências:** monta proposta, declarações, procuração e habilitação de cada licitação e entrega o ZIP.

**Regras gerais:**
- toda a equipe com acesso usa e edita tudo;
- tudo que é gerado é assinado fora do sistema: baixar, assinar e anexar a versão assinada.

**Entrega em três partes**, cada uma com o seu `/implementar`, a sua validação e o seu merge:
- **A:** cadastros e documentos;
- **B:** modelos e geração;
- **C:** área de trabalho, proposta, pacote e índices contábeis.

## Escopo

### Dentro do escopo

**Parte A: cadastros e documentos**
- **Empresa licitante:**
  - dados cadastrais, endereço, dados bancários e Pix;
  - porte em campo próprio (MEI, ME, EPP ou Demais);
  - SICAF, validade padrão da proposta e papel timbrado (logo e rodapé);
  - "Puxar da conta PJ";
  - desativar em vez de excluir.
- **Pessoa:**
  - qualificação jurídica (RG, nacionalidade, estado civil, profissão, endereço, tratamento Sr./Sra.), conselho e registro;
  - login opcional, ligado a um usuário com acesso à conta;
  - papéis por empresa, com "assina sozinho" para o sócio;
  - desativar em vez de excluir.
- **Tipos de documento:**
  - os padrões do sistema, com categoria, a quem pertence, se aceita vários, validade sugerida e link de emissão;
  - os tipos criados pela conta.
- **Documento anexado:**
  - arquivo, datas de emissão e validade, emissor, observação e exercício (balanço e DRE);
  - campos do atestado (objeto, período, quantitativos);
  - substituição sem perder o histórico.
- **Situação do documento:** válido, vencendo, vencido ou sem validade, conforme a data de referência e o prazo de aviso.
- **Aviso de vencimento:** no sino, para todos com acesso à conta; prazo por conta, 15 dias por padrão.
- **Telas:**
  - item "Documentação" no menu, com navegação em grupos (o método do painel de configurações do Finanças);
  - páginas Empresas, Pessoas e Documentos (com Tipos);
  - card de documentos no Início.
- **Privacidade:** o texto passa a citar os dados de terceiros (sócios, procuradores, contador e responsável técnico).

**Parte B: modelos e geração**
- **Modelos:** os padrões do sistema e os da conta.
  - Editar o texto de um padrão cria a versão da conta.
  - Marcar "sempre" ou desativar só sobrepõe a configuração, e o texto continua o do padrão.
  - "Restaurar padrão" desfaz.
- **Editor TipTap** com formatação limitada:
  - negrito, itálico, sublinhado, títulos, listas, alinhamento e tabela simples;
  - variável como etiqueta, escolhida no catálogo publicado pelo servidor;
  - blocos especiais: assinatura, tabela de itens da proposta e tabela de índices.
- **Servidor:**
  - confere o conteúdo contra uma lista fechada de elementos;
  - preenche as variáveis;
  - gera PDF (`pdfmake`) e DOCX (`docx`) da mesma estrutura;
  - aplica o papel timbrado, o bloco de assinatura conforme o papel, o valor por extenso escrito, as datas por extenso e as máscaras.
- **Prévia ao vivo, em HTML:** 500 ms depois da última mudança, com o texto preenchido pelo servidor e o "Ver PDF" com o arquivo real.
- **Variável vazia:** destacada na prévia; o download fica bloqueado até a confirmação.
- **Geração avulsa:** escolher empresa e pessoa e baixar PDF ou DOCX. Serve, por exemplo, para a procuração ampla.
- **20 modelos padrão:** os 19 da lista, com visita técnica e dispensa de visita separadas. Os textos são escritos pelo Claude (decisão 7) e revisados pelo usuário antes do merge.

**Parte C: área de trabalho, proposta, pacote e índices**
- **Preparação:**
  - cópia dos dados da licitação, do edital do PNCP ou cadastrada à mão;
  - empresa, quem participa e data da sessão;
  - itens: modelos e documentos;
  - "editar só nesta licitação";
  - versão assinada anexada, com a marca de "desatualizado";
  - "dispensado", por exemplo quando a declaração é feita na plataforma.
- **Tela de pendências:**
  - "X de Y prontos" e o que precisa de atenção primeiro;
  - seções como índice, com o botão "Próximo";
  - prévia ao lado, com o preenchimento no próprio documento;
  - rascunho salvo a cada mudança;
  - abas no celular.
- **Regras automáticas:**
  - ME/EPP conforme o porte;
  - aviso de item exclusivo para ME/EPP;
  - procuração e identidades conforme o papel;
  - carta de credenciamento na sessão presencial com procurador;
  - registro de preços;
  - SICAF;
  - Lei 13.303 (estatais);
  - Compras.gov;
  - visita técnica ou dispensa.
- **Proposta de preços:** itens importados do PNCP (guardando o `tipoBeneficio`), marca, modelo, valor unitário, total, extenso, validade, prazos e dados bancários.
- **Declaração única:** as declarações escolhidas num documento só, com uma assinatura.
- **Listas de documentos:** salvas por conta, as do sistema e as da conta, e "copiar da licitação anterior".
- **Pacote:**
  - ZIP montado em fluxo, com as pastas na ordem;
  - PDF único com índice, opcional e com limite;
  - relatório de pendências;
  - versões, só quando algo mudou.
- **Índices contábeis:** valores do balanço, LG, SG e LC, o mínimo da licitação e o demonstrativo.
- **Entradas:**
  - no detalhe do edital;
  - no card do Acompanhamento;
  - na lista de preparações.
  - Começar a preparação move o edital para "Vou participar".

### Fora do escopo

- IA de qualquer tipo, inclusive a leitura do edital e das certidões.
- Assinatura dentro do sistema: Adobe, gov.br, ZapSign ou outras (análise, seção 15).
- Emissão de certidões, assistida ou automática (análise, seção 16).
- Planilha de custos e BDI.
- Procuração específica como tipo próprio. O caminho é o "editar só nesta licitação".
- Lembrete de prazo com a contagem de pendências.
- "Meus dados" em Licitações. Com a decisão 3, cada pessoa completa os próprios dados em Pessoas.
- Exportar ou importar modelos em Word.
- Mudanças no FINGERENCE (Finanças). A única exceção é levar a configuração de fontes do `reportPdf.ts` para um módulo comum, sem mudar o relatório.

## Leitura de contexto

- `/AGENT.md`: lido (Drizzle, filtro de tenant, que aqui é a conta, PDFs determinísticos, inglês no código, migrations só com confirmação).
- `/frontend/AGENT.md`: **não existe** no projeto.
- `/backend/AGENT.md`: **não existe** no projeto.
- `/CLAUDE.md`: fluxo obrigatório e regras de `.env` e migrations.
- Especificação: `.plans/analise-documentacao-licitacoes.md`.
- Arquivos consultados:
  - **Backend do módulo:**
    - `backend/src/modules/tenders/README.md`;
    - `db/schema.ts`, `domains.ts`;
    - `routes/index.ts`, `routes/deps.ts`, `routes/handler.ts`;
    - `middleware/tenderAccess.ts`, `middleware/userRateLimiter.ts`;
    - `services/team.ts`, `services/pncpDetails.ts`;
    - `collector/notifications.ts`, `collector/runs.ts`, `collector/repository.ts` (limpeza).
  - **Migrations:** `backend/drizzle/0073` (`CHECK` de `notificacao.tipo`), `0080` e `0085` (o `GRANT` ao `licitacoes_coletor` dentro da migration); `backend/scripts/migrations.ts`.
  - **Rotina diária:** `backend/src/services/dailyJobSteps.ts`, `dailyJobs.ts`; `backend/src/routes/internal-jobs.ts`.
  - **Anexos de contrato:** `backend/src/modules/contracts/routes/attachments.ts`; `backend/src/services/contractAttachments.ts`, `contractAttachmentType.ts`.
  - **Outros serviços do backend:**
    - `backend/src/services/reportPdf.ts` (`pdfmake`);
    - `assistantVoice.ts` (extenso para fala, sem acentos);
    - `productImages.ts` (`sharp`).
  - **Validação e cadastro:**
    - `backend/src/middleware/validation.ts` (`isValidCpf`, `isValidCnpj`);
    - `src/utils/brazilDocuments.ts` (máscaras e validação no front);
    - `src/utils/companyAccount.ts`;
    - `backend/src/db/schema/accounts.ts`, `partners.ts`, `users.ts`, `accountMembers.ts`.
  - **Front do Finanças:**
    - `src/layout/ConfigPanel.tsx`, `src/ui/*` (`ConfigListRow`, `ConfigTabHeader`, `ConfigSwitch`, `configTokens`, `dialog`, `form`, `AttachmentSection`);
    - `src/screens/config/ContasTab.tsx`, `src/screens/clients/ContractWizard.tsx`;
    - `src/services/contractsService.ts` (envio e download de arquivo com token).
  - **Front de Licitações:**
    - `src/tenders/services/tendersApi.ts`, `queryKeys.ts`;
    - `src/tenders/utils/navigation.ts`, `TendersApp.tsx`;
    - `components/AddUserDialog.tsx`, `screens/SettingsScreen.tsx`, `layout/TendersUserMenu.tsx`;
    - `src/screens/public/legalContent.ts`.
  - **Dados reais do PNCP:** `collector/fixtures/proposta-page.json` e `pncp-itens.json`.

## Impacto por área

### Frontend

**Estrutura:** pastas `documentation/` dentro das pastas que Licitações já tem:
- `src/tenders/screens/documentation/`;
- `src/tenders/components/documentation/`;
- `src/tenders/utils/documentation/`;
- `src/tenders/services/documentationService.ts`.

**Navegação** (`src/tenders/utils/navigation.ts`, `TendersApp.tsx`):
- item "Documentação" no menu (`restricted: false`, todos com acesso);
- rotas `/documentacao/empresas`, `/documentacao/pessoas`, `/documentacao/documentos` (Parte A), `/documentacao/modelos` (B), `/documentacao/preparacoes` e `/documentacao/preparacoes/:id` (C);
- coluna de navegação em grupos (Preparações · Cadastros: Empresas, Pessoas · Biblioteca: Documentos, Modelos, Listas), no método do `ConfigPanel` do Finanças;
- as páginas aparecem conforme a parte que já está pronta;
- o editor e a área de trabalho entram com `React.lazy`, para o Início não baixar o TipTap.

**Parte A:**
- **Empresas:** lista com `ConfigListRow` e menu de três pontos.
  - O modal tem as seções Dados, Endereço (com `MunicipalityPicker`), Bancários, Licitação (porte, SICAF, validade da proposta) e Papel timbrado (logo e rodapé).
  - "Puxar da conta PJ" só aparece em conta PJ.
  - O filtro "mostrar desativadas" segue o método do Finanças.
- **Pessoas:**
  - a lista mostra os papéis por empresa e "com login" ou "sem login";
  - o modal tem as seções Dados, Documento (RG), Qualificação, Endereço, Conselho, Login (lista dos usuários com acesso à conta) e Papéis (empresa, papel, cargo e "assina sozinho").
- **Documentos:**
  - **lista:** por categoria, com filtros por empresa, pessoa e situação e a marca de situação;
  - **envio:** o tipo filtra a quem o documento pertence, e a validade é sugerida pelo tipo e pode ser editada. Tem campos de exercício e de atestado;
  - **ações:** abrir, baixar, substituir, editar os dados, excluir e ver os substituídos;
  - **aba Tipos:** os padrões ficam só para leitura, e a conta pode criar os seus;
  - **aviso:** campo "Avisar X dias antes".
- **Card no Início:** documentos válidos, vencendo e vencidos, com link para a lista filtrada.
- **Notificações:** o rótulo do tipo novo, e o link abre o documento (`/documentacao/documentos?documento=<id>`).
- **Cliente da API:** `tendersApi.ts` ganha o envio multipart e o download em blob com o token. É o mesmo método do `contractsService`, com o tratamento de erro do `tendersApiError`.
- **Query keys** novas em `tendersQueryKeys`, com o prefixo `['tenders', 'documentation', ...]`.

**Parte B:**
- **Modelos:**
  - lista por categoria, com as marcas "Padrão", "Editado nesta conta" e "Sempre";
  - ações: editar, duplicar, restaurar padrão, ativar ou desativar e gerar avulso.
- **Editor TipTap:**
  - StarterKit limitado, `TextAlign` e tabela simples;
  - nós próprios `variable` (em linha) e `variableBlock` (em bloco);
  - barra de formatação com só o que é permitido;
  - painel do catálogo: o clique insere a variável;
  - prévia ao lado, com a escolha dos dados de exemplo (empresa e pessoa).
- **Variável vazia:** aparece destacada na prévia e no diálogo de confirmação antes do download.

**Parte C:**
- **Preparações:** cards com licitação, empresa, progresso e contagem até a sessão (`CountdownBadge`), filtro por situação e "Nova preparação manual".
- **Área de trabalho** (`/documentacao/preparacoes/:id`):
  - **cabeçalho:** licitação, empresa, quem participa, data da sessão e "X de Y prontos";
  - **esquerda:** as seções com a situação de cada uma e o "Próximo";
  - **centro:** primeiro as pendências; os itens prontos ficam recolhidos;
  - **direita:** a prévia, com o clique na variável vazia;
  - **por item:** prévia, baixar PDF ou DOCX, anexar a versão assinada, trocar o documento, editar só nesta licitação, dispensar e remover;
  - **no celular:** abas Pendências, Seções e Prévia.
- **Seção Proposta:** tabela de itens editável, "importar do PNCP" e os totais.
- **Entradas:**
  - botão "Preparar documentação" no detalhe do edital (`NoticeDetailView`);
  - ação no card do Acompanhamento (`TrackingActions` ou `MoveMenu`).
- **Download:**
  - o ZIP do pacote e o PDF único;
  - confirmação que lista os vencidos e os que vencem antes da sessão;
  - histórico de versões.

**Prévia (confirmada pelo usuário em 2026-10-14):**
- **Como funciona:** o servidor devolve o documento já preenchido, em formato estruturado, 500 ms depois da última mudança. O front monta a prévia em HTML, com as variáveis vazias clicáveis, e o "Ver PDF" abre o PDF real do servidor.
- **O que garante:** o texto é sempre o mesmo do PDF, porque só o servidor preenche; muda só a diagramação na tela.

**Testes (`tsx --test`, só utilitários):** situação e rótulos, filtros, validade sugerida, agrupamento do catálogo, montagem da prévia HTML a partir do documento estruturado e a lista de pendências exibida.

### Backend

**Estrutura:**
- **Rotas:** `backend/src/modules/tenders/routes/documentation/`, montadas em `routes/index.ts` depois da trava do módulo: `routes.use('/documentation', documentationRoutes(deps))`.
- **Regras:** `backend/src/modules/tenders/services/documentation/`.
- **Geração:** `services/documentation/rendering/`.
- **Rotina do coletor:** `collector/documentReminders.ts`.

**Convenções do módulo:**
- envelope `{ success, data }`;
- validação 400 com `errors[]` (`express-validator` e `validate`);
- `tenderRoute(...)` para os erros;
- datas em ISO com o fuso de Brasília;
- `deps.now()` nas datas;
- a conta sempre vem de `req.tenderAccess`.

**Endpoints, Parte A** (`/api/tenders/documentation`):
- `GET|POST /companies`, `GET|PUT /companies/:id`, `PATCH /companies/:id/active`.
- `POST|GET /companies/:id/logo`: PNG ou JPG, redimensionado com `sharp` no método das fotos de produto.
- `GET /companies/account-prefill`: os dados da conta PJ da requisição.
- `GET|POST /people`, `GET|PUT /people/:id` (com os papéis no corpo), `PATCH /people/:id/active`; `GET /people/linkable-users` (os usuários com acesso à conta).
- `GET|POST /document-types`, `PUT /document-types/:id`, `PATCH /document-types/:id/active` (só os tipos da conta).
- `GET|POST /documents`:
  - o `POST` é multipart (arquivo e campos);
  - o `GET` tem os filtros `companyId`, `personId`, `typeId`, `status`, `includeReplaced`.
- `GET|PUT|DELETE /documents/:id`, `GET /documents/:id/file`.
- `GET|PUT /settings`: aviso em dias, de 1 a 90.
- `GET /summary`: as contagens do card do Início.

**Endpoints, Parte B:**
- `GET /variables`: o catálogo, com grupo, chave, rótulo, exemplo, origem (`source`: entidade e campo, para o preenchimento no documento) e o tipo (texto ou bloco).
- `GET|POST /templates`, `GET|PUT /templates/:id` (o `PUT` num padrão cria a versão da conta), `POST /templates/:id/restore`, `PATCH /templates/:id/settings` (`always`, `active`).
- `POST /templates/preview`: conteúdo e contexto (`companyId`, `personId` ou dados de exemplo). Devolve o documento preenchido estruturado e a lista de faltantes; com `format=pdf`, devolve o PDF.
- `POST /templates/:id/render`: `format` (`pdf` ou `docx`), `companyId`, `personId` e `confirmMissing`. Sem confirmação e com faltantes, responde 409 com a lista.
- Limite por usuário (`userRateLimiter`) na prévia e na geração.

**Endpoints, Parte C:**
- `GET|POST /preparations`: a criação recebe `noticeId` ou os dados manuais, mais `companyId`, `representativeId` e `listId` opcionais.
- `GET|PATCH|DELETE /preparations/:id`, `POST /preparations/:id/complete`.
- Itens:
  - `POST /preparations/:id/items`, `PATCH|DELETE /preparations/:id/items/:itemId`;
  - `PUT /preparations/:id/items/:itemId/documents`, a escolha dos documentos de tipos que aceitam vários;
  - `POST|DELETE /preparations/:id/items/:itemId/signed` (multipart);
  - `GET /preparations/:id/items/:itemId/preview`, `GET /preparations/:id/items/:itemId/file?format=pdf|docx&confirmMissing=`.
- Proposta e listas:
  - `PUT /preparations/:id/proposal-items`, `POST /preparations/:id/proposal-items/import`;
  - `POST /preparations/:id/apply-list/:listId`, `POST /preparations/:id/copy-from/:otherId`.
- Sugestões: `GET /preparations/:id/suggestions`, as regras com as ações sugeridas.
- Pacote:
  - `POST /preparations/:id/versions`: cria a versão só se algo mudou; com faltantes, pede `confirmMissing`;
  - `GET /preparations/:id/versions`;
  - `GET /preparations/:id/versions/:versionId/package.zip`, `.../package.pdf`;
  - `GET /preparations/:id/pending-report.pdf`.
- Listas: `GET|POST /document-lists`, `GET|PUT|DELETE /document-lists/:id`.
- Índices: `PUT /documents/:id/balance-indices`.

**Regras puras, cada uma com teste:**
- `documentStatus`: situação, conforme a data de referência e os dias de aviso.
- `suggestedExpiry`: a validade sugerida pelo tipo.
- `companyInput`, `personInput`: CNPJ e CPF com dígito (os validadores de `middleware/validation.ts`), porte, UF, CEP, IBGE, e o CPF obrigatório para quem assina.
- `templateContent`: o schema zod do conteúdo TipTap, uma lista fechada:
  - nós `doc`, `paragraph`, `heading` (1 a 3), `text`, `hardBreak`, `bulletList`, `orderedList`, `listItem`, `table`, `tableRow`, `tableCell`, `tableHeader`, `variable`, `variableBlock`;
  - marcas `bold`, `italic`, `underline`; atributo `textAlign`;
  - chave de variável só do catálogo;
  - até 200 KB.
- `variables`: o catálogo e o preenchimento, com a lista de faltantes por campo de origem.
- `qualification`: o texto de qualificação da pessoa e da empresa.
  - **Concordância:** pelo tratamento. Sr. dá "portador" e "inscrito"; Sra. dá "portadora" e "inscrita"; sem tratamento, "portador(a)".
  - **Faltantes:** cada dado que falta vira faltante, com nome.
- `writtenNumbers`: o valor por extenso **escrito**, com acentos, até bilhões e "de reais" nos milhões redondos. É uma função nova: a do `assistantVoice.ts` é para fala, sem acentos, e fica como está.
- `writtenDates`: "13 de outubro de 2026" e "Limeira, 13 de outubro de 2026".
- `signatureBlock`: os assinantes conforme o modelo e o contexto. Com `REPRESENTANTE`, assina quem participa, como sócio ou como procurador. Com `SOCIOS`, assina o sócio escolhido, ou todos os sócios-administradores se algum não "assina sozinho". Com `SOCIO_E_CONTADOR`, assinam o sócio e o contador.
- `preparationRules`: as sugestões e os avisos (tabela em "Regras de negócio").
- `preparationStatus`: a situação de cada item e as pendências.
- `platformName`: a plataforma pelo domínio do `link_sistema_origem`.
- `balanceIndices`: LG, SG e LC, com a divisão por zero tratada.
- `packageLayout`: as pastas, a ordem e nomes de arquivo seguros.

**Geração (`rendering/`):**
- `resolveTemplate(content, context)` monta o documento estruturado, com as variáveis preenchidas e as faltantes marcadas.
- `renderPdf` (`pdfmake`) e `renderDocx` (`docx`) recebem o mesmo documento estruturado.
- **Papel timbrado:** no cabeçalho, logo, razão social, CNPJ e endereço; no rodapé, o texto e a numeração das páginas.
- **Fontes:** a configuração de fontes do `pdfmake` sai do `reportPdf.ts` para um módulo comum (`backend/src/services/pdfmakeSetup.ts`). O relatório do Finanças continua igual.
- **Resultado determinístico:** as datas vêm de `deps.now()`, em ordem explícita.

**Pacote:**
- ZIP com `archiver` em fluxo direto na resposta;
- PDF único com `pdf-lib`: índice gerado pelo `pdfmake`; JPG e PNG viram página;
- limite de 50 MB de entrada e 400 páginas. Acima disso, 413 com a mensagem "use o ZIP";
- um PDF único por vez no servidor. Se já houver um em andamento, 429 com "tente de novo em instantes".

**Arquivos no disco:**
- pastas `uploads/licitacoes/documentos`, `logos`, `assinados` e `versoes`;
- nome gerado (`randomUUID`) e `path.basename`;
- o tipo é conferido pelo conteúdo, reaproveitando `checkAttachmentUpload` e `contentDisposition` de `contractAttachmentType.ts`;
- os mesmos cabeçalhos de download dos anexos de contrato (`nosniff`, CSP `sandbox`, `no-store`);
- ao excluir no banco, o arquivo sai do disco.

**PNCP:**
- o `pncpItemSchema` de `services/pncpDetails.ts` passa a ler `tipoBeneficio` e `tipoBeneficioNome`;
- o `NoticeItem` ganha `benefitName`;
- a aba Itens do detalhe pode mostrar esse campo, sem mudança obrigatória.

**Acompanhamento:** começar uma preparação de edital sem acompanhamento, ou em "Analisar", grava "Vou participar" pelo serviço que já existe, com o histórico na mesma transação. Em "Descartado", não muda e mostra um aviso.

**Rotina do coletor (Parte A):**
- `runDocumentReminders(context)` em `collector/runs.ts`, com `withCollectionRun` e o tipo novo `AVISOS_DOCUMENTOS` na trava `maintenance`;
- comando `document-reminders` no `collector/cli.ts`;
- a lógica fica em `collector/documentReminders.ts`, com SQL parametrizado e `ON CONFLICT DO NOTHING`, no método de `collector/notifications.ts`.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**Migrations:**
- três arquivos SQL, um por parte;
- o cabeçalho segue o padrão do projeto: objetivo, ORDEM e REVERSÃO;
- tabelas e colunas em português, no schema `licitacoes`;
- tudo novo vai no Drizzle em `backend/src/modules/tenders/db/documentationSchema.ts`, reexportado em `db/schema.ts` (para entrar no `drizzle({ schema })` de `routes/deps.ts`).

**`0087_licitacoes_documentacao_cadastros.sql` (Parte A)**
- **`licitacoes.empresa`:**
  - `conta_id` (FK para `contas`, cascade), `razao_social` e `cnpj` obrigatórios;
  - nome fantasia, inscrições estadual e municipal;
  - `porte` (`CHECK`: MEI, ME, EPP, DEMAIS);
  - data de abertura, capital social, CNAE principal e secundários (`varchar[]`);
  - endereço (CEP, logradouro, número, complemento, bairro, município IBGE e nome, UF), telefone, e-mail;
  - banco, agência, conta, Pix;
  - `possui_sicaf`, `validade_proposta_dias` (padrão 60);
  - `logo_arquivo`, `logo_formato`, `rodape`;
  - `ativa`, autor e datas;
  - `UNIQUE (conta_id, cnpj)`.
- **`licitacoes.pessoa`:**
  - `conta_id`, `usuario_id` (opcional, FK para `usuarios` com SET NULL, `UNIQUE (conta_id, usuario_id)` parcial);
  - `nome`, `cpf` (opcional na tabela; obrigatório no serviço para quem assina; `UNIQUE (conta_id, cpf)` parcial);
  - RG, órgão emissor e UF;
  - `tratamento` (`CHECK`: SR, SRA, nulo), nacionalidade, estado civil, profissão;
  - endereço, e-mail, telefone;
  - conselho, registro e UF;
  - `ativa` e datas.
- **`licitacoes.empresa_pessoa`:**
  - `conta_id`, `empresa_id`, `pessoa_id` (cascade);
  - `papel` (`CHECK`: SOCIO_ADMINISTRADOR, PROCURADOR, SEM_REPRESENTACAO, CONTADOR, RESPONSAVEL_TECNICO);
  - `cargo`, `assina_sozinho` (padrão `true`);
  - `UNIQUE (empresa_id, pessoa_id, papel)`.
- **`licitacoes.documento_tipo`:**
  - `conta_id` (nulo para o padrão do sistema), `slug` (`UNIQUE` entre os padrões), `nome`;
  - `categoria` (`CHECK`: CREDENCIAMENTO, HABILITACAO_JURIDICA, FISCAL_TRABALHISTA, ECONOMICO_FINANCEIRA, TECNICA, CADASTROS, OUTROS);
  - `escopo` (`CHECK`: EMPRESA, PESSOA, EMPRESA_PESSOA);
  - `multiplos`, `validade_dias_sugerida`, `link_emissao`, `ordem`, `ativo`.
- **Seed dos tipos padrão**, a lista do prompt ajustada:
  - uma "Documento de identidade" para qualquer pessoa;
  - "Procuração" (EMPRESA_PESSOA);
  - "Balanço patrimonial" e "DRE" com vários, por exercício;
  - atestado com vários;
  - CND Federal 180 dias, CRF do FGTS 30, CNDT 180; as demais sem validade sugerida;
  - os links de emissão são conferidos na implementação.
- **`licitacoes.documento`:**
  - `conta_id`, `tipo_id` (RESTRICT), `empresa_id` e `pessoa_id` (cascade; `CHECK` de que um dos dois existe);
  - `arquivo`, `nome_original`, `formato` (`CHECK`: pdf, jpg, png), `tamanho`;
  - `data_emissao`, `data_validade`, `emissor`, `observacao`, `exercicio`;
  - `atestado_objeto`, `atestado_periodo_inicio`, `atestado_periodo_fim`, `atestado_quantitativos`;
  - `substituido_por` (FK para si mesmo, SET NULL), `substituido_em`, `enviado_por`, datas.
  - Índices: `(conta_id, tipo_id) WHERE substituido_por IS NULL` e `(conta_id, data_validade) WHERE substituido_por IS NULL AND data_validade IS NOT NULL`.
- **`licitacoes.conta_habilitada`:** `ADD COLUMN aviso_documentos_dias smallint NOT NULL DEFAULT 15` (`CHECK` de 1 a 90).
- **`licitacoes.notificacao`:**
  - `tipo`: troca o `CHECK` da 0073 para incluir `DOCUMENTO_VENCENDO`. O nome da constraint é conferido no banco antes;
  - `ADD COLUMN documento_id bigint` (FK para `documento`, cascade);
  - `CREATE UNIQUE INDEX ux_notificacao_documento ON (conta_id, usuario_id, tipo, documento_id, coalesce(referencia, '')) WHERE documento_id IS NOT NULL`. O índice atual não impede a repetição quando `edital_id` é nulo.
- **`licitacoes.coleta_execucao.tipo`:** troca o `CHECK` para incluir `AVISOS_DOCUMENTOS`, no método da 0085.
- **`GRANT` ao `licitacoes_coletor`, só se o papel existir** (bloco `DO $$` da 0080 e da 0085):
  - `SELECT` em `empresa`, `pessoa`, `documento` e `documento_tipo`;
  - **colunas** `contas (id, usuario_id)` e `conta_membros (conta_id, usuario_id, status)`, só para leitura, para achar o titular e a equipe ativa.

**`0088_licitacoes_documentacao_modelos.sql` (Parte B)**
- **`licitacoes.modelo`:**
  - `conta_id` (nulo para o padrão), `padrao_id` (FK para si mesmo; versão da conta de um padrão; `UNIQUE (conta_id, padrao_id)` parcial);
  - `slug` (só os padrões), `nome` (nulo na versão da conta que só muda a configuração);
  - `categoria` (`CHECK`: CREDENCIAMENTO, DECLARACAO, PROPOSTA, HABILITACAO, OUTROS);
  - `conteudo jsonb`: nulo na versão da conta, que então usa o texto do padrão;
  - `assinantes` (`CHECK`: REPRESENTANTE, SOCIOS, SOCIO_E_CONTADOR);
  - `sempre`, `ativo`, `ordem`;
  - `usa_licitacao`: calculado ao salvar, porque o modelo sem variável `licitacao.*`/`proposta.*` gera documento reaproveitável;
  - autor e datas.
- **Seed dos 20 modelos padrão:** o conteúdo em JSON do TipTap. Um teste de banco confere se todos passam pelo schema e geram PDF e DOCX.

**`0089_licitacoes_documentacao_preparacao.sql` (Parte C)**
- **`licitacoes.preparacao`:**
  - `conta_id`, `empresa_id` (RESTRICT), `representante_pessoa_id` (RESTRICT, opcional até ser escolhido);
  - `edital_id` (FK para `edital`, **SET NULL**: a limpeza dos editais continua igual);
  - cópia dos dados: órgão, unidade, UASG, município, UF, esfera, modalidade (id e nome), modo de disputa, número, processo, objeto, SRP, plataforma e amparo legal;
  - `data_sessao`, `declaracao_unica`, `proposta_nao_se_aplica`;
  - validade da proposta, prazo de entrega, condições de pagamento, garantia;
  - índices mínimos (LG, SG, LC);
  - `status` (`CHECK`: EM_ANDAMENTO, CONCLUIDA), autor e datas;
  - `UNIQUE (conta_id, edital_id, empresa_id) WHERE edital_id IS NOT NULL`;
  - índice `(conta_id, status, atualizado_em DESC)`.
- **`licitacoes.preparacao_item`:**
  - `conta_id`, `preparacao_id` (cascade), `secao` (`CHECK`: CREDENCIAMENTO, PROPOSTA, DECLARACOES, HABILITACAO_JURIDICA, FISCAL_TRABALHISTA, ECONOMICO_FINANCEIRA, TECNICA, OUTROS);
  - `modelo_id` ou `documento_tipo_id` (`CHECK num_nonnulls(...) = 1`);
  - `titulo`, `conteudo_ajustado jsonb`, `dispensado`, `motivo_dispensa`, `ordem`;
  - versão assinada: `assinado_arquivo`, `assinado_nome_original`, `assinado_tamanho`, `assinado_hash` (o hash do conteúdo gerado quando a assinada foi anexada, para marcar "desatualizado"), `assinado_em`, `assinado_por`.
- **`licitacoes.preparacao_item_documento`:** `(item_id, documento_id)`, a escolha dos documentos de tipo com vários. O de tipo único usa sempre o documento atual, não substituído.
- **`licitacoes.preparacao_proposta_item`:**
  - número do item, descrição, unidade, quantidade, valor estimado unitário, orçamento sigiloso, `beneficio_me_epp`;
  - marca, modelo, valor unitário, ordem;
  - `UNIQUE (preparacao_id, numero_item)`.
- **`licitacoes.preparacao_versao`:**
  - `numero`, `manifesto jsonb` (as entradas do pacote), `hash` (para não repetir a versão), `gerada_por`, `gerada_em`;
  - `UNIQUE (preparacao_id, numero)`.
  - **`licitacoes.preparacao_versao_documento`:** `(versao_id, documento_id)`, com o documento em **RESTRICT**. Assim, um anexo usado num pacote do histórico não é excluído.
- **`licitacoes.lista_documentos`:** `conta_id`, nulo para as listas do sistema ("Pregão eletrônico", "Dispensa", "Obras"), e `nome`.
  - **`licitacoes.lista_documentos_item`:** `secao`, `modelo_id` ou `documento_tipo_id`, `ordem`.
- **`licitacoes.indice_balanco`:**
  - `documento_id` (PK, FK para `documento`, cascade), `conta_id`;
  - AC, ARLP, AT, PC, PNC e PL (`numeric(18,2)`), `atualizado_em`.

**RLS:** o projeto não usa RLS em nenhuma tabela. O isolamento é o filtro por `conta_id` em toda consulta, como no resto do módulo.

### Infra/Deploy

- **Bibliotecas novas:**
  - backend: `docx`, `archiver` (+ `@types/archiver`), `pdf-lib`;
  - front: TipTap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-align` e a de tabela).
  - Antes de instalar, conferir o `engines.node`, que precisa aceitar o 22.17, a compatibilidade com o React 19 e o efeito no lockfile.
- **Disco do Render** (1 GB, dividido): pastas novas em `uploads/licitacoes/`.
  - O ZIP não fica guardado, e as versões guardam só os documentos gerados (pequenos).
  - Conferir no painel do Render o espaço usado antes do merge da Parte A.
  - Se precisar crescer, o Render cobra US$ 0,25 por GB/mês.
- **Rotina diária:**
  - etapa nova `tenders-document-reminders` em `DAILY_JOB_STEPS` e `dailyJobSteps(now)`, logo depois de `tenders-deadline-reminders`, e o mapa em `dailyJobs.ts`;
  - roda no runtime do coletor;
  - não tem variável de ambiente nova nem agendamento novo;
  - a consulta leva segundos, e o custo do Cron Job não muda (US$ 1 mínimo).
- **Memória (Starter, 512 MB):** o ZIP é montado em fluxo, e o PDF único tem limite e roda um por vez.
- **Ordem de cada parte:** aplicar a migration na produção, com a confirmação do usuário, **antes** do merge que publica o código.
- **Variáveis de ambiente:** nenhuma nova. O `.env` não muda.

## Arquivos provavelmente afetados

**Backend**
- `backend/drizzle/0087_licitacoes_documentacao_cadastros.sql`, `0088_licitacoes_documentacao_modelos.sql`, `0089_licitacoes_documentacao_preparacao.sql`
- `backend/src/modules/tenders/db/schema.ts` (reexportação, `notificacao.documento_id`, `conta_habilitada.aviso_documentos_dias`) e `db/documentationSchema.ts` (novo)
- `backend/src/modules/tenders/domains.ts`: os tipos novos de notificação e de execução, papéis, porte, categorias, seções, situações.
- `backend/src/modules/tenders/routes/index.ts` e `routes/documentation/*` (novo).
- `backend/src/modules/tenders/services/documentation/*` (novo), inclusive `rendering/*`.
- `backend/src/modules/tenders/services/pncpDetails.ts`: o `tipoBeneficio`.
- `backend/src/modules/tenders/collector/documentReminders.ts` (novo), `collector/runs.ts`, `collector/cli.ts`.
- `backend/src/services/dailyJobSteps.ts`, `dailyJobs.ts` e o teste da rotina.
- `backend/src/services/pdfmakeSetup.ts` (novo) e `reportPdf.ts`, só a importação das fontes.
- `backend/src/modules/tenders/README.md` e `tenders.http`, a documentação da API.
- `backend/package.json` e o lockfile.

**Front**
- `src/tenders/utils/navigation.ts`, `src/tenders/TendersApp.tsx`
- `src/tenders/services/tendersApi.ts` (envio e download), `services/queryKeys.ts`, `services/documentationService.ts` (novo)
- `src/tenders/screens/documentation/*`, `src/tenders/components/documentation/*`, `src/tenders/utils/documentation/*` (novos)
- `src/tenders/screens/HomeScreen.tsx` (o card), `components/NoticeDetailView.tsx` e `TrackingActions.tsx`/`MoveMenu.tsx` (as entradas)
- `src/tenders/utils/labels.ts`, `utils/notifications.ts`, `utils/collectionRuns.ts`, `types.ts`: os tipos novos de notificação e de execução.
- `src/screens/public/legalContent.ts`: Privacidade.
- `package.json` e o lockfile.

## Estratégia de implementação

**Antes de começar:** esperar o `/finalizar` da branch `feat/R/licitacoes-contratos-a-vencer`, do outro chat. Ela mexe em `schema.ts`, `domains.ts`, `dailyJobSteps.ts`, `labels.ts` e `collectionRuns.ts`. Cada parte nasce numa branch própria, a partir da `main` atualizada: `feat/R/licitacoes-documentacao-a`, `-b` e `-c`.

### Parte A: cadastros e documentos

1. Conferir no banco local os nomes das constraints `CHECK` de `notificacao.tipo` e `coleta_execucao.tipo`, e a numeração livre das migrations.
2. Escrever a `0087` (seção Banco de dados), com cabeçalho, ORDEM e REVERSÃO. **Não aplicar sem confirmação.**
3. Schema do Drizzle (`documentationSchema.ts`, reexportado) e os domínios novos em `domains.ts`.
4. Regras puras e os testes delas: `companyInput`, `personInput`, `documentStatus`, `suggestedExpiry`.
5. Serviços:
   - empresas, com o "puxar da conta" e o logo;
   - pessoas, com os papéis e o login ligado só a usuário com acesso à conta;
   - tipos e documentos: envio, substituição, exclusão com remoção do arquivo e situação;
   - configurações e resumo.
6. Rotas `routes/documentation/*` com as validações e a conferência de conta em todo id.
7. Rotina: `collector/documentReminders.ts`, `runDocumentReminders` (tipo `AVISOS_DOCUMENTOS`), o comando do CLI e a etapa na rotina diária.
   - **Destinatários:** o titular e os colaboradores ativos com acesso.
   - **Contas:** só as com `fn_conta_com_acesso`.
   - **Documentos:** só os atuais, com validade entre hoje e hoje + `aviso_documentos_dias`.
   - **Referência da notificação:** a data de validade.
   - **Link:** `/documentacao/documentos?documento=<id>`.
8. Front:
   - cliente de envio e download, query keys e serviço;
   - navegação "Documentação";
   - telas Empresas, Pessoas e Documentos (com Tipos e o prazo do aviso);
   - card no Início;
   - rótulos novos em notificações e na Coleta.
9. Privacidade (`legalContent.ts`), README do módulo e `tenders.http`.
10. Testes e validações. Aplicar a `0087` no banco local, só com a confirmação do usuário, para os testes de banco. **Parar para a validação do usuário.**

### Parte B: modelos e geração

11. Escrever a `0088`, com a tabela e o seed dos 20 modelos. **Não aplicar sem confirmação.**
12. `pdfmakeSetup.ts`: tirar a configuração de fontes do `reportPdf.ts` sem mudar o relatório, que continua testado.
13. Regras puras e os testes delas: `templateContent`, `variables` (catálogo, origem e faltantes), `qualification`, `writtenNumbers`, `writtenDates`, `signatureBlock`.
14. Geração: `resolveTemplate`, `renderPdf`, `renderDocx` e o papel timbrado.
15. Serviços e rotas dos modelos:
    - o padrão e a versão da conta;
    - restaurar e configurar;
    - prévia (o documento estruturado ou o PDF);
    - geração avulsa (409 com os faltantes sem confirmação);
    - limite por usuário.
16. Front:
    - lista de modelos;
    - editor TipTap com os nós próprios e o catálogo (carregado com `React.lazy`);
    - prévia HTML ao vivo (500 ms) e "Ver PDF";
    - geração avulsa com a confirmação dos faltantes.
17. Escrever os textos dos 20 modelos (Lei 14.133/2021 e LC 123/2006), conferidos por um teste de banco que gera PDF e DOCX de todos com dados de exemplo.
18. **Apresentar os 20 textos ao usuário para revisão antes do `/finalizar` da Parte B.** Parar para a validação.

### Parte C: área de trabalho, proposta, pacote e índices

19. Escrever a `0089`. **Não aplicar sem confirmação.**
20. Regras puras e os testes delas: `preparationRules`, `preparationStatus`, `platformName`, `balanceIndices`, `packageLayout`.
21. `pncpDetails.ts`: ler o `tipoBeneficio`, com o teste da conversão.
22. Serviços da preparação:
    - **criação:** "começar pelo fim".
      - Copia os dados do edital ou os manuais.
      - A empresa é escolhida sozinha quando só há uma ativa.
      - Quem participa é a pessoa ligada ao usuário logado, se ela tem papel de assinatura na empresa; se não, o primeiro sócio-administrador.
      - Os itens vêm dos modelos "sempre", das regras e da lista escolhida.
      - A proposta é importada do PNCP.
      - O edital vai para "Vou participar".
    - itens, versão assinada, ajuste só nesta licitação, dispensa;
    - proposta (com a reimportação que mantém o que o usuário preencheu, pelo número do item);
    - listas, copiar da anterior, sugestões.
23. Pacote:
    - **versão:** só quando o hash do manifesto mudou;
    - **o que guarda:** os gerados em PDF e DOCX, mais as referências aos anexos;
    - **ZIP em fluxo:** a assinada no lugar do gerado, quando existe; a pasta "Editáveis (DOCX)" e o `Pendencias.pdf`;
    - **PDF único:** com limite e um por vez;
    - **relatório de pendências**.
24. Índices contábeis: a tela de valores no balanço, o cálculo, as variáveis `indices.*` e o bloco `indices.tabela`, e a comparação com o mínimo da preparação.
25. Front:
    - lista de preparações;
    - área de trabalho (cabeçalho, seções com "Próximo", pendências, prévia com o clique na variável vazia gravando na origem certa, abas no celular);
    - seção Proposta;
    - confirmação de vencidos e faltantes antes do download;
    - histórico de versões;
    - listas;
    - entradas no detalhe do edital e no Acompanhamento.
26. README do módulo, `tenders.http`, testes e validações. **Parar para a validação do usuário.**

## Regras de negócio identificadas

1. **Finalidade:** cadastrar uma vez e montar o pacote de cada licitação em minutos.
2. **Sem IA.** O usuário lê o edital e marca o que ele pede.
3. **Várias empresas por conta** (decisão 1). O CNPJ não se repete na mesma conta.
4. **Toda a equipe com acesso usa e edita tudo** (decisão 3): empresas, pessoas, documentos, modelos e preparações.
5. **Papel por empresa:**
   - **Sócio-administrador:** dispensa a procuração e assina em nome próprio.
   - **Procurador:** exige a procuração e assina como procurador.
   - **Sem representação:** só prepara e não assina.
   - **Contador e responsável técnico:** assinam os documentos que pedem esses papéis.
   - Quem tem papel de assinatura precisa de CPF.
6. **Procuração ampla, válida para todas as licitações:**
   - é gerada no sistema (o sócio assina; os dois, se o sócio não "assina sozinho") ou anexada (a pública, de cartório, sempre anexada);
   - anexada uma vez por procurador e empresa, entra sozinha nos pacotes enquanto vale;
   - a validade é opcional.
7. **Tudo que é gerado é assinado fora do sistema.** O ciclo é gerar → baixar → assinar → anexar a assinada → pronto. Se os dados mudam depois, a assinada fica "desatualizada".
8. **Modelos:**
   - o sistema traz os padrões, e a conta cria os seus;
   - editar o texto de um padrão cria a versão da conta;
   - marcar "sempre" ou desativar não copia o texto, então as correções do padrão continuam chegando.
9. **Reaproveitamento:**
   - os cadastros e os modelos, sempre;
   - os documentos e a procuração ampla, até vencer;
   - os modelos sem variável da licitação, que geram documento genérico;
   - a seleção, por listas e "copiar da anterior".
10. **Situação do documento:** no cadastro, a referência é hoje; na preparação, é a data da sessão. A situação pode ser válido, vencendo (no prazo de aviso), vence antes da sessão, vencido ou sem validade.
11. **Validade sugerida pelo tipo:** CND Federal 180 dias, FGTS 30 e CNDT 180. Pode ser editada, e vale a data impressa na certidão.
12. **Aviso de vencimento:**
    - vai para todos com acesso à conta (decisão 4);
    - um aviso por documento e por data de validade;
    - prazo por conta, 15 dias por padrão (de 1 a 90).
13. **Substituição:** a certidão nova do mesmo tipo vira a atual, e a anterior fica no histórico. O anexo usado num pacote do histórico não pode ser excluído.
14. **Regras automáticas da preparação**, que sugerem e o usuário decide:

| Situação | Efeito |
|---|---|
| Porte MEI, ME ou EPP | Entra a declaração de ME/EPP |
| Porte Demais e item com benefício exclusivo ou cota para ME/EPP | Aviso: a empresa não disputa esses itens |
| Quem participa é procurador | Entram a procuração (a ampla válida, ou "Gerar"/"Anexar"), a identidade do procurador e a do sócio que outorga |
| Quem participa é sócio | Entra a identidade do sócio; não entra procuração |
| Modalidade presencial (5 ou 7) e procurador | Entra a carta de credenciamento |
| Registro de preços com procuração anexada | Lembrete: conferir o poder de assinar a ata |
| Esfera federal e empresa com SICAF | Aviso dos documentos que o SICAF substitui (art. 70) |
| Amparo legal da Lei 13.303 | Aviso: estatal; as declarações citam a 14.133 |
| Plataforma Compras.gov | Sugestão de dispensar, com o motivo "Declarado na plataforma", as declarações de habilitação, custos, ME/EPP, PcD e ciência do edital |
| Visita técnica e dispensa marcadas juntas | Aviso: escolher uma |

15. **ME/EPP com certidão fiscal vencida:** o aviso lembra dos 5 dias úteis para regularizar (LC 123, art. 43), e a certidão continua como pendência.
16. **Declaração única:** junta as declarações escolhidas, com uma assinatura.
17. **Variável vazia:** fica destacada e bloqueia a geração e o pacote até a confirmação. Com a confirmação, sai com um traço para preencher à mão.
18. **Pacote:**
    - ZIP com pastas na ordem `01_Credenciamento`, `02_Proposta`, `03_Declaracoes`, `04_Habilitacao_Juridica`, `05_Regularidade_Fiscal`, `06_Economico_Financeira`, `07_Qualificacao_Tecnica` e `08_Outros`, mais `Editaveis_DOCX` e `Pendencias.pdf`;
    - a versão assinada substitui o gerado;
    - o vencido entra só depois da confirmação, que lista os documentos, e aparece no relatório.
19. **Histórico** (decisão 5): cada versão guarda os gerados e as referências aos anexos. O ZIP é montado na hora, e a versão nova só sai quando algo mudou.
20. **Proposta:**
    - itens do PNCP, sem valor estimado no orçamento sigiloso;
    - destaque do valor acima do estimado;
    - total e extenso calculados;
    - validade padrão da empresa, que pode ser trocada;
    - dados bancários da empresa.
21. **Índices:** LG = (AC + ARLP) / (PC + PNC), SG = AT / (PC + PNC), LC = AC / PC. O mínimo da licitação é 1,0 por padrão. Abaixo dele, o aviso cita a comprovação por capital ou patrimônio mínimo (art. 69), se o edital permitir.
22. **Preparação e edital:** a preparação guarda uma cópia dos dados da licitação. A limpeza dos editais não apaga a preparação; só esvazia o vínculo.
23. **Começar uma preparação** muda o acompanhamento para "Vou participar", salvo quando o edital está "Descartado".

## Regras multi-tenant e segurança

- **De onde vem a conta:** sempre de `req.tenderAccess`, resolvida pela trava do módulo. Nunca do corpo nem da query, a não ser o `accountId` que a própria trava confere.
- **Filtro em toda consulta:** toda leitura e escrita filtra `conta_id`, inclusive nos joins (documento → tipo, empresa e pessoa; item → modelo, tipo e documento; versão → documento).
- **Ids cruzados:**
  - em toda escrita, `empresa_id`, `pessoa_id`, `documento_id`, `modelo_id`, `documento_tipo_id`, `lista_id`, `edital_id` e `usuario_id` precisam ser da mesma conta, ou ser padrões do sistema (`conta_id` nulo);
  - id de outra conta dá **404**, como no resto do módulo;
  - os padrões só podem ser lidos, e editá-los cria a versão da conta.
- **Login ligado à pessoa:** só um usuário com acesso à conta (o titular ou um colaborador ativo com acesso).
- **Arquivos:**
  - o nome é gerado, a pasta é fixa e o `path.basename` é aplicado;
  - o tipo é conferido pelo conteúdo;
  - o download confere a conta e usa os mesmos cabeçalhos dos anexos de contrato;
  - o nome das entradas do ZIP sai sem separador de pasta nem caractere inválido.
- **Conteúdo dos modelos:** é validado pela lista fechada ao salvar e de novo ao gerar. A variável fora do catálogo é recusada.
- **Rotina:** só as contas com `fn_conta_com_acesso`. O usuário restrito ganha só `SELECT` nas tabelas novas e em duas colunas de `contas` e três de `conta_membros`.
- **Mensagens e logs:** as mensagens de erro não revelam dado de outra conta. Os logs levam `userId`, `accountId` e o id do recurso, nunca CPF, RG ou o conteúdo de documento.
- **Limites:**
  - por usuário na prévia, na geração e no pacote (`userRateLimiter`);
  - tamanho dos arquivos (20 MB) e do conteúdo dos modelos (200 KB);
  - PDF único (50 MB e 400 páginas, um por vez).
- **LGPD:** os dados de terceiros (CPF, RG, endereço) ficam visíveis a toda a equipe da conta (decisão 3). A Privacidade passa a citar isso.

## Validações necessárias

- **Empresa:**
  - razão social obrigatória, até 150 caracteres;
  - CNPJ com dígito e único na conta;
  - porte da lista;
  - UF da lista e município IBGE com 7 dígitos;
  - CEP com 8 dígitos, e-mail válido;
  - CNAE no formato numérico;
  - validade da proposta de 1 a 365 dias;
  - logo PNG ou JPG até 20 MB.
- **Pessoa:**
  - nome obrigatório;
  - CPF com dígito e único na conta, obrigatório para quem tem papel de assinatura;
  - tratamento da lista;
  - UF;
  - login: usuário com acesso à conta e ainda não ligado a outra pessoa da conta;
  - papéis: empresa da conta, papel da lista, sem repetir o mesmo papel na mesma empresa.
- **Tipo de documento da conta:**
  - nome, categoria e escopo da lista;
  - validade sugerida de 1 a 3650 dias;
  - link com `https://`.
- **Documento:**
  - tipo ativo, da conta ou padrão;
  - dono coerente com o escopo do tipo;
  - arquivo conferido pelo conteúdo;
  - validade igual ou depois da emissão;
  - exercício de 1990 até o ano seguinte;
  - período do atestado coerente.
- **Configuração:** aviso de 1 a 90 dias.
- **Modelo:**
  - nome obrigatório;
  - categoria e assinantes da lista;
  - conteúdo pelo schema fechado, até 200 KB;
  - variáveis só do catálogo.
- **Prévia e geração:** formato `pdf` ou `docx`; `companyId` e `personId` da conta; `confirmMissing` booleano.
- **Preparação:**
  - `noticeId` existente, ou os dados manuais com órgão, número e objeto obrigatórios;
  - empresa da conta;
  - quem participa precisa ser sócio-administrador ou procurador daquela empresa;
  - data da sessão válida;
  - seção da lista;
  - item com modelo ou tipo (só um);
  - quantidade e valores não negativos;
  - índices mínimos de 0 a 10.
- **Ids nos parâmetros:** `idParam` de `routes/validators.ts`. As listas na query seguem os leitores de `requestReaders.ts`.

## Testes necessários

### Frontend

- `documentStatus` e rótulos: as quatro situações e a de vence antes da sessão.
- Validade sugerida a partir da emissão.
- Agrupamento do catálogo de variáveis e a origem de cada variável.
- Montagem da prévia HTML a partir do documento estruturado: marcas, listas, tabela, variável faltante clicável.
- Pendências: a ordem, a contagem "X de Y" e os itens recolhidos.
- Os parâmetros da URL das listas e filtros (empresa, pessoa, situação).

### Backend

**Sem banco (`npm --prefix backend test`):**
- `companyInput` e `personInput`: dígitos, porte, CPF obrigatório conforme o papel.
- `documentStatus` e `suggestedExpiry`.
- `templateContent`:
  - aceita os nós permitidos;
  - recusa nó desconhecido, marca não permitida, variável fora do catálogo e conteúdo grande.
- `variables`: preenchimento e faltantes, com a origem.
- `qualification`: Sr., Sra. e sem tratamento; com e sem RG; faltantes nomeados.
- `writtenNumbers`:
  - 0, 1, 100, 101 ("cento e um"), 1.000 ("mil"), 1.034 ("mil e trinta e quatro");
  - 1.200 ("mil e duzentos"), 1.234 ("mil duzentos e trinta e quatro");
  - 1.000.000 ("um milhão de reais"), 2.500.000 ("dois milhões e quinhentos mil reais");
  - 1.234.567,89, bilhões e centavos sozinhos.
- `writtenDates` e máscaras.
- `signatureBlock`: os três tipos de assinante, sócio que não "assina sozinho" e procurador.
- `preparationRules`: cada linha da tabela de regras.
- `preparationStatus`: modelo com faltante, sem assinada, desatualizado e pronto; documento faltando, vence antes da sessão, vencido e pronto; dispensado.
- `platformName`: Compras.gov, BLL, Licitanet, Portal de Compras Públicas, BNC, vazio e desconhecido.
- `balanceIndices`: cálculo e divisão por zero.
- `packageLayout`: pastas, ordem e nomes seguros.
- **Geração:** `renderPdf` devolve `%PDF` e `renderDocx` devolve um ZIP (`PK`), com o mesmo texto extraído do documento estruturado.
- **`pncpDetails`:** a conversão com o `tipoBeneficio`.
- **Rotina diária:** a ordem das etapas, com a etapa nova.

**Com banco local (`npm --prefix backend run test:tenders-db`):**
- **Isolamento:** a conta A não lê, não altera e não baixa nada da conta B (404 em todas as rotas novas).
- **Cadastros:**
  - CNPJ e CPF únicos por conta;
  - login só de usuário com acesso;
  - papel só de empresa da conta.
- **Documentos:**
  - envio com escopo coerente;
  - substituição;
  - exclusão remove o arquivo;
  - exclusão bloqueada para anexo usado numa versão (Parte C).
- **Avisos:**
  - um por usuário, documento e validade;
  - rodar de novo não repete;
  - só contas com acesso;
  - destinatários: o titular e os colaboradores ativos com acesso;
  - respeita o prazo da conta;
  - ignora os substituídos;
  - uma validade nova gera aviso novo.
- **Modelos:**
  - editar o padrão cria a versão da conta;
  - "sempre" sem copiar o texto;
  - restaurar;
  - **todos os 20 padrões passam pelo schema e geram PDF e DOCX** com dados de exemplo.
- **Preparação:**
  - criação a partir do edital (cópia, itens "sempre" e regras, proposta importada, acompanhamento em "Vou participar");
  - criação manual;
  - a preparação continua depois da limpeza do edital (`edital_id` vazio);
  - versão só quando algo muda;
  - a assinada vira desatualizada quando o dado muda;
  - lista e "copiar da anterior".
- **Rotas por HTTP (`routes.db.test.ts`):** envio multipart, cabeçalhos de download, 409 com faltantes, ZIP em fluxo, 413 do PDF único.

### E2E

O projeto não tem E2E automatizado. Testes manuais ao fim de cada parte:
- **A:**
  - cadastrar empresa (puxando da conta PJ) e duas pessoas (sócio e procurador, uma com login);
  - anexar CND, FGTS e uma procuração;
  - substituir uma certidão;
  - ver o card do Início;
  - rodar `document-reminders` no banco local e ver o aviso no sino;
  - conferir no celular.
- **B:**
  - editar um padrão, restaurar e marcar "sempre";
  - criar um modelo com tabela e variáveis;
  - ver a prévia ao vivo;
  - gerar a procuração ampla em PDF e DOCX e abrir no Word;
  - conferir que a variável vazia bloqueia;
  - revisar os 20 textos.
- **C:**
  - preparar um edital real do PNCP;
  - preencher pelo clique na prévia;
  - anexar as assinadas;
  - baixar o ZIP e o PDF único;
  - mudar a data da sessão e ver o "desatualizado" e o "vence antes da sessão";
  - preparar uma licitação manual;
  - usar uma lista e "copiar da anterior";
  - conferir no celular e o critério das 5 ações.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db

npx tsc --noEmit -p tsconfig.json
npm test
npm run build

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0087 --banco local
```

- O `test:tenders-db` só roda no banco local (`localhost:5433/sistema_financas_dev`).
- `migrations:aplicar` só com a confirmação do usuário. Na produção, também com `--banco producao --confirmo`, uma migration por vez, antes do merge de cada parte.

## Riscos e pontos de atenção

- **Textos jurídicos dos modelos:** um erro pode inabilitar a empresa. A revisão do usuário antes do merge da Parte B é obrigatória (decisão 7). A estatal (Lei 13.303) recebe um aviso.
- **PDF e DOCX são dois geradores:** a formatação limitada e o documento estruturado único reduzem a diferença. As fontes podem variar (Roboto no PDF, Arial no DOCX).
- **Prévia em HTML** (confirmada pelo usuário em 2026-10-14): a prévia em PDF não deixa clicar na variável vazia. Por isso, a prévia ao lado é montada em HTML a partir do documento já preenchido pelo servidor (o mesmo texto do PDF), e o "Ver PDF" abre o PDF real.
  - **Risco:** a diagramação na tela pode diferir um pouco do PDF.
  - **Mitigação:** o texto vem sempre do servidor, e o PDF real fica a um clique.
- **Disco de 1 GB dividido:**
  - nem o ZIP nem o edital ficam guardados;
  - as versões guardam só os gerados;
  - os anexos usados em versões ficam presos (RESTRICT).
  - Acompanhar o espaço no painel do Render.
- **Memória de 512 MB:** o ZIP é montado em fluxo; o PDF único tem limite e roda um por vez.
- **Migrations na produção:** são três (0087, 0088 e 0089), cada uma com a sua confirmação e aplicada antes do merge da sua parte.
  - Cada uma troca ou cria `CHECK` e índices. Os nomes das constraints são conferidos antes.
  - A 0087 dá ao `licitacoes_coletor` leitura de colunas em `contas` e `conta_membros`.
- **Conflito com a branch dos contratos:** os mesmos arquivos estão em mudança. Só começar depois do `/finalizar` dela.
- **Dependências novas:** conferir se rodam no Node 22.17 e no React 19. O TipTap entra com `React.lazy`, para não pesar o Início.
- **Dados pessoais de terceiros visíveis a toda a equipe** (decisão 3): a Privacidade cita isso, e nada sensível vai para os logs.
- **Links de emissão das certidões:** os sites do governo mudam de endereço. Conferir na implementação.
- **Volume:** a Parte C é a maior. A área de trabalho e o pacote concentram o risco de prazo.

## Perguntas em aberto

1. **Disco do Render:** quanto do 1 GB já está usado. Aparece no painel do Render, e só o usuário consegue ver. Conferir antes do merge da Parte A.

## Critérios de aceite do plano

**Parte A**
- Cadastrar várias empresas e pessoas, com papéis por empresa e login opcional; "puxar da conta PJ" funciona em conta PJ.
- Anexar, abrir, baixar, substituir e excluir documentos, com a situação certa e a validade sugerida pelo tipo.
- A rotina gera um aviso por usuário, documento e validade, para o titular e a equipe ativa com acesso, sem repetir, só nas contas com acesso.
- Nenhuma rota nem arquivo deixa uma conta ver dados de outra.

**Parte B**
- Os 20 modelos padrão geram PDF e DOCX com o mesmo conteúdo, e foram revisados pelo usuário.
- Editar um padrão cria a versão da conta; "sempre" e desativar não congelam o texto; restaurar volta ao padrão.
- A variável vazia aparece destacada na prévia e bloqueia o download até a confirmação.
- A prévia em HTML atualiza sozinha cerca de 500 ms depois da última mudança, com o mesmo texto do PDF, e o "Ver PDF" abre o arquivo real.

**Parte C**
- Com uma empresa e um procurador cadastrados e os documentos em dia, sair de "Preparar documentação" até baixar o ZIP leva no máximo 5 ações, depois de revisar as pendências.
- Nenhum documento vencido na data da sessão entra no pacote sem aviso claro.
- Mudar um dado depois de anexar a assinada marca o item como "desatualizado".
- A preparação continua inteira depois que a limpeza apaga o edital.
- As regras automáticas da tabela funcionam, e o usuário pode desfazer cada sugestão.
- O ZIP sai com as pastas na ordem, a versão assinada no lugar do gerado e o relatório de pendências.

## Observações para a skill implementar

- **Este plano é a fonte principal.** A análise (`.plans/analise-documentacao-licitacoes.md`) dá o contexto e o porquê.
- **Uma parte por vez.** Cada `/implementar` faz uma só parte (A, B ou C) e para no fim, para a validação do usuário e o `/finalizar` (merge em `main` só com a confirmação dele).
- **Esperar os contratos.** Só começar depois do `/finalizar` da branch `feat/R/licitacoes-contratos-a-vencer`. Uma branch por parte, a partir da `main` atualizada.
- **Migrations:**
  - **não executar sem confirmação explícita.** O `.env` da raiz aponta para a produção, e o banco local está no `.env.dev`;
  - aplicar uma por vez e nomeada; na produção, sempre antes do merge da parte;
  - nunca editar migration já aplicada.
- **Padrões do projeto:**
  - seguir o `/AGENT.md`: Drizzle nas consultas novas (SQL parametrizado só onde o módulo já usa, como na rotina de avisos), filtro de conta em toda consulta, nada de `any` nem `catch` silencioso;
  - identificadores em inglês, com tabelas, colunas e textos de tela em português;
  - seguir os métodos citados: anexos de contrato, painel de configurações do Finanças, `tenderRoute`, `validate`, `userRateLimiter`, `withCollectionRun`, `GRANT` dentro da migration.
- **Bibliotecas:** conferir o `engines.node` antes de instalar e parar, reportando, se nenhuma versão compatível servir.
- **Textos dos modelos:** na Parte B, apresentar os 20 ao usuário antes do `/finalizar` e corrigir o que ele pedir.
- **Documentação:** atualizar o README do módulo e o `tenders.http` em cada parte.
- **Fora do commit:** `.portal/` e `GLOSSARIO.md` nunca entram.
