// Regras de cálculo do Painel financeiro, sem acesso a banco: tudo aqui recebe
// linhas já buscadas e devolve números. Separado de painelService.ts para que
// as regras de negócio (período anterior, pago em dia, tipo de gasto, meta
// proporcional...) possam ser testadas isoladamente.
//
// Datas trafegam como texto ISO 'AAAA-MM-DD' (é como o driver devolve colunas
// `date`), e a comparação entre elas é lexicográfica. Toda aritmética de data
// usa UTC para não depender do fuso do servidor.

import { dataDoLancamento } from './fixedIncomeSchedule';

export interface Periodo {
  de: string;
  ate: string;
}

export interface DespesaPainel {
  /** Quem paga: o dono do cartão quando há cartão; sem cartão, quem cadastrou. É a pessoa das visões de dinheiro. */
  usuarioId: number;
  /** Quem cadastrou a despesa (quem usou o cartão). */
  autorId: number;
  categoriaId: number | null;
  cartaoId: number | null;
  formaPagamento: string | null;
  dataVencimento: string;
  dataPagamento: string | null;
  pago: boolean;
  valorOriginal: number;
  valorPago: number | null;
  parcelado: boolean;
  recorrente: boolean;
}

export interface ReceitaPainel {
  usuarioId: number;
  dataRecebimento: string;
  valor: number;
  classificacaoId: number | null;
}

export type Granularidade = 'semana' | 'mes' | 'ano';

// Até ~2 meses a série vai por semana; até 24 meses, por mês; acima, por ano —
// barras demais deixam de ser legíveis.
const DIAS_MAXIMOS_SERIE_SEMANAL = 62;
const MESES_MAXIMOS_SERIE_MENSAL = 24;
const DIAS_POR_SEMANA = 7;

/** Limite do intervalo aceito pelo painel, para uma requisição não varrer décadas. */
export const PERIODO_MAXIMO_DIAS = 3660;

// Meses à frente cobertos por "O que já está comprometido", contando o atual.
const MESES_COMPROMETIDO = 6;

const DIAS_PROXIMOS_VENCIMENTOS = 30;

const FORMA_NAO_INFORMADA = 'nao_informada';

// ---------------------------------------------------------------------------
// Datas

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function paraData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia!));
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function dataIsoValida(valor: string): boolean {
  if (!ISO_DATA.test(valor)) {
    return false;
  }
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = paraData(valor);
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes! - 1 && data.getUTCDate() === dia;
}

export function somarDias(iso: string, dias: number): string {
  const data = paraData(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return paraIso(data);
}

export function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function ultimoDiaDoMes(iso: string): string {
  const data = paraData(primeiroDiaDoMes(iso));
  return paraIso(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0)));
}

/** Primeiro dia do mês deslocado em `meses` a partir do mês de `iso`. */
export function somarMeses(iso: string, meses: number): string {
  const data = paraData(primeiroDiaDoMes(iso));
  return paraIso(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1)));
}

export function diasNoPeriodo(periodo: Periodo): number {
  const milissegundosPorDia = 24 * 60 * 60 * 1000;
  return Math.round((paraData(periodo.ate).getTime() - paraData(periodo.de).getTime()) / milissegundosPorDia) + 1;
}

export function dentroDoPeriodo(iso: string, periodo: Periodo): boolean {
  return iso >= periodo.de && iso <= periodo.ate;
}

export function mesesTocados(periodo: Periodo): number {
  const inicio = paraData(periodo.de);
  const fim = paraData(periodo.ate);
  return (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fim.getUTCMonth() - inicio.getUTCMonth()) + 1;
}

export type ResultadoValidacaoPeriodo =
  | { valido: true; periodo: Periodo }
  | { valido: false; mensagem: string };

export function validarPeriodo(de: unknown, ate: unknown): ResultadoValidacaoPeriodo {
  if (typeof de !== 'string' || typeof ate !== 'string' || !dataIsoValida(de) || !dataIsoValida(ate)) {
    return { valido: false, mensagem: 'Período inválido: informe as datas no formato AAAA-MM-DD.' };
  }
  if (de > ate) {
    return { valido: false, mensagem: 'A data inicial não pode ser depois da data final.' };
  }
  if (diasNoPeriodo({ de, ate }) > PERIODO_MAXIMO_DIAS) {
    return { valido: false, mensagem: 'O período máximo do painel é de 10 anos.' };
  }
  return { valido: true, periodo: { de, ate } };
}

