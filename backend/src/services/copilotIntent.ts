import type { CopilotIntent } from './aiProvider';

export type CopilotIntentHint = 'register_expense' | 'register_income' | 'ask';

interface DeterministicCopilotIntentOptions {
  intentHint?: CopilotIntentHint | null;
  hasPendingDraft?: boolean;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isQuestion(text: string): boolean {
  return text.includes('?')
    || /\b(quanto|qual|quais|como|onde|quando|quem|tem|mostre|mostrar|liste|listar|veja|verifique)\b/.test(text);
}

function queryIntentFromText(text: string): CopilotIntent | null {
  if (/\b(vence|vencimento|vencer|a vencer|contas? da semana)\b/.test(text)) return 'upcoming';
  if (/\b(categoria|onde gastei|maior gasto|gastos por)\b/.test(text)) return 'categories';
  if (/\b(meta|orcamento|limite|comprometimento)\b/.test(text)) return 'budget';
  if (/\b(lancamento|extrato|movimentacao|procure|buscar)\b/.test(text)) return 'transactions';
  if (/\b(saldo|resumo|como estou|quanto tenho|quanto entrou)\b/.test(text)) return 'summary';
  if (isQuestion(text) && /\b(gastei|recebi|despesa|receita)\b/.test(text)) return 'summary';
  return null;
}

function isRegistrationStatement(text: string): boolean {
  return /\b(registrar|registre|adicionar|incluir|nova despesa|nova receita|paguei|pagamento|comprei|compra|compras|fiz compras|gastei|recebi|depositei|vendi|ganhei|passei(?: no)? (?:cartao|credito|debito))\b/.test(text);
}

// Keeps explicit registration separate from questions such as "quanto gastei este mes?".
export function inferDeterministicCopilotIntent(
  message: string,
  attachmentCount: number,
  options: DeterministicCopilotIntentOptions = {},
): CopilotIntent {
  const text = normalizeText(message);
  if (options.intentHint === 'register_expense' || options.intentHint === 'register_income') return 'register';
  if (options.intentHint === 'ask') return queryIntentFromText(text) ?? 'help';
  if (attachmentCount > 0) return 'register';

  if (options.hasPendingDraft && !isQuestion(text)) return 'register';
  if (!isQuestion(text) && isRegistrationStatement(text)) return 'register';

  const queryIntent = queryIntentFromText(text);
  if (queryIntent) return queryIntent;

  return 'help';
}
