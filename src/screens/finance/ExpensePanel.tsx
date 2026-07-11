import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Expense } from '../../types/finance';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { EmptyState } from '../../ui/states';
import { formatCurrency, formatDate } from './formatters';

interface ExpensePanelProps {
  items: Expense[];
  onAdd: () => void;
  onEdit: (item: Expense) => void;
  onDelete: (item: Expense) => void;
  isDeleting: boolean;
}

export function ExpensePanel({ items, onAdd, onEdit, onDelete, isDeleting }: ExpensePanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Despesas</h3>
          <Badge tone="expense">{items.length} lançamento(s)</Badge>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
        >
          <Plus size={13} /> Nova despesa
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma despesa" description="Nenhuma despesa registrada neste mês." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {item.descricao}
                  {item.parcela && <span className="ml-1 text-xs text-slate-400">({item.parcela})</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(item.dataVencimento)} · {item.categoria}
                  {item.pago && <span className="ml-1 text-green-600">· Pago</span>}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-bold text-red-700">{formatCurrency(item.valorFinal ?? 0)}</span>
              <div className="flex items-center gap-1">
                {(item.anexos?.length ?? 0) > 0 && (
                  <button
                    onClick={() => onEdit(item)}
                    title={`${item.anexos!.length} anexo(s)`}
                    className="flex items-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition"
                  >
                    <Paperclip size={11} />
                    {item.anexos!.length}
                  </button>
                )}
                <button onClick={() => onEdit(item)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDelete(item)} disabled={isDeleting} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
