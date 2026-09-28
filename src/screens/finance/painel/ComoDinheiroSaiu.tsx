import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Secao } from './PainelLayout';
import { formatarPercentual, rotuloDoTrecho, rotuloForma } from './painelFormat';
import { PizzaPainel } from './PizzasPainel';

const compras = (quantidade: number) => `${quantidade} compra${quantidade === 1 ? '' : 's'}`;

export function ComoDinheiroSaiu({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const total = dados.resumo.saiu;
  const { aVista, parcelado } = dados.aVistaParcelado;
  const { fixo, parcela, livre } = dados.tipoGasto;
  const totalCartoes = dados.cartoes.reduce((soma, cartao) => soma + cartao.gasto, 0);
  const usoCredito = dados.serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, dados.serie.granularidade),
    credito: ponto.despesas > 0 ? (ponto.credito / ponto.despesas) * 100 : 0,
  }));
  const temCredito = dados.serie.pontos.some((ponto) => ponto.credito > 0);
  const temCartoes = dados.cartoes.length > 0;

  return (
    <Secao titulo="Como o dinheiro saiu">
      <div className={`grid gap-3 md:grid-cols-2 ${temCartoes ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <PizzaPainel
          titulo="Forma de pagamento"
          fatias={dados.formasPagamento.map((forma) => ({
            nome: rotuloForma(forma.forma),
            valor: forma.valor,
            detalhes: [
              compras(forma.quantidade),
              `Ticket ${formatCurrency(forma.valor / forma.quantidade)}`,
              ...(forma.juros > 0 ? [`Juros ${formatCurrency(forma.juros)}`] : []),
            ],
          }))}
          total={total}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
        />
        {temCartoes && (
          <PizzaPainel
            titulo="Cartões de crédito"
            fatias={dados.cartoes.map((cartao) => ({
              nome: cartao.nome,
              valor: cartao.gasto,
              detalhes: cartao.limite !== null && cartao.limite > 0 && cartao.usado !== null
                ? [`${formatarPercentual((cartao.usado / cartao.limite) * 100)} do limite em uso`]
                : undefined,
            }))}
            total={totalCartoes}
            rotuloCentro="Cartões"
            textoVazio="Sem gastos no cartão."
          />
        )}
        <PizzaPainel
          titulo="À vista × parcelado"
          fatias={[{ nome: 'À vista', valor: aVista }, { nome: 'Parcelado', valor: parcelado }]}
          total={total}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
        />
        <PizzaPainel
          titulo="Tipo de gasto"
          fatias={[{ nome: 'Fixo', valor: fixo }, { nome: 'Parcela', valor: parcela }, { nome: 'Livre', valor: livre }]}
          total={total}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
        />
      </div>

      {temCredito && (
        <CardPainel>
          <CabecalhoCard titulo="Uso do crédito" />
          <BarrasSerieChart
            pontos={usoCredito}
            series={[{ chave: 'credito', rotulo: 'No crédito', cor: cores.categorias[0]!, tipo: 'barra' }]}
            formatarValor={formatarPercentual}
            formatarEixo={formatarPercentual}
            altura={180}
          />
        </CardPainel>
      )}
    </Secao>
  );
}
