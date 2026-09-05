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

  // Sem moldura própria: o filtro fica na linha da descrição do período, na
  // mesma escala do texto ao lado. Só o campo em erro ganha borda visível.
  const inputCls = (temErro: boolean) =>
    `w-[82px] rounded border-b bg-transparent px-1 py-0.5 text-[12px] tabular-nums text-[#0f2b38] focus:border-[#0891b2] focus:outline-none dark:text-slate-200 ${
      temErro ? 'border-red-300' : 'border-[#dcebf1] dark:border-slate-700'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Calendar size={12} className="shrink-0 text-[#a8bac4]" />
      <span className="text-[12px] text-[#7b93a1]">De</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={de}
        onChange={(e) => setDe(maskDate(e.target.value))}
        className={inputCls(Boolean(de) && !deParsed)}
      />
      <span className="text-[12px] text-[#7b93a1]">até</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={ate}
        onChange={(e) => setAte(maskDate(e.target.value))}
        className={inputCls(Boolean(ate) && !ateParsed)}
      />
      <button
        type="button"
        onClick={apply}
        disabled={invalido}
        className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0891b2] transition hover:bg-[#e0f2f7] disabled:cursor-not-allowed disabled:text-[#a8bac4] disabled:hover:bg-transparent"
      >
        Aplicar
      </button>
    </div>
  );
}
