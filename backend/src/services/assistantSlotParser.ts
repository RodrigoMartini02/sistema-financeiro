import {
  extractAmountFromText,
  extractDateFromText,
  extractDescription,
  normalizeAssistantInputText,
} from './financialAssistant';
import {
  cardsForPaymentMethod,
  clearDependentSlots,
  createEmptySlotDraft,
  type SlotCatalog,
  type SlotDraft,
  type SlotBillingType,
  type SlotId,
  type SlotPaymentMethod,
} from './assistantSlotFilling';

// Traduz a resposta do usuario no contexto do slot que foi perguntado. Fora de
// um slot ativo a mesma frase seria ambigua: "credito" sozinho nao diz se e
// forma de pagamento ou parte da descricao — perguntado o slot, diz.

export interface SlotParseResult {
  draft: SlotDraft;
  /** Slot que precisa ser reperguntado do zero — o usuario pediu para corrigir. */
  reask: SlotId | null;
  /** Slot que o usuario optou por deixar em branco. */
  skipped: SlotId | null;
  /** Slot confirmado com "sim", para nao voltar a ser perguntado. */
  confirmed: SlotId | null;
  understood: boolean;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const AFFIRMATIVE = new Set(['sim', 's', 'isso', 'certo', 'correto', 'ok', 'confirmo', 'exato', 'positivo', 'pode', 'e isso', 'sim senhor']);
const NEGATIVE = new Set(['nao', 'n', 'negativo', 'errado', 'incorreto', 'ainda nao']);
const CORRECTION = new Set(['corrigir', 'trocar', 'outro', 'outra', 'outro valor', 'mudar', 'alterar']);
const SKIP = new Set(['pular', 'nao sei', 'sem', 'nenhum', 'nenhuma', 'depois', 'deixa', 'skip']);

function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.has(text);
}

function isNegative(text: string): boolean {
  return NEGATIVE.has(text);
}

function isCorrection(text: string): boolean {
  return CORRECTION.has(text);
}

function isSkip(text: string): boolean {
  return SKIP.has(text);
}

const SPOKEN_UNITS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

/**
 * Valor por extenso sem a palavra "reais" — "paguei quatrocentos de internet".
 * O extrator compartilhado exige esse ancora porque foi feito para comprovantes;
 * na conversa falada ela quase nunca aparece.
 */
function extractSpokenAmountWithoutCurrency(text: string): number | null {
  const tokens = text.match(/[a-z]+/g) ?? [];
  let total = 0;
  let current = 0;
  let recognized = false;

  for (const token of tokens) {
    if (token === 'mil') {
      total += Math.max(current, 1) * 1_000;
      current = 0;
      recognized = true;
      continue;
    }
    const value = SPOKEN_UNITS[token];
    if (value === undefined) {
      if (recognized && token !== 'e') break;
      continue;
    }
    current += value;
    recognized = true;
  }

  const amount = total + current;
  return recognized && amount > 0 ? amount : null;
}

/**
 * Numero grudado na forma de pagamento — "200 no pix", "150 no debito". A
 * forma de pagamento identifica o numero como valor sem precisar de "R$".
 */
function extractAmountBeforePaymentMethod(text: string): number | null {
  const match = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\s+(?:no|na|em|com|via|por)\s+(?:cart[aã]o\s+de\s+)?(?:pix|pics|pixs|cr[ée]dito|d[ée]bito|dinheiro|boleto)\b/i,
  );
  if (!match?.[1]) return null;

  const compact = match[1];
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(compact)
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(',', '.');

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) return null;
  return Math.round(amount * 100) / 100;
}

function parsePositiveInteger(text: string, max: number): number | null {
  const digits = text.match(/\d{1,3}/);
  if (!digits) return null;
  const parsed = Number(digits[0]);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
}

function matchPaymentMethod(text: string): SlotPaymentMethod | null {
  if (/\bpix\b|\bpics\b|\bpixs\b/.test(text)) return 'pix';
  if (/\bcredito\b|\bcartao de credito\b/.test(text)) return 'credito';
  if (/\bdebito\b|\bcartao de debito\b/.test(text)) return 'debito';
  if (/\bdinheiro\b|\bespecie\b|\bcash\b/.test(text)) return 'dinheiro';
  if (/\bboleto\b/.test(text)) return 'boleto';
  return null;
}

