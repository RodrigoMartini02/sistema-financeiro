# Análise: documentação para licitações

Análise de 2026-10-13, só de leitura, sem alterar código. Serve de base para o `/planejar`, quando você quiser.

**O que você já definiu:**
- não tem IA lendo o edital: você baixa, lê e marca os documentos pedidos;
- o sistema traz os modelos tradicionais com variáveis (empresa, município, processo...), e dá para criar modelos novos. Em cada licitação você escolhe quais usa;
- cada usuário tem um papel, sócio ou procurador: o sócio dispensa a procuração e o procurador exige;
- segue os mesmos métodos do Finanças (painel de configurações, modal de cadastro, validações, anexos), com as telas próprias de Licitações.

**Finalidade:**
- **O problema:** para cada licitação, a empresa licitante precisa entregar o pacote que o edital pede:
  - a proposta;
  - as declarações com os dados do processo;
  - a procuração, quando quem representa não é sócio;
  - os documentos de habilitação válidos na data da sessão.

  Hoje isso é feito à mão: copiar o Word, trocar órgão, processo e data, conferir validade, renomear e juntar. Leva horas, se repete a cada edital, e um erro inabilita a empresa (certidão vencida, processo errado, declaração faltando, assinatura de quem não pode).
- **O objetivo:** cadastrar uma vez e montar o pacote de cada licitação em minutos, sem esses erros.
- **Onde entra:** no fluxo que Licitações já tem: busca → "Vou participar" → preparar a documentação → sessão.

---

## Resumo

1. **O papel da pessoa decide metade do pacote.** Sócio ou procurador define a procuração, a carta de credenciamento, o documento de identidade e o bloco de assinatura de todos os documentos. Por isso a análise começa por aí.
2. **O PNCP já entrega quase todas as variáveis da licitação.** Órgão, unidade, município, UF, modalidade, número, processo, objeto, datas, registro de preços, lei usada e plataforma estão no edital guardado. Os itens da proposta vêm da API de itens, que a tela de detalhe já usa.
3. **Sem IA, a automação vem de regras.** O porte da empresa, o papel da pessoa, a modalidade, o registro de preços e o benefício para ME/EPP do item marcam e desmarcam documentos sozinhos.
4. **Quatro bibliotecas novas:** editor de texto (front), DOCX, ZIP e junção de PDFs. O PDF já é feito com o `pdfmake`.
5. **Cinco ajustes técnicos que não aparecem no pedido:**
   - a limpeza semanal apaga o edital encerrado há 12 meses;
   - o tipo de notificação tem trava no banco;
   - o aviso sem edital escapa da regra de não repetir;
   - o usuário de banco da rotina diária não enxerga tabelas novas;
   - Licitações não tem tela de "Meus dados".
6. **Custo:** sem IA, o custo é só de disco. O cenário mais provável é que o 1 GB atual aguente o primeiro ano; depois, US$ 0,25 por GB/mês.

---

## 1. Sequência sugerida

Cada etapa já é útil sozinha, mesmo sem as seguintes:

| # | Etapa | Por que nessa ordem | Já serve para |
|---|---|---|---|
| 1 | Empresa e pessoas (com o papel) | Tudo depende de quem é a empresa e de quem assina | Ter os dados prontos |
| 2 | Documentos anexados, validade e avisos | Não depende de modelo nem de licitação | Cofre de certidões com aviso de vencimento |
| 3 | Modelos, variáveis e geração (PDF e DOCX) | É a parte de maior risco técnico; precisa das etapas 1 e 2 para preencher | Gerar uma declaração avulsa |
| 4 | Licitação, escolha dos documentos e pacote | Junta 1, 2 e 3 | O fluxo completo |
| 5 | Proposta de preços | Usa os itens do PNCP e o gerador da etapa 3 | Proposta pronta |
| 6 | Índices contábeis | Pequena; depende do balanço da etapa 2 | Demonstrativo de índices |

---

## 2. Pessoas e papéis (sócio ou procurador)

### O que existe hoje

- **Papéis de acesso:** Licitações tem só titular e colaborador ([domains.ts](../backend/src/modules/tenders/domains.ts), `TENDER_ROLES`). Isso é acesso ao sistema, não o papel na empresa.
- **Novo usuário:** a tela pede nome, sobrenome, e-mail, senha e CPF, e o CPF é opcional ([AddUserDialog.tsx](../src/tenders/components/AddUserDialog.tsx)).
- **Dados da pessoa:** o cadastro de usuário (`usuarios`) tem nome, sobrenome, CPF, telefone, cidade, estado e nascimento. Não tem RG, nacionalidade, estado civil, profissão nem endereço completo.
- **Sem "Meus dados":** o menu do usuário em Licitações só tem "Sair" ([TendersUserMenu.tsx](../src/tenders/layout/TendersUserMenu.tsx)). Quem se cadastrou só por Licitações não tem onde completar os próprios dados.
- **Sócios do Finanças:** o sócio tem só nome, percentual e capital, e o capital lança receita no Finanças ([partners.ts](../backend/src/db/schema/partners.ts)). Não serve para licitação.

### Sugestão: o papel define o pacote

| Papel | Procuração | Carta de credenciamento | Identidade | Assinatura dos documentos |
|---|---|---|---|---|
| **Sócio-administrador** | Não entra | Entra só na sessão presencial | Do próprio sócio | Nome, CPF e "Sócio-administrador" |
| **Procurador** | Entra: a assinada e válida ou, sem ela, a gerada para assinar | Entra só na sessão presencial | Do procurador e do sócio que outorgou | Nome, CPF e "Procurador", com a referência à procuração |
| **Sem representação** | — | — | — | Não assina: só prepara a documentação |

O terceiro papel cobre quem monta os documentos mas não assina, como um auxiliar ou estagiário.

### Detalhes que fazem diferença

