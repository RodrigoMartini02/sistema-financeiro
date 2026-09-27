import { useQuery } from '@tanstack/react-query';
import { Card } from '../../../ui/card';
import { ErrorState } from '../../../ui/states';
import { queryKeys } from '../../../services/queryKeys';
import { fetchAccountsOverview, type AccountsOverviewConta } from '../../../services/membrosService';
import type { PainelPeriodo } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, Secao, Vazio } from './PainelLayout';

function nomeDaConta(conta: AccountsOverviewConta): string {
  return conta.nome_fantasia || conta.razao_social || conta.nome;
}

function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  return (
    <span className="h-2 flex-1 rounded bg-[#eef4f7] dark:bg-slate-700" aria-hidden="true">
      <span className="block h-2 rounded" style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%`, background: cor }} />
    </span>
  );
}

/** Todas as contas do dono (PF + PJs) no período do painel. Só existe quando o filtro "Todas as contas" está marcado. */
export function TodasAsContas({ periodo }: { periodo: PainelPeriodo }) {
  const visaoQ = useQuery({
    queryKey: queryKeys.accountsOverview(periodo.de, periodo.ate),
    queryFn: () => fetchAccountsOverview(periodo),
    staleTime: 30_000,
  });

  const contas = (visaoQ.data?.contas ?? []).map((conta) => {
    const entrou = Number(visaoQ.data?.receitas_por_conta.find((linha) => linha.conta_id === conta.id)?.total ?? 0);
    const saiu = Number(visaoQ.data?.despesas_por_conta.find((linha) => linha.conta_id === conta.id)?.total ?? 0);
    return { id: conta.id, nome: nomeDaConta(conta), tipo: conta.tipo, entrou, saiu, resultado: entrou - saiu };
  });
  const maximo = Math.max(0, ...contas.flatMap((conta) => [conta.entrou, conta.saiu]));
  const total = contas.reduce(
    (soma, conta) => ({ entrou: soma.entrou + conta.entrou, saiu: soma.saiu + conta.saiu }),
    { entrou: 0, saiu: 0 },
  );
  const resultadoTotal = total.entrou - total.saiu;

  return (
    <Secao titulo="Todas as suas contas">
      <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
        <CabecalhoCard titulo="Entrou × saiu por conta" detalhe="pessoal e empresas juntas" />
        {visaoQ.isLoading && <Vazio>Carregando...</Vazio>}
        {visaoQ.error && <ErrorState title="Não foi possível carregar as contas" description={visaoQ.error.message} />}
        {visaoQ.data && (
          <ul className="m-0 grid list-none gap-3 p-0">
            {contas.map((conta) => (
              <li key={conta.id} className="grid gap-1.5 md:grid-cols-[minmax(0,12rem)_1fr_7rem] md:items-center md:gap-4">
                <span className="truncate text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">
                  {conta.nome} <span className="font-normal text-[#7b93a1]">· {conta.tipo === 'empresa' ? 'empresa' : 'pessoal'}</span>
                </span>
                <span className="grid gap-1 text-[11px] text-[#5f7885] dark:text-slate-400">
                  <span className="flex items-center gap-2">
                    <Barra valor={conta.entrou} maximo={maximo} cor="#10b981" />
                    <span className="w-24 text-right tabular-nums">{formatCurrency(conta.entrou)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Barra valor={conta.saiu} maximo={maximo} cor="#ef4444" />
                    <span className="w-24 text-right tabular-nums">{formatCurrency(conta.saiu)}</span>
                  </span>
                </span>
                <span className={`text-right text-[13px] font-bold tabular-nums ${conta.resultado >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>
                  {formatCurrency(conta.resultado)}
                </span>
              </li>
            ))}
            <li className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-[#eef4f7] pt-3 text-[12px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
              <span className="font-semibold text-[#0f2b38] dark:text-slate-100">Total</span>
              <span>Entrou <b className="tabular-nums text-[#067647] dark:text-emerald-300">{formatCurrency(total.entrou)}</b></span>
              <span>Saiu <b className="tabular-nums text-[#b42318] dark:text-rose-300">{formatCurrency(total.saiu)}</b></span>
              <span className="ml-auto">
                Resultado <b className={`tabular-nums ${resultadoTotal >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>{formatCurrency(resultadoTotal)}</b>
              </span>
            </li>
          </ul>
        )}
      </Card>
    </Secao>
  );
}
