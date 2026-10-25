import { useEffect, useMemo, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchCategorias } from '../../services/configService';
import { fetchPainel } from '../../services/financeService';
import { getActiveAccountId } from '../../services/apiClient';
import { fetchMembros } from '../../services/membrosService';
import { fetchMe } from '../../services/usuariosService';
import { ErrorState } from '../../ui/states';
import { MultiFilterPanel, type FilterGroup } from '../../ui/MultiFilterPanel';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useOwnPermissions } from '../../hooks/useOwnPermissions';
import { PAYMENT_METHODS, type PainelPeriodo } from '../../types/finance';
import { categoryFilterNames, categoryFilterOptions } from '../../utils/categorySuggestions';
import {
  chaveEscopoPessoas, descreverEscopoPessoas, escopoInicial, gravarEscopoPessoas, lerEscopoPessoas,
} from '../../utils/escopoPessoasSalvo';
import { canReadCatalogList } from '../../utils/screenAccess';
import { TERMOS } from '../config/ContasTab';
import { DashboardPeriodFilter, descreverPeriodo, periodoDoAnoAtual } from './DashboardPeriodFilter';
import { getPaymentMethodLabel } from './entryTable';
import { firstName } from './memberColors';
import { AvisoPainelFiltrado } from './painel/AvisoPainelFiltrado';
import { CardsResumo } from './painel/CardsResumo';
import { ComoDinheiroSaiu } from './painel/ComoDinheiroSaiu';
import { DeOndeVeioDinheiro } from './painel/DeOndeVeioDinheiro';
import { coresPorPessoa as montarCoresPorPessoa, useCoresGrafico } from './painel/coresGrafico';
import { Comprometido } from './painel/Comprometido';
import { EmDiaComContas } from './painel/EmDiaComContas';
import { ExtrasContaEmpresa } from './painel/ExtrasContaEmpresa';
import { JurosDescontos } from './painel/JurosDescontos';
import { Planejado } from './painel/Planejado';
import { QuemTrouxeQuemGastou } from './painel/QuemTrouxeQuemGastou';
import { ReceitaDespesa } from './painel/ReceitaDespesa';
import { TodasAsContas } from './painel/TodasAsContas';
import { ENTRADA_PAINEL, EsqueletoPainel } from './painel/base';
import { OndeMaisGastou } from './painel/OndeMaisGastou';

const GRUPO_MEMBROS = 'membros';
const GRUPO_CATEGORIA = 'categoria';
const GRUPO_FORMA = 'forma-pagamento';
const GRUPO_CARTAO = 'cartao';
const GRUPO_CONTAS = 'contas';
const OPCAO_TODAS_CONTAS = 'todas';

