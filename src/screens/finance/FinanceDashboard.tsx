import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchPainel } from '../../services/financeService';
import { getActiveAccountId } from '../../services/apiClient';
import { fetchMembros } from '../../services/membrosService';
import { fetchMe } from '../../services/usuariosService';
import { fetchOwnPermissions } from '../../services/permissoesService';
import { ErrorState } from '../../ui/states';
import { MultiFilterPanel, type FilterGroup } from '../../ui/MultiFilterPanel';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import type { PainelPeriodo } from '../../types/finance';
import { TERMOS } from '../config/ContasTab';
import { DashboardPeriodFilter, descreverPeriodo, periodoDoMesAtual } from './DashboardPeriodFilter';
import { MonthCategoriesOverview } from './MonthCategoriesOverview';
import { firstName } from './memberColors';
import { CardsResumo } from './painel/CardsResumo';
import { ComoDinheiroSaiu } from './painel/ComoDinheiroSaiu';
import { coresPorPessoa as montarCoresPorPessoa, useCoresGrafico } from './painel/coresGrafico';
import { Comprometido } from './painel/Comprometido';
import { EmDiaComContas } from './painel/EmDiaComContas';
import { ExtrasContaEmpresa } from './painel/ExtrasContaEmpresa';
import { JurosDescontos } from './painel/JurosDescontos';
import { Planejado } from './painel/Planejado';
import { QuemTrouxeQuemGastou } from './painel/QuemTrouxeQuemGastou';
import { ReceitaDespesa } from './painel/ReceitaDespesa';
import { TodasAsContas } from './painel/TodasAsContas';
import { Vazio } from './painel/PainelLayout';

const GRUPO_MEMBROS = 'membros';
const GRUPO_CONTAS = 'contas';
const OPCAO_TODAS_CONTAS = 'todas';

