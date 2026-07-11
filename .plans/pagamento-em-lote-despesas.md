# Plano de Implementação: Pagamento em Lote — Despesas

## Origem

- Data do planejamento: `2026-07-03`
- Classificação: `frontend-only`

## Resumo

Adicionar seleção múltipla de despesas e pagamento em lote na tela de Despesas React. O backend já possui `POST /despesas/:id/pagar`; o lote é N chamadas sequenciais. O usuário seleciona via checkboxes, uma barra de ação aparece, e o modal oferece duas abas: pagar todas com valor original de cada uma, ou definir valor personalizado por despesa.

## Escopo

### Dentro do escopo

- Coluna de checkbox (40 px) como primeira coluna da tabela
- Checkbox "selecionar todas" no `<th>` — seleciona apenas despesas não pagas e visíveis (filtradas)
- Estado `selecionadas: Set<number>` (IDs) em `DespesasScreen`
- Barra de ação acima da tabela quando `selecionadas.size > 0`: contagem + "Pagar selecionadas" + "Desmarcar"
- Novo `BatchPaymentModal` com:
  - Aba "Valor original": campo de data + lista resumida read-only + confirmar
  - Aba "Valor personalizado": campo de data + tabela com input de valor editável por despesa + confirmar
- Chamada sequencial a `pagarDespesa(id, data, valor)` para cada despesa selecionada
- Toast de sucesso/erro parcial após conclusão
- Limpeza da seleção + invalidação do dashboard após sucesso
- Mês fechado: checkboxes desabilitados, barra de ação não renderizada

### Fora do escopo

- Endpoint batch no backend
- Comprovante em lote (usa Anexos individualmente)
- Paginação server-side
- Relatórios de lote

## Arquivos afetados

- `src/screens/despesas/DespesasScreen.tsx` — checkbox column, select-all, barra de ação, estado selecionadas, abertura do BatchPaymentModal
- `src/screens/finance/BatchPaymentModal.tsx` *(novo)* — modal com tabs

## Estratégia de implementação

1. Criar `src/screens/finance/BatchPaymentModal.tsx`
2. Atualizar `src/screens/despesas/DespesasScreen.tsx`:
   - Adicionar estado `selecionadas` e `batchModal`
   - Adicionar col checkbox (40 px) no `<colgroup>`
   - Adicionar `<th>` checkbox select-all
   - Adicionar `<td>` checkbox por linha (disabled para pagas e mês fechado)
   - Renderizar barra de ação abaixo do toolbar quando `selecionadas.size > 0`
   - Importar e renderizar `<BatchPaymentModal>`
3. Rodar build de validação

## Regras de negócio

- Só `!item.pago` pode ser selecionado; checkbox de itens pagos fica `disabled`
- "Selecionar todas" marca apenas as não pagas dos itens filtrados visíveis
- Mês fechado (`mesFechado === true`): checkboxes e barra de ação ficam ocultos/desabilitados
- Aba "Valor personalizado": campo vazio usa `valorFinal` da despesa como fallback
- Falha parcial: registrar quantas foram processadas com sucesso antes do erro; mostrar toast descritivo

## BatchPaymentModal — Especificação

```ts
interface BatchPaymentModalProps {
  open: boolean;
  expenses: Expense[];   // apenas as selecionadas não pagas
  onClose: () => void;
  onSuccess: () => void;
}
```

Estado interno:
- `tab: 'original' | 'personalizado'` (default: 'original')
- `dataPagamento: string` (default: today `YYYY-MM-DD`)
- `valoresPorId: Record<number, string>` — inputs da aba personalizado
- `loading: boolean`
- `erro: string | null`

Layout:
- Header: "Pagamento em lote — N despesas"
- Tab switcher: "Valor original" / "Valor personalizado"
- Aba original: date input + lista leve (descrição + valor) read-only
- Aba personalizado: date input + tabela com `<input type="number">` por despesa
- Footer: Cancelar + Confirmar (disabled quando `loading`)

Confirm handler:
```ts
setLoading(true);
let ok = 0;
for (const expense of expenses) {
  const valor = tab === 'original'
    ? expense.valorFinal
    : parseFloat(valoresPorId[expense.id] || String(expense.valorFinal));
  try {
    await pagarDespesa(expense.id, dataPagamento, valor);
    ok++;
  } catch {
    setErro(`Falha após ${ok} pagamento(s). Verifique as demais.`);
    break;
  }
}
if (ok === expenses.length) {
  onSuccess();
  onClose();
}
setLoading(false);
```

## Validações

- `dataPagamento` obrigatório (campo date não pode ficar vazio)
- `valor` > 0 para cada despesa (aba personalizado)
- Barra de ação só aparece quando `selecionadas.size > 0`

## Critérios de aceite

- Checkbox aparece em cada linha não paga
- "Selecionar todas" seleciona apenas não pagas visíveis
- Barra de ação aparece com contagem correta
- Modal abre com aba "Valor original" ativa
- Aba "Valor personalizado" mostra input editável por despesa
- Confirmar chama `pagarDespesa` N vezes sequencialmente
- Após sucesso: modal fecha, seleção limpa, dashboard invalida
- Falha parcial: modal mantém aberto, erro exibido com contagem
- Build TypeScript passa sem erros

## Observações para implementar

- Reutilizar `pagarDespesa` de `financeService.ts` já existente
- Reutilizar estilo de `PaymentModal.tsx` para consistência visual
- Usar `queryKeys` centralizado para invalidação
- Backend: sem alterações
- Não executar migrations
- Não alterar `.env`
