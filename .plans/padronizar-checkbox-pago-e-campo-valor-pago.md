# Plano de Implementação: Padronizar checkbox "Pago" e campo "Valor pago"

## Origem

- Arquivo de especificação: conversa com o usuário (screenshot do bloco "Valor da compra / Valor pago / Pago" do `ExpenseDialog.tsx` + pedido de refinamento visual)
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

Duas correções no Bloco 3 ("QUANTO") de `ExpenseDialog.tsx`:

1. Checkbox "Pago" usa um rótulo em duas linhas — "Pago" em negrito seguido de uma legenda menor embaixo ("Assinale se a despesa já foi paga") — formato diferente do resto do bloco. Passa a ser um único texto contextualizado ao lado do checkbox, sem a palavra "Pago" isolada em negrito.
2. Campo "Valor pago" (`MoneyFieldSmall`) tem altura e tamanho de fonte menores que "Valor da compra" (`MoneyField`), apesar de estarem lado a lado na mesma seção. Unifica-se a altura/fonte de `MoneyFieldSmall` para igualar `MoneyField`, mantendo os dois como componentes separados (pois `MoneyFieldSmall` precisa do estado `disabled`, que `MoneyField` não suporta).

## Escopo

### Dentro do escopo

- Remover o label atual em duas linhas do checkbox "Pago" (linhas 771-783 de `ExpenseDialog.tsx`)
- Aplicar novo texto único ao lado do checkbox, mesma linha, sem negrito de título: "Assinale se a despesa já foi paga"
- Em `dialogFormTokens.tsx`, ajustar `MoneyFieldSmall` (linhas 111-137) para igualar as dimensões/tipografia de `MoneyField`:
  - altura: 42px → 54px
  - borderRadius: 10 → 12
  - fonte do valor: 15px/700 → 26px/700
  - gap: 6 → 8
  - padding horizontal: 12px → 14px
  - letterSpacing do valor: `-0.01em` → `-0.02em` (igual ao `MoneyField`)
- Preservar a lógica de `disabled` em `MoneyFieldSmall` (opacidade reduzida, fundo `panelBg`, cursor `not-allowed`) — só o tamanho/tipografia muda, não o comportamento

### Fora do escopo

- Trocar `MoneyFieldSmall` por `MoneyField` (decisão do usuário: manter componente separado, só igualar o visual)
- Lógica de `pagoWatch`, `valor_pago`, cálculo de juros/desconto (`jurosCalculado`, `descontoCalculado`)
- Outros blocos do dialog (categoria, forma de pagamento, repetição, data)
- Mudanças no schema Zod ou contrato de dados enviado ao backend
- Caso de crédito (`isCredito`), que já não exibe esse bloco
- Backend/API

## Leitura de contexto

- `c:\Users\rodri\Music\Particular\CLAUDE.md` (raiz) — regras de workflow (sequência /planejar → aprovação → /implementar → /finalizar)
- `c:\Users\rodri\Music\Particular\AGENT.md` (raiz) — não aplicável a este projeto: descreve um backend multi-tenant/PDF genérico que não corresponde a este repositório; ignorado como boilerplate
- `sistema financas/CLAUDE.md` — regras específicas do projeto (React+TS+Vite+Tailwind / Express+PostgreSQL), consistente com a raiz
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados **não existem** neste projeto (sem separação de pastas `frontend/`/`backend/`)
- `sistema financas/src/screens/finance/ExpenseDialog.tsx` — componente alterado (Bloco 3, linhas 707-818)
- `sistema financas/src/ui/dialogFormTokens.tsx` — componente `MoneyFieldSmall` alterado (linhas 111-137)
- Histórico git: plano anterior `.plans/reposicionar-checkbox-pago-valor-compra.md` já reposicionou o checkbox abaixo do campo "Valor da compra" e tornou "Valor pago" sempre visível — este plano refina o resultado visual dessa mudança

## Impacto por área

### Frontend

Arquivo: `sistema financas/src/screens/finance/ExpenseDialog.tsx`, Bloco 3 (linhas ~707-818):

- Remover o `<label>` atual do checkbox "Pago" (linhas 771-783), que contém `<span>Pago</span>` em negrito + `<span>` legenda embaixo
- Novo `<label>`: checkbox + texto único "Assinale se a despesa já foi paga" na mesma linha, com peso de texto auxiliar (não mais título em negrito)

Arquivo: `sistema financas/src/ui/dialogFormTokens.tsx`, `MoneyFieldSmall` (linhas 111-137):

- Ajustar `height`, `borderRadius`, `gap`, `padding` do container e `fontSize`/`letterSpacing` do `<input>` para igualar `MoneyField`
- Manter toda a lógica de `disabled` (opacidade, background, cursor) intacta

