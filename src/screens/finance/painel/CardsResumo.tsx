import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { FirstAccessGuideCard } from '../../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../../hooks/useFirstAccessGuide';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { MovementMetricCard } from '../MovementMetricCard';

// Mesmas faixas da barra e do guia de primeiro acesso: até 70% saudável, até
// 90% em alerta, acima disso crítico.
const FAIXA_ALERTA = 70;
const FAIXA_CRITICA = 90;

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
      <b className={`font-semibold ${tom}`}>{Math.abs(percentual).toFixed(0)}%</b>&nbsp;vs {rotuloAnterior}
    </span>
  );
}

interface CardsResumoProps {
  resumo: PainelData['resumo'];
  /** true quando o período anterior é um mês inteiro — muda só o texto da comparação. */
  anteriorEhMes: boolean;
}

export function CardsResumo({ resumo, anteriorEhMes }: CardsResumoProps) {
  const guiaComprometimento = useFirstAccessGuide('painel:comprometimento-v1');
  const rotuloAnterior = anteriorEhMes ? 'mês anterior' : 'período anterior';
  const resultado = resumo.entrou - resumo.saiu;
  const resultadoSobreRenda = resumo.entrou > 0 ? (Math.abs(resultado) / resumo.entrou) * 100 : null;
  const comprometimento = resumo.entrou > 0 ? (resumo.saiu / resumo.entrou) * 100 : null;
  const situacao = comprometimento === null || comprometimento <= FAIXA_ALERTA
    ? { tom: 'income' as const, rotulo: 'saudável', classe: 'text-emerald-600 dark:text-emerald-400' }
    : comprometimento <= FAIXA_CRITICA
      ? { tom: 'warning' as const, rotulo: 'atenção', classe: 'text-amber-600 dark:text-amber-400' }
      : { tom: 'expense' as const, rotulo: 'crítico', classe: 'text-rose-600 dark:text-rose-400' };

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
      <MovementMetricCard
        label="Entrou"
        value={formatCurrency(resumo.entrou)}
        tone="income"
        progressPct={100}
        note={<NotaVariacao atual={resumo.entrou} anterior={resumo.entrouAnterior} subirEBom rotuloAnterior={rotuloAnterior} />}
      />
      <MovementMetricCard
        label="Saiu"
        value={formatCurrency(resumo.saiu)}
        tone="expense"
        progressPct={resumo.saiu > 0 ? (resumo.pago / resumo.saiu) * 100 : 0}
        note={<>{formatCurrency(resumo.pago)} pago · {formatCurrency(resumo.aPagar)} a pagar</>}
      />
      <MovementMetricCard
        label="Resultado"
        value={`${resultado >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(resultado))}`}
        tone={resultado >= 0 ? 'income' : 'expense'}
        progressPct={resultadoSobreRenda ?? 0}
        note={resultadoSobreRenda === null
          ? 'Sem receita no período'
          : `${resultado >= 0 ? 'Sobrou' : 'Faltou'} ${resultadoSobreRenda.toFixed(0)}% da renda`}
      />
      <div className="relative">
        <MovementMetricCard
          label="Comprometimento"
          value={comprometimento === null ? '—' : `${comprometimento.toFixed(0)}%`}
          tone={situacao.tom}
          faixas={comprometimento === null ? undefined : { valor: comprometimento, limites: [FAIXA_ALERTA, FAIXA_CRITICA] }}
          note={comprometimento === null ? 'Sem receita no período' : (
            <>
              <span className={`inline-flex items-center gap-0.5 font-semibold ${situacao.classe}`}>
                {situacao.tom !== 'income' && <AlertTriangle size={11} aria-hidden="true" />}
                {situacao.rotulo}
              </span>
              {' '}· da renda consumida
            </>
          )}
        />
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
      <MovementMetricCard
        label="Saldo acumulado"
        value={formatCurrency(resumo.saldoFinal)}
        tone={resumo.saldoFinal >= 0 ? 'slate' : 'expense'}
        note={`Anterior ${formatCurrency(resumo.saldoAnterior)}`}
      />
    </div>
  );
}
