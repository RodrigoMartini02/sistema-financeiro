import { Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { corDaPaleta, useCoresGrafico } from '../../screens/finance/painel/coresGrafico';
import { Barras, type PontoBarras, type SerieBarras } from '../../screens/finance/painel/graficos/Barras';
import { EmptyState } from '../../ui/EmptyState';
import type { DashboardView, ModalityCard } from '../types';
import { modalityColorIndex, modalityLink, modalitySparkline } from '../utils/dashboard';

const formatCount = (value: number) => value.toLocaleString('pt-BR');

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="m-0 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatCount(value)}</dd>
    </div>
  );
}

function ModalityCardItem({ modality, days }: { modality: ModalityCard; days: string[] }) {
  const colors = useCoresGrafico();
  const color = corDaPaleta(modalityColorIndex(modality.id), colors);
  const points: PontoBarras[] = modalitySparkline(modality, days).map((bar) => ({ rotulo: bar.label, titulo: bar.title, valores: bar.values }));
  const series: SerieBarras[] = [{ chave: 'published', rotulo: 'Publicados', cor: color }];
  return (
    <Link
      to={modalityLink(modality.id)}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/50"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden="true" />
        <span className="min-w-0 truncate">{modality.name}</span>
      </span>
      <span className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCount(modality.published30Days)}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">publicados em 30 dias</span>
      </span>
      <div className="mt-2">
        <Barras pontos={points} series={series} altura={44} semEixo formatar={formatCount} />
      </div>
      <dl className="m-0 mt-3 grid grid-cols-4 gap-1 border-t border-slate-100 pt-3 dark:border-slate-700">
        <Stat label="Abertos" value={modality.open} />
        <Stat label="Em análise" value={modality.analyzing} />
        <Stat label="Vou participar" value={modality.participating} />
        <Stat label="Participei" value={modality.participated} />
      </dl>
    </Link>
  );
}

/** Um card por modalidade que a base tem: publicados em 30 dias, mini-gráfico diário e as quantidades da conta. */
export function DashboardModalityCards({ modalities, days }: { modalities: DashboardView['modalities']; days: string[] }) {
  if (modalities.length === 0) {
    return <EmptyState icon={Layers} title="Ainda não há editais na base." description="Os cards por modalidade aparecem quando a coleta trouxer os primeiros editais." />;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {modalities.map((modality) => (
        <li key={modality.id}>
          <ModalityCardItem modality={modality} days={days} />
        </li>
      ))}
    </ul>
  );
}
