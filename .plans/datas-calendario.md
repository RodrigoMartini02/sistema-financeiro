# Plano de Implementação: Datas com calendário, seleção em lote pelo filtro e medidor do Comprometimento

## Origem

- Arquivo de especificação: não há arquivo `.md`. Os pedidos vieram da conversa de 2026-10-05 e estão registrados na memória `project_ajustes_pendentes`.
- Data do planejamento: `2026-10-05`
- Classificação: `frontend-only`

## Resumo

Três ajustes de tela, numa entrega só:

1. **Seleção em lote seguindo o filtro.** Hoje a seleção só zera quando o mês muda. Depois de filtrar, o contador continua com o total anterior e as despesas escondidas voltam marcadas quando o filtro sai. As canceladas que não foram pagas também entram no "marcar todas".
2. **Um campo de data único no sistema.**
   - Hoje há dois tipos de campo:
     - os digitados com máscara, em que o cursor pula para o fim e corrigir o dia exige apagar tudo de trás para frente;
     - os de calendário do navegador, com aparência diferente.
   - O campo novo aceita digitação livre, com edição no meio, e tem um ícone de calendário.
   - No Painel e nos Relatórios, o período vira um campo "de … até …", preenchido com dois cliques no calendário.
3. **Medidor de Comprometimento** do Painel. O desenho continua o mesmo, com acabamento melhor, centralizado no cartão e com o percentual e a situação dentro do arco.

## Escopo

### Dentro do escopo

- **Lançamentos (Movimentações):**
  - mudar qualquer filtro zera a seleção em lote;
  - despesa cancelada fica sem checkbox e fora do "marcar todas" e do pagamento em lote.
- **Componentes novos:** `CalendarPanel`, `DateField` (texto dd/mm/aaaa), `IsoDateField` (valor ISO, controlado ou por `name` em formulário) e `DateRangeField` (período).
- **Troca de todos os campos de data:**
  - 10 digitados: despesa, receita, parcelas, nota fiscal e contrato;
  - 17 do navegador:
    - perfil e Contas: nascimento, admissão e abertura;
    - pagamento e pagamento em lote;
    - Agenda;
    - assistente;
    - cadastro na tela de login.
- **Período com dois cliques:**
  - no Painel, sem o botão "Aplicar";
  - nos Relatórios, mantendo os atalhos de período que já existem.
- **Medidor** (`Medidor.tsx`) e o cartão "Comprometimento" (`CardsResumo.tsx`).
- **Remoção do antigo:** `DateCell`, a máscara e a conversão duplicadas do `DashboardPeriodFilter` e o `maskBrDate`, se ficar sem uso.

### Fora do escopo

- Período no filtro de Lançamentos: a lista é carregada por mês (decisão do usuário).
- Abrir o pagamento em lote direto pelo checkbox ou remover a barra de seleção (o usuário decidiu manter como está).
- Pagamento em lote no celular, que hoje não existe.
- Atalhos de período novos no Painel.
- Campos de hora (Agenda "Horário") e o seletor de mês das Movimentações (`MonthYearPicker`).
- Telas que só exibem datas.
- Backend, API, banco e o formato das datas enviadas.

## Leitura de contexto

- `/AGENT.md` (lido) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem no projeto**. O `AGENT.md` da raiz cobre tudo.
- **Especificação:** pedidos do usuário nesta conversa e respostas às perguntas (2026-10-05):
  1. "de trás pra frente" = o cursor pula para o fim;
  2. um componente para todas as datas;
  3. período no Painel e nos Relatórios, e não em Lançamentos;
  4. limpar a seleção ao mudar o filtro;
  5. tirar as canceladas da seleção.
- **Decisões do planejamento:**
  - D1: branch nova `feat/R/datas-calendario`, criada da `main`;
  - D2: o "Aplicar" do Painel sai.
