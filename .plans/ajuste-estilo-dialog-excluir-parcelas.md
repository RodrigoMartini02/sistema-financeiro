# Plano de Implementação: Ajuste de estilo no dialog de excluir/cancelar parcelas

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Ajuste de estilo/UX no `DeleteInstallmentDialog.tsx` (dialog de excluir/cancelar parcelas com grade e multi-seleção): remover o contador `(N)` do texto do botão de ação principal, e remover completamente o botão "Fechar" do rodapé — o único jeito de fechar o modal sem agir passa a ser o X do cabeçalho, mesmo padrão já usado em `PaymentModal.tsx` e `BatchPaymentModal.tsx` (que já documentam essa escolha em comentário).

## Escopo

### Dentro do escopo

- `src/screens/despesas/DeleteInstallmentDialog.tsx`: remover o botão "Fechar" do rodapé (bloco `<button onClick={onClose} disabled={isLoading}>Fechar</button>`).
- `src/screens/despesas/DeleteInstallmentDialog.tsx`: alterar o texto do botão de ação de `` `${acaoLabel} selecionadas (${selecionadas.size})` `` para `` `${acaoLabel} selecionadas` ``.
- Ajustar o layout do rodapé para o botão de ação único (provavelmente `justify-content: flex-end`, já que sobra 1 botão em vez de 2).

### Fora do escopo

- `ExpenseDialog.tsx`, `PaymentModal.tsx`, `BatchPaymentModal.tsx`, `AttachmentPreviewDialog.tsx` — confirmado por investigação que nenhum tem botão de só-fechar no rodapé; não precisam de alteração.
- Componente base `Dialog` (`src/ui/dialog.tsx`) — o X já funciona corretamente; decisão explícita de não adicionar trava de `isLoading` a ele.
- Qualquer mudança de comportamento/lógica de exclusão ou cancelamento — só ajuste visual/textual.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo); `frontend/AGENT.md` não existe como arquivo dedicado neste projeto
- Investigação por agente Explore nesta sessão: confirmado que `DeleteInstallmentDialog.tsx` é o único dialog de despesas com botão de só-fechar no rodapé; sem lógica de reset/limpeza acoplada a esse clique (a seleção já é resetada por um `useEffect` que observa `open`/`expense.id`)
- Leitura direta de `src/ui/dialog.tsx`: confirma que o X do header já chama `onClose` diretamente e continua funcionando após a remoção do botão de rodapé

## Impacto por área

### Frontend

- `src/screens/despesas/DeleteInstallmentDialog.tsx`: remoção do botão "Fechar" e simplificação do texto do botão de ação (`acaoLabel selecionadas` em vez de `acaoLabel selecionadas (N)`). Sem impacto em estado, query, ou lógica de mutação — puramente visual/textual.
- Sem mudança de query keys, hooks ou services.
- Estados de loading/error/empty do dialog permanecem inalterados — a única mudança é a ausência de um botão e o texto do outro.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/screens/despesas/DeleteInstallmentDialog.tsx`

## Estratégia de implementação

1. Remover o botão "Fechar" do rodapé do dialog.
2. Ajustar o layout do rodapé para o único botão restante (alinhamento à direita).
3. Remover o contador `(${selecionadas.size})` do texto do botão de ação, mantendo apenas `${acaoLabel} selecionadas`.
4. Rodar build (`tsc --noEmit`, `vite build`) e validar visualmente que o modal continua fechando corretamente pelo X do cabeçalho.

## Regras de negócio identificadas

- Nenhuma nova — ajuste puramente de apresentação, sem alteração de regra de exclusão/cancelamento já implementada.

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança visual isolada, sem tocar em autorização, propriedade de dados ou rotas.

## Validações necessárias

- Confirmar visualmente que o dialog continua funcional (abre, seleciona parcelas, executa ação, fecha) após a remoção do botão.

## Testes necessários

### Frontend

- Abrir o dialog de excluir parcelas: confirmar que só existe 1 botão no rodapé (o de ação), sem contador no texto.
- Abrir o dialog de cancelar parcelas: mesmo comportamento.
- Fechar o modal clicando no X: confirma que fecha normalmente, sem alterar nada.

### Backend

Não aplicável — sem impacto de backend.

### E2E

Não aplicável — mudança visual isolada, não justifica um novo teste E2E dedicado.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Risco muito baixo — mudança puramente visual em 1 arquivo, sem lógica de negócio envolvida.
- Sem contador no botão, o usuário perde a visão rápida de "quantas selecionou" naquele ponto específico — mas essa informação já está visível ao lado esquerdo do rodapé ("N de M parcelas selecionadas"), então não há perda real de informação.
- O X do cabeçalho não tem trava de `isLoading` (decisão já tomada) — clicar nele durante uma exclusão/cancelamento em andamento fecha a UI enquanto a operação continua no servidor; comportamento aceito explicitamente pelo usuário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Botão "Fechar" removido do rodapé de `DeleteInstallmentDialog.tsx`; X do cabeçalho continua fechando normalmente.
- Botão de ação mostra só o texto (ex.: "Excluir selecionadas"), sem número entre parênteses.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Mudança pequena e focada — não tocar em nenhum outro dialog de despesas nem no componente base `Dialog`.
- Não executar migrations (não são necessárias neste plano).
