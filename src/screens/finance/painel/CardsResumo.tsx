import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '../../../ui/card';
import { FirstAccessGuideCard } from '../../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../../hooks/useFirstAccessGuide';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';

// Mesmas faixas da barra e do guia de primeiro acesso: até 70% saudável, até
// 90% em alerta, acima disso crítico.
const FAIXA_ALERTA = 70;
const FAIXA_CRITICA = 90;

const TOM_POSITIVO = 'text-[#067647] dark:text-emerald-300';
const TOM_NEGATIVO = 'text-[#b42318] dark:text-rose-300';
const TOM_ALERTA = 'text-[#b54708] dark:text-amber-300';

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** "↑ 12% vs mês anterior" — `subirEBom` decide a cor (receita subir é bom; despesa subir, não). */
function Variacao({ atual, anterior, subirEBom, rotuloAnterior }: { atual: number; anterior: number; subirEBom: boolean; rotuloAnterior: string }) {
  const percentual = variacao(atual, anterior);
  if (percentual === null) {
    return <span className="text-[11.5px] text-[#7b93a1] dark:text-slate-400">Sem base para comparar com o {rotuloAnterior}.</span>;
  }
  const subiu = percentual >= 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  const tom = subiu === subirEBom ? TOM_POSITIVO : TOM_NEGATIVO;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-[#7b93a1] dark:text-slate-400">
      <Icone size={13} className={tom} />
      <b className={`font-semibold tabular-nums ${tom}`}>{Math.abs(percentual).toFixed(0)}%</b> vs {rotuloAnterior}
    </span>
  );
}

function Rotulo({ children }: { children: string }) {
  return <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">{children}</span>;
}

function Valor({ valor, tom }: { valor: number; tom: string }) {
  return <p className={`text-[23px] font-bold tracking-[-0.02em] tabular-nums ${tom}`}>{formatCurrency(valor)}</p>;
}

interface CardsResumoProps {
  resumo: PainelData['resumo'];
  /** true quando o período anterior é um mês inteiro — muda só o texto da comparação. */
  anteriorEhMes: boolean;
}

export function CardsResumo({ resumo, anteriorEhMes }: CardsResumoProps) {
  const comprometimentoGuide = useFirstAccessGuide('painel:comprometimento-v1');
  const rotuloAnterior = anteriorEhMes ? 'mês anterior' : 'período anterior';
  const resultado = resumo.entrou - resumo.saiu;
  const resultadoSobreRenda = resumo.entrou > 0 ? (Math.abs(resultado) / resumo.entrou) * 100 : null;
  const comprometimento = resumo.entrou > 0 ? (resumo.saiu / resumo.entrou) * 100 : null;
  const tomComprometimento = comprometimento === null || comprometimento <= FAIXA_ALERTA
    ? TOM_POSITIVO
    : comprometimento <= FAIXA_CRITICA ? TOM_ALERTA : TOM_NEGATIVO;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
      <Card className="flex flex-col gap-2 rounded-2xl p-5">
        <Rotulo>Entrou</Rotulo>
        <Valor valor={resumo.entrou} tom={TOM_POSITIVO} />
        <Variacao atual={resumo.entrou} anterior={resumo.entrouAnterior} subirEBom rotuloAnterior={rotuloAnterior} />
      </Card>

      <Card className="flex flex-col gap-2 rounded-2xl p-5">
        <Rotulo>Saiu</Rotulo>
        <Valor valor={resumo.saiu} tom={TOM_NEGATIVO} />
        <span className="text-[11.5px] text-[#7b93a1] dark:text-slate-400">
          {formatCurrency(resumo.pago)} pago · {formatCurrency(resumo.aPagar)} a pagar
        </span>
        <Variacao atual={resumo.saiu} anterior={resumo.saiuAnterior} subirEBom={false} rotuloAnterior={rotuloAnterior} />
      </Card>

      <Card className="flex flex-col gap-2 rounded-2xl p-5">
        <Rotulo>Resultado</Rotulo>
        {/* O sinal faz parte do dado: um déficit sem o menos vira superávit
            para quem lê rápido, e a cor sozinha não carrega isso. */}
        <Valor valor={resultado} tom={resultado >= 0 ? TOM_POSITIVO : TOM_NEGATIVO} />
        <span className="text-[11.5px] text-[#7b93a1] dark:text-slate-400">
          {resultadoSobreRenda === null
            ? 'Sem receita no período.'
            : `${resultado >= 0 ? 'Sobrou' : 'Faltou'} ${resultadoSobreRenda.toFixed(0)}% da renda.`}
        </span>
      </Card>

      <Card className="relative flex flex-col gap-2 rounded-2xl p-5">
        <Rotulo>Comprometimento</Rotulo>
        <p className={`text-[23px] font-bold tracking-[-0.02em] tabular-nums ${tomComprometimento}`}>
          {comprometimento === null ? '—' : `${comprometimento.toFixed(0)}%`}
        </p>
        <div className="relative mt-1 flex h-1.5 gap-0.5" aria-hidden="true">
          <div className="rounded-l bg-[#b7e4c7]" style={{ flex: FAIXA_ALERTA }} />
          <div className="bg-[#f0e0b0]" style={{ flex: FAIXA_CRITICA - FAIXA_ALERTA }} />
          <div className="rounded-r bg-[#fbd5d1]" style={{ flex: 100 - FAIXA_CRITICA }} />
          {comprometimento !== null && (
            <span className="absolute -top-1 h-3.5 w-[3px] rounded bg-[#0f2b38] dark:bg-white" style={{ left: `${Math.min(100, comprometimento)}%` }} />
          )}
        </div>
        <span className="text-[11.5px] text-[#7b93a1] dark:text-slate-400">da renda consumida pelas despesas</span>
        {comprometimentoGuide.isVisible && (
          <FirstAccessGuideCard
            floating
            placement="top"
            align="right"
            className="w-[min(25rem,calc(100vw-2rem))]"
            icon={AlertTriangle}
            description={firstAccessGuideMessages.painelComprometimento}
            onDismiss={comprometimentoGuide.dismiss}
            onSilenceAll={comprometimentoGuide.silenceAll}
          />
        )}
      </Card>

      <Card className="flex flex-col gap-2 rounded-2xl p-5">
        <Rotulo>Saldo acumulado</Rotulo>
        <Valor valor={resumo.saldoFinal} tom={resumo.saldoFinal >= 0 ? TOM_POSITIVO : TOM_NEGATIVO} />
        <span className="text-[11.5px] text-[#7b93a1] dark:text-slate-400">
          Anterior {formatCurrency(resumo.saldoAnterior)}
        </span>
      </Card>
    </div>
  );
}
