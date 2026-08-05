# Task: Redesenhar o modal "Nova despesa" com automações inteligentes

## Contexto

O modal de lançamento de despesa fica em [ExpenseDialog.tsx](../../src/screens/finance/ExpenseDialog.tsx). Hoje ele já resolve bastante coisa (sugestão de categoria por palavra-chave, detecção de duplicata, lote de lançamentos, criação rápida de categoria, parcelamento), mas pede decisões demais do usuário no caminho comum: três toggles de status ("Já pago", "Recorrente", "Parcelado"), campos de valor/data soltos, forma de pagamento sem pré-seleção inteligente, e nenhum aproveitamento do histórico de lançamentos para acelerar a digitação.

O usuário forneceu duas entradas para esta task:

1. Uma especificação de comportamento em texto (reproduzida abaixo, seção "Especificação de comportamento").
2. Um mockup funcional em HTML/React (arquivo local `Nova Despesa (1).html`, um bundle standalone gerado por ferramenta de design) que já implementa a maior parte do comportamento especificado, com dados mockados localmente. O mockup é a referência de layout, estrutura visual e microinterações; a especificação em texto é a referência normativa de comportamento quando os dois divergirem.

Componentes hoje envolvidos no fluxo atual:

- [ExpenseDialog.tsx](../../src/screens/finance/ExpenseDialog.tsx) — o modal em si (formulário, lote, duplicata, NF).
- [ui/CategoryChipSelector.tsx](../../src/ui/CategoryChipSelector.tsx) — seletor de categoria atual (chips, não é o menu flutuante com busca descrito na spec).
- [ui/form.tsx](../../src/ui/form.tsx) — `Field`, `Input`, `Textarea`, `ToggleGroup`, `SectionDivider`.
- [ui/AttachmentSection.tsx](../../src/ui/AttachmentSection.tsx) — anexos.
- [utils/categorySuggestions.ts](../../src/utils/categorySuggestions.ts) — sugestão de categoria por descrição e categorias recentes (`getRecentCategoryIds`, `suggestCategoryForDescription`), hoje calculado no client a partir do cache do React Query.
- [services/configService.ts](../../src/services/configService.ts) — `fetchCategorias`, `fetchCartoes`, `saveCategoria`.
- [types/finance.ts](../../src/types/finance.ts) — `Expense`, `ExpenseFormValues`.
- [backend/src/routes/expenses.ts](../../backend/src/routes/expenses.ts) — rota de despesas no backend.

## Problema

O fluxo de lançar despesa mistura perguntas que o sistema já sabe responder (forma de pagamento mais comum daquela categoria, se a despesa já está paga dado a forma e a data, vencimento de fatura de cartão) com perguntas que só o usuário sabe (descrição, valor, se parcelou). Isso torna o preenchimento mais lento do que precisa ser e aumenta a chance de inconsistência (ex: usuário esquece de marcar "Já pago" numa compra à vista já efetuada).

Além disso, a estrutura visual atual (toggles soltos + blocos com `SectionDivider`) não segue o agrupamento em cards que o usuário quer, e o menu de categoria (`CategoryChipSelector`) não é um menu flutuante com busca — é uma lista de chips inline, o que pode empurrar a altura do modal.

## Objetivo

Redesenhar o modal "Nova despesa" para que o caminho mínimo seja **descrição + valor + salvar**, com todo o resto tendo padrão inteligente ou sendo derivado, seguindo a estrutura visual e as automações descritas no mockup e na especificação de comportamento abaixo.

## Especificação de comportamento (fonte normativa)

### Estrutura

Quatro blocos em cartões arredondados, sem linhas divisórias:

1. **Identificação** — Descrição | Categoria
2. **Valores** — Valor | link de juros/desconto
3. **Pagamento** — Forma de pagamento + cartão
4. **Recorrência e data** — Data da compra | "Isso se repete?"

Header e rodapé fixos; só o miolo rola. O botão de salvar nunca depende de scroll.

### Descrição (obrigatório)

Texto livre. Abaixo do campo: link "Anexar comprovante" e o chip de categoria sugerida.

