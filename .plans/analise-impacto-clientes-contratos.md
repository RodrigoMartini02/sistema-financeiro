# Análise de impacto: clientes, contratos e serviços

## Origem

- **Pedido:** chat de 2026-10-04.
  - O usuário quer refazer do zero a parte de clientes e contratos: tirar o código antigo e encaixotado e fazer com um visual novo, compatível com o sistema.
  - Antes de construir, ele pediu uma análise de impacto: os vínculos com o resto do sistema também podem estar mal feitos.
- **Data:** `2026-10-04`
- **Tipo:** diagnóstico, só leitura. Nenhum código, banco ou configuração foi alterado.
- **Recorte de produto:** quem usa o FINGERENCE é a empresa privada, que registra os contratos com os clientes dela. Esses clientes podem ser órgão público, empresa ou pessoa física.
- **Próximos passos combinados:**
  1. escopo de produto;
  2. análise de construção;
  3. protótipo;
  4. `/planejar`.

## Resumo

1. **Dados na produção:** quase nada para migrar. São 2 clientes, 0 contratos, 14 serviços sem vínculo, 0 receitas de contrato, 0 receitas com cliente e 0 anexos.
2. **Valor do mês sem uma fonte única:** cada parte do sistema usa uma regra diferente, e a tela mostra um valor enquanto as previstas saem com outro.
3. **Bugs dentro do módulo:**
   - previstas duplicadas em meses passados ao salvar o contrato;
   - contrato só com mensalidade não gera previstas;
   - implantação "parcelada" vira uma receita única;
   - editar o cliente apaga dados.
4. **Vínculos mal feitos com o resto do sistema:**
   - a receita guarda o cliente pelo **nome**;
   - as horas consumidas não voltam quando a receita é cancelada;
   - as receitas do contrato não levam cliente nem representante;
   - quase todas as rotas resolvem só o dono, sem a conta PJ.
5. **Achado de segurança, já em produção:** o anexo de contrato aceita qualquer arquivo, e a tela abre o arquivo no domínio do app. Um HTML anexado roda como se fosse o FINGERENCE e consegue ler o token de login de quem abre (ver 3.1). Hoje há 0 anexos.
6. **Código morto:**
   - 3 rotas sem uso;
   - 2 tabelas órfãs e uma legada, vazias;
   - colunas que nenhuma tela grava;
   - 7 dicas de primeiro acesso, duas descrevendo comportamento que não existe.
7. **Conclusão:** substituir o módulo é viável e barato agora. O cuidado está nos 14 vínculos da seção 2, que precisam de decisão um a um.

## 1. O que existe hoje

### 1.1 Tabelas

| Tabela | Uso | Observações |
|---|---|---|
| `clientes` | cadastro | Colunas: `nome`, `cnpj`, `codigo`, `tipo_empresa` e `conta_id`. Nenhuma tela grava `codigo` nem `tipo_empresa`. Não há CPF, contato nem endereço. |
| `contratos` | contrato | Tem `vencimento` obrigatório, `num_aditivo`/`data_aditivo` e `ajuste` (texto livre). Tem `valor_mensal`, implantação (`parcelas` × `valor_parcela`) e horas em 6 colunas fixas: `horas_presenciais_*` e `horas_remotas_*` (valor, saldo inicial, saldo atual). Status é texto livre, sem CHECK. |
| `servicos` | catálogo de serviços | Só `nome`, `valor_mensal_padrao` e `ativo`. **Não tem conta**: o catálogo é do dono, enquanto os produtos são por conta PJ desde o plano da vitrine. |
| `contratos_servicos` | serviços do contrato | `valor_mensal`, `implantado` e `faturando`. A coluna `data_inicio_faturamento` é sempre gravada como nula (ver 3.2). |
| `contrato_anexos` | anexos | Arquivo em `uploads/contratos`, no disco do Render. |
| `servicos_tecnicos_contrato` | legado | Só aparece na cópia feita pelo aditivo. Vazia. |
| `consumo_horas`, `modulos_contrato` | órfãs | Nenhum código usa. Vazias nos dois bancos. |

