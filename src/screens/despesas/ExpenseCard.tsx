import { ArrowRight, Ban, CircleCheck, Paperclip, Pencil, Trash2 } from 'lucide-react';
import type { Expense } from '../../types/finance';
import { KebabMenu, type KebabMenuAction } from '../../ui/KebabMenu';
import { formatCurrency, formatDate } from '../finance/formatters';
import { getFormaLabel, StatusBadge, TipoBadge } from './DespesasScreen';

interface ExpenseCardProps {
  item: Expense;
  isEmpresa: boolean;
  mesFechado: boolean;
  onPay: () => void;
  onMoveToNextMonth: () => void;
  onCancel: () => void;
  onOpenAttachments: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExpenseCard({
  item, isEmpresa, mesFechado, onPay, onMoveToNextMonth, onCancel, onOpenAttachments, onEdit, onDelete,
}: ExpenseCardProps) {
  const isCancelada = item.status === 'cancelada';
  const anexosCount = item.anexos?.length ?? 0;

  const actions: KebabMenuAction[] = [
    {
      key: 'editar',
      label: 'Editar',
      icon: <Pencil size={15} />,
      onClick: onEdit,
    },
    {
      key: 'pagar',
      label: item.pago ? 'Já pago' : mesFechado ? 'Mês fechado' : 'Marcar como pago',
      icon: <CircleCheck size={15} />,
      onClick: onPay,
      disabled: item.pago || mesFechado || isCancelada,
    },
    {
      key: 'mover',
      label: 'Mover para próximo mês',
      icon: <ArrowRight size={15} />,
      onClick: onMoveToNextMonth,
      disabled: item.pago || mesFechado || isCancelada,
    },
    {
      key: 'cancelar',
      label: isCancelada ? 'Já cancelada' : 'Cancelar',
      icon: <Ban size={15} />,
      onClick: onCancel,
      disabled: isCancelada,
      tone: 'danger',
    },
    {
      key: 'excluir',
      label: 'Excluir',
      icon: <Trash2 size={15} />,
      onClick: onDelete,
      tone: 'danger',
    },
  ];

  return (
    <div className={['flex items-start justify-between gap-3 px-4 py-3.5', isCancelada ? 'opacity-40 line-through' : item.pago ? 'opacity-70' : ''].join(' ')}>
      <div className="min-w-0 flex-1">
        <p className={['truncate text-sm font-semibold', item.pago ? 'text-slate-400' : 'text-slate-900 dark:text-white'].join(' ')}>
          {item.descricao}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatDate(item.dataVencimento)}</span>
          <span>·</span>
          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {item.categoria}
          </span>
          <span>{getFormaLabel(item.formaPagamento)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {isCancelada ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">Cancelada</span>
          ) : (
            <StatusBadge item={item} />
          )}
          <TipoBadge item={item} />
          {isEmpresa && item.numeroNf && (
            <span className="text-[11px] text-slate-400">NF {item.numeroNf}</span>
          )}
          {anexosCount > 0 && (
            <button
              onClick={onOpenAttachments}
              title={`${anexosCount} anexo(s)`}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-[#0EC4D8]/10 hover:text-[#0EC4D8] transition"
            >
              <Paperclip size={10} />
              {anexosCount}
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1">
        <span className={['whitespace-nowrap text-sm font-bold', item.pago ? 'text-slate-400 line-through' : 'text-red-700 dark:text-red-400'].join(' ')}>
          {formatCurrency(item.valorFinal)}
        </span>
        <KebabMenu actions={actions} />
      </div>
    </div>
  );
}
