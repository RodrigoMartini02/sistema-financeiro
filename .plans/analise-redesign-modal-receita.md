# Análise — Modal "Nova receita" no formato do modal de despesa + altura dos dois modais

Levantamento feito em 2026-09-29, sobre o `main` com o merge `84d879d2` (modal novo de despesa em produção). Nenhum
arquivo de código foi alterado.

## 1. Entendimento

1. **Receita no mesmo formato da despesa.** O modal de receita passa a ser uma grade como o de despesa: linha de entrada,
   lote em linhas compactas, popovers, resumo sob a linha ativa, rodapé com uma mensagem e um botão, gravação uma a uma
   com progresso e aviso de registrada.
2. **Lote na receita no formato novo.** Hoje a receita já tem lote, mas no formato antigo: cada item é um formulário
   completo empilhado num card. Passa a ser uma linha da grade, como na despesa.
3. **Altura.** Os dois modais ficam com altura fixa de cerca de 85% da tela (hoje crescem conforme o conteúdo, até 85%).
   A área dos lançamentos ocupa o espaço entre o topo e o rodapé.

Não existe mockup da receita: o layout proposto na §3 segue o padrão da despesa, adaptado aos campos da receita.

## 2. Modal de receita hoje

`IncomeDialog.tsx` (398 linhas) + `IncomeForm.tsx` (1.053 linhas).

| Área | Como é hoje |
|---|---|
| Estrutura | Formulário do topo num painel; o lote empilha um `IncomeForm` completo por item, com refs e "resumos" subindo para o pai |
| Conta | Seletor de conta (só para quem tem PF + PJ), vale para o topo e o lote |
| Campos (todas as contas) | Descrição*, Categoria (classificação de receita, com criar dentro do seletor), Valor*, Data do recebimento* (`input type=date`), anexos pelo clipe |
| Campos (conta PJ) | Cliente (texto com datalist; precisa existir no cadastro, com "+ Cadastrar"), Representante (chips) com cálculo da comissão, Produto vendido + quantidade (baixa estoque), Horas a faturar (contrato, presencial/remoto, quantidade → valor) |
| Só em receita nova | "Replicar até" (mês/ano), produto vendido, horas a faturar, "Já previstas neste mês" com "Confirmar recebimento" |
| Sugestões | Autocomplete pelo histórico (valor e cliente), "Tab aceita" a categoria sugerida, "Última vez você recebeu", categoria fixa preenche valor e dia |
| Duplicata | Só nos meses em cache na tela: mesma descrição, valor e cliente nos últimos 7 dias |
| Guias de primeiro acesso | `receitas:horas-v1`, `receitas:replicar-v1`, `receitas:representante-v1` |
| Gravação | As telas recebem `onSave` e gravam num laço; "Replicar" faz um POST por mês, no frontend |
| Status | Toda receita lançada pelo modal nasce recebida (`status = 'ativa'`). Prevista/faturada só vêm de contrato ou receita fixa |

## 3. Proposta de formato (grade)

- **Barra "Lançando em"**: a conta, só para quem tem mais de uma (é onde o seletor de hoje cabe no formato novo). Vale
  para as próximas receitas e para o lote.
- **Colunas (conta PF)**: Descrição* · Categoria · Valor* · Recebido em* · Repetir · 📎 · +
- **Colunas (conta PJ)**: Descrição* · Categoria · Cliente · Valor* · Recebido em* · Repetir · ⋯ · 📎 · +
- **Repetir** (popover, como a "Cobrança" da despesa): "Não repete" ou "Todo mês até [mês/ano]", com "· N lançamentos".
- **Cliente** (popover, como o seletor de categoria): busca no cadastro e "+ cadastrar" dentro do popover (fim do
  texto solto que trava o salvamento).
- **⋯ Detalhes PJ** (popover): Representante (com a comissão calculada), Produto vendido + quantidade e Horas a faturar
  (contrato, presencial/remoto, quantidade). Produto e horas só em receita nova.
- **Resumo sob a linha ativa**: "Recebida em dd/mm · total R$ X", "replica até dez/26 · 4 lançamentos", "comissão de
  R$ Y para Fulano", "Última vez você recebeu R$ Z", "Sugerida: X · Tab aceita", aviso de duplicata e ajuda à direita.
- **"Já previstas neste mês"**: faixa discreta acima da grade, com "Confirmar recebimento" (só em receita nova).
- **Edição**: uma linha só, sem lote; "Repetir", produto e horas não aparecem (hoje também não).
- **Celular**: campos empilhados e popovers como painel inferior, igual à despesa.

## 4. Bugs do fluxo atual (lidos no código)

1. **"Replicar até" no dia 29 a 31**: a réplica usa o mesmo dia em todos os meses (`2026-02-31`), o banco recusa e a
   replicação para no meio, com parte dos meses gravada (`financeService.ts:163`).
