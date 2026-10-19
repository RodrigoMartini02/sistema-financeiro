import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDashboardQuery } from '../../../hooks/useFinanceDashboard';
import { receberReceita } from '../../../services/financeService';
import { invalidateIncomeQueries } from '../../../services/queryKeys';
import type { Income } from '../../../types/finance';
import { C } from '../../../ui/dialogFormTokens';
import { isoToBrDate } from '../../../utils/date';
import { formatCurrency } from '../formatters';
import { ellipsisStyle } from '../entry-dialog/fieldStyles';
import { ReceiptDateDialog } from '../ReceiptDateDialog';

/**
 * Receitas previstas do mês da data que está sendo lançada (vindas de contrato ou
 * de receita fixa). Só informa, para não lançar de novo o que já está previsto,
 * e deixa confirmar o recebimento ali mesmo.
 */
export function PredictedIncomesStrip({ receiptIso }: { receiptIso: string }) {
  const qc = useQueryClient();
  const [year, month] = receiptIso.split('-').map(Number);
  const monthIndex = month! - 1;
  const monthQuery = useDashboardQuery(monthIndex, year!);
  // Confirmar pede a data do recebimento: a receita conta no mês dela (regime de caixa).
  const [confirming, setConfirming] = useState<Income | null>(null);
  const receive = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => receberReceita(id, date),
    onSuccess: () => {
      invalidateIncomeQueries(qc);
      setConfirming(null);
    },
  });

  const predicted = (monthQuery.data?.incomes ?? []).filter((item) => item.status === 'prevista' || item.status === 'faturada');
  if (predicted.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 8px 12px', fontSize: 12, color: C.textSoft }}>
      <span>Já previstas neste mês:</span>
      {predicted.map((item) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={ellipsisStyle}>
            {item.descricao} · {isoToBrDate(item.data)} · {formatCurrency(item.valorLiquido)}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(item)}
            disabled={receive.isPending}
            style={{ flex: 'none', border: 'none', background: 'transparent', padding: 0, fontSize: 12, fontWeight: 600, color: C.primaryDark, cursor: 'pointer' }}
          >
            Confirmar recebimento
          </button>
        </div>
      ))}
      <ReceiptDateDialog
        open={confirming !== null}
        description={confirming?.descricao ?? ''}
        plannedDate={confirming?.data ?? receiptIso}
        isLoading={receive.isPending}
        error={receive.isError ? 'Não foi possível confirmar o recebimento. Tente novamente.' : null}
        onConfirm={(date) => { if (confirming) receive.mutate({ id: confirming.id, date }); }}
        onClose={() => { receive.reset(); setConfirming(null); }}
      />
    </div>
  );
}