**Chaves estrangeiras que importam:**
- `contratos.cliente_id → clientes` e `receitas.contrato_id → contratos`, as duas **sem ação**: excluir um cliente com contrato dá erro 500.
- `contratos_servicos.servico_id → servicos`, também sem ação.

### 1.2 Rotas, cerca de 1.450 linhas no backend, todas em SQL cru

| Rota | Arquivo | Usada pela tela? |
|---|---|---|
| `GET/POST/PUT/DELETE /api/clientes` | `routes/clients.ts` | sim; o `GET /:id` **não** |
| `GET /api/contratos` e `/faturamento` | `routes/contracts.ts` | sim: tela do cliente, receita, assistente, painel |
| `GET /api/contratos/:id` | `routes/contracts.ts:227` | **não** |
| `POST/PUT /api/contratos`, `/gerar-previstas`, `/encerrar`, `/aditivo`, `/receita-implantacao` | `routes/contracts.ts` | sim |
| `POST /api/contratos/:id/faturar` | `routes/contracts.ts:632` | **não**: nenhuma tela chama |
| `/api/contratos-servicos` | `routes/contract-services.ts` | sim |
| `/api/contrato-anexos` | `routes/contract-attachments.ts` | sim |
| `/api/servicos` | `routes/services.ts` | sim |

### 1.3 Telas e serviços do front, cerca de 2.150 linhas

- **Telas e serviços:**
  - `src/screens/config/ClienteDetail.tsx` (1.514 linhas): lista de contratos, ficha, valores, serviços, anexos e aditivo;
  - `ClientesTab.tsx` (225), `ServicosTab.tsx` (208);
  - `src/services/clientesService.ts`, `servicosService.ts`.
- **Estilo misturado:** classes do Tailwind, estilos em linha, o componente `Button` e botões em pílula na mesma tela. São três jeitos de botão.

## 2. Vínculos com o resto do sistema

Cada vínculo tem uma sugestão: **manter**, **adaptar** (o conceito fica e muda a ligação), **refazer** (o conceito fica e a implementação é nova) ou **remover**.

