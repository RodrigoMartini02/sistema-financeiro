import type { CopilotIntent } from './aiProvider';

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Keeps explicit registration separate from questions such as "tem extrato de despesas?".
export function inferDeterministicCopilotIntent(message: string, attachmentCount: number): CopilotIntent {
  const text = normalizeText(message);
  if (/\b(vence|vencimento|vencer|a vencer|contas? da semana)\b/.test(text)) return 'upcoming';
  if (/\b(categoria|onde gastei|maior gasto|gastos por)\b/.test(text)) return 'categories';
  if (/\b(meta|orcamento|limite|comprometimento)\b/.test(text)) return 'budget';
  if (/\b(lancamento|extrato|movimentacao|procure|buscar)\b/.test(text)) return 'transactions';
  if (/\b(gastei|recebi|saldo|resumo|como estou|quanto tenho|quanto entrou)\b/.test(text)) return 'summary';
  if (attachmentCount > 0 || /\b(paguei|recebi|comprei|depositei|vendi|ganhei)\b/.test(text)) return 'register';
  return 'help';
}
