# Plano de Implementação: Anexos individuais em Despesas e Receitas

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação vem da
  mensagem do usuário após conferência visual em ambiente local:
  *"achei uma inconsistência em anexos de receitas e despesas... como é
  apresentado em um local todos os anexos, para remover só consegue remover
  todos; o ideal é apresentar arquivo por arquivo anexado, pode ser um ao lado
  do outro, e o ícone de anexar deve ficar ao lado direito do campo descrição"*.
- Data do planejamento: `2026-09-06`
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

A remoção individual de anexos **já existe** no `AttachmentSection`: ele lista
cada arquivo com nome, tamanho, botão de baixar e um `X` próprio
(`src/ui/AttachmentSection.tsx`, linhas 133–166).

O problema é que `ExpenseDialog` e `IncomeDialog` renderizam o componente dentro
de `<div style={{ display: 'none' }}>`. O componente fica montado apenas para o
`ref` funcionar (`attachmentRef.current.openPicker()` abre o seletor de
arquivos), e a lista de anexos some junto.

No lugar dela ficou um resumo improvisado nos modais — `Anexar arquivo (2)` com
um `X` que chama `setAnexos([])`, apagando **todos** os anexos de uma vez.

Ou seja: a funcionalidade correta existe, está oculta, e foi substituída por uma
versão pior.

Nota de honestidade: na auditoria `/limpar` anterior este `display: none` foi
classificado como falso positivo. A justificativa (o `ref` precisa do componente
montado) estava certa, mas não percebi que ele escondia a lista junto. É
exatamente o padrão "concealed rather than removed" que a própria skill descreve.

## Decisão aplicada

- **Chips em todos os lugares:** o layout novo vale também para o
  `AttachmentPreviewDialog` (visualização de anexos de lançamento já salvo). Um
  único layout no componente, sem prop de variante.

## Escopo

### Dentro do escopo

**Deleção (primeiro, sem sobrepor):**

- `<div style={{ display: 'none' }}>` em torno do `AttachmentSection`, nos dois
  modais
- Botão de remover todos (`onClick={() => setAnexos([])}`) — 2 ocorrências
- Lista vertical do `AttachmentSection` (`grid gap-1.5`, um arquivo por linha)

**Aplicação:**

- Chips horizontais (`flex-wrap`) no `AttachmentSection`: nome truncado,
  tamanho, botão de baixar e `X` individual por arquivo
- Gatilho de anexar movido para a direita do rótulo "Descrição"
- Chips renderizados abaixo da linha inteira (Descrição + Categoria), ocupando a
  largura total do modal

### Fora do escopo

- Backend, upload, tipos
- Validação de tamanho e tipo de arquivo (`ACCEPT`, `handleFiles`)
- Demais campos dos modais

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz — **lido, com divergência registrada**: descreve um backend
  multi-prefeitura com multi-tenant + RLS que não corresponde a este projeto.
  Sem impacto aqui, já que o plano é frontend-only.
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `src/ui/AttachmentSection.tsx`,
  `src/screens/finance/ExpenseDialog.tsx`,
  `src/screens/finance/IncomeDialog.tsx`,
  `src/ui/AttachmentPreviewDialog.tsx`

## Impacto por área

### Frontend

- **Telas:** modais de Nova/Editar despesa e Nova/Editar receita; tela de
  visualização de anexos
- **Componentes:** `AttachmentSection` (layout da lista)
- **Query keys / forms / validações:** inalterados
- **Estados:** o caso "nenhum anexo" já é tratado (`readonly && value.length === 0`)
- **Testes:** o projeto não possui suíte de frontend

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção. Este plano
não envolve nenhuma migration.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

| Arquivo | Alteração |
|---|---|
| `src/ui/AttachmentSection.tsx` | lista vertical → chips horizontais |
| `src/screens/finance/ExpenseDialog.tsx` | remove `display:none` e "remover todos"; move o gatilho |
| `src/screens/finance/IncomeDialog.tsx` | idem |
| `src/ui/AttachmentPreviewDialog.tsx` | herda o layout novo, sem alteração própria |

