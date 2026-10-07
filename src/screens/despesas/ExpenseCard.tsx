import { ArrowRight, Ban, CircleCheck, Paperclip, Pencil, Trash2 } from 'lucide-react';
import type { Expense } from '../../types/finance';
import { KebabMenu, type KebabMenuAction } from '../../ui/KebabMenu';
import { NomeComDetalhe } from '../../ui/NomeComDetalhe';
import { formatCurrency, formatDate } from '../finance/formatters';
import {
  formatDiferenca, getFirstName, getStatusColor, StatusBadge,
} from './expenseStatus';
import { effectiveExpenseValue, paymentDifference } from '../../utils/expenseValue';
import { expensePayButton, isInvoiceProtected, isRenegotiated, renegotiationNote } from '../../utils/cardInvoice';
import { EntryTypeBadge, getPaymentMethodLabel } from '../finance/entryTable';

interface ExpenseCardProps {
  item: Expense;
  isEmpresa: boolean;
  /** Abre a fatura que pagou ou renegociou a compra. */
  onOpenInvoice: () => void;
  onPay: () => void;
  onMoveToNextMonth: () => void;
  onCancel: () => void;
  onOpenAttachments: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExpenseCard({
  item, isEmpresa, onOpenInvoice, onPay, onMoveToNextMonth, onCancel, onOpenAttachments, onEdit, onDelete,
}: ExpenseCardProps) {
  const isCancelada = item.status === 'cancelada';
  // Paga ou renegociada pela fatura, ou gerada por ela: só muda desfazendo o pagamento da fatura.
  const isProtected = isInvoiceProtected(item);
  const payButton = expensePayButton(item);
  const note = renegotiationNote(item);
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
      label: payButton.label,
      icon: <CircleCheck size={15} />,
      onClick: onPay,
      disabled: payButton.disabled,
    },
    {
      key: 'mover',
      label: 'Mover para próximo mês',
      icon: <ArrowRight size={15} />,
      onClick: onMoveToNextMonth,
      disabled: item.pago || isCancelada,
    },
    {
      key: 'cancelar',
      label: isCancelada ? 'Já cancelada' : 'Cancelar',
      icon: <Ban size={15} />,
      onClick: onCancel,
      disabled: isCancelada || isProtected,
      tone: 'danger',
    },
    {
      key: 'excluir',
      label: 'Excluir',
      icon: <Trash2 size={15} />,
      onClick: onDelete,
      disabled: isProtected,
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
            <NomeComDetalhe principal={item.categoriaPai ?? item.categoria} detalhe={item.categoriaPai ? item.categoria : null} />
          </span>
          <span><NomeComDetalhe principal={getPaymentMethodLabel(item.formaPagamento)} detalhe={item.cartaoNome} /></span>
          {(item.pagadorNome ?? item.autorNome) && <span>· {getFirstName(item.pagadorNome ?? item.autorNome)}</span>}
          {item.pagadorId != null && item.autorId != null && item.pagadorId !== item.autorId && (
            <span>(cadastrado por {getFirstName(item.autorNome)})</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge item={item} />
          <EntryTypeBadge item={item} />
          {note && (
            <button
              type="button"
              onClick={onOpenInvoice}
              className="text-[11px] text-slate-400 underline decoration-dotted hover:text-[#0EC4D8]"
            >
              {note}
            </button>
          )}
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
          <span className={['whitespace-nowrap text-sm', getStatusColor(item)].join(' ')}>
            {formatCurrency(effectiveExpenseValue(item))}
          </span>
          {isRenegotiated(item) ? (
            <p className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              de {formatCurrency(item.valorFinal)}
            </p>
          ) : paymentDifference(item) !== null && (
            <p className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              {formatDiferenca(paymentDifference(item)!)}
            </p>
          )}
        </div>
        <KebabMenu actions={actions} />
      </div>
    </div>
  );
}
