import { and, asc, eq, exists, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { accounts, cards, categories, expenses, incomeClassificationFixes, incomeClassifications, incomes, users } from '../db/schema';
import { catalogoProdutos } from '../modules/catalogo/db/schema';
import { getCardLimitsForOwners } from './cardLimitService';
import { BudgetInputError, getBudgetOverview } from './budgetService';
import { resolveAccountOwnerId } from '../utils/familyVisibility';
import {
  agregarAVistaParcelado,
  agregarCategorias,
  agregarContasEmAberto,
  agregarEmDia,
  agregarFormasPagamento,
  agregarGastoPorCartao,
  agregarJurosDescontos,
  agregarPorPessoa,
  agregarTipoGasto,
  despesasDoPeriodo,
  fatorMetaProporcional,
  gastoPorCategoriaComRollup,
  janelaComprometido,
  janelaDaSerie,
  montarSerie,
  periodoAnterior,
  primeiroDiaDoMes,
  projetarFixas,
  receitasDoPeriodo,
  resumirPeriodo,
  resumirReceitasPainel,
  agruparPorRaiz,
  SEM_CATEGORIA,
  type ItemArvorePainel,
  type FatiaPainel,
  type ContasEmAberto,
  type DespesaPainel,
  type EmDiaAgregado,
  type FormaPagamentoAgregada,
  type Granularidade,
  type FixaPainel,
  type Periodo,
  type PontoSerie,
  type ReceitaPainel,
  type ReceitasPainelResumo,
  type TipoGasto,
} from './painelCalculos';

export type TipoConta = 'pessoal' | 'empresa';

export interface PainelEntrada {
  /** Quem está olhando: dono das metas de orçamento consultadas. */
  solicitanteId: number;
  /** Pessoas cujos lançamentos entram no painel, já validadas por resolveDashboardScope. */
  escopo: number[];
  accountId: number | null;
  tipoConta: TipoConta;
  periodo: Periodo;
  hoje: string;
  podeVerPlanejado: boolean;
}

export interface PainelResposta {
  periodo: Periodo;
  periodoAnterior: Periodo;
  tipoConta: TipoConta;
  totalLancamentos: number;
  resumo: {
    entrou: number;
    saiu: number;
    pago: number;
    aPagar: number;
    entrouAnterior: number;
    saiuAnterior: number;
    saldoAnterior: number;
    saldoFinal: number;
  };
  serie: { granularidade: Granularidade; pontos: PontoSerie[] };
  formasPagamento: FormaPagamentoAgregada[];
  cartoes: Array<{ id: number; nome: string; gasto: number; limite: number | null; usado: number | null }>;
  aVistaParcelado: { aVista: number; parcelado: number };
  tipoGasto: Record<TipoGasto, number>;
  emDia: EmDiaAgregado;
  contasEmAberto: ContasEmAberto;
  planejado: Array<{ categoriaId: number; categoria: string; parentId: number | null; meta: number; gasto: number }> | null;
  porPessoa: Array<{ usuarioId: number; nome: string; receitas: number; despesas: number }>;
  jurosDescontos: { periodo: { juros: number; descontos: number }; ano: { juros: number; descontos: number } };
  categorias: Array<{ categoriaId: number | null; categoria: string; parentId: number | null; usuarioId: number; autorNome: string | null; total: number }>;
  /** De onde veio o dinheiro: recebido e a receber por classificação, comprometimento previsto, fixa × variável. */
  receitas: ReceitasPainelResumo;
  /** Para onde foi: despesas do período pela categoria principal. */
  despesasPorCategoria: FatiaPainel[];
  empresa: {
    estoqueBaixo: Array<{ id: string; nome: string; quantidadeEstoque: number; estoqueMinimo: number }>;
  } | null;
}

const STATUS_ATIVO = 'ativa';
/** Receita lançada e ainda não recebida (contratos passam por faturada). */
const STATUS_A_RECEBER = ['prevista', 'faturada'];
const LIMITE_ESTOQUE_BAIXO = 20;
const CODIGO_TABELA_INEXISTENTE = '42P01';

function numero(valor: string | number | null | undefined): number {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

function menorData(...datas: string[]): string {
  return datas.reduce((menor, data) => (data < menor ? data : menor));
}

/**
 * Filtro de conta único do painel, mesma regra de utils/accountFilter.ts:
 * o registro é da conta informada, ou não tem conta e o autor é dono dela
 * (conta pessoal) — registros anteriores ao conceito de conta.
 */
function filtroConta(colunaConta: AnyPgColumn, colunaUsuario: AnyPgColumn, accountId: number | null): SQL | undefined {
  if (!accountId) {
    return undefined;
  }
  return or(
    eq(colunaConta, accountId),
    and(
      isNull(colunaConta),
      exists(
        db.select({ id: accounts.id }).from(accounts).where(and(
          eq(accounts.id, accountId),
          eq(accounts.type, 'pessoal'),
          eq(accounts.userId, colunaUsuario),
        )),
      ),
    ),
  );
}

const colunasDespesa = {
  usuarioId: expenses.userId,
  categoriaId: expenses.categoryId,
  cartaoId: expenses.cardId,
  formaPagamento: expenses.paymentMethod,
  dataVencimento: expenses.dueDate,
  dataPagamento: expenses.paymentDate,
  pago: expenses.paid,
  valorOriginal: expenses.originalAmount,
  valorPago: expenses.amountPaid,
  parcelado: expenses.installment,
  recorrente: expenses.recurring,
};

type LinhaDespesa = {
  usuarioId: number;
  categoriaId: number | null;
  cartaoId: number | null;
  formaPagamento: string | null;
  dataVencimento: string;
  dataPagamento: string | null;
  pago: boolean | null;
  valorOriginal: string | null;
  valorPago: string | null;
  parcelado: boolean | null;
  recorrente: boolean | null;
};

function paraDespesaPainel(linha: LinhaDespesa): DespesaPainel {
  return {
    usuarioId: linha.usuarioId,
    categoriaId: linha.categoriaId,
    cartaoId: linha.cartaoId,
    formaPagamento: linha.formaPagamento,
    dataVencimento: linha.dataVencimento,
    dataPagamento: linha.dataPagamento,
    pago: linha.pago === true,
    valorOriginal: numero(linha.valorOriginal),
    valorPago: linha.valorPago === null ? null : numero(linha.valorPago),
    parcelado: linha.parcelado === true,
    recorrente: linha.recorrente === true,
  };
}

function condicoesBaseDespesa(entrada: PainelEntrada): Array<SQL | undefined> {
  return [
    inArray(expenses.userId, entrada.escopo),
    eq(expenses.status, STATUS_ATIVO),
    filtroConta(expenses.accountId, expenses.userId, entrada.accountId),
  ];
}

function condicoesBaseReceita(entrada: PainelEntrada, status: string[] = [STATUS_ATIVO]): Array<SQL | undefined> {
  return [
    inArray(incomes.userId, entrada.escopo),
    inArray(incomes.status, status),
    filtroConta(incomes.accountId, incomes.userId, entrada.accountId),
  ];
}

/** Despesas que vencem OU foram pagas na janela — o "pago" da série e o atraso quitado usam a data de pagamento. */
async function buscarDespesas(entrada: PainelEntrada, janela: Periodo): Promise<DespesaPainel[]> {
  const linhas = await db.select(colunasDespesa).from(expenses).where(and(
    ...condicoesBaseDespesa(entrada),
    or(
      and(gte(expenses.dueDate, janela.de), lte(expenses.dueDate, janela.ate)),
      and(gte(expenses.paymentDate, janela.de), lte(expenses.paymentDate, janela.ate)),
    ),
  ));
  return linhas.map(paraDespesaPainel);
}

/** Tudo que está em aberto até o fim da janela de compromissos: atraso de qualquer período entra aqui. */
async function buscarDespesasNaoPagas(entrada: PainelEntrada, ate: string): Promise<DespesaPainel[]> {
  const linhas = await db.select(colunasDespesa).from(expenses).where(and(
    ...condicoesBaseDespesa(entrada),
    eq(expenses.paid, false),
    lte(expenses.dueDate, ate),
  ));
  return linhas.map(paraDespesaPainel);
}

async function buscarReceitas(entrada: PainelEntrada, janela: Periodo, status: string[] = [STATUS_ATIVO]): Promise<ReceitaPainel[]> {
  const linhas = await db.select({
    usuarioId: incomes.userId,
    dataRecebimento: incomes.receiptDate,
    valor: incomes.amount,
    classificacaoId: incomes.classificationId,
  }).from(incomes).where(and(
    ...condicoesBaseReceita(entrada, status),
    gte(incomes.receiptDate, janela.de),
    lte(incomes.receiptDate, janela.ate),
  ));
  return linhas.map((linha) => ({ ...linha, valor: numero(linha.valor) }));
}

/**
 * Classificações fixas da conta do painel, configuradas por pessoas do escopo
 * (o filtro de pessoas vale também para a projeção). Sem conta, não há fixa:
 * a configuração é sempre de uma conta.
 */
async function buscarFixas(entrada: PainelEntrada): Promise<FixaPainel[]> {
  if (!entrada.accountId) {
    return [];
  }
  const linhas = await db.select({
    classificacaoId: incomeClassificationFixes.classificationId,
    valor: incomeClassificationFixes.amount,
    diaRecebimento: incomeClassificationFixes.dayOfMonth,
  }).from(incomeClassificationFixes)
    .innerJoin(incomeClassifications, eq(incomeClassifications.id, incomeClassificationFixes.classificationId))
    .where(and(
      eq(incomeClassificationFixes.accountId, entrada.accountId),
      inArray(incomeClassificationFixes.userId, entrada.escopo),
      eq(incomeClassifications.active, true),
    ));
  return linhas.map((linha) => ({ ...linha, valor: numero(linha.valor) }));
}

/** Nomes das classificações usadas e das raízes delas (para agrupar a sub no pai). */
async function buscarClassificacoes(ids: number[]): Promise<Map<number, ItemArvorePainel>> {
  const porId = new Map<number, ItemArvorePainel>();
  const buscar = async (lista: number[]) => {
    if (lista.length === 0) return;
    const linhas = await db.select({ id: incomeClassifications.id, nome: incomeClassifications.name, parentId: incomeClassifications.parentId })
      .from(incomeClassifications).where(inArray(incomeClassifications.id, lista));
    for (const linha of linhas) porId.set(linha.id, linha);
  };
  await buscar(ids);
  const pais = [...porId.values()]
    .map((classificacao) => classificacao.parentId)
    .filter((id): id is number => id !== null && !porId.has(id));
  await buscar([...new Set(pais)]);
  return porId;
}

/** Saldo inicial da conta + tudo que entrou − tudo que saiu antes do início do período. */
async function calcularSaldoAnterior(entrada: PainelEntrada): Promise<number> {
  const [receitasAntes, despesasAntes, conta] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${incomes.amount}), 0)` }).from(incomes).where(and(
      ...condicoesBaseReceita(entrada),
      lt(incomes.receiptDate, entrada.periodo.de),
    )),
    db.select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.paid} THEN COALESCE(${expenses.amountPaid}, ${expenses.originalAmount}) ELSE ${expenses.originalAmount} END), 0)`,
    }).from(expenses).where(and(
      ...condicoesBaseDespesa(entrada),
      lt(expenses.dueDate, entrada.periodo.de),
    )),
    entrada.accountId
      ? db.select({ aporte: accounts.initialContribution }).from(accounts).where(eq(accounts.id, entrada.accountId)).limit(1)
      : Promise.resolve([]),
  ]);
  const aporteInicial = numero(conta[0]?.aporte);
  return aporteInicial + numero(receitasAntes[0]?.total) - numero(despesasAntes[0]?.total);
}

