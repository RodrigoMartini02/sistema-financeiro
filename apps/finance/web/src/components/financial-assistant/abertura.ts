import type { FinancialCopilotIntentHint } from '../../types/financialCopilot';

/** Uma opção do menu inicial do Juca: o chip e a fala logo depois da escolha. */
export interface AberturaOpcao {
  intent: FinancialCopilotIntentHint;
  /** Texto do chip. */
  label: string;
  /** Fala do assistente logo após a escolha. */
  abertura: string;
}

/** Saudações e chips do início da conversa. */
export interface AberturaAssistente {
  /** Primeira vez, e fallback quando as demais não existem. */
  saudacao: string;
  /** Voltou no mesmo dia. */
  saudacaoRetorno?: string;
  /** Voltou dias depois. */
  saudacaoRetornoLongo?: string;
  opcoes: AberturaOpcao[];
}

/**
 * Menu inicial do Juca, com os textos que a produção usava quando ele vinha do
 * fluxo editável salvo no banco (removido junto com o fluxo guiado).
 */
export const ABERTURA: AberturaAssistente = {
  // Variam com o tempo desde a última conversa: repetir a mesma frase a cada
  // abertura soa robótico, e uma saudação longa atrasa quem quer só lançar.
  saudacao: 'Oi! Sou o Juca. O que vamos lançar?',
  saudacaoRetorno: 'Oi de novo! O que vamos lançar?',
  saudacaoRetornoLongo: 'Que bom que voltou! O que vamos lançar hoje?',
  opcoes: [
    { intent: 'register_expense', label: 'Lançar despesa', abertura: 'Beleza! Me conta o que você gastou.' },
    { intent: 'pay_expense', label: 'Pagar despesa', abertura: 'Qual despesa você pagou?' },
    { intent: 'register_income', label: 'Lançar receita', abertura: 'Boa! Me conta o que você recebeu.' },
    { intent: 'ask', label: 'Consultar', abertura: 'Pode perguntar. O que você quer saber?' },
  ],
};
