import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';

interface MonthSelectorProps {
  month: number; year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
}

const today = new Date();
const THIS_MONTH = today.getMonth();
const THIS_YEAR  = today.getFullYear();

export function MonthSelector({ month, year, onMonthChange, onYearChange }: MonthSelectorProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Year navigation */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => onYearChange(year - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="w-11 text-center text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {year}
        </span>
        <button
          onClick={() => onYearChange(year + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

      {/* Month pills — fill full width */}
      <div className="flex flex-1 gap-1">
        {MONTH_NAMES.map((name, i) => {
          const isActive  = i === month;
          const isCurrent = i === THIS_MONTH && year === THIS_YEAR;
          return (
            <button
              key={i}
              onClick={() => onMonthChange(i)}
              className={[
                'relative flex-1 rounded-lg py-2 text-sm font-semibold transition',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'border border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
              ].join(' ')}
            >
              {name.slice(0, 3)}
              {isCurrent && !isActive && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-brand-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