- **Arquivos lidos:**
  - movimentações: `LancamentosTable.tsx`, `useEntryFilters.ts`, `MovimentacoesScreen.tsx`, `utils/expenseFilters.ts`, `BatchPaymentModal.tsx`;
  - datas: `entry-dialog/DateCell.tsx`, `utils/date.ts`, `DashboardPeriodFilter.tsx`, `FinanceDashboard.tsx`, `reports/ReportsScreen.tsx`, `config/ContasTab.tsx`, `public/LoginPage.tsx`, `PaymentModal.tsx`, `AppointmentDialog.tsx`, `financial-assistant/InstallmentList.tsx`, `ui/FloatingPanel.tsx`, `ui/form.tsx`;
  - grades dos modais: `expense-dialog/expenseGrid.ts`, `expense-dialog/ExpenseRow.tsx`, `income-dialog/incomeGrid.ts`;
  - medidor: `painel/graficos/Medidor.tsx`, `painel/CardsResumo.tsx`, `painel/painelFormat.ts`;
  - `package.json`: nenhuma biblioteca de datas.

## Impacto por área

### Frontend

#### 1. Seleção em lote (`LancamentosTable.tsx`)

- **`isBatchSelectable(expense)`** em `src/utils/expenseFilters.ts`, com teste: `!pago && status !== 'cancelada'`.
- **Usos:**
  - na lista de selecionáveis (`unpaidExpensesFiltered` / `unpaidChaves`);
  - no checkbox da linha, que só aparece se a despesa for selecionável;
  - em `selecionadasExpenses`.
- **Zerar a seleção** quando qualquer filtro mudar: tipo, status, categoria, forma de pagamento, cartão, data de pagamento e pessoas.
  - Usar uma **chave em texto** montada com o conteúdo dos conjuntos (ordenado), por exemplo `filterKey`, em `useEffect(() => setSelecionadas(new Set()), [month, year, filterKey])`.
  - **Nunca** usar `nomesVisiveis` direto como dependência. `useEntryFilters` recria esse `Set` a cada render, e isso causaria o loop de renderização que já aconteceu nesta tela.
- **Sem mudança** na barra, no modal e nas dicas de primeiro acesso.

#### 2. Datas

**Regras de digitação** (`DateField`):

- **Formato:** dd/mm/aaaa, com barras automáticas; o teclado do celular é numérico.
- **Digitar no meio:** escreve por cima do dígito naquele lugar. O resto não anda, e o cursor vai para o próximo dígito, pulando a barra.
- **Apagar no meio** (Backspace ou Delete): limpa só aquele dígito, que aparece como `_` (ex.: `0_/10/2026`), e o cursor fica no lugar. Apagar do fim remove como hoje, sem `_` sobrando no final.
- **Seleção mais digitação:** substitui só a parte selecionada (dia, mês ou ano). O resto fica.
- **Barra digitada** (`/`, `.` ou `-`): completa a parte atual com zero à esquerda e vai para a próxima ("5/" vira "05/").
- **Colar:** "05/10/2026", "5/10/2026", "05102026" e "2026-10-05" viram 05/10/2026. Outro texto: só os dígitos, a partir do cursor.
- **Ao sair do campo:** completa como hoje (`completeBrDate`: "5" vira dia 5 do mês e ano atuais; "0510", 05/10 do ano atual; "051026", 05/10/2026). Data com `_` ou inexistente (31/02) fica como está e a borda fica vermelha, como hoje.
- **Implementação:**
  - ouvinte **nativo** `beforeinput` (pelo `ref`), que chama uma função pura e faz `preventDefault`; o cursor é ajustado com `setSelectionRange` no layout;
  - o `onChange` fica de reserva, para preenchimento automático e composição de teclado, normalizando pelo formato.

**Calendário** (`CalendarPanel`, dentro do `FloatingPanel`):

- **Onde abre:** pelo ícone dentro do campo, à direita (`aria-label` "Abrir calendário"). No computador, abre junto do campo (largura de cerca de 280 px); abaixo de 1024 px, vira painel inferior, como os outros painéis do sistema.
- **Cabeçalho:** "‹" e "›" ao lado das listas de **mês** e **ano**.
  - Os anos vão de 1900 a ano atual + 20, sempre incluindo o ano da data escolhida.
  - Isso permite chegar rápido a uma data de nascimento.
- **Grade:**
  - semana começando no domingo: D S T Q Q S S;
  - 6 semanas, com os dias dos meses vizinhos esmaecidos;
  - hoje com contorno, dia escolhido preenchido na cor primária.
