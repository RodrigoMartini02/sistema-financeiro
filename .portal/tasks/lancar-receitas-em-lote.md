# Task: Permitir lançar receitas em lote

## Contexto

O sistema tem dois modais de lançamento: despesa e receita.

O de **despesa** permite lançar várias de uma vez. Ele é dividido em dois
arquivos verificados no projeto:

- `src/screens/finance/ExpenseDialog.tsx` (389 linhas) — orquestra o lote:
  mantém a lista de itens, o rodapé com total e o submit de todos
- `src/screens/finance/ExpenseForm.tsx` (1023 linhas) — o formulário em si,
  instanciado uma vez por item do lote

O de **receita** é um arquivo único: `src/screens/finance/IncomeDialog.tsx`
(960 linhas), que faz orquestração e formulário juntos. **Não existe um
`IncomeForm`.**

Quatro telas montam o `IncomeDialog`, cada uma com seu próprio `onSave`:

- `src/App.tsx:201`
- `src/demoMain.tsx:43`
- `src/screens/finance/calendar/CalendarView.tsx:226`
- `src/screens/receitas/ReceitasScreen.tsx:436`

## Problema

Quem precisa registrar várias receitas — um mês de recebimentos, várias
parcelas de clientes diferentes — abre e fecha o modal uma vez por lançamento.
Na despesa isso já foi resolvido; na receita, não.

A dívida técnica por trás: o `IncomeDialog` acumula duas responsabilidades num
arquivo só. Enquanto o formulário não for um componente próprio, não há o que
instanciar N vezes, e o lote é impossível sem reestruturar.

Isso também cria divergência entre dois fluxos que o usuário percebe como
equivalentes: lançar dinheiro que sai e dinheiro que entra.

## Objetivo

Permitir adicionar várias receitas antes de salvar, com a mesma experiência já
existente no modal de despesa.

## Decisão Técnica Desejada

Reproduzir o padrão que a despesa já usa, em vez de inventar outro:

1. **Extrair `IncomeForm`** de dentro do `IncomeDialog`, com `forwardRef` e
   handle imperativo, espelhando `ExpenseFormHandle`
   (`ExpenseForm.tsx:71`):

   ```ts
   interface ExpenseFormHandle {
     getValues: () => ExpenseFormValues | null;
     validate: () => Promise<boolean>;
     reset: () => void;
     focus: () => void;
   }
   ```

   Mais `onResumoChange`, que permite ao pai saber o total e detectar duplicata
   sem espelhar estado a cada tecla.

2. **`IncomeDialog` vira orquestrador**, com a lista de itens, botão de
   adicionar, resumo e submit de todos.

Fazer nesta ordem importa: a extração é refactor puro — o modal continua
funcionando com um item só — e, se quebrar algo, quebra antes de a feature
entrar.

O `ExpenseDialog` já resolveu detalhes não óbvios que devem ser reaproveitados,
não redescobertos:

- `ItemLote` com `id` **só** para a chave do React — sem ele, remover um item
  do meio faz o React reaproveitar o formulário seguinte pelo índice, e o
  estado interno escorrega de um lançamento para outro (comentado em
  `ExpenseDialog.tsx:14`)
- `Map` de refs por id, e contador de ids em `ref`, não em `state`

## Escopo Funcional

### Dentro do escopo

- Extrair o formulário de receita em componente próprio, sem mudar campos,
  validação ou comportamento
- Transformar o `IncomeDialog` em orquestrador de lote
- Adicionar receita ao lote, editar e remover itens antes de salvar
- Rodapé com resumo do lote, como na despesa
- Atualizar o contrato `onSave` e os quatro chamadores

### Fora do escopo inicial

- Mudar campos, validações ou o payload da receita
- Unificar `ExpenseForm` e `IncomeForm` num componente genérico — os campos
  divergem demais e a abstração custaria mais que os dois separados
- Alterar o modal de despesa
- Lote para outros tipos de lançamento

## Requisitos de Frontend

- `IncomeForm` novo, com `forwardRef`, handle imperativo e `onResumoChange`
- Estado por receita (useForm, watches, derivados, criação de cliente, sugestão
  de tipo de receita) deve viver **dentro** do formulário, para que digitar num
  item não re-renderize os irmãos — é a razão do handle imperativo na despesa
- `IncomeDialog` passa a manter a lista de itens e o submit em lote
- Contrato `onSave` muda de `(v: IncomeFormValues) => Promise<void>` para
  receber a lista, como em `ExpenseDialog.tsx:41`
- Os quatro chamadores precisam iterar, como `App.tsx:215` já faz na despesa:
  `for (const v of items) await finance.saveIncome.mutateAsync({ values: v })`
- Preservar acessibilidade: cada item do lote precisa ser identificável por
  leitor de tela, como já ocorre no cabeçalho "Despesa 1"
- Tratar loading/erro do salvamento em lote: hoje `isSaving` vale para o modal
  inteiro

## Requisitos de Backend

`Sem impacto backend identificado inicialmente.`

A mutation grava uma receita por vez (`useFinanceDashboard.ts:22`) e o modal de
despesa itera no cliente. O lote de receitas deve seguir o mesmo caminho,
sem endpoint novo.

Se durante o planejamento for avaliado um endpoint de gravação em lote, isso é
mudança de escopo e deve ser decidido separadamente.

## Requisitos de Banco de Dados

`Sem alteração de banco identificada inicialmente.`

