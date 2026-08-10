import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';

interface Props {
  month: number; year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  mesFechado: boolean;
}

const today = new Date();
const THIS_MONTH = today.getMonth();
const THIS_YEAR = today.getFullYear();

export function CompactPeriodSelector({ month, year, onMonthChange, onYearChange, mesFechado }: Props) {
  const goToToday = () => {
    onMonthChange(THIS_MONTH);
    onYearChange(THIS_YEAR);
  };

  const goPrev = () => {
    if (month === 0) { onMonthChange(11); onYearChange(year - 1); }
    else onMonthChange(month - 1);
  };

  const goNext = () => {
    if (month === 11) { onMonthChange(0); onYearChange(year + 1); }
    else onMonthChange(month + 1);
  };

  const isCurrentMonth = month === THIS_MONTH && year === THIS_YEAR;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="min-w-[104px] px-1 text-center text-[13.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {MONTH_NAMES[month]?.toLowerCase()} {year}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={goToToday}
          className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Hoje
        </button>
      )}
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className={['h-1.5 w-1.5 rounded-full', mesFechado ? 'bg-slate-400' : 'bg-amber-400'].join(' ')} />
        {mesFechado ? 'Mês fechado' : 'Mês aberto'}
      </span>
    </div>
  );
}