// ---------------------------------------------------------------------------
// Períodos derivados

export function ehMesInteiro(periodo: Periodo): boolean {
  return periodo.de === primeiroDiaDoMes(periodo.de) && periodo.ate === ultimoDiaDoMes(periodo.de);
}

/**
 * Período com que o atual é comparado ("↑ vs anterior"): um mês inteiro se
 * compara com o mês anterior inteiro; qualquer outro recorte, com o mesmo
 * número de dias imediatamente antes.
 */
export function periodoAnterior(periodo: Periodo): Periodo {
  const vespera = somarDias(periodo.de, -1);
  if (ehMesInteiro(periodo)) {
    return { de: primeiroDiaDoMes(vespera), ate: vespera };
  }
  return { de: somarDias(vespera, -(diasNoPeriodo(periodo) - 1)), ate: vespera };
}

export interface JanelaSerie extends Periodo {
  granularidade: Granularidade;
}

/**
 * Janela dos gráficos de série: sempre o próprio período filtrado, com a
 * granularidade ajustada ao tamanho dele — os gráficos contam a mesma
 * história dos cards, só que detalhada.
 */
export function janelaDaSerie(periodo: Periodo): JanelaSerie {
  if (diasNoPeriodo(periodo) <= DIAS_MAXIMOS_SERIE_SEMANAL) {
    return { ...periodo, granularidade: 'semana' };
  }
  const granularidade: Granularidade = mesesTocados(periodo) > MESES_MAXIMOS_SERIE_MENSAL ? 'ano' : 'mes';
  return { ...periodo, granularidade };
}

export function janelaComprometido(hoje: string): Periodo {
  return { de: hoje, ate: ultimoDiaDoMes(somarMeses(hoje, MESES_COMPROMETIDO - 1)) };
}

export interface BaldeSerie {
  inicio: string;
  fim: string;
}

/**
 * Intervalos da série, na ordem e recortados ao período, para ela sair
 * completa mesmo com trechos vazios: semanas de 7 dias a partir da data
 * inicial (a última pode ser menor), ou meses/anos com as pontas recortadas.
 */
export function baldesDaSerie(janela: JanelaSerie): BaldeSerie[] {
  const baldes: BaldeSerie[] = [];
  for (let inicio = janela.de; inicio <= janela.ate;) {
    const fimNatural = janela.granularidade === 'semana'
      ? somarDias(inicio, DIAS_POR_SEMANA - 1)
      : janela.granularidade === 'mes'
        ? ultimoDiaDoMes(inicio)
        : `${inicio.slice(0, 4)}-12-31`;
    const fim = fimNatural < janela.ate ? fimNatural : janela.ate;
    baldes.push({ inicio, fim });
    inicio = somarDias(fim, 1);
  }
  return baldes;
}

// ---------------------------------------------------------------------------
// Regras por lançamento

export function valorEfetivo(despesa: Pick<DespesaPainel, 'pago' | 'valorPago' | 'valorOriginal'>): number {
  if (despesa.pago && despesa.valorPago !== null) {
    return despesa.valorPago;
  }
  return despesa.valorOriginal;
}

export type SituacaoPagamento = 'em_dia' | 'com_atraso' | 'em_aberto';

/** Pago até o vencimento é em dia; pago sem data registrada conta como em dia. */
export function classificarPagamento(despesa: DespesaPainel): SituacaoPagamento {
  if (!despesa.pago) {
    return 'em_aberto';
  }
  if (despesa.dataPagamento === null || despesa.dataPagamento <= despesa.dataVencimento) {
    return 'em_dia';
  }
  return 'com_atraso';
}

export type TipoGasto = 'fixo' | 'parcela' | 'livre';