- **Rodapé:** "Hoje" sempre; "Limpar" só nos campos opcionais (`required` falso).
- **Teclado:**
  - setas andam ±1 dia (←→) ou ±7 dias (↑↓);
  - PageUp/PageDown trocam o mês;
  - Enter escolhe, Esc fecha (o `FloatingPanel` já trata o Esc).
  - Ao abrir, o foco vai para o dia escolhido, ou para hoje.
- **Ao escolher um dia:** preenche o campo, fecha o calendário e devolve o foco ao campo.
- **Campo desabilitado:** o ícone também fica desabilitado.

**Período** (`DateRangeField`):

- **Aparência:** uma pílula "📅 de [DateField] até [DateField]".
- **Calendário em modo período:**
  - o 1º clique marca o início, e os dias até o mouse ficam destacados;
  - o 2º clique marca o fim; se vier antes do início, as datas se invertem;
  - no 2º clique o período é aplicado e o calendário fecha.
- **Digitação:** aplica no Enter ou ao sair de um dos campos, quando as duas datas são válidas e o início não passa do fim. Senão a borda fica vermelha e o período não muda.
- **Valor:** `{ start, end }` em ISO.

**APIs dos componentes:**

- **`DateField`:**
  - valor em texto dd/mm/aaaa, como o `DateCell`;
  - props: `value`, `onChange`, `todayIso`, `label`, `placeholder`, `title`, `disabled`, `invalid`, `emptyFallback`, `height`, `required`, `inputStyle`/`className`.
- **`IsoDateField`:** valor em ISO.
  - **Modo controlado:** `value` e `onChange(iso | '')`. Texto incompleto ou inválido devolve `''`, como o campo do navegador faz hoje, com a borda vermelha.
  - **Modo de formulário:** `defaultValue` e `name`, gravados num `<input type="hidden">` com o ISO, para os formulários lidos por `FormData` não mudarem.
- **`DateRangeField`:** `value` e `onChange({ start, end })`.
- **Estilo:** cada lugar mantém a aparência do seu campo (`fieldInputStyle`, `Input` do `ui/form`, estilo transparente do assistente…). O ícone ganha espaço no `padding-right`.
- **Tema escuro:** com as cores do sistema (`C` dos modais e classes `dark:`).

**Trocas:**

- **`DateCell` → `DateField`:**
  - `ExpenseRow` (compra, vencimento, emissão da NF e o 4º uso);
  - `InstallmentsPopover`;
  - `IncomeRow`;
  - `ContractWizardSteps` (início, fim, data-base e 1ª parcela).
  - O arquivo `entry-dialog/DateCell.tsx` é apagado.
- **Grades:**
  - as colunas de data de `expenseGrid.ts` (hoje `minmax(80px,84px)`) e de `incomeGrid.ts` (`minmax(84px,104px)` e `minmax(84px,100px)`) passam a ter mínimo de cerca de 100 px;
  - a coluna de descrição (`1fr`) absorve a diferença;
  - conferir nos prints com 1024 e 1240 px.
- **Campos do navegador → `IsoDateField`:**
  - pagamento: `PaymentModal` (data de pagamento) e `BatchPaymentModal`;
  - Agenda: `AppointmentDialog`, com o `Controller` do react-hook-form no lugar do `register('data')`;
  - perfil e Contas, em `ContasTab`: admissão, nascimento (3) e abertura, por `name` e `defaultValue`;
  - cadastro, em `LoginPage`: `data_abertura` e `data_nascimento`, por `name`;
  - assistente: `FinancialAssistant` (compra, pago em, emissão…), `InstallmentList` e `PaymentCard`.
- **Painel** (`DashboardPeriodFilter.tsx`):
  - passa a usar o `DateRangeField`;
  - saem o `maskDate`, o `brParaIso` local e o botão "Aplicar";
  - continuam o `periodoDoAnoAtual` e o `descreverPeriodo`.
- **Relatórios:** os dois campos "De" e "Até" do navegador viram um `DateRangeField`; os atalhos continuam e preenchem o campo.
- **`utils/date.ts`:** o `maskBrDate` sai se ficar sem uso. As conversões `isoToBrDate`, `brDateToIso` e `completeBrDate` são reaproveitadas.

#### 3. Medidor de Comprometimento