**Autocompletar por histórico.** A partir de 2 caracteres, busca nos lançamentos anteriores do usuário por prefixo e por conteúdo. Mostra até 4 sugestões em lista flutuante, cada uma com descrição, valor, categoria e forma de pagamento da última vez. Ordena por frequência de uso, depois por recência.

- Seta ↑/↓ navega, Enter ou clique aceita.
- Aceitar preenche descrição, valor, categoria e forma de pagamento de uma vez.
- Esc fecha sem aceitar.
- Digitar depois de aceitar não reabre a lista para o mesmo termo.

**Sugestão de categoria.** Independente do autocompletar, a descrição casa contra uma tabela de palavras-chave (luz/energia/aluguel → Moradia, gasolina/posto → Combustível, uber/99 → Uber, etc). O casamento é por palavra inteira, nunca por substring — "99" não pode casar dentro de "1999". A sugestão aparece como chip clicável abaixo do campo; Tab aceita. Se o usuário já escolheu categoria manualmente, não sugere.

### Categoria (opcional)

Select de campo único que abre menu **flutuante** (position fixed, ancorado ao campo). O menu nunca empurra o conteúdo do modal nem estica a altura.

- Campo de busca no topo do menu, com foco automático ao abrir.
- Lista em coluna única: recentes primeiro, depois todas em ordem alfabética.
- Filtrar por texto digitado; se nada casar exatamente, oferece `+ criar "termo"`.
- Clique fora, Esc ou scroll do modal fecham o menu.
- Escolher fecha o menu e mostra a categoria como chip no campo.

### Valor (obrigatório)

Máscara de moeda pt-BR, digitação da direita para a esquerda (centavos primeiro). Prefixo R$ fixo à esquerda. Abaixo: "Última vez você pagou R$ X" quando a descrição casa com um lançamento anterior; senão "Preço base da compra".

### Valor final (opcional, oculto por padrão)

Aparece como link "+ Teve juros ou desconto". Ao abrir, é um campo idêntico ao Valor, com link "remover" para desfazer.

Quando preenchido e diferente do Valor:

- final > inicial → badge vermelho "+ R$ X de juros".
- final < inicial → badge verde "− R$ X de desconto".

O valor final é o que entra no fluxo de caixa e nas parcelas.

### Forma de pagamento

Quatro opções fixas, largura igual: **PIX · Dinheiro · Débito · Crédito**.

**Padrão inteligente:** a opção pré-selecionada é a mais usada pelo usuário *naquela categoria*. Sem histórico da categoria, usa a mais usada no geral. Sem histórico nenhum, PIX. A seleção automática nunca trava a escolha manual.

#### Cartões

Selecionar **Crédito** ou **Débito** revela um painel com os cartões cadastrados.

- Pré-seleciona o cartão mais usado pelo usuário (em Crédito, o mais usado em crédito).
- Com um só cartão cadastrado, não mostra a lista — só o texto informando qual é.
- Em Crédito, exibe o limite disponível do cartão selecionado.
- Em Débito, exibe a conta vinculada.

Crédito consome limite do cartão. Débito desconta saldo da conta.

### Isso se repete?

Três opções **mutuamente exclusivas**: **Não repete · Parcelas · Todo mês**. Padrão: Não repete.

Substitui os antigos "Já pago / Recorrente / Parcelado". "Já pago" não é mais perguntado — é derivado (ver Data e status).

#### Parcelas

Painel com dois campos numéricos livres:

- **Quantas parcelas** — inteiro, 2 a 360.
- **Quantas já pagas** — inteiro, 0 a (parcelas − 1), padrão 0.

Resumo ao lado, atualizado a cada tecla: `6x de R$ 63,30 · 1 de 6 pagas · próxima vence 05/09`.

Reduzir o número de parcelas reajusta "já pagas" para caber no novo limite.

**Ao salvar**, gera N registros filhos, um por parcela, cada um com sua data de vencimento (+1 mês a partir da primeira) e seu próprio status. Os K primeiros nascem pagos. O lançamento pai guarda a compra (descrição, valor total, cartão); as parcelas é que entram no fluxo de caixa.

#### Todo mês

