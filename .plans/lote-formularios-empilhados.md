# Plano de Implementação: Lote com formulários empilhados

## Origem

- Arquivo de especificação: solicitações do usuário no chat, reiteradas quatro vezes
- Data do planejamento: 2026-09-06
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Cada despesa adicionada ao lote passa a ser um formulário completo, idêntico ao de cadastro, empilhado abaixo do formulário vazio que fica no topo. Todos abertos ao mesmo tempo, todos os campos editáveis, sem clique para expandir.

Exige extrair o corpo do formulário do `ExpenseDialog` para um componente com estado próprio. É uma reescrita estrutural do arquivo mais usado do sistema.

## Histórico: por que este é o terceiro plano sobre o mesmo assunto

O usuário pediu esta funcionalidade quatro vezes. As duas entregas anteriores reduziram o escopo sem combinar:

1. Commit `9f7a7d3` — entregou linha com apenas descrição e valor editáveis.
2. Commit `e026aad` — entregou expansão de um item por vez, mediante clique.

Nenhuma das duas é o que foi pedido. A frase do usuário: *"cada despesa adicionada deve ficar com todos os campos disponíveis para edição, simplesmente o mesmo modal, mesmos campos de registro, só empurrados para baixo"*.

Este plano implementa exatamente isso, sem alternativa reduzida.

## Decisões aplicadas

- Pergunta 1: **opção 1** — formulário vazio no topo; despesas adicionadas abaixo, na ordem de inclusão.
- Pergunta 2: **opção 1** — formulário inteiro em cada despesa: descrição, categoria, forma de pagamento, cartão, tipo de cobrança, parcelas, datas, valor pago, anexos e nota fiscal.
- Pergunta 3: **opção 1** — todos os formulários abertos, sem recolher os antigos. O usuário rola o modal.

## Escopo

### Dentro do escopo

- Extrair o corpo do formulário (linhas ~601 a ~1142 do `ExpenseDialog.tsx`) para um componente `ExpenseForm`.
- Cada instância de `ExpenseForm` carrega seu próprio `useForm` e os 9 estados por despesa.
- `ExpenseDialog` passa a renderizar um `ExpenseForm` vazio no topo e um por item do `batch`.
- Remover a linha compacta e o mecanismo de expansão introduzidos pelo commit `e026aad`.
- Submit consolida os valores de todos os formulários.

### Fora do escopo

- `IncomeDialog` — não possui fluxo de lote.
- Backend, schema, migrations.
- Recolher formulários antigos (a decisão 3 descartou).
- Pendências anteriores: saldos mensais, usuários sem conta, merge do commit `ab4dd44`.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/screens/finance/ExpenseDialog.tsx` (1205 linhas, estado atual)
- `src/ui/dialogFormTokens.tsx` (tokens visuais)
- `src/ui/dialog.tsx` (`fixedHeight`, `scrollBody={false}`)
- `.plans/lote-despesas-editavel-e-rodape-receitas.md` (primeira tentativa, insuficiente)
- `.plans/lote-expansivel-e-correcoes-mockup.md` (segunda tentativa, insuficiente)
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Investigação: o que precisa ser replicado

### Estados por despesa (9) — vão para o `ExpenseForm`

`anexos`, `showCatForm`, `categoriaSugestao`, `duplicataInfo`, `nfAberta`, `valorInputMode`, `methodTouched`, `acHidden`, `acIndex`.

Mais o `useForm` com seu schema zod, os 15 `useWatch` e os `useMemo` derivados (`vencimentoDerivado`, `statusDerivado`, `resumoTotal`, `jurosEmbutido`, `proximaParcelaVence`, `mensalTexto`).

### Estado compartilhado — fica no `ExpenseDialog`

`batch`, `isSavingAll`, `savedMessage`. Mais o rodapé, os botões e a lógica de submit.

`loteExpandido` e `itemAberto` deixam de existir: eram do mecanismo de expansão que este plano remove.

### Queries — compartilhadas sem custo

As 4 `useQuery` (categorias, cartões, limites de cartão, sugestões) usam React Query com chave centralizada. Múltiplas instâncias do componente compartilham o mesmo cache; não há requisição extra por formulário.

A query de sugestões depende da descrição digitada, então cada formulário terá sua própria chave — comportamento correto, pois o autocomplete é por despesa.

## Impacto por área

### Frontend

**Novo componente** — `ExpenseForm`, contendo o corpo do formulário e o estado por despesa. Recebe:
- valores iniciais (vazio para o do topo, `ExpenseFormValues` para os do lote)
- callback de mudança, para o pai manter o `batch` atualizado
- callback de remoção, para os itens do lote
- flag indicando se é o formulário de entrada (topo) ou item do lote

**`ExpenseDialog`** — passa a orquestrar: renderiza o formulário do topo, mapeia o `batch` em formulários, mantém o rodapé e o submit.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/ExpenseForm.tsx` (novo)

## Estratégia de implementação

Segue a regra do projeto para redesign: remover antes de aplicar.

### Etapa 1 — remover

1. Remover a linha compacta do lote, o estado `itemAberto`, o `loteExpandido`, as funções `abrirItemDoLote`, `fecharItemDoLote` e `carregarNoForm`, e a guarda do atalho Shift+Enter que dependia delas.

