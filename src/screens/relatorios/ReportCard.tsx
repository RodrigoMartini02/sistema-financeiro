import { formatCurrency, formatDate } from '../finance/formatters';

interface ReportRow {
  id: number; tipo: 'despesa' | 'receita'; descricao: string; valor: number;
  data: string; categoria: string; forma: string; pago?: boolean;
}

export function ReportCard({ row }: { row: ReportRow }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={['h-1.5 w-1.5 shrink-0 rounded-full',
            row.tipo === 'receita' ? 'bg-green-500' : row.pago ? 'bg-slate-300' : 'bg-red-500'].join(' ')} />
          <span className={['truncate text-sm font-medium',
            row.pago && row.tipo === 'despesa' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'].join(' ')}>
            {row.descricao}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatDate(row.data)}</span>
          <span>·</span>
          <span>{row.categoria}</span>
          <span className="capitalize">· {row.forma}</span>
        </div>
      </div>
      <span className={['shrink-0 whitespace-nowrap text-sm font-bold',
        row.tipo === 'receita' ? 'text-green-700' : 'text-red-700'].join(' ')}>
        {row.tipo === 'receita' ? '+' : '-'}{formatCurrency(row.valor)}
      </span>
    </div>
  );
}
