import type { PainelData } from '../../../types/finance';
import { CardPainel, Legenda, Secao, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { formatarComSinal, rotuloDoTrecho, trechoFuturo } from './painelFormat';

/**
 * Entradas e saídas por trecho do período; o que ainda vai vencer aparece em
 * cinza. Com o Painel filtrado só as despesas seguem o filtro: o gráfico mostra
 * só as saídas, sem comparar com a receita inteira.
 */
export function ReceitaDespesa({ serie, somenteDespesas = false }: { serie: PainelData['serie']; somenteDespesas?: boolean }) {
  const cores = useCoresGrafico();
  const temMovimento = serie.pontos.some((ponto) => (!somenteDespesas && ponto.receitas > 0) || ponto.despesas > 0 || (ponto.forecast ?? 0) > 0);
  const hasForecasts = serie.pontos.some(point => (point.forecast ?? 0) > 0);
  const temFuturo = serie.pontos.some((ponto) => trechoFuturo(ponto.inicio) && ponto.despesas > 0);

  return (
    <Secao titulo={somenteDespesas ? 'Saídas' : 'Entradas e saídas'}>
      <CardPainel>
        {!temMovimento ? (
          <Vazio>Sem lançamentos no período.</Vazio>
        ) : (
          <>
            <Legenda itens={[
              ...(somenteDespesas ? [] : [{ cor: cores.receita, nome: 'Entrou' }]),
              { cor: cores.despesa, nome: 'Lançado' },
              ...(temFuturo ? [{ cor: cores.futuro, nome: 'Ainda vai vencer' }] : []),
              ...(hasForecasts ? [{ cor: cores.despesa, nome: 'Previsão · hachurada' }] : []),
            ]} />
            <Barras
              altura={240}
              series={[
                ...(somenteDespesas ? [] : [{ chave: 'receitas', rotulo: 'Entrou', cor: cores.receita }]),
                { chave: 'despesas', rotulo: 'Lançado', cor: cores.despesa, corFuturo: cores.futuro, pilha: 'despesas' },
                ...(hasForecasts ? [{ chave: 'forecast', rotulo: 'Previsto', cor: cores.despesa, pilha: 'despesas', padrao: true }] : []),
              ]}
              pontos={serie.pontos.map((ponto) => {
                const valores: Record<string, number> = somenteDespesas
                  ? { despesas: ponto.despesas, forecast: ponto.forecast ?? 0 }
                  : { receitas: ponto.receitas, despesas: ponto.despesas, forecast: ponto.forecast ?? 0 };
                return { rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade), futuro: trechoFuturo(ponto.inicio), valores };
              })}
              linhasExtras={somenteDespesas
                ? undefined
                : (ponto) => [['Resultado', formatarComSinal(ponto.valores.receitas! - ponto.valores.despesas!)]]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
