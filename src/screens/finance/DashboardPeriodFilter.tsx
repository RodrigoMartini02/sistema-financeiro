import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';

export interface DashboardPeriod {
  mes: number;
  ano: number;
  ateMes: number;
  ateAno: number;
}

interface Props {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
  primeiraData: string | null;
}

export function describePeriod(period: DashboardPeriod): string {
  if (period.mes === period.ateMes && period.ano === period.ateAno) {
    return `${MONTH_NAMES[period.mes]} de ${period.ano}`;
  }
  return `${MONTH_NAMES[period.mes]}/${period.ano} até ${MONTH_NAMES[period.ateMes]}/${period.ateAno}`;
}

// Formata dígitos digitados livremente em dd/mm/aaaa, inserindo as barras
// automaticamente conforme o usuário digita (sem exigir que ele mesmo as digite).
function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

function parseDate(masked: string): { day: number; month: number; year: number } | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  if (year < 1900 || year > 2200) return null;
  return { day, month, year };
}

function periodToDateStrings(period: DashboardPeriod): { de: string; ate: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    de: `01/${pad(period.mes + 1)}/${period.ano}`,
    ate: `01/${pad(period.ateMes + 1)}/${period.ateAno}`,
  };
}

export function DashboardPeriodFilter({ value, onChange, primeiraData: _primeiraData }: Props) {
  const initial = periodToDateStrings(value);
  const [de, setDe] = useState(initial.de);
  const [ate, setAte] = useState(initial.ate);

  const deParsed = parseDate(de);
  const ateParsed = parseDate(ate);
  const invalido =
    !deParsed || !ateParsed ||
    deParsed.year * 12 + (deParsed.month - 1) > ateParsed.year * 12 + (ateParsed.month - 1);

  const apply = () => {
    if (!deParsed || !ateParsed || invalido) return;
    onChange({
      mes: deParsed.month - 1,
      ano: deParsed.year,
      ateMes: ateParsed.month - 1,
      ateAno: ateParsed.year,
    });
  };

  const inputCls = `w-[104px] rounded-lg border px-2 py-1.5 text-[12.5px] focus:outline-none dark:bg-slate-800 dark:text-slate-200 ${
    de && !deParsed ? 'border-red-300' : 'border-[#dcebf1] dark:border-slate-700'
  }`;
  const inputCls2 = `w-[104px] rounded-lg border px-2 py-1.5 text-[12.5px] focus:outline-none dark:bg-slate-800 dark:text-slate-200 ${
    ate && !ateParsed ? 'border-red-300' : 'border-[#dcebf1] dark:border-slate-700'
  }`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#dcebf1] bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <Calendar size={14} className="shrink-0 text-[#0891b2]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[#7b93a1]">De</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={de}
          onChange={(e) => setDe(maskDate(e.target.value))}
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[#7b93a1]">Até</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={ate}
          onChange={(e) => setAte(maskDate(e.target.value))}
          className={inputCls2}
        />
      </div>
      <button
        type="button"
        onClick={apply}
        disabled={invalido}
        className="rounded-lg bg-[#0891b2] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Aplicar
      </button>
    </div>
  );
}
