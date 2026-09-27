import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, RodapeCard, Secao } from './PainelLayout';

interface JurosDescontosProps {
  valores: PainelData['jurosDescontos'];
  /** Ano do fim do período — o acumulado vai de janeiro até a data final. */
  ano: string;
}

function Linha({ rotulo, juros, descontos }: { rotulo: string; juros: number; descontos: number }) {
  const saldo = descontos - juros;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[#5f7885] dark:text-slate-400">
      <span className="w-28 font-semibold text-[#0f2b38] dark:text-slate-100">{rotulo}</span>
      <span>Juros pagos <b className="tabular-nums text-[#b42318] dark:text-rose-300">{formatCurrency(juros)}</b></span>
      <span>Descontos obtidos <b className="tabular-nums text-[#067647] dark:text-emerald-300">{formatCurrency(descontos)}</b></span>
      <span className="ml-auto">
        Saldo <b className={`tabular-nums ${saldo >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>
          {saldo >= 0 ? '+' : '−'}{formatCurrency(Math.abs(saldo))}
        </b>
      </span>
    </div>
  );
}

export function JurosDescontos({ valores, ano }: JurosDescontosProps) {
  return (
    <Secao titulo="Quanto perdi com atraso?">
      <Card className="flex flex-col gap-3 rounded-2xl p-[18px_22px]">
        <CabecalhoCard titulo="Juros × descontos" detalhe="diferença entre o valor pago e o original" />
        <Linha rotulo="No período" juros={valores.periodo.juros} descontos={valores.periodo.descontos} />
        <Linha rotulo={`Em ${ano} até agora`} juros={valores.ano.juros} descontos={valores.ano.descontos} />
        {valores.ano.juros > 0 && (
          <RodapeCard>Juros vêm de contas pagas depois do vencimento: pagar em dia evita esse custo.</RodapeCard>
        )}
      </Card>
    </Secao>
  );
}