export function FinanceDashboard() {
  // Calculado ao montar a tela, não ao carregar o módulo: com o app aberto na
  // virada do ano, reabrir o painel já traz o ano novo.
  const [periodo, setPeriodo] = useState<PainelPeriodo>(() => periodoDoAnoAtual());
  const [todasAsContas, setTodasAsContas] = useState(false);
  // Pessoas marcadas no filtro, por usuario_id. Vazio só até o escopo ser iniciado: o efeito abaixo
  // restaura a última escolha (ou marca o próprio usuário) quando o id e a lista de pessoas chegam.
  const [membroIds, setMembroIds] = useState<Set<string>>(new Set());
  const [escopoIniciado, setEscopoIniciado] = useState(false);
  // Filtros de despesa (como em Lançamentos): valem só para as despesas.
  const [categoriaIds, setCategoriaIds] = useState<Set<string>>(new Set());
  const [formasPagamento, setFormasPagamento] = useState<Set<string>>(new Set());
  const [cartaoIds, setCartaoIds] = useState<Set<string>>(new Set());
  const guiaMes = useFirstAccessGuide('painel:mes-v1');

  const accountId = getActiveAccountId();
  const meQ = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, staleTime: 5 * 60_000 });
  const membrosQ = useQuery({
    queryKey: queryKeys.membros(accountId),
    queryFn: () => fetchMembros(accountId ?? undefined),
    staleTime: 5 * 60_000,
  });
  // Mesma chave usada em AppShell.tsx — cache compartilhado.
  const permissoes = useOwnPermissions();
  const podeVerTodasAsContas = permissoes?.accessGeneralOverview ?? true;
  // Quem não lê categorias de despesa fica sem o grupo de categoria, como em Lançamentos.
  const podeLerCategorias = canReadCatalogList(permissoes ?? {}, 'expenseCategories');
  const categoriasQ = useQuery({
    queryKey: queryKeys.categorias(accountId),
    queryFn: () => fetchCategorias(accountId),
    enabled: podeLerCategorias,
    staleTime: 5 * 60_000,
  });

  const meId = meQ.data ? String(meQ.data.id) : null;
  // O titular não está em conta_membros (a rota lista só os vinculados): ele
  // entra pelo próprio cadastro, senão não teria como se filtrar por nome.
  const pessoas = useMemo(() => [
    ...(meQ.data ? [{ usuarioId: meQ.data.id, nome: firstName(meQ.data.nomeExibicao ?? meQ.data.nome) }] : []),
    ...(membrosQ.data ?? [])
      .filter((membro) => membro.usuario_id !== meQ.data?.id)
      .map((membro) => ({ usuarioId: membro.usuario_id, nome: firstName(membro.nome) })),
  ], [meQ.data, membrosQ.data]);

  // A última escolha de pessoas, lembrada por usuário e conta. Espera a lista de pessoas (ou a falha dela)
  // para não descartar quem ainda não carregou; sem nada salvo, é só o próprio usuário.
  const listaDePessoasPronta = membrosQ.isSuccess || membrosQ.isError;
  useEffect(() => {
    if (!meId || escopoIniciado || !listaDePessoasPronta) return;
    const salvo = lerEscopoPessoas(window.localStorage, chaveEscopoPessoas(meId, accountId));
    setMembroIds(escopoInicial(salvo, meId, pessoas.map((pessoa) => String(pessoa.usuarioId))));
    setEscopoIniciado(true);
  }, [meId, accountId, pessoas, listaDePessoasPronta, escopoIniciado]);
  useEffect(() => {
    if (!meId || !escopoIniciado) return;
    gravarEscopoPessoas(window.localStorage, chaveEscopoPessoas(meId, accountId), membroIds, meId);
  }, [meId, accountId, membroIds, escopoIniciado]);

  // Escopo pedido ao backend: só eu (padrão) → undefined; todas as pessoas →
  // null; qualquer outra combinação → a lista exata. Quem valida se cada
  // pessoa pode ser vista é o backend.
  const somenteEu = meId !== null && membroIds.size === 1 && membroIds.has(meId);
  const todasAsPessoas = pessoas.length > 1 && pessoas.every((pessoa) => membroIds.has(String(pessoa.usuarioId)));
  const membroId: number[] | null | undefined = membroIds.size === 0 || somenteEu
    ? undefined
    : todasAsPessoas ? null : [...membroIds].map(Number);

  const filtrosDespesa = {
    categoryIds: [...categoriaIds].map(Number),
    cardIds: [...cartaoIds].map(Number),
    paymentMethods: [...formasPagamento],
  };
  const filtrado = categoriaIds.size > 0 || cartaoIds.size > 0 || formasPagamento.size > 0;

  const painelQ = useQuery({
    queryKey: queryKeys.painel(accountId, periodo.de, periodo.ate, membroId, filtrosDespesa),
    queryFn: () => fetchPainel({ ...periodo, membroId, ...filtrosDespesa }),
    // Só depois de restaurar a escolha de pessoas: pedir antes faria uma consulta de "só eu" que logo seria trocada.
    enabled: meId !== null && escopoIniciado,
    staleTime: 30_000,
    // Ao trocar período ou pessoas, os gráficos ficam na tela e passam para os
    // valores novos (sem piscar). Trocar de conta não reaproveita os dados.
    placeholderData: (anterior, consultaAnterior) => (consultaAnterior?.queryKey[1] === (accountId ?? 'ativa') ? anterior : undefined),
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

  // Opções dos filtros de despesa: categorias do catálogo, as quatro formas e os
  // cartões das despesas do período (mais os marcados, se o período mudou).
  const opcoesCategoria = categoryFilterOptions(categoriasQ.data ?? []);
  const cartoesDoPeriodo = dados?.filterOptions?.cards ?? [];
  const opcoesCartao = [
    ...cartoesDoPeriodo.map((cartao) => ({ value: String(cartao.id), label: cartao.name })),
    ...[...cartaoIds]
      .filter((id) => !cartoesDoPeriodo.some((cartao) => String(cartao.id) === id))
      .map((id) => ({ value: id, label: `Cartão ${id}` })),
  ];
  const opcoesForma = PAYMENT_METHODS.map((forma) => ({ value: forma, label: getPaymentMethodLabel(forma) }));

  const grupos: FilterGroup[] = [
    {
      id: GRUPO_MEMBROS,
      label: termos.plural,
      options: pessoas.map((pessoa) => ({ value: String(pessoa.usuarioId), label: pessoa.nome })),
      selected: membroIds,
      onChange: setMembroIds,
    },
    ...(podeLerCategorias
      ? [{ id: GRUPO_CATEGORIA, label: 'Categoria', options: opcoesCategoria, selected: categoriaIds, onChange: setCategoriaIds }]
      : []),
    { id: GRUPO_FORMA, label: 'Forma de pagamento', options: opcoesForma, selected: formasPagamento, onChange: setFormasPagamento },
    ...(opcoesCartao.length > 0
      ? [{ id: GRUPO_CARTAO, label: 'Cartão', options: opcoesCartao, selected: cartaoIds, onChange: setCartaoIds }]
      : []),
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
  const padrao = periodoDoAnoAtual();
  const periodoEhPadrao = periodo.de === padrao.de && periodo.ate === padrao.ate;
  const filtrosAtivos = !somenteEu || todasAsContas || !periodoEhPadrao || filtrado;
  // Quem está sendo somado, com o atalho para alternar entre só eu e todas as pessoas da conta.
  const mostrarEscopo = meId !== null && escopoIniciado && pessoas.length > 1;
  const alternarEscopo = () => {
    if (!meId) return;
    setMembroIds(somenteEu ? new Set(pessoas.map((pessoa) => String(pessoa.usuarioId))) : new Set([meId]));
  };
  const limparFiltros = () => {
    setMembroIds(meId ? new Set([meId]) : new Set());
    setTodasAsContas(false);
    setPeriodo(periodoDoAnoAtual());
    setCategoriaIds(new Set());
    setFormasPagamento(new Set());
    setCartaoIds(new Set());
  };
  // Nomes dos filtros de despesa ligados, para o aviso de painel filtrado.
  const nomeDe = (opcoes: { value: string; label: string }[], valor: string) => opcoes.find((opcao) => opcao.value === valor)?.label ?? valor;
  const nomesFiltros = [
    ...categoryFilterNames(opcoesCategoria, categoriaIds),
    ...[...formasPagamento].map((forma) => nomeDe(opcoesForma, forma)),
    ...[...cartaoIds].map((id) => nomeDe(opcoesCartao, id)),
  ];

  const semLancamentos = !!dados && dados.totalLancamentos === 0;
  const anteriorEhMes = !!dados && dados.periodoAnterior.de.endsWith('-01')
    && dados.periodoAnterior.ate.slice(0, 7) === dados.periodoAnterior.de.slice(0, 7)
    && dados.periodo.de.endsWith('-01');
  // Comparar pessoas só faz sentido com mais de uma no escopo pedido.
  const mostrarPessoas = tipoConta === 'pessoal' && (todasAsPessoas || (membroId?.length ?? 0) > 1);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="m-0 mr-auto text-2xl font-semibold text-slate-950 dark:text-white">Painel financeiro</h1>
        <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-medium tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {descreverPeriodo(periodo)}
        </span>
        {mostrarEscopo && meId && (
          <button
            type="button"
            onClick={alternarEscopo}
            title={somenteEu ? 'Somar também as outras pessoas da conta' : 'Voltar a somar só você'}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span>{descreverEscopoPessoas(membroIds, pessoas, meId)}</span>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">·</span>
            <span className="text-brand-700 dark:text-brand-300">{somenteEu ? 'Ver todos' : 'Só eu'}</span>
          </button>
        )}
        <MultiFilterPanel
          groups={grupos}
          hasActiveFilters={filtrosAtivos}
          onClear={limparFiltros}
          topo={(
            <div className="flex flex-col gap-1.5">
              <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Período</span>
              <DashboardPeriodFilter value={periodo} onChange={setPeriodo} />
            </div>
          )}
        />
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

      {filtrado && <AvisoPainelFiltrado nomes={nomesFiltros} />}

      {todasAsContas && podeVerTodasAsContas && <TodasAsContas periodo={periodo} />}

      {painelQ.error && <ErrorState title="Não foi possível carregar o painel" description={painelQ.error.message} />}
      {painelQ.isLoading && <EsqueletoPainel />}

      {dados && (
        <MotionConfig reducedMotion="user">
          <motion.div className="grid gap-7" variants={ENTRADA_PAINEL} initial="oculto" animate="visivel">
            <CardsResumo
              resumo={dados.resumo}
              serie={dados.serie}
              descricaoPeriodo={descreverPeriodo(dados.periodo)}
              anteriorEhMes={anteriorEhMes}
              filtrado={filtrado}
            />
            {dados.empresa && <ExtrasContaEmpresa empresa={dados.empresa} periodo={dados.periodo} />}
            <ReceitaDespesa serie={dados.serie} somenteDespesas={filtrado} />
            <DeOndeVeioDinheiro dados={dados} semComprometimento={filtrado} />
            <ComoDinheiroSaiu dados={dados} />
            <EmDiaComContas dados={dados} />
            {dados.planejado && <Planejado itens={dados.planejado} />}
            <Comprometido meses={dados.contasEmAberto.comprometido} />
            {mostrarPessoas && (
              <QuemTrouxeQuemGastou pessoas={dados.porPessoa} coresPorPessoa={coresPorPessoa} somenteGastos={filtrado} />
            )}
            <JurosDescontos valores={dados.jurosDescontos} serie={dados.serie} ano={dados.periodo.ate.slice(0, 4)} />
            <OndeMaisGastou
              porCategoria={dados.categorias}
              porOutros={dados.categoriasPorOutros}
              coresPorPessoa={coresPorPessoa}
              segmentarPorMembro={membroIds.size > 1}
            />
          </motion.div>
        </MotionConfig>
      )}
    </div>
  );
}