1. **Pessoa sem login:** o sócio que só assina a procuração, o contador e o responsável técnico nem sempre usam o sistema. A sugestão é um cadastro de **Pessoas**, em que cada pessoa pode ter ou não um login.
   - Na lista de usuários, o papel aparece direto (a sua ideia).
   - As pessoas sem login aparecem na mesma lista, marcadas "sem acesso".
2. **Papel por empresa:** com mais de uma empresa, a mesma pessoa pode ser sócia de uma e procuradora de outra.
3. **Assinatura em conjunto:** alguns contratos sociais exigem dois administradores juntos. Um campo "assina sozinho" no sócio faz a procuração sair com os dois.
4. **Outros papéis que os documentos pedem:**
   - **Contador:** nome, CRC e UF. O demonstrativo de índices e o balanço levam a assinatura dele;
   - **Responsável técnico:** conselho, registro e UF.
5. **Procuração:**
   - **Situações:** gerada (falta assinar) → assinada (anexada) → vencendo → vencida, com aviso no sino;
   - **Pública ou particular:** o sistema gera a particular, e a pública, feita em cartório, entra como anexo;
   - **Poderes marcados sozinhos:** com registro de preços, "assinar a ata"; com sessão presencial, "ofertar lances".
6. **Texto de qualificação:** a variável `qualificacao_completa` monta o texto padrão: "Fulano de Tal, brasileiro, casado, empresário, portador do RG nº ... e inscrito no CPF sob o nº ..., residente em ...". Ele usa os dados que hoje faltam no cadastro de usuário.
7. **"Meus dados" em Licitações:** cada pessoa completa os próprios dados, no mesmo método do "Meus dados" do Finanças. O titular continua podendo editar tudo.
8. **CPF obrigatório** para quem é sócio ou procurador. Para quem não assina, continua opcional.
9. **Quem pode ver os dados:** Licitações não tem permissões, e todo usuário com acesso usa tudo. CPF, RG e endereço dos sócios ficariam visíveis à equipe.
   - Sugestão: só o titular cadastra e edita empresa e pessoas, como já acontece em Configurações (`restricted: true` em [navigation.ts](../src/tenders/utils/navigation.ts)).
   - A equipe só usa esses dados nos documentos.

---

## 3. Empresa licitante

- **Puxar da conta:** a conta PJ já tem razão social, nome fantasia, CNPJ, enquadramento e data de abertura ([accounts.ts](../backend/src/db/schema/accounts.ts)), e um botão preenche a empresa com esses dados.
  - A conta de quem se cadastrou com CPF é pessoal: lá não há o que puxar.
- **Porte separado do tipo de empresa:** o enquadramento mistura porte (MEI, ME, EPP) com tipo de empresa (SLU, EIRELI, LTDA, SA) ([companyAccount.ts](../src/utils/companyAccount.ts)). Uma LTDA pode ser ME, então o porte precisa de um campo próprio: ME, EPP, MEI ou Demais. É ele que decide a declaração de ME/EPP.
- **Dados que só a licitação usa:**
  - inscrição estadual e municipal;
  - endereço completo;
  - capital social;
  - CNAE principal e secundários;
  - dados bancários e Pix, que vão para a proposta;
  - logo, cabeçalho e rodapé (o papel timbrado).
- **SICAF:** registrar que a empresa tem SICAF válido. Num órgão federal (esfera `F` no edital), o SICAF substitui parte da documentação fiscal (art. 70 da Lei 14.133), e o sistema pode avisar isso.
- **Várias empresas por conta:** fica para o `/planejar`. Quem é consultor e licita por vários CNPJs precisa; quem licita só pela própria empresa, não.

---

## 4. Documentos anexados (certidões)

### Tipos de documento

Cada tipo traz já preenchidos:
- a categoria (credenciamento, jurídica, fiscal, econômico-financeira, técnica, cadastros);
- a quem o documento pertence: à **empresa** (certidões), à **pessoa** (identidade) ou ao **procurador** (procuração);
- se aceita vários (os atestados, por exemplo);
- a **validade sugerida** e o **site que emite**:

| Documento | Validade sugerida | Onde emite |
|---|---|---|
| CND Federal (RFB/PGFN) | 180 dias | Receita Federal |
| CRF do FGTS | 30 dias | Caixa |
| CNDT | 180 dias | TST |
| CND Estadual e Municipal | Varia por estado e município: vale a data impressa | Sefaz e prefeitura |
| Falência e recuperação judicial | Data impressa ou a do edital | Tribunal de Justiça |
| Balanço | Até sair o balanço do exercício seguinte | — |

A validade sugerida só preenche o campo, que pode ser editado: vale sempre a data impressa na certidão.

### Situação do documento

- **Data de referência:** no cadastro, a situação conta a partir de hoje. No pacote, conta a partir da **data da sessão**.
- **Situações:** válido, vence antes da sessão, vencido ou sem validade.
- **ME/EPP:** se a empresa é ME ou EPP, o aviso de certidão fiscal vencida lembra que a lei dá 5 dias úteis para regularizar depois da habilitação (LC 123/2006, art. 43). O documento continua marcado como pendência.

### Substituir sem perder histórico

- A certidão nova do mesmo tipo vira a atual, e a anterior fica como "substituída".
- O arquivo antigo fica no disco enquanto algum pacote do histórico apontar para ele, e depois pode sair. Isso controla o espaço.

### Avisos

- **Etapa nova na rotina diária:** procura documentos que vencem em X dias (15 por padrão) e avisa no sino de Licitações.
- **Painel da empresa no Início:** documentos válidos, vencendo e vencidos, com o link para emitir cada um.
- **Lembretes de prazo mais úteis:** o lembrete de 3 dias e 1 dia dos editais "Vou participar" pode dizer quanto falta na documentação: "faltam 2 documentos".

### Emissão das certidões

- **Por enquanto:** a certidão é anexada à mão, com a validade sugerida pelo tipo.
- **Futuro:** a integração para emitir as certidões, assistida ou automática (seção 16). Você decidiu deixar para depois em 2026-10-13.

### Método do Finanças

