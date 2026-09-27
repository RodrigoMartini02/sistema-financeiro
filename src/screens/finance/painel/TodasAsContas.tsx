import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../../ui/states';
import { queryKeys } from '../../../services/queryKeys';
import { fetchAccountsOverview, type AccountsOverviewConta } from '../../../services/membrosService';
import type { PainelPeriodo } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, Secao, Vazio } from './PainelLayout';

const TOM_RECEITA = 'text-emerald-600 dark:text-emerald-400';
const TOM_DESPESA = 'text-rose-600 dark:text-rose-400';

function nomeDaConta(conta: AccountsOverviewConta): string {
  return conta.nome_fantasia || conta.razao_social || conta.nome;
}

function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  return (
    <span className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
      <span className="block h-1.5 rounded-full" style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%`, background: cor }} />
    </span>
  );
}

/** Todas as contas do dono (PF + PJs) no período do painel. Só existe quando o filtro "Todas as contas" está marcado. */
export function TodasAsContas({ periodo }: { periodo: PainelPeriodo }) {
  const cores = useCoresGrafico();
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
      <CardPainel>
        <CabecalhoCard titulo="Entrou × saiu por conta" detalhe="pessoal e empresas juntas" />
        {visaoQ.isLoading && <Vazio>Carregando...</Vazio>}
        {visaoQ.error && <ErrorState title="Não foi possível carregar as contas" description={visaoQ.error.message} />}
        {visaoQ.data && (
          <>
            <Legenda itens={[{ cor: cores.receita, nome: 'Entrou' }, { cor: cores.despesa, nome: 'Saiu' }]} />
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {contas.map((conta) => (
                <li key={conta.id} className="grid gap-1.5 md:grid-cols-[minmax(0,12rem)_1fr_7rem] md:items-center md:gap-4">
                  <span className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">
                    {conta.nome} <span className="font-normal text-slate-400">· {conta.tipo === 'empresa' ? 'empresa' : 'pessoal'}</span>
                  </span>
                  <span className="flex flex-col gap-1 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-2">
                      <Barra valor={conta.entrou} maximo={maximo} cor={cores.receita} />
                      <span className="w-24 text-right">{formatCurrency(conta.entrou)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Barra valor={conta.saiu} maximo={maximo} cor={cores.despesa} />
                      <span className="w-24 text-right">{formatCurrency(conta.saiu)}</span>
                    </span>
                  </span>
                  <b className={`text-right text-[13px] font-bold tabular-nums ${conta.resultado >= 0 ? TOM_RECEITA : TOM_DESPESA}`}>
                    {formatCurrency(conta.resultado)}
                  </b>
                </li>
              ))}
            </ul>
            <p className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-slate-100 pt-2.5 text-xs tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">Total</span>
              <span>Entrou <b className={`font-semibold ${TOM_RECEITA}`}>{formatCurrency(total.entrou)}</b></span>
              <span>Saiu <b className={`font-semibold ${TOM_DESPESA}`}>{formatCurrency(total.saiu)}</b></span>
              <span className="ml-auto">
                Resultado <b className={`font-semibold ${resultadoTotal >= 0 ? TOM_RECEITA : TOM_DESPESA}`}>{formatCurrency(resultadoTotal)}</b>
              </span>
            </p>
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
