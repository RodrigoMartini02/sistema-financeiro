# Plano de Implementação: Padronizar botão de excluir despesa (parcelada e sem parcelas)

## Origem

- Arquivo de especificação: nenhum (originado de pedido direto na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Padronizar o botão de ação destrutiva em dois modais de exclusão de despesa, usando o token `dangerButtonStyle` já existente e adotado em 10 outras telas do sistema (outline vermelho, sem preenchimento sólido):

1. **`DeleteInstallmentDialog.tsx`** (modal de excluir/cancelar despesa parcelada): trocar o estilo inline do botão de ação por `dangerButtonStyle`.
2. **`ConfirmDialog.tsx`** (modal genérico usado por `useConfirm()`, incluindo a exclusão de despesa sem parcelas — e outras 13 telas): remover o botão "Cancelar" do rodapé (fecha só pelo X, clique fora, ou Esc — todos já funcionam) e trocar o preenchimento vermelho sólido do botão de confirmação por `dangerButtonStyle` quando `variant === 'danger'`.

Como `ConfirmDialog` é compartilhado, essa mudança afeta todas as 14 telas que usam `useConfirm()` — decisão já confirmada com o usuário.

## Escopo

### Dentro do escopo

- `src/screens/despesas/DeleteInstallmentDialog.tsx`: importar `dangerButtonStyle` de `dialogFormTokens.tsx` (já importa `C` de lá) e aplicá-lo ao botão de ação, preservando o texto dinâmico (`Excluir/Cancelar selecionadas`) e o estado de loading/disabled.
- `src/ui/ConfirmDialog.tsx`: remover o botão "Cancelar" do rodapé; aplicar `dangerButtonStyle` ao botão de confirmação quando `variant === 'danger'`; manter `saveButtonStyle` (preenchido, cor primária) quando `variant === 'default'`.
- Remover a prop `cancelLabel` de `ConfirmDialog.tsx` e da interface `ConfirmOptions`/repasse em `ConfirmContext.tsx` — confirmado que nenhum dos 14 call-sites a utiliza hoje, então fica órfã após a remoção do botão.

### Fora do escopo

- Componente base `Dialog` (`src/ui/dialog.tsx`) — não muda; já oferece X, clique fora, e Esc como formas de fechar, suficientes sem o botão de rodapé.
- Qualquer mudança de lógica de negócio de exclusão/cancelamento.
- `variant === 'default'` — continua com `saveButtonStyle` preenchido, sem outline.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `src/ui/dialogFormTokens.tsx` (token `dangerButtonStyle`, já usado em 10 telas via `grep`), `src/screens/despesas/DeleteInstallmentDialog.tsx`, `src/ui/ConfirmDialog.tsx`, `src/context/ConfirmContext.tsx`, `src/ui/dialog.tsx` (confirmado X/clique fora/Esc já funcionam independente do rodapé), `grep` confirmando 14 usos de `useConfirm()` e que `cancelLabel` nunca é passado por nenhum deles.

## Impacto por área

### Frontend

- `src/screens/despesas/DeleteInstallmentDialog.tsx`: import de `dangerButtonStyle`; botão de ação passa a usar esse token como base, mantendo `disabled`/`opacity` conforme estado de loading.
- `src/ui/ConfirmDialog.tsx`: remoção do botão "Cancelar"; botão de confirmação usa `dangerButtonStyle` quando `variant === 'danger'` (spread do token + `opacity`/`cursor` conforme `isLoading`), mantém `saveButtonStyle` quando `variant === 'default'`.
- `src/context/ConfirmContext.tsx`: remoção da prop `cancelLabel` de `ConfirmOptions` e do repasse ao `ConfirmDialog`.
- Sem mudança de query keys, hooks de dados, ou lógica de mutação — puramente estilo/estrutura visual.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/screens/despesas/DeleteInstallmentDialog.tsx`
- `src/ui/ConfirmDialog.tsx`
- `src/context/ConfirmContext.tsx`

## Estratégia de implementação

1. Em `DeleteInstallmentDialog.tsx`, importar `dangerButtonStyle` e substituir o objeto de estilo inline do botão de ação, mantendo `disabled`/`opacity` conforme `isLoading`/`selecionadas.size === 0`.
2. Em `ConfirmDialog.tsx`, remover o `<button>` de "Cancelar" do rodapé e o wrapper flex que continha os dois botões (ajustar para o botão de confirmação sozinho, alinhado à direita).
3. No botão de confirmação de `ConfirmDialog.tsx`, aplicar `dangerButtonStyle` quando `variant === 'danger'`, mantendo `saveButtonStyle` quando `variant === 'default'`.
4. Remover a prop `cancelLabel` de `ConfirmDialogProps`, do parâmetro da função, e da prop `onCancel` não é afetada (continua existindo, só não tem mais botão dedicado — usada pelo X/clique fora/Esc).
5. Remover `cancelLabel` de `ConfirmOptions` em `ConfirmContext.tsx` e do repasse ao `<ConfirmDialog>`.
6. Rodar build (`tsc --noEmit`, `vite build`) e revisar visualmente: modal de excluir despesa parcelada com botão outline vermelho; modal de excluir despesa sem parcelas (via `useConfirm()`) sem botão "Cancelar" e com outline vermelho; alguma outra tela com `variant: 'default'` (ex: mover despesa) continua com botão preenchido azul.

## Regras de negócio identificadas

- Nenhuma regra de negócio nova — ajuste puramente visual, alinhando dois pontos do sistema a um padrão já vigente em outras 10 telas.

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança visual isolada, sem tocar em autorização, propriedade de dados ou rotas.

## Validações necessárias

- Confirmar que nenhum outro call-site de `useConfirm()` dependia visualmente do botão "Cancelar" para alguma instrução específica (ex: texto customizado que só fizesse sentido com o botão presente) — nenhum encontrado na investigação.

## Testes necessários

### Frontend

- Abrir modal de excluir despesa sem parcelas: confirmar que não há botão "Cancelar", só o botão de ação em outline vermelho, e que X/clique fora/Esc fecham normalmente.
- Abrir modal de cancelar despesa sem parcelas (`variant: 'danger'` também): mesmo resultado.
- Abrir alguma confirmação com `variant: 'default'` (ex: mover despesa para próximo mês): botão de confirmação continua preenchido, cor primária — sem outline.
- Abrir modal de excluir/cancelar despesa parcelada: botão de ação em outline vermelho, mesmo estilo do `ConfirmDialog`.

### Backend

Não aplicável — sem impacto de backend.

### E2E

Não aplicável — mudança de UI isolada.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Mudança afeta 14 telas simultaneamente (todo uso de `useConfirm()`) — intencional e já confirmado com o usuário, mas é uma mudança de alcance amplo para uma alteração aparentemente pequena.
- Nenhum risco funcional: todos os mecanismos de fechar o modal (X, clique fora, Esc) já existem e continuam funcionando sem o botão removido.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `DeleteInstallmentDialog.tsx` usa `dangerButtonStyle` no botão de ação.
- `ConfirmDialog.tsx` não tem mais botão "Cancelar"; botão de confirmação usa `dangerButtonStyle` quando `variant === 'danger'` e `saveButtonStyle` quando `variant === 'default'`.
- Prop `cancelLabel` removida de `ConfirmDialog.tsx` e `ConfirmContext.tsx`.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não alterar `src/ui/dialog.tsx`.
- Não alterar nenhuma lógica de exclusão/cancelamento, só estilo.
- Não executar migrations (não há nenhuma neste plano).
