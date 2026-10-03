# Plano de Implementação: data da receita e botões do card do Juca

## Origem

- **Arquivo de especificação:** não houve. O pedido veio de uma conversa direta com o usuário em 2026-10-02, logo depois do merge de `.plans/assistente-paridade-desktop.md` (`a8a44394`).
- **Data do planejamento:** 2026-10-02.
- **Classificação:** `frontend-only`. O servidor, o banco e o `.env` não mudam.

## Resumo

Duas mudanças pequenas no card do assistente (Juca):

1. **Receita sem data na frase.** Hoje o campo "Data" vem vazio, e o Salvar recusa com "Informe a data antes de salvar.". A receita passa a vir com a data de hoje, como a despesa (desde o plano anterior) e como o modal de receita do desktop. O caminho do anexo (foto ou PDF) já fazia isso e avisava "Usei a data de hoje como referência.".
2. **Botões "Salvar" e "Descartar" dos dois cards (lançamento e pagamento).** Passam a seguir o modelo dos botões "Nova receita" e "Nova despesa" de Movimentações, sem ícone:
   - pills menores, as duas com a mesma largura;
   - no mesmo lugar de hoje.

   O HTML dos botões hoje se repete nos dois cards e passa a ser um componente só.

## Decisões do usuário (2026-10-02)

1. **Quais cards mudam:** os dois, o de lançamento (despesa e receita) e o de pagamento.
2. **Posição (Outro):** a mesma de hoje, no rodapé do card, com "Salvar" na ponta esquerda e "Descartar" na ponta direita. Muda só a aparência.
3. **Cores (Outro):** o modelo de "Nova receita" e "Nova despesa", sem ícone. "Salvar" tem borda e texto verdes. "Descartar" segue o mesmo modelo, com borda e texto cinza.

## Escopo

### Dentro do escopo

- Receita sem data na frase vem com hoje no card. A recusa "Informe a data antes de salvar." continua quando o usuário apaga a data.
- Componente `CardActions` com "Salvar" e "Descartar" no modelo de "Nova receita", usado pelos dois cards:
  - mesma largura nos dois botões e sem ícone;
  - spinner e "Salvando…" enquanto grava.

### Fora do escopo

- Os demais botões do sistema e o próprio modelo "Nova receita/despesa" (`dialogFormTokens`), que não mudam.
- Outras diferenças entre a receita do Juca e a do modal do desktop.
- A despesa, cujo comportamento continua como está.

## Leitura de contexto

- `/AGENT.md`: lido. Descreve um sistema multi-prefeitura com RLS, que **não corresponde a este projeto**. Foram aplicadas só as regras transversais.
- `/CLAUDE.md`: fluxo `/planejar → aprovação → /implementar → /finalizar`.
- `frontend/AGENT.md` e `backend/AGENT.md`: **não existem** neste projeto.
- **Arquivos inspecionados:**
  - `src/components/financial-assistant/FinancialAssistant.tsx`: recusa de data em ~l.1148, rodapé de botões em ~l.2143 e `fillExpenseDefaults` em ~l.979;
  - `src/components/financial-assistant/PaymentCard.tsx`: rodapé de botões em ~l.106;
  - `src/components/financial-assistant/cardDraft.ts`: `fillExpenseDefaults` em ~l.46;
  - `src/components/financial-assistant/cardDraft.test.ts`: teste "padrões não sobrescrevem…", que hoje garante que a receita fica igual;
  - `src/screens/finance/MovimentacoesScreen.tsx`: "Nova receita" usa `successOutlineButtonStyle`, "Nova despesa" usa `dangerButtonStyle` (~l.159 e ~l.178);
  - `src/ui/dialogFormTokens.tsx`: `successOutlineButtonStyle` em ~l.80 e a paleta `C` (`chipOffBorder`, `chipOffText`);
  - `src/screens/finance/income-dialog/IncomeDialog.tsx`: a data de recebimento começa com hoje (~l.78);
  - `backend/src/services/financialAssistant.ts`: o caminho de anexo já usa hoje (`usedDefaultDate`, ~l.522).

