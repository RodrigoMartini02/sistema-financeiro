import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Badge } from '../../../ui/badge';
import { Card } from '../../../ui/card';
import { queryKeys } from '../../../services/queryKeys';
import { getContratosFaturamento } from '../../../services/financeService';
import { MONTH_NAMES, type PainelData, type PainelPeriodo } from '../../../types/finance';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, RodapeCard } from './PainelLayout';

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
          <b className="block text-base font-bold text-amber-700 dark:text-amber-300">
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
    <CardPainel>
      <CabecalhoCard
        titulo={<>Carteira de contratos <span className="font-normal text-slate-500 dark:text-slate-400">· {MONTH_NAMES[mes! - 1]}</span></>}
        detalhe={`${formatCurrency(total)}/mês · ${contratos.length} contrato(s)`}
      />
      <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
        <span className="h-full bg-emerald-500" style={{ width: `${percentual(recebido)}%` }} />
        <span className="h-full bg-cyan-600" style={{ width: `${percentual(faturado)}%` }} />
      </span>
      <span className="flex flex-wrap gap-2">
        {recebido > 0 && <Badge tone="income">Recebido {formatCurrency(recebido)}</Badge>}
        {faturado > 0 && (
          <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-700">
            Faturado {formatCurrency(faturado)}
          </span>
        )}
        {pendente > 0 && <Badge tone="neutral">Pendente {formatCurrency(pendente)}</Badge>}
      </span>
    </CardPainel>
  );
}

function ReceitasPorOrigem({ origem }: { origem: NonNullable<PainelData['empresa']>['receitasPorOrigem'] }) {
  const cores = useCoresGrafico();
  const total = origem.contratos + origem.avulsas;
  if (total === 0) return null;
  const fatias = [
    { name: 'Contratos', value: origem.contratos, color: cores.categorias[0]! },
    { name: 'Avulsas', value: origem.avulsas, color: cores.categorias[1]! },
  ].filter((fatia) => fatia.value > 0);

  return (
    <CardPainel>
      <CabecalhoCard titulo="Receitas por origem" detalhe="de onde veio" />
      <DonutChart data={fatias} centerLabel="Entrou" centerValue={formatCurrency(total)} />
      <RodapeCard>
        {origem.contratos === 0
          ? 'Toda a receita veio de entradas avulsas, sem receita recorrente de contratos.'
          : origem.avulsas === 0
            ? 'Toda a receita veio de contratos recorrentes.'
            : 'A receita combina contratos recorrentes e entradas avulsas.'}
      </RodapeCard>
    </CardPainel>
  );
}

/** Blocos que só existem em conta empresa, mantidos até a rodada própria da conta empresa. */
export function ExtrasContaEmpresa({ empresa, periodo }: ExtrasContaEmpresaProps) {
  return (
    <>
      {empresa.estoqueBaixo.length > 0 && <EstoqueBaixo produtos={empresa.estoqueBaixo} />}
      <div className="grid gap-3 lg:grid-cols-2">
        <CarteiraDeContratos periodo={periodo} />
        <ReceitasPorOrigem origem={empresa.receitasPorOrigem} />
      </div>
    </>
  );
}