- **`Medidor.tsx`:**
  - continua igual em: faixas 0–70, 70–90 e 90–100 em tom suave, arco do valor na cor da situação, marcador na ponta e animação (`useTransicao`);
  - muda em:
    - fica maior (cerca de 148 × 84);
    - traço de cerca de 11 px com pontas arredondadas;
    - o arco do valor fica cheio acima de 100%.
- **Texto dentro do arco:**
  - centralizado embaixo, em HTML sobre o SVG;
  - o percentual usa `NumeroAnimado` com `formatarPercentual`;
  - a situação vem com o ícone de alerta quando não é "saudável" e mantém as cores de `situacaoComprometimento`;
  - o tamanho do texto cabe "1.250%".
- **`CardsResumo.tsx`:**
  - o rótulo "Comprometimento" continua no alto, como nos outros cartões;
  - o medidor fica centralizado no cartão;
  - o estado "Sem receita no período" também fica centralizado;
  - a altura fica no máximo cerca de 12 px acima dos cartões vizinhos.
- **Acessibilidade:** o texto continua visível e legível por leitor de tela; o SVG continua `aria-hidden`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado: sem variáveis novas e sem dependência nova.

## Arquivos provavelmente afetados

- **Novos:**
  - `src/utils/dateEditing.ts` e `src/utils/dateEditing.test.ts`;
  - `src/utils/calendarGrid.ts` e `src/utils/calendarGrid.test.ts`;
  - `src/ui/CalendarPanel.tsx`;
  - `src/ui/DateField.tsx` (`DateField` e `IsoDateField`);
  - `src/ui/DateRangeField.tsx`.
- **Seleção em lote:**
  - `src/screens/finance/LancamentosTable.tsx`;
  - `src/utils/expenseFilters.ts` e `src/utils/expenseFilters.test.ts`.
- **Datas digitadas:**
  - `src/screens/finance/entry-dialog/DateCell.tsx` (apagado);
  - `src/utils/date.ts`;
  - `src/screens/finance/expense-dialog/ExpenseRow.tsx`, `InstallmentsPopover.tsx` e `expenseGrid.ts`;
  - `src/screens/finance/income-dialog/IncomeRow.tsx` e `incomeGrid.ts`;
  - `src/screens/clients/ContractWizardSteps.tsx`.
- **Datas do navegador:**
  - `src/screens/finance/PaymentModal.tsx`, `BatchPaymentModal.tsx` e `AppointmentDialog.tsx`;
  - `src/screens/config/ContasTab.tsx`;
  - `src/screens/public/LoginPage.tsx`;
  - `src/components/financial-assistant/FinancialAssistant.tsx`, `InstallmentList.tsx` e `PaymentCard.tsx`.
- **Períodos:**
  - `src/screens/finance/DashboardPeriodFilter.tsx` e `FinanceDashboard.tsx`, se precisar;
  - `src/screens/reports/ReportsScreen.tsx`.
- **Medidor:** `src/screens/finance/painel/graficos/Medidor.tsx` e `src/screens/finance/painel/CardsResumo.tsx`.

## Estratégia de implementação

1. **Branch:** `git checkout main && git pull`, depois `git checkout -b feat/R/datas-calendario`.
2. **Seleção em lote:**
   - criar `isBatchSelectable`, com teste;
   - em `LancamentosTable`, aplicar os usos e zerar a seleção pela chave de filtros em texto;
   - commit.
3. **Regras puras com teste:**
   - `dateEditing.ts`: `applyDateEdit(state, edit)` devolve `{ text, caret }`, com as regras de digitação, mais a normalização do texto colado;
   - `calendarGrid.ts`: grade do mês, navegação por teclado, clique do período (`rangeAfterClick`) e dia dentro do período;
   - tudo com datas em texto ISO, sem `new Date('aaaa-mm-dd')`, que é lido como UTC e desloca o dia no fuso do Brasil;
   - commit.
4. **Componentes:**
   - `CalendarPanel`, `DateField`, `IsoDateField` e `DateRangeField`, sobre o `FloatingPanel`;
   - sem biblioteca nova;
   - commit.
5. **Remover o antigo e trocar as datas digitadas:**
   - apagar o `DateCell` e trocar as 10 chamadas para `DateField`;
   - alargar as colunas de data das grades;
   - tirar o `maskBrDate` se ficar sem uso;
   - commit.
