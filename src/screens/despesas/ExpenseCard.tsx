import { ArrowRight, Ban, CircleCheck, Paperclip, Pencil, Trash2 } from 'lucide-react';
import type { Expense } from '../../types/finance';
import { KebabMenu, type KebabMenuAction } from '../../ui/KebabMenu';
import { formatCurrency, formatDate } from '../finance/formatters';
import {
  diferencaValor, formatDiferenca, getFormaLabel, getStatusColor,
  StatusBadge, TipoBadge, valorExibido,
} from './DespesasScreen';

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
          {/* Categoria em texto com hierarquia, sem chip — mesmo criterio da
              tabela: a cor da categoria nao e configuravel em nenhuma tela. */}
          <span className="truncate">
            {item.categoriaPai && <span className="text-[11px] text-slate-400 dark:text-slate-500">{item.categoriaPai} › </span>}
            {item.categoria}
          </span>
          <span>{getFormaLabel(item.formaPagamento)}{item.cartaoNome ? ` · ${item.cartaoNome}` : ''}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge item={item} />
          <TipoBadge item={item} />
          {isEmpresa && item.numeroNf && (
            <span className="text-[11px] text-slate-400">NF {item.numeroNf}</span>
          )}
          {anexosCount > 0 && (
            <button
              onClick={onOpenAttachments}
              title={`${anexosCount} anexo(s)`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#0EC4D8] transition"
            >
              <Paperclip size={11} />
              {anexosCount}
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1">
        {/* Um valor so, na cor do estado — mesmo criterio da tabela. O "inicial"
            aparecia mesmo quando igual ao final, repetindo o numero. */}
        <div className="flex flex-col items-end">
          <span className={['whitespace-nowrap text-sm font-semibold', getStatusColor(item)].join(' ')}>
            {formatCurrency(valorExibido(item))}
          </span>
          {diferencaValor(item) !== null && (
            <p className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              {formatDiferenca(diferencaValor(item)!)}
            </p>
          )}
        </div>
        <KebabMenu actions={actions} />
      </div>
    </div>
  );
}
