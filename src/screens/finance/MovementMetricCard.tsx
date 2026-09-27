import type { ReactNode } from 'react';

type Tone = 'income' | 'expense' | 'slate' | 'warning';

interface MovementMetricCardProps {
  label: string;
  value: string;
  tone?: Tone;
  progressPct?: number; // 0-100
  note?: ReactNode;
  /**
   * Troca a barra fina de progresso por uma barra de faixas com marcador —
   * ex.: comprometimento da renda (verde até o 1º limite, âmbar até o 2º,
   * vermelho acima). Sem esta prop o card fica exatamente como sempre foi.
   */
  faixas?: { valor: number; limites: [number, number] };
}

const toneColors: Record<Tone, { value: string; bar: string }> = {
  income:  { value: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  expense: { value: 'text-rose-600 dark:text-rose-400',       bar: 'bg-rose-500' },
  slate:   { value: 'text-slate-900 dark:text-white',          bar: 'bg-slate-400' },
  warning: { value: 'text-amber-600 dark:text-amber-400',      bar: 'bg-amber-500' },
};

function BarraDeFaixas({ valor, limites: [alerta, critico] }: { valor: number; limites: [number, number] }) {
  return (
    <div className="relative my-1 flex h-1 gap-0.5" aria-hidden="true">
      <div className="rounded-l-full bg-emerald-200 dark:bg-emerald-900" style={{ flex: alerta }} />
      <div className="bg-amber-200 dark:bg-amber-900" style={{ flex: critico - alerta }} />
      <div className="rounded-r-full bg-rose-200 dark:bg-rose-900" style={{ flex: 100 - critico }} />
      <span
        className="absolute -top-1 h-3 w-[3px] rounded-full bg-slate-900 dark:bg-white"
        style={{ left: `${Math.max(0, Math.min(99, valor))}%` }}
      />
    </div>
  );
}

// Card compacto: a faixa fica fixa acima da tabela, entao cada pixel de altura
// aqui e um pixel a menos de despesa visivel.
export function MovementMetricCard({ label, value, tone = 'slate', progressPct, note, faixas }: MovementMetricCardProps) {
  const colors = toneColors[tone];
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={['text-base font-bold tracking-tight', colors.value].join(' ')}>{value}</span>
      {faixas ? (
        <BarraDeFaixas valor={faixas.valor} limites={faixas.limites} />
      ) : (
        <div className="h-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={['h-full rounded-full', colors.bar].join(' ')}
            style={{ width: `${Math.max(0, Math.min(100, progressPct ?? 0))}%`, opacity: 0.7 }}
          />
        </div>
      )}
      {note && <span className="text-[10.5px] leading-tight text-slate-400">{note}</span>}
    </div>
  );
}