/** Fixa é compromisso permanente, parcela é compromisso que termina, o resto dá para cortar. */
export function classificarTipoGasto(despesa: DespesaPainel): TipoGasto {
  if (despesa.recorrente) {
    return 'fixo';
  }
  if (despesa.parcelado) {
    return 'parcela';
  }
  return 'livre';
}

export function jurosDaDespesa(despesa: DespesaPainel): number {
  if (!despesa.pago || despesa.valorPago === null) {
    return 0;
  }
  return Math.max(0, despesa.valorPago - despesa.valorOriginal);
}

export function descontoDaDespesa(despesa: DespesaPainel): number {
  if (!despesa.pago || despesa.valorPago === null) {
    return 0;
  }
  return Math.max(0, despesa.valorOriginal - despesa.valorPago);
}

// ---------------------------------------------------------------------------
// Indicadores

/** Variação percentual; null quando não há base de comparação. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) {
    return null;
  }
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** `parte` como percentual de `todo`; null quando `todo` não é positivo. */
export function percentual(parte: number, todo: number): number | null {
  if (todo <= 0) {
    return null;
  }
  return (parte / todo) * 100;
}

export function ticketMedio(valor: number, quantidade: number): number | null {
  if (quantidade === 0) {
    return null;
  }
  return valor / quantidade;
}

/**
 * Fração da meta mensal que cabe no período: dias do período sobre os dias dos
 * meses que ele toca. Mês inteiro = 1; 15 dias de um mês de 30 = 0,5.
 */
export function fatorMetaProporcional(periodo: Periodo): number {
  const mesesInteiros: Periodo = { de: primeiroDiaDoMes(periodo.de), ate: ultimoDiaDoMes(periodo.ate) };
  return diasNoPeriodo(periodo) / diasNoPeriodo(mesesInteiros);
}

// ---------------------------------------------------------------------------
// Agregações

function somar<T>(itens: T[], valor: (item: T) => number): number {
  return itens.reduce((total, item) => total + valor(item), 0);
}

export function despesasDoPeriodo(despesas: DespesaPainel[], periodo: Periodo): DespesaPainel[] {
  return despesas.filter((despesa) => dentroDoPeriodo(despesa.dataVencimento, periodo));
}

export function receitasDoPeriodo(receitas: ReceitaPainel[], periodo: Periodo): ReceitaPainel[] {
  return receitas.filter((receita) => dentroDoPeriodo(receita.dataRecebimento, periodo));
}

export interface ResumoPeriodo {
  entrou: number;
  saiu: number;
  pago: number;
  aPagar: number;
}

export function resumirPeriodo(despesas: DespesaPainel[], receitas: ReceitaPainel[]): ResumoPeriodo {
  const pagas = despesas.filter((despesa) => despesa.pago);
  const abertas = despesas.filter((despesa) => !despesa.pago);
  return {
    entrou: somar(receitas, (receita) => receita.valor),
    saiu: somar(despesas, valorEfetivo),
    pago: somar(pagas, valorEfetivo),
    aPagar: somar(abertas, valorEfetivo),
  };
}

export interface PontoSerie extends BaldeSerie {
  receitas: number;
  despesas: number;
  /** Despesas do trecho por forma de pagamento (mesma chave de `agregarFormasPagamento`). */
  formas: Record<string, number>;
  pago: number;
  juros: number;
  descontos: number;
}

/**
 * Série dos gráficos do período. `despesas` e `formas` seguem o vencimento
 * (regra do painel); `pago` segue a data em que o pagamento aconteceu — é o
 * que permite comparar o cadastrado com o que de fato foi quitado no trecho.
 * `juros` e `descontos` seguem o vencimento, como o total "No período" do
 * bloco de juros: as barras somam exatamente esse total.
 */
