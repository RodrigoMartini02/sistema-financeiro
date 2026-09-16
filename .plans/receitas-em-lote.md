# Plano de Implementação: Lançar receitas em lote

## Origem

- Arquivo de especificação: `.portal/tasks/lancar-receitas-em-lote.md`
- Contexto complementar: `.plans/modal-receitas-pf-e-lote.md` (Melhoria 2; a
  Melhoria 1 já foi implementada e está em produção)
- Data do planejamento: 2026-09-15
- Classificação: `frontend-only`

## Decisões aplicadas

- **Entrega:** extração do formulário e lote no mesmo commit
- **Falha parcial:** replicar o comportamento da despesa (itera; se uma falhar,
  as anteriores ficam salvas e o erro aparece)

## Resumo

O modal de receita não permite lançar várias de uma vez; o de despesa permite.
A diferença é estrutural: a despesa foi dividida em `ExpenseDialog`
(orquestrador, 389 linhas) e `ExpenseForm` (formulário, 1023 linhas), enquanto
a receita é um `IncomeDialog` único de 960 linhas fazendo as duas coisas.

Para haver lote é preciso extrair o formulário em componente próprio — só
então existe o que instanciar N vezes.

## Escopo

### Dentro do escopo

- `IncomeForm` novo, com `forwardRef`, handle imperativo e `onResumoChange`
- `IncomeDialog` como orquestrador do lote
- Adicionar, editar e remover itens antes de salvar
- Rodapé com resumo do lote
- `onSave` passa a receber array; quatro chamadores atualizados
- Corrigir os dois ids fixos que quebram com múltiplos formulários

### Fora do escopo

- Mudar campos, validações ou payload da receita
- Unificar `ExpenseForm` e `IncomeForm` num componente genérico — os campos
  divergem demais e a abstração custaria mais que os dois separados
- Endpoint de gravação em lote no backend
- Tratar falha parcial de forma diferente da despesa
- Alterar o modal de despesa

## Leitura de contexto

- `/AGENT.md` — lido. Descreve um sistema multi-prefeitura com RLS que **não
  corresponde a este projeto**; aplicadas apenas as regras transversais (React
  Query com query keys centralizadas, sem `any`, reaproveitar padrões
  existentes, nomenclatura nova em inglês)
- `/CLAUDE.md` — fluxo obrigatório `/planejar → aprovação → /implementar →
  /finalizar`
- `frontend/AGENT.md` — **não existe** neste projeto
- `backend/AGENT.md` — **não existe** neste projeto
- `.portal/tasks/lancar-receitas-em-lote.md` — especificação de entrada
- Inspecionados: `IncomeDialog.tsx`, `ExpenseDialog.tsx`, `ExpenseForm.tsx`,
  `useFinanceDashboard.ts`, `App.tsx`

## Achados da investigação

Respondem quatro das cinco perguntas da task:

| Dúvida | Resposta | Evidência |
|---|---|---|
| Conta por item ou do lote? | **Do lote** | `ExpenseDialog.tsx:62` mantém `contaId` no pai e passa como prop (linhas 270, 308) |
| N formulários fazem N requisições? | **Não** | `ExpenseForm.tsx:138-140` faz as próprias queries; o React Query deduplica pela key |
| Divisão de estado é viável? | **Sim** | Despesa: 9 hooks no pai, 33 por item. Receita tem 32 — proporção compatível |
| Ids fixos colidem? | **Sim, e são dois** | `IncomeDialog.tsx:572` (`novo-cliente-input`) e `:642` (`novo-tipo-input`), ambos buscados por `getElementById` |

O contrato a espelhar (`ExpenseForm.tsx:71`):

```ts
interface ExpenseFormHandle {
  getValues: () => ExpenseFormValues | null;
  validate: () => Promise<boolean>;
  reset: () => void;
  focus: () => void;
}
```

Mais `onResumoChange`, que permite ao pai saber o total sem espelhar estado a
cada tecla.

## Impacto por área

### Frontend

**`IncomeForm.tsx` (novo)**

- `forwardRef` expondo `IncomeFormHandle`
- Estado por receita vive aqui: `useForm`, watches, derivados, criação de
  cliente, sugestão de tipo de receita, vínculo com contrato e produtos
- Queries de catálogo ficam no próprio form, como no `ExpenseForm` — a
  deduplicação do React Query evita requisições repetidas
- `onResumoChange` publica `{ preenchido, valor }` para o rodapé do pai

**`IncomeDialog.tsx` (orquestrador)**

- `ItemLote` com `id` **só** para a chave do React. Sem ele, remover um item do
  meio faz o React reaproveitar o formulário seguinte pelo índice e o estado
  interno escorrega de um lançamento para outro (comentado em
  `ExpenseDialog.tsx:14`)