async function buscarNomesPessoas(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const linhas = await db.select({ id: users.id, nome: users.name, sobrenome: users.lastName })
    .from(users).where(inArray(users.id, ids));
  return new Map(linhas.map((linha) => [linha.id, `${linha.nome} ${linha.sobrenome ?? ''}`.trim()]));
}

/** Categorias usadas e as raízes delas (a pizza agrupa a subcategoria no pai). */
async function buscarCategorias(ids: number[]): Promise<Map<number, ItemArvorePainel>> {
  const porId = new Map<number, ItemArvorePainel>();
  const buscar = async (lista: number[]) => {
    if (lista.length === 0) return;
    const linhas = await db.select({ id: categories.id, nome: categories.name, parentId: categories.parentId })
      .from(categories).where(inArray(categories.id, lista));
    for (const linha of linhas) porId.set(linha.id, linha);
  };
  await buscar(ids);
  const pais = [...porId.values()]
    .map((categoria) => categoria.parentId)
    .filter((id): id is number => id !== null && !porId.has(id));
  await buscar([...new Set(pais)]);
  return porId;
}

async function montarCartoes(entrada: PainelEntrada, despesasPeriodo: DespesaPainel[]): Promise<PainelResposta['cartoes']> {
  const gastoPorCartao = agregarGastoPorCartao(despesasPeriodo);
  const idsCartoes = [...gastoPorCartao.keys()];
  if (idsCartoes.length === 0) {
    return [];
  }
  const [nomes, limites] = await Promise.all([
    db.select({ id: cards.id, nome: cards.name }).from(cards).where(inArray(cards.id, idsCartoes)),
    getCardLimitsForOwners(entrada.escopo, entrada.accountId),
  ]);
  const limitePorCartao = new Map(limites.map((limite) => [limite.id, limite]));
  return nomes
    .map((cartao) => ({
      id: cartao.id,
      nome: cartao.nome,
      gasto: gastoPorCartao.get(cartao.id) ?? 0,
      limite: limitePorCartao.get(cartao.id)?.limite ?? null,
      usado: limitePorCartao.get(cartao.id)?.usado ?? null,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

/**
 * Metas × gasto por categoria. A meta é mensal: fica proporcional aos dias do
 * período. O gasto sai dos lançamentos do período exato (não dos meses
 * inteiros), com rollup de subcategoria no pai.
 */
async function montarPlanejado(entrada: PainelEntrada, despesasPeriodo: DespesaPainel[]): Promise<PainelResposta['planejado']> {
  if (entrada.tipoConta !== 'pessoal' || !entrada.podeVerPlanejado) {
    return null;
  }

  const [inicioAno, inicioMes] = entrada.periodo.de.split('-').map(Number);
  const [fimAno, fimMes] = entrada.periodo.ate.split('-').map(Number);
  let visaoOrcamento;
  try {
    visaoOrcamento = await getBudgetOverview({
      userId: entrada.solicitanteId,
      accountId: entrada.accountId,
      deMes: inicioMes! - 1,
      deAno: inicioAno!,
      ateMes: fimMes! - 1,
      ateAno: fimAno!,
    });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      return null;
    }
    throw error;
  }

  const donoCatalogo = await resolveAccountOwnerId(entrada.solicitanteId, entrada.accountId);
  const hierarquia = await db.select({ id: categories.id, parentId: categories.parentId })
    .from(categories).where(eq(categories.userId, donoCatalogo));
  const paiDe = new Map(hierarquia.map((categoria) => [categoria.id, categoria.parentId]));
  const gasto = gastoPorCategoriaComRollup(despesasPeriodo, paiDe);
  const fator = fatorMetaProporcional(entrada.periodo);

  return visaoOrcamento.items
    .filter((item) => item.targetAmount !== null)
    .map((item) => ({
      categoriaId: item.categoryId,
      categoria: item.categoryName,
      parentId: item.parentId,
      meta: item.targetAmount! * fator,
      gasto: gasto.get(item.categoryId) ?? 0,
    }))
    .sort((a, b) => b.gasto / (b.meta || 1) - a.gasto / (a.meta || 1));
}

function erroDeTabelaInexistente(error: unknown): boolean {
  const codigo = (erro: unknown) => (typeof erro === 'object' && erro !== null && 'code' in erro ? (erro as { code: unknown }).code : undefined);
  const causa = typeof error === 'object' && error !== null && 'cause' in error ? (error as { cause: unknown }).cause : undefined;
  return codigo(error) === CODIGO_TABELA_INEXISTENTE || codigo(causa) === CODIGO_TABELA_INEXISTENTE;
}

async function buscarEstoqueBaixo(entrada: PainelEntrada): Promise<NonNullable<PainelResposta['empresa']>['estoqueBaixo']> {
  try {
    const linhas = await db.select({
      id: catalogoProdutos.id,
      nome: catalogoProdutos.nome,
      quantidadeEstoque: catalogoProdutos.quantidadeEstoque,
      estoqueMinimo: catalogoProdutos.estoqueMinimo,
    }).from(catalogoProdutos).where(and(
      inArray(catalogoProdutos.usuarioId, entrada.escopo),
      eq(catalogoProdutos.ativo, true),
      isNotNull(catalogoProdutos.estoqueMinimo),
      lte(catalogoProdutos.quantidadeEstoque, catalogoProdutos.estoqueMinimo),
      filtroConta(catalogoProdutos.contaId, catalogoProdutos.usuarioId, entrada.accountId),
    )).orderBy(asc(catalogoProdutos.quantidadeEstoque), asc(catalogoProdutos.nome)).limit(LIMITE_ESTOQUE_BAIXO);
    return linhas.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      quantidadeEstoque: numero(linha.quantidadeEstoque),
      estoqueMinimo: numero(linha.estoqueMinimo),
    }));
  } catch (error) {
    // O schema `catalogo` pode não existir no ambiente (migrations do catálogo
    // não aplicadas); o painel inteiro não pode cair por causa de um alerta.
    if (erroDeTabelaInexistente(error)) {
      return [];
    }
    throw error;
  }
}