export function montarSerie(despesas: DespesaPainel[], receitas: ReceitaPainel[], janela: JanelaSerie): PontoSerie[] {
  const pontos: PontoSerie[] = baldesDaSerie(janela).map((balde) => ({ ...balde, receitas: 0, despesas: 0, formas: {}, pago: 0, juros: 0, descontos: 0 }));
  const pontoDe = (iso: string) => pontos.find((ponto) => iso >= ponto.inicio && iso <= ponto.fim);

  for (const receita of receitas) {
    const ponto = pontoDe(receita.dataRecebimento);
    if (ponto) ponto.receitas += receita.valor;
  }

  for (const despesa of despesas) {
    const pontoVencimento = pontoDe(despesa.dataVencimento);
    if (pontoVencimento) {
      pontoVencimento.despesas += valorEfetivo(despesa);
      const forma = despesa.formaPagamento || FORMA_NAO_INFORMADA;
      pontoVencimento.formas[forma] = (pontoVencimento.formas[forma] ?? 0) + valorEfetivo(despesa);
      pontoVencimento.juros += jurosDaDespesa(despesa);
      pontoVencimento.descontos += descontoDaDespesa(despesa);
    }

    if (despesa.pago) {
      const pontoQuitacao = pontoDe(despesa.dataPagamento ?? despesa.dataVencimento);
      if (pontoQuitacao) pontoQuitacao.pago += valorEfetivo(despesa);
    }
  }

  return pontos;
}

export interface FormaPagamentoAgregada {
  forma: string;
  valor: number;
  quantidade: number;
  juros: number;
}

export function agregarFormasPagamento(despesas: DespesaPainel[]): FormaPagamentoAgregada[] {
  const porForma = new Map<string, FormaPagamentoAgregada>();
  for (const despesa of despesas) {
    const forma = despesa.formaPagamento || FORMA_NAO_INFORMADA;
    const atual = porForma.get(forma) ?? { forma, valor: 0, quantidade: 0, juros: 0 };
    atual.valor += valorEfetivo(despesa);
    atual.quantidade += 1;
    atual.juros += jurosDaDespesa(despesa);
    porForma.set(forma, atual);
  }
  return [...porForma.values()].sort((a, b) => b.valor - a.valor);
}

export function agregarGastoPorCartao(despesas: DespesaPainel[]): Map<number, number> {
  const porCartao = new Map<number, number>();
  for (const despesa of despesas) {
    if (despesa.cartaoId === null) continue;
    porCartao.set(despesa.cartaoId, (porCartao.get(despesa.cartaoId) ?? 0) + valorEfetivo(despesa));
  }
  return porCartao;
}

/** Gasto de cada pessoa (quem cadastrou) em cada cartão: cartão → pessoa → valor. */
export function agregarGastoPorCartaoEPessoa(despesas: DespesaPainel[]): Map<number, Map<number, number>> {
  const porCartao = new Map<number, Map<number, number>>();
  for (const despesa of despesas) {
    if (despesa.cartaoId === null) continue;
    const porPessoa = porCartao.get(despesa.cartaoId) ?? new Map<number, number>();
    porPessoa.set(despesa.autorId, (porPessoa.get(despesa.autorId) ?? 0) + valorEfetivo(despesa));
    porCartao.set(despesa.cartaoId, porPessoa);
  }
  return porCartao;
}

export function agregarAVistaParcelado(despesas: DespesaPainel[]): { aVista: number; parcelado: number } {
  return {
    aVista: somar(despesas.filter((despesa) => !despesa.parcelado), valorEfetivo),
    parcelado: somar(despesas.filter((despesa) => despesa.parcelado), valorEfetivo),
  };
}

export function agregarTipoGasto(despesas: DespesaPainel[]): Record<TipoGasto, number> {
  const totais: Record<TipoGasto, number> = { fixo: 0, parcela: 0, livre: 0 };
  for (const despesa of despesas) {
    totais[classificarTipoGasto(despesa)] += valorEfetivo(despesa);
  }
  return totais;
}

export interface EmDiaAgregado {
  cadastrado: number;
  pagoEmDia: number;
  pagoComAtraso: number;
  emAberto: number;
  /** Pago dentro do período, mas com vencimento anterior a ele: atraso sendo quitado. */
  quitadoDeAnteriores: number;
}

