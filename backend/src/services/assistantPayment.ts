// Escolha da despesa que o chip "Pagar despesa" paga. Regras puras, sem banco:
// a leitura das despesas em aberto fica em assistantQueries (despesasEmAberto),
// para o teste daqui nao arrastar a conexao.

/** Linha lida do banco: uma despesa em aberto, com o grupo de parcelas ou ocorrencias. */
export interface OpenExpenseRow {
  id: number;
  description: string;
  amount: number;
  dueDate: string;
  currentInstallment: number | null;
  numberOfInstallments: number | null;
  installmentGroupId: number | null;
  paymentMethod: string | null;
}

/** Despesa em aberto como a lista e o chat a oferecem. */
export interface OpenExpense {
  id: number;
  descricao: string;
  valor: number;
  vencimento: string;
  parcelaAtual: number | null;
  totalParcelas: number | null;
  formaPagamento: string | null;
  vencida: boolean;
}

/** Botoes oferecidos de uma vez: mais que isso nao cabe na conversa. */
export const MAX_PAYMENT_CANDIDATES = 8;

// Verbos de pagar, palavras de ligacao e de data: aparecem em qualquer frase de
// pagamento e nao dizem QUAL despesa foi paga. "conta", "parcela" e afins
// tambem: "conta de agua" casaria com toda "Conta de ...".
const IGNORED_WORDS = new Set([
  'paguei', 'pagar', 'pago', 'paga', 'pagamento', 'pagou', 'quitei', 'quitar', 'quitado', 'quitada',
  'conta', 'contas', 'despesa', 'despesas', 'boleto', 'parcela', 'parcelas', 'fatura',
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'com', 'por', 'pra', 'para', 'que', 'ja', 'ai',
  'hoje', 'ontem', 'amanha', 'dia', 'mes', 'reais', 'real', 'rs',
]);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function words(value: string): string[] {
  return normalize(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Palavras da mensagem que identificam a despesa: sem numeros, valores, datas nem verbos de pagar. */
export function searchTerms(message: string): string[] {
  const terms = words(message).filter((word) => !/\d/.test(word) && !IGNORED_WORDS.has(word));
  return [...new Set(terms)];
}

function termMatches(term: string, descriptionWord: string): boolean {
  if (term === descriptionWord) return true;
  // Prefixo so a partir de 3 letras: "ag" nao deve casar com "agua" e "agencia" ao mesmo tempo.
  return term.length >= 3 && descriptionWord.length >= 3
    && (descriptionWord.startsWith(term) || term.startsWith(descriptionWord));
}

/**
 * Despesas cuja descricao mais casa com a mensagem. Pontua pelos termos que
 * aparecem na descricao e devolve so as de maior pontuacao, na ordem recebida
 * (a do vencimento). Sem termo de busca, ou sem nenhuma que case, devolve vazio.
 */
export function matchOpenExpenses<T extends { description: string }>(message: string, rows: T[]): T[] {
  const terms = searchTerms(message);
  if (terms.length === 0) return [];

  const scored = rows.map((row) => {
    const descriptionWords = words(row.description);
    const score = terms.filter((term) => descriptionWords.some((word) => termMatches(term, word))).length;
    return { row, score };
  });
  const best = Math.max(0, ...scored.map((item) => item.score));
  if (best === 0) return [];
  return scored.filter((item) => item.score === best).map((item) => item.row);
}

/**
 * Uma despesa por grupo: parcelas e ocorrencias mensais apontam para a primeira
 * linha como grupo, e so a mais antiga em aberto interessa a quem esta pagando
 * agora. Espera as linhas ordenadas por vencimento.
 */
export function nextOpenPerGroup<T extends { installmentGroupId: number | null }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (row.installmentGroupId === null) return true;
    if (seen.has(row.installmentGroupId)) return false;
    seen.add(row.installmentGroupId);
    return true;
  });
}

/** Ultimo dia do mes da data (YYYY-MM-DD): a lista do chip vai ate o fim do mes corrente. */
export function lastDayOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  const lastDay = new Date(year!, month!, 0).getDate();
  return `${isoDate.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

export function toOpenExpense(row: OpenExpenseRow, todayIso: string): OpenExpense {
  return {
    id: row.id,
    descricao: row.description,
    valor: row.amount,
    vencimento: row.dueDate,
    parcelaAtual: row.currentInstallment,
    totalParcelas: row.numberOfInstallments,
    formaPagamento: row.paymentMethod,
    vencida: row.dueDate < todayIso,
  };
}
