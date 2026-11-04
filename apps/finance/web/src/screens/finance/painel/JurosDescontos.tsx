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
  // Juros guardados nas linhas ainda não pagas (restante e parcelas da fatura do cartão, parcelas com juros embutido): não seguem o período.
  const jurosAVencer = valores.upcomingInterest ?? 0;
  // A parte do a vencer que cai antes ou depois do período: o gráfico mostra o resto, mês a mês.
  const jurosAVencerFora = valores.upcomingInterestOutside ?? 0;
  const temJurosAVencerNoPeriodo = serie.pontos.some((ponto) => (ponto.jurosAVencer ?? 0) > 0);
  // Período começando em 1º de janeiro: o período já é o acumulado do ano.
  const periodoEhOAno = serie.pontos[0]?.inicio === `${ano}-01-01`;

  return (
    <Secao titulo="Quanto paguei de juros e taxas?">
      <CardPainel>
        <CabecalhoCard
          titulo="Juros e descontos"
          valor={semNadaNoPeriodo ? undefined : formatarComSinal(saldo)}
          tomValor={saldo >= 0 ? TOM_DESCONTO : TOM_JUROS}
        />
        {semNadaNoPeriodo && semNadaNoAno && jurosAVencer === 0 ? (
          <Vazio>
            Nenhum juro ou taxa pago nem desconto ganho em {ano}. O juros das parcelas aparece aqui como "a vencer" quando a compra
            parcelada é cadastrada com o valor à vista.
          </Vazio>
        ) : (
          <>
            <Totais itens={[
              { rotulo: 'Juros e taxas pagos', valor: formatCurrency(periodo.juros), tom: TOM_JUROS },
              { rotulo: 'Descontos ganhos', valor: formatCurrency(periodo.descontos), tom: TOM_DESCONTO },
              ...(!periodoEhOAno && !semNadaNoAno
                ? [{ rotulo: `Em ${ano} até agora`, valor: `juros ${formatCurrency(doAno.juros)} · descontos ${formatCurrency(doAno.descontos)}` }]
                : []),
              ...(jurosAVencer > 0
                ? [{
                  rotulo: 'Juros a vencer',
                  valor: jurosAVencerFora > 0
                    ? `${formatCurrency(jurosAVencer)} · ${formatCurrency(jurosAVencerFora)} fora deste período`
                    : formatCurrency(jurosAVencer),
                  tom: TOM_JUROS,
                }]
                : []),
            ]} />
            {semNadaNoPeriodo && !temJurosAVencerNoPeriodo ? (
              <Vazio>
                Sem juros, taxas nem descontos no período.
                {jurosAVencer > 0 && ` ${formatCurrency(jurosAVencer)} de juros a vencer fora deste período.`}
              </Vazio>
            ) : (
              <>
                <Legenda itens={[
                  { cor: cores.despesa, nome: 'Juros e taxas pagos' },
                  ...(temJurosAVencerNoPeriodo ? [{ cor: cores.negativo, nome: 'Juros a vencer', padrao: true }] : []),
                  { cor: cores.receita, nome: 'Descontos ganhos' },
                ]} />
                <Barras
                  altura={170}
                  series={[
                    { chave: 'juros', rotulo: 'Juros e taxas pagos', cor: cores.despesa, pilha: 'juros' },
                    ...(temJurosAVencerNoPeriodo
                      ? [{ chave: 'jurosAVencer', rotulo: 'Juros a vencer', cor: cores.negativo, pilha: 'juros', padrao: true }]
                      : []),
                    { chave: 'descontos', rotulo: 'Descontos ganhos', cor: cores.receita },
                  ]}
                  pontos={serie.pontos.map((ponto) => ({
                    rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
                    valores: { juros: ponto.juros, jurosAVencer: ponto.jurosAVencer ?? 0, descontos: ponto.descontos },
                  }))}
                  linhasExtras={(ponto) => (
                    (ponto.valores['jurosAVencer'] ?? 0) > 0 && (ponto.valores['juros'] ?? 0) > 0
                      ? [['Juros do mês (pago + a vencer)', formatCurrency((ponto.valores['juros'] ?? 0) + (ponto.valores['jurosAVencer'] ?? 0))]]
                      : []
                  )}
                />
              </>
            )}
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