export function FinanceDashboard() {
  // Calculado ao montar a tela, não ao carregar o módulo: com o app aberto na
  // virada do mês, reabrir o painel já traz o mês novo.
  const [periodo, setPeriodo] = useState<PainelPeriodo>(() => periodoDoMesAtual());
  const [todasAsContas, setTodasAsContas] = useState(false);
  // Pessoas marcadas no filtro, por usuario_id. Vazio só até meQ resolver; o
  // efeito abaixo marca o próprio usuário assim que o id chega.
  const [membroIds, setMembroIds] = useState<Set<string>>(new Set());
  const guiaMes = useFirstAccessGuide('painel:mes-v1');

  const accountId = getActiveAccountId();
  const meQ = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, staleTime: 5 * 60_000 });
  const membrosQ = useQuery({
    queryKey: queryKeys.membros(accountId),
    queryFn: () => fetchMembros(accountId ?? undefined),
    staleTime: 5 * 60_000,
  });
  // Mesma chave usada em AppShell.tsx — cache compartilhado.
  const { data: permissoes } = useQuery({ queryKey: ['own-permissions'], queryFn: fetchOwnPermissions, staleTime: 5 * 60_000 });
  const podeVerTodasAsContas = permissoes?.accessGeneralOverview ?? true;

  const meId = meQ.data ? String(meQ.data.id) : null;
  // O titular não está em conta_membros (a rota lista só os vinculados): ele
  // entra pelo próprio cadastro, senão não teria como se filtrar por nome.
  const pessoas = useMemo(() => [
    ...(meQ.data ? [{ usuarioId: meQ.data.id, nome: firstName(meQ.data.nomeExibicao ?? meQ.data.nome) }] : []),
    ...(membrosQ.data ?? [])
      .filter((membro) => membro.usuario_id !== meQ.data?.id)
      .map((membro) => ({ usuarioId: membro.usuario_id, nome: firstName(membro.nome) })),
  ], [meQ.data, membrosQ.data]);

  const jaIniciouMembros = useRef(false);
  useEffect(() => {
    if (!meId || jaIniciouMembros.current) return;
    jaIniciouMembros.current = true;
    setMembroIds(new Set([meId]));
  }, [meId]);

  // Escopo pedido ao backend: só eu (padrão) → undefined; todas as pessoas →
  // null; qualquer outra combinação → a lista exata. Quem valida se cada
  // pessoa pode ser vista é o backend.
  const somenteEu = meId !== null && membroIds.size === 1 && membroIds.has(meId);
  const todasAsPessoas = pessoas.length > 1 && pessoas.every((pessoa) => membroIds.has(String(pessoa.usuarioId)));
  const membroId: number[] | null | undefined = membroIds.size === 0 || somenteEu
    ? undefined
    : todasAsPessoas ? null : [...membroIds].map(Number);

  const painelQ = useQuery({
    queryKey: queryKeys.painel(accountId, periodo.de, periodo.ate, membroId),
    queryFn: () => fetchPainel({ ...periodo, membroId }),
    enabled: meId !== null,
    staleTime: 30_000,
  });
  const dados = painelQ.data;

  // Cada pessoa mantém a mesma cor em Quem trouxe e em Categorias.
  const cores = useCoresGrafico();
  const coresPorPessoa = useMemo(
    () => montarCoresPorPessoa(pessoas.map((pessoa) => pessoa.usuarioId), cores),
    [pessoas, cores],
  );

  const tipoConta = dados?.tipoConta ?? (localStorage.getItem('contaAtivaTipo') === 'empresa' ? 'empresa' : 'pessoal');
  const termos = TERMOS[tipoConta];

  const grupos: FilterGroup[] = [
    {
      id: GRUPO_MEMBROS,
      label: termos.plural,
      options: pessoas.map((pessoa) => ({ value: String(pessoa.usuarioId), label: pessoa.nome })),
      selected: membroIds,
      onChange: setMembroIds,
    },
    {
      id: GRUPO_CONTAS,
      label: 'Contas',
      options: [{
        value: OPCAO_TODAS_CONTAS,
        label: 'Todas as contas',
        disabled: !podeVerTodasAsContas,
        hint: podeVerTodasAsContas ? undefined : 'sem permissão',
      }],
      selected: new Set(todasAsContas ? [OPCAO_TODAS_CONTAS] : []),
      onChange: (proximo) => setTodasAsContas(proximo.has(OPCAO_TODAS_CONTAS)),
    },
  ];
  const filtrosAtivos = !somenteEu || todasAsContas;
  const limparFiltros = () => {
    setMembroIds(meId ? new Set([meId]) : new Set());
    setTodasAsContas(false);
  };

  const semLancamentos = !!dados && dados.totalLancamentos === 0;
  const anteriorEhMes = !!dados && dados.periodoAnterior.de.endsWith('-01')
    && dados.periodoAnterior.ate.slice(0, 7) === dados.periodoAnterior.de.slice(0, 7)
    && dados.periodo.de.endsWith('-01');
  // Comparar pessoas só faz sentido com mais de uma no escopo pedido.
  const mostrarPessoas = tipoConta === 'pessoal' && (todasAsPessoas || (membroId?.length ?? 0) > 1);

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="m-0 mr-auto text-2xl font-bold text-slate-950 dark:text-white">Painel financeiro</h1>
        <DashboardPeriodFilter value={periodo} onChange={setPeriodo} />
        <MultiFilterPanel groups={grupos} hasActiveFilters={filtrosAtivos} onClear={limparFiltros} />
        {guiaMes.isVisible && semLancamentos && (
          <div className="relative">
            <FirstAccessGuideCard
              icon={Settings}
              description={firstAccessGuideMessages.painelMes}
              align="right"
              floating
              placement="top"
              className="w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={guiaMes.dismiss}
              onSilenceAll={guiaMes.silenceAll}
            />
          </div>
        )}
      </div>

      {todasAsContas && podeVerTodasAsContas && <TodasAsContas periodo={periodo} />}

      {painelQ.error && <ErrorState title="Não foi possível carregar o painel" description={painelQ.error.message} />}
      {painelQ.isLoading && <Vazio>Carregando o painel...</Vazio>}

      {dados && (
        <>
          <CardsResumo resumo={dados.resumo} anteriorEhMes={anteriorEhMes} />
          {dados.empresa && <ExtrasContaEmpresa empresa={dados.empresa} periodo={periodo} />}
          <ReceitaDespesa serie={dados.serie} />
          <ComoDinheiroSaiu dados={dados} />
          <EmDiaComContas dados={dados} />
          {dados.planejado && <Planejado itens={dados.planejado} />}
          <Comprometido meses={dados.contasEmAberto.comprometido} />
          {mostrarPessoas && (
            <QuemTrouxeQuemGastou pessoas={dados.porPessoa} coresPorPessoa={coresPorPessoa} termoPlural={termos.plural} />
          )}
          <JurosDescontos valores={dados.jurosDescontos} ano={periodo.ate.slice(0, 4)} />
          <MonthCategoriesOverview
            porCategoria={dados.categorias}
            periodLabel={descreverPeriodo(periodo)}
            coresPorPessoa={coresPorPessoa}
            segmentarPorMembro={membroIds.size > 1}
          />
        </>
      )}
    </div>
  );
}
