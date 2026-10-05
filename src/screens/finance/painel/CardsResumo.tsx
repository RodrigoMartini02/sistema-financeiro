import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { FirstAccessGuideCard } from '../../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../../hooks/useFirstAccessGuide';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CardPainel, Indicador, NumeroAnimado, Rotulo } from './base';
import { corDaSituacao, useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { Medidor } from './graficos/Medidor';
import { formatarComSinal, formatarPercentual, rotuloDoTrecho, situacaoComprometimento, trechoFuturo } from './painelFormat';

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** "↑ 4% vs mês anterior" — `subirEBom` decide a cor: receita subir é bom; despesa subir, não. */
function NotaVariacao({ atual, anterior, subirEBom, rotuloAnterior }: { atual: number; anterior: number; subirEBom: boolean; rotuloAnterior: string }) {
  const percentual = variacao(atual, anterior);
  if (percentual === null) return <>Sem base para comparar com o {rotuloAnterior}</>;
  const subiu = percentual >= 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  const tom = subiu === subirEBom ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icone size={12} className={tom} aria-hidden="true" />
      <span className={`font-medium ${tom}`}>{formatarPercentual(Math.abs(percentual))}</span>&nbsp;vs {rotuloAnterior}
    </span>
  );
}

interface CardsResumoProps {
  resumo: PainelData['resumo'];
  serie: PainelData['serie'];
  /** "2026", "setembro de 2026", "10/09/2026 a 19/09/2026". */
  descricaoPeriodo: string;
  /** true quando o período anterior é um mês inteiro — muda só o texto da comparação. */
  anteriorEhMes: boolean;
}

/** Topo do painel: o resultado do período em destaque e os quatro indicadores ao lado. */
export function CardsResumo({ resumo, serie, descricaoPeriodo, anteriorEhMes }: CardsResumoProps) {
  const cores = useCoresGrafico();
  const guiaComprometimento = useFirstAccessGuide('painel:comprometimento-v1');
  const rotuloAnterior = anteriorEhMes ? 'mês anterior' : 'período anterior';
  const resultado = resumo.entrou - resumo.saiu;
  const sobreRenda = resumo.entrou > 0 ? (Math.abs(resultado) / resumo.entrou) * 100 : null;
  const comprometimento = resumo.entrou > 0 ? (resumo.saiu / resumo.entrou) * 100 : null;
  const situacao = situacaoComprometimento(comprometimento);
  const movimento = resumo.entrou + resumo.saiu;

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" aria-label="Resumo do período">
      <CardPainel escuro className="gap-4 px-6 py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Rotulo className="!text-[#93b8c4]">Resultado · {descricaoPeriodo}</Rotulo>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium">
            {sobreRenda === null ? 'Sem receita no período' : `${resultado >= 0 ? 'Sobrou' : 'Faltou'} ${formatarPercentual(sobreRenda)} da renda`}
          </span>
        </div>
        <span className="text-[clamp(30px,4.2vw,44px)] font-semibold leading-none tracking-tight tabular-nums">
          <NumeroAnimado valor={resultado} formatar={formatarComSinal} />
        </span>
        <div className="grid gap-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
            <span className="h-full transition-[width] duration-700" style={{ width: `${movimento > 0 ? (resumo.entrou / movimento) * 100 : 0}%`, background: cores.receita }} />
            <span className="h-full transition-[width] duration-700" style={{ width: `${movimento > 0 ? (resumo.saiu / movimento) * 100 : 0}%`, background: cores.despesa }} />
          </div>
          <div className="flex justify-between gap-3 text-[12.5px] tabular-nums text-[#93b8c4]">
            <span>Entrou <span className="font-medium text-white">{formatCurrency(resumo.entrou)}</span></span>
            <span>Saiu <span className="font-medium text-white">{formatCurrency(resumo.saiu)}</span></span>
          </div>
        </div>
        <Barras
          altura={84}
          semEixo
          sinal
          formatar={formatarComSinal}
          series={[{ chave: 'resultado', rotulo: 'Resultado', cor: (valor) => (valor >= 0 ? '#34d399' : '#fb7185') }]}
          pontos={serie.pontos.map((ponto) => ({
            rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, serie.granularidade),
            futuro: trechoFuturo(ponto.inicio),
            valores: { resultado: ponto.receitas - ponto.despesas },
          }))}
        />
      </CardPainel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Indicador
          rotulo="Entrou"
          valor={<NumeroAnimado valor={resumo.entrou} formatar={formatCurrency} />}
          nota={<NotaVariacao atual={resumo.entrou} anterior={resumo.entrouAnterior} subirEBom rotuloAnterior={rotuloAnterior} />}
        />
        <Indicador
          rotulo="Saiu"
          valor={<NumeroAnimado valor={resumo.saiu} formatar={formatCurrency} />}
          nota={<NotaVariacao atual={resumo.saiu} anterior={resumo.saiuAnterior} subirEBom={false} rotuloAnterior={rotuloAnterior} />}
        />
        <Indicador
          rotulo="Saldo acumulado"
          tom={resumo.saldoFinal >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}
          valor={<NumeroAnimado valor={resumo.saldoFinal} formatar={formatCurrency} />}
          nota={<span className="tabular-nums">Anterior {formatCurrency(resumo.saldoAnterior)}</span>}
        />
        <div className="relative">
          <CardPainel className="h-full gap-2">
            <Rotulo>Comprometimento</Rotulo>
            {comprometimento === null ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                <span className="text-[22px] font-medium text-slate-900 dark:text-white">—</span>
                <span className="text-[12.5px] text-slate-500 dark:text-slate-400">Sem receita no período</span>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Medidor percentual={comprometimento} cor={corDaSituacao(situacao.tom, cores)}>
                  <span className="text-[19px] font-semibold tabular-nums text-slate-900 dark:text-white">
                    <NumeroAnimado valor={comprometimento} formatar={formatarPercentual} />
                  </span>
                  <span className={`mt-1 inline-flex items-center gap-0.5 text-[11.5px] font-medium ${situacao.classe}`}>
                    {situacao.tom !== 'income' && <AlertTriangle size={10} aria-hidden="true" />}
                    {situacao.rotulo}
                  </span>
                </Medidor>
              </div>
            )}
          </CardPainel>
          {guiaComprometimento.isVisible && (
            <FirstAccessGuideCard
              floating
              placement="top"
              align="right"
              className="w-[min(25rem,calc(100vw-2rem))]"
              icon={AlertTriangle}
              description={firstAccessGuideMessages.painelComprometimento}
              onDismiss={guiaComprometimento.dismiss}
              onSilenceAll={guiaComprometimento.silenceAll}
            />
          )}
        </div>
      </div>
    </section>
  );
}
