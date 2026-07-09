import { useState, useEffect } from 'react';
import { CircleCheck, AlertCircle } from 'lucide-react';
import { Dialog } from '../../ui/dialog';
import { pagarDespesa } from '../../services/financeService';
import type { Expense } from '../../types/finance';
import { formatCurrency } from './formatters';

interface BatchPaymentModalProps {
  open: boolean;
  expenses: Expense[];
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'original' | 'personalizado';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function BatchPaymentModal({ open, expenses, onClose, onSuccess }: BatchPaymentModalProps) {
  const [tab, setTab] = useState<Tab>('original');
  const [dataPagamento, setDataPagamento] = useState(todayStr);
  const [valoresPorId, setValoresPorId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab('original');
      setDataPagamento(todayStr());
      setValoresPorId({});
      setLoading(false);
      setErro(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!dataPagamento) return;
    setLoading(true);
    setErro(null);
    let ok = 0;
    for (const expense of expenses) {
      const rawVal = tab === 'original'
        ? expense.valorFinal
        : parseFloat((valoresPorId[expense.id] ?? '').replace(',', '.') || String(expense.valorFinal));
      const valor = Number.isFinite(rawVal) && rawVal > 0 ? rawVal : expense.valorFinal;
      try {
        await pagarDespesa(expense.id, dataPagamento, valor);
        ok++;
      } catch {
        setErro(`Erro após ${ok} de ${expenses.length} pagamento(s). Verifique as demais despesas.`);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onSuccess();
    onClose();
  }

  const totalOriginal = expenses.reduce((s, e) => s + e.valorFinal, 0);
  const totalPersonalizado = expenses.reduce((s, e) => {
    const v = parseFloat((valoresPorId[e.id] ?? '').replace(',', '.'));
    return s + (Number.isFinite(v) && v > 0 ? v : e.valorFinal);
  }, 0);

  return (
    <Dialog
      open={open}
      title={`Pagamento em lote — ${expenses.length} despesa(s)`}
      onClose={() => { if (!loading) onClose(); }}
    >
      <div className="flex flex-col gap-4">
        {/* Tab switcher */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden dark:border-slate-600">
          <button
            type="button"
            onClick={() => setTab('original')}
            className={[
              'flex-1 py-2 text-xs font-semibold transition',
              tab === 'original'
                ? 'bg-[#0EC4D8] text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            Valor original
          </button>
          <button
            type="button"
            onClick={() => setTab('personalizado')}
            className={[
              'flex-1 py-2 text-xs font-semibold transition',
              tab === 'personalizado'
                ? 'bg-[#0EC4D8] text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            Valor personalizado
          </button>
        </div>

        {/* Date input */}
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

        {/* Expenses list */}
        <div className="flex flex-col gap-0 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden max-h-56 overflow-y-auto">
          {tab === 'original' ? (
            expenses.map((e, i) => (
              <div
                key={e.id}
                className={[
                  'flex items-center justify-between px-3 py-2.5 text-sm',
                  i % 2 === 0
                    ? 'bg-white dark:bg-slate-800'
                    : 'bg-slate-50 dark:bg-slate-800/60',
                ].join(' ')}
              >
                <span className="text-slate-700 dark:text-slate-200 truncate max-w-[260px]">{e.descricao}</span>
                <span className="font-semibold text-red-700 dark:text-red-400 shrink-0 ml-3">
                  {formatCurrency(e.valorFinal)}
                </span>
              </div>
            ))
          ) : (
            expenses.map((e, i) => (
              <div
                key={e.id}
                className={[
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  i % 2 === 0
                    ? 'bg-white dark:bg-slate-800'
                    : 'bg-slate-50 dark:bg-slate-800/60',
                ].join(' ')}
              >
                <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{e.descricao}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={e.valorFinal.toFixed(2)}
                  value={valoresPorId[e.id] ?? ''}
                  onChange={(ev) =>
                    setValoresPorId((prev) => ({ ...prev, [e.id]: ev.target.value }))
                  }
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm text-slate-800 outline-none focus:border-[#0EC4D8] focus:ring-1 focus:ring-[#0EC4D8]/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            ))
          )}
        </div>

        {/* Total summary */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 px-4 py-3 flex justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total a pagar</span>
          <span className="font-bold text-red-700 dark:text-red-400">
            {formatCurrency(tab === 'original' ? totalOriginal : totalPersonalizado)}
          </span>
        </div>

        {/* Error */}
        {erro && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-[14px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !dataPagamento}
            className="inline-flex items-center gap-2 rounded-[14px] bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
          >
            <CircleCheck size={16} />
            {loading ? 'Processando...' : `Pagar ${expenses.length} despesa(s)`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
