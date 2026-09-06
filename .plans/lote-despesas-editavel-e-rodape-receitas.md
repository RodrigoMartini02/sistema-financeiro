# Plano de Implementação: Lote de despesas editável e rodapé de receitas

## Origem

- Arquivo de especificação: solicitações do usuário no chat (com screenshot do modal de despesa com 9 itens no lote)
- Data do planejamento: 2026-09-06
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Consolida duas pendências abertas: o lote de despesas passa a ser uma lista editável abaixo do formulário, no lugar dos chips do rodapé; e o rodapé da tabela de receitas deixa de exibir a contagem de lançamentos.

Nenhum endpoint, coluna ou migration. Dois arquivos de tela.

Um terceiro item levantado pelo usuário (tabela de receitas não atualiza ao cadastrar) fica **fora do escopo** por falta de causa confirmada — ver a seção "Item 3".

## Escopo

### Dentro do escopo

- Lote de despesas apresentado como lista vertical abaixo do formulário, empurrando o conteúdo (sem scroll próprio).
- Descrição e valor editáveis diretamente na linha do lote.
- Categoria e forma de pagamento exibidas como texto de apoio na linha.
- Botão de remover por linha.
- Expandir: 2 despesas mais recentes visíveis; link "ver todas as N" acima disso.
- Total do lote como cabeçalho da lista; rodapé volta a ser só os botões.
- Rodapé da tabela de receitas exibe apenas "Total", sem a contagem de lançamentos.

### Fora do escopo