- **PIX, Dinheiro ou Débito** — pede o dia do mês (1 a 31), texto "todo dia 5, até cancelar". Dias 29-31 caem no último dia dos meses curtos.
- **Crédito** — não pede nada. O dia é o vencimento da fatura do cartão. Texto: "todo mês na fatura Nubank, até cancelar".

Gera um registro por mês, com o valor cheio, sem data de término. Recorrência em crédito não consome o limite de uma vez — cada mês gera sua cobrança.

### Data e status

**Um único campo: Data da compra.** Padrão: hoje.

O vencimento é **derivado** e mostrado como texto abaixo do campo:

| Forma | Vencimento | Texto exibido |
|---|---|---|
| PIX / Dinheiro / Débito, data ≤ hoje | mesma data | "Pago na hora" |
| PIX / Dinheiro / Débito, data futura | mesma data | "Vence 12/09" |
| Crédito | calculado pela fatura | "Vence 10/09 · fatura Nubank" |
| Parcelas ou Todo mês | primeira ocorrência | "Primeira vence 10/09" |

**Cálculo da fatura:** o cadastro do cartão tem dia de fechamento e dia de vencimento. Compra até o fechamento entra na fatura do mês; depois do fechamento, na seguinte. O vencimento é o próximo dia de vencimento após o fechamento.

Link "alterar" abre um campo de data manual (casos de boleto com data própria) e vira "usar automática" para voltar ao cálculo.

**Selo de status** ao lado da data, derivado de forma + data:

- **Pago** (verde) — PIX/Dinheiro/Débito com data até hoje.
- **Agendado** (amarelo) — qualquer forma com data futura.
- **Entra na fatura** (azul) — Crédito.

### Salvar e lote

Rodapé fixo com duas ações de peso diferente:

- **"+ Adicionar ao lote"** — botão de texto, secundário.
- **"Registrar despesa"** — botão sólido, primário.

**Lote.** Adicionar empilha a despesa numa fila e limpa o formulário mantendo forma de pagamento e data, para o lançamento seguinte. A fila aparece no rodapé como chips removíveis, com contagem e soma: `NO LOTE · 3 · R$ 412,70`. Com lote ativo, o botão primário vira "Salvar N despesas" e grava tudo de uma vez, incluindo o formulário atual se estiver preenchido.

**Validação.** O botão primário fica desabilitado sem descrição e valor. O rodapé explica: "Preencha descrição e valor para registrar."

**Confirmação.** Após salvar, o rodapé mostra "✓ Despesa registrada" (ou "N despesas registradas") em verde por ~2,6s, e o formulário é limpo.

**Detecção de duplicata.** Se já existe lançamento com mesma descrição e mesmo valor nos últimos 7 dias, mostra aviso discreto no rodapé antes de salvar: "Você já lançou isso em 03/09 — é outra?" Não bloqueia, só avisa. (O modal atual já tem uma versão bloqueante disso — ver seção "Decisão técnica desejada".)

### Teclado

- **Enter** — salva.
- **Shift+Enter** — adiciona ao lote.
- **Tab** na descrição — aceita a categoria sugerida.
- **↑ ↓ Enter** na lista de autocompletar — navega e aceita.
- **Esc** — fecha o menu aberto; sem menu aberto, fecha o modal.

### Regras que não devem ser violadas

1. Nenhum menu ou painel pode esticar a altura do modal a ponto de esconder o rodapé.
2. Toda automação é visível e editável. Nada é gravado sem o usuário ver na tela.
3. Só automatize o que é sempre verdadeiro. Não inferir "Parcelado → Crédito": parcelamento acontece em qualquer meio.
4. Status de pagamento é propriedade da parcela, não da compra.
5. Campos numéricos (parcelas, já pagas, dia) são entrada livre, nunca seletores.

## O que o mockup já demonstra (mas com dados mockados)

O mockup (`Nova Despesa (1).html`) implementa toda a especificação acima com um componente React autocontido e dados **hardcoded no próprio arquivo**, não vindos de API real:

