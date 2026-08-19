import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';

export type DashboardPeriodMode = 'ano' | 'mes' | 'intervalo' | 'tudo';

export interface DashboardPeriod {
  mode: DashboardPeriodMode;
  // 'ano': só ano preenchido. 'mes': mes + ano. 'intervalo': todos os quatro.
  ano?: number;
  mes?: number;
  ateAno?: number;
  ateMes?: number;
}

interface Props {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
  primeiraData: string | null;
}

const now = new Date();
const THIS_YEAR = now.getFullYear();
const THIS_MONTH = now.getMonth();

function anoInicioHistorico(primeiraData: string | null): number {
  if (!primeiraData) return THIS_YEAR;
  return Number(primeiraData.slice(0, 4));
}

export function describePeriod(period: DashboardPeriod): string {
  if (period.mode === 'tudo') return 'Todo o período';
  if (period.mode === 'ano') return `Ano ${period.ano}`;
  if (period.mode === 'mes') return `${MONTH_NAMES[period.mes ?? 0]} de ${period.ano}`;
  return `${MONTH_NAMES[period.mes ?? 0]}/${period.ano} até ${MONTH_NAMES[period.ateMes ?? 0]}/${period.ateAno}`;
}

export function DashboardPeriodFilter({ value, onChange, primeiraData }: Props) {
  const [open, setOpen] = useState(false);
  const anoMin = anoInicioHistorico(primeiraData);
  const anosDisponiveis = Array.from({ length: THIS_YEAR - anoMin + 1 }, (_, i) => THIS_YEAR - i);

  const apply = (next: DashboardPeriod) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-[#dcebf1] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0f2b38] hover:border-[#b9e6ef] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      >
        <Calendar size={14} className="text-[#0891b2]" />
        {describePeriod(value)}
        <ChevronDown size={14} className={`text-[#7b93a1] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[300px] rounded-xl border border-[#e6eef3] bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-1">
              <button
                type="button"
                onClick={() => apply({ mode: 'tudo' })}
                className={`rounded-lg px-3 py-2 text-left text-[13px] font-semibold ${value.mode === 'tudo' ? 'bg-[#e6f7fa] text-[#0891b2]' : 'text-[#0f2b38] hover:bg-[#f7fafb] dark:text-slate-200 dark:hover:bg-slate-800'}`}
              >
                Todo o período
              </button>
              <button
                type="button"
                onClick={() => apply({ mode: 'ano', ano: THIS_YEAR })}
                className={`rounded-lg px-3 py-2 text-left text-[13px] font-semibold ${value.mode === 'ano' && value.ano === THIS_YEAR ? 'bg-[#e6f7fa] text-[#0891b2]' : 'text-[#0f2b38] hover:bg-[#f7fafb] dark:text-slate-200 dark:hover:bg-slate-800'}`}
              >
                Ano corrente ({THIS_YEAR})
              </button>
              <button
                type="button"
                onClick={() => apply({ mode: 'mes', mes: THIS_MONTH, ano: THIS_YEAR })}
                className={`rounded-lg px-3 py-2 text-left text-[13px] font-semibold ${value.mode === 'mes' && value.mes === THIS_MONTH && value.ano === THIS_YEAR ? 'bg-[#e6f7fa] text-[#0891b2]' : 'text-[#0f2b38] hover:bg-[#f7fafb] dark:text-slate-200 dark:hover:bg-slate-800'}`}
              >
                Mês atual ({MONTH_NAMES[THIS_MONTH]})
              </button>
            </div>

            <div className="mt-3 border-t border-[#eef4f7] pt-3 dark:border-slate-700">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b93a1]">Outro ano</p>
              <div className="flex flex-wrap gap-1.5">
                {anosDisponiveis.map((ano) => (
                  <button
                    key={ano}
                    type="button"
                    onClick={() => apply({ mode: 'ano', ano })}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${value.mode === 'ano' && value.ano === ano ? 'border-[#0891b2] bg-[#e6f7fa] text-[#0891b2]' : 'border-[#dcebf1] text-[#5f7885] hover:border-[#b9e6ef] dark:border-slate-700 dark:text-slate-400'}`}
                  >
                    {ano}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-[#eef4f7] pt-3 dark:border-slate-700">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b93a1]">Intervalo personalizado</p>
              <IntervalPicker anoMin={anoMin} value={value} onApply={apply} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function IntervalPicker({ anoMin, value, onApply }: { anoMin: number; value: DashboardPeriod; onApply: (p: DashboardPeriod) => void }) {
  const [deMes, setDeMes] = useState(value.mode === 'intervalo' ? value.mes ?? 0 : 0);
  const [deAno, setDeAno] = useState(value.mode === 'intervalo' ? value.ano ?? anoMin : anoMin);
  const [ateMes, setAteMes] = useState(value.mode === 'intervalo' ? value.ateMes ?? THIS_MONTH : THIS_MONTH);
  const [ateAno, setAteAno] = useState(value.mode === 'intervalo' ? value.ateAno ?? THIS_YEAR : THIS_YEAR);
  const anosDisponiveis = Array.from({ length: THIS_YEAR - anoMin + 1 }, (_, i) => anoMin + i);

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <select value={deMes} onChange={(e) => setDeMes(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
        <select value={deAno} onChange={(e) => setDeAno(Number(e.target.value))} className="rounded-lg border border-[#dcebf1] bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <span className="text-center text-[11px] font-semibold text-[#7b93a1]">até</span>
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
        onClick={() => onApply({ mode: 'intervalo', mes: deMes, ano: deAno, ateMes, ateAno })}
        disabled={deAno * 12 + deMes > ateAno * 12 + ateMes}
        className="mt-1 rounded-lg bg-[#0891b2] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Aplicar intervalo
      </button>
    </div>
  );
}
