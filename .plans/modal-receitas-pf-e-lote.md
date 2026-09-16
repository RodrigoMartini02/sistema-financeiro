# Modal de receitas: esconder "Cliente / fonte" em PF e permitir lote

## Melhoria 1 — "Cliente / fonte" não aparece em conta PF

### O problema

`IncomeDialog.tsx:532` renderiza o campo "Cliente / fonte" sempre, sem checar
o tipo da conta. Numa conta pessoal, não há cliente: o campo pede algo que não
existe naquele contexto.

### Por que é uma inconsistência, não uma decisão

O modal **já** esconde os outros campos de PJ pelo mesmo critério:

| Campo | Linha | Condicional |
|---|---|---|
| Tipo de receita | 592 | `isEmpresa &&` |
| Representante | 656 | `isEmpresa &&` |
| Produtos | 720 | `isNew && isEmpresa &&` |
| **Cliente / fonte** | **532** | **nenhuma** |

E `isEmpresa` já está calculado na linha 59, com fallback em
`localStorage.getItem('contaAtivaTipo')` — o mesmo critério do modal de
despesa. As queries de cliente já são `enabled: open && isEmpresa` (linha 119),
ou seja: em PF a lista nem é buscada, mas o campo aparece vazio mesmo assim.

### Mudança

Envolver o bloco do campo (linha 531-553, incluindo o `datalist` e o aviso de
"Cliente não cadastrado") em `{isEmpresa && (...)}`.

Cuidado: a validação `clienteValido` e o estado `clienteTocado` precisam
continuar coerentes em PF — um campo que não aparece não pode bloquear o
salvamento. Verificar se `clienteValido` é usado como condição de submit.

---

## Melhoria 2 — Lançar receitas em lote

### A diferença estrutural

Aqui está o que define o tamanho do trabalho:

| | Despesa | Receita |
|---|---|---|
| Orquestrador | `ExpenseDialog.tsx` (389 linhas) | — |
| Formulário reutilizável | `ExpenseForm.tsx` (1023 linhas) | **não existe** |
| Total | 1412 linhas em 2 arquivos | **960 linhas em 1 arquivo** |

A despesa suporta lote porque o formulário foi **extraído em componente
próprio**, instanciado uma vez por item do lote. A receita faz tudo num arquivo
só: não há o que instanciar N vezes.

### O que o lote exige

`ExpenseDialog` coordena os itens por um handle imperativo
(`ExpenseForm.tsx:71`):

```ts
interface ExpenseFormHandle {
  getValues: () => ExpenseFormValues | null;
  validate: () => Promise<boolean>;
  reset: () => void;
  focus: () => void;
}
```

Mais um `onResumoChange` para o pai saber o total e detectar duplicatas sem
espelhar estado a cada tecla.

Para a receita ter lote, é preciso o equivalente: **extrair `IncomeForm`** de
dentro do `IncomeDialog`, com `IncomeFormHandle` e `IncomeFormResumo`, e
transformar o `IncomeDialog` em orquestrador.

### Estratégia

1. **Extrair `IncomeForm.tsx`** do `IncomeDialog`, sem mudar comportamento:
   mesmo formulário, mesmos campos, mesma validação — só movido para um
   componente com `forwardRef` e handle imperativo. É o passo grande, e é
   refactor puro: o modal continua funcionando igual, com um item só.
2. **`IncomeDialog` vira orquestrador**, espelhando o `ExpenseDialog`: lista de
   itens, botão "Adicionar", resumo do lote, submit de todos.

Fazer nessa ordem importa: se a extração quebrar algo, quebra antes de o lote
entrar, e o diagnóstico é direto.

### Reaproveitar o padrão, não inventar outro

O `ExpenseDialog` já resolveu os problemas não óbvios do lote — ids só para a
chave do React (`ItemLote`, linha 15), `Map` de refs por id, contador em `ref`
e não em `state`. O `IncomeDialog` deve seguir a mesma forma, para quem lê um
entender o outro.

## Ordem de entrega

A melhoria 1 é pequena e isolada; a 2 é um refactor de ~960 linhas seguido de
uma feature. Sugestão: **entregar a 1 primeiro**, validar na tela, e só então a
extração do formulário.

Se as duas forem juntas, o diff da melhoria 1 se perde no meio do refactor.

## Testes

Frontend não tem runner. Garantia por `tsc --noEmit`, `vite build` e teste na
tela:

- **PF:** abrir o modal de receita e confirmar que "Cliente / fonte" não
  aparece, e que salvar continua funcionando
- **PJ:** o campo continua presente e obrigatório como hoje
- **Lote:** adicionar duas receitas, conferir o total, remover uma, salvar

Backend (151 atuais): sem mudança esperada — nenhum dos dois pontos toca rota
ou gravação. `contaId` e os campos de receita já existem.

## Risco

**Melhoria 1:** baixo. Uma condicional, no mesmo padrão dos campos vizinhos. O
ponto de atenção é a validação não travar o submit em PF.

**Melhoria 2:** médio. Extrair 960 linhas para um componente com handle
imperativo mexe em todo o formulário de receita — inclusive em partes
sensíveis como a criação de cliente e a sugestão de tipo de receita. É refactor
sem rede de teste automatizado.

## Fora do escopo

- Mudar campos ou validações da receita
- Lote no modal de despesa (já existe)
- Unificar `ExpenseForm` e `IncomeForm` num componente genérico: os campos
  divergem demais, e a abstração custaria mais que os dois separados
