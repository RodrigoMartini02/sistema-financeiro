# Plano de Implementação: Redesenhar posicionamento de "Pago" e "Valor pago"

## Origem

- Arquivo de especificação: conversa com o usuário (feedback visual sobre `feat/R/reformular-modal-despesa-valor-pago`, já em produção)
- Data do planejamento: `2026-08-20`
- Classificação: `frontend-only`

## Resumo

Reorganiza o layout do modal de despesa: o checkbox "Pago" sai do bloco de valor e vai para o Bloco 1 (DESCRIÇÃO), como ação independente ao lado do label. O campo "Valor pago" passa a ficar sempre visível ao lado de "Valor da compra" quando ativo (mesmo componente `MoneyField`, mesmo tamanho de fonte grande, não mais `MoneyFieldSmall`). O link "valor pago diferente"/"usar valor da compra" fica sempre visível abaixo do campo "Valor da compra", mas desabilitado/acinzentado até "Pago" ser marcado.

## Escopo

### Dentro do escopo

- Mover o checkbox "Pago" do Bloco 3 (QUANTO) para o Bloco 1 (O QUÊ/DESCRIÇÃO), ao lado do label "DESCRIÇÃO".
- Trocar `MoneyFieldSmall` por `MoneyField` no campo "Valor pago", igualando visualmente ao campo "Valor da compra".
- Mover o link de alternância "valor pago diferente"/"usar valor da compra" para abaixo do campo "Valor da compra" (junto ao texto informativo existente), sempre visível mas desabilitado quando "Pago" não estiver marcado.
- Ajustar layout da segunda coluna do Bloco 3 para conter apenas o campo "Valor pago" quando aplicável (checkbox não fica mais ali).

### Fora do escopo

- Qualquer mudança na lógica de cálculo de juros/desconto (`jurosCalculado`/`descontoCalculado`).
- Mudança de contrato/backend.
- Alteração da nomenclatura "Recorrente" (já feita em plano anterior).
- Mudança em `PaymentModal.tsx`/`BatchPaymentModal.tsx`.

## Leitura de contexto

- `sistema financas/CLAUDE.md` e `sistema financas/AGENT.md` — já lidos em planejamentos anteriores (regras multi-tenant do `AGENT.md` não se aplicam a este projeto single-tenant, confirmado anteriormente).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivo inspecionado: `src/screens/finance/ExpenseDialog.tsx` (estado atual pós-merge em `main`, lido via worktree `.claude/worktrees/reformular-modal-fix`).

## Impacto por área

### Frontend

- `ExpenseDialog.tsx`:
  - Bloco 1 (O QUÊ, linhas ~474-559): adicionar checkbox "Pago" ao lado do label "DESCRIÇÃO" (linha ~480-482).
  - Bloco 3 (QUANTO, linhas ~708-826): remover o checkbox "Pago" da segunda coluna; mover o link de alternância para abaixo do campo "Valor da compra" (junto/substituindo a linha 763-767); trocar `MoneyFieldSmall` por `MoneyField` no campo "Valor pago"; manter a segunda coluna do grid só com o campo "Valor pago" quando `pagoWatch && valorPagoAberto`.
  - O texto de multa/desconto (`jurosCalculado`/`descontoCalculado`) permanece associado ao campo "Valor pago".

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

1. No Bloco 1, adicionar o checkbox "Pago" (mesmo `form.register('pago')` já existente) numa linha ao lado ou logo abaixo do label "DESCRIÇÃO", como controle independente.
2. No Bloco 3, remover o bloco do checkbox "Pago" da segunda coluna.
3. Mover o link de alternância para abaixo do campo "Valor da compra": quando `pagoWatch` for `false`, o link aparece desabilitado (cor acinzentada, `cursor: not-allowed`, `onClick` inerte); quando `pagoWatch` for `true`, funciona normalmente alternando `valorPagoAberto` e pré-preenchendo `valor_pago` com `valorOriginalWatch` (mantendo a correção já feita em plano anterior).
4. Ajustar a segunda coluna do Bloco 3 para exibir o campo `valor_pago` via `MoneyField` (não mais `MoneyFieldSmall`) quando `pagoWatch && valorPagoAberto`, com label acima (ex: "VALOR PAGO") para manter consistência visual com "VALOR DA COMPRA".
5. Validar que a coluna direita do grid não deixa espaço vazio estranho quando `pago` está desmarcado ou quando `valorPagoAberto` é `false` — avaliar colapsar para grid de 1 coluna nesses casos, se necessário.
6. Rodar `npm run build` para validar tipos.

## Regras de negócio identificadas

- "Pago" é uma decisão independente do valor, deve ficar junto à identificação da despesa (descrição), não ao formulário de valor.
- O link de alternância de valor pago deve estar sempre visível para preview/consistência de layout, mas só interativo quando a despesa está marcada como paga.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Sem impacto de segurança — mudança puramente visual/posicional.

## Validações necessárias

Nenhuma mudança de schema — `pago` e `valor_pago` continuam com a mesma validação já existente (`z.boolean()` e `z.coerce.number().min(0).optional()`).

## Testes necessários

### Frontend

- Checkbox "Pago" aparece ao lado do label "DESCRIÇÃO" e continua funcional.
- Link abaixo de "Valor da compra" aparece desabilitado quando "Pago" está desmarcado, e clicável quando marcado.
- Ao marcar "Pago" e clicar no link, o campo "Valor pago" aparece com o mesmo formato visual (fonte grande) de "Valor da compra", pré-preenchido com o valor da compra.
- Alterar o valor da compra depois de abrir "Valor pago" não deve sobrescrever o que o usuário já digitou manualmente ali (comportamento herdado, não muda).

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- O grid de 2 colunas do Bloco 3 pode ficar com a coluna direita vazia (sem conteúdo visível) quando "Pago" está desmarcado — como o checkbox saiu dessa coluna, não há mais nada ali por padrão. Avaliar durante a implementação se isso deixa um buraco visual estranho e, se necessário, colapsar a coluna nesse caso (grid de 1 coluna quando não há nada a mostrar à direita).
- Como este código já está em produção, a correção deve ser tratada como `fix`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Checkbox "Pago" aparece ao lado do label "DESCRIÇÃO", no Bloco 1.
- Campo "Valor pago" usa o mesmo componente/formato visual (`MoneyField`, fonte grande) de "Valor da compra".
- Link "valor pago diferente"/"usar valor da compra" fica abaixo do campo "Valor da compra", sempre visível, desabilitado quando "Pago" não está marcado.
- `npm run build` passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Trabalhar no worktree `sistema financas/.claude/worktrees/reformular-modal-fix` (branch `feat/R/reformular-modal-despesa-valor-pago`), sincronizado com `main` antes de iniciar.
- Não executar migrations.
- Commit deve usar prefixo `fix:`.