function matchBillingType(text: string): SlotBillingType | null {
  if (/\bparcel/.test(text) || /\d+\s*x\b/.test(text) || /\bvezes\b/.test(text)) return 'parcelas';
  if (/\brecorrente\b|\bmensal\b|\btodo mes\b|\bfixa\b|\bassinatura\b/.test(text)) return 'mensal';
  if (/\bnao repete\b|\bunica\b|\bavista\b|\ba vista\b|\buma vez\b/.test(text)) return 'nao';
  return null;
}

function matchCategory(text: string, catalog: SlotCatalog): string | null {
  const exact = catalog.categories.find((category) => normalize(category.name) === text);
  if (exact) return exact.name;
  const partial = catalog.categories.find((category) => text.includes(normalize(category.name)));
  return partial?.name ?? null;
}

function matchCard(text: string, catalog: SlotCatalog, draft: SlotDraft): number | null {
  const cards = cardsForPaymentMethod(catalog, draft.paymentMethod);
  const byId = cards.find((card) => String(card.id) === text);
  if (byId) return byId.id;
  const byName = cards.find((card) => normalize(card.name) === text || text.includes(normalize(card.name)));
  return byName?.id ?? null;
}

/**
 * Aplica a resposta do usuario ao slot perguntado.
 *
 * Responder um slot pode invalidar outros ja preenchidos: trocar a forma de
 * pagamento derruba o cartao. Por isso todo caminho que muda um campo com
 * dependentes passa por `clearDependentSlots` — sem recomecar o lancamento.
 */