6. **Trocar os campos do navegador** pelo `IsoDateField`:
   - pagamento, pagamento em lote, Agenda (`Controller`), Contas, cadastro e assistente;
   - commit.
7. **Períodos:**
   - Painel: `DashboardPeriodFilter` com `DateRangeField`, sem "Aplicar", sem a máscara duplicada;
   - Relatórios: `DateRangeField`;
   - commit.
8. **Medidor:** `Medidor` e cartão em `CardsResumo`. Commit.
9. **Validação técnica:**
   - `tsc`, `npm test` e `npm run build`;
   - teste de tela no jsdom, com arquivos `tmpclaude-*` ignorados pelo git:
     - digitação pelo `beforeinput` (meio, seleção, barra, colar, Backspace no meio) e posição do cursor;
     - calendário: abrir, escolher, Hoje, Limpar, Esc e teclado;
     - período com dois cliques e com digitação, mais o Painel sem "Aplicar";
     - seleção em lote: marcar todas, mudar o filtro e ver zerar; cancelada sem checkbox;
     - formulário de Contas enviando a mesma data por `FormData`;
     - Agenda salvando a data;
   - registro neste plano.
10. **Aprovação visual:**
    - prints (Edge sem cabeça; celular = quadro de 390 px) de:
      - modal de despesa e de receita, com o calendário aberto, no computador (1240 e 1024 px) e no celular (painel inferior);
      - campo com data incompleta;
      - período do Painel e dos Relatórios no meio da escolha;
      - Contas;
      - medidor nas três situações e com 1.250%, nos temas claro e escuro;
    - **a implementação para aqui** até o usuário aprovar. Ajustes viram commits.
11. **`/finalizar`:** commit, push, merge na `main` com confirmação e conferência do deploy. Não há migration.

## Regras de negócio identificadas

- **Selecionável no lote:** despesa não paga e não cancelada que aparece com os filtros atuais.
- **Zerar a seleção:** qualquer mudança de filtro zera a seleção (e a mudança de mês já zerava).
- **Formulários:** as datas gravadas mantêm o formato de hoje: ISO nos formulários e na API, dd/mm/aaaa nos rascunhos dos modais.
- **Completar ao sair do campo:** igual ao de hoje (`completeBrDate`).
- **Período:** início ≤ fim; o 2º clique antes do 1º inverte as datas; o período aplica no 2º clique, no Enter ou ao sair do campo.
- **Comprometimento:**
  - faixas (70 e 90) e situações (saudável, atenção, crítico) sem mudança;
  - acima de 100%, o arco fica cheio e o texto mostra o valor real.

## Regras multi-tenant e segurança

- Só front: nenhuma leitura ou escrita nova de dados e nenhuma rota nova.
- Os formulários continuam mandando os mesmos campos; a validação do backend continua valendo.
- O pagamento em lote continua pelas rotas atuais, que validam a conta e a permissão.
- Não muda o que cada perfil vê. A seleção é só estado da tela.

## Validações necessárias

- **Data:** existente (`brDateToIso`: 31/02 é inválida), sem `_`. Os anos aceitos são os da lista do calendário, 1900 a ano atual + 20; na digitação vale qualquer data existente, como hoje.
- **Período:** as duas datas válidas e o início não passa do fim. Sem isso, a borda fica vermelha e o período não muda.
- **`IsoDateField`:** com texto inválido, o valor fica `''`, igual ao campo do navegador hoje.

## Testes necessários

### Frontend

- **`dateEditing.test.ts`:**
  - digitar do zero, incluindo a barra automática;
  - escrever por cima no meio;
  - Backspace e Delete no meio, que deixam `_`;
  - Backspace no fim, que tira o dígito sem deixar `_`;
  - selecionar e digitar;
  - barra digitada ("5/" vira "05/");
  - limite de 8 dígitos;
  - os quatro formatos de colar;
  - posição do cursor em cada caso.
- **`calendarGrid.test.ts`:**
  - grade com 6 semanas e começando no domingo;
  - fevereiro em ano bissexto;
  - meses vizinhos;
  - teclado: ±1, ±7 e troca de mês;
  - `rangeAfterClick` (início, fim, invertido, recomeço);
  - dia dentro do período.
- **`expenseFilters.test.ts`:** `isBatchSelectable` (paga, cancelada, pendente).
- **Tela no jsdom:** os cenários da etapa 9.

