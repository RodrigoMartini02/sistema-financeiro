import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { fatiasComOutras, useCoresGrafico, type CoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, RodapeCard, Secao, Vazio } from './PainelLayout';
import { FORMA_CREDITO, formatarPercentual, rotuloDoTrecho, rotuloForma, unidadeDaSerie } from './painelFormat';

// Acima disso o gasto fica concentrado demais numa forma, num cartão ou num tipo.
const FATIA_DOMINANTE = 0.5;
const FATIA_LIVRE_CONFORTAVEL = 0.7;

const paraDonut = (fatias: { nome: string; valor: number; cor: string }[]) =>
  fatias.map((fatia) => ({ name: fatia.nome, value: fatia.valor, color: fatia.cor }));

/** Cor de cada linha da tabela: a mesma da fatia; formas que caíram em "Outras" usam a cor dela. */
function corDaLinha(cores: CoresGrafico, indice: number, quantidade: number): string {
  const limite = cores.categorias.length;
  if (quantidade <= limite || indice < limite - 1) return cores.categorias[indice]!;
  return cores.categorias[limite - 1]!;
}

function FormasPagamento({ formas, total, ocupaLinhaInteira }: { formas: PainelData['formasPagamento']; total: number; ocupaLinhaInteira: boolean }) {
  const cores = useCoresGrafico();
  const fatias = fatiasComOutras(formas.map((forma) => ({ nome: rotuloForma(forma.forma), valor: forma.valor })), cores);
  const credito = formas.find((forma) => forma.forma === FORMA_CREDITO);
  const fatiaCredito = credito && total > 0 ? credito.valor / total : 0;
  const coluna = 'pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400';

  return (
    <CardPainel className={ocupaLinhaInteira ? 'lg:col-span-5' : 'lg:col-span-3'}>
      <CabecalhoCard titulo="Forma de pagamento" detalhe="como saiu" />
      {formas.length === 0 ? (
        <Vazio>Sem despesas no período.</Vazio>
      ) : (
        <>
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <DonutChart data={paraDonut(fatias)} centerLabel="Saiu" centerValue={formatCurrency(total)} mostrarLegenda={false} />
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="w-full min-w-[360px] border-collapse text-[12.5px] tabular-nums">
                <thead>
                  <tr>
                    <th className={`${coluna} text-left`}>Forma</th>
                    <th className={coluna}>%</th>
                    <th className={coluna}>Valor</th>
                    <th className={coluna}>Compras</th>
                    <th className={coluna}>Ticket</th>
                    <th className={coluna}>Juros</th>
                  </tr>
                </thead>
                <tbody>
                  {formas.map((forma, indice) => (
                    <tr key={forma.forma} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2 text-slate-900 dark:text-white">
                          <span className="h-2 w-2 rounded-full" style={{ background: corDaLinha(cores, indice, formas.length) }} />
                          {rotuloForma(forma.forma)}
                        </span>
                      </td>
                      <td className="text-right text-slate-400">{total > 0 ? formatarPercentual((forma.valor / total) * 100) : '—'}</td>
                      <td className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(forma.valor)}</td>
                      <td className="text-right text-slate-600 dark:text-slate-300">{forma.quantidade}</td>
                      <td className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(forma.valor / forma.quantidade)}</td>
                      <td className={`text-right ${forma.juros > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{formatCurrency(forma.juros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <RodapeCard>
            {fatiaCredito > FATIA_DOMINANTE
              ? 'Mais da metade saiu no crédito: o peso maior cai na fatura seguinte.'
              : 'O gasto está distribuído entre as formas de pagamento.'}
          </RodapeCard>
        </>
      )}
    </CardPainel>
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

function PizzaSimples({ titulo, detalhe, fatias, total, frase }: {
  titulo: string;
  detalhe: string;
  fatias: { nome: string; valor: number }[];
  total: number;
  frase: string;
}) {
  const cores = useCoresGrafico();
  const comValor = fatiasComOutras(fatias, cores).filter((fatia) => fatia.valor > 0);
  return (
    <CardPainel>
      <CabecalhoCard titulo={titulo} detalhe={detalhe} />
      {comValor.length === 0 ? (
        <Vazio>Sem despesas no período.</Vazio>
      ) : (
        <>
          <DonutChart data={paraDonut(comValor)} centerLabel="Saiu" centerValue={formatCurrency(total)} />
          <RodapeCard>{frase}</RodapeCard>
        </>
      )}
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
          fatias={[{ nome: 'À vista', valor: aVista }, { nome: 'Parcelado', valor: parcelado }]}
          frase={total > 0 && parcelado / total > FATIA_DOMINANTE
            ? 'Mais da metade do gasto foi parcelada: compromete os próximos meses.'
            : 'A maior parte do gasto foi à vista.'}
        />
        <PizzaSimples
          titulo="Tipo de gasto"
          detalhe="o que dá para cortar"
          total={total}
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
