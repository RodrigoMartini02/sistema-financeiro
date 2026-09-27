import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, RodapeCard, Secao } from './PainelLayout';
import { rotuloDoTrecho, unidadeDaSerie } from './painelFormat';

const TOM_JUROS = 'text-rose-600 dark:text-rose-400';
const TOM_DESCONTO = 'text-emerald-600 dark:text-emerald-400';
const DESTAQUE = 'font-semibold text-slate-900 dark:text-white';
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
  const unidade = unidadeDaSerie(serie.granularidade);
  const { periodo, ano: doAno } = valores;
  const semNadaNoPeriodo = periodo.juros === 0 && periodo.descontos === 0;
  const semNadaNoAno = doAno.juros === 0 && doAno.descontos === 0;
  // Filtro começando em 1º de janeiro: o período já é o acumulado do ano.
  const periodoEhOAno = serie.pontos[0]?.inicio === `${ano}-01-01`;

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
  const maiorJuros = pontos.reduce<typeof pontos[number] | null>(
    (atual, ponto) => (ponto.juros > 0 && (!atual || ponto.juros > atual.juros) ? ponto : atual),
    null,
  );

  return (
    <Secao titulo="Quanto perdi com atraso?">
      <CardPainel>
        <CabecalhoCard titulo="Juros × descontos" detalhe={`por ${unidade.singular} · diferença entre o valor pago e o original`} />
        {semNadaNoPeriodo ? (
          <p className={TEXTO}>Sem juros nem descontos no período.</p>
        ) : (
          <>
            <Totais juros={periodo.juros} descontos={periodo.descontos} />
            {maiorJuros && (
              <p className={TEXTO}>
                {unidade.singular.charAt(0).toUpperCase() + unidade.singular.slice(1)} com mais juros{' '}
                <b className={DESTAQUE}>{maiorJuros.rotulo} · {formatCurrency(maiorJuros.juros)}</b>
              </p>
            )}
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
        {(!periodoEhOAno || doAno.juros > 0) && (
          <RodapeCard>
            {!periodoEhOAno && (
              <>
                Em {ano} até agora: juros <b className={`font-semibold ${TOM_JUROS}`}>{formatCurrency(doAno.juros)}</b>
                {' · '}descontos <b className={`font-semibold ${TOM_DESCONTO}`}>{formatCurrency(doAno.descontos)}</b>
                {doAno.juros > 0 && '. '}
              </>
            )}
            {doAno.juros > 0 && 'Juros vêm de contas pagas depois do vencimento: pagar em dia evita esse custo.'}
          </RodapeCard>
        )}
      </CardPainel>
    </Secao>
  );
}