- O mesmo método dos anexos de contrato ([contractAttachments.ts](../backend/src/services/contractAttachments.ts) e [contractAttachmentType.ts](../backend/src/services/contractAttachmentType.ts)):
  - o arquivo fica no disco, com nome gerado;
  - o tipo é conferido pelo conteúdo (PDF, JPG e PNG, até 20 MB);
  - a exclusão apaga o arquivo;
  - o download passa por uma rota que confere a conta.
- O anexo dos lançamentos ([AttachmentSection.tsx](../src/ui/AttachmentSection.tsx)) não serve: ele guarda o arquivo em base64 dentro do registro.

---

## 5. Modelos com variáveis

### De onde vem cada variável

| Grupo | Exemplos | Fonte |
|---|---|---|
| `empresa` | razão social, CNPJ, endereço, porte, banco | Cadastro da empresa |
| `socio`, `procurador` | nome, CPF, RG, cargo, `qualificacao_completa`, poderes | Pessoas e papéis |
| `resp_tecnico`, `contador` | nome, conselho, registro, CRC | Pessoas e papéis |
| `licitacao` | órgão, unidade/UASG, município, UF, modalidade, número, processo, objeto, data da sessão, plataforma | Edital do PNCP ou cadastro manual |
| `proposta` | total, total por extenso, validade | Proposta de preços |
| `indices` | LG, SG, LC | Índices contábeis |
| `data` | hoje por extenso, "Cidade, 13 de outubro de 2026" | Calculadas |

### O editor: três caminhos

| Caminho | Vantagem | Problema |
|---|---|---|
| **A. Editor no sistema** (biblioteca nova, como o TipTap) | A variável entra como etiqueta clicável, pelo catálogo; o texto fica em formato estruturado, que vira PDF e DOCX iguais | Biblioteca nova, que só o app de Licitações baixa |
| **B. Texto simples** com marcações (`**negrito**`, `{{variável}}`) | Nenhuma dependência | Pouco amigável; erro de digitação na variável |
| **C. Arquivo do Word** (.docx) com `{{variáveis}}` | Você edita no Word, e o modelo do órgão já vem em DOCX | O DOCX sai fácil, mas o PDF precisa de um conversor (LibreOffice), que não roda no serviço Starter do Render sem trocar a forma de hospedar |

- **Recomendação:** A, com formatação limitada a negrito, itálico, sublinhado, listas, alinhamento, títulos e tabela simples. Com mais formatação que isso, o PDF e o DOCX começam a sair diferentes, porque são dois geradores.

### Automação dentro do modelo

- **Variável vazia:**
  - na prévia aparece destacada;
  - bloqueia a geração, a não ser que o usuário confirme;
  - avisa onde preencher, por exemplo "falta o RG do procurador (Pessoas)".
- **Bloco de assinatura automático:** sai conforme o papel de quem assina (seção 2), com local e data.
- **Declaração única:** quando o edital aceita, junta as declarações escolhidas num documento só, com uma assinatura.
- **Ajuste para uma licitação:** "Editar só nesta licitação" copia o modelo para aquela licitação, e o modelo padrão não muda.
  - É o mesmo caminho do modelo próprio do órgão: o usuário cola o texto do anexo do edital como modelo da licitação.
- **Título no pacote:** o nome do documento pode ser trocado só naquele pacote ("Anexo III — Declaração..."), para seguir a numeração do edital.

### Modelos padrão (Lei 14.133/2021)

São os 19 do seu prompt:
- procuração e carta de credenciamento;
- as declarações do art. 63 (habilitação, custos trabalhistas, PcD), menor, ME/EPP, fato impeditivo, vínculo (art. 14), proposta independente, trabalho degradante, ciência do edital, LGPD, visita técnica ou dispensa, equipe, sustentabilidade e integridade (art. 25, §4º);
- o demonstrativo de índices e a proposta.

**Ponto de atenção, as estatais:** Petrobras, Correios e bancos públicos licitam pela Lei 13.303/2016, e uma declaração que cita a 14.133 sai errada. O edital do PNCP traz a lei usada (`amparoLegal` no `payload`), então o sistema pode avisar quando o modelo não bate com a lei do edital.

---

## 6. Licitação e pacote

### Por onde começa

- **No detalhe do edital e no card "Vou participar" do Acompanhamento:** o botão "Preparar documentação".
- **Item novo no menu, "Documentação":** lista os pacotes em andamento e os já gerados.
- **Licitação manual:** para editais fora do PNCP, como empresa privada, sistema S ou município que não publica.
- **Começar a documentação** pode mover o edital para "Vou participar", se ainda não estiver lá.

### O que o PNCP já traz

O edital guardado ([schema.ts](../backend/src/modules/tenders/db/schema.ts), tabela `edital`, mais o `payload` completo):

| Variável | Campo |
|---|---|
| Órgão e unidade | `orgao_razao_social`, `unidade_nome` |
| UASG | `unidade_codigo` (na esfera federal, é a UASG) |
| Município e UF | `municipio_nome`, `uf` |
| Modalidade e modo de disputa | `modalidade_nome`, `modo_disputa_nome` |
| Número e processo | `numero_compra`/`ano_compra`, `processo` |
| Objeto | `objeto` |
| Data da sessão | `data_encerramento_proposta` (no pregão eletrônico, a sessão costuma abrir aí; o campo pode ser editado) |
| Registro de preços | `srp` |
| Plataforma | `link_sistema_origem` (o domínio diz a plataforma: Compras.gov, BLL, Licitanet...) |
| Lei usada | `payload.amparoLegal` |

**Itens:** a API de itens que a aba Itens já usa ([pncpDetails.ts](../backend/src/modules/tenders/services/pncpDetails.ts)) traz número, descrição, quantidade, unidade, valor estimado e critério de julgamento.
- O PNCP também manda o benefício para ME/EPP de cada item (`tipoBeneficio`), mas o sistema hoje descarta esse campo.

### Regras que marcam sozinhas