### Backend

- Sem testes novos, porque não há mudança.

### E2E

- Sem E2E automatizado. Conferir num navegador de verdade, incluindo um celular Android:
  - digitação no meio;
  - calendário em painel inferior;
  - período;
  - pagamento em lote com filtro.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
npx tsx tmpclaude-<cenarios>.tsx   # teste de tela no jsdom (temporário)
```

## Riscos e pontos de atenção

- **Cerca de 30 campos trocados em uns 15 arquivos.**
  - **Risco:** quebrar formulários (`name`, `defaultValue`, react-hook-form).
  - **Cuidado:** campo escondido com o mesmo `name` e ISO, o `Controller` na Agenda e teste de tela por tipo de formulário.
- **Teclado do Android e composição.**
  - **Risco:** o `beforeinput` não pegar tudo.
  - **Cuidado:** o `onChange` de reserva normaliza; é obrigatório conferir num celular de verdade.
- **Grades apertadas dos modais.**
  - **Risco:** o ícone apertar a descrição.
  - **Cuidado:** colunas de data com cerca de 100 px de mínimo, conferidas nos prints com 1024 e 1240 px.
- **Loop de renderização da `LancamentosTable`** (já aconteceu).
  - **Cuidado:** zerar por chave em texto, nunca pelos conjuntos recriados a cada render.
- **Fuso horário.**
  - **Cuidado:** só texto ISO e `new Date(ano, mês, dia)` local, sem `new Date('aaaa-mm-dd')`.
- **Painel sem "Aplicar".**
  - **Risco:** cada período válido dispara a consulta.
  - **Cuidado:** só no 2º clique, no Enter ou ao sair do campo, nunca a cada tecla.
- **Medidor com valores muito altos.**
  - **Cuidado:** o texto precisa caber dentro do arco; conferir com 1.250% nos prints.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Seleção em lote:**
  - com todas marcadas, mudar qualquer filtro deixa a seleção vazia;
  - "marcar todas" pega só as pendentes visíveis e não canceladas;
  - cancelada não tem checkbox.
- **Todos os campos de data:**
  - corrigir o dia no meio não mexe no mês nem no ano, e o cursor não pula para o fim;
  - colar, completar ao sair e barra digitada seguem as regras.
- **Calendário:**
  - o ícone abre o calendário, e escolher um dia preenche e fecha;
  - mês e ano por lista, "Hoje", "Limpar" (só nos opcionais) e Esc funcionam;
  - no celular, abre como painel inferior.
- **Períodos:**
  - Painel e Relatórios: dois cliques aplicam "de … até …", com o 2º clique antes do 1º invertendo as datas;
  - a digitação aplica no Enter ou ao sair do campo;
  - o Painel não tem mais "Aplicar".
- **Formulários:** Contas (perfil, conta e colaborador), cadastro, Agenda, pagamento, assistente, lançamentos e contrato gravam a data como hoje.
- **Medidor:** fica centralizado, com o percentual e a situação dentro do arco, nas três situações e com 1.250%, nos temas claro e escuro.
- **Checks:** `tsc`, testes e build sem erros; teste de tela passando; prints aprovados pelo usuário.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal; seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch:** `feat/R/datas-calendario`, a partir da `main` atualizada. Um commit por etapa.
- **Redesenho:** **primeiro sai o código antigo**, depois entra o novo. Nada de `DateCell` ou máscara antiga convivendo com o componente novo.
- **Código:**
  - identificadores em inglês, textos de tela em português;
  - nada de `any`;
  - regras puras em `src/utils/`, com teste;
  - **sem dependência nova.**
- **Efeitos na `LancamentosTable`:** depender só de valores estáveis (texto ou estado). Nunca de conjuntos ou listas recriados a cada render.
- **Arquivos temporários:** `tmpclaude-*`, ignorados pelo git e apagados no fim.
- **Aprovação visual:** a etapa 10 é obrigatória antes do `/finalizar`.
- **Migrations:** este plano não tem migration. Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
- **Várias sessões:** registrar no fim deste plano, a cada etapa concluída, o que foi feito, os commits e os desvios.

## Registro de andamento

### Etapas 1 a 8 (2026-10-05)

- Branch `feat/R/datas-calendario` criada da `main` (`7992eebc`).
- **Commits por etapa:**

| Etapa | Commit | O que entrou |
| --- | --- | --- |
| 2 | `a644856a` | seleção em lote (com o plano) |
| 3 | `104e69a3` | regras puras |
| 4 | `123f6785` | componentes |
| 5 | `ef92c666` | datas digitadas |
| 6 | `9b52fe9d` | datas do navegador |
| 7 | `259046b6` | períodos |
| 8 | `82a8f0dd` | medidor |
| 10 | `8f6bcc16` | ajuste dos dias do calendário em círculo |

- **Seleção em lote:**
  - `isBatchSelectable` e `expenseFiltersKey` em `utils/expenseFilters.ts`, com teste;
  - a chave em texto inclui as pessoas (`nomesVisiveis`), que mudam o que aparece.
- **Regras puras:**
  - `utils/dateEditing.ts` (`applyDateEdit`, `normalizeDateText`, `normalizePastedDate`, `hasEmptyDigit`), 15 testes;
  - `utils/calendarGrid.ts` (grade, teclado, período, anos), 9 testes;
  - `brDateToIso` e `completeBrDate` não mexem em data com "_".
- **Componentes:**
  - `ui/CalendarPanel.tsx`, `ui/DateField.tsx` (`DateField` e `IsoDateField`) e `ui/DateRangeField.tsx`;
  - o ícone fica compacto (12 px) nas caixas abaixo de 32 px e com 14 px nos formulários.
- **Grades:**
  - na despesa, Compra e Vencimento passam a `minmax(90px,100px)` e Pago em a `minmax(114px,128px)`;
  - na receita, Recebido em passa a `minmax(90px,108px)` (pessoal) e `minmax(90px,104px)` (empresa).
- **Desvios do plano:**
  1. **Pagamento avulso** (`PaymentModal`): passou a não confirmar sem data. Com a digitação, a data incompleta chega vazia, e antes o botão mandaria a data vazia.
  2. **`inputBase`** do `ui/form.tsx` passou a ser exportado, para o cadastro (`LoginPage`) usar a mesma caixa do `Input`.
  3. **Assistente:** a lista de parcelas (`InstallmentList`) usa o `DateField` com o texto do rascunho direto, sem a conversão de ida e volta para ISO.

### Etapa 9 — validação

- **Checks:** front `tsc`, 147/147 e build; back `tsc` (sem mudança).
- **Teste de tela no jsdom** (arquivos `tmpclaude-*`):
  - **componentes, 30/30:**
    - digitação pelo `beforeinput` (do zero, no meio, "_", seleção, colar, completar);
    - calendário (foco, setas, PageDown, listas de mês e ano, Hoje, Limpar, Esc, painel inferior);
    - `IsoDateField` em formulário (FormData em ISO, vazio com data incompleta, borda vermelha) e controlado;
    - período com dois cliques (invertido) e digitado (aplica ao sair; início depois do fim não aplica);
  - **telas, 10/10:**
    - Lançamentos: cancelada e paga sem checkbox; marcar todas pega 2; mudar o filtro zera; com filtro pega 1. Sem loop de renderização com `nomesVisiveis` novo a cada render;
    - Agenda grava a data digitada em ISO;
    - pagamento bloqueado com data incompleta e confirmado em ISO;
    - Painel sem "Aplicar", com dois cliques aplicando.
- **Achado fora do plano:** a Agenda não grava sem a duração preenchida. Já acontece no código antigo: a duração vazia é recusada pela validação (`z.coerce.number().min(1)`) sem mensagem. Relatado ao usuário, não corrigido.

### Etapa 10 — prints

- **Quadros:** computador com 1280 px e, nos modais de lançamento, também com 1040 px; celular num quadro de 390 px.
- **Telas:**
  - despesa com o calendário aberto; despesa e receita fechadas;
  - pagamento com o calendário e com a data incompleta;
  - Agenda;
  - período do Painel no meio da escolha;
  - Relatórios;
  - medidor nas situações saudável, atenção, crítico e 1250%, no claro, no escuro e no celular.
- **Ajuste feito pelos prints:** os dias do calendário viravam ovais no painel inferior do celular. Agora são círculos de 36 px.
- **Aguardando a aprovação do usuário.**