| # | Vínculo | Onde | Como funciona hoje | Problema | Sugestão |
|---|---|---|---|---|---|
| 1 | Receita ↔ cliente | `receitas.cliente` (varchar); `ClientSelect`; `draftRules.ts:192`; relatórios (`reportService.ts:211,277`, `reportPdf.ts:145`) | A receita guarda o **nome** do cliente. A tela só aceita nomes do cadastro. | Renomear o cliente quebra o histórico. Relatório por cliente depende do texto bater. As receitas geradas pelo contrato não preenchem `cliente`. | **Refazer**: `cliente_id` na receita; o nome vem do cadastro. |
| 2 | Receita ↔ contrato | `receitas.contrato_id`; `contracts.ts:69-130, 632-736, 739-828` | Previstas, implantação e "faturar" criam receitas com `contrato_id`. | Ver 3.2: três regras de valor, duplicação em meses passados, implantação única, dia 1 fixo. É a tela que dispara a geração depois de salvar (`ClienteDetail.tsx:1336-1342`), sem transação. | **Refazer**: o servidor gera as receitas na mesma transação do contrato. |
| 3 | Horas a faturar | `incomeService.ts:61-68`; `incomeInput.ts` (`billableHours`); `draftRules.ts` (`hourRate`, `hourBalance`, `contractPrefill`); `IncomeDetailsPopover.tsx:156-190`; `FinancialAssistant.tsx:574-578, 760` | A receita nova desconta horas do saldo do contrato (tipo `presencial` ou `remoto`), nunca abaixo de zero. | Só dois tipos fixos. Nenhum registro do consumo. **Cancelar ou excluir a receita não devolve as horas** (`undoIncomeEffects`, `incomeService.ts:182-185`), e editar não ajusta. O saldo descola da realidade. | **Refazer**: banco de horas com lançamentos de consumo ligados à receita, estornáveis. |
| 4 | Representante ↔ contrato ↔ comissão | `contratos.representante_id`; `contractPrefill` (`draftRules.ts:177-182`); `commissionService.ts`; dica `firstAccessGuideMessages.ts:41` | O representante do contrato só preenche a receita **manual** com horas. | As previstas do contrato não levam representante, então **nunca geram comissão**. A dica diz o contrário ("gera comissão automática"). | **Adaptar**: a regra fica para o escopo (ver 6). |
| 5 | Categorias "Contratos › Mensalidade/Implantação" | `incomeClassificationDefaults.ts`; `income-classifications.ts:53-62, 351`; `contratos.classificacao_*_id` | O contrato aponta as categorias das receitas que gera. A tela de categorias conta o uso e marca "em contrato ativo". | Funciona. Depende dos nomes "Mensalidade" e "Implantação". | **Manter**, adaptando aos novos tipos de cobrança. |
| 6 | Painel PJ "Carteira de contratos" | `ExtrasContaEmpresa.tsx:42-64`; `financeService.ts:238`; `GET /contratos/faturamento` | Soma `contratos.valor_mensal` e mostra a situação da receita do mês. | Usa uma **terceira** fonte do valor mensal (ver 3.2). | **Refazer** sobre o valor único novo. |
| 7 | Assistente (celular) | `FinancialAssistant.tsx:490-578` | Usa clientes e contratos ativos para horas e valor da hora. | Mesmos problemas dos itens 1 e 3. | **Adaptar** à API nova. |
| 8 | Checklist de primeiro acesso | `useOnboardingChecklist.ts:98-102` | "Cadastrar um cliente" leva à tela Clientes. | Nenhum. | **Adaptar**: só o destino. |
| 9 | Demo do site | `fakeApiResolver.ts:167-169` | Responde lista vazia para `/clientes`, `/contratos` e `/contratos/faturamento`. | Quebra se os endereços mudarem. | **Adaptar**. |
| 10 | Permissões | `screenAccess.ts:28, 97, 146-149`; `server.ts:139-143`; `memberPermissions.ts` (`acesso_clientes`, `acesso_contratos`, `acesso_servicos`); espelho no backend em `utils/catalogAccess.ts` | Clientes vira seção do menu (só PJ). Contratos e Serviços liberam o cadastro e a leitura nas receitas. | 1 colaborador na produção tem as três liberadas. | **Manter** as flags com os mesmos nomes e reaplicar nas rotas novas. |
| 11 | Conta PJ (várias empresas) | Quase todas as rotas do módulo: `resolveAccountOwnerId(user, null)` | Resolve o **dono**, não a conta. Só a lista filtra por `conta_id`. | `GET/PUT/DELETE` por id, serviços do contrato, anexos e catálogo não conferem a conta. Um colaborador de uma PJ mexe na outra do mesmo dono. O `PUT /contratos/:id` nem chama `canWriteToAccount`. É o mesmo furo corrigido nos produtos no plano da vitrine. | **Refazer**: tudo por conta, com `resolveCompanyAccount`. |
| 12 | Anexos de contrato | `contract-attachments.ts:24-27, 149-150`; `ClienteDetail.tsx:443-444` | Aceita qualquer arquivo de até 20 MB e devolve com o tipo enviado. A tela abre num `blob:` do app. | **Segurança**, ver 3.1. | **Refazer**: tipos permitidos e abertura segura. Vale corrigir antes da reescrita. |
| 13 | Relatórios | `reportService.ts:89, 211, 277`; `reportPdf.ts:145` | Mostram o texto `cliente` da receita. | Herda o problema do item 1. | **Adaptar**: nome vindo do cadastro. |
| 14 | Pedidos da vitrine | `catalogo.pedidos` (`cliente_nome`, `cliente_email`, `cliente_cpf`) | O comprador fica só no pedido. | Não vira cliente do cadastro. | **Adaptar depois**, se o escopo quiser. |

