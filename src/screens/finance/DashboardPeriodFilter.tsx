import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
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

const now = new Date();
const THIS_YEAR = now.getFullYear();

function anoInicioHistorico(primeiraData: string | null): number {
  if (!primeiraData) return THIS_YEAR;
  return Number(primeiraData.slice(0, 4));
}

export function describePeriod(period: DashboardPeriod): string {
  if (period.mes === period.ateMes && period.ano === period.ateAno) {
    return `${MONTH_NAMES[period.mes]} de ${period.ano}`;
  }
  return `${MONTH_NAMES[period.mes]}/${period.ano} até ${MONTH_NAMES[period.ateMes]}/${period.ateAno}`;
}

export function DashboardPeriodFilter({ value, onChange, primeiraData }: Props) {
  const [open, setOpen] = useState(false);
  const anoMin = anoInicioHistorico(primeiraData);
  const anosDisponiveis = Array.from({ length: THIS_YEAR - anoMin + 1 }, (_, i) => anoMin + i);

  const [deMes, setDeMes] = useState(value.mes);
  const [deAno, setDeAno] = useState(value.ano);
  const [ateMes, setAteMes] = useState(value.ateMes);
  const [ateAno, setAteAno] = useState(value.ateAno);

  const invalido = deAno * 12 + deMes > ateAno * 12 + ateMes;

  const apply = () => {
    if (invalido) return;
    onChange({ mes: deMes, ano: deAno, ateMes, ateAno });
    setOpen(false);
  };

  const toggle = () => {
    if (!open) {
      setDeMes(value.mes);
      setDeAno(value.ano);
      setAteMes(value.ateMes);
      setAteAno(value.ateAno);
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 rounded-lg border border-[#dcebf1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0f2b38] hover:border-[#b9e6ef] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      >
        <Calendar size={14} className="text-[#0891b2]" />
        {describePeriod(value)}
        <ChevronDown size={14} className={`text-[#7b93a1] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[280px] rounded-xl border border-[#e6eef3] bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b93a1]">De</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={deMes} onChange={(e) => setDeMes(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select value={deAno} onChange={(e) => setDeAno(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b93a1]">Até</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={ateMes} onChange={(e) => setAteMes(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select value={ateAno} onChange={(e) => setAteAno(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={apply}
              disabled={invalido}
              className="mt-3 w-full rounded-lg bg-[#0891b2] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