| Situação | Efeito |
|---|---|
| Porte ME, EPP ou MEI | Entra a declaração de ME/EPP |
| Item exclusivo ou cota para ME/EPP e empresa "Demais" | Aviso: a empresa não pode disputar esses itens |
| Papel procurador | Entra a procuração (seção 2) |
| Sessão presencial (modalidades 5 e 7) | Entra a carta de credenciamento |
| Registro de preços | Poder de "assinar a ata" na procuração |
| Órgão federal e empresa com SICAF | Aviso dos documentos cobertos pelo SICAF |
| Visita técnica | Uma das duas declarações, nunca as duas |

### Escolha dos documentos

- **Listas salvas:** por exemplo "Pregão eletrônico", "Dispensa" e "Obras". O sistema já traz algumas, e o usuário cria as dele.
- **"Copiar da licitação anterior":** traz a mesma seleção.
- **A escolha final é do usuário:** as regras só sugerem, e ele marca e desmarca.

### O pacote

- **ZIP:** pastas na ordem do edital (`01_Credenciamento`, `02_Habilitacao_Juridica`...) e arquivos com nome padrão.
- **PDF único, opcional:** com índice. JPG e PNG viram página.
- **Relatório de pendências:** o que foi marcado e está faltando ou vence antes da sessão.
- **Histórico por versão:** quem gerou, quando e com quais documentos.
- **Disco:** o ZIP é montado na hora do download e não fica guardado (decisão para o `/planejar`).

### Ponto técnico: a limpeza dos editais