## 3. Problemas dentro do módulo

### 3.1 Segurança: anexo que roda como o app

- **Na entrada:** `multer` sem filtro de tipo (`contract-attachments.ts:24-27`).
- **No servidor:** o arquivo volta com o `Content-Type` que o próprio envio informou (`:149`).
- **Na tela:** a tela baixa, cria um `blob:` e abre numa aba (`ClienteDetail.tsx:443-444`). O `blob:` tem a origem do app. Um `.html` anexado executa JavaScript como `fin-gerence.com.br` e lê o token guardado no navegador.
- **Quem pode explorar:** quem tem acesso a Contratos na mesma conta, ou seja, um colaborador.
- **Situação:** está em produção, sem nenhum anexo hoje.
- **Correção pequena e independente da reescrita:**
  - aceitar só PDF e imagens;
  - abrir o `blob` com o tipo fixado pelo servidor;
  - os demais tipos baixam como arquivo, sem abrir.

### 3.2 Valor do mês e receitas geradas

- **Quatro regras para o mesmo valor:**
  - **previstas:** soma dos serviços "faturando" (`contracts.ts:79-84`);
  - **"faturar":** essa soma ou, sem serviço, `valor_mensal` (`:702-709`);
  - **painel:** `valor_mensal` (`ExtrasContaEmpresa.tsx:54`);
  - **tela:** mostra as duas coisas, "Mensal" e "Faturando".
- **Contrato só com mensalidade, sem serviço, não gera previstas:** a soma dos serviços dá zero e a função sai (`:86`).
- **Previstas duplicadas:**
  - ao salvar, o contrato cancela só as previstas **de hoje em diante** (`:61-67`) e gera de novo **desde o início do faturamento** (`:88-110`);
  - com início no passado, cada salvamento duplica os meses passados, inclusive os já recebidos;
  - não existe índice que impeça.
- **Implantação "parcelada":** a tela pede parcelas × valor, mas o servidor cria **uma** receita com o total (`:766-821`).
- **Dia fixo:** toda mensalidade cai no dia 1 (`:100`, `:696`); não existe dia de vencimento.
- **Serviço sem efeito nas previstas:** marcar ou desmarcar "faturando" num serviço grava na hora, mas não refaz as previstas. Só salvar o contrato ou clicar em "Gerar previstas" refaz.
- **"Total do contrato":** sempre mensal × 12, qualquer que seja a vigência (`ClienteDetail.tsx:637-641`).
- **Aditivo sem transação:** são seis passos soltos (`contracts.ts:546-622`). Uma falha no meio deixa o contrato encerrado sem o novo, ou o novo sem serviços.
- **Reajuste:** IGPM/IPCA é só rótulo, nada é calculado. A própria dica avisa (`firstAccessGuideMessages.ts:40`).

### 3.3 Cliente

- **Editar apaga dados:** editar o cliente grava `codigo` e `tipo_empresa` como nulos, porque a tela não manda esses campos (`clients.ts:112-116`).
- **Código sequencial:** é `MAX + 1` (`:76-81`), sujeito a corrida, e nunca aparece.
- **Exclusão:** excluir cliente com contrato dá erro 500 (chave sem ação). Contrato não tem exclusão, só encerramento.

### 3.4 Padrão do projeto

- **Sem Drizzle:** as rotas usam SQL cru, contra a regra do `AGENT.md`.
- **Sem validação nem testes:** não existe módulo de validação de entrada (como `orderInput` e `productInput`) nem teste de regra.
- **Mensagens:** metade em inglês ("vencimento is required", "Contract not found").
- **Tela:**
  - estado resetado em dois lugares iguais (`ClienteDetail.tsx:650-687`);
  - a leitura e a edição do contrato duplicam o layout.

## 4. Código morto, legado ou escondido (verificação básica)

