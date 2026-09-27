import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { fatiasComOutras, useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, RodapeCard, Secao } from './PainelLayout';
import { FORMA_CREDITO, formatarPercentual, rotuloDoTrecho, rotuloForma, unidadeDaSerie } from './painelFormat';
import { corDaLinha, paraDonut, PizzaComTabela, PizzaSimples } from './PizzasPainel';

// Acima disso o gasto fica concentrado demais numa forma, num cartão ou num tipo.
const FATIA_DOMINANTE = 0.5;
const FATIA_LIVRE_CONFORTAVEL = 0.7;

type LinhaForma = PainelData['formasPagamento'][number] & { chave: string; nome: string };

function FormasPagamento({ formas, total, ocupaLinhaInteira }: { formas: PainelData['formasPagamento']; total: number; ocupaLinhaInteira: boolean }) {
  const credito = formas.find((forma) => forma.forma === FORMA_CREDITO);
  const fatiaCredito = credito && total > 0 ? credito.valor / total : 0;

  return (
    <PizzaComTabela<LinhaForma>
      titulo="Forma de pagamento"
      detalhe="como saiu"
      className={ocupaLinhaInteira ? 'lg:col-span-5' : 'lg:col-span-3'}
      textoVazio="Sem despesas no período."
      rotuloCentro="Saiu"
      total={total}
      tituloPrimeiraColuna="Forma"
      linhas={formas.map((forma) => ({ ...forma, chave: forma.forma, nome: rotuloForma(forma.forma) }))}
      colunas={[
        { titulo: 'Compras', celula: (forma) => forma.quantidade },
        { titulo: 'Ticket', celula: (forma) => formatCurrency(forma.valor / forma.quantidade) },
        {
          titulo: 'Juros',
          celula: (forma) => formatCurrency(forma.juros),
          classe: (forma) => (forma.juros > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'),
        },
      ]}
      rodape={fatiaCredito > FATIA_DOMINANTE
        ? 'Mais da metade saiu no crédito: o peso maior cai na fatura seguinte.'
        : 'O gasto está distribuído entre as formas de pagamento.'}
    />
  );
}

function CartoesDeCredito({ cartoes }: { cartoes: PainelData['cartoes'] }) {
  const cores = useCoresGrafico();
  const total = cartoes.reduce((soma, cartao) => soma + cartao.gasto, 0);
  const fatias = fatiasComOutras(cartoes.map((cartao) => ({ nome: cartao.nome, valor: cartao.gasto })), cores);
  const maior = cartoes[0];

  return (
    <CardPainel className="lg:col-span-2">
      <CabecalhoCard titulo="Cartões de crédito" detalhe="em qual cartão" />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <DonutChart data={paraDonut(fatias)} centerLabel="Cartões" centerValue={formatCurrency(total)} mostrarLegenda={false} />
        <ul className="m-0 flex w-full min-w-0 list-none flex-col gap-2.5 p-0 text-[12.5px]">
          {cartoes.map((cartao, indice) => (
            <li key={cartao.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDaLinha(cores, indice, cartoes.length) }} />
                <span className="truncate text-slate-900 dark:text-white">{cartao.nome}</span>
                <span className="text-[11.5px] text-slate-400">{total > 0 ? formatarPercentual((cartao.gasto / total) * 100) : '—'}</span>
                <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(cartao.gasto)}</span>
              </span>
              {cartao.limite !== null && cartao.limite > 0 && cartao.usado !== null && (
                <span className="pl-4 text-[11.5px] text-slate-500 dark:text-slate-400">
                  {formatarPercentual((cartao.usado / cartao.limite) * 100)} do limite em uso
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <RodapeCard>
        {cartoes.length === 1
          ? 'Todo o gasto em cartão passa por um único cartão.'
          : maior && total > 0 && maior.gasto / total > FATIA_DOMINANTE
            ? `${maior.nome} concentra a maior parte do gasto em cartão.`
            : 'O gasto está distribuído entre os cartões.'}
      </RodapeCard>
    </CardPainel>
  );
}

export function ComoDinheiroSaiu({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const total = dados.resumo.saiu;
  const { aVista, parcelado } = dados.aVistaParcelado;
  const { fixo, parcela, livre } = dados.tipoGasto;
  const usoCredito = dados.serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, dados.serie.granularidade),
    credito: ponto.despesas > 0 ? (ponto.credito / ponto.despesas) * 100 : 0,
  }));
  const temCredito = dados.serie.pontos.some((ponto) => ponto.credito > 0);

  return (
    <Secao titulo="Como o dinheiro saiu">
      <div className="grid gap-3 lg:grid-cols-5">
        <FormasPagamento formas={dados.formasPagamento} total={total} ocupaLinhaInteira={dados.cartoes.length === 0} />
        {dados.cartoes.length > 0 && <CartoesDeCredito cartoes={dados.cartoes} />}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PizzaSimples
          titulo="À vista × parcelado"
          detalhe="o que arrasta para os próximos meses"
          total={total}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
          fatias={[{ nome: 'À vista', valor: aVista }, { nome: 'Parcelado', valor: parcelado }]}
          frase={total > 0 && parcelado / total > FATIA_DOMINANTE
            ? 'Mais da metade do gasto foi parcelada: compromete os próximos meses.'
            : 'A maior parte do gasto foi à vista.'}
        />
        <PizzaSimples
          titulo="Tipo de gasto"
          detalhe="o que dá para cortar"
          total={total}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
          fatias={[{ nome: 'Fixo', valor: fixo }, { nome: 'Parcela', valor: parcela }, { nome: 'Livre', valor: livre }]}
          frase={total > 0 && livre / total >= FATIA_LIVRE_CONFORTAVEL
            ? 'A maior parte do gasto é livre: dá para cortar sem mexer em compromissos.'
            : total > 0 && (fixo + parcela) / total >= FATIA_DOMINANTE
              ? 'Mais da metade já está comprometida entre fixas e parcelas.'
              : 'O gasto se divide entre compromissos assumidos e gasto livre.'}
        />
      </div>

      {temCredito && (
        <CardPainel>
          <CabecalhoCard titulo="Uso do crédito" detalhe={`% do gasto no crédito · por ${unidadeDaSerie(dados.serie.granularidade).singular}`} />
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
