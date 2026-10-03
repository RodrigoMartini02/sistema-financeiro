import {
  extractAmountFromText,
  extractDateFromText,
  extractDescription,
  normalizeAssistantInputText,
} from './financialAssistant';
import {
  cardsForPaymentMethod,
  createEmptySlotDraft,
  type SlotCatalog,
  type SlotDraft,
  type SlotBillingType,
  type SlotPaymentMethod,
} from './assistantSlotFilling';

// Lê a frase do usuário e preenche o que der do rascunho de uma vez: valor,
// data, descrição, forma de pagamento, cobrança, parcelas e cartão.

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
 * Numero grudado na forma de pagamento — "200 no pix", "150 no debito", ou
 * "150 reais hoje no pix" quando uma palavra de data se intromete entre o
 * valor e a forma de pagamento. Essa palavra opcional e o que faltava: sem
 * ela, "150 reais hoje no pix" nao batia com nenhum regex de valor porque o
 * numero nao ficava colado a "no pix".
 */
function extractAmountBeforePaymentMethod(text: string): number | null {
  // (?![\dx]) impede casar o "1" de "10x": em "3000 em 10x no credito" o
  // numero colado ao x e a parcela, nao o valor da compra.
  const match = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\dx])\s*(?:reais?)?\s+(?:(?:hoje|ontem|amanh[aã])\s+)?(?:no|na|em|com|via|por)\s+(?:cart[aã]o\s+de\s+)?(?:pix|pics|pixs|cr[ée]dito|d[ée]bito|dinheiro)\b/i,
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

/**
 * Valor que vem antes do parcelamento: "celular 3000 em 10x".
 *
 * As demais extracoes ancoram no simbolo de moeda ou na forma de pagamento, e
 * nenhuma cobre o numero seguido de "em 10x" — o caso mais comum de compra
 * parcelada ficava sem valor.
 */
function extractAmountBeforeInstallments(text: string): number | null {
  const match = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\dx])\s*(?:reais?)?\s+(?:em|no|na)?\s*\d{1,3}\s*(?:x|vezes|parcelas)\b/i,
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

/**
 * Valor da parcela dito depois do parcelamento: "10x de 300", "12 vezes de
 * 250", "em 10x no credito de 300 reais". Devolve o total (parcelas x valor):
 * o card trabalha com o total, como o modal de despesa do desktop.
 *
 * O valor dito antes do parcelamento ("3000 em 10x") ja e o total e fica com
 * extractAmountBeforeInstallments. Ate quatro palavras sem numero podem
 * separar o parcelamento do "de" ("no cartao nubank de 300").
 */
function extractTotalFromInstallmentValue(text: string): number | null {
  const match = text.match(
    /(\d{1,3})\s*(?:x|vezes|parcelas)\b(?:\s+[^\s\d]+){0,4}?\s+de\s+(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d.,]*\d)/i,
  );
  if (!match?.[1] || !match[2]) return null;

  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 2 || count > 360) return null;

  const compact = match[2];
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(compact)
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(',', '.');
  const installment = Number(normalized);
  if (!Number.isFinite(installment) || installment <= 0) return null;

  const total = Math.round(installment * count * 100) / 100;
  return total < 10_000_000 ? total : null;
}

function matchPaymentMethod(text: string): SlotPaymentMethod | null {
  if (/\bpix\b|\bpics\b|\bpixs\b/.test(text)) return 'pix';
  if (/\bcredito\b|\bcartao de credito\b/.test(text)) return 'credito';
  if (/\bdebito\b|\bcartao de debito\b/.test(text)) return 'debito';
  if (/\bdinheiro\b|\bespecie\b|\bcash\b/.test(text)) return 'dinheiro';
  return null;
}

function matchBillingType(text: string): SlotBillingType | null {
  if (/\bparcel/.test(text) || /\d+\s*x\b/.test(text) || /\bvezes\b/.test(text)) return 'parcelas';
  if (/\brecorrente\b|\bmensal\b|\btodo mes\b|\bfixa\b|\bassinatura\b/.test(text)) return 'mensal';
  if (/\bnao repete\b|\bunica\b|\bavista\b|\ba vista\b|\buma vez\b/.test(text)) return 'nao';
  return null;
}

function matchCard(text: string, catalog: SlotCatalog, draft: SlotDraft): number | null {
  const cards = cardsForPaymentMethod(catalog, draft.paymentMethod);
  const byId = cards.find((card) => String(card.id) === text);
  if (byId) return byId.id;
  const byName = cards.find((card) => normalize(card.name) === text || text.includes(normalize(card.name)));
  return byName?.id ?? null;
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
    .replace(/\b(?:no|na|em|com|via|por)\s+(?:cartao\s+de\s+)?(?:pix|pics|pixs|credito|crédito|debito|débito|dinheiro|especie|espécie)\b/gi, ' ')
    .replace(/(?:^|\s)(?:no|na|com|pelo|pela)\s+cart[aã]o(?=\s|$)/gi, ' ')
    // "Cartão" sozinho e a forma de pagar, nao o que foi comprado.
    .replace(/^\s*cart[aã]o\s*$/i, ' ')
    .replace(/\b(?:pix|pics|pixs|credito|crédito|debito|débito|dinheiro)\b/gi, ' ')
    .replace(/\b(?:paguei|pagei|gastei|comprei|compras|passei|recebi|ganhei|custou|foi)\b/gi, ' ')
    .replace(/\bR\$\s*[\d.,]+/gi, ' ')
    .replace(/\b\d{1,3}\s*(?:x|vezes|parcelas)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)*\s*(?:reais?|conto|paus)?\b/gi, ' ')
    .replace(/\b(?:reais?|real|centavos?)\b/gi, ' ')
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, ' ')
    // Espaco, e nao \b, em volta do conectivo: sem a flag `u`, letra acentuada
    // nao conta como letra para o \b, e o "o" final de "pão" e "cartão" saia
    // como se fosse o artigo ("pã", "cartã").
    .replace(/(?:^|\s)(?:de|do|da|dos|das|em|no|na|para|ao|a|o|uma?|e)\s*$/gi, ' ')
    .replace(/^\s*(?:de|do|da|dos|das|em|no|na|para|ao|a|o|uma?|e)(?=\s|$)/gi, ' ')
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

  // Valor por extenso so quando a frase nao tem numero escrito. Em "comprei um
  // celular 3000 em 10x", o "um" e artigo, nao quantidade — e leria 1 no lugar
  // de 3000. Onde ha digito, ele e a fonte do valor.
  const temNumeroEscrito = /\d/.test(raw);

  // "10x de 300" vem primeiro: o 300 e a parcela, e o card guarda o total.
  draft.amount = extractTotalFromInstallmentValue(raw)
    ?? extractAmountFromText(raw)
    ?? (!temNumeroEscrito && spokenAfterVerb?.[1]
      ? extractSpokenAmountWithoutCurrency(spokenAfterVerb[1])
      : null)
    ?? extractAmountBeforePaymentMethod(raw)
    ?? extractAmountBeforeInstallments(raw);
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
