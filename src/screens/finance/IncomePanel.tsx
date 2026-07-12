import { CheckCircle, Clock, AlertCircle, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Income } from '../../types/finance';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { EmptyState } from '../../ui/states';
import { formatCurrency, formatDate } from './formatters';

interface IncomePanelProps {
  items: Income[];
  onAdd: () => void;
  onEdit: (item: Income) => void;
  onDelete: (item: Income) => void;
  onReceberImplantacao?: (item: Income) => void;
  isDeleting: boolean;
}

function implantacaoStatus(item: Income): 'pendente' | 'atrasado' | 'recebido' | null {
  if (item.tipoReceita !== 'Implantação' || !item.contratoId) return null;
  if (item.status === 'ativa') return 'recebido';
  if (item.status === 'prevista') {
    const hoje = new Date().toISOString().slice(0, 10);
    return item.data < hoje ? 'atrasado' : 'pendente';
  }
  return null;
}

const STATUS_CONFIG = {
  pendente:  { label: 'Pendente',  icon: Clock,         cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  atrasado:  { label: 'Atrasado',  icon: AlertCircle,   cls: 'bg-red-50 text-red-700 border-red-200' },
  recebido:  { label: 'Recebido',  icon: CheckCircle,   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
} as const;

export function IncomePanel({ items, onAdd, onEdit, onDelete, onReceberImplantacao, isDeleting }: IncomePanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Receitas</h3>
          <Badge tone="income">{items.length} lançamento(s)</Badge>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
        >
          <Plus size={13} /> Nova receita
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma receita" description="Cadastre uma receita para compor o saldo do mês." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const implStatus = implantacaoStatus(item);
            const statusCfg = implStatus ? STATUS_CONFIG[implStatus] : null;
            const StatusIcon = statusCfg?.icon;

            return (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.descricao}</p>
                    {statusCfg && StatusIcon && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusCfg.cls}`}>
                        <StatusIcon size={10} />
                        {statusCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDate(item.data)}{item.cliente ? ` · ${item.cliente}` : ''}
                  </p>
                </div>
                <span className="whitespace-nowrap text-sm font-bold text-green-700">{formatCurrency(item.valor)}</span>
                <div className="flex items-center gap-1">
                  {implStatus && implStatus !== 'recebido' && onReceberImplantacao && (
                    <button
                      onClick={() => onReceberImplantacao(item)}
                      title="Marcar como recebido"
                      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition"
                    >
                      <CheckCircle size={11} /> Receber
                    </button>
                  )}
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
            );
          })}
        </ul>
      )}
    </Card>
  );
}