Sem impacto em hooks, query keys, services ou schema Zod.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/ui/dialogFormTokens.tsx`

## Estratégia de implementação

1. Remover completamente o label atual do checkbox "Pago" (linhas 771-783) — remoção antes de aplicar o novo, não sobrepor
2. Aplicar novo label: checkbox + texto único "Assinale se a despesa já foi paga" na mesma linha
3. Em `dialogFormTokens.tsx`, ajustar as dimensões e tipografia de `MoneyFieldSmall` para igualar `MoneyField` (height, borderRadius, gap, padding, fontSize, letterSpacing), preservando a lógica de `disabled`
4. Validar visualmente no browser (dev server):
   - checkbox desmarcado → texto único visível, sem negrito de título
   - campos "Valor da compra" e "Valor pago" com a mesma altura e tamanho de fonte
   - campo "Valor pago" desabilitado (checkbox desmarcado) continua visualmente diferenciado por opacidade/fundo, mesmo com o novo tamanho
   - campo "Valor pago" habilitado (checkbox marcado) com aparência consistente ao "Valor da compra"

## Regras de negócio identificadas

- Nenhuma regra de negócio nova; mudança é puramente visual/UX
- O campo "Valor pago" continua só habilitado quando "Pago" está marcado (`disabled={!pagoWatch}`), comportamento preservado

## Regras multi-tenant e segurança

Não aplicável — mudança é puramente visual/UX em formulário client-side, sem alteração de dados, queries ou payload enviado ao backend.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável a este plano, que não envolve banco de dados.)

## Validações necessárias

- Nenhuma nova validação de schema necessária
- Confirmar que o novo texto do checkbox não quebra o layout em telas estreitas (mobile)
- Confirmar que o campo "Valor pago" com novo tamanho não estoura o `max-w-[260px]` do container

## Testes necessários

### Frontend

- Teste manual no browser: abrir "Nova despesa", conferir novo texto do checkbox (sem "Pago" em negrito isolado)
- Conferir visualmente que "Valor da compra" e "Valor pago" têm a mesma altura/fonte
- Marcar/desmarcar "Pago" e confirmar que o campo "Valor pago" habilita/desabilita corretamente, com o novo tamanho
- Confirmar fluxo de edição de despesa existente (`isEditing`) sem regressão visual

### Backend

`Sem impacto esperado`

### E2E

Não há suíte E2E identificada no projeto para este fluxo — validação manual é suficiente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit --project "sistema financas"
npx vite build --config "sistema financas/vite.config.js"
```

(Executar a partir do diretório `sistema financas/`, já que não há scripts `lint`/`typecheck` dedicados no `package.json` — apenas `dev`, `build`, `preview`.)

Teste visual via skill `/run` (sobe o dev server do frontend).

## Riscos e pontos de atenção

- Risco baixo: mudanças isoladas e visuais, sem impacto em lógica ou contrato de dados
- `MoneyFieldSmall` é um componente compartilhado em `dialogFormTokens.tsx`, mas hoje só é usado neste dialog — se outro componente vier a usá-lo no futuro, herdará o novo tamanho maior (aceito pelo usuário)
- Testar visualmente que o estado `disabled` do "Valor pago" continua claramente distinguível do estado habilitado, mesmo após o aumento de tamanho

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Checkbox "Pago" exibe um único texto ao lado, "Assinale se a despesa já foi paga", sem "Pago" isolado em negrito nem formato de duas linhas
- Campo "Valor pago" tem a mesma altura e tamanho de fonte que "Valor da compra"
- Estado desabilitado do campo "Valor pago" continua visualmente diferenciado (opacidade/fundo/cursor)
- Lógica de `pagoWatch`, `valor_pago` e cálculo de juros/desconto funciona sem regressão
- Fluxo de criação e edição de despesa funcionam sem regressão
- Typecheck (`tsc --noEmit`) e build do frontend passam sem novos erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Este projeto não separa `frontend/AGENT.md`/`backend/AGENT.md` — seguir apenas `sistema financas/CLAUDE.md` e o `CLAUDE.md` da raiz (ignorando o `AGENT.md` da raiz, boilerplate não aplicável)
- Manter alterações pequenas e focadas em `ExpenseDialog.tsx` e `dialogFormTokens.tsx`
- Seguir a preferência já registrada do usuário: remover completamente a estrutura antiga (label de duas linhas) antes de aplicar a nova — dois passos explícitos, não sobrepor código novo sobre o antigo
- Ramo atual do projeto: `feat/R/relatorio-pdf-duas-tabelas` — consolidar esta mudança nessa branch ativa em vez de criar uma nova, a menos que o usuário peça branch separada
- Validar manualmente no browser antes de considerar a tarefa concluída
