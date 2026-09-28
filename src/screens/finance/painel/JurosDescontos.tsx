import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, Secao } from './PainelLayout';
import { rotuloDoTrecho } from './painelFormat';

const TOM_JUROS = 'text-rose-600 dark:text-rose-400';
const TOM_DESCONTO = 'text-emerald-600 dark:text-emerald-400';
const TEXTO = 'm-0 text-[12.5px] text-slate-500 dark:text-slate-400';

interface JurosDescontosProps {
  valores: PainelData['jurosDescontos'];
  /** Mesma série dos outros gráficos: semanas no mês, meses no ano. */
  serie: PainelData['serie'];
  /** Ano do fim do período — o acumulado vai de janeiro até a data final. */
  ano: string;
}

function Totais({ juros, descontos }: { juros: number; descontos: number }) {
  const saldo = descontos - juros;
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] tabular-nums text-slate-500 dark:text-slate-400">
      <span>Juros pagos <b className={`font-semibold ${TOM_JUROS}`}>{formatCurrency(juros)}</b></span>
      <span>Descontos obtidos <b className={`font-semibold ${TOM_DESCONTO}`}>{formatCurrency(descontos)}</b></span>
      <span className="ml-auto">
        Saldo{' '}
        <b className={`font-semibold ${saldo >= 0 ? TOM_DESCONTO : TOM_JUROS}`}>
          {saldo >= 0 ? '+' : '−'} {formatCurrency(Math.abs(saldo))}
        </b>
      </span>
    </div>
  );
}

export function JurosDescontos({ valores, serie, ano }: JurosDescontosProps) {
  const cores = useCoresGrafico();
  const { periodo, ano: doAno } = valores;
  const semNadaNoPeriodo = periodo.juros === 0 && periodo.descontos === 0;
  const semNadaNoAno = doAno.juros === 0 && doAno.descontos === 0;

  if (semNadaNoPeriodo && semNadaNoAno) {
    const periodoDentroDoAno = serie.pontos[0]?.inicio.startsWith(ano) ?? true;
    return (
      <Secao titulo="Quanto perdi com atraso?">
        <CardPainel>
          <p className={TEXTO}>
            Nenhum juro pago nem desconto obtido {periodoDentroDoAno ? `em ${ano}` : `no período nem em ${ano}`}.
          </p>
        </CardPainel>
      </Secao>
    );
  }

  const pontos = serie.pontos.map((ponto) => ({
    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
    juros: ponto.juros,
    descontos: ponto.descontos,
  }));

  return (
    <Secao titulo="Quanto perdi com atraso?">
      <CardPainel>
        <CabecalhoCard titulo="Juros × descontos" />
        {semNadaNoPeriodo ? (
          <p className={TEXTO}>Sem juros nem descontos no período.</p>
        ) : (
          <>
            <Totais juros={periodo.juros} descontos={periodo.descontos} />
            <Legenda itens={[{ cor: cores.despesa, nome: 'Juros pagos' }, { cor: cores.receita, nome: 'Descontos obtidos' }]} />
            <BarrasSerieChart
              pontos={pontos}
              altura={180}
              series={[
                { chave: 'juros', rotulo: 'Juros pagos', cor: cores.despesa, tipo: 'barra' },
                { chave: 'descontos', rotulo: 'Descontos obtidos', cor: cores.receita, tipo: 'barra' },
              ]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