## Impacto por área

### Frontend

- **`cardDraft.ts`:**
  - `fillExpenseDefaults` passa a se chamar `fillDraftDefaults`.
  - Na **receita**, sem `date` vem `date = todayIso`.
  - Na **despesa**, nada muda (compra hoje e "Pago em" na despesa paga).
  - O que veio da frase nunca é sobrescrito.
  - O comentário da função passa a citar a receita.
- **`FinancialAssistant.tsx`:**
  - O `handleSend` chama `fillDraftDefaults` no lugar de `fillExpenseDefaults`.
  - O rodapé de botões do card de lançamento dá lugar ao `<CardActions … />`. O aviso de duplicata e o texto "Toque em qualquer linha para corrigir." continuam acima dele.
- **`PaymentCard.tsx`:** o rodapé de botões dá lugar ao `<CardActions … />`, e o import do `LoaderCircle` sai se ficar sem uso.
- **Novo `src/components/financial-assistant/CardActions.tsx`:**
  - **Props:** `onSave`, `onDiscard`, `isSaving` e `discardLabel`, que é o `aria-label` do Descartar. Os dois textos de hoje continuam: "Descartar este lançamento sem salvar" e "Descartar este pagamento sem salvar".
  - **Layout:** uma linha `flex` com `justify-between`, padding `px-3.5 pb-3` como hoje. "Salvar" fica à esquerda e "Descartar" à direita.
  - **Estilos:**
    - "Salvar" usa `successOutlineButtonStyle` com `width: 120`;
    - "Descartar" usa o mesmo estilo, com `border: 1px solid ${C.chipOffBorder}` e `color: C.chipOffText`, também com `width: 120`;
    - nenhum dos dois tem ícone;
    - com 120px cabem o spinner e o texto "Salvando…".
  - **Enquanto grava:**
    - os dois ficam `disabled`, com `opacity: 0.6` e `cursor: 'not-allowed'`;
    - o "Salvar" mostra o `LoaderCircle` (14px, girando) e o texto "Salvando…".
- **Estados:** nenhum estado novo além do `isSaving`, que já existe.

### Backend

`Sem impacto esperado.`

### Banco de dados

`Sem impacto esperado.`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.` O deploy publica só a tela.

## Arquivos provavelmente afetados

- `src/components/financial-assistant/cardDraft.ts`
- `src/components/financial-assistant/cardDraft.test.ts`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/components/financial-assistant/PaymentCard.tsx`
- `src/components/financial-assistant/CardActions.tsx` (novo)
- Leitura apenas: `src/ui/dialogFormTokens.tsx`

## Estratégia de implementação

### Fase 0: preparar

1. A branch atual, `feat/R/assistente-paridade-desktop`, já está na `main`. Rodar `git checkout main`, `git pull origin main` e `git checkout -b fix/R/card-assistente-receita-e-botoes`.

### Fase 1: remover

1. Remover o rodapé de botões do card de lançamento em `FinancialAssistant.tsx` (`grid grid-cols-[1fr_auto]`, botões de 44px e hover vermelho do Descartar).
2. Remover o rodapé de botões de `PaymentCard.tsx`, com os mesmos elementos.
3. Remover a exceção "receita volta como veio" de `fillExpenseDefaults` (`if (draft.kind !== 'expense') return draft;`), junto com o nome antigo da função.

### Fase 2: aplicar

1. Em `cardDraft.ts`, criar `fillDraftDefaults`: a receita sem data recebe hoje, e a despesa segue a regra atual.
2. Atualizar a chamada em `FinancialAssistant.tsx`.
3. Criar o `CardActions.tsx` conforme o "Impacto por área".
4. Usar o `<CardActions>` nos dois cards.

### Fase 3: validar