- **Rotas sem uso:** `GET /api/clientes/:id`, `GET /api/contratos/:id` e `POST /api/contratos/:id/faturar`.
- **Tabelas:** `consumo_horas` e `modulos_contrato` (órfãs) e `servicos_tecnicos_contrato` (legada, só copiada no aditivo). As três estão vazias.
- **Colunas sem uso real:**
  - `clientes.codigo` e `clientes.tipo_empresa`;
  - `contratos_servicos.data_inicio_faturamento`, sempre gravada nula (`contract-services.ts:105-115`).
- **Nome legado:** `appendProfile` (de "perfil", renomeado para conta na 0024), em `clientesService.ts:3` e `financeService.ts:50`.
- **Dicas de primeiro acesso:** sete na tela de contrato e uma na receita (horas). Duas descrevem comportamento que não existe:
  - a comissão automática;
  - "gera a receita de implantação" parcelada.
- **Botão "Gerar previstas":** redundante, porque salvar já gera.

Uma auditoria completa de código morto (`/limpar`) não foi feita. Fica para depois, se precisar.

## 5. Dados na produção (2026-10-04, só leitura)

| Item | Quantidade |
|---|---|
| Clientes | 2 (de 2 donos, os dois com CNPJ, nenhum com tipo) |
| Contratos | 0 |
| Serviços no catálogo | 14 (de 2 donos), 0 vinculados a contrato |
| Receitas de contrato | 0 |
| Receitas com cliente preenchido | 0 |
| Receitas com representante | 0 |
| Anexos de contrato | 0 |
| Tabelas legadas e órfãs | todas vazias |
| Colaboradores com acesso a clientes, contratos e serviços | 1 |

Na prática, a migração se resume aos 2 clientes, aos 14 serviços e às flags de permissão.

## 6. Decisões para o escopo de produto

São perguntas de negócio que a análise levantou. Elas definem o desenho novo:

1. **Tipo de cliente:** Pessoa física, Empresa ou Órgão público. Quais campos cada um tem? No órgão público: retenções (bruto × líquido), empenho com saldo, processo e modalidade, prazo de pagamento, fiscal.
2. **Tipos de cobrança:** mensalidade, implantação ou taxa única (parcelada **de verdade**?), banco de horas (tipos livres? por mês ou total? hora excedente cobrada?), projeto em parcelas.
3. **Vigência:** data final ou "sem prazo". Dia de vencimento da mensalidade.
4. **Reajuste:** automático na data de aniversário ou só lembrete?
5. **Estados da receita do contrato:** manter prevista → faturada (nota emitida) → recebida?
6. **Comissão de representante nas receitas do contrato:** sim ou não? Gerada no lançamento ou no recebimento?
7. **Catálogo de serviços:** por conta PJ (como os produtos) ou do dono?
8. **Aditivo e renovação:** histórico de alterações no mesmo contrato, ou encerrar e criar outro, como hoje?
9. **Compradores da vitrine:** viram clientes do cadastro?
10. **Anexos:** quais tipos de arquivo?

## 7. Sugestão de sequência

1. **Correção de segurança dos anexos** (3.1):
   - **Decisão do usuário (2026-10-04):** entra no fluxo normal da reescrita, junto com os anexos e os PDFs. Não haverá correção separada antes, porque não há contratos nem anexos na produção.
   - **Ressalva registrada:** a falha está no código em produção, não nos dados. Hoje só os donos e 1 colaborador com acesso a Contratos poderiam explorá-la.
   - Se entrarem novos colaboradores com acesso a Contratos antes de a reescrita chegar à produção, vale rever a decisão.
2. **Escopo de produto** com as decisões da seção 6.
3. **Análise de construção:** modelo novo, rotas, regras no servidor, telas e ordem de remoção.
4. **Protótipo navegável** das telas, no visual atual do sistema.
5. **`/planejar` em etapas:**
   1. clientes;
   2. contratos e cobranças;
   3. faturamento no painel, horas, anexos e assistente.
6. **Remoção do antigo:** em cada etapa, primeiro sai o código antigo, depois entra o novo (regra dos redesenhos). As tabelas e colunas antigas saem por migration confirmada.