Nenhuma tabela, coluna ou índice novo. As receitas continuam sendo gravadas uma
a uma pela rota existente.

Atenção: nenhuma migration deve ser executada sem confirmação explícita do
usuário — o ambiente pode estar apontando para produção.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Verificado:
nenhuma ocorrência de `tenant`/`prefeitura` no backend e sem RLS. O isolamento
relevante é por usuário/conta.

Pontos de atenção:

- O seletor de conta (PF/CNPJ) já existe no modal e define onde o lançamento
  entra. Com lote, é preciso decidir se a conta é única para o lote ou por item
  — ver "Perguntas Para o Planejamento"
- `isEmpresa` controla quais campos aparecem (tipo de receita, representante,
  produtos, cliente). Se a conta puder variar por item, essa derivação precisa
  ser por formulário, não do modal
- A gravação continua passando pela rota autenticada existente; nenhuma
  validação de servidor é afrouxada

## Requisitos de Migração ou Compatibilidade

- O contrato `onSave` muda: os quatro chamadores precisam ser atualizados
  juntos, senão quebram em tempo de compilação (o que é preferível a falhar em
  runtime)
- `IncomeFormValues` não deve mudar — o payload por receita continua igual
- Edição de receita existente (`income` preenchido) deve continuar abrindo um
  item só, sem opção de lote, como a despesa faz com `isEditing`
- Nomenclatura nova de código em inglês (`IncomeForm`, `IncomeFormHandle`,
  `IncomeFormResumo`), acompanhando `ExpenseForm`

## Requisitos de Testes

### Frontend

- Não aplicável inicialmente: o projeto não tem runner de testes no frontend.
  Garantia por `tsc --noEmit`, `vite build` e verificação na tela.

### Backend

- Nenhum teste novo esperado. Os 151 existentes devem continuar passando, já
  que o backend não é tocado.

### E2E

- Não aplicável: não há suíte E2E. Verificação manual:
  - adicionar duas receitas ao lote, conferir o total no rodapé
  - remover a primeira e confirmar que a segunda mantém seus valores (é o bug
    que o `id` do `ItemLote` previne)
  - salvar e conferir que ambas aparecem na listagem
  - editar uma receita existente e confirmar que não há lote
  - repetir em conta PF e PJ, já que os campos visíveis mudam

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/finance/IncomeDialog.tsx` — vira orquestrador
- `src/screens/finance/IncomeForm.tsx` — novo, extraído do anterior
- `src/App.tsx` — chamador
- `src/demoMain.tsx` — chamador
- `src/screens/finance/calendar/CalendarView.tsx` — chamador
- `src/screens/receitas/ReceitasScreen.tsx` — chamador

Referência de padrão (não alterar): `src/screens/finance/ExpenseDialog.tsx` e
`src/screens/finance/ExpenseForm.tsx`.

### Backend

- Nenhum.

### Banco de Dados

- Nenhum.

## Critérios de Aceite

- É possível adicionar mais de uma receita antes de salvar, e todas são
  gravadas
- Remover um item do meio do lote não embaralha os valores dos demais
- O rodapé mostra o total do lote, como na despesa
- Editar uma receita existente continua abrindo um formulário único
- Campos condicionais de PJ (tipo de receita, representante, produtos, cliente)
  continuam respeitando o tipo da conta
- Os quatro chamadores do `IncomeDialog` foram atualizados
- `IncomeFormValues` e o payload gravado permanecem inalterados
- `tsc --noEmit` (frontend e backend), `npm test` e `npm run build` passam
- Nenhuma migration executada

## Perguntas Para o Planejamento

- A conta (PF/CNPJ) é única para o lote inteiro ou pode variar por item? No
  `ExpenseDialog` o seletor fica no pai — vale confirmar se a receita deve
  seguir igual, já que `isEmpresa` muda os campos exibidos
- O que acontece se uma receita do lote falhar ao gravar e outras já tiverem
  sido salvas? O `App.tsx:215` da despesa itera com `await` e não trata falha
  parcial — vale replicar ou melhorar?
- A criação de cliente dentro do formulário (`showClienteForm`) funciona por
  item. Com vários formulários abertos, há risco de conflito no `id` do input
  (`novo-cliente-input`), que hoje é fixo e buscado por `getElementById`
- O vínculo com contrato/produto no formulário de receita tem estado
  compartilhado que dificulte a extração?
- Existe limite razoável de itens no lote, ou o comportamento deve ser aberto
  como na despesa?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (único arquivo de instruções do projeto; `frontend/AGENT.md`
  e `backend/AGENT.md` **não existem**, e o `AGENT.md` da raiz descreve um
  contexto multi-prefeitura que não corresponde a este projeto — aplicar apenas
  as regras transversais).
- Leia também `CLAUDE.md` na raiz do workspace, que define o fluxo obrigatório
  `/planejar → aprovação → /implementar → /finalizar`.
- Inspecione `ExpenseDialog.tsx` e `ExpenseForm.tsx` antes de escrever o plano:
  o padrão a seguir já está resolvido lá.
- Classifique a implementação como `frontend-only`, salvo se a investigação
  mostrar outro escopo.
- Considere propor a entrega em duas etapas — extração do formulário primeiro,
  lote depois — para que um refactor de ~960 linhas seja validável antes de a
  feature entrar.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Este projeto vai direto para `main`, sem staging nem PR.
- Contexto complementar em `.plans/modal-receitas-pf-e-lote.md` (Melhoria 2);
  a Melhoria 1 daquele documento já foi implementada.