- `ALL_CATS` / `RECENTS`: listas fixas de categorias.
- `CARDS`: array fixo de 3 cartões com `uses`, `limite`, `usado`, `fecha`, `vence`.
- `RULES`: tabela de palavras-chave → categoria (equivalente ao que já existe em [utils/categorySuggestions.ts](../../src/utils/categorySuggestions.ts), mas reescrita).
- `RECENT_ENTRIES`: 9 lançamentos fixos usados tanto para o autocomplete de descrição quanto para o hint "última vez você pagou".
- `CAT_METHOD`: mapa fixo `categoria → forma de pagamento`, usado para a pré-seleção "inteligente" de forma de pagamento.

Ou seja: o mockup prova a interação e o layout, mas **não resolve de onde vêm os dados reais**. Isso fica em aberto para o planejamento (ver "Perguntas para o planejamento").

## Decisão técnica desejada

Nenhuma decisão de arquitetura foi fechada pelo usuário além do comportamento descrito acima. Em particular, ficam para o `/planejar` definir:

- Se o autocomplete de descrição e a pré-seleção de forma de pagamento são resolvidos com uma nova rota/query no backend (Express + PostgreSQL) ou com um cálculo client-side sobre dados já carregados em cache (como já é feito hoje em `getRecentCategoryIds`/`suggestCategoryForDescription`).
- Se o modal atual deve ser reescrito do zero ou evoluído incrementalmente a partir do `ExpenseDialog.tsx` existente, preservando os fluxos que já funcionam (NF para perfil empresa, anexos, lote, criação rápida de categoria).
- Como a detecção de duplicata bloqueante atual (que interrompe o submit e pede confirmação) deve virar um aviso "discreto e não bloqueante" sem perder a proteção que ela já oferece.

## Escopo Funcional

### Dentro do escopo

- Reestruturar o modal nos 4 blocos (Identificação, Valores, Pagamento, Recorrência e data) com header e rodapé fixos e miolo rolável.
- Trocar os três toggles "Já pago / Recorrente / Parcelado" por "Isso se repete?" (Não repete / Parcelas / Todo mês), com "Já pago" totalmente derivado de forma + data.
- Implementar o autocompletar de descrição por histórico (busca por prefixo e conteúdo, até 4 sugestões, navegação por teclado, preenchimento de descrição+valor+categoria+forma de pagamento).
- Trocar o `CategoryChipSelector` atual (ou estendê-lo) para um menu flutuante com busca, recentes + alfabética, criação inline, fechamento por clique fora/Esc/scroll.
- Implementar máscara de moeda pt-BR da direita para a esquerda no campo Valor.
- Implementar o campo "Valor final" oculto por padrão com badges de juros/desconto.
- Implementar pré-seleção inteligente de forma de pagamento por frequência de uso na categoria (com fallback geral → PIX).
- Implementar o painel de cartões (pré-seleção por uso, texto único quando há 1 cartão só, limite disponível em crédito, conta vinculada em débito).
- Implementar o painel "Parcelas" com campos livres de quantidade de parcelas e parcelas já pagas, com geração de N registros filhos ao salvar.
- Implementar o painel "Todo mês" com dia do mês livre (não-crédito) ou vencimento de fatura (crédito).
- Implementar a data única "Data da compra" com vencimento derivado, link "alterar"/"usar automática", e selo de status (Pago/Agendado/Entra na fatura).
- Ajustar a detecção de duplicata para aviso não bloqueante no rodapé, preservando a lógica de comparação existente.
- Manter o suporte a lote, anexos, criação rápida de categoria e bloco de Nota Fiscal (perfil empresa) já existentes, adaptados à nova estrutura.
- Suportar atalhos de teclado (Enter salva, Shift+Enter adiciona ao lote, Tab aceita categoria sugerida, setas navegam autocomplete, Esc fecha menu/modal).

### Fora do escopo inicial

- Qualquer alteração de schema/migration no banco sem confirmação explícita separada.
- Mudanças na tela de listagem de despesas ([DespesasScreen.tsx](../../src/screens/despesas/DespesasScreen.tsx)) além do necessário para consumir o novo formato de submit.
- Alterações no modal de pagamento em lote ([BatchPaymentModal.tsx](../../src/screens/finance/BatchPaymentModal.tsx)).
- Mudanças no cadastro/edição de cartões e categorias fora do que for necessário para ler `fecha`/`vence` de cartão e listar categorias.
- Internacionalização ou suporte a outras moedas além de BRL.
- Qualquer trabalho de infraestrutura ou deploy.

