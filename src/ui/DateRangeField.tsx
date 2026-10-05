import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { rangeAfterClick, type DateRange } from '../utils/calendarGrid';
import { brDateToIso, getLocalTodayIso, isoToBrDate } from '../utils/date';
import { CalendarPanel } from './CalendarPanel';
import { C } from './dialogFormTokens';
import { DateField } from './DateField';
import { FloatingPanel } from './FloatingPanel';

/** Período em aaaa-mm-dd, com o início antes do fim (ou igual). */
export interface IsoDateRange {
  start: string;
  end: string;
}

interface DateRangeFieldProps {
  value: IsoDateRange;
  onChange: (range: IsoDateRange) => void;
  todayIso?: string;
  /** Classes da pílula (altura, borda, fundo, cor do texto) de cada tela. */
  className?: string;
}

const CALENDAR_WIDTH = 276;
const DEFAULT_PILL_CLASS = [
  'h-[30px] rounded-full border border-slate-200 bg-white px-2 text-[12.5px] text-slate-800',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
].join(' ');
const INVALID_PILL_CLASS = '!border-rose-300 dark:!border-rose-700';

/** As datas dentro da pílula: sem caixa própria, com a letra e a cor da pílula. */
const RANGE_INPUT_STYLE: CSSProperties = {
  width: 80, height: 26, padding: '0 2px', border: 'none', background: 'transparent',
  color: 'inherit', font: 'inherit', fontVariantNumeric: 'tabular-nums', outline: 'none',
};

/**
 * Período "📅 de dd/mm/aaaa até dd/mm/aaaa". No calendário, o primeiro clique
 * marca o início e o segundo o fim (antes do início, as datas se invertem), e o
 * período vale no segundo clique. Digitando, vale ao sair de uma das datas ou
 * no Enter, quando as duas existem e o início não passa do fim.
 */
export function DateRangeField({ value, onChange, todayIso = getLocalTodayIso(), className = DEFAULT_PILL_CLASS }: DateRangeFieldProps) {
  const [startText, setStartText] = useState(() => isoToBrDate(value.start));
  const [endText, setEndText] = useState(() => isoToBrDate(value.end));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ start: value.start, end: value.end });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Período trocado de fora (atalho, Limpar filtros): as datas acompanham.
  useEffect(() => {
    setStartText(isoToBrDate(value.start));
    setEndText(isoToBrDate(value.end));
  }, [value.start, value.end]);

  const startIso = brDateToIso(startText);
  const endIso = brDateToIso(endText);
  const invalid = !startIso || !endIso || startIso > endIso;

  const apply = (start: string, end: string) => {
    if (!start || !end || start > end) return;
    if (start === value.start && end === value.end) return;
    onChange({ start, end });
  };

  const applyOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    // Sair do campo completa a data e aplica o período.
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const openCalendar = () => {
    setDraft({ start: value.start, end: value.end });
    setCalendarOpen(true);
  };

  const handleDayClick = (iso: string) => {
    const next = rangeAfterClick(draft, iso);
    setDraft(next.range);
    if (!next.complete || !next.range.start || !next.range.end) return;
    setStartText(isoToBrDate(next.range.start));
    setEndText(isoToBrDate(next.range.end));
    apply(next.range.start, next.range.end);
    setCalendarOpen(false);
    buttonRef.current?.focus();
  };

  const choosingEnd = !!draft.start && !draft.end;

  return (
    <div className={['inline-flex items-center gap-1 tabular-nums', className, invalid ? INVALID_PILL_CLASS : ''].join(' ')}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (calendarOpen ? setCalendarOpen(false) : openCalendar())}
        aria-label="Escolher o período no calendário"
        aria-haspopup="dialog"
        aria-expanded={calendarOpen}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-400"
      >
        <CalendarDays size={14} />
      </button>
      <span className="text-slate-400 dark:text-slate-500">de</span>
      <DateField
        value={startText}
        onChange={setStartText}
        todayIso={todayIso}
        label="Data inicial"
        required
        hideCalendarButton
        inputStyle={RANGE_INPUT_STYLE}
        onCommit={(text) => apply(brDateToIso(text), endIso)}
        onKeyDown={applyOnEnter}
      />
      <span className="text-slate-400 dark:text-slate-500">até</span>
      <DateField
        value={endText}
        onChange={setEndText}
        todayIso={todayIso}
        label="Data final"
        required
        hideCalendarButton
        inputStyle={RANGE_INPUT_STYLE}
        onCommit={(text) => apply(startIso, brDateToIso(text))}
        onKeyDown={applyOnEnter}
      />
      <FloatingPanel
        open={calendarOpen}
        anchorRef={buttonRef}
        onClose={() => setCalendarOpen(false)}
        label="Calendário do período"
        width={CALENDAR_WIDTH}
      >
        <CalendarPanel
          todayIso={todayIso}
          initialFocusIso={draft.start || todayIso}
          selectedIsos={[draft.start, draft.end].filter((iso): iso is string => !!iso)}
          range={draft}
          onDayClick={handleDayClick}
          label="Período"
          footer={(
            <span style={{ padding: '4px 2px', fontSize: 12, color: C.textSoft }}>
              {choosingEnd ? 'Agora clique no fim do período' : 'Clique no início do período'}
            </span>
          )}
        />
      </FloatingPanel>
    </div>
  );
}
