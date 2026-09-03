# Plano de Implementação: Reposicionar checkbox "Pago" abaixo de Valor da Compra

## Origem

- Arquivo de especificação: conversa com o usuário (mockup de imagem "Nova despesa" + sugestão de refinamento aceita)
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

O checkbox "Pago" no bloco 3 (Quanto) do `ExpenseDialog.tsx` fica isolado ao lado do campo de valor, sem indicar claramente seu propósito, e o campo "valor pago" só aparece depois de um clique extra em um link pequeno ("valor pago diferente"). A mudança reposiciona o checkbox para abaixo do campo "Valor da compra" com um texto explicativo, e deixa o campo "Valor pago" sempre visível (desabilitado até marcar o checkbox), com uma frase de ajuda no lugar do link escondido.

## Escopo

### Dentro do escopo

- Reordenar layout do Bloco 3 em `ExpenseDialog.tsx`: mover checkbox "Pago" para abaixo de "Valor da compra", substituindo o texto auxiliar "Preço base da compra"
- Atualizar label/descrição do checkbox para "Assinale se a despesa já foi paga"
- Campo "Valor pago" sempre visível, desabilitado/esmaecido até "Pago" ser marcado
- Frase de ajuda abaixo do campo: "Preencha apenas se o valor pago for diferente do valor da compra"
- Remover o link "valor pago diferente" / "usar valor da compra"
- Remover o estado `valorPagoAberto`; "valor pago diferente" passa a ser inferido pelo preenchimento do campo (`valorPagoWatch != null`)
- Ajustar `efetivoFinal`, `jurosCalculado`, `descontoCalculado` e `toFormValues` para usar essa nova condição
- Ao desmarcar "Pago", limpar `valor_pago`
- Preservar toda a lógica de cálculo de juros/desconto já existente

### Fora do escopo

- Mudanças em outros blocos do dialog (categoria, forma de pagamento, repetição, data)
- Mudanças no schema Zod ou contrato de dados enviado ao backend
- Mudanças no caso de crédito (`isCredito`), que já não exibe esse bloco (`{!isCredito && ...}`)
- Backend/API

## Leitura de contexto

- `c:\Users\rodri\Music\Particular\CLAUDE.md` (raiz) — regras de workflow
- `c:\Users\rodri\Music\Particular\AGENT.md` (raiz) — **não aplicável a este projeto**: descreve um backend multi-tenant/PDF genérico que não corresponde a este repositório; ignorado como boilerplate
- `sistema financas/CLAUDE.md` — regras específicas do projeto (React+TS+Vite+Tailwind / Express+PostgreSQL), consistente com a raiz
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados **não existem** neste projeto (sem separação de pastas `frontend/`/`backend/`)
- `sistema financas/src/screens/finance/ExpenseDialog.tsx` — componente alterado
- Histórico git: commit `9155d07` já reposicionou "valor pago" ao lado de "valor da compra" recentemente — esta mudança refina esse layout

## Impacto por área

### Frontend

Arquivo: `sistema financas/src/screens/finance/ExpenseDialog.tsx`, Bloco 3 (linhas ~708-826):

- Remover estado `const [valorPagoAberto, setValorPagoAberto] = useState(false);` (linha 81) e seus usos (reset ao abrir/fechar, linha 240; inicialização ao editar despesa, linha 250; botão toggle, linhas 796-807)
- Remover texto auxiliar "Preço base da compra" (linha 763-767), mantendo apenas "Última vez você pagou..." quando aplicável, ou texto vazio
- Mover/reestruturar checkbox "Pago" (linhas 775-782) para abaixo do campo de valor, com descrição "Assinale se a despesa já foi paga"
- Campo `valor_pago` (`MoneyFieldSmall`) sempre renderizado, com `disabled={!pagoWatch}`
- Adicionar frase de ajuda fixa: "Preencha apenas se o valor pago for diferente do valor da compra"
- Atualizar `efetivoFinal` (linha 311), `jurosCalculado` (linha 312), `descontoCalculado` (linha 313) para condicionar em `valorPagoWatch != null` em vez de `valorPagoAberto`
- Atualizar `toFormValues` (linha 344) para enviar `valor_pago` quando `pago && valorPagoWatch != null`
- Ao desmarcar checkbox "Pago", limpar `valor_pago` via `form.setValue('valor_pago', undefined)`
- Sem impacto em hooks, query keys ou services

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

