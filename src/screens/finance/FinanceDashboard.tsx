import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, TrendingUp, CreditCard, Settings, PackageSearch } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchDashboardPanorama, getContratosFaturamento, fetchParcelasFuturas } from '../../services/financeService';
import { getActiveAccountId } from '../../services/apiClient';
import { TERMOS } from '../config/ContasTab';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { formatCurrency, formatDate } from './formatters';
import { AnnualTrendChart } from './charts/AnnualTrendChart';
import { DonutChart } from './charts/DonutChart';
import { MonthWaterfallChart } from './charts/MonthWaterfallChart';
import { JurosDescontosChart } from './charts/JurosDescontosChart';
import { ParcelasFuturasChart } from './charts/ParcelasFuturasChart';
import { MonthCategoriesOverview } from './MonthCategoriesOverview';
import { DashboardPeriodFilter, describePeriod, type DashboardPeriod } from './DashboardPeriodFilter';
import { fetchAccountSummary, fetchMembros } from '../../services/membrosService';
import { fetchMe } from '../../services/usuariosService';
import { fetchOwnPermissions } from '../../services/permissoesService';
import { buildMemberColors, memberColor, firstName, PALETA } from './memberColors';
import { PanoramaGeralView } from './PanoramaGeralView';
import { MultiFilterPanel, type FilterGroup } from '../../ui/MultiFilterPanel';

const now = new Date();
const THIS_YEAR = now.getFullYear();
const THIS_MONTH = now.getMonth();

function periodToQuery(period: DashboardPeriod): { deMes?: number; deAno?: number; ateMes?: number; ateAno?: number } {
  return { deMes: period.mes, deAno: period.ano, ateMes: period.ateMes, ateAno: period.ateAno };
}

function serieLabel(ano: number, mes: number | null): string {
  if (mes === null) return String(ano);
  return `${MONTH_NAMES[mes].slice(0, 3)}/${String(ano).slice(2)}`;
}

