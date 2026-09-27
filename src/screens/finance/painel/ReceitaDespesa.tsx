import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, RodapeCard, Vazio } from './PainelLayout';
import { rotuloDoTrecho, unidadeDaSerie } from './painelFormat';

export function ReceitaDespesa({ serie }: { serie: PainelData['serie'] }) {
  const unidade = unidadeDaSerie(serie.granularidade);
  const pontos = serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
    receitas: ponto.receitas,
    despesas: ponto.despesas,
    resultado: ponto.receitas - ponto.despesas,
  }));
  const comMovimento = pontos.filter((ponto) => ponto.receitas > 0 || ponto.despesas > 0);

  const melhor = comMovimento.reduce<typeof pontos[number] | null>((atual, ponto) => (!atual || ponto.receitas > atual.receitas ? ponto : atual), null);
  const maiorGasto = comMovimento.reduce<typeof pontos[number] | null>((atual, ponto) => (!atual || ponto.despesas > atual.despesas ? ponto : atual), null);
  const noVermelho = comMovimento.filter((ponto) => ponto.resultado < 0).length;

  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
      <CabecalhoCard titulo="Receita × despesa" detalhe={`por ${unidade.singular} do período`} />
      {comMovimento.length === 0 ? (
        <Vazio>Sem lançamentos no período.</Vazio>
      ) : (
        <>
          <BarrasSerieChart
            pontos={pontos}
            series={[
              { chave: 'receitas', rotulo: 'Receitas', cor: '#10b981', tipo: 'barra' },
              { chave: 'despesas', rotulo: 'Despesas', cor: '#ef4444', tipo: 'barra' },
              { chave: 'resultado', rotulo: 'Resultado', cor: '#6366f1', tipo: 'linha' },
            ]}
          />
          <RodapeCard>
            {melhor && <>Melhor {unidade.singular} <b className="text-[#0f2b38] dark:text-slate-100">{melhor.rotulo} · {formatCurrency(melhor.receitas)}</b> · </>}
            {maiorGasto && <>Maior gasto <b className="text-[#0f2b38] dark:text-slate-100">{maiorGasto.rotulo} · {formatCurrency(maiorGasto.despesas)}</b> · </>}
            <b className={noVermelho > 0 ? 'text-[#b42318] dark:text-rose-300' : 'text-[#067647] dark:text-emerald-300'}>
              {noVermelho === 0
                ? `Nenhum${unidade.singular === 'semana' ? 'a' : ''} ${unidade.singular} no vermelho`
                : `${noVermelho} ${noVermelho === 1 ? unidade.singular : unidade.plural} no vermelho`}
            </b>
          </RodapeCard>
        </>
      )}
    </Card>
  );
}
