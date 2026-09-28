import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, Vazio } from './PainelLayout';
import { rotuloDoTrecho } from './painelFormat';

export function ReceitaDespesa({ serie }: { serie: PainelData['serie'] }) {
  const cores = useCoresGrafico();
  const pontos = serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
    receitas: ponto.receitas,
    despesas: ponto.despesas,
    resultado: ponto.receitas - ponto.despesas,
  }));
  const temMovimento = pontos.some((ponto) => ponto.receitas > 0 || ponto.despesas > 0);

  return (
    <CardPainel>
      <CabecalhoCard titulo="Receita × despesa" />
      {!temMovimento ? (
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
        </>
      )}
    </CardPainel>
  );
}
