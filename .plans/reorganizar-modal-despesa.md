# Plano de Implementação: Reorganizar o modal de despesa

## Origem

- Arquivo de especificação: mockup `Modal Despesa Reorganizado.html` (fornecido pelo usuário no chat)
- Data do planejamento: 2026-09-06
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Reorganiza o corpo do `ExpenseDialog` em 3 linhas mais uma coluna de tipo de cobrança, conforme o mockup. Nenhum campo novo, nenhum endpoint, nenhuma coluna de banco: o payload enviado ao backend permanece idêntico. É reorganização visual mais uma mudança de comportamento pontual na data de pagamento (decisão 1).

## Decisões aplicadas

- Decisão 1: **opção 2** — Data do pagamento vira campo livre sempre editável (em vez de derivada com link para sobrescrever).
- Decisão 2: **opção 1** — escopo só despesa; `IncomeDialog` fica fora.

## Escopo

### Dentro do escopo

- Data da compra sobe para a linha do valor; bloco "QUANDO" isolado deixa de existir.
- Coluna direita passa a ser só o tipo de cobrança: 3 opções empilhadas com radio.
- Campos de parcelas e de dia da recorrência aninham DENTRO da opção escolhida.
- Faixa de resumo única acima do rodapé (status + vencimento + total).
- Nota Fiscal recolhida atrás de um link (somente conta empresa).
- Grid 2x2: valor / valor pago em cima, data da compra / data do pagamento embaixo.
- Data do pagamento como campo livre editável, nascendo preenchido.

### Fora do escopo

