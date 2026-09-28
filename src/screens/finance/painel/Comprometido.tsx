import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, Legenda, Secao, Totais, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { rotuloDoMes } from './painelFormat';

/** Contas já lançadas que vencem nos próximos 6 meses, a partir de hoje. */
export function Comprometido({ meses }: { meses: PainelData['contasEmAberto']['comprometido'] }) {
  const cores = useCoresGrafico();
  const totalParcelas = meses.reduce((soma, mes) => soma + mes.parcelas, 0);
  const totalOutras = meses.reduce((soma, mes) => soma + mes.outras, 0);
  const corParcelas = cores.categorias[2]!;
  const corOutras = cores.categorias[1]!;

  return (
    <Secao titulo="O que já está comprometido?">
      <CardPainel>
        <CabecalhoCard titulo="Contas a vencer nos próximos 6 meses" valor={formatCurrency(totalParcelas + totalOutras)} />
        {totalParcelas + totalOutras === 0 ? (
          <Vazio>Nada lançado para os próximos meses.</Vazio>
        ) : (
          <>
            <Totais itens={[
              { rotulo: 'Parcelas', valor: formatCurrency(totalParcelas) },
              { rotulo: 'Demais contas', valor: formatCurrency(totalOutras) },
            ]} />
            <Legenda itens={[{ cor: corParcelas, nome: 'Parcelas' }, { cor: corOutras, nome: 'Demais contas' }]} />
            <Barras
              altura={190}
              empilhar
              series={[
                { chave: 'parcelas', rotulo: 'Parcelas', cor: corParcelas },
                { chave: 'outras', rotulo: 'Demais contas', cor: corOutras },
              ]}
              pontos={meses.map((mes) => ({
                rotulo: rotuloDoMes(mes.ano, mes.mes),
                valores: { parcelas: mes.parcelas, outras: mes.outras },
              }))}
              linhasExtras={(ponto) => [['Total', formatCurrency(ponto.valores.parcelas! + ponto.valores.outras!)]]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