- `Map` de refs por id; contador de ids em `ref`, não em `state`
- Seletor de conta permanece no pai, valendo para o lote inteiro
- Rodapé com total e botão de adicionar
- Edição de receita existente (`income` preenchido) continua abrindo um item
  só, sem lote — como a despesa faz com `isEditing`

**Chamadores** — passam a iterar, como `App.tsx:215` já faz na despesa:

```ts
onSave={async (items) => {
  for (const v of items) await finance.saveIncome.mutateAsync({ values: v });
}}
```

**Acessibilidade:** cada item do lote precisa ser identificável por leitor de
tela, como o cabeçalho "Despesa 1" já faz.

**Estados:** `isSaving` hoje vale para o modal inteiro; manter assim, por
consistência com a despesa.

### Backend

`Sem impacto esperado.`

A mutation grava uma receita por vez (`useFinanceDashboard.ts:22`) e o modal
itera no cliente. Nenhuma rota, validação ou permissão muda.

### Banco de dados

`Sem impacto esperado.`

Nenhuma tabela, coluna ou índice. As receitas continuam sendo gravadas uma a
uma pela rota existente.

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

- `src/screens/finance/IncomeForm.tsx` — **novo**
- `src/screens/finance/IncomeDialog.tsx` — vira orquestrador
- `src/App.tsx` — chamador
- `src/demoMain.tsx` — chamador
- `src/screens/finance/calendar/CalendarView.tsx` — chamador
- `src/screens/receitas/ReceitasScreen.tsx` — chamador

Referência de padrão, **não alterar**: `ExpenseDialog.tsx`, `ExpenseForm.tsx`.

## Estratégia de implementação

1. Criar `IncomeForm.tsx` com `forwardRef`, `IncomeFormHandle` e
   `IncomeFormResumo`, espelhando o contrato do `ExpenseForm`
2. Mover para ele o estado por receita; manter no pai conta, `isSaving` e
   rodapé
3. Trocar os dois ids fixos (`novo-cliente-input`, `novo-tipo-input`) por refs
   ou ids derivados do item — sem isso, dois formulários abertos disputam o
   mesmo elemento
4. Transformar `IncomeDialog` em orquestrador, seguindo a forma do
   `ExpenseDialog`
5. Mudar `onSave` para receber array
6. Atualizar os quatro chamadores
7. Validar: `tsc --noEmit`, `npm run build`, testes do backend, e conferência
   na tela em conta PF e PJ

## Regras de negócio identificadas

- Receita gravada uma a uma; o lote é uma conveniência de interface
- A conta (PF/CNPJ) vale para o lote inteiro, não por item
- Em conta PF não aparecem cliente, tipo de receita, representante nem produtos
- Editar receita existente não tem lote
- Falha no meio do lote deixa as anteriores gravadas — mesmo comportamento da
  despesa hoje

## Regras multi-tenant e segurança

Projeto **não é multi-tenant**: nenhuma ocorrência de `tenant`/`prefeitura` no
backend, sem RLS. O isolamento relevante é por usuário/conta.

- A conta vem do seletor no pai, alimentado por `getActiveAccountId()` e pela
  lista autenticada de contas — não de entrada livre do usuário
- `isEmpresa` deriva da conta selecionada e continua controlando quais campos
  aparecem
- A gravação segue pela rota autenticada existente; nenhuma validação de
  servidor é afrouxada pelo lote
- Um lote maior não amplia privilégio: cada receita passa pela mesma régua de
  uma receita avulsa

## Validações necessárias

Nenhuma validação nova de negócio.

- `IncomeFormValues` e o schema zod permanecem inalterados
- `validate()` do handle dispara a validação existente por item
- O submit só prossegue se **todos** os itens validarem — como no
  `ExpenseDialog`, para não gravar metade por erro de digitação
- `getValues()` devolve `null` quando o item está vazio, e itens vazios não
  entram no lote

## Testes necessários

### Frontend

- Não aplicável: o projeto não tem runner de testes no frontend. Garantia por
  `tsc --noEmit`, `vite build` e verificação na tela

### Backend

- Nenhum teste novo. Os 151 existentes devem continuar passando, já que o
  backend não é tocado

### E2E

- Não aplicável: não há suíte E2E. Verificação manual:
  - adicionar duas receitas, conferir o total no rodapé
  - **remover a primeira e confirmar que a segunda mantém seus valores** — é o
    bug que o `id` do `ItemLote` previne
  - salvar e conferir que ambas aparecem na listagem
  - editar receita existente: sem lote
  - repetir em PF e PJ, já que os campos visíveis mudam
  - abrir dois formulários e usar "+ Cadastrar cliente" no segundo — valida a
    correção dos ids fixos

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm run build

npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

1. **Refactor de 960 linhas sem teste automatizado** — o maior risco. Criação
   de cliente, sugestão de tipo de receita, vínculo com contrato e produtos
   estão entrelaçados no arquivo atual.

   Agravado pela decisão de entregar tudo junto: o diff de ~1.000 linhas mistura
   refactor e feature, então se algo quebrar na receita o diagnóstico é mais
   lento do que seria com duas entregas. Foi uma escolha consciente.

2. **Os dois ids fixos** já são bug latente hoje (só não aparece porque há um
   formulário por vez). O lote os torna reais, e corrigi-los faz parte do
   escopo — não é refactor oportunista.

3. **Falha parcial** deixa receitas gravadas sem aviso claro de quais entraram.
   Aceito por consistência com a despesa; se incomodar, vira trabalho próprio
   para os dois modais.

4. **Contrato `onSave` muda** e os quatro chamadores quebram em compilação se
   algum for esquecido — o que é preferível a falhar em runtime.

5. **Re-render:** se o estado por receita não for para dentro do `IncomeForm`,
   digitar num item re-renderiza os irmãos. É a razão do handle imperativo na
   despesa, não uma escolha estética.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

As cinco perguntas da task foram respondidas pela investigação ou pelas
decisões registradas acima.

## Critérios de aceite do plano

- É possível adicionar mais de uma receita antes de salvar, e todas são
  gravadas
- Remover um item do meio do lote não embaralha os valores dos demais
- O rodapé mostra o total do lote, como na despesa
- Editar uma receita existente continua abrindo formulário único
- Campos condicionais de PJ continuam respeitando o tipo da conta
- Dois formulários abertos não disputam o input de criar cliente nem o de tipo
  de receita
- Os quatro chamadores do `IncomeDialog` foram atualizados
- `IncomeFormValues` e o payload gravado permanecem inalterados
- `tsc --noEmit` (frontend e backend), `npm test` (151) e `npm run build`
  passam
- Nenhuma migration executada

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Inspecionar `ExpenseDialog.tsx` e `ExpenseForm.tsx` antes de escrever: o
  padrão já está resolvido lá, incluindo os detalhes não óbvios do lote
- Não criar arquitetura paralela nem abstração genérica entre os dois formulários
- Nomenclatura nova em inglês: `IncomeForm`, `IncomeFormHandle`,
  `IncomeFormResumo`
- Não executar migrations (não há nenhuma nesta feature)
- Seguir `/AGENT.md` nas regras transversais; `frontend/AGENT.md` e
  `backend/AGENT.md` não existem neste projeto
- Este projeto vai direto para `main`, sem staging nem PR

---

## Registro da primeira tentativa (revertida)

Uma tentativa de implementação foi feita e **revertida a pedido do usuário**,
sem chegar a produção. O `IncomeDialog` não foi tocado; só o `IncomeForm` novo
chegou a existir, e foi removido.

O que ficou aprendido, para a retomada não repetir os mesmos passos:

### A extração é viável

O `IncomeForm` chegou a compilar limpo (975 linhas), com `getValues`,
`validate`, `reset`, `focus` e `onResumoChange` funcionando. O trabalho não é
impossível — é longo.

### Recortar por número de linha não funciona

Vários ciclos foram gastos corrigindo fechamento de JSX porque a fatia não
respeitava os limites reais dos containers. Na retomada, montar o componente
relendo a estrutura bloco a bloco, não recortando por índice.

### O que pertence ao pai, e não ao formulário

Descoberto ao compilar, e é o que mais custou tempo:

- o seletor de conta (`contas.length > 1`)
- o `error` vindo da mutation, exibido no rodapé
- o `</div>` que fecha o corpo rolável do modal
- `Escape` (fechar modal) e `Enter` (submeter) do `handleKeyDown` — só a
  navegação do autocomplete e o atalho do Tab são do formulário

### O que o formulário precisa receber

- `valoresIniciais` para semear o item do lote; `income` tem precedência na
  edição
- `guideEnabled`, senão N instâncias registram o mesmo card de primeiro acesso
- `autoFocus` condicional: num item do lote, roubaria o foco de quem digita
- `contaId` e `isEmpresa` por prop, derivados no pai

### Sobre a decisão de entregar tudo num commit

Foi ela que tornou o estado intermediário não-entregável: com o `IncomeForm`
pronto mas o `IncomeDialog` ainda intacto, o projeto ficava com duas cópias do
formulário e nenhum ganho.

**Recomendação para a retomada:** reconsiderar as duas etapas separadas, com a
extração indo para produção sozinha e validada antes do lote entrar.
