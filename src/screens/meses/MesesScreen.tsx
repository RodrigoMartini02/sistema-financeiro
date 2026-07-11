import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, TrendingDown, TrendingUp, ChevronRight } from 'lucide-react';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import { useAppContext } from '../../context/AppContext';
import { MONTH_NAMES } from '../../types/finance';
import { Card } from '../../ui/card';
import type { AppSection } from '../../layout/AppShell';

interface MesData {
  ano: number;
  mes: number;
  fechado: boolean;
  saldo_final: string | number | null;
  data_fechamento: string | null;
}

interface MesSaldo {
  saldo_anterior: number;
  receitas: number;
  despesas: number;
  saldo_final: number;
}

async function fetchMeses(ano: number): Promise<MesData[]> {
  const pid = getActiveProfileId();
  const q = pid ? `?perfil_id=${pid}` : '';
  const all = await apiRequest<MesData[]>(`/meses${q}`);
  return all.filter((m) => m.ano === ano);
}

async function fetchSaldoMes(ano: number, mes: number): Promise<MesSaldo> {
  const pid = getActiveProfileId();
  const q = pid ? `?perfil_id=${pid}` : '';
  return apiRequest<MesSaldo>(`/meses/${ano}/${mes}/saldo${q}`);
}

async function fecharMes(ano: number, mes: number): Promise<void> {
  const pid = getActiveProfileId();
  const body = pid ? { perfil_id: pid } : {};
  await apiRequest<void>(`/meses/${ano}/${mes}/fechar`, { method: 'POST', body: JSON.stringify(body) });
}

async function reabrirMes(ano: number, mes: number): Promise<void> {
  const pid = getActiveProfileId();
  const body = pid ? { perfil_id: pid } : {};
  await apiRequest<void>(`/meses/${ano}/${mes}/reabrir`, { method: 'POST', body: JSON.stringify(body) });
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function MesCard({
  mes, ano, dadoBD, onNavigate,
}: {
  mes: number; ano: number; dadoBD?: MesData;
  onNavigate: (section: AppSection, month: number) => void;
}) {
  const qc = useQueryClient();
  const saldo = useQuery({
    queryKey: ['mes-saldo', ano, mes],
    queryFn: () => fetchSaldoMes(ano, mes),
    retry: false,
  });

  const fecharMut = useMutation({
    mutationFn: () => fecharMes(ano, mes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meses', ano] }),
  });

  const reabrirMut = useMutation({
    mutationFn: () => reabrirMes(ano, mes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meses', ano] }),
  });

  const fechado = dadoBD?.fechado ?? false;
  const s = saldo.data;
  const saldoVal = s ? s.saldo_anterior + s.receitas - s.despesas : null;
  const positivo = saldoVal !== null && saldoVal >= 0;

  return (
    <Card className={['flex flex-col transition', fechado ? 'opacity-80' : ''].join(' ')}>
      <div className={['flex items-center justify-between px-4 py-3 border-b', fechado ? 'border-slate-100 bg-slate-50' : 'border-slate-100'].join(' ')}>
        <div>
          <p className="font-bold text-slate-900 text-sm">{MONTH_NAMES[mes]}</p>
          <span className={['text-[10px] font-bold uppercase tracking-wide', fechado ? 'text-slate-400' : 'text-green-600'].join(' ')}>
            {fechado ? 'Fechado' : 'Aberto'}
          </span>
        </div>
        {fechado
          ? <Lock size={15} className="text-slate-400" />
          : <LockOpen size={15} className="text-green-500" />}
      </div>

      <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100 px-0 py-3">
        <div className="px-4">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
            <TrendingUp size={10} /> Receitas
          </div>
          <p className="text-sm font-bold text-green-700">
            {s ? fmt(s.receitas) : <span className="text-slate-300">—</span>}
          </p>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
            <TrendingDown size={10} /> Despesas
          </div>
          <p className="text-sm font-bold text-red-700">
            {s ? fmt(s.despesas) : <span className="text-slate-300">—</span>}
          </p>
        </div>
      </div>

      {saldoVal !== null && (
        <div className={['mx-4 mb-3 rounded-lg px-3 py-2 text-center', positivo ? 'bg-green-50' : 'bg-red-50'].join(' ')}>
          <p className="text-[10px] font-semibold uppercase text-slate-500 mb-0.5">Saldo</p>
          <p className={['text-base font-bold', positivo ? 'text-green-700' : 'text-red-700'].join(' ')}>
            {fmt(saldoVal)}
          </p>
        </div>
      )}

      <div className="mt-auto flex gap-2 border-t border-slate-100 px-3 py-2">
        <button
          onClick={() => onNavigate('painel', mes)}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
        >
          Ver detalhes <ChevronRight size={12} />
        </button>
        <button
          onClick={() => {
            if (fechado) {
              if (confirm(`Reabrir ${MONTH_NAMES[mes]}?`)) reabrirMut.mutate();
            } else {
              if (confirm(`Fechar ${MONTH_NAMES[mes]}? Os lançamentos ficarão bloqueados.`)) fecharMut.mutate();
            }
          }}
          disabled={fecharMut.isPending || reabrirMut.isPending}
          className={['flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition',
            fechado
              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          {fechado ? <><LockOpen size={12} /> Reabrir</> : <><Lock size={12} /> Fechar</>}
        </button>
      </div>
    </Card>
  );
}

interface MesesScreenProps {
  onNavigate: (section: AppSection, month?: number) => void;
}

export function MesesScreen({ onNavigate }: MesesScreenProps) {
  const { year, setYear } = useAppContext();

  const meses = useQuery({
    queryKey: ['meses', year],
    queryFn: () => fetchMeses(year),
  });

  const dadosPorMes = new Map<number, MesData>();
  (meses.data ?? []).forEach((m) => dadosPorMes.set(m.mes, m));

  const handleNavigate = (section: AppSection, month: number) => {
    onNavigate(section, month);
  };

  return (
    <div className="mx-auto max-w-6xl grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-700">Visão anual</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Meses de {year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(year - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="min-w-[60px] text-center text-lg font-bold text-slate-900">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <MesCard
            key={i}
            mes={i}
            ano={year}
            dadoBD={dadosPorMes.get(i)}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </div>
  );
}
