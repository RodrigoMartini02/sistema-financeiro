import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, Legenda, Secao, Totais, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { rotuloDoMes } from './painelFormat';

/** Lançadas e previsões que vencem nos próximos 6 meses, a partir de hoje. */
export function Comprometido({ meses }: { meses: PainelData['contasEmAberto']['comprometido'] }) {
  const cores = useCoresGrafico();
  const totalParcelas = meses.reduce((soma, mes) => soma + mes.parcelas, 0);
  const totalOutras = meses.reduce((soma, mes) => soma + mes.outras, 0);
  const forecastTotal = meses.reduce((sum, month) => sum + (month.forecast ?? 0), 0);
  const corParcelas = cores.categorias[2]!;
  const corOutras = cores.categorias[1]!;

  return (
    <Secao titulo="O que já está comprometido?">
      <CardPainel>
        <CabecalhoCard titulo="Contas a vencer nos próximos 6 meses" valor={formatCurrency(totalParcelas + totalOutras + forecastTotal)} />
        {totalParcelas + totalOutras + forecastTotal === 0 ? (
          <Vazio>Nada lançado para os próximos meses.</Vazio>
        ) : (
          <>
            <Totais itens={[
              { rotulo: 'Parcelas', valor: formatCurrency(totalParcelas) },
              { rotulo: 'Demais contas', valor: formatCurrency(totalOutras) },
              ...(forecastTotal > 0 ? [{ rotulo: 'Previsto', valor: formatCurrency(forecastTotal) }] : []),
            ]} />
            <Legenda itens={[{ cor: corParcelas, nome: 'Parcelas' }, { cor: corOutras, nome: 'Demais contas' }, ...(forecastTotal > 0 ? [{ cor: cores.neutro, nome: 'Previsão · hachurada' }] : [])]} />
            <Barras
              altura={190}
              empilhar
              series={[
                { chave: 'parcelas', rotulo: 'Parcelas', cor: corParcelas },
                { chave: 'outras', rotulo: 'Demais contas', cor: corOutras },
                ...(forecastTotal > 0 ? [{ chave: 'forecast', rotulo: 'Previsto', cor: cores.neutro, padrao: true }] : []),
              ]}
              pontos={meses.map((mes) => ({
                rotulo: rotuloDoMes(mes.ano, mes.mes),
                valores: { parcelas: mes.parcelas, outras: mes.outras, forecast: mes.forecast ?? 0 },
              }))}
              linhasExtras={(ponto) => [['Total', formatCurrency(ponto.valores.parcelas! + ponto.valores.outras! + (ponto.valores.forecast ?? 0))]]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
