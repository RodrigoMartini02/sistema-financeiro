import { Card } from '../../../ui/card';
import type { PainelData, PainelPeriodo } from '../../../types/finance';
import { BarrasMensaisChart } from '../charts/BarrasMensaisChart';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, Secao } from './PainelLayout';
import { contas, rotuloDoMesFinal, rotuloDoPonto } from './painelFormat';

interface EmDiaComContasProps {
  dados: PainelData;
  periodo: PainelPeriodo;
}

function Numero({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: number; detalhe?: string; tom?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11.5px] text-[#5f7885] dark:text-slate-400">{rotulo}</dt>
      <dd className={`m-0 text-[17px] font-bold tabular-nums ${tom ?? 'text-[#0f2b38] dark:text-white'}`}>{formatCurrency(valor)}</dd>
      {detalhe && <dd className="m-0 text-[11px] text-[#7b93a1] dark:text-slate-400">{detalhe}</dd>}
    </div>
  );
}

export function EmDiaComContas({ dados, periodo }: EmDiaComContasProps) {
  const { emDia, contasEmAberto } = dados;
  const periodoDentroDeUmMes = periodo.de.slice(0, 7) === periodo.ate.slice(0, 7);
  const pontos = dados.serie.pontos.map((ponto) => ({
    rotulo: rotuloDoPonto(ponto.ano, ponto.mes),
    cadastrado: ponto.despesas,
    pago: ponto.pago,
  }));
  const tomAtraso = contasEmAberto.atraso.valor > 0 ? 'text-[#b42318] dark:text-rose-300' : undefined;
  const tomProximos = contasEmAberto.proximos30Dias.valor > 0 ? 'text-[#b54708] dark:text-amber-300' : undefined;

  return (
    <Secao titulo="Em dia com as contas?">
      <div className="grid gap-3.5 lg:grid-cols-5">
        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px] lg:col-span-2">
          <CabecalhoCard titulo="Contas do período" detalhe="pelo vencimento" />
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            <Numero rotulo="Cadastrado" valor={emDia.cadastrado} />
            <Numero rotulo="Pago em dia" valor={emDia.pagoEmDia} tom="text-[#067647] dark:text-emerald-300" />
            <Numero rotulo="Pago com atraso" valor={emDia.pagoComAtraso} tom={emDia.pagoComAtraso > 0 ? 'text-[#b54708] dark:text-amber-300' : undefined} />
            <Numero rotulo="Ainda em aberto" valor={emDia.emAberto} />
            <Numero
              rotulo="Atraso quitado no período"
              valor={emDia.quitadoDeAnteriores}
              detalhe="vencia antes, foi pago agora"
            />
          </dl>
          <CabecalhoCard titulo="Situação de hoje" detalhe="independe do período" />
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            <Numero
              rotulo="Em atraso"
              valor={contasEmAberto.atraso.valor}
              detalhe={`${contas(contasEmAberto.atraso.quantidade)}, de qualquer período`}
              tom={tomAtraso}
            />
            <Numero
              rotulo="Próximos 30 dias"
              valor={contasEmAberto.proximos30Dias.valor}
              detalhe={contas(contasEmAberto.proximos30Dias.quantidade)}
              tom={tomProximos}
            />
          </dl>
        </Card>

        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px] lg:col-span-3">
          <CabecalhoCard
            titulo="Cadastrado × pago"
            detalhe={periodoDentroDeUmMes ? 'últimos 12 meses' : 'por mês do período'}
          />
          <BarrasMensaisChart
            pontos={pontos}
            destaque={periodoDentroDeUmMes ? rotuloDoMesFinal(periodo) : undefined}
            series={[
              { chave: 'cadastrado', rotulo: 'Cadastrado (vence no mês)', cor: '#c7d2fe', tipo: 'barra' },
              { chave: 'pago', rotulo: 'Pago no mês', cor: '#6366f1', tipo: 'barra' },
            ]}
          />
          <p className="m-0 text-[11.5px] text-[#5f7885] dark:text-slate-400">
            Pago abaixo do cadastrado: sobrou conta em aberto. Pago acima: você está quitando atraso.
          </p>
        </Card>
      </div>
    </Secao>
  );
}
