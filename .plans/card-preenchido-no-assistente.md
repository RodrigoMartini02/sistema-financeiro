# Plano de Implementação: Card pré-preenchido no assistente

## Origem

- Arquivo de especificação: conversa direta com o usuário (não houve `.md` de
  entrada; a task `.portal/tasks/editor-de-fluxo-do-assistente-executavel.md`
  foi superada por esta mudança de rumo)
- Data do planejamento: 2026-09-15
- Classificação: `frontend + backend`

## Resumo

O assistente para de conduzir a conversa com 7 a 10 perguntas encadeadas. O
usuário escreve a frase, o assistente extrai o que conseguir e abre **o modal
de lançamento já existente**, pré-preenchido; o usuário completa o que faltar e
salva.

Motivo: quem digita "gastei 50 no mercado no crédito" já tem todos os dados na
cabeça. O fluxo guiado obriga a soltá-los em conta-gotas, no ritmo da máquina.
Uma interação substitui dez.

O fluxo guiado e o editor de fluxograma **saem do produto mas permanecem no
código, testados**, porque o usuário pretende retomá-los.

## Escopo

### Dentro do escopo

- Resposta do backend devolve o rascunho completo em vez da próxima pergunta
- Pré-preenchimento por histórico, estendendo o que `suggestCategory` já faz
- Chat abre `ExpenseDialog` / `IncomeDialog` com o rascunho
- Marca visual nos campos deduzidos, distinguindo-os dos vazios
- Desativar o fluxo guiado e o editor de fluxo (sidebar + roteamento)
- Garantir que voz e anexo de comprovante sigam pelo novo caminho

### Fora do escopo

- Remover o código do fluxo guiado, do motor e do editor (fica para quando o
  usuário retomar ou desistir dele)
- Aprender com correções do usuário (tabela de aprendizado, pesos, confiança)
- Campos personalizados e coluna `extras`
- Fluxo de consulta desenhado
- Transições explícitas e "o desenho manda" (plano
  `.plans/editor-completo-desenho-manda.md`, superado por este)

## Leitura de contexto

- `/AGENT.md` — lido. Descreve um sistema multi-prefeitura com RLS que **não
  corresponde a este projeto**; aplicadas apenas as regras transversais (sem
  `any`, sem catch silencioso, nomes explícitos, Drizzle, React Query com query
  keys centralizadas, nunca executar migration sem confirmação)
- `/CLAUDE.md` — fluxo obrigatório `/planejar → aprovação → /implementar →
  /finalizar`
- `frontend/AGENT.md` — **não existe** neste projeto
- `backend/AGENT.md` — **não existe** neste projeto
- Arquivos inspecionados: `src/types/financialAssistant.ts`,
  `src/screens/finance/ExpenseDialog.tsx`, `backend/src/services/
  assistantSlotSession.ts`, `assistantSlotParser.ts`, `assistantFlowEngine.ts`,
  `backend/src/routes/assistant.ts`

## Achados da investigação

Três fatos que reduzem bastante o trabalho:

| Achado | Efeito |
|---|---|
| `FinancialAssistantDraft` já tem todos os campos do modal (`cardId`, `billingType`, `installments`, `amountPaid`, `invoiceNumber`, `invoiceDate`) | Nenhum tipo novo é necessário |
| `ExpenseDialog` já abre com campos preenchidos (prop `expense?`, usada na edição) | O caminho de pré-preenchimento já existe |
| `seedDraftFromMessage` já extrai descrição, valor, data e forma de pagamento de texto livre | A parte difícil está pronta e é justamente a que sobrevive |

## Impacto por área

### Frontend

- `FinancialAssistant.tsx`: ao receber a resposta com rascunho, abre o dialog
  em vez de renderizar pergunta e chips
- `ExpenseDialog` / `IncomeDialog`: prop de pré-preenchimento a partir de
  `FinancialAssistantDraft`. Reaproveitar o caminho de edição já existente em
  vez de criar um card novo — evita o usuário aprender outra tela e evita duas
  implementações do mesmo formulário divergindo com o tempo
- Marca visual nos campos deduzidos (ex: borda ou etiqueta "entendi isso"),
  para o usuário conferir antes de salvar
- `AppShell.tsx` e `App.tsx`: remover a entrada do editor de fluxo da sidebar e
  do roteamento, mantendo os arquivos
- Estados: o modal já trata loading/error/empty do salvamento; o chat precisa
  tratar o caso de o parser não entender nada

### Backend

- `routes/assistant.ts`: a resposta passa a devolver o rascunho completo e o
  sinal de abrir formulário, sem entrar no slot-filling
- Sugestão por histórico: estender a ideia de `suggestCategory` para forma de
  pagamento e cartão — se lançamentos com descrição parecida foram sempre no
  crédito, o rascunho vem com crédito
- Toda query nova filtra por usuário/conta, como as existentes
- O slot-filling (`assistantSlotSession.ts`, `assistantFlowEngine.ts`) deixa de
  ser chamado, mas permanece compilando e testado

### Banco de dados

`Sem impacto esperado.`

Nenhuma tabela, coluna ou índice novo. A sugestão por histórico lê lançamentos
existentes.

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

### Frontend

- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/layout/AppShell.tsx`
- `src/App.tsx`

### Backend

- `backend/src/routes/assistant.ts`
- `backend/src/services/financialCopilot.ts`
- `backend/src/services/assistantSlotParser.ts` (leitura; `seedDraftFromMessage`)
- Serviço de sugestão por histórico (arquivo a definir na implementação)

### Banco de dados

- Nenhum.

## Estratégia de implementação

1. **Backend — resposta com rascunho.** Fazer a rota devolver `draft` completo
   e o sinal de abrir formulário, sem chamar o slot-filling.
2. **Pré-preenchimento por histórico.** Estender a sugestão para forma de
   pagamento e cartão, a partir de lançamentos anteriores do próprio usuário.
3. **Frontend — abrir o modal.** Chat abre `ExpenseDialog`/`IncomeDialog` com o
   rascunho; campos deduzidos recebem marca visual.
4. **Voz e comprovante.** Verificar que os dois caminhos continuam produzindo
   rascunho e abrindo o modal.
5. **Desativar o fluxo guiado.** Tirar o editor da sidebar e do roteamento.
   Não remover arquivos.
6. **Testes.** Manter os 141. Acrescentar os de extração e pré-preenchimento.

## Regras de negócio identificadas

- Uma frase pode preencher parcialmente: o modal abre com o que foi entendido
- Campo não entendido fica vazio para o usuário preencher
- Pré-preencher errado é pior que não preencher: por isso a marca visual
- Receita grava apenas descrição e valor (limitação da tabela `receitas`); o
  modal de receita já reflete isso
- O modal de despesa mantém suas próprias validações e regras — o assistente
  só entrega valores iniciais

## Regras multi-tenant e segurança

Projeto **não é multi-tenant**. Verificado: nenhuma ocorrência de
`tenant`/`prefeitura` no backend, sem RLS. O isolamento relevante é por
usuário/conta.

- Toda query de histórico filtra pelo usuário autenticado e pela conta ativa —
  sugestão nunca pode vazar lançamento de outra conta
- O usuário e a conta vêm da sessão autenticada, nunca do payload do cliente
- `withCatalogScopedReferences` já zera `cardId`/`category` que não pertencem
  ao catálogo da conta; o rascunho pré-preenchido precisa passar pela mesma
  régua, senão um cartão de outra conta poderia ser sugerido
- O modal continua validando no backend ao salvar; o pré-preenchimento não
  dispensa validação

## Validações necessárias

- Mensagem vazia continua recusada
- Rascunho recebido do backend é validado antes de abrir o modal (tipos e
  faixas), como qualquer payload de rede
- `cardId` e `category` sugeridos precisam existir no catálogo da conta
- Valores monetários e datas seguem o parsing existente

## Testes necessários

### Frontend

- Não aplicável inicialmente: o projeto não tem runner de testes no frontend.
  Garantia por `tsc --noEmit`, `vite build` e verificação na tela.

### Backend

- "gastei 50 no mercado no crédito" produz rascunho com descrição, valor e
  forma de pagamento
- Frase com pouca informação produz rascunho parcial, sem inventar campo
- Sugestão por histórico não atravessa contas
- `cardId`/`category` fora do catálogo da conta não são sugeridos
- **Os 141 testes existentes continuam passando** — incluídos os do
  slot-filling e do motor, mantidos de propósito para a retomada do fluxo
  guiado ser barata

### E2E

- Não aplicável: não há suíte E2E. Verificação manual pelo chat.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm run build

npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

1. **Pré-preencher errado é pior que não preencher.** Se o histórico marcar
   crédito e o usuário não reparar, salva errado. Mitigação: marca visual no
   que foi deduzido.
2. **Dois caminhos convivendo.** O slot-filling continua no código, desativado.
   Precisa ficar explícito, em comentário no ponto de entrada, qual caminho
   está ativo — senão a próxima pessoa (ou sessão) mexe no lado errado.
3. **Voz e comprovante** hoje passam pelo slot-filling. Se o novo caminho não
   os cobrir, a funcionalidade some sem alarde.
4. **Testes verdes de código fora do ar.** Decisão consciente: é o que mantém
   barata a retomada do editor. Custo de ~30s por execução.
5. **Escopo do que foi construído antes.** O editor de fluxo (~1.500 linhas,
   quatro commits) sai do produto. Fica no código e no git.

## Perguntas em aberto

- O modal abre sozinho ou o assistente pergunta antes ("achei isso, quer
  revisar?")? **Assumido:** abre direto — perguntar reintroduz o ping-pong que
  esta mudança existe para eliminar.
- Quando o parser entende muito pouco (só "mercado"), abre o modal quase vazio
  ou pede mais contexto? **Assumido:** abre mesmo assim — um modal quase vazio
  ainda resolve mais rápido que uma pergunta.

Ambas podem ser revistas durante a implementação sem alterar a estrutura.

## Critérios de aceite do plano

- "gastei 50 no mercado no crédito" abre o modal com descrição, valor e forma
  de pagamento preenchidos
- Campos deduzidos são visualmente distinguíveis dos vazios
- Voz e foto de comprovante continuam funcionando
- Editor de fluxo não aparece mais na sidebar
- Nenhum arquivo do fluxo guiado foi removido
- Os 141 testes continuam passando
- `tsc --noEmit` (frontend e backend), `npm test` e `npm run build` verdes

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Não remover** arquivos do fluxo guiado, do motor ou do editor: a desativação
  é só de entrada no produto (sidebar e roteamento).
- **Não remover** testes existentes.
- Reaproveitar `ExpenseDialog`/`IncomeDialog`; não criar um card novo.
- Não executar migrations (não há nenhuma nesta feature).
- Seguir `/AGENT.md` nas regras transversais; `frontend/AGENT.md` e
  `backend/AGENT.md` não existem neste projeto.
- Manter alterações pequenas e focadas; este projeto vai direto para `main`,
  sem staging nem PR.
