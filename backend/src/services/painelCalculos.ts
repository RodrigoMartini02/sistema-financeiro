// Regras de cálculo do Painel financeiro, sem acesso a banco: tudo aqui recebe
// linhas já buscadas e devolve números. Separado de painelService.ts para que
// as regras de negócio (período anterior, pago em dia, tipo de gasto, meta
// proporcional...) possam ser testadas isoladamente.
//
// Datas trafegam como texto ISO 'AAAA-MM-DD' (é como o driver devolve colunas
// `date`), e a comparação entre elas é lexicográfica. Toda aritmética de data
// usa UTC para não depender do fuso do servidor.

export interface Periodo {
  de: string;
  ate: string;
}

export interface DespesaPainel {
  usuarioId: number;
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
  contratoId: number | null;
}

export type Granularidade = 'mes' | 'ano';

// Acima disso a série mensal vira anual: barras demais deixam de ser legíveis.
const MESES_MAXIMOS_SERIE_MENSAL = 24;

/** Limite do intervalo aceito pelo painel, para uma requisição não varrer décadas. */
export const PERIODO_MAXIMO_DIAS = 3660;

// Meses à frente cobertos por "O que já está comprometido", contando o atual.
const MESES_COMPROMETIDO = 6;

const DIAS_PROXIMOS_VENCIMENTOS = 30;

const FORMA_NAO_INFORMADA = 'nao_informada';
export const FORMA_CREDITO = 'credito';

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
 * Janela dos gráficos mês a mês: período dentro de um único mês mostra os 12
 * meses até ele (contexto); período que atravessa meses mostra os próprios
 * meses do período, por ano quando passa de 24.
 */
export function janelaDaSerie(periodo: Periodo): JanelaSerie {
  if (primeiroDiaDoMes(periodo.de) === primeiroDiaDoMes(periodo.ate)) {
    return { de: somarMeses(periodo.ate, -11), ate: ultimoDiaDoMes(periodo.ate), granularidade: 'mes' };
  }
  const granularidade: Granularidade = mesesTocados(periodo) > MESES_MAXIMOS_SERIE_MENSAL ? 'ano' : 'mes';
  return { de: periodo.de, ate: periodo.ate, granularidade };
}

export function janelaComprometido(hoje: string): Periodo {
  return { de: hoje, ate: ultimoDiaDoMes(somarMeses(hoje, MESES_COMPROMETIDO - 1)) };
}

/** Mês a mês (ou ano a ano) da janela, na ordem, para a série sair completa mesmo com meses vazios. */
export function baldesDaSerie(janela: JanelaSerie): Array<{ ano: number; mes: number | null }> {
  const inicio = paraData(janela.de);
  const fim = paraData(janela.ate);
  const baldes: Array<{ ano: number; mes: number | null }> = [];
  if (janela.granularidade === 'ano') {
    for (let ano = inicio.getUTCFullYear(); ano <= fim.getUTCFullYear(); ano++) {
      baldes.push({ ano, mes: null });
    }
    return baldes;
  }
  for (let cursor = primeiroDiaDoMes(janela.de); cursor <= janela.ate; cursor = somarMeses(cursor, 1)) {
    const data = paraData(cursor);
    baldes.push({ ano: data.getUTCFullYear(), mes: data.getUTCMonth() });
  }
  return baldes;
}

function chaveDoBalde(iso: string, granularidade: Granularidade): string {
  return granularidade === 'ano' ? iso.slice(0, 4) : iso.slice(0, 7);
}

function chaveDeBalde(balde: { ano: number; mes: number | null }): string {
  return balde.mes === null ? String(balde.ano) : `${balde.ano}-${String(balde.mes + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Regras por lançamento

export function valorEfetivo(despesa: DespesaPainel): number {
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

export interface PontoSerie {
  ano: number;
  mes: number | null;
  receitas: number;
  despesas: number;
  credito: number;
  pago: number;
}

/**
 * Série dos gráficos mês a mês. `despesas` e `credito` seguem o vencimento
 * (regra do painel); `pago` segue a data em que o pagamento aconteceu — é o
 * que permite comparar o cadastrado com o que de fato foi quitado no mês.
 */
export function montarSerie(despesas: DespesaPainel[], receitas: ReceitaPainel[], janela: JanelaSerie): PontoSerie[] {
  const pontos = new Map(baldesDaSerie(janela).map((balde) => [
    chaveDeBalde(balde),
    { ...balde, receitas: 0, despesas: 0, credito: 0, pago: 0 },
  ]));

  for (const receita of receitas) {
    if (!dentroDoPeriodo(receita.dataRecebimento, janela)) continue;
    const ponto = pontos.get(chaveDoBalde(receita.dataRecebimento, janela.granularidade));
    if (ponto) ponto.receitas += receita.valor;
  }

  for (const despesa of despesas) {
    if (dentroDoPeriodo(despesa.dataVencimento, janela)) {
      const ponto = pontos.get(chaveDoBalde(despesa.dataVencimento, janela.granularidade));
      if (ponto) {
        ponto.despesas += valorEfetivo(despesa);
        if (despesa.formaPagamento === FORMA_CREDITO) ponto.credito += valorEfetivo(despesa);
      }
    }

    if (despesa.pago) {
      const dataQuitacao = despesa.dataPagamento ?? despesa.dataVencimento;
      if (dentroDoPeriodo(dataQuitacao, janela)) {
        const ponto = pontos.get(chaveDoBalde(dataQuitacao, janela.granularidade));
        if (ponto) ponto.pago += valorEfetivo(despesa);
      }
    }
  }

  return [...pontos.values()];
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
    comprometido: baldesDaSerie({ ...janela, granularidade: 'mes' }).map((balde) => ({
      ano: balde.ano,
      mes: balde.mes!,
      parcelas: 0,
      outras: 0,
    })),
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

export function agregarOrigemReceitas(receitas: ReceitaPainel[]): { contratos: number; avulsas: number } {
  return {
    contratos: somar(receitas.filter((receita) => receita.contratoId !== null), (receita) => receita.valor),
    avulsas: somar(receitas.filter((receita) => receita.contratoId === null), (receita) => receita.valor),
  };
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
