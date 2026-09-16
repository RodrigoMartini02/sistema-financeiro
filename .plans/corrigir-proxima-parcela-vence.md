# Corrigir "próxima vence" em despesa parcelada

## O problema

No modal de despesa parcelada, o rodapé mostra a próxima parcela a vencer com
data errada. No caso reportado — 6 parcelas, 4 já pagas, primeira vencendo
10/06/2026 — a tela mostrou **10/07** quando o correto é **10/10**.

## A causa

`ExpenseForm.tsx:937` registra o campo como texto, sem conversão:

```tsx
<input {...form.register('parcelasJaPagas')} type="text" inputMode="numeric" ... />
```

O `useWatch` entrega a **string** `"4"`. O cálculo em `ExpenseForm.tsx:441`
trata como número:

```ts
d.setMonth(d.getMonth() + (parcelasJaPagas ?? 0));
```

`setMonth` com string **concatena** em vez de somar. Verificado:

| Valor do campo | Tipo | Resultado |
|---|---|---|
| `4` | number | 10/10/2026 ✓ |
| `"4"` | string | **10/07/2030** ✗ |
| `"0"` | string | **10/03/2030** ✗ |
| `""` | string | 10/06/2026 |

Com `"4"`, o mês vira `5 + "4"` = `"54"`, jogando a data para 2030. O `??`
não protege: string vazia e `"0"` não são nullish.

O zod tem `z.coerce.number()` (`ExpenseForm.tsx:40`), mas ele só age no
**submit** — o que a tela mostra enquanto se digita vem do watch, cru.

## Por que passou despercebido

O valor gravado no banco está **correto**: o backend recebe o número já
coagido pelo zod, e `createFutureInstallments` (`expenses.ts:73-89`) gera as
parcelas certas. Só o texto do rodapé mente.

Confirmado por simulação da lógica do backend com os dados do caso:

```
parcela 1: 10/06  PAGA      parcela 4: 10/09  PAGA
parcela 2: 10/07  PAGA      parcela 5: 10/10  em aberto  ← a próxima
parcela 3: 10/08  PAGA      parcela 6: 10/11  em aberto
```

## A correção

Converter o valor antes de usar, em vez de confiar no tipo do watch:

```ts
const jaPagas = Number(parcelasJaPagas) || 0;
d.setMonth(d.getMonth() + jaPagas);
```

`Number("") === 0` e `Number("abc")` é `NaN`, ambos absorvidos pelo `|| 0` —
o que cobre campo vazio e digitação parcial, que hoje produzem datas absurdas.

### Verificar os outros usos do mesmo watch

`parcelasJaPagas` é lido em três lugares além do cálculo:

- `:381` — limite ao reduzir parcelas: `(parcelasJaPagas ?? 0) > max` compara
  string com número; `"10" > 5` é `true` por coerção do `>`, mas `"4" > 10`
  também funciona por acaso. Vale converter para não depender de coerção.
- `:454` — rótulo "N pagas": só exibe, sem aritmética. Seguro.
- `:462` — dependência de `useMemo`. Seguro.

A conversão deve ser feita **uma vez**, num derivado, e reutilizada — não
espalhada em cada uso.

## Fora do escopo

- Trocar o campo para `type="number"`: mudaria o comportamento de digitação
  (setas, roda do mouse) que foi escolhido deliberadamente com
  `inputMode="numeric"`
- Alterar o que é gravado no banco: já está correto
- Mexer na geração de parcelas do backend
- O mesmo padrão em outros campos numéricos do formulário — se houver, é
  trabalho próprio, com verificação caso a caso

## Testes

Backend (151 atuais): sem impacto. O valor que chega ao servidor já é número,
e a geração de parcelas não muda.

Frontend não tem runner. Verificação na tela:

- 6 parcelas, 4 já pagas, vencimento 10/06 → rodapé deve dizer **10/10**
- apagar o campo (vazio) → deve cair para a data base, sem saltar de ano
- digitar 0 → mesma data base
- reduzir o total de parcelas abaixo das já pagas → o ajuste automático
  continua funcionando

## Risco

Baixo. Uma conversão de tipo num cálculo de exibição. Nada do que é gravado
muda, e o backend não é tocado.
