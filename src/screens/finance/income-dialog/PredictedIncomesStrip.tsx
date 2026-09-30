import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../../../context/ConfirmContext';
import { fetchFinanceDashboard, receberReceita } from '../../../services/financeService';
import { invalidateIncomeQueries, queryKeys } from '../../../services/queryKeys';
import type { Income } from '../../../types/finance';
import { C } from '../../../ui/dialogFormTokens';
import { isoToBrDate } from '../../../utils/date';
import { formatCurrency } from '../formatters';
import { ellipsisStyle } from '../entry-dialog/fieldStyles';

/**
 * Receitas previstas do mês da data que está sendo lançada (vindas de contrato ou
 * de receita fixa). Só informa, para não lançar de novo o que já está previsto,
 * e deixa confirmar o recebimento ali mesmo.
 */
export function PredictedIncomesStrip({ receiptIso }: { receiptIso: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [year, month] = receiptIso.split('-').map(Number);
  const monthIndex = month! - 1;
  const monthQuery = useQuery({
    queryKey: queryKeys.dashboard(monthIndex, year!),
    queryFn: () => fetchFinanceDashboard(monthIndex, year!),
    staleTime: 60_000,
  });
  const receive = useMutation({
    mutationFn: receberReceita,
    onSuccess: () => invalidateIncomeQueries(qc),
  });

  const predicted = (monthQuery.data?.incomes ?? []).filter((item) => item.status === 'prevista' || item.status === 'faturada');
  if (predicted.length === 0) return null;

  const confirmReceipt = async (item: Income) => {
    const ok = await confirm({
      title: 'Confirmar recebimento',
      message: `Confirmar recebimento de "${item.descricao}"?`,
      confirmLabel: 'Confirmar',
      variant: 'default',
    });
    if (ok) receive.mutate(item.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 8px 12px', fontSize: 12, color: C.textSoft }}>
      <span>Já previstas neste mês:</span>
      {predicted.map((item) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={ellipsisStyle}>
            {item.descricao} · {isoToBrDate(item.data)} · {formatCurrency(item.valor)}
          </span>
          <button
            type="button"
            onClick={() => void confirmReceipt(item)}
            disabled={receive.isPending}
            style={{ flex: 'none', border: 'none', background: 'transparent', padding: 0, fontSize: 12, fontWeight: 600, color: C.primaryDark, cursor: 'pointer' }}
          >
            Confirmar recebimento
          </button>
        </div>
      ))}
    </div>
  );
}