export function agregarEmDia(despesas: DespesaPainel[], periodo: Periodo): EmDiaAgregado {
  const totais: EmDiaAgregado = { cadastrado: 0, pagoEmDia: 0, pagoComAtraso: 0, emAberto: 0, quitadoDeAnteriores: 0 };
  for (const despesa of despesas) {
    const valor = valorEfetivo(despesa);
    if (dentroDoPeriodo(despesa.dataVencimento, periodo)) {
      totais.cadastrado += valor;
      const situacao = classificarPagamento(despesa);
      if (situacao === 'em_dia') totais.pagoEmDia += valor;
      if (situacao === 'com_atraso') totais.pagoComAtraso += valor;
      if (situacao === 'em_aberto') totais.emAberto += valor;
      continue;
    }
    const quitadaNoPeriodo = despesa.pago && despesa.dataPagamento !== null && dentroDoPeriodo(despesa.dataPagamento, periodo);
    if (quitadaNoPeriodo && despesa.dataVencimento < periodo.de) {
      totais.quitadoDeAnteriores += valor;
    }
  }
  return totais;
}

export interface ContasEmAberto {
  atraso: { valor: number; quantidade: number };
  proximos30Dias: { valor: number; quantidade: number };
  comprometido: Array<{ ano: number; mes: number; parcelas: number; outras: number }>;
}

/** Situação de hoje, independente do período: `naoPagas` são despesas ainda em aberto. */
export function agregarContasEmAberto(naoPagas: DespesaPainel[], hoje: string): ContasEmAberto {
  const limiteProximos = somarDias(hoje, DIAS_PROXIMOS_VENCIMENTOS);
  const janela = janelaComprometido(hoje);
  const resultado: ContasEmAberto = {
    atraso: { valor: 0, quantidade: 0 },
    proximos30Dias: { valor: 0, quantidade: 0 },
    comprometido: Array.from({ length: MESES_COMPROMETIDO }, (_, deslocamento) => {
      const inicioDoMes = paraData(somarMeses(hoje, deslocamento));
      return { ano: inicioDoMes.getUTCFullYear(), mes: inicioDoMes.getUTCMonth(), parcelas: 0, outras: 0 };
    }),
  };

  for (const despesa of naoPagas) {
    if (despesa.pago) continue;
    const valor = despesa.valorOriginal;
    if (despesa.dataVencimento < hoje) {
      resultado.atraso.valor += valor;
      resultado.atraso.quantidade += 1;
      continue;
    }
    if (despesa.dataVencimento <= limiteProximos) {
      resultado.proximos30Dias.valor += valor;
      resultado.proximos30Dias.quantidade += 1;
    }
    if (dentroDoPeriodo(despesa.dataVencimento, janela)) {
      const data = paraData(despesa.dataVencimento);
      const mes = resultado.comprometido.find((item) => item.ano === data.getUTCFullYear() && item.mes === data.getUTCMonth());
      if (!mes) continue;
      if (despesa.parcelado) mes.parcelas += valor;
      else mes.outras += valor;
    }
  }
  return resultado;
}

export function agregarPorPessoa(despesas: DespesaPainel[], receitas: ReceitaPainel[]): Map<number, { receitas: number; despesas: number }> {
  const porPessoa = new Map<number, { receitas: number; despesas: number }>();
  const da = (usuarioId: number) => {
    const atual = porPessoa.get(usuarioId) ?? { receitas: 0, despesas: 0 };
    porPessoa.set(usuarioId, atual);
    return atual;
  };
  for (const receita of receitas) da(receita.usuarioId).receitas += receita.valor;
  for (const despesa of despesas) da(despesa.usuarioId).despesas += valorEfetivo(despesa);
  return porPessoa;
}

export function agregarJurosDescontos(despesas: DespesaPainel[]): { juros: number; descontos: number } {
  return {
    juros: somar(despesas, jurosDaDespesa),
    descontos: somar(despesas, descontoDaDespesa),
  };
}

/** Uma linha por (categoria, pessoa): a tela soma por categoria e usa a quebra por pessoa nas barras. */
export function agregarCategorias(despesas: DespesaPainel[]): Array<{ categoriaId: number | null; usuarioId: number; total: number }> {
  const porChave = new Map<string, { categoriaId: number | null; usuarioId: number; total: number }>();
  for (const despesa of despesas) {
    const chave = `${despesa.categoriaId ?? 'sem'}:${despesa.usuarioId}`;
    const atual = porChave.get(chave) ?? { categoriaId: despesa.categoriaId, usuarioId: despesa.usuarioId, total: 0 };
    atual.total += valorEfetivo(despesa);
    porChave.set(chave, atual);
  }
  return [...porChave.values()].sort((a, b) => b.total - a.total);
}

