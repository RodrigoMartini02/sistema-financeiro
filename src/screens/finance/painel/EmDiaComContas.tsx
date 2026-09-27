import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, RodapeCard, Secao } from './PainelLayout';
import { contas, rotuloDoTrecho, unidadeDaSerie } from './painelFormat';

const TOM_NEUTRO = 'text-slate-900 dark:text-white';
const TOM_RECEITA = 'text-emerald-600 dark:text-emerald-400';
const TOM_ALERTA = 'text-amber-600 dark:text-amber-400';
const TOM_DESPESA = 'text-rose-600 dark:text-rose-400';

function Numero({ rotulo, valor, detalhe, tom = TOM_NEUTRO }: { rotulo: string; valor: number; detalhe?: string; tom?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{rotulo}</dt>
      <dd className={`m-0 text-base font-bold tracking-tight tabular-nums ${tom}`}>{formatCurrency(valor)}</dd>
      {detalhe && <dd className="m-0 text-[11.5px] text-slate-400">{detalhe}</dd>}
    </div>
  );
}

export function EmDiaComContas({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const { emDia, contasEmAberto } = dados;
  const pontos = dados.serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, dados.serie.granularidade),
    cadastrado: ponto.despesas,
    pago: ponto.pago,
  }));

  return (
    <Secao titulo="Em dia com as contas?">
      <div className="grid gap-3 lg:grid-cols-5">
        <CardPainel className="lg:col-span-2">
          <CabecalhoCard titulo="Contas do período" detalhe="pelo vencimento" />
          <dl className="m-0 grid grid-cols-2 gap-3.5">
            <Numero rotulo="Cadastrado" valor={emDia.cadastrado} />
            <Numero rotulo="Pago em dia" valor={emDia.pagoEmDia} tom={TOM_RECEITA} />
            <Numero rotulo="Pago com atraso" valor={emDia.pagoComAtraso} tom={emDia.pagoComAtraso > 0 ? TOM_ALERTA : TOM_NEUTRO} />
            <Numero rotulo="Ainda em aberto" valor={emDia.emAberto} />
            <Numero rotulo="Atraso quitado no período" valor={emDia.quitadoDeAnteriores} detalhe="vencia antes, foi pago agora" />
          </dl>
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
            <CabecalhoCard titulo="Situação de hoje" detalhe="independe do período" />
            <dl className="m-0 grid grid-cols-2 gap-3.5">
              <Numero
                rotulo="Em atraso"
                valor={contasEmAberto.atraso.valor}
                detalhe={`${contas(contasEmAberto.atraso.quantidade)}, de qualquer período`}
                tom={contasEmAberto.atraso.valor > 0 ? TOM_DESPESA : TOM_NEUTRO}
              />
              <Numero
                rotulo="Próximos 30 dias"
                valor={contasEmAberto.proximos30Dias.valor}
                detalhe={contas(contasEmAberto.proximos30Dias.quantidade)}
                tom={contasEmAberto.proximos30Dias.valor > 0 ? TOM_ALERTA : TOM_NEUTRO}
              />
            </dl>
          </div>
        </CardPainel>

        <CardPainel className="lg:col-span-3">
          <CabecalhoCard titulo="Cadastrado × pago" detalhe={`por ${unidadeDaSerie(dados.serie.granularidade).singular} do período`} />
          <Legenda itens={[
            { cor: cores.cadastrado, nome: 'Cadastrado (pelo vencimento)' },
            { cor: cores.pago, nome: 'Pago (pela data de pagamento)' },
          ]} />
          <BarrasSerieChart
            pontos={pontos}
            altura={200}
            series={[
              { chave: 'cadastrado', rotulo: 'Cadastrado', cor: cores.cadastrado, tipo: 'barra' },
              { chave: 'pago', rotulo: 'Pago', cor: cores.pago, tipo: 'barra' },
            ]}
          />
          <RodapeCard>Pago abaixo do cadastrado: sobrou conta em aberto. Pago acima: você está quitando atraso.</RodapeCard>
        </CardPainel>
      </div>
    </Secao>
  );
}