2. **"Replicar até" parte do mês da tela, não do mês da receita**: com a tela em setembro e a receita em novembro, a
   1ª réplica sai em outubro e a de novembro duplica a original (`financeService.ts:160`, `month` da tela).
3. **Replicar com horas a faturar debita as horas do contrato em cada réplica** (o corpo da réplica repete
   `contrato_id`, `tipo_hora` e `quantidade_horas`; só produto é zerado — `financeService.ts:169-172`).
4. **Réplicas não são atômicas**: uma falha no meio deixa metade gravada, e salvar de novo duplica.
5. **Lote que falha no meio**: as receitas gravadas continuam no lote e salvar de novo as duplica; sem progresso.
6. **Autocomplete repete a mesma descrição e ignora a conta** (a consulta devolve linhas, não descrições distintas;
   `incomes.ts:69-80`).
7. **Duplicata só olha os meses em cache** na tela.
8. **Esc chama `onClose` duas vezes** (o `form` e o `Dialog` fecham cada um).
9. **Aviso "✓ Receita registrada" nunca aparece**: as telas fecham o modal ao salvar (mesmo caso que a despesa tinha).

## 5. Altura dos modais

- Hoje o `Dialog` usa `max-h-[85vh]`: o modal cresce com o conteúdo. O pedido é altura fixa em ~85% da tela.
- Proposta: o `Dialog` ganha a opção de altura fixa (volta o que o `fixedHeight` fazia, agora usado pelos dois modais
  de lançamento). Dentro dele:
  - barra "Lançando em", cabeçalho das colunas e linha de entrada ficam fixos no topo;
  - o lote ocupa o espaço que sobra e rola sozinho;
  - rodapé fixo embaixo.
- No celular (abaixo de 1024px), o modal ocupa quase a tela inteira.

## 6. Backend

- Hoje: `POST/PUT /receitas` em português, sem transação na replicação (feita no frontend).
- Proposta, no mesmo padrão da despesa:
  - `POST /incomes` com campos em inglês e `repeatUntil` (mês/ano): o servidor grava a original e as réplicas numa
    transação, com o dia ajustado ao fim do mês e partindo do mês da receita. Produto e horas só na original;
    comissão como hoje;
  - `PUT /incomes/:id` em inglês;
  - `GET /incomes/suggestions` com descrições distintas, só da conta, e `GET /incomes/duplicate` no servidor;
  - validação do corpo em `services/incomeInput.ts` (sem banco, testado) e gravação em `services/incomeService.ts`
    (Drizzle), como `expenseInput`/`expenseService`.
- Sem migration: nenhuma coluna nova.

## 7. Reaproveitamento (sem cópia)

As peças genéricas da despesa passam para uma pasta comum, usada pelos dois modais: `MoneyCell`, `DateCell`,
`fieldStyles`, o resumo (pílulas de status), a casca do modal (barra, cabeçalhos, lote, rodapé, progresso e aviso) e o
hook de espera enquanto digita. A despesa continua com o que é só dela (forma de pagamento, cobrança, parcelas).

## 8. Outros pontos afetados

- **Telas que abrem o modal**: `App.tsx`, `demoMain.tsx`, `CalendarView.tsx`, `LancamentosTable.tsx` — saem `month`,
  `year`, `isSaving`, `error` e `onSave`; `useFinanceDashboard` perde a mutation `saveIncome`.
- **Assistente financeiro**: também grava receita com `saveIncome` (inclusive "Replicar até") e migraria para o formato
  novo, sem mudar a tela dele.
- **Modo demo**: `POST /receitas` do `fakeApiResolver` acompanha o formato novo.

## 9. Decisões

1. **Layout da §3** (colunas PF/PJ, "Repetir" em popover, Cliente em seletor, "⋯ Detalhes PJ" com representante,
   produto e horas). Recomendação: seguir.
2. **Conta**: a receita mantém o seletor de conta (decisão do plano da despesa), agora na barra "Lançando em", só para
   quem tem mais de uma conta. Recomendação: sim.
3. **Status**: continua nascendo recebida (a data é a do recebimento), sem opção de lançar "a receber" no modal.
   Recomendação: sim, como hoje.
4. **Backend no formato novo (§6)**, com a replicação no servidor em transação (corrige os bugs 1 a 4).
   Recomendação: sim.
5. **"Já previstas neste mês"** numa faixa acima da grade. Recomendação: manter.
6. **Guias de primeiro acesso** (horas, replicar, representante): manter, ancorados nos lugares novos.
   Recomendação: manter.
7. **Altura fixa ~85%** nos dois modais, com a linha de entrada fixa e o lote rolando no espaço restante (§5).
   Recomendação: sim.
8. **Assistente e demo** migram para o formato novo da receita. Recomendação: sim.
9. **Peças comuns (§7)** numa pasta compartilhada pelos dois modais. Recomendação: sim.
10. **Branch**: nova `feat/R/redesign-modal-receita` a partir de `main`, levando junto o ajuste de altura da despesa.
    Recomendação: sim.