export async function montarPainel(entrada: PainelEntrada): Promise<PainelResposta> {
  const { periodo, hoje } = entrada;
  const anterior = periodoAnterior(periodo);
  const janelaSerie = janelaDaSerie(periodo);
  const inicioDoAno = `${periodo.ate.slice(0, 4)}-01-01`;
  // A série cobre o próprio período; buscar a partir do período anterior (↑) e
  // do início do ano (juros no ano) cobre tudo numa consulta só.
  const janelaBusca: Periodo = { de: menorData(anterior.de, inicioDoAno), ate: periodo.ate };
  const compromissos = janelaComprometido(hoje);

  // Previstas desde o início do mês do período: a projeção das fixas precisa
  // saber se o mês já tem receita daquela classificação, mesmo antes de `de`.
  const [despesas, receitas, naoPagas, saldoAnterior, previstas, fixas] = await Promise.all([
    buscarDespesas(entrada, janelaBusca),
    buscarReceitas(entrada, janelaBusca),
    buscarDespesasNaoPagas(entrada, compromissos.ate),
    calcularSaldoAnterior(entrada),
    buscarReceitas(entrada, { de: primeiroDiaDoMes(periodo.de), ate: periodo.ate }, STATUS_A_RECEBER),
    buscarFixas(entrada),
  ]);

  const despesasPeriodo = despesasDoPeriodo(despesas, periodo);
  const receitasPeriodo = receitasDoPeriodo(receitas, periodo);
  const resumoAtual = resumirPeriodo(despesasPeriodo, receitasPeriodo);
  const resumoAnterior = resumirPeriodo(despesasDoPeriodo(despesas, anterior), receitasDoPeriodo(receitas, anterior));
  const categoriasAgregadas = agregarCategorias(despesasPeriodo);
  const porPessoa = agregarPorPessoa(despesasPeriodo, receitasPeriodo);
  const previstasPeriodo = receitasDoPeriodo(previstas, periodo);
  const projecoes = projetarFixas(fixas, [...receitas, ...previstas], periodo, hoje);
  const idsClassificacoes = [...new Set([...receitasPeriodo, ...previstasPeriodo, ...projecoes]
    .map((item) => item.classificacaoId)
    .filter((id): id is number => id !== null))];

  const idsCategorias = categoriasAgregadas
    .map((linha) => linha.categoriaId)
    .filter((id): id is number => id !== null);
  const [nomesPessoas, categoriasPorId, cartoes, planejado, estoqueBaixo, classificacoes] = await Promise.all([
    buscarNomesPessoas(entrada.escopo),
    buscarCategorias(idsCategorias),
    montarCartoes(entrada, despesasPeriodo),
    montarPlanejado(entrada, despesasPeriodo),
    entrada.tipoConta === 'empresa' ? buscarEstoqueBaixo(entrada) : Promise.resolve([]),
    buscarClassificacoes(idsClassificacoes),
  ]);
  const tipoGasto = agregarTipoGasto(despesasPeriodo);

  return {
    periodo,
    periodoAnterior: anterior,
    tipoConta: entrada.tipoConta,
    totalLancamentos: despesasPeriodo.length + receitasPeriodo.length,
    resumo: {
      ...resumoAtual,
      entrouAnterior: resumoAnterior.entrou,
      saiuAnterior: resumoAnterior.saiu,
      saldoAnterior,
      saldoFinal: saldoAnterior + resumoAtual.entrou - resumoAtual.saiu,
    },
    serie: { granularidade: janelaSerie.granularidade, pontos: montarSerie(despesas, receitas, janelaSerie) },
    formasPagamento: agregarFormasPagamento(despesasPeriodo),
    cartoes,
    aVistaParcelado: agregarAVistaParcelado(despesasPeriodo),
    tipoGasto,
    emDia: agregarEmDia(despesas, periodo),
    contasEmAberto: agregarContasEmAberto(naoPagas, hoje),
    planejado,
    porPessoa: [...porPessoa.entries()].map(([usuarioId, totais]) => ({
      usuarioId,
      nome: nomesPessoas.get(usuarioId) ?? '',
      ...totais,
    })),
    jurosDescontos: {
      periodo: agregarJurosDescontos(despesasPeriodo),
      ano: agregarJurosDescontos(despesasDoPeriodo(despesas, { de: inicioDoAno, ate: periodo.ate })),
    },
    categorias: categoriasAgregadas.map((linha) => {
      const categoria = linha.categoriaId !== null ? categoriasPorId.get(linha.categoriaId) : undefined;
      return {
        categoriaId: linha.categoriaId,
        categoria: categoria?.nome ?? 'Sem categoria',
        parentId: categoria?.parentId ?? null,
        usuarioId: linha.usuarioId,
        autorNome: nomesPessoas.get(linha.usuarioId) ?? null,
        total: linha.total,
      };
    }),
    receitas: resumirReceitasPainel({
      recebidas: receitasPeriodo,
      previstas: previstasPeriodo,
      projecoes,
      classificacoes,
      idsFixos: new Set(fixas.map((fixa) => fixa.classificacaoId)),
      saiu: resumoAtual.saiu,
      periodo,
      hoje,
    }),
    despesasPorCategoria: agruparPorRaiz(
      categoriasAgregadas.map((linha) => ({ id: linha.categoriaId, valor: linha.total })),
      categoriasPorId,
      SEM_CATEGORIA,
    ),
    empresa: entrada.tipoConta === 'empresa' ? { estoqueBaixo } : null,
  };
}