### Etapa 2 — extrair

2. Criar `ExpenseForm.tsx` movendo o corpo do formulário **sem alterar o JSX interno**, apenas ajustando o que vem de props.
3. Mover para o componente o `useForm`, os 9 estados por despesa, os watches e os memos derivados.
4. Definir a interface de props e os callbacks para o pai.

### Etapa 3 — orquestrar

5. `ExpenseDialog` renderiza um `ExpenseForm` vazio no topo.
6. Abaixo, um `ExpenseForm` por item do `batch`, na ordem de inclusão, cada um com botão de remover.
7. Ajustar o submit para consolidar os valores de todos os formulários.
8. Ajustar o rótulo do botão e a contagem.

### Etapa 4 — validar

9. `tsc --noEmit`, `vite build`, suíte do backend.

## Regras de negócio identificadas

- Nada no lote foi salvo: a gravação só acontece no submit, que envia todos os itens mais o formulário do topo, se preenchido.
- Por isso todos os formulários permanecem editáveis até o salvamento.
- A ordem de gravação é a ordem de exibição: primeira adicionada primeiro, formulário do topo por último.
- Cada formulário valida independentemente pelo mesmo schema zod.
- Remover um item não pode afetar os demais.
- O formulário do topo, quando vazio, não entra no salvamento.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização; o isolamento é por `usuario_id`, aplicado no backend. Esta alteração é de apresentação e estado local, e não toca autenticação, autorização nem filtro por usuário.

## Validações necessárias

- Cada `ExpenseForm` mantém o schema zod atual (`descricao` obrigatória, `valor_original` mínimo 0,01, `dataCompra` obrigatória).
- Um formulário do lote com dados inválidos deve impedir o salvamento e sinalizar qual item está com problema.
- O formulário do topo vazio não bloqueia o salvamento dos itens do lote.

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual:

- Adicionar 3 despesas e conferir que aparecem 4 formulários (3 do lote + 1 vazio no topo).
- Editar categoria e forma de pagamento da segunda despesa; conferir que as outras não mudam.
- Editar o valor de uma despesa e conferir que o total do rodapé acompanha.
- Remover a despesa do meio e conferir que as demais permanecem corretas.
- Salvar e conferir que todas foram gravadas com os valores da tela, na ordem correta.
- Com 9 despesas no lote, conferir se a digitação continua fluida (risco de desempenho).

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

Observação: `src/screens/despesas/DespesasScreen.tsx` tem um erro de tipo pré-existente, não relacionado a esta alteração.

## Riscos e pontos de atenção

- **Alto:** o `ExpenseDialog` é a tela mais usada do sistema e a refatoração toca praticamente todo o arquivo. `tsc` e build cobrem tipo, não comportamento — a conferência visual do usuário é indispensável antes do merge.
- **Médio — desempenho:** cada formulário monta seus próprios watches e effects. Com 9 formulários abertos, o processamento por tecla digitada multiplica. Se ficar lento, a mitigação é isolar a re-renderização por formulário, não reduzir a funcionalidade.
- **Médio — autocomplete:** a query de sugestões passa a existir por formulário. Precisa continuar funcionando isolada em cada um, sem interferência entre eles.
- **Médio — sincronização:** o pai mantém o `batch`; cada formulário precisa reportar mudanças sem causar re-renderização em cascata nos irmãos.
- **Baixo:** as 4 queries são cacheadas pelo React Query; não há custo de rede adicional.

### Mitigação principal

O corpo do formulário será movido **sem alterar o JSX interno**. As mesmas linhas, apenas recebendo estado próprio em vez do estado do pai. Assim o comportamento de cada campo permanece idêntico ao que já funciona hoje, e a mudança fica concentrada na fiação entre pai e filho.

## Perguntas em aberto

- Se o desempenho degradar com muitos formulários abertos, qual o limite aceitável? A definir com o usuário caso o problema apareça na prática.

## Critérios de aceite do plano

- O formulário vazio fica no topo, sempre disponível para a próxima despesa.
- Cada despesa adicionada aparece abaixo, como formulário completo, com todos os campos editáveis sem clique prévio.
- A ordem é a de inclusão: primeira adicionada logo abaixo do formulário do topo.
- Editar qualquer campo de qualquer despesa funciona e não afeta as outras.
- Remover uma despesa não afeta as demais.
- Salvar grava todas com os valores como estão na tela, na ordem de exibição.
- Nenhuma despesa duplicada ou perdida.
- Nenhum resíduo do mecanismo de expansão anterior permanece no código.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Não reduzir o escopo.** Duas entregas anteriores falharam por isso. Se algo parecer inviável, parar e relatar ao usuário em vez de entregar uma versão menor.
- Mover o JSX do formulário sem reescrevê-lo; a mudança é de fiação de estado, não de marcação.
- Seguir a ordem das etapas: remover o mecanismo de expansão antes de extrair o componente.
- Não alterar `IncomeDialog`.
- Reutilizar os tokens de `dialogFormTokens.tsx`; não criar tokens novos.
- Preservar acessibilidade e o comportamento dos atalhos de teclado.
- Não executar migrations. Não alterar `.env`.
- Manter o payload de `toFormValues` inalterado.
- Registrar no resumo final se houve degradação perceptível de desempenho com muitos formulários.
