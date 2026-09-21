# Plano de Implementação: Reorganizar colunas e ações de LancamentosTable

## Origem

- Arquivo de especificação: pedido direto no chat (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-21
- Classificação: `frontend-only`

## Resumo

A tabela combinada de Movimentações (`LancamentosTable.tsx`) foi criada recentemente
unificando Receitas + Despesas. Após uso, o usuário pediu para reorganizar a ordem e as
larguras das colunas para melhorar a legibilidade — priorizando espaço para Descrição e
Data pagamento, e reduzindo drasticamente a coluna Anexos — além de reordenar os botões de
ação por linha. Mudança puramente visual/estrutural, sem alterar nenhuma lógica de dados,
filtro ou mutation.

## Escopo

### Dentro do escopo

- Nova ordem de colunas (esquerda → direita), aplicada em `<colgroup>`, `<thead>`,
  `ExpenseRow` e `IncomeRow`:
  1. Seleção (34px, inalterado)
  2. Descrição (150px → **190px**)
  3. Categoria (116px, inalterado)
  4. Pagamento (104px, inalterado)
  5. Usuário (80px, inalterado)
  6. Tipo (72px, inalterado)
  7. Data compra (86px, inalterado)
  8. Vencimento (86px, inalterado)
  9. Data pagamento (86px → **110px**)
  10. Status (74px, inalterado)
  11. Valor (104px, inalterado — continua uma coluna só: valor exibido + diferença
      pequena embaixo quando houver)
  12. NF — condicional a `isEmpresa` (64px, inalterado, mantém posição relativa)
  13. Anexos (58px → **38px**)
  14. Ações (104px, inalterado)
- Reordenar os botões de ação em `ExpenseRow`: Mover para próximo mês → Marcar como pago
  → Editar → Cancelar → Excluir (hoje: Editar, Pagar, Mover, Cancelar, Excluir).
- `IncomeRow` mantém sua ordem de ações atual (Editar → Confirmar recebimento/Cancelar →
  Excluir) — não tem botão "Mover", então a reordenação pedida não se aplica a receita.
- Conteúdo de cada célula permanece idêntico ao atual; só a posição (ordem das `<td>`) e a
  largura (`<col>`) mudam.
- Linhas de Receita continuam com traço (`—`) exatamente nas mesmas células que já mostram
  traço hoje (Categoria, Data compra, Data pagamento, NF), só reposicionadas.

### Fora do escopo

- `ExpenseCard.tsx` / `IncomeCard.tsx` (versão mobile, cards) — não tocados.
- Qualquer lógica de filtro, dados, `useFinanceDashboard`, mutations.
- `MovimentacoesScreen.tsx` (barra de ferramentas) — não tocado.
- `ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal`,
  `DeleteInstallmentDialog` — não tocados.
- Duplicar a coluna Valor em Valor previsto/Valor pago — confirmado que continua uma
  coluna só.

## Leitura de contexto

- `CLAUDE.md` da raiz do workspace — fluxo obrigatório de planejar → aprovar → implementar
  → finalizar, considerado; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste
  projeto.
- `src/screens/finance/LancamentosTable.tsx` — lido por completo (981 linhas); estrutura
  atual de `<colgroup>` (linhas 591-606), `<thead>` (linhas 607-633), `ExpenseRow` (linhas
  742-863) e `IncomeRow` (linhas 867-980) mapeada integralmente.

## Impacto por área

### Frontend

- `src/screens/finance/LancamentosTable.tsx`:
  - `<colgroup>`: reordenar os 14 (ou 13, sem NF) `<col>` na nova ordem, com as três
    larguras ajustadas (Descrição 190px, Data pagamento 110px, Anexos 38px).
  - `<thead>`: reordenar os `<th>` para bater com a nova ordem do `<colgroup>`.
  - `ExpenseRow`: reordenar as `<td>` na nova ordem; reordenar os 5 `<ActionBtn>` dentro
    da célula de Ações.
  - `IncomeRow`: reordenar as `<td>` na mesma nova ordem, preservando o conteúdo e a
    lógica de traço já existente em cada célula (só muda a posição).
  - Nenhuma mudança de props, estado, hooks ou tipos.

Sem impacto em hooks, query keys, forms ou estados de loading/error/empty.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário — não se
aplica a este plano (nenhuma migration envolvida).

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/screens/finance/LancamentosTable.tsx`

## Estratégia de implementação

1. Reescrever o `<colgroup>` com a nova ordem e as três larguras ajustadas.
2. Reescrever o `<thead>` com os `<th>` na mesma nova ordem.
3. Reescrever `ExpenseRow`: reordenar as `<td>` e os botões de ação dentro da célula de
   Ações.
4. Reescrever `IncomeRow`: reordenar as `<td>` na mesma nova ordem, mantendo cada célula
   com seu conteúdo/traço atual.
5. Rodar `npx tsc --noEmit` e `npx vite build`.

## Regras de negócio identificadas

Nenhuma — mudança puramente visual/estrutural, sem regra de negócio nova.

## Regras multi-tenant e segurança

`Sem impacto esperado`

## Validações necessárias

- Confirmar visualmente que a nova ordem de colunas está correta em despesa e em receita
  (traços nas posições certas).
- Confirmar que a largura de Data pagamento comporta a data sem quebrar linha.
- Confirmar que Anexos, mesmo reduzida, ainda mostra o ícone + contador de forma legível.

## Testes necessários

### Frontend

- Validação manual visual (sem suíte automatizada de UI no projeto).

### Backend

`Sem impacto esperado`

### E2E

`Sem impacto esperado`

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixíssimo risco técnico — reordenação de marcação e ajuste de CSS, sem lógica nova.
- Soma das larguras aumenta ~44px líquidos; a tabela já tem scroll horizontal interno
  (`overflow-auto` no container), então isso não deve quebrar o layout em telas menores.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões foram fechadas nas respostas
do usuário (ordem completa das colunas, larguras de Descrição/Data pagamento/Anexos, ordem
de ações de despesa, tratamento de receita mantendo traço e ordem de ações atual).

## Critérios de aceite do plano

- Colunas aparecem na ordem: Seleção, Descrição, Categoria, Pagamento, Usuário, Tipo,
  Data compra, Vencimento, Data pagamento, Status, Valor, NF (se empresa), Anexos, Ações.
- Descrição, Data pagamento e Anexos com as novas larguras.
- Ações de despesa na ordem: Mover, Marcar como pago, Editar, Cancelar, Excluir.
- Ações de receita inalteradas (Editar, Confirmar recebimento/Cancelar, Excluir).
- `npx tsc --noEmit` e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Único arquivo a alterar: `src/screens/finance/LancamentosTable.tsx`.
- Não tocar em `ExpenseCard.tsx`/`IncomeCard.tsx` (mobile).
- Preservar todo o conteúdo/lógica de cada célula — só reordenar posição e ajustar largura.
