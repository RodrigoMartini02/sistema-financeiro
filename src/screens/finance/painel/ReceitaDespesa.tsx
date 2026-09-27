import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, RodapeCard, Vazio } from './PainelLayout';
import { rotuloDoTrecho, unidadeDaSerie } from './painelFormat';

const DESTAQUE = 'font-semibold text-slate-900 dark:text-white';

export function ReceitaDespesa({ serie }: { serie: PainelData['serie'] }) {
  const cores = useCoresGrafico();
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
    <CardPainel>
      <CabecalhoCard titulo="Receita × despesa" detalhe={`por ${unidade.singular} do período`} />
      {comMovimento.length === 0 ? (
        <Vazio>Sem lançamentos no período.</Vazio>
      ) : (
        <>
          <Legenda itens={[
            { cor: cores.receita, nome: 'Receitas' },
            { cor: cores.despesa, nome: 'Despesas' },
            { cor: cores.resultado, nome: 'Resultado', linha: true },
          ]} />
          <BarrasSerieChart
            pontos={pontos}
            series={[
              { chave: 'receitas', rotulo: 'Receitas', cor: cores.receita, tipo: 'barra' },
              { chave: 'despesas', rotulo: 'Despesas', cor: cores.despesa, tipo: 'barra' },
              { chave: 'resultado', rotulo: 'Resultado', cor: cores.resultado, tipo: 'linha' },
            ]}
          />
          <RodapeCard>
            {melhor && <>Melhor {unidade.singular} <b className={DESTAQUE}>{melhor.rotulo} · {formatCurrency(melhor.receitas)}</b> · </>}
            {maiorGasto && <>Maior gasto <b className={DESTAQUE}>{maiorGasto.rotulo} · {formatCurrency(maiorGasto.despesas)}</b> · </>}
            <b className={`font-semibold ${noVermelho > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {noVermelho === 0
                ? `Nenhum${unidade.singular === 'semana' ? 'a' : ''} ${unidade.singular} no vermelho`
                : `${noVermelho} ${noVermelho === 1 ? unidade.singular : unidade.plural} no vermelho`}
            </b>
          </RodapeCard>
        </>
      )}
    </CardPainel>
  );
}