## Estratégia de implementação

1. `AttachmentSection`: converter a lista em chips horizontais, preservando o
   botão de baixar e a remoção individual.
2. `ExpenseDialog`: **deletar** o `display: none` e o botão de remover todos;
   mover o gatilho para a direita do rótulo "Descrição"; posicionar os chips
   abaixo da linha.
3. `IncomeDialog`: o mesmo tratamento.
4. Conferir o `AttachmentPreviewDialog` com o layout novo.
5. Validar com `tsc --noEmit`, `vite build` e, no backend, `npm run build` +
   `npm test`.

## Regras de negócio identificadas

Todas preservadas:

- `openPicker()` via `ref` continua sendo o gatilho; o `<input type="file">`
  segue oculto (é assim que se estiliza um seletor de arquivos)
- Validação de tamanho e tipo em `handleFiles` inalterada
- `readonly` continua escondendo o botão de remover
- Download por anexo preservado

## Regras multi-tenant e segurança

O projeto **não é multi-tenant** no sentido do `AGENT.md` da raiz: não há
prefeituras, `tenantId` nem RLS. Nenhum dado novo é exposto — os anexos já
estavam no estado do formulário, apenas não eram exibidos.

## Validações necessárias

Nenhuma validação nova. As existentes seguem em `handleFiles`.

## Testes necessários

### Frontend

- Não aplicável — o projeto não possui suíte de testes de frontend. Validação
  por typecheck, build e conferência visual.

### Backend

- Intocado. Os 23 testes existentes devem continuar passando.

### E2E

- Conferência manual: anexar três arquivos, remover o do meio e confirmar que os
  outros permanecem; abrir um lançamento já salvo e verificar a exibição dos
  anexos.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

cd backend && npm run build
cd backend && npm test
```

## Riscos e pontos de atenção

- **`AttachmentPreviewDialog` muda junto** (aceito na decisão): é a tela de
  visualização de anexos de um lançamento salvo, onde há mais espaço e a lista
  vertical era mais legível. Exige conferência visual.
- **A linha do "Anexar" também abriga a sugestão de categoria/tipo**
  ("sugerido · Tab aceita"). Ao mover o gatilho, essa sugestão precisa continuar
  visível — não remover a linha inteira.
- **Nomes longos de arquivo** podem alargar demais o chip; aplicar `truncate`
  com `max-width`.
- **Layout diferente entre os modais:** no `ExpenseDialog` a Descrição divide a
  linha com Categoria (o rótulo já tem `justify-between`, então o ícone
  encaixa); no `IncomeDialog` a Descrição ocupa a largura total.
- **Erro pré-existente** em `src/screens/despesas/DespesasScreen.tsx:727`
  continuará aparecendo no `tsc --noEmit`; não é regressão.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. A decisão pendente foi respondida pelo
usuário e está registrada em "Decisão aplicada".

## Critérios de aceite do plano

- Nenhum `display: none` em torno do `AttachmentSection`
- Nenhum `setAnexos([])` nos modais
- Cada anexo pode ser removido individualmente, sem afetar os demais
- Chips exibidos lado a lado, com quebra de linha, ocupando a largura do modal
- Ícone de anexar à direita do rótulo "Descrição" nos dois modais
- A sugestão de categoria/tipo continua visível
- `AttachmentPreviewDialog` funcionando com o layout novo
- `tsc --noEmit` sem erros novos; `vite build` passando; backend `npm test` com
  23/23

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Deletar antes de aplicar**, em etapas explícitas — nunca sobrepor.
- Não tocar em backend, endpoints, `.env` ou migrations.
- Preservar `openPicker()`, as validações de arquivo e o modo `readonly`.
- Conferir visualmente os dois modais e a tela de preview.
- Manter as alterações restritas aos arquivos listados.
