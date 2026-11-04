import { useState } from 'react';
import { corDaPaleta, useCoresGrafico } from '../../screens/finance/painel/coresGrafico';
import { Legenda, Vazio } from '../../screens/finance/painel/graficoBase';
import { Barras, type PontoBarras, type SerieBarras } from '../../screens/finance/painel/graficos/Barras';
import { ToggleGroup } from '../../ui/form';
import type { DashboardView } from '../types';
import { buildPublicationChart, type PublicationPeriod } from '../utils/dashboard';
import { DashboardCard } from './DashboardCard';

const PERIOD_OPTIONS = [
  { value: 'daily', label: '30 dias' },
  { value: 'monthly', label: '12 meses' },
];

const SUBTITLES: Record<PublicationPeriod, string> = {
  daily: 'Editais publicados por dia, nos últimos 30 dias (até ontem)',
  monthly: 'Editais publicados por mês, nos últimos 12 meses (o mês corrente, até ontem)',
};

const CHART_HEIGHT = 240;
const formatCount = (value: number) => value.toLocaleString('pt-BR');

/**
 * Publicações no tempo, por dia ou por mês, em barras empilhadas por modalidade: a cor é sempre a da modalidade (a mesma
 * dos cards). A mesma informação vai numa tabela escondida, para leitor de tela.
 */
export function DashboardPublications({ view }: { view: Pick<DashboardView, 'modalities' | 'publications'> }) {
  const [period, setPeriod] = useState<PublicationPeriod>('daily');
  const colors = useCoresGrafico();
  const chart = buildPublicationChart(view, period);

  const series: SerieBarras[] = chart.series.map((item) => ({
    chave: item.key,
    rotulo: item.label,
    cor: item.colorIndex === null ? colors.neutro : corDaPaleta(item.colorIndex, colors),
  }));
  const points: PontoBarras[] = chart.bars.map((bar) => ({ rotulo: bar.label, titulo: bar.title, valores: bar.values }));

  return (
    <DashboardCard
      title="Publicações"
      subtitle={SUBTITLES[period]}
      action={<ToggleGroup value={period} options={PERIOD_OPTIONS} onChange={(value) => setPeriod(value === 'monthly' ? 'monthly' : 'daily')} />}
      className="h-full"
    >
      {chart.total === 0 ? (
        <Vazio>Nenhum edital publicado no período.</Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            Total no período: <strong className="tabular-nums text-slate-900 dark:text-slate-100">{formatCount(chart.total)}</strong>
          </p>
          <Barras pontos={points} series={series} altura={CHART_HEIGHT} empilhar mostrarParte formatar={formatCount} />
          {series.length >= 2 && <Legenda itens={series.map((item) => ({ cor: typeof item.cor === 'string' ? item.cor : colors.neutro, nome: item.rotulo }))} />}
          <table className="sr-only">
            <caption>Publicações por {period === 'daily' ? 'dia' : 'mês'} e modalidade</caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                {chart.series.map((item) => (
                  <th key={item.key} scope="col">
                    {item.label}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {chart.bars.map((bar) => (
                <tr key={bar.key}>
                  <th scope="row">{bar.title}</th>
                  {chart.series.map((item) => (
                    <td key={item.key}>{bar.values[item.key] ?? 0}</td>
                  ))}
                  <td>{bar.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chart.note && <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{chart.note}</p>}
    </DashboardCard>
  );
}
