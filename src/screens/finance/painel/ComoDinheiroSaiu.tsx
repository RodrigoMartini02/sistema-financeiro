import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { PALETA } from '../memberColors';
import { CabecalhoCard, RodapeCard, Secao, Vazio } from './PainelLayout';
import { FORMA_CREDITO, formatarPercentual, rotuloDoTrecho, rotuloForma, unidadeDaSerie } from './painelFormat';

const COR_A_VISTA = '#10b981';
const COR_PARCELADO = '#6366f1';
const COR_FIXO = '#6366f1';
const COR_PARCELA = '#a5b4fc';
const COR_LIVRE = '#c7d2fe';
// Acima disso o gasto fica concentrado demais numa forma ou num cartão.
const FATIA_DOMINANTE = 0.5;

interface ComoDinheiroSaiuProps {
  dados: PainelData;
}

function FormasPagamento({ formas, total, ocupaLinhaInteira }: { formas: PainelData['formasPagamento']; total: number; ocupaLinhaInteira: boolean }) {
  const comCor = formas.map((forma, indice) => ({ ...forma, cor: PALETA[indice % PALETA.length]! }));
  const credito = formas.find((forma) => forma.forma === FORMA_CREDITO);
  const fatiaCredito = credito && total > 0 ? credito.valor / total : 0;

  return (
    <Card className={`flex flex-col gap-4 rounded-2xl p-[18px_20px] ${ocupaLinhaInteira ? 'lg:col-span-5' : 'lg:col-span-3'}`}>
      <CabecalhoCard titulo="Forma de pagamento" detalhe="como saiu" />
      {comCor.length === 0 ? (
        <Vazio>Sem despesas no período.</Vazio>
      ) : (
        <>
          <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
            <DonutChart
              data={comCor.map((forma) => ({ name: rotuloForma(forma.forma), value: forma.valor, color: forma.cor }))}
              centerLabel="SAIU"
              centerValue={formatCurrency(total)}
              mostrarLegenda={false}
            />
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[380px] text-[12px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[#7b93a1]">
                    <th className="pb-2 font-semibold">Forma</th>
                    <th className="pb-2 text-right font-semibold">%</th>
                    <th className="pb-2 text-right font-semibold">Valor</th>
                    <th className="pb-2 text-right font-semibold">Compras</th>
                    <th className="pb-2 text-right font-semibold">Ticket</th>
                    <th className="pb-2 text-right font-semibold">Juros</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-[#0f2b38] dark:text-slate-100">
                  {comCor.map((forma) => (
                    <tr key={forma.forma} className="border-t border-[#eef4f7] dark:border-slate-700">
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: forma.cor }} />
                          {rotuloForma(forma.forma)}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-[#7b93a1]">{total > 0 ? formatarPercentual((forma.valor / total) * 100) : '—'}</td>
                      <td className="py-1.5 text-right font-semibold">{formatCurrency(forma.valor)}</td>
                      <td className="py-1.5 text-right">{forma.quantidade}</td>
                      <td className="py-1.5 text-right">{formatCurrency(forma.valor / forma.quantidade)}</td>
                      <td className={`py-1.5 text-right ${forma.juros > 0 ? 'text-[#b42318] dark:text-rose-300' : 'text-[#7b93a1]'}`}>
                        {formatCurrency(forma.juros)}
                      </td>
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
    </Card>
  );
}

function CartoesDeCredito({ cartoes }: { cartoes: PainelData['cartoes'] }) {
  const total = cartoes.reduce((soma, cartao) => soma + cartao.gasto, 0);
  const comCor = cartoes.map((cartao, indice) => ({ ...cartao, cor: PALETA[indice % PALETA.length]! }));
  const maior = comCor[0];

  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px] lg:col-span-2">
      <CabecalhoCard titulo="Cartões de crédito" detalhe="em qual cartão" />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <DonutChart
          data={comCor.map((cartao) => ({ name: cartao.nome, value: cartao.gasto, color: cartao.cor }))}
          centerLabel="CARTÕES"
          centerValue={formatCurrency(total)}
          mostrarLegenda={false}
        />
        <ul className="w-full space-y-2.5 text-xs">
          {comCor.map((cartao) => (
            <li key={cartao.id} className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cartao.cor }} />
                  <span className="truncate text-slate-700 dark:text-slate-300">{cartao.nome}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(cartao.gasto)}</span>
              </span>
              {cartao.limite !== null && cartao.limite > 0 && cartao.usado !== null && (
                <span className="pl-3.5 text-[11px] text-[#7b93a1]">
                  {formatarPercentual((cartao.usado / cartao.limite) * 100)} do limite em uso
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <RodapeCard>
        {comCor.length === 1
          ? 'Todo o gasto em cartão passa por um único cartão.'
          : maior && total > 0 && maior.gasto / total > FATIA_DOMINANTE
            ? `${maior.nome} concentra a maior parte do gasto em cartão.`
            : 'O gasto está distribuído entre os cartões.'}
      </RodapeCard>
    </Card>
  );
}

function PizzaSimples({ titulo, detalhe, fatias, centro, total, frase }: {
  titulo: string;
  detalhe: string;
  fatias: { name: string; value: number; color: string }[];
  centro: string;
  total: number;
  frase: string;
}) {
  const comValor = fatias.filter((fatia) => fatia.value > 0);
  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px]">
      <CabecalhoCard titulo={titulo} detalhe={detalhe} />
      {comValor.length === 0 ? (
        <Vazio>Sem despesas no período.</Vazio>
      ) : (
        <>
          <DonutChart data={comValor} centerLabel={centro} centerValue={formatCurrency(total)} />
          <RodapeCard>{frase}</RodapeCard>
        </>
      )}
    </Card>
  );
}

export function ComoDinheiroSaiu({ dados }: ComoDinheiroSaiuProps) {
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
      <div className="grid gap-3.5 lg:grid-cols-5">
        <FormasPagamento formas={dados.formasPagamento} total={total} ocupaLinhaInteira={dados.cartoes.length === 0} />
        {dados.cartoes.length > 0 && <CartoesDeCredito cartoes={dados.cartoes} />}
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <PizzaSimples
          titulo="À vista × parcelado"
          detalhe="o que arrasta para os próximos meses"
          centro="SAIU"
          total={total}
          fatias={[
            { name: 'À vista', value: aVista, color: COR_A_VISTA },
            { name: 'Parcelado', value: parcelado, color: COR_PARCELADO },
          ]}
          frase={total > 0 && parcelado / total > FATIA_DOMINANTE
            ? 'Mais da metade do gasto foi parcelada: compromete os próximos meses.'
            : 'A maior parte do gasto foi à vista.'}
        />
        <PizzaSimples
          titulo="Tipo de gasto"
          detalhe="o que dá para cortar"
          centro="SAIU"
          total={total}
          fatias={[
            { name: 'Fixo', value: fixo, color: COR_FIXO },
            { name: 'Parcela', value: parcela, color: COR_PARCELA },
            { name: 'Livre', value: livre, color: COR_LIVRE },
          ]}
          frase={total > 0 && livre / total >= 0.7
            ? 'A maior parte do gasto é livre: dá para cortar sem mexer em compromissos.'
            : total > 0 && (fixo + parcela) / total >= FATIA_DOMINANTE
              ? 'Mais da metade já está comprometida entre fixas e parcelas.'
              : 'O gasto se divide entre compromissos assumidos e gasto livre.'}
        />
      </div>

      {temCredito && (
        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
          <CabecalhoCard
            titulo="Uso do crédito"
            detalhe={`% do gasto no crédito · por ${unidadeDaSerie(dados.serie.granularidade).singular}`}
          />
          <BarrasSerieChart
            pontos={usoCredito}
            series={[{ chave: 'credito', rotulo: 'No crédito', cor: '#0891b2', tipo: 'barra' }]}
            formatarValor={formatarPercentual}
            formatarEixo={formatarPercentual}
            altura={200}
          />
        </Card>
      )}
    </Secao>
  );
}
