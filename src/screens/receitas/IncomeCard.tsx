import { AlertCircle, Ban, CheckCircle, Clock, Paperclip, Pencil, Tag } from 'lucide-react';
import type { Income } from '../../types/finance';
import { KebabMenu, type KebabMenuAction } from '../../ui/KebabMenu';
import { formatCurrency, formatDate } from '../finance/formatters';

const TIPO_COLORS: Record<string, string> = {
  salario:       'bg-green-100 text-green-700',
  freelance:     'bg-blue-100 text-blue-700',
  investimento:  'bg-purple-100 text-purple-700',
  aluguel:       'bg-amber-100 text-amber-700',
  comissao:      'bg-orange-100 text-orange-700',
  outros:        'bg-slate-100 text-slate-600',
};

export function tipoBadge(tipo?: string | null) {
  if (!tipo) return null;
  const cls = TIPO_COLORS[tipo.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {tipo}
    </span>
  );
}

interface IncomeCardProps {
  item: Income;
  hoje: string;
  onConfirmRecebimento: () => void;
  onCancel: () => void;
  onOpenAttachments: () => void;
  onEdit: () => void;
}

export function IncomeCard({ item, hoje, onConfirmRecebimento, onCancel, onOpenAttachments, onEdit }: IncomeCardProps) {
  const isPrevista = item.status === 'prevista';
  const isAtrasada = isPrevista && item.data < hoje;
  const isCancelada = item.status === 'cancelada';
  const anexosCount = item.anexos?.length ?? 0;

  const actions: KebabMenuAction[] = [
    { key: 'editar', label: 'Editar', icon: <Pencil size={15} />, onClick: onEdit },
    ...(isPrevista
      ? [{ key: 'confirmar', label: 'Confirmar recebimento', icon: <CheckCircle size={15} />, onClick: onConfirmRecebimento }]
      : [{ key: 'cancelar', label: isCancelada ? 'Já cancelada' : 'Cancelar', icon: <Ban size={15} />, onClick: onCancel, disabled: isCancelada, tone: 'danger' as const }]),
  ];

  return (
    <div className={[
      'flex items-start justify-between gap-3 px-4 py-3.5',
      isCancelada ? 'opacity-50' : '',
      isPrevista ? 'border-l-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20' : '',
      isAtrasada ? 'border-l-2 border-red-300 bg-red-50/30 dark:bg-red-950/20' : '',
    ].join(' ')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.descricao}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatDate(item.data)}</span>
          {item.representanteNome ? (
            <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium">
              <Tag size={11} className="shrink-0" /> {item.representanteNome}
            </span>
          ) : item.cliente ? (
            <span className="flex items-center gap-1">
              <Tag size={11} className="shrink-0 text-slate-400" /> {item.cliente}
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {isCancelada && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">Cancelada</span>
          )}
          {isPrevista && !isAtrasada && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
              <Clock size={9} /> Prevista
            </span>
          )}
          {isAtrasada && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
              <AlertCircle size={9} /> Em atraso
            </span>
          )}
          {tipoBadge(item.tipoReceita)}
          {item.valorComissao && item.valorComissao > 0 && (
            <span className="text-[11px] font-semibold text-amber-600">comissão {formatCurrency(item.valorComissao)}</span>
          )}
          {anexosCount > 0 && (
            <button
              onClick={onOpenAttachments}
              title={`${anexosCount} anexo(s)`}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-brand-100 hover:text-brand-700 transition"
            >
              <Paperclip size={10} />
              {anexosCount}
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1">
        <span className="whitespace-nowrap text-sm font-bold text-green-700 dark:text-green-400">
          {formatCurrency(item.valor)}
        </span>
        <KebabMenu actions={actions} />
      </div>
    </div>
  );
}
