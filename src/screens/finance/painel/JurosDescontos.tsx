import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, Legenda, Secao, Totais, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { formatarComSinal, rotuloDoTrecho } from './painelFormat';

const TOM_JUROS = 'text-rose-600 dark:text-rose-400';
const TOM_DESCONTO = 'text-emerald-600 dark:text-emerald-400';

interface JurosDescontosProps {
  valores: PainelData['jurosDescontos'];
  /** Mesma série dos outros gráficos: semanas no mês, meses no ano. */
  serie: PainelData['serie'];
  /** Ano do fim do período — o acumulado vai de janeiro até a data final. */
  ano: string;
}

export function JurosDescontos({ valores, serie, ano }: JurosDescontosProps) {
  const cores = useCoresGrafico();
  const { periodo, ano: doAno } = valores;
  const saldo = periodo.descontos - periodo.juros;
  const semNadaNoPeriodo = periodo.juros === 0 && periodo.descontos === 0;
  const semNadaNoAno = doAno.juros === 0 && doAno.descontos === 0;
  // Juros do restante e das parcelas da fatura do cartão ainda não pagos: não seguem o período.
  const jurosAVencer = valores.upcomingInterest ?? 0;
  // Período começando em 1º de janeiro: o período já é o acumulado do ano.
  const periodoEhOAno = serie.pontos[0]?.inicio === `${ano}-01-01`;

  return (
    <Secao titulo="Quanto perdi com atraso?">
      <CardPainel>
        <CabecalhoCard
          titulo="Juros e descontos"
          valor={semNadaNoPeriodo ? undefined : formatarComSinal(saldo)}
          tomValor={saldo >= 0 ? TOM_DESCONTO : TOM_JUROS}
        />
        {semNadaNoPeriodo && semNadaNoAno && jurosAVencer === 0 ? (
          <Vazio>Nenhum juro pago nem desconto ganho em {ano}.</Vazio>
        ) : (
          <>
            <Totais itens={[
              { rotulo: 'Juros pagos', valor: formatCurrency(periodo.juros), tom: TOM_JUROS },
              { rotulo: 'Descontos ganhos', valor: formatCurrency(periodo.descontos), tom: TOM_DESCONTO },
              ...(!periodoEhOAno && !semNadaNoAno
                ? [{ rotulo: `Em ${ano} até agora`, valor: `juros ${formatCurrency(doAno.juros)} · descontos ${formatCurrency(doAno.descontos)}` }]
                : []),
              ...(jurosAVencer > 0
                ? [{ rotulo: 'Juros a vencer', valor: formatCurrency(jurosAVencer), tom: TOM_JUROS }]
                : []),
            ]} />
            {semNadaNoPeriodo ? (
              <Vazio>Sem juros nem descontos no período.</Vazio>
            ) : (
              <>
                <Legenda itens={[{ cor: cores.despesa, nome: 'Juros pagos' }, { cor: cores.receita, nome: 'Descontos ganhos' }]} />
                <Barras
                  altura={170}
                  series={[
                    { chave: 'juros', rotulo: 'Juros pagos', cor: cores.despesa },
                    { chave: 'descontos', rotulo: 'Descontos ganhos', cor: cores.receita },
                  ]}
                  pontos={serie.pontos.map((ponto) => ({
                    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
                    valores: { juros: ponto.juros, descontos: ponto.descontos },
                  }))}
                />
              </>
            )}
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
