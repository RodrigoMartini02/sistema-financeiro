import type { PainelData } from '../../../types/finance';
import { CardPainel, Legenda, Secao, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { formatarComSinal, rotuloDoTrecho, trechoFuturo } from './painelFormat';

/** Entradas e saídas por trecho do período; o que ainda vai vencer aparece em cinza. */
export function ReceitaDespesa({ serie }: { serie: PainelData['serie'] }) {
  const cores = useCoresGrafico();
  const temMovimento = serie.pontos.some((ponto) => ponto.receitas > 0 || ponto.despesas > 0);
  const temFuturo = serie.pontos.some((ponto) => trechoFuturo(ponto.inicio) && ponto.despesas > 0);

  return (
    <Secao titulo="Entradas e saídas">
      <CardPainel>
        {!temMovimento ? (
          <Vazio>Sem lançamentos no período.</Vazio>
        ) : (
          <>
            <Legenda itens={[
              { cor: cores.receita, nome: 'Entrou' },
              { cor: cores.despesa, nome: 'Saiu' },
              ...(temFuturo ? [{ cor: cores.futuro, nome: 'Ainda vai vencer' }] : []),
            ]} />
            <Barras
              altura={240}
              series={[
                { chave: 'receitas', rotulo: 'Entrou', cor: cores.receita },
                { chave: 'despesas', rotulo: 'Saiu', cor: cores.despesa, corFuturo: cores.futuro },
              ]}
              pontos={serie.pontos.map((ponto) => ({
                rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
                futuro: trechoFuturo(ponto.inicio),
                valores: { receitas: ponto.receitas, despesas: ponto.despesas },
              }))}
              linhasExtras={(ponto) => [['Resultado', formatarComSinal(ponto.valores.receitas! - ponto.valores.despesas!)]]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