## Requisitos de Frontend

- Reescrever [ExpenseDialog.tsx](../../src/screens/finance/ExpenseDialog.tsx) (ou dividir em subcomponentes, a critério do planejamento) seguindo a estrutura de 4 blocos.
- Avaliar se `CategoryChipSelector` deve ser substituído por um novo componente de menu flutuante ou estendido — hoje ele não faz busca nem é `position: fixed`.
- Reaproveitar `Field`, `Input`, `ToggleGroup` de [ui/form.tsx](../../src/ui/form.tsx) onde fizer sentido; avaliar necessidade de componentes novos para máscara de moeda e o painel de autocomplete flutuante.
- Preservar a integração com `react-hook-form` + `zod` já usada no schema atual, ajustando o schema para os novos campos (`repeticao: 'nao' | 'parcelas' | 'mensal'`, `parcelasJaPagas`, `diaRecorrencia`, etc. — nomes exatos a definir no planejamento).
- Garantir que o cálculo de vencimento de fatura de cartão (fechamento/vencimento) seja implementado de forma testável e reaproveitável, não só inline no componente do modal.

## Requisitos de Backend

- Definir e implementar a fonte de dados para o autocomplete de descrição por histórico: precisa de uma rota nova (ex: busca por prefixo/conteúdo em `descricao` nas despesas do usuário, agregada por frequência) ou pode ser resolvido no client sobre dados já em cache do React Query, como hoje ocorre em `suggestCategoryForDescription`. Este é um ponto em aberto — ver "Perguntas para o planejamento".
- Definir e implementar a fonte de dados para a pré-seleção de forma de pagamento por frequência de categoria: precisa agregar despesas passadas por `categoria_id` + `formaPagamento` para achar a mais frequente, com fallback para a mais frequente no geral e por fim PIX. Avaliar se isso é uma query nova em [backend/src/routes/expenses.ts](../../backend/src/routes/expenses.ts) (ou rota dedicada) ou um cálculo client-side sobre o cache do dashboard, como o projeto já faz para `getRecentCategoryIds`.
- Se novos registros filhos de parcela já são suportados pela API de criação de despesa atual (`total_parcelas` já existe em `ExpenseFormValues`), confirmar se o backend atual já gera os N registros corretamente ou se precisa de ajuste para o novo modelo de "parcelas já pagas" (K primeiros nascem pagos).
- Confirmar se a recorrência "Todo mês" com dia livre e sem data de término já é suportada pelo campo `recorrente` existente ou exige modelagem nova.
- Nenhuma rota nova deve quebrar contratos existentes consumidos por [DespesasScreen.tsx](../../src/screens/despesas/DespesasScreen.tsx), [FinanceDashboard.tsx](../../src/screens/finance/FinanceDashboard.tsx) ou [RelatoriosScreen.tsx](../../src/screens/relatorios/RelatoriosScreen.tsx).

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente. Se o planejamento concluir que a agregação por categoria+forma de pagamento ou por frequência de descrição precisa de índice novo (ex: índice composto em `categoria_id, forma_pagamento` ou índice de texto em `descricao`) para performance aceitável, isso deve ser registrado como decisão separada — nenhuma migration roda sem confirmação explícita do usuário, conforme `CLAUDE.md` e `AGENT.md` deste projeto.

## Requisitos de Segurança

- O ambiente pode estar apontando para produção — nenhuma migration ou alteração de schema deve ser executada durante o planejamento ou implementação sem confirmação explícita.
- Não alterar `.env`.
- Este projeto é single-tenant/solo-dev (ver memória do projeto); não se aplicam regras de isolamento multi-tenant aqui, mas segue valendo evitar exposição de dados de despesas de outros perfis (`perfilAtivoTipo`) se o app tiver mais de um perfil ativo.

## Requisitos de Migração ou Compatibilidade

