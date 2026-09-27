import type { PainelData } from '../../../types/finance';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { firstName } from '../memberColors';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Secao, Vazio } from './PainelLayout';

interface QuemTrouxeQuemGastouProps {
  pessoas: PainelData['porPessoa'];
  /** Cor de cada pessoa (usuario_id) — a mesma usada nas barras de Categorias. */
  coresPorPessoa: Map<number, string>;
  /** Rótulo do grupo de pessoas na conta: "Membros" ou "Colaboradores". */
  termoPlural: string;
}

export function QuemTrouxeQuemGastou({ pessoas, coresPorPessoa, termoPlural }: QuemTrouxeQuemGastouProps) {
  const cores = useCoresGrafico();
  const comCor = pessoas.map((pessoa) => ({
    ...pessoa,
    nomeCurto: firstName(pessoa.nome),
    cor: coresPorPessoa.get(pessoa.usuarioId) ?? cores.neutro,
    saldo: pessoa.receitas - pessoa.despesas,
  }));
  const totalReceitas = comCor.reduce((soma, pessoa) => soma + pessoa.receitas, 0);
  const totalDespesas = comCor.reduce((soma, pessoa) => soma + pessoa.despesas, 0);
  const fatias = (valor: (pessoa: typeof comCor[number]) => number) => comCor
    .filter((pessoa) => valor(pessoa) > 0)
    .map((pessoa) => ({ name: pessoa.nomeCurto, value: valor(pessoa), color: pessoa.cor }));

  return (
    <Secao titulo="Quem trouxe e quem gastou" detalhe={termoPlural.toLowerCase()}>
      <div className="grid gap-3 xl:grid-cols-3">
        <CardPainel>
          <CabecalhoCard titulo="De onde veio a receita" detalhe="quem trouxe" />
          {totalReceitas === 0
            ? <Vazio>Sem receitas no período.</Vazio>
            : <DonutChart data={fatias((pessoa) => pessoa.receitas)} centerLabel="Entrou" centerValue={formatCurrency(totalReceitas)} />}
        </CardPainel>

        <CardPainel>
          <CabecalhoCard titulo="Despesas por pessoa" detalhe="quem gastou" />
          {totalDespesas === 0
            ? <Vazio>Sem despesas no período.</Vazio>
            : <DonutChart data={fatias((pessoa) => pessoa.despesas)} centerLabel="Saiu" centerValue={formatCurrency(totalDespesas)} />}
        </CardPainel>

        <CardPainel>
          <CabecalhoCard titulo="Comparativo" detalhe="entrada, saída e saldo" />
          <ul className="m-0 flex list-none flex-col p-0">
            {comCor.map((pessoa) => (
              <li key={pessoa.usuarioId} className="flex items-center gap-2.5 border-t border-slate-100 py-2.5 text-[12.5px] tabular-nums first:border-t-0 dark:border-slate-700">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pessoa.cor }} />
                <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{pessoa.nomeCurto}</span>
                <span className="ml-auto text-emerald-600 dark:text-emerald-400">{formatCurrency(pessoa.receitas)}</span>
                <span className="text-rose-600 dark:text-rose-400">{formatCurrency(pessoa.despesas)}</span>
                <b className={`min-w-[5.5rem] text-right font-semibold ${pessoa.saldo >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatCurrency(pessoa.saldo)}
                </b>
              </li>
            ))}
          </ul>
        </CardPainel>
      </div>
    </Secao>
  );
}