export function applySlotAnswer(
  draft: SlotDraft,
  slot: SlotId,
  answer: string,
  catalog: SlotCatalog,
): SlotParseResult {
  const raw = normalizeAssistantInputText(answer);
  const text = normalize(raw);
  const unchanged: SlotParseResult = { draft, reask: null, skipped: null, confirmed: null, understood: false };

  if (!text) return unchanged;

  if (isSkip(text)) {
    return { draft, reask: null, skipped: slot, confirmed: null, understood: true };
  }

  // "Corrigir" limpa o campo para que ele volte como pergunta aberta.
  if (isCorrection(text)) {
    const cleared = { ...draft };
    switch (slot) {
      case 'description': cleared.description = null; break;
      case 'category': cleared.category = null; break;
      case 'cardId': cleared.cardId = null; break;
      case 'amountPaid': cleared.amountPaid = null; break;
      default: break;
    }
    return { draft: cleared, reask: slot, skipped: null, confirmed: null, understood: true };
  }

  switch (slot) {
    case 'description': {
      if (draft.description && isAffirmative(text)) {
        return { draft, reask: null, skipped: null, confirmed: 'description', understood: true };
      }
      if (draft.description && isNegative(text)) {
        return { draft: { ...draft, description: null }, reask: slot, skipped: null, confirmed: null, understood: true };
      }
      // Resposta a uma pergunta aberta de descricao vale inteira: "de onde veio
      // esse valor?" merece guardar o que a pessoa escreveu, nao um recorte.
      const description = raw.trim().slice(0, 255);
      if (!description) return unchanged;
      return { draft: { ...draft, description }, reask: null, skipped: null, confirmed: 'description', understood: true };
    }

    case 'category': {
      if (draft.category && isAffirmative(text)) {
        return { draft, reask: null, skipped: null, confirmed: 'category', understood: true };
      }
      if (draft.category && isNegative(text)) {
        return { draft: { ...draft, category: null }, reask: slot, skipped: null, confirmed: null, understood: true };
      }
      const category = matchCategory(text, catalog);
      if (!category) return unchanged;
      return { draft: { ...draft, category }, reask: null, skipped: null, confirmed: 'category', understood: true };
    }

    case 'paymentMethod': {
      const paymentMethod = matchPaymentMethod(text);
      if (!paymentMethod) return unchanged;
      const next = clearDependentSlots({ ...draft, paymentMethod }, 'paymentMethod');
      return { draft: next, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'cardId': {
      const cardId = matchCard(text, catalog, draft);
      if (cardId === null) return unchanged;
      return { draft: { ...draft, cardId }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'billingType': {
      const billingType = matchBillingType(text);
      if (!billingType) return unchanged;
      const next = clearDependentSlots({ ...draft, billingType }, 'billingType');
      // "Em 3x" ja responde a proxima pergunta; nao vale perguntar de novo.
      const installments = billingType === 'parcelas' ? parsePositiveInteger(text, 360) : null;
      if (installments !== null && installments >= 2) next.installments = installments;
      return { draft: next, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'installments': {
      const installments = parsePositiveInteger(text, 360);
      if (installments === null || installments < 2) return unchanged;
      return { draft: { ...draft, installments }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'paidInstallments': {
      if (isNegative(text)) {
        return { draft: { ...draft, paidInstallments: 0 }, reask: null, skipped: null, confirmed: null, understood: true };
      }
      const paidInstallments = parsePositiveInteger(text, 360);
      if (paidInstallments === null) return unchanged;
      // Mais parcelas pagas do que o total nao existe; o modal trata o resto.
      if (draft.installments !== null && paidInstallments > draft.installments) return unchanged;
      return { draft: { ...draft, paidInstallments }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'recurrenceDay': {
      const recurrenceDay = parsePositiveInteger(text, 31);
      if (recurrenceDay === null || recurrenceDay < 1) return unchanged;
      return { draft: { ...draft, recurrenceDay }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'amount': {
      // Perguntado o valor, a resposta inteira e o valor: "quatrocentos" basta.
      const amount = extractAmountFromText(raw) ?? extractSpokenAmountWithoutCurrency(text);
      if (amount === null) return unchanged;
      const next = clearDependentSlots({ ...draft, amount }, 'amount');
      return { draft: next, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'cashPrice': {
      if (isNegative(text)) {
        return { draft, reask: null, skipped: slot, confirmed: null, understood: true };
      }
      const cashPrice = extractAmountFromText(raw);
      if (cashPrice === null) return unchanged;
      return { draft: { ...draft, cashPrice }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'paid': {
      if (isAffirmative(text)) {
        const next = clearDependentSlots({ ...draft, paid: true }, 'paid');
        return { draft: next, reask: null, skipped: null, confirmed: null, understood: true };
      }
      if (isNegative(text)) {
        const next = clearDependentSlots({ ...draft, paid: false }, 'paid');
        return { draft: next, reask: null, skipped: null, confirmed: null, understood: true };
      }
      return unchanged;
    }

    case 'amountPaid': {
      // O botao "Sim" devolve o proprio valor da compra como resposta.
      if (isAffirmative(text) && draft.amount !== null) {
        return { draft: { ...draft, amountPaid: draft.amount }, reask: null, skipped: null, confirmed: null, understood: true };
      }
      const amountPaid = extractAmountFromText(raw);
      if (amountPaid === null) return unchanged;
      return { draft: { ...draft, amountPaid }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'purchaseDate': {
      const date = extractDateFromText(raw);
      if (!date) return unchanged;
      return { draft: { ...draft, date }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'dueDate': {
      const dueDate = extractDateFromText(raw);
      if (!dueDate) return unchanged;
      return { draft: { ...draft, dueDate }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'invoiceNumber': {
      if (isNegative(text)) {
        return { draft, reask: null, skipped: slot, confirmed: null, understood: true };
      }
      const invoiceNumber = raw.trim().slice(0, 50);
      if (!invoiceNumber) return unchanged;
      return { draft: { ...draft, invoiceNumber }, reask: null, skipped: null, confirmed: null, understood: true };
    }

    case 'invoiceDate': {
      const invoiceDate = extractDateFromText(raw);
      if (!invoiceDate) return unchanged;
      return { draft: { ...draft, invoiceDate }, reask: null, skipped: null, confirmed: null, understood: true };
    }
  }
}

/**
 * Retira da descricao o que ja virou outro campo. `extractDescription` foi
 * escrito para o fluxo de anexo, onde a frase costuma ser curta; numa frase
 * falada ("paguei quatrocentos de internet no credito") ela devolve pedaços
 * como "internet no credito", e e a descricao que o usuario vai confirmar.
 */
function cleanDescription(candidate: string | null): string | null {
  if (!candidate) return null;

  const cleaned = candidate
    .replace(/\b(?:no|na|em|com|via|por)\s+(?:cartao\s+de\s+)?(?:pix|pics|pixs|credito|crédito|debito|débito|dinheiro|especie|espécie|boleto)\b/gi, ' ')
    .replace(/\b(?:pix|pics|pixs|credito|crédito|debito|débito|dinheiro|boleto)\b/gi, ' ')
    .replace(/\b(?:paguei|pagei|gastei|comprei|compras|passei|recebi|ganhei|custou|foi)\b/gi, ' ')
    .replace(/\bR\$\s*[\d.,]+/gi, ' ')
    .replace(/\b\d{1,3}\s*(?:x|vezes|parcelas)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)*\s*(?:reais?|conto|paus)?\b/gi, ' ')
    .replace(/\b(?:reais?|real|centavos?)\b/gi, ' ')
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, ' ')
    .replace(/\b(?:de|do|da|dos|das|em|no|na|para|ao|a|o|uma?|e)\b\s*$/gi, ' ')
    .replace(/^\s*\b(?:de|do|da|dos|das|em|no|na|para|ao|a|o|uma?|e)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    // De novo no fim: retirar valor e forma deixa preposicao solta na ponta
    // ("geladeira em", "conta de").
    .replace(/\s+\b(?:de|do|da|dos|das|em|no|na|para|ao|com|por|via|e)\b\s*$/gi, '')
    .replace(/^[\s,.;-]+|[\s,.;-]+$/g, '')
    .trim();

  // Sobrando so conectivo ou nada, e melhor perguntar do que confirmar lixo.
  if (cleaned.length < 2) return null;
  if (/^(?:de|do|da|no|na|em|com|para|ao|a|o|uma?|e)$/i.test(cleaned)) return null;

  return cleaned.slice(0, 255);
}

/**
 * Origem da receita — o "de onde veio" da frase. `extractDescription` nao cobre
 * "recebi 1200 do freela": com o valor no meio, ela devolve nada ou so a data.
 */
function extractIncomeSource(text: string): string | null {
  const match = text.match(
    /\b(?:recebi|recebimento|ganhei|vendi|caiu|entrou|depositaram|deposito)\b[^]*?\b(?:de|do|da|dos|das|por)\s+([a-zà-ÿ0-9][a-zà-ÿ0-9&.' -]{1,80}?)(?=\s+(?:hoje|ontem|amanha|amanhã|via|no|na|em|por|com)\b|[,.;]|$)/i,
  );
  return match?.[1]?.trim() ?? null;
}

/**
 * Primeira leitura da frase livre, antes de qualquer pergunta. Preenche tudo o
 * que der para extrair — o que sobrar vazio e que vira pergunta.
 */
export function seedDraftFromMessage(
  kind: SlotDraft['kind'],
  message: string,
  catalog: SlotCatalog,
): SlotDraft {
  const raw = normalizeAssistantInputText(message);
  const text = normalize(raw);
  const draft = createEmptySlotDraft(kind);

  // Ancorado no verbo de gasto: solto, "dois mercados" viraria valor 2.
  const spokenAfterVerb = text.match(/\b(?:paguei|gastei|comprei|custou|recebi|ganhei|foi|de)\s+([a-z\s]+)/);
  draft.amount = extractAmountFromText(raw)
    ?? (spokenAfterVerb?.[1] ? extractSpokenAmountWithoutCurrency(spokenAfterVerb[1]) : null)
    ?? extractAmountBeforePaymentMethod(raw);
  draft.date = extractDateFromText(raw);
  // "mercado do mes, 200 no debito, hoje": o formato com virgula que a spec
  // sugere nos casos ambiguos ja separa a descricao do resto.
  const beforeComma = raw.includes(',') ? raw.slice(0, raw.indexOf(',')).trim() : null;
  draft.description = cleanDescription(beforeComma)
    ?? (kind === 'income' ? cleanDescription(extractIncomeSource(raw)) : null)
    ?? cleanDescription(extractDescription(raw));

  if (kind === 'income') return draft;

  draft.paymentMethod = matchPaymentMethod(text);
  draft.billingType = matchBillingType(text);

  if (draft.billingType === 'parcelas') {
    const installments = text.match(/(\d{1,3})\s*(?:x|vezes|parcelas)/);
    if (installments?.[1]) {
      const parsed = Number(installments[1]);
      if (parsed >= 2 && parsed <= 360) draft.installments = parsed;
    }
  }

  if (draft.paymentMethod === 'credito' || draft.paymentMethod === 'debito') {
    draft.cardId = matchCard(text, catalog, draft);
  }

  // "Paguei"/"gastei" no passado ja diz que saiu do bolso; no credito quem paga
  // e a fatura, entao a frase nao marca a despesa como paga.
  if (draft.paymentMethod !== 'credito' && /\bpaguei\b|\bgastei\b|\bcomprei\b|\bpago\b|\bquitado\b/.test(text)) {
    draft.paid = true;
  }

  return draft;
}
