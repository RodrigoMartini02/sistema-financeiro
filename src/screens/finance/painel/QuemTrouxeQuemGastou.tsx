import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { firstName, memberColor } from '../memberColors';
import { CabecalhoCard, Secao, Vazio } from './PainelLayout';

interface QuemTrouxeQuemGastouProps {
  pessoas: PainelData['porPessoa'];
  memberColors: Map<number, string>;
  /** Rótulo do grupo de pessoas na conta: "Membros" ou "Colaboradores". */
  termoPlural: string;
}

export function QuemTrouxeQuemGastou({ pessoas, memberColors, termoPlural }: QuemTrouxeQuemGastouProps) {
  const comCor = pessoas.map((pessoa) => ({
    ...pessoa,
    nomeCurto: firstName(pessoa.nome),
    cor: memberColor(memberColors, pessoa.usuarioId),
    saldo: pessoa.receitas - pessoa.despesas,
  }));
  const totalReceitas = comCor.reduce((soma, pessoa) => soma + pessoa.receitas, 0);
  const totalDespesas = comCor.reduce((soma, pessoa) => soma + pessoa.despesas, 0);
  const fatias = (valor: (pessoa: typeof comCor[number]) => number) => comCor
    .filter((pessoa) => valor(pessoa) > 0)
    .map((pessoa) => ({ name: pessoa.nomeCurto, value: valor(pessoa), color: pessoa.cor }));

  return (
    <Secao titulo={`Quem trouxe e quem gastou · ${termoPlural.toLowerCase()}`}>
      <div className="grid gap-3.5 xl:grid-cols-3">
        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px]">
          <CabecalhoCard titulo="De onde veio a receita" detalhe="quem trouxe" />
          {totalReceitas === 0
            ? <Vazio>Sem receitas no período.</Vazio>
            : <DonutChart data={fatias((pessoa) => pessoa.receitas)} centerLabel="ENTROU" centerValue={formatCurrency(totalReceitas)} />}
        </Card>

        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px]">
          <CabecalhoCard titulo="Despesas por pessoa" detalhe="quem gastou" />
          {totalDespesas === 0
            ? <Vazio>Sem despesas no período.</Vazio>
            : <DonutChart data={fatias((pessoa) => pessoa.despesas)} centerLabel="SAIU" centerValue={formatCurrency(totalDespesas)} />}
        </Card>

        <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px]">
          <CabecalhoCard titulo="Comparativo" detalhe="entrada, saída e saldo" />
          <ul className="m-0 grid list-none p-0">
            {comCor.map((pessoa) => (
              <li key={pessoa.usuarioId} className="flex items-center gap-3 border-t border-[#eef4f7] py-2.5 first:border-t-0 dark:border-slate-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pessoa.cor }} />
                <span className="w-20 shrink-0 truncate text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">{pessoa.nomeCurto}</span>
                <span className="ml-auto w-24 shrink-0 text-right text-[11.5px] tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(pessoa.receitas)}</span>
                <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(pessoa.despesas)}</span>
                <span className={`w-24 shrink-0 text-right text-[12.5px] font-bold tabular-nums ${pessoa.saldo >= 0 ? 'text-[#0f2b38] dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatCurrency(pessoa.saldo)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Secao>
  );
}