- O formato de saída do formulário (`ExpenseFormValues`, ver [types/finance.ts](../../src/types/finance.ts)) deve continuar compatível com o que `onSave` espera hoje, a menos que o planejamento decida deliberadamente estender esse tipo — nesse caso, mapear todos os consumidores afetados.
- Preservar o fluxo de edição de despesa existente (`expense` prop) — o novo modal precisa continuar funcionando tanto para criar quanto para editar.
- Preservar compatibilidade com o bloco de Nota Fiscal (visível apenas quando `perfilAtivoTipo === 'empresa'`).

## Requisitos de Testes

### Frontend

- Testar o cálculo de vencimento de fatura de cartão (fechamento antes/depois, viradas de mês, dias 29-31 no cálculo de recorrência mensal).
- Testar a lógica de ajuste de "parcelas já pagas" quando o número de parcelas é reduzido.
- Testar o casamento de palavra inteira na sugestão de categoria (garantir que "99" não casa dentro de "1999", conforme regra explícita da especificação).
- Testar os atalhos de teclado (Enter, Shift+Enter, Tab, Esc, setas) nos pontos onde já existir suíte de teste de componente no projeto; caso não exista, avaliar no planejamento se vale introduzir.

### Backend

- Se uma rota nova for criada para autocomplete de descrição ou forma de pagamento por frequência, testar os casos de fallback (sem histórico de categoria, sem histórico nenhum).

### E2E

- Não aplicável inicialmente — avaliar conforme o planejamento definir o quanto do fluxo crítico (lançar despesa parcelada, lançar despesa recorrente em crédito) precisa de cobertura E2E.

## Arquivos Provavelmente Afetados

### Frontend

- [src/screens/finance/ExpenseDialog.tsx](../../src/screens/finance/ExpenseDialog.tsx)
- [src/ui/CategoryChipSelector.tsx](../../src/ui/CategoryChipSelector.tsx)
- [src/ui/form.tsx](../../src/ui/form.tsx)
- [src/utils/categorySuggestions.ts](../../src/utils/categorySuggestions.ts)
- [src/services/configService.ts](../../src/services/configService.ts)
- [src/types/finance.ts](../../src/types/finance.ts)
- Possível novo componente de máscara de moeda e novo componente de menu de categoria flutuante (caminho a definir no planejamento).

### Backend

- [backend/src/routes/expenses.ts](../../backend/src/routes/expenses.ts) — se o planejamento decidir por rota(s) nova(s) de agregação.
- A identificar durante o planejamento caso surja necessidade de rota dedicada para autocomplete de descrição.

### Banco de Dados

- A identificar durante o planejamento, se necessário (índices de performance apenas, sem mudança de schema esperada).

## Critérios de Aceite

- O modal exibe os 4 blocos descritos (Identificação, Valores, Pagamento, Recorrência e data) em cards arredondados sem divisórias, com header e rodapé fixos e miolo rolável.
- É possível lançar uma despesa preenchendo apenas descrição e valor, com todo o resto assumindo padrão sensato.
- Os toggles "Já pago / Recorrente / Parcelado" não existem mais; "Isso se repete?" oferece Não repete / Parcelas / Todo mês, mutuamente exclusivos.
- "Já pago" nunca é perguntado ao usuário — é sempre derivado de forma de pagamento + data.
- O autocomplete de descrição aparece a partir de 2 caracteres, mostra até 4 sugestões ordenadas por frequência e depois recência, e aceitar uma sugestão preenche descrição, valor, categoria e forma de pagamento.
- A sugestão de categoria por palavra-chave usa casamento de palavra inteira (não substring) e não aparece se o usuário já escolheu categoria manualmente.
- O menu de categoria abre flutuante, ancorado ao campo, sem nunca esticar a altura do modal, com busca, recentes + alfabética, e opção de criar categoria nova.
- A forma de pagamento vem pré-selecionada pela mais usada na categoria (ou geral, ou PIX, nessa ordem de fallback), sem travar escolha manual.
- O painel de cartões aparece em Crédito/Débito, mostra limite disponível ou conta vinculada conforme o caso, e omite a lista quando há apenas um cartão cadastrado.
- O painel "Parcelas" aceita quantidade de parcelas (2-360) e parcelas já pagas (0 a parcelas-1) como campos de texto livre, reajustando "já pagas" quando parcelas diminui, e gera os registros filhos corretos ao salvar.
- O painel "Todo mês" pede dia do mês livre para formas não-crédito e não pede nada para crédito (usa vencimento de fatura), respeitando meses curtos.
- O vencimento é sempre derivado e exibido como texto conforme a tabela da especificação; existe link para alternar para data manual e voltar ao automático.
- O selo de status (Pago/Agendado/Entra na fatura) reflete corretamente forma + data.
- O rodapé mostra lote como chips removíveis com contagem e soma, botão primário desabilitado sem descrição+valor com texto explicativo, e confirmação verde temporária após salvar.
- A detecção de duplicata deixa de bloquear o submit e passa a ser um aviso discreto e não bloqueante no rodapé.
- Todos os atalhos de teclado especificados funcionam (Enter, Shift+Enter, Tab, setas, Esc).
- Fluxos existentes continuam funcionando: edição de despesa, anexos, bloco de Nota Fiscal (perfil empresa), lote, criação rápida de categoria.
- `npm run build` passa ao final.

