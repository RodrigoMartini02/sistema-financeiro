# Plano de Implementação: Corrigir usabilidade do valor pago e renomear recorrência no modal de despesa

## Origem

- Arquivo de especificação: conversa com o usuário (feedback sobre `feat/R/reformular-modal-despesa-valor-pago`, já mesclada em `main`)
- Data do planejamento: `2026-08-20`
- Classificação: `frontend-only`

## Resumo

Corrige dois problemas de usabilidade introduzidos na feature anterior do modal de despesa: o campo "Valor pago" fica isolado num card separado abaixo da data em vez de ficar ao lado de "Valor da compra", e abre vazio em vez de pré-preenchido com o valor da compra. Também renomeia o label "Todo mês" para "Recorrente" no seletor de repetição, mantendo a frase explicativa como está.

## Escopo

### Dentro do escopo

- Mover o checkbox "Pago" + campo "Valor pago" para dentro do mesmo card de "Valor da compra" (Bloco 3/QUANTO), lado a lado.
- Pré-preencher o campo "Valor pago" com o valor da compra ao ser aberto (checkbox marcado ou link clicado), em vez de vazio.
- Renomear o label do chip "Todo mês" para "Recorrente" no seletor de repetição.

### Fora do escopo

- Alterar a frase explicativa de recorrência (`mensalTexto`) — permanece com "todo mês"/"todo dia X".
- Qualquer mudança em `PaymentModal.tsx`/`BatchPaymentModal.tsx`.
- Alteração de backend/schema/migrations.
- Mudança na lógica de cálculo de juros/desconto (`jurosCalculado`/`descontoCalculado`), só no ponto em que o valor inicial é atribuído.

## Leitura de contexto

- `sistema financas/CLAUDE.md` e `sistema financas/AGENT.md` — já lidos em planejamento anterior (regras multi-tenant do `AGENT.md` não se aplicam a este projeto single-tenant, confirmado anteriormente).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivo inspecionado: `src/screens/finance/ExpenseDialog.tsx` (estado atual pós-merge em `main`, lido via worktree dedicado em `.claude/worktrees/reformular-modal-fix`).

## Impacto por área

### Frontend

- `ExpenseDialog.tsx`:
  - Bloco 3 (QUANTO, linhas ~708-769): reestruturar layout para grid de 2 colunas — "Valor da compra" à esquerda, checkbox "Pago" + "Valor pago" (condicional) à direita.
  - Bloco 4 (QUANDO, linhas ~808-862): remover o bloco de checkbox "Pago"/"Valor pago" que hoje vive ali (movido para o Bloco 3).
  - Ajustar os handlers que abrem "valor pago diferente" (`setValorPagoAberto(true)` e o `onClick` do checkbox "Pago") para chamar `form.setValue('valor_pago', valorOriginalWatch)` ao abrir, em vez de deixar `undefined`.
  - Trocar `'Todo mês'` por `'Recorrente'` no array de opções de repetição (linha ~667).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

1. Reestruturar o JSX do Bloco 3 (QUANTO) para grid de 2 colunas: coluna esquerda mantém o campo "Valor da compra" como está hoje; coluna direita recebe o checkbox "Pago" e, quando marcado, o link "valor pago diferente" + campo `valor_pago` (quando `valorPagoAberto`).
2. Remover o bloco correspondente do Bloco 4 (QUANDO), mantendo ali apenas data/vencimento/status de crédito.
3. No `onClick` do checkbox "Pago" (ou num `useEffect` reagindo a `pagoWatch`), ao marcar como pago pela primeira vez, não pré-abrir o campo — mantém o comportamento "valor pago = valor da compra" implícito até o usuário clicar em "valor pago diferente".
4. No `onClick` que abre "valor pago diferente" (`setValorPagoAberto(true)`), adicionar `form.setValue('valor_pago', valorOriginalWatch || undefined)` para pré-preencher com o valor da compra atual.
5. Trocar o label `'Todo mês'` para `'Recorrente'` no array de opções de repetição.
6. Validar visualmente no navegador (`npm run dev`): marcar "Pago", abrir "valor pago diferente", confirmar que vem pré-preenchido; conferir alinhamento lado a lado; conferir chip "Recorrente".
7. Rodar `npm run build` para validar tipos.

## Regras de negócio identificadas

- "Valor pago" deve sempre iniciar igual ao "Valor da compra" quando o usuário opta por informá-lo separadamente — nunca vazio.
- O layout deve deixar claro que os dois valores (compra vs. pago) são comparáveis lado a lado, não em seções desconexas.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Sem impacto de segurança — mudança puramente visual/UX e de valor default de um campo já existente.

## Validações necessárias

Nenhuma validação de schema muda — `valor_pago` continua `z.coerce.number().min(0).optional()`.

## Testes necessários

### Frontend

- Marcar "Pago" e clicar "valor pago diferente" → campo deve vir preenchido com o valor da compra atual, editável a partir daí.
- Alterar o "Valor da compra" antes de abrir "valor pago diferente" → o pré-preenchimento deve refletir o valor mais recente digitado.
- Confirmar que o chip de repetição mostra "Recorrente" em vez de "Todo mês", e que a lógica de seleção (`repeticao === 'mensal'`) continua intacta.
- Confirmar visualmente que "Valor da compra" e "Valor pago" aparecem lado a lado no mesmo card.

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- O grid de 2 colunas pode precisar de ajuste responsivo (mobile) — seguir o padrão já usado em outros blocos do mesmo arquivo (`sm:grid-cols-[1.35fr_1fr]`).
- Como este código já está em `main`/produção, a correção deve ser tratada como `fix`, não `feat`, no commit final.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- "Valor da compra" e "Valor pago" aparecem no mesmo card, lado a lado.
- Campo "Valor pago" vem pré-preenchido com o valor da compra ao ser aberto, nunca vazio/zerado.
- Chip de repetição mostra "Recorrente" em vez de "Todo mês".
- `npm run build` passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Trabalhar no worktree `sistema financas/.claude/worktrees/reformular-modal-fix` (branch `feat/R/reformular-modal-despesa-valor-pago`) para não interferir com outra sessão ativa na branch `feat/R/relatorio-pdf-real` no diretório principal.
- Não executar migrations.
- Commit deve usar prefixo `fix:`, já que corrige comportamento de uma feature já em produção.
