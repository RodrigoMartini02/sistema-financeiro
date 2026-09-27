import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, RodapeCard, Secao } from './PainelLayout';

interface JurosDescontosProps {
  valores: PainelData['jurosDescontos'];
  /** Ano do fim do período — o acumulado vai de janeiro até a data final. */
  ano: string;
}

function Linha({ rotulo, juros, descontos }: { rotulo: string; juros: number; descontos: number }) {
  const saldo = descontos - juros;
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] tabular-nums text-slate-500 dark:text-slate-400">
      <span className="min-w-[7.5rem] font-semibold text-slate-900 dark:text-white">{rotulo}</span>
      <span>Juros pagos <b className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(juros)}</b></span>
      <span>Descontos obtidos <b className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(descontos)}</b></span>
      <span className="ml-auto">
        Saldo{' '}
        <b className={`font-semibold ${saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {saldo >= 0 ? '+' : '−'} {formatCurrency(Math.abs(saldo))}
        </b>
      </span>
    </div>
  );
}

export function JurosDescontos({ valores, ano }: JurosDescontosProps) {
  return (
    <Secao titulo="Quanto perdi com atraso?">
      <CardPainel>
        <CabecalhoCard titulo="Juros × descontos" detalhe="diferença entre o valor pago e o original" />
        <Linha rotulo="No período" juros={valores.periodo.juros} descontos={valores.periodo.descontos} />
        <Linha rotulo={`Em ${ano} até agora`} juros={valores.ano.juros} descontos={valores.ano.descontos} />
        {valores.ano.juros > 0 && (
          <RodapeCard>Juros vêm de contas pagas depois do vencimento: pagar em dia evita esse custo.</RodapeCard>
        )}
      </CardPainel>
    </Secao>
  );
}