## Perguntas Para o Planejamento

- O autocomplete de descrição por histórico deve consultar uma rota nova no backend ou pode ser resolvido client-side sobre o cache do React Query já usado hoje em `suggestCategoryForDescription`/`getRecentCategoryIds`? Qual a diferença de custo/latência esperada com o volume real de despesas do usuário?
- A pré-seleção de forma de pagamento por frequência de categoria deve ser calculada no backend (nova agregação) ou no client, reaproveitando dados já carregados no dashboard?
- O `CategoryChipSelector` atual deve ser substituído por um componente novo de menu flutuante, ou estendido para suportar busca + `position: fixed`?
- O schema `ExpenseFormValues`/`Expense` precisa de novos campos (ex: `parcelasJaPagas`, `diaRecorrencia`, `tipoRepeticao`) ou os campos existentes (`total_parcelas`, `recorrente`, `parcelado`) já cobrem o novo modelo sem quebrar compatibilidade?
- A geração de N registros filhos de parcela com K já pagos: o backend já suporta isso hoje (dado que `total_parcelas` já existe), ou precisa de ajuste?
- Como fica a detecção de duplicata: reaproveitar a lógica de comparação já existente em `handleSubmit` (mesma descrição + valor + forma de pagamento nos últimos 7 dias) só trocando o bloqueio pelo aviso não bloqueante, ou revisar os critérios de match?
- O modal deve ser reescrito do zero como novo componente, ou evoluído incrementalmente a partir do `ExpenseDialog.tsx` atual, preservando testes/comportamento existentes ao máximo?
- Existe suíte de testes de componente hoje no projeto para modais de despesa? Se não, o planejamento deve propor introduzir cobertura mínima ou aceitar validação manual?

## Instruções Para a Skill Planejar

- Usar esta task como especificação de entrada.
- Ler `CLAUDE.md` e `AGENT.md` na raiz de `sistema financas` antes de propor o plano.
- Inspecionar [ExpenseDialog.tsx](../../src/screens/finance/ExpenseDialog.tsx), [CategoryChipSelector.tsx](../../src/ui/CategoryChipSelector.tsx), [categorySuggestions.ts](../../src/utils/categorySuggestions.ts) e [expenses.ts](../../backend/src/routes/expenses.ts) antes de escrever o plano.
- Resolver explicitamente as "Perguntas para o planejamento" antes de detalhar etapas, especialmente a origem de dados do autocomplete e da pré-seleção de forma de pagamento — não deixe isso como TODO dentro do plano de implementação.
- Classificar a implementação como `frontend + backend` (o núcleo é frontend, mas a task não deve assumir zero impacto de backend sem investigar as duas automações de histórico).
- Não implementar código durante o planejamento.
- Não instalar dependências durante o planejamento.
- Não executar migrations.
- Gerar um plano em `.plans/` com etapas pequenas e revisáveis, considerando que o projeto é de um único desenvolvedor, sem PR, com merge direto em `main` após `/finalizar`.