/**
 * Compras cadastradas por outra pessoa no cartão de quem paga, por categoria e
 * por quem cadastrou. Só entram despesas em que quem cadastrou não é quem paga.
 */
export function agregarCategoriasPorOutros(despesas: DespesaPainel[]): Array<{ categoriaId: number | null; autorId: number; total: number }> {
  const porChave = new Map<string, { categoriaId: number | null; autorId: number; total: number }>();
  for (const despesa of despesas) {
    if (despesa.autorId === despesa.usuarioId) continue;
    const chave = `${despesa.categoriaId ?? 'sem'}:${despesa.autorId}`;
    const atual = porChave.get(chave) ?? { categoriaId: despesa.categoriaId, autorId: despesa.autorId, total: 0 };
    atual.total += valorEfetivo(despesa);
    porChave.set(chave, atual);
  }
  return [...porChave.values()].sort((a, b) => b.total - a.total);
}

/**
 * Gasto por categoria com rollup de um nível: o que foi lançado numa
 * subcategoria soma também no pai, que é onde a meta costuma estar.
 */
export function gastoPorCategoriaComRollup(despesas: DespesaPainel[], paiDe: Map<number, number | null>): Map<number, number> {
  const gasto = new Map<number, number>();
  for (const despesa of despesas) {
    if (despesa.categoriaId === null) continue;
    const valor = valorEfetivo(despesa);
    gasto.set(despesa.categoriaId, (gasto.get(despesa.categoriaId) ?? 0) + valor);
    const pai = paiDe.get(despesa.categoriaId);
    if (pai != null) gasto.set(pai, (gasto.get(pai) ?? 0) + valor);
  }
  return gasto;
}

// ---------------------------------------------------------------------------
// Receitas: de onde veio o dinheiro

/** Classificação fixa da conta do painel (valor e dia configurados). */
export interface FixaPainel {
  classificacaoId: number;
  valor: number;
  diaRecebimento: number;
}

/** Item de catálogo em árvore (classificação de receita ou categoria de despesa). */
export interface ItemArvorePainel {
  id: number;
  nome: string;
  parentId: number | null;
}

export interface OcorrenciaFixa {
  classificacaoId: number;
  valor: number;
  data: string;
}

function meses(de: string, ate: string): string[] {
  const lista: string[] = [];
  for (let mes = primeiroDiaDoMes(de); mes <= ate; mes = somarMeses(mes, 1)) lista.push(mes);
  return lista;
}

/**
 * O que as classificações fixas ainda devem trazer no período: uma ocorrência
 * por mês, no dia configurado, só de hoje em diante. Mês que já tem receita
 * (recebida ou prevista) daquela classificação não projeta — seja a lançada
 * pelo automático, seja a lançada à mão —, para não contar duas vezes.
 */
export function projetarFixas(fixas: FixaPainel[], lancadas: ReceitaPainel[], periodo: Periodo, hoje: string): OcorrenciaFixa[] {
  const inicio = periodo.de > hoje ? periodo.de : hoje;
  if (inicio > periodo.ate) return [];

  const mesesComReceita = new Set(lancadas
    .filter((receita) => receita.classificacaoId !== null)
    .map((receita) => `${receita.classificacaoId}|${receita.dataRecebimento.slice(0, 7)}`));

  const ocorrencias: OcorrenciaFixa[] = [];
  for (const fixa of fixas) {
    for (const mes of meses(inicio, periodo.ate)) {
      const data = dataDoLancamento(mes, fixa.diaRecebimento);
      if (data < inicio || data > periodo.ate) continue;
      if (mesesComReceita.has(`${fixa.classificacaoId}|${mes.slice(0, 7)}`)) continue;
      ocorrencias.push({ classificacaoId: fixa.classificacaoId, valor: fixa.valor, data });
    }
  }
  return ocorrencias;
}

