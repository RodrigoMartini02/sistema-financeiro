import { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchAccountsOverview } from '../../services/membrosService';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { EmptyState } from '../../ui/EmptyState';
import { formatCurrency } from './formatters';
import { DonutChart } from './charts/DonutChart';
import { PALETA } from './memberColors';
import type { DashboardPeriod } from './DashboardPeriodFilter';

interface PanoramaGeralViewProps {
  period: DashboardPeriod;
}

function nomeConta(conta: { nome: string; razao_social: string | null; nome_fantasia: string | null }): string {
  return conta.nome_fantasia || conta.razao_social || conta.nome;
}

/**
 * Panorama entre TODAS as contas do dono (PF + PJs), lado a lado — diferente
 * do painel principal, que sempre opera dentro de uma unica conta ativa.
 *
 * Acesso: dono sempre ve; membro/colaborador precisa de accessGeneralOverview
 * (checado no backend) e, mesmo liberado, so ve a propria conta vinculada —
 * o 403 aqui vira um empty state, nao um erro tecnico.
 */
export function PanoramaGeralView({ period }: PanoramaGeralViewProps) {
  const query = { deMes: period.mes, deAno: period.ano, ateMes: period.ateMes, ateAno: period.ateAno };

  const overviewQ = useQuery({
    queryKey: queryKeys.accountsOverview(query.deMes, query.deAno, query.ateMes, query.ateAno),
    queryFn: () => fetchAccountsOverview(query),
    staleTime: 30_000,
    retry: false,
  });

  const linhas = useMemo(() => {
    const data = overviewQ.data;
    if (!data) return [];
    const despesaPor = new Map(data.despesas_por_conta.map((d) => [d.conta_id, Number(d.total)]));
    const receitaPor = new Map(data.receitas_por_conta.map((r) => [r.conta_id, Number(r.total)]));
    return data.contas.map((conta, i) => {
      const despesa = despesaPor.get(conta.id) ?? 0;
      const receita = receitaPor.get(conta.id) ?? 0;
      return {
        conta,
        nome: nomeConta(conta),
        despesa,
        receita,
        saldo: receita - despesa,
        color: PALETA[i % PALETA.length]!,
      };
    });
  }, [overviewQ.data]);

  const totalReceitas = linhas.reduce((soma, l) => soma + l.receita, 0);
  const totalDespesas = linhas.reduce((soma, l) => soma + l.despesa, 0);

  const receitaContaData = linhas.filter((l) => l.receita > 0).map((l) => ({ name: l.nome, value: l.receita, color: l.color }));
  const despesaContaData = linhas.filter((l) => l.despesa > 0).map((l) => ({ name: l.nome, value: l.despesa, color: l.color }));

  if (overviewQ.isLoading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Carregando...</div>;
  }

  // 403: membro/colaborador sem accessGeneralOverview. Tratado como estado de
  // permissao, nao como falha tecnica — evita mostrar a mensagem crua do
  // backend ("Access denied") como se fosse um erro do sistema.
  if (overviewQ.error) {
    if (overviewQ.error.message === 'Access denied') {
      return (
        <EmptyState
          icon={Building2}
          title="Panorama Geral não liberado"
          description="Peça ao responsável pela conta para liberar o acesso ao Panorama Geral em Configurações → Permissões."
        />
      );
    }
    return (
      <ErrorState
        title="Não foi possível carregar o Panorama Geral"
        description={overviewQ.error.message}
      />
    );
  }

  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhuma conta para comparar"
        description="Cadastre mais uma conta (PF ou PJ) em Configurações → Contas para ver o panorama entre elas."
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Card className="p-4">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#7b93a1] dark:text-slate-400">Receitas por conta</p>
          <div className="mt-2">
            <DonutChart data={receitaContaData} centerLabel="Total" centerValue={formatCurrency(totalReceitas)} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#7b93a1] dark:text-slate-400">Despesas por conta</p>
          <div className="mt-2">
            <DonutChart data={despesaContaData} centerLabel="Total" centerValue={formatCurrency(totalDespesas)} />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#7b93a1] dark:text-slate-400">Contas</p>
        <div className="grid gap-2">
          {linhas.map((l) => (
            <div
              key={l.conta.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-[#e6eef3] px-3 py-2 dark:border-slate-700"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                <span className="truncate text-[13px] font-semibold text-[#0f2b38] dark:text-white">{l.nome}</span>
                <span className="shrink-0 rounded-full bg-[#f5f9fb] px-2 py-0.5 text-[10.5px] font-medium text-[#5f7885] dark:bg-slate-700 dark:text-slate-300">
                  {l.conta.tipo === 'empresa' ? 'PJ' : 'PF'}
                </span>
              </div>
              <div className="flex gap-4 text-[12.5px]">
                <span className="text-[#067647] dark:text-emerald-300">{formatCurrency(l.receita)}</span>
                <span className="text-[#b42318] dark:text-rose-300">{formatCurrency(l.despesa)}</span>
                <span className="font-semibold text-[#0f2b38] dark:text-white">{formatCurrency(l.saldo)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