1. Rodar `npx tsc --noEmit`, `npm test` e `npx vite build`.
2. Ajustar o teste "padrões não sobrescrevem o que veio da frase": a receita sem data agora recebe hoje. Acrescentar um teste para a receita com data na frase, que deve ficar como veio.
3. Rodar o teste básico da tela do Juca (`smoke_paridade.mts` no scratchpad, com o servidor local na 3013 e o banco local) e acrescentar:
   - "recebi 500 do cliente" mostra a "Data" de hoje e salva sem digitar a data;
   - nos dois cards, "Salvar" vem antes de "Descartar", com a mesma largura e sem ícone (verificável pelo estilo inline).
4. Limpar os dados de teste (`cleanup_roteiro.cjs roteiro-paridade.test`) e desligar o servidor local (`taskkill /T /F`).

## Regras de negócio identificadas

- **Receita:** sem data na frase, a data é hoje; com data na frase, vale a da frase. Um campo apagado continua sendo recusado ao salvar.
- **Botões:** a ordem e a posição continuam as de hoje ("Salvar" à esquerda, "Descartar" à direita). O modelo é o de "Nova receita", sem ícone, e os dois têm a mesma largura.

## Regras multi-tenant e segurança

- O projeto não é multi-tenant. A mudança é só visual e de valor padrão no card, e não altera rotas, permissões nem escopo de dados.
- O servidor continua validando a receita ao gravar, como hoje.

## Validações necessárias

- A recusa "Informe a data antes de salvar." continua quando o campo "Data" da receita fica vazio.
- Nenhuma validação de despesa muda: o modal do desktop (`validateDraft`) continua valendo.

## Testes necessários

### Frontend

- `fillDraftDefaults`:
  - a receita sem data recebe hoje;
  - a receita com data da frase fica como veio;
  - a despesa continua igual (testes atuais).

### Backend

- Nenhum, porque não há mudança.

### E2E

- O projeto não tem suíte E2E. Fica o teste básico da tela do Juca em jsdom, contra o servidor local, e a conferência do usuário no celular depois do deploy.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
```

## Riscos e pontos de atenção

1. **Altura dos botões:** passa a ser 30px, a mesma do modelo do desktop. Hoje é 44px. No celular, o toque fica mais justo; foi o tamanho pedido.
2. **Visual:** jsdom não calcula layout. Largura e alinhamento só podem ser conferidos no celular depois do deploy.
3. **Estilo inline:** o modelo usa estilo inline (`dialogFormTokens`), sem hover nem modo escuro, assim como os botões de Movimentações. No tema escuro do Juca, os chips continuam com fundo branco, como "Nova receita" no desktop.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

## Critérios de aceite do plano

- **Receita:**
  - "recebi 500 do cliente" (sem data) abre o card com a "Data" de hoje, e o Salvar grava sem pedir a data;
  - com a data apagada no card, o Salvar responde "Informe a data antes de salvar.".
- **Despesa:** nada muda no comportamento.
- **Botões, nos cards de lançamento e de pagamento:**
  - "Salvar" (borda e texto verdes) fica à esquerda e "Descartar" (borda e texto cinza) à direita;
  - os dois são pills de 30px de altura e 120px de largura, sem ícone;
  - ao salvar, o "Salvar" mostra o indicador de carregamento e os dois ficam desabilitados.
- **Validações:** checagem de tipos, testes e build passam, e o teste básico da tela do Juca passa.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir **remover, depois aplicar** (Fase 1 antes da Fase 2).
- Reaproveitar `successOutlineButtonStyle` e a paleta `C` de `src/ui/dialogFormTokens.tsx`, sem criar estilo paralelo nem mudar o arquivo de tokens.
- Não executar migrations (não há nenhuma) e não alterar o `.env`.
- Execução enxuta, com status breve; o resumo curto fica para o fim.
- Ao concluir, seguir para `/finalizar` (commit, push e pergunta sobre o merge em `main`, sem PR).