export function FinanceDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>({ mes: 0, ano: THIS_YEAR, ateMes: 11, ateAno: THIS_YEAR });
  const guide = useFirstAccessGuide('painel:mes-v1');
  const comprometimentoGuide = useFirstAccessGuide('painel:comprometimento-v1');

  // Ids marcados no filtro sanduiche. Toda pessoa — inclusive o proprio
  // usuario logado — e uma opcao nomeada, identificada pelo usuario_id: nao
  // existe sentinela "eu". Vazio so acontece antes de meQ resolver; o efeito
  // abaixo marca o proprio usuario assim que o id chega.
  const [membroIds, setMembroIds] = useState<Set<string>>(new Set());

  // Alterna entre a visao desta conta (comportamento historico, inalterado) e
  // o Panorama Geral (agregado entre todas as contas do dono). Nao persiste
  // entre sessoes, mesmo criterio do filtro de membro acima.
  const [visao, setVisao] = useState<'conta' | 'panorama'>('conta');

  const activeAccountId = getActiveAccountId();
  const meQ = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, staleTime: 5 * 60_000 });
  const membrosQ = useQuery({
    queryKey: queryKeys.membros(activeAccountId),
    queryFn: () => fetchMembros(activeAccountId ?? undefined),
    staleTime: 5 * 60_000,
  });
  // Sem membros vinculados nao ha o que separar: o painel se comporta como antes.
  const temMembros = (membrosQ.data?.length ?? 0) > 0;

  // O titular nao esta em conta_membros (a rota lista so os vinculados), entao
  // ele entra aqui pelo proprio cadastro. Sem isso o dono da conta nao teria
  // como se filtrar por nome.
  const meIdStr = meQ.data ? String(meQ.data.id) : null;
  const pessoas = [
    ...(meQ.data ? [{ usuarioId: meQ.data.id, nome: firstName(meQ.data.nomeExibicao ?? meQ.data.nome) }] : []),
    ...(membrosQ.data ?? [])
      .filter((m) => m.usuario_id !== meQ.data?.id)
      .map((m) => ({ usuarioId: m.usuario_id, nome: firstName(m.nome) })),
  ];

  // Abre com o proprio usuario marcado — mesma visao padrao de antes ("so
  // eu"), agora expressa pelo nome dele em vez de um sentinela. So roda uma
  // vez: se o usuario desmarcar a si mesmo, a escolha e respeitada.
  const jaIniciouMembros = useRef(false);
  useEffect(() => {
    if (!meIdStr || jaIniciouMembros.current) return;
    jaIniciouMembros.current = true;
    setMembroIds(new Set([meIdStr]));
  }, [meIdStr]);

  // Mesma query/chave usada em AppShell.tsx — cache compartilhado. Sem a
  // permissao, o membro nem ve a opcao Panorama Geral no toggle abaixo, em
  // vez de so descobrir o bloqueio ao clicar (403 do backend).
  const { data: ownPermissions } = useQuery({
    queryKey: ['own-permissions'],
    queryFn: fetchOwnPermissions,
    staleTime: 5 * 60_000,
  });
  const canViewPanorama = ownPermissions?.accessGeneralOverview ?? true;

  // Deriva o parametro que o backend entende a partir dos ids marcados: todas
  // as pessoas marcadas = familia inteira (null, chave de cache estavel);
  // qualquer outro conjunto = lista exata. Nunca vira undefined a partir de
  // uma escolha do usuario — undefined so existe enquanto meQ nao resolveu.
  const membroId: number | number[] | null | undefined =
    membroIds.size === 0
      ? undefined
      : pessoas.length > 0 && pessoas.every((p) => membroIds.has(String(p.usuarioId)))
        ? null
        : [...membroIds].map(Number);

  const query = { ...periodToQuery(period), membroId };
  const panoramaQ = useQuery({
    queryKey: queryKeys.dashboardPanorama(query.deMes, query.deAno, query.ateMes, query.ateAno, membroId),
    queryFn: () => fetchDashboardPanorama(query),
    staleTime: 30_000,
  });
  const data = panoramaQ.data;

  // A comparacao "por membro" so faz sentido no modo Familia — nos demais
  // escopos ("Eu" ou um membro especifico) nao ha o que comparar.
  const summaryQ = useQuery({
    queryKey: queryKeys.accountSummary(query.deMes, query.deAno, query.ateMes, query.ateAno, membroId === null),
    queryFn: () => fetchAccountSummary({
      deMes: query.deMes, deAno: query.deAno, ateMes: query.ateMes, ateAno: query.ateAno,
      ...(membroId === null ? { escopo: 'familia' as const } : {}),
    }),
    enabled: temMembros && membroId === null,
    staleTime: 30_000,
  });

  // Contratos e parcelas futuras sao consultas de um mes de referencia. Antes o
  // painel so as exibia quando o filtro colapsava em um mes unico — e como ele
  // abre em Jan-Dez, os dois blocos ficavam invisiveis por padrao. Agora o mes
  // de referencia e o ultimo do periodo filtrado: a carteira e as parcelas que
  // interessam sao as do fim do intervalo, nao as do comeco.
  const mesReferencia = { mes: period.ateMes, ano: period.ateAno };

  const contratosQ = useQuery({
    queryKey: queryKeys.contratosStatusFaturamento(mesReferencia.mes, mesReferencia.ano),
    queryFn: () => getContratosFaturamento(mesReferencia.mes + 1, mesReferencia.ano),
    staleTime: 60_000,
  });
  const contratos = contratosQ.data ?? [];

  // Ano inteiro: o grafico de parcelas cobre os 12 meses do ano do fim do
  // periodo filtrado, nao uma janela relativa ao mes corrente.
  const parcelasQ = useQuery({
    queryKey: queryKeys.parcelasFuturas(mesReferencia.ano, membroId),
    queryFn: () => fetchParcelasFuturas(mesReferencia.ano, membroId),
    staleTime: 60_000,
  });
  const parcelasFuturas = parcelasQ.data ?? [];

  const accountTypeLabel = localStorage.getItem('contaAtivaTipo') === 'empresa' ? 'empresa' : 'pessoal';

  const receitas = data?.receitas ?? 0;
  const despesas = data?.despesas ?? 0;
  const saldoAnterior = data?.saldoAnterior ?? 0;
  const saldoFinal = data?.saldoFinal ?? 0;
  const txComprometimento = receitas > 0 ? (despesas / receitas) * 100 : 0;
  // Mesmas faixas desenhadas na barra abaixo do numero: verde ate 70%, ambar ate
  // 100%, vermelho acima — onde a renda ja nao cobre as despesas.
  const comprometimentoTone = txComprometimento > 100
    ? 'text-[#b42318] dark:text-rose-300'
    : txComprometimento > 70
      ? 'text-[#b54708] dark:text-amber-300'
      : 'text-[#067647] dark:text-emerald-300';
  const pctGasto = receitas > 0 ? Math.min(100, (despesas / receitas) * 100) : 0;
  const hasNoEntries = !panoramaQ.isLoading && !!data && data.totalLancamentos === 0;

  // Média por período da série, contando só os que tiveram movimento: incluir
  // meses futuros vazios do filtro puxaria a média para baixo e diria pouco.
  // Só faz sentido com mais de um período — com um só, a média é o próprio total.
  const mediaMensal = (selecionar: (p: { receitas: number; despesas: number }) => number): number | null => {
    const comMovimento = (data?.serie ?? []).filter((p) => selecionar(p) > 0);
    if (comMovimento.length < 2) return null;
    return comMovimento.reduce((soma, p) => soma + selecionar(p), 0) / comMovimento.length;
  };
  const mediaMensalReceitas = mediaMensal((p) => p.receitas);
  const mediaMensalDespesas = mediaMensal((p) => p.despesas);
  // Acima de 24 meses o backend agrega a série por ano, então a média é por ano
  // — mesmo tratamento que os textos do gráfico anual já fazem.
  const unidadeDaMedia = data?.granularidade === 'ano' ? 'ano' : 'mês';

  // Annual chart data — usa a série já agregada (mês ou ano) devolvida pelo backend
  const chartData = useMemo(() => (data?.serie ?? []).map((p) => ({
    name: serieLabel(p.ano, p.mes),
    receitas: p.receitas,
    despesas: p.despesas,
    saldo: p.receitas - p.despesas,
  })), [data]);

  // Quando o período filtrado inclui o mês corrente, destaca esse ponto na série mensal.
  const activeSerieIndex = useMemo(() => {
    if (!data || data.granularidade !== 'mes') return undefined;
    const idx = data.serie.findIndex((p) => p.ano === THIS_YEAR && p.mes === THIS_MONTH);
    return idx >= 0 ? idx : undefined;
  }, [data]);

  const highlights = useMemo(() => {
    if (!data || data.serie.length === 0) return null;
    const melhor = data.serie.reduce((best, p) => (p.receitas > best.receitas ? p : best));
    const maiorGasto = data.serie.reduce((worst, p) => (p.despesas > worst.despesas ? p : worst));
    return {
      melhorLabel: serieLabel(melhor.ano, melhor.mes),
      melhorValor: melhor.receitas,
      maiorGastoLabel: serieLabel(maiorGasto.ano, maiorGasto.mes),
      maiorGastoValor: maiorGasto.despesas,
    };
  }, [data]);

  // Receitas by origin (contratos vs avulsas)
  const origemData = useMemo(() => {
    const map: Record<string, number> = { Contratos: 0, Avulsas: 0 };
    for (const o of data?.porOrigem ?? []) {
      if (o.origem === 'contrato') map.Contratos += o.total;
      else map.Avulsas += o.total;
    }
    return [
      { name: 'Contratos', value: map.Contratos, color: '#6366f1' },
      { name: 'Avulsas', value: map.Avulsas, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [data]);

  // Payment method
  const formaData = useMemo(() => (data?.porFormaPagamento ?? [])
    .map((f) => ({ name: f.forma_pagamento, value: f.total }))
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, color: PALETA[i % PALETA.length] })), [data]);

  // Dados por membro. A cor sai do usuario_id, nao da posicao na lista: assim a
  // mesma pessoa mantem a cor nos donuts e nas barras de categoria. A fonte e
  // `pessoas` (titular + membros), nao `summary`, que so existe no modo em que
  // todos estao marcados — as barras de categoria precisam da cor em qualquer
  // combinacao do filtro.
  const summary = summaryQ.data;
  const memberColors = useMemo(
    () => buildMemberColors(pessoas.map((p) => ({ usuario_id: p.usuarioId }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pessoas.map((p) => p.usuarioId).join(',')],
  );

  const porMembro = useMemo(() => {
    if (!summary) return [];
    const despesaPor = new Map(summary.despesas_por_autor.map((d) => [d.usuario_id, Number(d.total)]));
    const receitaPor = new Map(summary.receitas_por_autor.map((r) => [r.usuario_id, Number(r.total)]));
    return summary.membros.map((m) => {
      const despesa = despesaPor.get(m.usuario_id) ?? 0;
      const receita = receitaPor.get(m.usuario_id) ?? 0;
      return {
        usuarioId: m.usuario_id,
        nome: firstName(m.nome),
        receita,
        despesa,
        saldo: receita - despesa,
        color: memberColor(memberColors, m.usuario_id),
      };
    });
  }, [summary, memberColors]);

  // Membro sem movimento no periodo sai do donut: uma fatia de zero nao desenha
  // nada e ainda ocuparia uma linha na legenda.
  const receitaMembroData = useMemo(
    () => porMembro.filter((m) => m.receita > 0).map((m) => ({ name: m.nome, value: m.receita, color: m.color })),
    [porMembro],
  );
  const despesaMembroData = useMemo(
    () => porMembro.filter((m) => m.despesa > 0).map((m) => ({ name: m.nome, value: m.despesa, color: m.color })),
    [porMembro],
  );

  // Vencidas e a vencer nao passam pelo filtro de periodo: uma conta vencida em
  // agosto continua vencida quando se olha dezembro. O rotulo do bloco diz isso.
  const emAberto = data?.emAberto;
  const temAlerta = (emAberto?.vencidoQuantidade ?? 0) > 0 || (emAberto?.aVencerQuantidade ?? 0) > 0;
  const estoqueBaixo = data?.estoqueBaixo ?? [];

  // Tres faixas: fixa recorrente e compromisso permanente, parcela e compromisso
  // que termina, e o resto e o que da para cortar. `parceladas` ja vem como
  // subconjunto de `variaveis`.
  const comprometido = (data?.despesasDetalhe?.fixas ?? 0) + (data?.despesasDetalhe?.parceladas ?? 0);
  const livre = Math.max(0, despesas - comprometido);

  // Concentracao em poucos cartoes e informacao de risco, nao so de categoria.
  const cartaoData = useMemo(() => (data?.porCartao ?? [])
    .map((c, i) => ({ name: c.cartao, value: c.total, color: PALETA[i % PALETA.length] })), [data]);

  const healthBase = Math.max(receitas, despesas, 1);
  const detalhe = data?.despesasDetalhe;

  // Graficos de 12 meses (juros x descontos e parcelas): cobrem o ano do fim
  // do periodo filtrado, e os totais do rodape somam esse ano inteiro — nao o
  // periodo, que pode ser um recorte menor.
  const anoGraficos = data?.anoReferencia ?? mesReferencia.ano;
  const jurosDescontosMensal = data?.jurosDescontosMensal ?? [];
  const jurosAno = jurosDescontosMensal.reduce((s, m) => s + m.juros, 0);
  const descontosAno = jurosDescontosMensal.reduce((s, m) => s + m.descontos, 0);
  const parcelasPagasAno = parcelasFuturas.reduce((s, p) => s + p.pagas, 0);
  const parcelasEmAbertoAno = parcelasFuturas.reduce((s, p) => s + p.emAberto, 0);

  // Cascata do período: saldo anterior ao período -> receitas -> maiores despesas por categoria -> saldo final
  // A cascata sai da lista completa de categorias, nao do top 8 do donut: escalar
  // as oito maiores para fechar com o total fazia cada barra exibir um valor que
  // nao era o gasto real daquela categoria.
  const waterfallSteps = useMemo(() => {
    // porCategoria vem quebrado por autor (uma linha por categoria+pessoa):
    // consolida por nome antes de ordenar, senao a mesma categoria apareceria
    // repetida, uma barra por pessoa.
    const somaPorCategoria = new Map<string, number>();
    for (const c of data?.porCategoria ?? []) {
      somaPorCategoria.set(c.categoria, (somaPorCategoria.get(c.categoria) ?? 0) + c.total);
    }
    const todas = [...somaPorCategoria.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const topCategorias = todas.slice(0, 5);
    const restantes = todas.slice(5);
    const outrasCategorias = restantes.reduce((s, c) => s + c.value, 0);
    return [
      { label: 'Saldo anterior', value: saldoAnterior, kind: 'start' as const },
      { label: 'Receitas', value: receitas, kind: 'increase' as const },
      ...topCategorias.map((c) => ({ label: c.name, value: -c.value, kind: 'decrease' as const })),
      ...(outrasCategorias > 0 ? [{ label: `Outras ${restantes.length}`, value: -outrasCategorias, kind: 'decrease' as const }] : []),
      { label: 'Saldo final', value: saldoFinal, kind: 'end' as const },
    ];
  }, [saldoAnterior, receitas, data, saldoFinal]);

  const periodoDescricao = describePeriod(period);

  // Filtro sanduiche: grupo "Visao" simula selecao unica (marcar uma opcao
  // substitui a outra, nunca acumula) porque muda a ESTRUTURA da tela, nao um
  // dado — uso atipico do MultiFilterPanel, mas evita duplicar o componente
  // so para essa alternancia. Grupo "Membros" e multi-selecao real.
  const visaoOptions = [
    { value: 'conta', label: 'Esta conta' },
    ...(canViewPanorama ? [{ value: 'panorama', label: 'Panorama Geral' }] : []),
  ];
  const membroOptions = pessoas.map((p) => ({ value: String(p.usuarioId), label: p.nome }));

  const filterGroups: FilterGroup[] = [
    {
      id: 'visao',
      label: 'Visão',
      options: visaoOptions,
      selected: new Set([visao]),
      onChange: (next) => {
        const escolhido = [...next].find((v) => v !== visao);
        if (escolhido) setVisao(escolhido as 'conta' | 'panorama');
      },
    },
    // So faz sentido escolher membros na visao desta conta: no Panorama Geral
    // nao ha esse escopo a filtrar.
    ...(temMembros && visao === 'conta' ? [{
      id: 'membros',
      label: TERMOS[(localStorage.getItem('contaAtivaTipo') === 'empresa' ? 'empresa' : 'pessoal')].plural,
      options: membroOptions,
      selected: membroIds,
      onChange: setMembroIds,
    }] : []),
  ];

  // Estado base = so o proprio usuario marcado (a visao com que o painel
  // abre). Qualquer outro conjunto conta como filtro ativo.
  const membrosEhEstadoBase = meIdStr !== null && membroIds.size === 1 && membroIds.has(meIdStr);
  const hasActiveFilters = !membrosEhEstadoBase;

  const handleClearFilters = () => setMembroIds(meIdStr ? new Set([meIdStr]) : new Set());

  return (
    <div className="grid gap-[18px]">
      {/* Header: o filtro fica alinhado à direita, na mesma linha da descrição
          do período e sem moldura própria — é o mesmo assunto, não um bloco à
          parte. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h1 className="m-0 text-[24px] font-bold tracking-[-0.02em] text-[#0f2b38] dark:text-white">Painel financeiro</h1>
          <p className="m-0 text-[12px] text-[#7b93a1] dark:text-slate-400">
            {periodoDescricao} · conta {accountTypeLabel} · {data?.totalLancamentos ?? 0} lançamento{(data?.totalLancamentos ?? 0) === 1 ? '' : 's'} no período
            {data?.primeiraData && data?.ultimaData && (
              <> · dados de {formatDate(data.primeiraData)} até {formatDate(data.ultimaData)}</>
            )}
          </p>
          {/* Linha própria abaixo da descrição: período e filtro sanduíche
              (Visão + Membros), ambos alinhados à direita. */}
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            <DashboardPeriodFilter value={period} onChange={setPeriod} primeiraData={data?.primeiraData ?? null} />
            <MultiFilterPanel groups={filterGroups} hasActiveFilters={hasActiveFilters} onClear={handleClearFilters} />
          </div>
        </div>
        {guide.isVisible && hasNoEntries && visao === 'conta' && (
          <div className="relative">
            <FirstAccessGuideCard
              icon={Settings}
              description={firstAccessGuideMessages.painelMes}
              align="right"
              floating
              placement="top"
              className="w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={guide.dismiss}
              onSilenceAll={guide.silenceAll}
            />
          </div>
        )}
      </div>

      {visao === 'panorama' ? (
        <PanoramaGeralView period={period} />
      ) : (
        <>
      {panoramaQ.error && (
        <ErrorState
          title="Não foi possível carregar o painel"
          description={panoramaQ.error?.message}
        />
      )}

      {/* O que exige acao agora. Some inteiro quando nao ha nada em aberto —
          ausencia de alerta e a informacao. */}
      {temAlerta && emAberto && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {emAberto.vencidoQuantidade > 0 && (
            <Card className="flex items-center gap-4 rounded-2xl border-[#fecdca] bg-[#fffbfa] p-5 dark:border-rose-900/60 dark:bg-rose-950/20">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fee4e2] text-[#b42318] dark:bg-rose-950/60 dark:text-rose-300">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[19px] font-bold leading-none tabular-nums text-[#b42318] dark:text-rose-300">
                  {formatCurrency(emAberto.vencidoTotal)}
                </p>
                <p className="mt-1.5 text-[12px] text-[#7b93a1] dark:text-slate-400">
                  {emAberto.vencidoQuantidade} despesa{emAberto.vencidoQuantidade === 1 ? '' : 's'} vencida{emAberto.vencidoQuantidade === 1 ? '' : 's'} e não paga{emAberto.vencidoQuantidade === 1 ? '' : 's'}, em qualquer período.
                </p>
              </div>
            </Card>
          )}
          {emAberto.aVencerQuantidade > 0 && (
            <Card className="flex items-center gap-4 rounded-2xl border-[#fedf89] bg-[#fffcf5] p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fef0c7] text-[#b54708] dark:bg-amber-950/60 dark:text-amber-300">
                <Clock size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[19px] font-bold leading-none tabular-nums text-[#b54708] dark:text-amber-300">
                  {formatCurrency(emAberto.aVencerTotal)}
                </p>
                <p className="mt-1.5 text-[12px] text-[#7b93a1] dark:text-slate-400">
                  {emAberto.aVencerQuantidade} despesa{emAberto.aVencerQuantidade === 1 ? '' : 's'} vence{emAberto.aVencerQuantidade === 1 ? '' : 'm'} nos próximos 30 dias.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Estoque baixo: mesma familia dos alertas acima — o que exige acao
          agora. Some inteiro quando nenhum produto atingiu o minimo. */}
      {estoqueBaixo.length > 0 && (
        <Card className="rounded-2xl border-[#fedf89] bg-[#fffcf5] p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fef0c7] text-[#b54708] dark:bg-amber-950/60 dark:text-amber-300">
              <PackageSearch size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[19px] font-bold leading-none tabular-nums text-[#b54708] dark:text-amber-300">
                {estoqueBaixo.length} produto{estoqueBaixo.length === 1 ? '' : 's'}
              </p>
              <p className="mt-1.5 text-[12px] text-[#7b93a1] dark:text-slate-400">
                {estoqueBaixo.length === 1 ? 'atingiu' : 'atingiram'} o estoque mínimo configurado.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#fedf89] pt-3 dark:border-amber-900/60">
            {estoqueBaixo.map((produto) => (
              <span
                key={produto.id}
                className="rounded-full border border-[#fedf89] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#b54708] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {produto.nome} · {produto.quantidade_estoque}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Resumo consolidado */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="flex flex-col rounded-2xl p-5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Saldo do período</span>
          <div className="mt-2 flex items-baseline gap-2">
            {/* O sinal faz parte do dado: um deficit escrito sem o menos vira
                superavit para quem le rapido, e a cor sozinha nao carrega isso. */}
            <span className={`text-[32px] font-bold leading-none tracking-[-0.035em] tabular-nums ${saldoFinal >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>
              {formatCurrency(saldoFinal)}
            </span>
          </div>
          <p className="mt-[9px] text-[12px] text-[#7b93a1] dark:text-slate-400">
            {saldoFinal >= 0 ? 'Sobra acumulada depois de todas as despesas do período.' : 'Despesas superam as receitas neste período.'}
          </p>
        </Card>

        {/* Os três cards do meio mostravam apenas rótulo e número. Ganham a
            mesma leitura de apoio dos outros dois: o que o valor representa e,
            quando faz sentido, sua relação com o período. */}
        <Card className="flex flex-col rounded-2xl p-5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Saldo anterior</span>
          <p className={`mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums ${saldoAnterior >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>
            {formatCurrency(saldoAnterior)}
          </p>
          <p className="mt-auto pt-[9px] text-[12px] text-[#7b93a1] dark:text-slate-400">
            {saldoAnterior >= 0 ? 'Saldo acumulado antes do início do período.' : 'Déficit acumulado antes do início do período.'}
          </p>
        </Card>

        <Card className="flex flex-col rounded-2xl p-5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Receitas</span>
          <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#067647] dark:text-emerald-300">{formatCurrency(receitas)}</p>
          <p className="mt-auto pt-[9px] text-[12px] text-[#7b93a1] dark:text-slate-400">
            {mediaMensalReceitas !== null
              ? <>Média de {formatCurrency(mediaMensalReceitas)} por {unidadeDaMedia}.</>
              : 'Tudo que entrou no período.'}
          </p>
        </Card>

        <Card className="flex flex-col rounded-2xl p-5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Despesas</span>
          <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#b42318] dark:text-rose-300">{formatCurrency(despesas)}</p>
          <p className="mt-auto pt-[9px] text-[12px] text-[#7b93a1] dark:text-slate-400">
            {mediaMensalDespesas !== null
              ? <>Média de {formatCurrency(mediaMensalDespesas)} por {unidadeDaMedia}.</>
              : 'Tudo que saiu no período.'}
          </p>
        </Card>

        <Card className="relative flex flex-col rounded-2xl p-5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Comprometimento</span>
          <p className={`mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums ${comprometimentoTone}`}>
            {receitas > 0 ? `${txComprometimento.toFixed(0)}%` : '—'}
          </p>
          <div className="relative mt-3 flex h-1.5 gap-0.5">
            <div className="flex-[70] rounded-l bg-[#b7e4c7]" />
            <div className="flex-[20] bg-[#f0e0b0]" />
            <div className="flex-[10] rounded-r bg-[#fbd5d1]" />
            <span className="absolute -top-1 h-3.5 w-[3px] rounded bg-[#067647]" style={{ left: `${Math.min(100, txComprometimento)}%` }} />
          </div>
          <p className="mt-2 text-[11.5px] text-[#5f7885] dark:text-slate-400">da renda comprometida com despesas no período</p>
          {comprometimentoGuide.isVisible && (
            <FirstAccessGuideCard
              floating
              placement="top"
              align="right"
              className="w-[min(25rem,calc(100vw-2rem))]"
              icon={AlertTriangle}
              description={firstAccessGuideMessages.painelComprometimento}
              onDismiss={comprometimentoGuide.dismiss}
              onSilenceAll={comprometimentoGuide.silenceAll}
            />
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px] sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="h-[7px] w-[7px] rounded-full bg-[#10b981]" />
            <span className="font-semibold text-[#0f2b38] dark:text-slate-100">Receitas</span>
            <span className="ml-auto font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(receitas)}</span>
          </div>
          <div className="mt-[7px] h-2 rounded bg-[#f1f6f9] dark:bg-slate-700">
            <div className="h-2 rounded bg-[#10b981]" style={{ width: `${Math.min(100, (receitas / healthBase) * 100)}%` }} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="h-[7px] w-[7px] rounded-full bg-[#ef4444]" />
            <span className="font-semibold text-[#0f2b38] dark:text-slate-100">Despesas</span>
            <span className="ml-auto font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(despesas)}</span>
          </div>
          <div className="mt-[7px] h-2 rounded bg-[#f1f6f9] dark:bg-slate-700">
            <div className="h-2 rounded bg-[#ef4444]" style={{ width: `${Math.min(100, (despesas / healthBase) * 100)}%` }} />
          </div>
        </div>
        <span className="shrink-0 pb-px text-[11.5px] text-[#5f7885] dark:text-slate-400">
          Você gastou <b className="text-[#0f2b38] dark:text-slate-100">{pctGasto.toFixed(1)}%</b> do que entrou
        </span>
      </Card>

      {/* Contratos panel — carteira do mês de referência do período */}
      {contratos.length > 0 && (
        <Card className="rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">
              Carteira de contratos <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {MONTH_NAMES[mesReferencia.mes]}</span>
            </h3>
            <span className="text-sm font-semibold text-[#5f7885] dark:text-slate-300">
              {formatCurrency(contratos.reduce((s, c) => s + c.valorMensal, 0))}/mês
            </span>
          </div>
          {(() => {
            const totalCarteira = contratos.reduce((s, c) => s + c.valorMensal, 0);
            const totalRecebido = contratos.filter((c) => c.receitaStatus === 'ativa').reduce((s, c) => s + c.valorMensal, 0);
            const totalFaturado = contratos.filter((c) => c.receitaStatus === 'faturada').reduce((s, c) => s + c.valorMensal, 0);
            const totalPendente = contratos.filter((c) => !c.receitaStatus || c.receitaStatus === 'prevista').reduce((s, c) => s + c.valorMensal, 0);
            const pctFaturado = totalCarteira > 0 ? ((totalRecebido + totalFaturado) / totalCarteira) * 100 : 0;
            return (
              <>
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#5f7885]">{Math.round(pctFaturado)}% recebido/faturado</span>
                    <span className="text-[#5f7885]">{contratos.length} contrato(s)</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#f5f9fb] overflow-hidden flex">
                    <div className="h-full bg-[#10b981] transition-all" style={{ width: `${totalCarteira > 0 ? (totalRecebido / totalCarteira) * 100 : 0}%` }} />
                    <div className="h-full bg-[#0891b2] transition-all" style={{ width: `${totalCarteira > 0 ? (totalFaturado / totalCarteira) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {totalRecebido > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1 text-[#067647] font-semibold">✓ Recebido {formatCurrency(totalRecebido)}</span>
                  )}
                  {totalFaturado > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[#e6f7fa] px-3 py-1 text-[#0e7490] font-semibold">⏱ Faturado {formatCurrency(totalFaturado)}</span>
                  )}
                  {totalPendente > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[#f7fafb] px-3 py-1 text-[#6c8593] font-semibold">○ Pendente {formatCurrency(totalPendente)}</span>
                  )}
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {/* Análise do período */}
      {/* Bloco por membro: só faz sentido com todas as pessoas marcadas —
          summaryQ (fonte de porMembro) só roda com membroId === null, então
          numa seleção parcial porMembro fica vazio e a seção some sozinha. */}
      {temMembros && porMembro.length > 0 && (
        <div>
          <div className="mb-[11px] flex items-center gap-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Por membro da família</span>
            <div className="h-px flex-1 bg-[#e6eef3] dark:bg-slate-700" />
          </div>
          <div className={membroId === null ? 'grid gap-3.5 xl:grid-cols-3' : 'grid gap-3.5'}>
            <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
              <div className="flex items-baseline gap-2.5">
                <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Comparativo</h3>
                <div className="flex-1" />
                <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">entrada e saída de cada um</span>
              </div>
              <div className="mt-3.5 grid">
                {porMembro.map((m) => (
                  <div key={m.usuarioId} className="flex items-center gap-3 border-t border-[#eef4f7] py-2.5 first:border-t-0 dark:border-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                    <span className="w-20 shrink-0 truncate text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">{m.nome}</span>
                    <div className="flex-1" />
                    <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(m.receita)}</span>
                    <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(m.despesa)}</span>
                    <span className={['w-24 shrink-0 text-right text-[12.5px] font-bold tabular-nums', m.saldo >= 0 ? 'text-[#0f2b38] dark:text-white' : 'text-rose-600 dark:text-rose-400'].join(' ')}>
                      {formatCurrency(m.saldo)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3.5 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                Receita, despesa e saldo de cada membro no período.
              </p>
            </Card>

            {membroId === null && (
              <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
                <div className="flex items-baseline gap-2.5">
                  <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Receitas por membro</h3>
                  <div className="flex-1" />
                  <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">quem trouxe</span>
                </div>
                {receitaMembroData.length === 0 ? (
                  <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem receitas no período</p>
                ) : (
                  <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                    <DonutChart data={receitaMembroData} centerLabel="FAMÍLIA" centerValue={formatCurrency(receitas)} />
                  </div>
                )}
              </Card>
            )}

            {membroId === null && (
              <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
                <div className="flex items-baseline gap-2.5">
                  <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Despesas por membro</h3>
                  <div className="flex-1" />
                  <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">quem gastou</span>
                </div>
                {despesaMembroData.length === 0 ? (
                  <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem despesas no período</p>
                ) : (
                  <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                    <DonutChart data={despesaMembroData} centerLabel="FAMÍLIA" centerValue={formatCurrency(despesas)} />
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="mb-[11px] flex items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Análise do período</span>
          <div className="h-px flex-1 bg-[#e6eef3] dark:bg-slate-700" />
        </div>
        <div className="grid gap-3.5 xl:grid-cols-3">
          {/* Card: Composição das despesas */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Composição das despesas</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">{formatCurrency(despesas)} no período</span>
            </div>
            {!detalhe || despesas === 0 ? (
              <p className="flex-1 py-6 text-center text-sm text-slate-400">Sem despesas neste período</p>
            ) : (
              <div className="mt-[18px] flex flex-1 flex-col gap-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#0f2b38] dark:text-white">
                      {Math.round((livre / despesas) * 100)}%
                    </span>
                    <span className="text-[13px] font-semibold text-[#6c8593] dark:text-slate-400">livre</span>
                  </div>
                  <p className="mt-[5px] text-[11.5px] text-[#5f7885] dark:text-slate-400 text-pretty">
                    {livre / despesas >= 0.7
                      ? 'A maior parte do seu gasto é flexível — dá para cortar sem mexer em compromissos.'
                      : comprometido / despesas >= 0.5
                        ? 'Mais da metade já está comprometida entre despesas fixas e parcelas contratadas.'
                        : 'Seu gasto se divide entre compromissos assumidos e gasto livre.'}
                  </p>
                </div>
                <div className="flex gap-[3px] h-3">
                  <div className="rounded-l-md bg-[#6366f1]" style={{ width: `${(detalhe.fixas / despesas) * 100}%` }} />
                  <div className="bg-[#a5b4fc]" style={{ width: `${(detalhe.parceladas / despesas) * 100}%` }} />
                  <div className="flex-1 rounded-r-md bg-[#c7d2fe]" />
                </div>
                {/* Parcela contratada nao e gasto flexivel: sai das "variaveis"
                    para o numero acima dizer o que de fato da para cortar. */}
                <div className="grid gap-1.5 text-[11.5px]">
                  <span className="flex items-baseline gap-1.5 text-[#7b93a1]">
                    <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-[#6366f1]" />Fixas
                    <span className="flex-1" />
                    <b className="text-[#0f2b38] dark:text-slate-100 tabular-nums">{formatCurrency(detalhe.fixas)}</b>
                  </span>
                  <span className="flex items-baseline gap-1.5 text-[#7b93a1]">
                    <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-[#a5b4fc]" />Parcelas contratadas
                    <span className="flex-1" />
                    <b className="text-[#0f2b38] dark:text-slate-100 tabular-nums">{formatCurrency(detalhe.parceladas)}</b>
                  </span>
                  <span className="flex items-baseline gap-1.5 text-[#7b93a1]">
                    <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-[#c7d2fe]" />Livre
                    <span className="flex-1" />
                    <b className="text-[#0f2b38] dark:text-slate-100 tabular-nums">{formatCurrency(livre)}</b>
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Card: Saúde financeira */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">
                Saúde financeira <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {periodoDescricao}</span>
              </h3>
            </div>
            <div className="mt-5 flex flex-1 flex-col gap-4">
              {([
                { label: 'Receitas recebidas', value: receitas, color: '#10b981' },
                { label: 'Despesas pagas', value: detalhe?.pagas ?? 0, color: '#6366f1' },
                { label: 'Despesas pendentes', value: detalhe?.pendentes ?? 0, color: null },
              ] as const).map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-[#0f2b38] dark:text-slate-100">{label}</span>
                    <div className="flex-1" />
                    <span className="text-[12.5px] font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(value)}</span>
                  </div>
                  <div className="mt-[7px] h-2.5 rounded-md bg-[#eef4f7] dark:bg-slate-700">
                    {color && <div className="h-2.5 rounded-md" style={{ width: `${Math.min(100, (value / healthBase) * 100)}%`, background: color }} />}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
              {(detalhe?.pendentes ?? 0) === 0
                ? 'Nada em aberto: tudo que venceu no período já foi pago.'
                : `Ainda há ${formatCurrency(detalhe?.pendentes ?? 0)} em despesas pendentes neste período.`}
            </p>
          </Card>

          {/* Card: Receitas por origem */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Receitas por origem</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">de onde veio</span>
            </div>
            {origemData.length === 0 ? (
              <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem receitas no período</p>
            ) : (
              <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                <DonutChart data={origemData} centerLabel="TOTAL" centerValue={formatCurrency(receitas)} />
              </div>
            )}
            {origemData.length > 0 && (
              <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                {origemData.every((d) => d.name === 'Avulsas')
                  ? 'Toda a renda depende de entradas avulsas, sem receita recorrente garantida.'
                  : origemData.every((d) => d.name === 'Contratos')
                    ? 'Toda a renda vem de contratos recorrentes.'
                    : 'A renda combina contratos recorrentes e entradas avulsas.'}
              </p>
            )}
          </Card>

          {/* Card: Forma de pagamento */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Forma de pagamento</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">como saiu</span>
            </div>
            {formaData.length === 0 ? (
              <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem dados</p>
            ) : (
              <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                <DonutChart data={formaData} centerLabel="PAGO" centerValue={formatCurrency(despesas)} capitalizeLabels />
              </div>
            )}
            {formaData.length > 0 && (() => {
              const totalForma = formaData.reduce((s, d) => s + d.value, 0);
              const credito = formaData.find((d) => d.name.toLowerCase().includes('credito') || d.name.toLowerCase().includes('crédito'));
              const creditoShare = credito && totalForma > 0 ? credito.value / totalForma : 0;
              return (
                <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                  {creditoShare > 0.5
                    ? 'Mais da metade saiu no crédito — o peso maior cai na fatura seguinte.'
                    : 'Suas despesas estão distribuídas entre diferentes formas de pagamento.'}
                </p>
              );
            })()}
          </Card>

          {/* Card: Gasto por cartão */}
          {cartaoData.length > 0 && (
            <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
              <div className="flex items-baseline gap-2.5">
                <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Gasto por cartão</h3>
                <div className="flex-1" />
                <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">em qual cartão</span>
              </div>
              <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                <DonutChart
                  data={cartaoData}
                  centerLabel="CARTÕES"
                  centerValue={formatCurrency(cartaoData.reduce((soma, c) => soma + c.value, 0))}
                />
              </div>
              {(() => {
                const total = cartaoData.reduce((soma, c) => soma + c.value, 0);
                const maior = cartaoData[0];
                const fatia = maior && total > 0 ? maior.value / total : 0;
                return (
                  <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                    {cartaoData.length === 1
                      ? 'Todo o gasto em cartão passa por um único cartão.'
                      : fatia > 0.7
                        ? `${maior!.name} concentra a maior parte do gasto em cartão.`
                        : 'O gasto está distribuído entre os cartões.'}
                  </p>
                );
              })()}
            </Card>
          )}

      </div>
      </div>

      {/* Juros × Descontos e Parcelas: os dois cobrem o ano inteiro, em
          largura total e empilhados — 12 meses não cabem numa coluna de
          um terço da tela. */}
      <Card className="rounded-2xl p-[18px_22px]">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Juros × Descontos</h3>
          <div className="flex-1" />
          <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">ano de {anoGraficos}</span>
        </div>
        {jurosDescontosMensal.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[9px] py-[26px] text-center">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
              <TrendingUp size={19} />
            </span>
            <span className="text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">Sem juros ou descontos em {anoGraficos}</span>
            <span className="max-w-[280px] text-[11.5px] text-[#5f7885] dark:text-slate-400">Nenhuma despesa foi paga com acréscimo nem com abatimento neste ano.</span>
          </div>
        ) : (
          <div className="mt-[14px]">
            <JurosDescontosChart mensal={jurosDescontosMensal} />
            <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[#eef4f7] pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>Juros no ano <strong className="font-semibold text-red-600">{formatCurrency(jurosAno)}</strong></span>
              <span>Descontos no ano <strong className="font-semibold text-green-600">{formatCurrency(descontosAno)}</strong></span>
              <div className="flex-1" />
              <span>
                Saldo financeiro{' '}
                <strong className={descontosAno >= jurosAno ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                  {descontosAno >= jurosAno ? '+' : '-'}{formatCurrency(Math.abs(descontosAno - jurosAno))}
                </strong>
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card className="rounded-2xl p-[18px_22px]">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Parcelas</h3>
          <div className="flex-1" />
          <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">ano de {anoGraficos}</span>
        </div>
        {parcelasQ.isLoading ? (
          <div className="py-6 text-center text-sm text-slate-400">Carregando...</div>
        ) : parcelasFuturas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[9px] py-[22px] text-center">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
              <CreditCard size={19} />
            </span>
            <span className="text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">Nenhuma parcela em {anoGraficos}</span>
          </div>
        ) : (
          <div className="mt-[14px]">
            <ParcelasFuturasChart parcelas={parcelasFuturas} />
            <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[#eef4f7] pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>Pagas <strong className="font-semibold text-green-600">{formatCurrency(parcelasPagasAno)}</strong></span>
              <span>Em aberto <strong className="font-semibold text-amber-600">{formatCurrency(parcelasEmAbertoAno)}</strong></span>
              <div className="flex-1" />
              <span>Total no ano <strong className="font-semibold text-[#0f2b38] dark:text-white">{formatCurrency(parcelasPagasAno + parcelasEmAbertoAno)}</strong></span>
            </div>
          </div>
        )}
      </Card>

      {/* Série temporal */}
      <Card className="rounded-2xl p-[20px_22px_16px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">
              Receitas × Despesas × Saldo <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {periodoDescricao}</span>
            </h2>
            <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">
              {data?.granularidade === 'ano' ? 'Barras mostram o movimento de cada ano.' : 'Barras mostram o movimento de cada mês.'}
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3.5 text-[11.5px] font-semibold text-[#6c8593] dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#ef4444]" />Despesas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-[#6366f1]" />Saldo acumulado</span>
          </div>
        </div>
        {panoramaQ.isLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Sem lançamentos neste período</div>
        ) : (
          <AnnualTrendChart data={chartData} activeIndex={activeSerieIndex} />
        )}
        {highlights && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[#eef4f7] pt-3 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
            <span>Melhor {data?.granularidade === 'ano' ? 'ano' : 'mês'} <b className="text-[#0f2b38] dark:text-slate-100">{highlights.melhorLabel} · {formatCurrency(highlights.melhorValor)}</b></span>
            <span>Maior gasto <b className="text-[#0f2b38] dark:text-slate-100">{highlights.maiorGastoLabel} · {formatCurrency(highlights.maiorGastoValor)}</b></span>
            <span>Saldo do período <b className={saldoFinal >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}>{formatCurrency(saldoFinal)}</b></span>
          </div>
        )}
      </Card>

      <MonthCategoriesOverview
        porCategoria={data?.porCategoria}
        periodLabel={periodoDescricao}
        memberColors={memberColors}
        segmentarPorMembro={membroIds.size > 1}
      />

      {/* Cascata do período */}
      <Card className="rounded-2xl p-[20px_22px_16px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">Cascata do período</h2>
            <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">Do saldo que abriu o período até o que sobrou, passando por cada corte.</p>
          </div>
          <div className="flex-1" />
          {receitas > 0 && (
            <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">
              Sobrou <b className={saldoFinal >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}>{((saldoFinal / receitas) * 100).toFixed(1)}%</b> do que entrou
            </span>
          )}
        </div>
        {panoramaQ.isLoading ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <MonthWaterfallChart steps={waterfallSteps} />
        )}
      </Card>
        </>
      )}
    </div>
  );
}
