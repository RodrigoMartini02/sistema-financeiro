import { useState, useEffect } from 'react';
import { CircleCheck } from 'lucide-react';
import { Dialog } from '../../ui/dialog';
import type { Expense } from '../../types/finance';

interface PaymentModalProps {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onConfirm: (dataPagamento: string, valorPago: number) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PaymentModal({ open, expense, onClose, onConfirm }: PaymentModalProps) {
  const [dataPagamento, setDataPagamento] = useState(today);
  const [valorPago, setValorPago] = useState('');

  useEffect(() => {
    if (open) {
      setDataPagamento(today());
      setValorPago('');
    }
  }, [open]);

  if (!expense) return null;

  const valorSugerido = expense.valorFinal;
  const valorPagoNum = valorPago !== '' ? parseFloat(valorPago.replace(',', '.')) : valorSugerido;
  const diferenca = Number.isFinite(valorPagoNum) ? valorPagoNum - valorSugerido : 0;

  function handleConfirm() {
    const vp = valorPago !== '' ? parseFloat(valorPago.replace(',', '.')) : valorSugerido;
    if (!Number.isFinite(vp) || vp <= 0) return;
    onConfirm(dataPagamento, vp);
  }

  return (
    <Dialog
      open={open}
      title="Confirmar Pagamento"
      description={expense.descricao}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Data de Pagamento
            </label>
            <input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0EC4D8] focus:ring-2 focus:ring-[#0EC4D8]/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Valor Pago
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder={valorSugerido.toFixed(2)}
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0EC4D8] focus:ring-2 focus:ring-[#0EC4D8]/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        </div>

        {/* Diferença */}
        {valorPago !== '' && Number.isFinite(valorPagoNum) && diferenca !== 0 && (
          <div className={[
            'rounded-xl px-4 py-2.5 text-sm font-medium',
            diferenca < 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          ].join(' ')}>
            {diferenca < 0
              ? `Economia de ${fmt(Math.abs(diferenca))}`
              : `Acréscimo de ${fmt(diferenca)}`}
          </div>
        )}

        {/* Resumo */}
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-700/50">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Valor original</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{fmt(valorSugerido)}</span>
          </div>
          {expense.dataVencimento && (
            <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Vencimento</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {new Date(expense.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[14px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 rounded-[14px] bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <CircleCheck size={16} />
            Confirmar Pagamento
          </button>
        </div>
      </div>
    </Dialog>
  );
}
