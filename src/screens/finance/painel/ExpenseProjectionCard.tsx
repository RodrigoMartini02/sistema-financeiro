import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CardPainel, NumeroAnimado, Rotulo, Secao } from './base';

interface ExpenseProjectionCardProps {
  projection: NonNullable<PainelData['expenseProjection']>;
}

/** Estimativas têm espaço próprio: não alteram os indicadores de dinheiro já lançado. */
export function ExpenseProjectionCard({ projection }: ExpenseProjectionCardProps) {
  const future = projection.planned + projection.scheduled;
  const items = [
    { label: 'Confirmadas', amount: projection.confirmed, detail: 'Inclui as pagas e as contas confirmadas em aberto.' },
    {
      label: 'Previsões e agendadas', amount: future,
      detail: projection.plannedCount > 0
        ? `${projection.plannedCount} ${projection.plannedCount === 1 ? 'previsão de fixa aguarda' : 'previsões de fixas aguardam'} confirmação do valor.`
        : 'Compromissos agendados que ainda não entraram nas somas atuais.',
    },
    { label: 'Total projetado', amount: projection.total, detail: 'Confirmadas + previsões e agendadas, uma vez cada conta.' },
  ];
  return (
    <Secao titulo="Projeção de despesas">
      <CardPainel>
        <div className="grid gap-5 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-1.5">
              <Rotulo>{item.label}</Rotulo>
              <span className="text-xl font-medium tabular-nums text-slate-900 dark:text-white">
                <NumeroAnimado valor={item.amount} formatar={formatCurrency} />
              </span>
              <p className="m-0 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.detail}</p>
            </div>
          ))}
        </div>
        <p className="m-0 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Segue o período e os filtros escolhidos. Confirmar troca a estimativa pelo valor informado; pagar é uma ação à parte.
        </p>
      </CardPainel>
    </Secao>
  );
}