- Tabela de receitas que não atualiza ao cadastrar (ver "Item 3").
- `IncomeDialog` — não possui fluxo de lote.
- Edição de categoria, forma de pagamento, parcelas ou anexos na linha do lote (para mudar isso, remover a linha e lançar de novo).
- Alteração de backend, schema ou migration.
- Correção do histórico do commit `228de50` (assunto separado, aguardando decisão do usuário).

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/screens/finance/ExpenseDialog.tsx` (estado atual do lote)
- `src/screens/receitas/ReceitasScreen.tsx` (rodapé da tabela)
- `src/hooks/useFinanceDashboard.ts` (mutations e invalidação)
- `src/services/queryKeys.ts` (`invalidateFinanceQueries`)
- `src/hooks/useActiveAccount.ts` (troca de conta)
- `backend/src/routes/incomes.ts` (GET e POST de receitas)
- Commit `9739a73` — versão anterior do lote, para conferir o formato de lista que o usuário lembrava
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

**`src/screens/finance/ExpenseDialog.tsx`**

- Remover o bloco de chips do rodapé (`hasBatch` dentro do rodapé fixo).
- Adicionar a lista do lote ao final do corpo rolável, depois da nota fiscal.
- Novo estado local para o expandir (mostrar todas ou apenas as 2 mais recentes).
- Handler para editar `descricao` e `valor_original` de um item do lote por índice.
- `batchTotal` passa a ser exibido no cabeçalho da lista.

**`src/screens/receitas/ReceitasScreen.tsx`**

- Linha 408: substituir a IIFE que monta `Total (N lançamentos)` pelo texto fixo `Total`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Item 3 — por que a tabela de receitas ficou fora

O usuário relatou que a tabela de receitas não atualiza ao cadastrar. A investigação não confirmou causa:

- `handleSave` usa `mutateAsync` e aguarda antes de fechar o dialog.
- `saveIncomeMut.onSuccess` chama `invalidate`.
- `invalidateFinanceQueries` invalida `queryKeys.dashboard(month, year)`.
- O backend grava `mes`/`ano` exatamente como recebe e `GET /receitas` filtra por esses campos.

A hipótese de cache por conta foi **descartada na investigação**: `useActiveAccount.select` faz `window.location.reload()` ao trocar de conta, então o cache de outra conta não sobrevive — embora o `queryKey` do dashboard de fato não inclua `conta_id`.

Resta a hipótese de a receita nascer com data de recebimento fora do mês exibido, o que a tiraria da visão esperada. Isso só se confirma com o usuário respondendo se a receita aparece ao recarregar a página, ou se aparece em outro mês.

Implementar sem essa confirmação seria corrigir no escuro.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

Segue a regra do projeto para redesign: remover antes de aplicar.

### Etapa 1 — remover

1. Apagar o bloco de chips do lote no rodapé fixo do `ExpenseDialog`.
2. Apagar a IIFE de contagem no rodapé da tabela de receitas, deixando "Total".

### Etapa 2 — aplicar

3. Adicionar o estado de expansão da lista no `ExpenseDialog`.
4. Adicionar o handler de edição por índice (descrição e valor).
5. Montar a lista ao final do corpo rolável: cabeçalho com contagem e total, linhas com campos editáveis, categoria e forma como texto, botão remover.
6. Aplicar o corte de 2 itens visíveis com link para expandir.

## Regras de negócio identificadas

- Nada no lote foi salvo: a gravação só acontece ao clicar em "Salvar despesas", que envia `[...batch, despesa do formulário]`.
- Por isso todos os itens do lote permanecem editáveis até o salvamento — não há registro no banco a proteger.
- O item em preenchimento continua no formulário do topo e não faz parte da lista.
- `valor_original` editado deve refletir no total do lote e no rótulo do botão de salvar.
- Remover um item do lote não pode afetar os demais (remoção por índice já existente).

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização: o isolamento é por `usuario_id`, já aplicado nas rotas. Esta alteração é de apresentação e edição local em memória, e não toca autenticação, autorização nem filtro por usuário.

## Validações necessárias

- Valor editado na linha do lote deve continuar sendo número válido; entrada vazia não pode virar `NaN`.
- Descrição vazia numa linha do lote não deve permitir o salvamento daquele item.
- As validações do formulário do topo permanecem inalteradas (schema zod existente).

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual:

- Adicionar 3+ despesas ao lote e conferir que só 2 aparecem, com link para expandir.
- Editar o valor de uma linha e conferir que o total do lote e o botão de salvar acompanham.
- Remover uma linha e conferir que as demais permanecem intactas.
- Salvar o lote e conferir que todas as despesas são gravadas com os valores editados.

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

- **Médio:** mexe no fluxo de salvamento em lote, que grava várias despesas de uma vez. A edição inline altera `ExpenseFormValues` já montados; garantir que o valor editado propague para o total e que nada seja salvo em duplicidade.
- **Baixo:** a lista cresce o corpo do modal. O corpo já é rolável (`overflowY: auto` com `scrollBody={false}`), então não deve haver estouro de layout — conferir com lote grande.
- **Baixo:** rodapé de receitas é troca de texto.

## Perguntas em aberto

- A receita que não aparece na tabela: ela surge ao recarregar a página, ou aparece em outro mês? A resposta define se o Item 3 vira correção de cache ou de gravação de mês.

## Critérios de aceite do plano

- Lista do lote aparece abaixo do formulário, empurrando o conteúdo, sem scroll próprio.
- Descrição e valor são editáveis na própria linha.
- Total do lote e rótulo do botão de salvar acompanham a edição.
- Por padrão só as 2 despesas mais recentes aparecem; o link expande o restante.
- Remover uma linha não afeta as demais.
- Salvar grava todas as despesas com os valores como estavam na lista.
- Rodapé da tabela de receitas mostra apenas "Total", com o valor somado inalterado.
- Nenhum resíduo dos chips do rodapé permanece no arquivo.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir a ordem das duas etapas: remover antes de aplicar.
- Não implementar o Item 3 (tabela de receitas) sem a confirmação do usuário registrada em "Perguntas em aberto".
- Não alterar `IncomeDialog`.
- Reutilizar os tokens de `dialogFormTokens.tsx`; não criar tokens novos.
- Não executar migrations. Não alterar `.env`.
- Manter o payload de `toFormValues` inalterado.