- `IncomeDialog` (receita).
- Campos novos, alteração de backend, schema ou migration.
- Modais de assinatura (`PagamentoDialog`, `CancelarDialog`) — seguem pendentes.
- Refactor oportunista de qualquer outra parte do arquivo.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/screens/finance/ExpenseDialog.tsx` (977 linhas, estado atual)
- `src/ui/dialogFormTokens.tsx` (design system existente — mesma paleta do mockup)
- `src/ui/dialog.tsx` (componente Dialog genérico)
- `backend/src/routes/expenses.ts` (validação de `data_vencimento`)
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

Arquivo único: `src/screens/finance/ExpenseDialog.tsx`.

Blocos atuais afetados:
- Bloco 2 "COMO" (linha ~620): chips de repetição viram linhas empilhadas com radio.
- Bloco 3 "QUANTO" (linha ~723): vira grid 2x2 com as datas.
- Bloco 4 "QUANDO" (linha ~833): deixa de existir como bloco isolado.
- Nota Fiscal (linha ~875): passa a ser recolhida atrás de link.

Estados a remover: `vencimentoManualAberto`.

Tokens: reutilizar `C`, `labelStyle`, `fieldInputStyle`, `chipStyle`, `MoneyField`, `MoneyFieldSmall` — não criar tokens novos.

### Backend

Sem impacto esperado. O payload de `toFormValues` permanece com os mesmos campos.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

### Infra/Deploy

Sem impacto esperado.

## Ponto delicado: a data de pagamento (decisão 1, opção 2)

`vencimentoDerivado.data` NÃO é apenas texto de tela. Alimenta 4 consumidores:

| Consumidor | Linha | Efeito |
|---|---|---|
| `dataVencimento` no payload | 358 | vai para o banco; campo obrigatório |
| `statusDerivado` | 319 | badge Pago / Agendado |
| `proximaParcelaVence` | 342 | data da próxima parcela |
| texto de vencimento | 858 | "Vence 10/10 · fatura Nubank" |

O backend valida `data_vencimento` como obrigatório (`backend/src/routes/expenses.ts:329`) e usa esse campo para agendar parcelas mês a mês.

**Resolução adotada:** o campo é livre e editável a qualquer momento, mas nasce preenchido com a data calculada (fatura do cartão, dia da recorrência ou data da compra). Se o usuário apagar e deixar em branco, o cálculo automático volta a valer no salvamento, em vez de gravar vazio. Isso entrega o campo sempre visível e editável que o usuário pediu, sem quebrar o agendamento nem fazer o backend recusar o salvamento.

## Estratégia de implementação

Segue a regra do projeto para redesign: remover primeiro, aplicar depois, em duas etapas explícitas — sem deixar código morto ou regra duplicada convivendo.

### Etapa 1 — remover

1. Apagar o bloco 4 "QUANDO" inteiro.
2. Apagar os painéis soltos de parcelas e de dia da recorrência.
3. Apagar o link "data de pagamento diferente" e o estado `vencimentoManualAberto`.
4. Apagar o bloco fixo de Nota Fiscal.

### Etapa 2 — aplicar

5. Montar a linha 1: descrição + anexar, e categoria.
6. Montar a linha 2: forma de pagamento e cartão (mantendo o comportamento atual).
7. Montar a grid 2x2: valor / valor pago em cima, data da compra / data do pagamento embaixo.
8. Montar a coluna de tipo de cobrança com as 3 opções empilhadas e os campos aninhados dentro da opção escolhida.
9. Montar a faixa de resumo única acima do rodapé.
10. Religar a data de pagamento ao `vencimentoDerivado` como valor inicial editável, com fallback para o cálculo quando o campo estiver vazio.
11. Recolher Nota Fiscal atrás de link.

## Regras de negócio identificadas

- `data_vencimento` é obrigatório no backend e é a base do agendamento de parcelas e recorrências.
- Crédito esconde o campo "valor pago" e o marcador "já foi paga" (a despesa entra na fatura, não é paga na hora).
- Parcelas mostram o total derivado e o juros embutido quando há preço à vista.
- Nota Fiscal só aparece em conta empresa (`isEmpresa`).
- Vencimento no crédito vem de `calcularVencimentoFatura` com o cartão selecionado.
- Recorrência mensal sem crédito usa `proximoDiaDoMes` com o dia informado.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização: o isolamento é por `usuario_id`, já aplicado nas rotas existentes. Esta alteração é puramente de apresentação e não toca autenticação, autorização nem filtro por usuário.

## Validações necessárias

- `descricao` obrigatória (schema zod já existente).
- `valor_original` mínimo 0,01 (já existente).
- `dataCompra` obrigatória (já existente).
- Data do pagamento: aceita vazio; quando vazia, cai no cálculo automático.

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual dos 4 caminhos: crédito com fatura, parcelado, recorrente e à vista.

### Backend

Suíte existente deve continuar passando (23 testes). Nenhum teste novo: o backend não muda.

### E2E

Não aplicável — projeto não tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observação: `src/screens/despesas/DespesasScreen.tsx:727` tem um erro de tipo pré-existente, não relacionado a esta alteração.

## Riscos e pontos de atenção

- **Alto:** `dataVencimento` é o eixo do agendamento de parcelas e recorrências. Testar os 4 caminhos antes de considerar pronto.
- **Médio:** a reorganização mexe em cerca de 380 das 977 linhas. `tsc --noEmit` e o build cobrem quebra de tipo, mas o comportamento condicional (crédito esconde "valor pago"; parcelas mostram juros embutido) precisa de conferência visual do usuário.
- **Baixo:** Nota Fiscal recolhida — só conta empresa; o campo continua no payload.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As duas decisões pendentes foram respondidas pelo usuário e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- Salvar despesa à vista, parcelada, recorrente e no crédito grava a mesma `data_vencimento` de hoje quando o campo não é tocado.
- Editar a data de pagamento à mão grava a data digitada.
- Deixar a data de pagamento em branco não quebra o salvamento.
- Badge de status e "próxima vence" seguem a data em vigor.
- Conta pessoal não vê Nota Fiscal.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.
- Nenhum código morto do layout antigo permanece no arquivo.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir a ordem das duas etapas: remover tudo antes de aplicar o novo layout.
- Não alterar `IncomeDialog`.
- Não criar tokens novos: reutilizar `dialogFormTokens.tsx`.
- Não executar migrations. Não alterar `.env`.
- Manter o payload de `toFormValues` inalterado.
