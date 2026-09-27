import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Card } from '../../../ui/card';
import { queryKeys } from '../../../services/queryKeys';
import { getContratosFaturamento } from '../../../services/financeService';
import { MONTH_NAMES, type PainelData, type PainelPeriodo } from '../../../types/finance';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, RodapeCard } from './PainelLayout';

const COR_CONTRATOS = '#6366f1';
const COR_AVULSAS = '#10b981';

interface ExtrasContaEmpresaProps {
  empresa: NonNullable<PainelData['empresa']>;
  periodo: PainelPeriodo;
}

function EstoqueBaixo({ produtos }: { produtos: NonNullable<PainelData['empresa']>['estoqueBaixo'] }) {
  return (
    <Card className="rounded-2xl border-[#fedf89] bg-[#fffcf5] p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fef0c7] text-[#b54708] dark:bg-amber-950/60 dark:text-amber-300">
          <PackageSearch size={20} />
        </span>
        <p className="m-0 text-[12px] text-[#7b93a1] dark:text-slate-400">
          <b className="block text-[19px] leading-none tabular-nums text-[#b54708] dark:text-amber-300">
            {produtos.length} produto{produtos.length === 1 ? '' : 's'}
          </b>
          {produtos.length === 1 ? 'atingiu' : 'atingiram'} o estoque mínimo configurado.
        </p>
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 border-t border-[#fedf89] p-0 pt-3 dark:border-amber-900/60">
        {produtos.map((produto) => (
          <li
            key={produto.id}
            className="rounded-full border border-[#fedf89] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#b54708] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
          >
            {produto.nome} · {produto.quantidadeEstoque}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Carteira de contratos do mês da data final do período (a API de faturamento é mensal, mês base 1). */
function CarteiraDeContratos({ periodo }: { periodo: PainelPeriodo }) {
  const [ano, mes] = periodo.ate.split('-').map(Number);
  const contratosQ = useQuery({
    queryKey: queryKeys.contratosStatusFaturamento(mes! - 1, ano!),
    queryFn: () => getContratosFaturamento(mes!, ano!),
    staleTime: 60_000,
  });
  const contratos = contratosQ.data ?? [];
  if (contratos.length === 0) return null;

  const somar = (filtro: (status: string | null) => boolean) => contratos
    .filter((contrato) => filtro(contrato.receitaStatus))
    .reduce((soma, contrato) => soma + contrato.valorMensal, 0);
  const total = somar(() => true);
  const recebido = somar((status) => status === 'ativa');
  const faturado = somar((status) => status === 'faturada');
  const pendente = somar((status) => !status || status === 'prevista');
  const percentual = (valor: number) => (total > 0 ? (valor / total) * 100 : 0);

  return (
    <Card className="flex flex-col gap-3 rounded-2xl p-5">
      <CabecalhoCard
        titulo={<>Carteira de contratos <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {MONTH_NAMES[mes! - 1]}</span></>}
        detalhe={`${formatCurrency(total)}/mês · ${contratos.length} contrato(s)`}
      />
      <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#f5f9fb]" aria-hidden="true">
        <span className="h-full bg-[#10b981]" style={{ width: `${percentual(recebido)}%` }} />
        <span className="h-full bg-[#0891b2]" style={{ width: `${percentual(faturado)}%` }} />
      </span>
      <span className="flex flex-wrap gap-3 text-xs font-semibold">
        {recebido > 0 && <span className="rounded-full bg-[#ecfdf3] px-3 py-1 text-[#067647]">Recebido {formatCurrency(recebido)}</span>}
        {faturado > 0 && <span className="rounded-full bg-[#e6f7fa] px-3 py-1 text-[#0e7490]">Faturado {formatCurrency(faturado)}</span>}
        {pendente > 0 && <span className="rounded-full bg-[#f7fafb] px-3 py-1 text-[#6c8593]">Pendente {formatCurrency(pendente)}</span>}
      </span>
    </Card>
  );
}

function ReceitasPorOrigem({ origem }: { origem: NonNullable<PainelData['empresa']>['receitasPorOrigem'] }) {
  const total = origem.contratos + origem.avulsas;
  if (total === 0) return null;
  const fatias = [
    { name: 'Contratos', value: origem.contratos, color: COR_CONTRATOS },
    { name: 'Avulsas', value: origem.avulsas, color: COR_AVULSAS },
  ].filter((fatia) => fatia.value > 0);

  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-[18px_20px]">
      <CabecalhoCard titulo="Receitas por origem" detalhe="de onde veio" />
      <DonutChart data={fatias} centerLabel="ENTROU" centerValue={formatCurrency(total)} />
      <RodapeCard>
        {origem.contratos === 0
          ? 'Toda a receita veio de entradas avulsas, sem receita recorrente de contratos.'
          : origem.avulsas === 0
            ? 'Toda a receita veio de contratos recorrentes.'
            : 'A receita combina contratos recorrentes e entradas avulsas.'}
      </RodapeCard>
    </Card>
  );
}

/** Blocos que só existem em conta empresa, mantidos como estavam até a rodada própria da conta empresa. */
export function ExtrasContaEmpresa({ empresa, periodo }: ExtrasContaEmpresaProps) {
  return (
    <>
      {empresa.estoqueBaixo.length > 0 && <EstoqueBaixo produtos={empresa.estoqueBaixo} />}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <CarteiraDeContratos periodo={periodo} />
        <ReceitasPorOrigem origem={empresa.receitasPorOrigem} />
      </div>
    </>
  );
}