- **O problema:** a limpeza de domingo apaga o edital encerrado há mais de 12 meses, salvo o acompanhado, o favoritado e o com notificação não lida ([repository.ts:180](../backend/src/modules/tenders/collector/repository.ts#L180)). Um pacote ligado ao edital perderia a licitação.
- **Sugestão:** a licitação do pacote guarda uma cópia dos dados, e o vínculo com o edital é opcional. Se o edital sair, o pacote continua com tudo. A mesma tabela atende a licitação manual.

---

## 7. Proposta de preços

- **Itens:** vêm do PNCP (descrição, quantidade, unidade, valor estimado).
  - O usuário preenche a marca, o modelo e o valor unitário.
  - O total, o total geral e o valor por extenso são calculados.
- **Orçamento sigiloso:** quando o PNCP marca o item assim, o valor estimado fica em branco.
- **Aviso de preço acima do estimado:** o item com valor acima do estimado pelo órgão fica destacado.
- **Campos:**
  - os dados bancários vêm da empresa;
  - a validade vem de um padrão da empresa (por exemplo, 60 dias), que pode ser trocado na licitação;
  - o prazo de entrega, o pagamento e a garantia são preenchidos na proposta.
- **Planilha de custos e BDI:** fica para depois, porque muda muito de órgão para órgão.

---

## 8. Índices contábeis

- **Ligação com o balanço:** os valores (AC, ARLP, AT, PC, PNC, PL) são preenchidos uma vez, junto com o balanço do exercício.
- **Cálculo:** LG, SG e LC saem automaticamente.
- **Comparação com o mínimo:** o mínimo é 1,0 por padrão e pode ser trocado na licitação. Abaixo dele, o sistema avisa.
  - Pela Lei 14.133 (art. 69), a empresa abaixo do índice pode comprovar capital ou patrimônio mínimo, se o edital permitir. O aviso pode lembrar isso.
- **Demonstrativo:** gerado com a assinatura do sócio e do contador (CRC).

---

## 9. Métodos do Finanças que se repetem

| Método | Onde está | Uso em Licitações |
|---|---|---|
| Painel de configurações em grupos | [ConfigPanel.tsx](../src/layout/ConfigPanel.tsx), `ConfigListRow`, `ConfigTabHeader`, `ConfigSwitch` | Empresa, Pessoas, Documentos e Modelos |
| Modal de cadastro | "Editar conta" em [ContasTab.tsx](../src/screens/config/ContasTab.tsx), `dialogFormTokens` | Empresa, pessoa, documento e modelo |
| Mesma regra no front e no servidor | [companyAccount.ts](../src/utils/companyAccount.ts) + `companyAccountInput.ts` | CNPJ, CPF, datas e porte |
| Desativar em vez de excluir | Clientes e contas, com "mostrar desativados" | Empresa, pessoa e modelo usados em pacotes antigos |
| Anexo no disco | Anexos de contrato | Certidões, procuração assinada e logo |
| PDF | [reportPdf.ts](../backend/src/services/reportPdf.ts) (`pdfmake`, fontes configuradas) | Documentos gerados |
| Rotina diária + sino | [dailyJobSteps.ts](../backend/src/services/dailyJobSteps.ts) + `licitacoes.notificacao` | Aviso de vencimento |
| Seletor de município | `MunicipalityPicker` (já em Licitações) | Endereço da empresa e da pessoa |

---

## 10. Pontos técnicos de atenção

1. **O tipo de notificação tem trava no banco.** A coluna `tipo` aceita só os 4 tipos atuais (`CHECK` na migration 0073, linha 140). Um aviso novo pede migration.
2. **O aviso sem edital pode se repetir.** A regra de não repetir notificação usa conta, usuário, tipo, edital e referência ([schema.ts](../backend/src/modules/tenders/db/schema.ts), `ux_notificacao_unica`). Sem edital, o campo fica nulo, e o Postgres não compara nulos. O aviso de documento precisa de outra chave.
3. **O usuário de banco da rotina diária não enxerga tabelas novas.** Em produção, a rotina usa o `licitacoes_coletor`, que só tem acesso às tabelas que já existiam ([README do módulo](../backend/src/modules/tenders/README.md), "Usuário de banco restrito"). Cada tabela nova que a rotina lê exige um `GRANT` em produção, feito à mão.
4. **Numeração das migrations:** a 0085 é dos contratos e a 0086 está reservada para a Parte B. Esta começa na 0087.
5. **Render:** o serviço é Starter (512 MB de memória) e o disco é de 1 GB, dividido com as fotos de produto e os anexos de contrato.
   - O ZIP tem que ser montado em fluxo, sem carregar tudo na memória.
   - O PDF único precisa de um limite de tamanho.
6. **Bibliotecas novas (candidatas):**
   - `docx` (gerar DOCX);
   - `archiver` (ZIP em fluxo);
   - `pdf-lib` (juntar PDFs e transformar imagem em página);
   - no front, o editor (por exemplo TipTap).

   Hoje não existe nenhum editor de texto no projeto.
7. **Privacidade:** o sistema passa a guardar dados de terceiros (CPF, RG e endereço de sócios e procuradores). A página de Privacidade precisa citar isso.

---

## 11. Custo (US$)

- **IA:** zero, porque ficou de fora.
- **Disco:**
  - **Tamanhos:** certidão de 100 a 500 KB; contrato social e balanço de 1 a 5 MB; atestado de 0,5 a 3 MB. A primeira carga de uma empresa fica em 20 a 40 MB, e as renovações somam de 5 a 10 MB por ano (o FGTS é mensal).
  - **O que não ocupa disco:** os documentos gerados ficam pequenos (50 a 200 KB), o edital não é guardado (vem do PNCP) e o ZIP não fica salvo.
  - **Cenário mais provável:** o 1 GB atual aguenta de 20 a 30 empresas no primeiro ano. O espaço já usado hoje não aparece no código: dá para ver no painel do Render.
  - **Depois disso:** US$ 0,25 por GB/mês. Mais 5 GB custam US$ 1,25/mês.
- **Rotina diária:** a etapa de avisos é uma consulta de segundos e não muda a conta do Cron Job, que continua no mínimo de US$ 1.
- **Serviço web:** não muda, se o ZIP for montado em fluxo.

---

## 12. Fora, ou não recomendado agora

- **IA lendo o edital:** você decidiu tirar.
- **Integração com as certidões (assistida ou automática):** futuro (seção 16).
- **Assinatura digital (ICP) dentro do sistema:** o PDF sai pronto para assinar no gov.br, que é gratuito. A integração com Adobe e outras plataformas está analisada na seção 15.
- **Planilha de custos e BDI:** fica para depois da proposta simples.

---

## 13. Decisões que vão aparecer no `/planejar`

Ficam só listadas aqui, não precisam de resposta agora:

1. Uma ou várias empresas por conta.
2. Caminho do editor: A, B ou C (seção 5).
3. Histórico do pacote: guardar só os gerados ou o ZIP inteiro.
4. Quem recebe o aviso de vencimento: só o titular ou toda a equipe.
5. Quem vê e edita os dados pessoais (seção 2, item 9).
6. Listas de documentos salvas por conta ou por pessoa.
7. Assinatura: só pelo gov.br (manual) ou com integração própria de cada conta (seção 15).
8. ~~Emissão de certidões~~: fica para o futuro (seção 16).

---

## 14. Primeiro a criação; a assinatura fica para depois

Direção de 2026-10-13:
- **Primeiro a criação:** automatizar a criação dos documentos, com lugares para anexar e baixar. O que foi criado uma vez pode ser reaproveitado.
- **Procuração anexada:** a procuração também pode ser anexada, e não só gerada.
- **Assinatura depois:** a assinatura (seção 15) entra numa etapa seguinte.

### Quatro níveis de reaproveitamento

| Nível | O que é | Reaproveita |
|---|---|---|
| **Sempre** | Dados da empresa e das pessoas; modelos | Em toda licitação |
| **Até vencer** | Certidões, contrato social, balanço, atestados, procuração ampla assinada | Em toda licitação, enquanto válidos |
| **Por licitação** | Declarações com número do processo, proposta, carta de credenciamento | Geradas de novo a cada licitação, sozinhas |
| **A seleção** | Quais documentos o edital pede | Listas salvas e "copiar da licitação anterior" |

**Automação que sai disso:**
- O modelo que não usa nenhuma variável `licitacao.*` gera um documento genérico. A versão assinada que o usuário anexa vale para as próximas licitações, até vencer.
- O modelo que usa essas variáveis é refeito a cada licitação.
- O sistema classifica sozinho, lendo as variáveis do modelo.

### Procuração: gerada ou anexada

**A procuração usada é a ampla** (resposta de 2026-10-13).

- **Ampla:** vale para todas as licitações.
  - O modelo padrão não usa variável da licitação e já vem com todos os poderes marcados.
  - É anexada uma vez, por procurador e por empresa, e entra sozinha nos pacotes enquanto vale. O sistema avisa antes de vencer.
- **Pública (cartório):** sempre anexada, com as mesmas regras.
- **Sem nenhuma válida:** o pacote mostra "Gerar" e "Anexar" lado a lado.
- **Gerada no sistema** (lembrete seu de 2026-10-13: tudo vai precisar de assinatura):
  - o sistema gera a procuração;
  - você baixa e o sócio que outorga assina (os dois, se o contrato social pedir assinatura em conjunto);
  - você anexa a versão assinada;
  - ela vira a procuração ampla do procurador naquela empresa e entra sozinha nos próximos pacotes.
- **Validade:** campo opcional. Com prazo, o sistema avisa antes de vencer; sem prazo, vale até ser substituída.
- **Específica, por processo:** fica fora como tipo próprio. Se um edital exigir, o usuário usa o "Editar só nesta licitação" (seção 5) no modelo da procuração.

### Declarações: o mesmo ciclo, com duas diferenças

O ciclo é o mesmo da procuração: **gerar → baixar → assinar → anexar a versão assinada → pronta**.

As duas diferenças:
1. **Quase sempre são refeitas a cada licitação**, porque citam o processo ("Ref.: Pregão Eletrônico nº ...").
   - As marcadas como "sempre" já nascem geradas quando a licitação é escolhida.
   - A versão assinada vale só para aquela licitação.
2. **Quem assina depende do papel:**
   - o sócio assina em nome próprio;
   - o procurador assina com a procuração no pacote.
   - O bloco de assinatura sai certo sozinho.

O que reduz o trabalho:
- **Declaração única:** junta todas as declarações escolhidas num documento só, com uma assinatura por licitação, em vez de 10 ou 12. Como tudo precisa de assinatura, é a maior economia de trabalho.
- **Genérica (sem o número do processo):** o órgão que aceitar recebe a mesma versão assinada, reaproveitada.
  - O usuário define por quanto tempo reaproveita (por exemplo, 90 dias), porque a data impressa vai ficando antiga.
- **Compras.gov:** as declarações marcadas na própria plataforma não viram arquivo (seção 16).
- **Modelo do órgão:** quando o edital traz um modelo próprio no anexo, o "Editar só nesta licitação" usa o texto do órgão no lugar do padrão.
- **ME/EPP:** só entra se o porte da empresa permitir.

### Onde anexar e baixar

| Lugar | Anexar | Baixar |
|---|---|---|
| **Empresa** | Certidões, contrato social, balanço, atestados, logo | Cada arquivo |
| **Pessoa** | Identidade; procuração ampla (no procurador) | Cada arquivo |
| **Modelos** | — | Prévia em PDF e DOCX, com dados de exemplo |
| **Licitação (pacote)** | Por item: a versão assinada do gerado, ou um anexo novo (que vai também para o cadastro da empresa ou da pessoa, para reaproveitar) | Cada documento (PDF ou DOCX), o ZIP com tudo e os arquivos do edital (link do PNCP) |

### O ciclo de cada item, sem integração de assinatura

**Gerado** → baixar e assinar fora (gov.br ou certificado) → **anexar a versão assinada** → **pronto**.

O item anexado direto do cadastro já entra como pronto, se estiver válido na data da sessão.

---

## 15. Assinatura dentro do sistema (Adobe e outras)

Pergunta de 2026-10-13: dá para integrar com a Adobe para assinar direto no sistema?

### Dá, mas a Adobe não é a melhor escolha

- **Como funciona:** a Adobe Acrobat Sign tem API. O sistema envia o PDF, a pessoa assina por um link (no e-mail ou dentro do sistema), e o PDF assinado volta por webhook para o pacote. É o mesmo método do Mercado Pago, que já avisa os pagamentos por webhook.
- **Custo:** a API de produção só tem preço por cotação.
  - Os comparativos de terceiros falam em cerca de US$ 1.000 a 1.200 por ano no plano básico (uns 50 envios por mês), mais de US$ 0,50 a 1,00 por envio a mais.
  - Cenário mais provável: perto de US$ 100/mês fixos, mesmo com poucos clientes, contra uma assinatura de Licitações de R$ 4,99/mês.
- **Validade:** a assinatura padrão da Adobe não é ICP-Brasil.
  - Pela Lei 14.063/2020, o órgão público é obrigado a aceitar a assinatura qualificada (ICP-Brasil). As demais valem só se o edital ou o regulamento do órgão aceitar.
  - Muitos editais pedem ICP-Brasil ou gov.br. A da Adobe corre o risco de ser recusada na habilitação.

### O gov.br não tem integração para empresa

A API de assinatura do gov.br só libera credenciais de produção para órgão público, com sistema num domínio oficial (.gov.br etc.). O FINGERENCE não consegue integrar. O usuário continua assinando no site do gov.br, de graça.

### Alternativas brasileiras, com API e ICP-Brasil

ZapSign, Clicksign e D4Sign:
- planos a partir de cerca de R$ 30 a 40/mês (US$ 6 a 8, com o dólar a R$ 5);
- de R$ 1,50 a 3,00 por documento (US$ 0,30 a 0,60);
- na ZapSign, o certificado ICP-Brasil custa mais R$ 0,50 por assinatura.

Os números vêm de comparativos de terceiros e precisam de confirmação com o comercial de cada uma.

Para assinar com ICP-Brasil, a pessoa precisa ter o próprio certificado (e-CPF ou e-CNPJ). A plataforma só organiza a assinatura.

### Quem paga

- **Cobrança por documento:** um pacote com 10 documentos assinados um a um custaria de R$ 15 a 30 na conta do FINGERENCE. Isso passa da assinatura mensal de Licitações.
- **O que reduz:** a declaração única (seção 5) deixa uma ou duas assinaturas por licitação.
- **O método que já existe:** na vitrine, cada loja conecta o próprio Mercado Pago e recebe direto. Do mesmo jeito, cada conta conectaria a própria conta da ZapSign ou da Clicksign e pagaria direto à plataforma. O custo para o FINGERENCE fica zero.

### Sugestão, em dois passos

1. **Primeiro, sem integração e sem custo:**
   - o botão "Assinar no gov.br" abre o assinador num link;
   - a pessoa arrasta de volta o PDF assinado;
   - o sistema confere se o arquivo tem assinatura digital (confere que existe, não valida a cadeia do certificado) e marca o documento como "assinado".
2. **Depois, como opção da conta:** a integração com uma plataforma brasileira, com a conta da própria empresa, no método do Mercado Pago da vitrine.

Fontes: [Lei 14.063/2020 (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm), [roteiro de integração da API de assinatura gov.br](https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/3.8/iniciarintegracao.html), [catálogo Conecta gov.br](https://www.gov.br/conecta/catalogo/apis/assinatura-digital-avancada), [preços da API da Adobe (GoodSign, comparativo)](https://goodsign.io/blog/eSignature-API-Pricing), [preços da API da Adobe (eSign.AI)](https://www.esign.ai/blog/how-much-digital-signature-api-cost), [preços de ZapSign, Clicksign e D4Sign (SignDocs, comparativo)](https://www.signdocs.com.br/assinatura-digital-mais-barata-brasil.html).

---

## 16. Declarações fixas e integração com certidões

Pergunta de 2026-10-13: algumas declarações são pedidas sempre, então dá para deixá-las prontas? E dá para integrar com os sistemas que emitem as negativas e os documentos de habilitação?

### Declarações que o edital sempre pede

- **Marcar como "sempre":** no modelo, o usuário marca "sempre". O campo "obrigatório por padrão" já estava no seu prompt.
  - Na licitação nova, esses modelos já entram marcados e gerados, sem nenhum clique, assim que a licitação é escolhida.
  - Com a declaração única (seção 5), saem num documento só.
- **Dois tipos:**
  - **Com referência ao processo** ("Ref.: Pregão Eletrônico nº ..."): é o caso da maioria dos editais. O sistema gera de novo a cada licitação, sozinho, e você só assina.
  - **Genérica** (sem variável da licitação): gera e assina uma vez e reaproveita até vencer (seção 14). Só serve quando o órgão aceita uma declaração sem o número do processo.
- **Compras.gov.br (federal):** várias declarações são marcadas no próprio sistema, no registro da proposta. São elas: ciência do edital e integralidade dos custos, requisitos de habilitação, ME/EPP e reserva de cargos.
  - Quando o link de origem do edital é o Compras.gov, o pacote pode marcar esses itens como "declarados na plataforma" e tirá-los dos arquivos, com um lembrete.
  - O link vem vazio em parte dos editais, e aí a escolha fica com o usuário.

### Integração para emitir as certidões (futuro)

Você decidiu em 2026-10-13 deixar para depois tanto a emissão assistida quanto a automática. Na primeira etapa, a certidão é anexada à mão. Esta parte fica registrada para quando a integração voltar à pauta.

| Certidão | API oficial | Por agregador (Infosimples) |
|---|---|---|
| CND Federal (RFB/PGFN) | **Sim:** Consulta CND do Serpro. Devolve a certidão válida ou emite uma nova (180 dias) | Sim |
| CRF do FGTS (Caixa) | Não encontrei; só o site, com captcha | Sim |
| CNDT (TST) | Não encontrei; só o site, com captcha | Sim |
| CND Estadual | Não encontrei | Sim, todas as Sefaz |
| CND Municipal | Não encontrei | Sim, consulta unificada, com cobertura variável |
| Contrato social, balanço, atestados | Não se aplica: são do próprio licitante | — |

**Custo:**
- **Serpro (Consulta CND):** cobrança por consulta, com o preço na Loja Serpro, a confirmar. O catálogo do governo cita um impacto de R$ 7,81 por transação, mas é uma estimativa, não o preço.
- **Infosimples:**
  - franquia mínima de R$ 100/mês (cerca de US$ 20, com o dólar a R$ 5), pré-paga;
  - R$ 0,20 por consulta nas primeiras 500 (US$ 0,04);
  - algumas APIs têm um adicional, e as de certidão provavelmente estão entre elas.
- **Cenário mais provável:** uma empresa usa umas 2 consultas por mês (o FGTS é mensal e as outras são semestrais). Com 20 empresas, o consumo daria R$ 8, mas a franquia cobra R$ 100/mês: cerca de US$ 20/mês fixos para o FINGERENCE.
  - Só se paga com umas 20 contas pagantes de Licitações dedicadas a isso.
  - Faz mais sentido como adicional cobrado à parte.
- **Uma conta de agregador para cada cliente**, no método do Mercado Pago, não funciona aqui: cada cliente pagaria a franquia de R$ 100 sozinho.

### Sugestão, em dois passos

1. **Emissão assistida, sem custo:**
   - o botão "Emitir" de cada certidão abre o site oficial com o CNPJ já copiado;
   - você baixa o PDF e arrasta para o sistema;
   - o sistema lê o texto do PDF (o `pdf-parse` já está no backend) e preenche sozinho a data de validade e o CNPJ, conferindo se o CNPJ é da empresa.
   - Funciona sem IA nas certidões de layout padrão (Federal, FGTS e CNDT), que trazem "Válida até ..." num formato fixo. Nas estaduais e municipais, que variam, a data é digitada.
2. **Emissão automática, depois, como adicional pago:**
   - a CND Federal pelo Serpro (oficial);
   - as demais por um agregador;
   - a rotina diária renova sozinha a certidão que está para vencer.

Fontes: [Serpro, API Consulta CND](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnd/pt/introducao/), [catálogo Conecta gov.br, CND](https://www.gov.br/conecta/catalogo/apis/consultar-certidao-negativa-de-debito), [Infosimples, preços](https://infosimples.com/consultas/precos/), [Infosimples, CND Federal](https://infosimples.com/consultas/receita-federal-pgfn/), [Infosimples, FGTS](https://infosimples.com/consultas/caixa-regularidade/), [Infosimples, CNDT](https://infosimples.com/consultas/tribunal-tst-cndt/), [Infosimples, CND Estadual](https://infosimples.com/consultas/sefaz-certidao-debitos/), [Infosimples, CND Municipal](https://infosimples.com/consultas/pref-cnd/), [manual do Pregão Eletrônico do Compras.gov.br (fornecedor)](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-fase-externa/in-no-73-de-2022-manuais-do-criterio-menor-preco-ou-maior-desconto/Manual_Pregao_Eletronico_fornecedor_v1.1.pdf).
---

## 17. Fluxo em etapas

Direção de 2026-10-13:
- **Modelos prontos:** os modelos já ficam criados, e o usuário vai passando pelas etapas. As principais são município, proposta de preços, declarações, procuração e documentos de habilitação, em qualquer ordem.
- **Variáveis preenchidas sozinhas:** o que foi preenchido numa etapa alimenta as seguintes. Por exemplo, ao chegar em Declarações, o município já está escolhido, e as variáveis se preenchem quando o usuário marca as declarações que vai usar.

### Etapas sugeridas

| # | Etapa | O que o usuário faz | O que já vem preenchido |
|---|---|---|---|
| 1 | **Licitação** | Escolhe o edital do PNCP ou cadastra à mão; confere a data da sessão | Órgão, unidade, município, UF, modalidade, número, processo e objeto. Empresa e quem participa vêm do padrão: a única empresa e a pessoa logada |
| 2 | **Proposta de preços** | Preenche o valor unitário e a marca de cada item | Itens do PNCP, total, total por extenso e dados bancários |
| 3 | **Declarações** | Marca as que vai usar e, se quiser, escolhe a declaração única | As marcadas como "sempre", com as variáveis já preenchidas pelas etapas 1 e 2 |
| 4 | **Procuração** | Só aparece se quem participa é procurador; gera ou anexa | A procuração ampla válida, se existir |
| 5 | **Habilitação** | Marca os documentos pedidos e anexa o que faltar | Os documentos da empresa e da pessoa, com a situação na data da sessão |
| 6 | **Revisão** | Baixa os documentos ou o ZIP e anexa as versões assinadas | Pendências e o que está pronto |

### Como as etapas conversam

- **Navegação livre:** cada etapa abre a qualquer momento, sem ordem obrigatória. A marca da etapa mostra a situação: pronta, com pendência ou não visitada.
- **Rascunho salvo sozinho:** a preparação fica gravada no servidor, e dá para parar e voltar outro dia.
- **Prévia sempre atual:** a prévia de cada documento usa o que já foi preenchido.
  - Se falta algo, aparece "Falta a data da sessão (etapa Licitação)", com o link para a etapa.
- **Dado mudado depois:**
  - os documentos gerados e ainda não assinados se refazem sozinhos;
  - os já assinados ficam marcados como "desatualizado: gere e assine de novo".
- **Etapas que somem sozinhas:**
  - a Procuração some quando quem participa é sócio;
  - a Proposta pode ser marcada como "não se aplica".

### Método do Finanças

O contrato do Clientes já é feito em etapas ([ContractWizard.tsx](../src/screens/clients/ContractWizard.tsx), com a regra pura em `utils/contractForm.ts`):
- botões de etapa com três estados (feita, atual e próxima);
- um rascunho único para todas as etapas;
- conferência por etapa;
- etapas que dependem do caso (a etapa de órgão público só aparece para cliente órgão público, em `wizardSteps(publicEntity)`);
- prévia calculada pelo servidor.

**Diferenças para a documentação:**
- página inteira, em vez de modal, porque o trabalho é longo;
- navegação livre, em vez de só avançar conferindo;
- rascunho gravado no servidor, em vez de salvar só no fim.
---

## 18. Alternativa mais moderna: área de trabalho guiada por pendências

Pergunta de 2026-10-13: existe um método mais moderno que as etapas?

**Direção escolhida** (2026-10-13: "gostei da ideia"). A área de trabalho substitui as etapas da seção 17. As seções, a ordem livre, o rascunho salvo e as regras da seção 17 continuam valendo dentro dela.

**Por que as etapas não bastam:** etapas servem bem para quem faz uma tarefa pela primeira vez. O licitante prepara documentação toda semana. Para ele, passar por 6 etapas toda vez é lento, mesmo com tudo já preenchido.

### Três ideias que mudam a tela

1. **Começar pelo fim (gestão por exceção):** ao escolher a licitação e a lista de documentos, o sistema já gera tudo. Ele abre direto no resumo: "11 de 14 prontos. 3 precisam da sua atenção":
   - falta o valor unitário de 2 itens;
   - a CNDT vence antes da sessão;
   - a procuração está sem a versão assinada.

   O usuário só toca no que está pendente. O resto fica recolhido como pronto.
2. **Prévia ao lado, preenchendo no próprio documento:**
   - a tela se divide em duas, com a lista à esquerda e a prévia do documento à direita;
   - a variável vazia aparece destacada na prévia, e o clique nela abre o campo ali mesmo. Quem preenche não precisa saber de qual etapa o dado vem;
   - o mesmo dado preenche todos os documentos de uma vez.
3. **As etapas viram índice, não portão:** as seções (Licitação, Proposta, Declarações, Procuração e Habilitação) ficam numa coluna lateral, cada uma com a sua situação. Clicar leva até a seção.
   - Para quem está começando, um botão "Próximo" percorre as seções em ordem, como um passo a passo.
   - A mesma tela serve aos dois perfis.

### Como seria a tela

```
┌───────────────┬──────────────────────────────┬─────────────────────────┐
│ Pregão 90/2026│ 11 de 14 prontos             │  PRÉVIA                  │
│ Limeira - SP  │ ⚠ 3 precisam da sua atenção  │  DECLARAÇÃO DE ...       │
│               │                              │  A empresa ACME LTDA,    │
│ ✓ Licitação   │ ⚠ Proposta: 2 itens sem valor│  CNPJ 12.345.678/0001-90 │
│ ⚠ Proposta    │ ⚠ CNDT vence antes da sessão │  ... Pregão nº 90/2026,  │
│ ✓ Declarações │ ⚠ Procuração sem assinatura  │  [data da sessão] ← clique│
│ ⚠ Procuração  │ ▸ 11 prontos (recolhidos)    │                         │
│ ⚠ Habilitação │                              │  [Baixar PDF] [DOCX]     │
│               │ [Baixar tudo (ZIP)]          │                         │
└───────────────┴──────────────────────────────┴─────────────────────────┘
```

No celular, as três colunas viram abas: Pendências, Seções e Prévia.

### Prévia ao vivo

Licitações já faz isso na busca salva: o formulário mostra a prévia ao vivo, 500 ms depois que a pessoa para de digitar ([README do módulo](../backend/src/modules/tenders/README.md), "Buscas salvas").
- Do mesmo jeito, a prévia do documento é pedida ao servidor 500 ms depois da última mudança.
- Assim a prévia sai do mesmo gerador do PDF final, sem diferença entre o que se vê e o que se baixa.

### Comparação

| | Etapas (seção 17) | Área de trabalho (esta seção) |
|---|---|---|
| Primeira vez | Bom | Bom, com o "Próximo" |
| Uso semanal | Lento: passa por tudo | Rápido: só as pendências |
| Onde preencher | Na etapa da variável | No próprio documento |
| Visão do todo | Só no fim (Revisão) | Desde o início |
| Esforço técnico | Menor | Um pouco maior (tela dividida e foco na pendência) |