1. Remover a estrutura antiga do Bloco 3 relacionada a "Pago" (checkbox no topo da coluna direita, texto auxiliar "Preço base da compra", botão "valor pago diferente"/"usar valor da compra", estado `valorPagoAberto` e todos os seus usos) — remoção completa antes de aplicar o novo layout
2. Aplicar novo layout:
   - Campo "Valor da compra" (coluna esquerda) mantido
   - Abaixo dele, checkbox "Pago" com descrição "Assinale se a despesa já foi paga"
   - Campo "Valor pago" sempre visível na coluna direita, com `disabled={!pagoWatch}`
   - Frase de ajuda fixa abaixo do campo: "Preencha apenas se o valor pago for diferente do valor da compra"
3. Ajustar cálculos derivados (`efetivoFinal`, `jurosCalculado`, `descontoCalculado`, `toFormValues`) para considerar "diferente" com base em `valorPagoWatch != null`
4. Ao desmarcar "Pago", limpar `valor_pago`
5. Validar visualmente no browser (dev server): desmarcado → campo desabilitado; marcado → campo habilitado, editável, cálculo de juros/desconto funcionando ao digitar valor diferente; fluxo de edição de despesa existente com `valorPago` já preenchido

## Regras de negócio identificadas

- O campo "valor pago" só é relevante quando a despesa está marcada como paga
- Quando não preenchido, valor pago = valor da compra (comportamento atual mantido)
- Diferença entre valor pago e valor da compra calcula "juros/multa" (se maior) ou "desconto" (se menor) — lógica existente, não deve ser alterada
- Ao desmarcar "Pago", o valor pago digitado é descartado

## Regras multi-tenant e segurança

Não aplicável — mudança é puramente visual/UX em formulário client-side, sem alteração de dados, queries ou payload enviado ao backend.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável a este plano, que não envolve banco de dados.)

## Validações necessárias

- Nenhuma nova validação de schema necessária (campo `valor_pago` já existe no Zod schema como opcional)
- Confirmar que o campo desabilitado não impede submissão correta quando `pago=false` (`toFormValues` deve continuar enviando `valor_pago: undefined` nesse caso)
- Confirmar que digitar um valor igual ao valor da compra não gera juros/desconto indevidos (diferença = 0)

## Testes necessários

### Frontend

- Teste manual no browser: abrir "Nova despesa", marcar/desmarcar "Pago", confirmar habilitação/desabilitação do campo "Valor pago"
- Confirmar que editar "Valor pago" com valor diferente exibe badge de juros/desconto
- Confirmar fluxo de edição de despesa existente (`isEditing`) com `valorPago` já preenchido, exibindo corretamente no campo
- Confirmar que desmarcar "Pago" limpa o campo "Valor pago"

### Backend

`Sem impacto esperado`

### E2E

Não há suíte E2E identificada no projeto para este fluxo — validação manual é suficiente.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run build
```

Teste visual via skill `/run` (sobe o dev server do frontend).

## Riscos e pontos de atenção

- Risco baixo: mudança isolada a um componente de UI, sem impacto em contrato de dados
- Ao remover `valorPagoAberto`, garantir que todos os pontos que dependiam dele (`efetivoFinal`, `jurosCalculado`, `descontoCalculado`, `toFormValues`, reset ao abrir/fechar o dialog, inicialização ao editar despesa) sejam migrados corretamente para a nova condição baseada em `valorPagoWatch != null`
- Testar visualmente para garantir que o campo desabilitado deixe claro visualmente que está bloqueado até marcar "Pago"

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Checkbox "Pago" aparece abaixo do campo "Valor da compra", com descrição "Assinale se a despesa já foi paga"
- Campo "Valor pago" está sempre visível, desabilitado quando "Pago" não está marcado
- Frase de ajuda "Preencha apenas se o valor pago for diferente do valor da compra" aparece abaixo do campo
- Lógica de cálculo de juros/desconto continua funcionando corretamente
- Fluxo de criação e edição de despesa funcionam sem regressão
- `npm run lint` e `npm run build` do frontend passam sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Este projeto não separa `frontend/AGENT.md`/`backend/AGENT.md` — seguir apenas `sistema financas/CLAUDE.md` e o `CLAUDE.md`/`AGENT.md` da raiz (ignorando o conteúdo do `AGENT.md` da raiz por ser boilerplate não aplicável)
- Manter alterações pequenas e focadas em `ExpenseDialog.tsx`
- Seguir a preferência já registrada do usuário: remover completamente a estrutura antiga (código morto/sobreposto) antes de aplicar o novo layout — dois passos explícitos, não sobrepor código novo sobre o antigo
- Ramo atual do projeto: `feat/R/relatorio-pdf-duas-tabelas` — conforme preferência do usuário, consolidar esta mudança nessa branch ativa em vez de criar uma nova, a menos que o usuário peça branch separada
- Validar manualmente no browser antes de considerar a tarefa concluída
