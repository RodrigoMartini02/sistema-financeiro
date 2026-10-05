import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '../types/finance';
import {
  WEEKDAY_INITIALS, WEEKDAY_NAMES, addDays, addMonths, calendarYears, isInRange, monthGrid, monthOfIso, shiftMonth,
  type CalendarMonth, type DateRange,
} from '../utils/calendarGrid';
import { C } from './dialogFormTokens';

interface CalendarPanelProps {
  todayIso: string;
  /** Dia que recebe o foco ao abrir: a data do campo, o início do período ou hoje. */
  initialFocusIso: string;
  /** Dias marcados: a data do campo, ou o início e o fim do período. */
  selectedIsos: readonly string[];
  /** Período em escolha. Com o início marcado e o fim não, os dias até o mouse ficam destacados. */
  range?: DateRange;
  onDayClick: (iso: string) => void;
  /** Nome do calendário para leitores de tela. */
  label: string;
  /** Botões do rodapé ("Hoje", "Limpar"). */
  footer?: ReactNode;
}

/** Dia em círculo de tamanho fixo: no painel inferior do celular a casa é mais larga, e o dia não vira oval. */
const DAY_SIZE = 36;

const navButtonStyle: CSSProperties = {
  display: 'grid', placeItems: 'center', width: 28, height: 28, flex: 'none', padding: 0, border: 'none', borderRadius: 8,
  background: 'transparent', color: C.textSoft, cursor: 'pointer',
};

const headerSelectStyle: CSSProperties = {
  height: 28, minWidth: 0, padding: '0 4px', border: `1px solid ${C.borderInput}`, borderRadius: 8, background: '#fff',
  fontSize: 12.5, fontWeight: 600, color: C.text, cursor: 'pointer', outline: 'none',
};

function dayStyle({ inMonth, selected, inRange, today }: { inMonth: boolean; selected: boolean; inRange: boolean; today: boolean }): CSSProperties {
  return {
    width: DAY_SIZE, height: DAY_SIZE, padding: 0, borderRadius: 999, cursor: 'pointer',
    fontSize: 12.5, fontWeight: selected || today ? 700 : 500, fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${today && !selected ? C.primary : 'transparent'}`,
    background: selected ? C.primary : inRange ? C.primarySoft : 'transparent',
    color: selected ? '#fff' : inMonth ? C.text : C.placeholder,
  };
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year!, month! - 1, day!, 12).getDay();
  return `${day} de ${MONTH_NAMES[month! - 1]!.toLowerCase()} de ${year}, ${WEEKDAY_NAMES[weekday]}`;
}

/**
 * Calendário de um mês, com o mês e o ano em listas (para chegar rápido a uma
 * data de nascimento) e a navegação pelo teclado: setas andam um dia ou uma
 * semana, PageUp e PageDown trocam o mês, Enter escolhe. O Esc é do painel
 * flutuante, que fecha e devolve o foco ao campo.
 */
export function CalendarPanel({ todayIso, initialFocusIso, selectedIsos, range, onDayClick, label, footer }: CalendarPanelProps) {
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfIso(initialFocusIso, todayIso));
  const [focusedIso, setFocusedIso] = useState(initialFocusIso);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(true);

  // Abre com o foco no dia; depois, só move o foco quando foi o teclado que mudou o dia.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`)?.focus();
  }, [focusedIso, month]);

  const days = monthGrid(month);
  const currentYear = Number(todayIso.slice(0, 4));
  const choosingEnd = !!range?.start && !range.end;
  const rangeEnd = range?.end ?? (choosingEnd ? hoverIso : null);

  const showMonth = (next: CalendarMonth) => {
    setMonth(next);
    const focusInMonth = monthOfIso(focusedIso, todayIso);
    if (focusInMonth.year !== next.year || focusInMonth.month !== next.month) {
      setFocusedIso(`${next.year}-${String(next.month).padStart(2, '0')}-01`);
    }
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusedIso, -1),
      ArrowRight: () => addDays(focusedIso, 1),
      ArrowUp: () => addDays(focusedIso, -7),
      ArrowDown: () => addDays(focusedIso, 7),
      PageUp: () => addMonths(focusedIso, -1),
      PageDown: () => addMonths(focusedIso, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move();
    moveFocus.current = true;
    setFocusedIso(next);
    setMonth(monthOfIso(next, todayIso));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button type="button" aria-label="Mês anterior" onClick={() => showMonth(shiftMonth(month, -1))} style={navButtonStyle}>
          <ChevronLeft size={16} />
        </button>
        <select
          aria-label="Mês"
          value={month.month}
          onChange={(event) => showMonth({ year: month.year, month: Number(event.target.value) })}
          style={{ ...headerSelectStyle, flex: 1 }}
        >
          {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <select
          aria-label="Ano"
          value={month.year}
          onChange={(event) => showMonth({ year: Number(event.target.value), month: month.month })}
          style={headerSelectStyle}
        >
          {calendarYears(month.year, currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <button type="button" aria-label="Próximo mês" onClick={() => showMonth(shiftMonth(month, 1))} style={navButtonStyle}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        onKeyDown={handleGridKeyDown}
        onMouseLeave={() => setHoverIso(null)}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 2 }}
      >
        <div role="row" style={{ display: 'contents' }}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span
              key={WEEKDAY_NAMES[index]}
              role="columnheader"
              aria-label={WEEKDAY_NAMES[index]}
              style={{ display: 'grid', placeItems: 'center', height: 24, fontSize: 11, fontWeight: 600, color: C.textFaint }}
            >
              {initial}
            </span>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, week) => (
          <div key={days[week * 7]!.iso} role="row" style={{ display: 'contents' }}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = selectedIsos.includes(day.iso);
              return (
                <span key={day.iso} role="gridcell" aria-selected={selected} style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    data-iso={day.iso}
                    tabIndex={day.iso === focusedIso ? 0 : -1}
                    aria-label={dayLabel(day.iso)}
                    aria-current={day.iso === todayIso ? 'date' : undefined}
                    onClick={() => onDayClick(day.iso)}
                    onMouseEnter={() => setHoverIso(day.iso)}
                    onFocus={() => setFocusedIso(day.iso)}
                    style={dayStyle({
                      inMonth: day.inMonth,
                      selected,
                      inRange: !selected && isInRange(day.iso, range?.start ?? null, rangeEnd),
                      today: day.iso === todayIso,
                    })}
                  >
                    {day.day}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {footer && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Botão de texto do rodapé do calendário ("Hoje", "Limpar"). */
export const calendarFooterButtonStyle: CSSProperties = {
  border: 'none', background: 'transparent', padding: '4px 6px', borderRadius: 6,
  fontSize: 12, fontWeight: 600, color: C.primary, cursor: 'pointer',
};
