import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CardPainel, Legenda, Secao } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { contas, rotuloDoTrecho, trechoFuturo, unidadeDaSerie } from './painelFormat';

const TOM_NEUTRO = 'text-slate-900 dark:text-white';
const TOM_RECEITA = 'text-emerald-600 dark:text-emerald-400';
const TOM_ALERTA = 'text-amber-600 dark:text-amber-400';
const TOM_DESPESA = 'text-rose-600 dark:text-rose-400';

/** Número do card; a explicação dele fica no hover. */
function Numero({ rotulo, valor, complemento, explicacao, tom = TOM_NEUTRO }: {
  rotulo: string;
  valor: number;
  complemento?: string;
  explicacao?: string;
  tom?: string;
}) {
  return (
    <div className="grid gap-0.5" title={explicacao}>
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">{rotulo}{complemento && ` · ${complemento}`}</dt>
      <dd className={`m-0 text-[17px] font-medium tabular-nums ${tom}`}>{formatCurrency(valor)}</dd>
    </div>
  );
}

export function EmDiaComContas({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const { emDia, contasEmAberto } = dados;

  return (
    <Secao titulo="Em dia com as contas?">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CardPainel>
          <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">Contas do período</h3>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4">
            <Numero rotulo="Venceu no período" valor={emDia.cadastrado} />
            <Numero rotulo="Pago em dia" valor={emDia.pagoEmDia} tom={TOM_RECEITA} />
            <Numero rotulo="Pago com atraso" valor={emDia.pagoComAtraso} tom={emDia.pagoComAtraso > 0 ? TOM_ALERTA : TOM_NEUTRO} />
            <Numero rotulo="Ainda em aberto" valor={emDia.emAberto} />
            <Numero rotulo="Contas antigas pagas agora" valor={emDia.quitadoDeAnteriores} explicacao="Vencia antes do período e foi pago agora" />
          </dl>
          <div className="grid gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-700">
            <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">Situação de hoje</h3>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4">
              <Numero
                rotulo="Em atraso"
                complemento={contas(contasEmAberto.atraso.quantidade)}
                valor={contasEmAberto.atraso.valor}
                explicacao="De qualquer período"
                tom={contasEmAberto.atraso.valor > 0 ? TOM_DESPESA : TOM_NEUTRO}
              />
              <Numero
                rotulo="Próximos 30 dias"
                complemento={contas(contasEmAberto.proximos30Dias.quantidade)}
                valor={contasEmAberto.proximos30Dias.valor}
                tom={contasEmAberto.proximos30Dias.valor > 0 ? TOM_ALERTA : TOM_NEUTRO}
              />
            </dl>
          </div>
        </CardPainel>

        <CardPainel>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">Contas pagas em cada {unidadeDaSerie(dados.serie.granularidade).singular}</h3>
            <Legenda itens={[{ cor: cores.cadastrado, nome: 'Venceu' }, { cor: cores.pago, nome: 'Já pago' }]} />
          </div>
          <Barras
            altura={230}
            series={[
              { chave: 'cadastrado', rotulo: 'Venceu', cor: cores.cadastrado },
              { chave: 'pago', rotulo: 'Já pago', cor: cores.pago },
            ]}
            pontos={dados.serie.pontos.map((ponto) => ({
              rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, dados.serie.granularidade),
              futuro: trechoFuturo(ponto.inicio),
              valores: { cadastrado: ponto.despesas, pago: ponto.pago },
            }))}
          />
        </CardPainel>
      </div>
    </Secao>
  );
}
