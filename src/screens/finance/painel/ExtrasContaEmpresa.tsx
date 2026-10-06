import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Badge } from '../../../ui/badge';
import { Card } from '../../../ui/card';
import { useOwnPermissions } from '../../../hooks/useOwnPermissions';
import { usePlanFeatures } from '../../../hooks/usePlanFeatures';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchContractPortfolio } from '../../../services/contractsService';
import { queryKeys } from '../../../services/queryKeys';
import { MONTH_NAMES, type PainelData, type PainelPeriodo } from '../../../types/finance';
import { canManageCatalog } from '../../../utils/screenAccess';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel } from './base';

interface ExtrasContaEmpresaProps {
  empresa: NonNullable<PainelData['empresa']>;
  periodo: PainelPeriodo;
}

function EstoqueBaixo({ produtos }: { produtos: NonNullable<PainelData['empresa']>['estoqueBaixo'] }) {
  return (
    <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <PackageSearch size={18} aria-hidden="true" />
        </span>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          <b className="block text-base font-medium text-amber-700 dark:text-amber-300">
            {produtos.length} produto{produtos.length === 1 ? '' : 's'}
          </b>
          {produtos.length === 1 ? 'atingiu' : 'atingiram'} o estoque mínimo configurado.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 border-t border-amber-200 p-0 pt-3 dark:border-amber-900/60">
        {produtos.map((produto) => (
          <li key={produto.id}>
            <Badge tone="warning">{produto.nome} · {produto.quantidadeEstoque}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Carteira de contratos do mês da data final do período (mês de 1 a 12): a
 * mensalidade de cada contrato, pelo líquido em órgão público, e a situação da
 * receita do mês. Só para quem vê contratos, e contratos são do Premium.
 */
function CarteiraDeContratos({ periodo }: { periodo: PainelPeriodo }) {
  const [ano, mes] = periodo.ate.split('-').map(Number);
  const accountId = getActiveAccountId();
  const permissions = useOwnPermissions();
  const { premium } = usePlanFeatures();
  const contratosQ = useQuery({
    queryKey: queryKeys.contractPortfolio(accountId, mes!, ano!),
    queryFn: () => fetchContractPortfolio(accountId!, mes!, ano!),
    enabled: premium && accountId !== null && !!permissions && canManageCatalog(permissions, 'contracts'),
    staleTime: 60_000,
  });
  const contratos = contratosQ.data ?? [];
  if (contratos.length === 0) return null;

  const somar = (filtro: (status: string | null) => boolean) => contratos
    .filter((contrato) => filtro(contrato.income?.status ?? null))
    .reduce((soma, contrato) => soma + contrato.monthlyNet, 0);
  const total = somar(() => true);
  const recebido = somar((status) => status === 'ativa');
  const faturado = somar((status) => status === 'faturada');
  const pendente = somar((status) => !status || status === 'prevista');
  const percentual = (valor: number) => (total > 0 ? (valor / total) * 100 : 0);

  return (
    <CardPainel>
      <CabecalhoCard
        titulo={<>Carteira de contratos <span className="font-normal text-slate-500 dark:text-slate-400">· {MONTH_NAMES[mes! - 1]} · {contratos.length} contrato{contratos.length === 1 ? '' : 's'}</span></>}
        valor={`${formatCurrency(total)}/mês`}
      />
      <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
        <span className="h-full bg-emerald-500" style={{ width: `${percentual(recebido)}%` }} />
        <span className="h-full bg-cyan-600" style={{ width: `${percentual(faturado)}%` }} />
      </span>
      <span className="flex flex-wrap gap-2">
        {recebido > 0 && <Badge tone="income">Recebido {formatCurrency(recebido)}</Badge>}
        {faturado > 0 && (
          <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
            Faturado {formatCurrency(faturado)}
          </span>
        )}
        {pendente > 0 && <Badge tone="neutral">Pendente {formatCurrency(pendente)}</Badge>}
      </span>
    </CardPainel>
  );
}

/** Blocos que só existem em conta empresa, mantidos até a rodada própria da conta empresa. */
export function ExtrasContaEmpresa({ empresa, periodo }: ExtrasContaEmpresaProps) {
  return (
    <>
      {empresa.estoqueBaixo.length > 0 && <EstoqueBaixo produtos={empresa.estoqueBaixo} />}
      <CarteiraDeContratos periodo={periodo} />
    </>
  );
}
