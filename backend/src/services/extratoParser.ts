import { inferCategory } from '../utils/expenseNormalizer';

export interface ParsedTransaction {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  categoria_sugerida: string;
}

function parseHeuristic(text: string): ParsedTransaction[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  const yearRef = new Date().getFullYear();

  const txRegex = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.{3,60?}?)\s+([\-+]?\s*R?\$?\s*[\d.,]+)/;

  for (const line of lines) {
    const m = line.match(txRegex);
    if (!m) continue;

    const [, dateStr, desc, amountStr] = m;
    const parts = dateStr!.split('/');
    const day = parts[0]!;
    const month = parts[1]!;
    const year = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : String(yearRef);
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const amount = parseFloat(amountStr!.replace(/[R$\s]/g, '').replace(',', '.'));
    if (!amount || isNaN(amount)) continue;

    const type = amountStr!.includes('-') || /d[eé]bito|compra|pagto|pag\b/i.test(line) ? 'despesa' : 'receita';

    transactions.push({
      data: date,
      descricao: desc!.trim().replace(/\s{2,}/g, ' '),
      valor: Math.abs(amount),
      tipo: type,
      categoria_sugerida: inferCategory(desc!),
    });
  }

  return transactions;
}

export function normalizeTransactions(list: Array<Partial<ParsedTransaction> & Record<string, unknown>>): ParsedTransaction[] {
  return list
    .map((t) => ({
      data: String(t['data'] ?? new Date().toISOString().split('T')[0]),
      descricao: (String(t['descricao'] ?? 'Transaction')).trim(),
      valor: Math.abs(parseFloat(String(t['valor'] ?? 0)) || 0),
      tipo: (t['tipo'] === 'receita' ? 'receita' : 'despesa') as 'receita' | 'despesa',
      categoria_sugerida: String(t['categoria_sugerida'] ?? inferCategory(String(t['descricao'] ?? ''))),
    }))
    .filter((t) => t.valor > 0);
}

export async function parseStatementWithAI(text: string): Promise<ParsedTransaction[]> {
  return parseHeuristic(text);
}
