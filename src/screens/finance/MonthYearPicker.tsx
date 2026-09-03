import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';

interface Props {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

export function MonthYearPicker({ month, year, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPickerYear(year);

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, year]);

  const goPrev = () => {
    if (month === 0) onChange(11, year - 1);
    else onChange(month - 1, year);
  };

  const goNext = () => {
    if (month === 11) onChange(0, year + 1);
    else onChange(month + 1, year);
  };

  const selectMonth = (m: number) => {
    onChange(m, pickerYear);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900" ref={containerRef}>
      <button
        type="button"
        onClick={goPrev}
        className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-1 text-center text-[13.5px] font-semibold capitalize tracking-tight text-slate-900 hover:bg-slate-50 dark:text-white dark:hover:bg-slate-800"
      >
        <Calendar size={13} className="text-slate-400" />
        {MONTH_NAMES[month]?.toLowerCase()} {year}
        <ChevronDown size={13} className={['text-slate-400 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      <button
        type="button"
        onClick={goNext}
        className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <ChevronRight size={15} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[240px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{pickerYear}</span>
            <button
              type="button"
              onClick={() => setPickerYear((y) => y + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, i) => {
              const isSelected = i === month && pickerYear === year;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectMonth(i)}
                  className={[
                    'rounded-lg px-2 py-1.5 text-[12px] font-medium capitalize transition',
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  {name.slice(0, 3).toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