/** Soma por item principal de um catálogo em árvore; subcategorias como detalhe. */
export interface FatiaPainel {
  /** null = sem classificação/categoria. */
  id: number | null;
  nome: string;
  valor: number;
  subcategorias: Array<{ id: number; nome: string; valor: number }>;
}

/**
 * Soma pelo item principal: o que foi lançado numa subcategoria entra na raiz e
 * aparece também como detalhe dela. Item desconhecido (ou nulo) vai para
 * `rotuloSemRaiz` ("Sem categoria").
 */
export function agruparPorRaiz(
  itens: Array<{ id: number | null; valor: number }>,
  arvore: Map<number, ItemArvorePainel>,
  rotuloSemRaiz: string,
): FatiaPainel[] {
  const raizes = new Map<number | null, FatiaPainel & { subs: Map<number, { id: number; nome: string; valor: number }> }>();

  for (const item of itens) {
    const atual = item.id !== null ? arvore.get(item.id) : undefined;
    const pai = atual?.parentId != null ? arvore.get(atual.parentId) : undefined;
    const raiz = pai ?? atual;
    const chave = raiz?.id ?? null;

    let fatia = raizes.get(chave);
    if (!fatia) {
      fatia = { id: chave, nome: raiz?.nome ?? rotuloSemRaiz, valor: 0, subcategorias: [], subs: new Map() };
      raizes.set(chave, fatia);
    }
    fatia.valor += item.valor;

    if (pai && atual) {
      const sub = fatia.subs.get(atual.id) ?? { id: atual.id, nome: atual.nome, valor: 0 };
      sub.valor += item.valor;
      fatia.subs.set(atual.id, sub);
    }
  }

  return [...raizes.values()]
    .map(({ subs, ...fatia }) => ({ ...fatia, subcategorias: [...subs.values()].sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

export const SEM_CATEGORIA = 'Sem categoria';

export interface ReceitasPainelResumo {
  /** Recebido no período. */
  porClassificacao: FatiaPainel[];
  aReceber: { total: number; porClassificacao: FatiaPainel[] };
  /** Recebido + a receber. */
  rendaPrevista: number;
  /** % das despesas do período sobre a renda prevista; null sem renda prevista. */
  comprometimentoPrevisto: number | null;
  fixa: number;
  variavel: number;
  temFixa: boolean;
  periodoEncerrado: boolean;
}

export function resumirReceitasPainel(entrada: {
  recebidas: ReceitaPainel[];
  previstas: ReceitaPainel[];
  projecoes: OcorrenciaFixa[];
  classificacoes: Map<number, ItemArvorePainel>;
  /** Classificações configuradas como fixas na conta. */
  idsFixos: Set<number>;
  saiu: number;
  periodo: Periodo;
  hoje: string;
}): ReceitasPainelResumo {
  const { recebidas, previstas, projecoes, classificacoes, idsFixos } = entrada;
  const aReceber = [
    ...previstas.map((receita) => ({ id: receita.classificacaoId, valor: receita.valor })),
    ...projecoes.map((ocorrencia) => ({ id: ocorrencia.classificacaoId as number | null, valor: ocorrencia.valor })),
  ];
  const entrou = recebidas.map((receita) => ({ id: receita.classificacaoId, valor: receita.valor }));
  const renda = [...entrou, ...aReceber];

  const totalAReceber = somar(aReceber, (item) => item.valor);
  const rendaPrevista = somar(renda, (item) => item.valor);
  const fixa = somar(renda.filter((item) => item.id !== null && idsFixos.has(item.id)), (item) => item.valor);

  return {
    porClassificacao: agruparPorRaiz(entrou, classificacoes, SEM_CATEGORIA),
    aReceber: { total: totalAReceber, porClassificacao: agruparPorRaiz(aReceber, classificacoes, SEM_CATEGORIA) },
    rendaPrevista,
    comprometimentoPrevisto: percentual(entrada.saiu, rendaPrevista),
    fixa,
    variavel: rendaPrevista - fixa,
    temFixa: idsFixos.size > 0,
    periodoEncerrado: entrada.periodo.ate < entrada.hoje,
  };
}
