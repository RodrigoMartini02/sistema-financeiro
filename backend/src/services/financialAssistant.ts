import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyCategory } from './categoryAI';
import { extractFinancialInfo, extractTextFromImage, extractTextFromPDF, type FinancialInfo } from './ocrService';
import { extractPixInfo, readPixQRFromImage, type PixInfo } from './pixReader';
import { getTodayIsoInTimezone } from '../utils/date';

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 2_000;
const NUMERIC_AMOUNT_TOKEN = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?|\\d+\\.\\d{1,2})';

const SUPPORTED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain',
]);

type DraftKind = 'income' | 'expense';
type PaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto';

export interface AssistantAttachmentInput {
  nome: string;
  tipo: string;
  tamanho: number;
  dados: string;
}

export interface AssistantDraftContext {
  kind?: DraftKind;
  description?: string | null;
  amount?: number | null;
  date?: string | null;
  dueDate?: string | null;
  category?: string | null;
  paymentMethod?: PaymentMethod;
  paid?: boolean;
}

export interface FinancialAssistantDraft {
  kind: DraftKind;
  description: string | null;
  amount: number | null;
  date: string | null;
  dueDate: string | null;
  category: string | null;
  paymentMethod: PaymentMethod;
  paid: boolean;
  confidence: 'low' | 'medium' | 'high';
}

export interface FinancialAssistantResult {
  reply: string;
  draft: FinancialAssistantDraft;
  missingFields: Array<'description' | 'amount'>;
  usedDefaultDate: boolean;
}

export class FinancialAssistantInputError extends Error {}

interface ExtractedAttachment {
  text: string;
  financial: FinancialInfo | null;
  pix: PixInfo | null;
  source: 'pdf' | 'image' | 'text';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeAssistantInputText(value: string): string {
  return normalizeText(value).replace(/\b(pics|pixs)\b/gi, 'pix');
}

function normalizeBase64(value: string): Buffer {
  const normalized = value.replace(/\s/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new FinancialAssistantInputError('O arquivo enviado não está em um formato válido.');
  }

  const estimatedBytes = Math.floor((normalized.length * 3) / 4);
  if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no máximo 10 MB.');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no máximo 10 MB.');
  }

  return buffer;
}

function getSafeExtension(mimeType: string): string {
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'text/plain') return '.txt';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

function parseBrazilianAmount(raw: string): number | null {
  const compact = raw.replace(/R\$\s*/gi, '').replace(/\s/g, '').trim();
  if (!compact) return null;

  const isBrazilianThousands = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(compact);
  const isCommaDecimal = /^\d+(?:,\d{1,2})?$/.test(compact);
  const isDotDecimal = /^\d+\.\d{1,2}$/.test(compact);
  if (!isBrazilianThousands && !isCommaDecimal && !isDotDecimal) return null;

  const normalized = isBrazilianThousands
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(',', '.');

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) return null;
  return Math.round(amount * 100) / 100;
}

function extractTrailingNumericAmount(text: string): { rawAmount: string; description: string } | null {
  const match = text.match(new RegExp(`(?:^|\\s)(?:R\\$\\s*)?(${NUMERIC_AMOUNT_TOKEN})\\s*(?:reais?)?\\s*$`, 'i'));
  if (!match?.[1] || match.index === undefined) return null;

  const description = text.slice(0, match.index).trim();
  if (!description || /\b(dia|data|vence|vencimento)\b/i.test(description)) return null;

  return { rawAmount: match[1], description };
}

const SPOKEN_NUMBER_VALUES: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

function parseSpokenInteger(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let recognized = false;

  for (const token of tokens) {
    if (token === 'e') continue;
    if (token === 'mil') {
      total += Math.max(current, 1) * 1_000;
      current = 0;
      recognized = true;
      continue;
    }

    const value = SPOKEN_NUMBER_VALUES[token];
    if (!value) return null;
    current += value;
    recognized = true;
  }

  const value = total + current;
  return recognized && value > 0 ? value : null;
}

function extractSpokenAmount(text: string): number | null {
  const tokens: string[] = [...(text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z]+/g) ?? [])];
  let bestAmount: number | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== 'real' && tokens[index] !== 'reais') continue;

    let reais: number | null = null;
    for (let start = Math.max(0, index - 6); start < index; start += 1) {
      const parsed = parseSpokenInteger(tokens.slice(start, index));
      if (parsed !== null && (reais === null || parsed > reais)) reais = parsed;
    }
    if (reais === null) continue;

    let cents = 0;
    const centsIndex = tokens.indexOf('centavo', index + 1) >= 0
      ? tokens.indexOf('centavo', index + 1)
      : tokens.indexOf('centavos', index + 1);
    if (centsIndex > index && centsIndex - index <= 5) {
      const parsedCents = parseSpokenInteger(tokens.slice(index + 1, centsIndex));
      if (parsedCents !== null && parsedCents < 100) cents = parsedCents;
    }

    const amount = reais + (cents / 100);
    if (bestAmount === null || amount > bestAmount) bestAmount = amount;
  }

  return bestAmount;
}

function extractAmountFromText(text: string): number | null {
  const standaloneAmount = text.trim().match(new RegExp(`^(${NUMERIC_AMOUNT_TOKEN})$`));
  if (standaloneAmount?.[1]) return parseBrazilianAmount(standaloneAmount[1]);

  const currencyMatch = text.match(new RegExp(`R\\$\\s*(${NUMERIC_AMOUNT_TOKEN})`, 'i'));
  if (currencyMatch?.[1]) return parseBrazilianAmount(currencyMatch[1]);

  const spendingMatch = text.match(
    new RegExp(`(?:gastei|comprei|compra|custou|passei)\\s+(?:de\\s+)?(${NUMERIC_AMOUNT_TOKEN})`, 'i'),
  );
  if (spendingMatch?.[1]) return parseBrazilianAmount(spendingMatch[1]);

  const contextualNumericMatch = text.match(
    new RegExp(`(?:paguei|pagamento|recebi|recebimento|valor|total|entrada|saida|sa[i\\u00ed]da|por)\\s+(?:de\\s+)?(${NUMERIC_AMOUNT_TOKEN})`, 'i'),
  );
  if (contextualNumericMatch?.[1]) return parseBrazilianAmount(contextualNumericMatch[1]);

  const contextualMatch = text.match(
    /(?:paguei|pagamento|recebi|recebimento|valor|total|entrada|saida|sa[íi]da|por)\s+(?:de\s+)?([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i,
  );
  if (contextualMatch?.[1]) return parseBrazilianAmount(contextualMatch[1]);

  const trailingAmount = extractTrailingNumericAmount(text);
  if (trailingAmount) return parseBrazilianAmount(trailingAmount.rawAmount);

  return extractSpokenAmount(text);
}

export function interpretFinancialAssistantText(message: string, context?: AssistantDraftContext) {
  const normalizedMessage = normalizeAssistantInputText(message);
  const kind = inferKind(normalizedMessage, context);
  return {
    normalizedMessage,
    kind,
    description: extractDescription(normalizedMessage),
    amount: extractAmountFromText(normalizedMessage),
    paymentMethod: inferPaymentMethod(normalizedMessage, undefined, null, context),
    paid: inferPaid(normalizedMessage, kind, undefined, context),
  };
}

function formatDatePart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateToken(token: string): string | null {
  const lower = token.toLowerCase().trim();
  const reference = new Date();

  if (lower === 'hoje') return getTodayIsoInTimezone();
  if (lower === 'amanha' || lower === 'amanhã') {
    reference.setDate(reference.getDate() + 1);
    return formatDatePart(reference);
  }

  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const br = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const yearPart = br[3] ? Number(br[3]) : reference.getFullYear();
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dayOnly = lower.match(/(?:dia|vence(?:\s+no)?|vencimento(?:\s+no)?)\s+(\d{1,2})\b/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function extractDateFromText(text: string): string | null {
  const token = text.match(/\b(?:hoje|amanh[aã]|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
  if (token?.[0]) return parseDateToken(token[0]);

  const dayOnly = text.match(/(?:dia|vence(?:\s+no)?|vencimento(?:\s+no)?)\s+\d{1,2}\b/i);
  return dayOnly?.[0] ? parseDateToken(dayOnly[0]) : null;
}

function inferKind(text: string, context?: AssistantDraftContext, financial?: FinancialInfo | null): DraftKind {
  const lower = text.toLowerCase();
  if (/\b(receita|nova receita)\b/.test(lower)) return 'income';
  if (/\b(recebi|recebimento|entrada|sal[aá]rio|venda|faturamento|cliente pagou|ganhei|dep[oó]sito)\b/.test(lower)) {
    return 'income';
  }
  if (/\b(gastei|comprei|compras|passei)\b/.test(lower)) return 'expense';
  if (/\b(paguei|pagar|despesa|boleto|fatura|compra|d[eé]bito|sa[ií]da)\b/.test(lower)) {
    return 'expense';
  }
  if (financial?.tipo === 'boleto' || financial?.tipo === 'nota_fiscal') return 'expense';
  return context?.kind ?? 'expense';
}

function inferPaymentMethod(text: string, financial?: FinancialInfo | null, pix?: PixInfo | null, context?: AssistantDraftContext): PaymentMethod {
  const lower = text.toLowerCase();
  if (pix || /\b(pics|pixs)\b/.test(lower)) return 'pix';
  if (pix || /\bpix\b/.test(lower)) return 'pix';
  if (financial?.tipo === 'boleto' || /\bboleto\b/.test(lower)) return 'boleto';
  if (/\b(cr[eé]dito|cart[aã]o de cr[eé]dito)\b/.test(lower)) return 'credito';
  if (/\b(d[eé]bito|cart[aã]o de d[eé]bito)\b/.test(lower)) return 'debito';
  if (/\b(dinheiro|esp[eé]cie)\b/.test(lower)) return 'dinheiro';
  return context?.paymentMethod ?? 'dinheiro';
}

function inferPaid(text: string, kind: DraftKind, financial?: FinancialInfo | null, context?: AssistantDraftContext): boolean {
  const lower = text.toLowerCase();
  if (kind === 'income' && /\b(recebi|recebido|entrou|depositado)\b/.test(lower)) return true;
  if (kind === 'expense' && /\b(gastei|comprei|compras|passei)\b/.test(lower)) return true;
  if (kind === 'expense' && /\b(paguei|pago|quitado|comprovante)\b/.test(lower)) return true;
  if (financial?.tipo === 'comprovante') return true;
  return context?.paid ?? false;
}

function extractDescription(text: string): string | null {
  if (/^\s*(?:(?:vence|vencimento)(?:\s+no)?\s+dia|dia)\s+\d{1,2}\s*$/i.test(text)) return null;

  const trailingAmount = extractTrailingNumericAmount(text);
  if (trailingAmount) return normalizeText(trailingAmount.description).slice(0, 120);

  const merchant = text.match(/(?:no|na|para|ao|a|de)\s+(?!R\$)([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9&.' -]{1,80}?)(?=\s+(?:hoje|amanh[aã]|ontem|via|com|em|por)\b|[,.]|$)/i);
  if (merchant?.[1]) return normalizeText(merchant[1]).slice(0, 120);

  const named = text.match(/(?:descri[cç][aã]o|referente a)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9&.' -]{2,80})/i);
  if (named?.[1]) return normalizeText(named[1]).slice(0, 120);

  const simpleReply = normalizeText(text);
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ&.' -]{1,80}$/.test(simpleReply)) {
    return simpleReply;
  }

  return null;
}

function calculateConfidence(draft: Omit<FinancialAssistantDraft, 'confidence'>, hasDocumentData: boolean): FinancialAssistantDraft['confidence'] {
  let score = 20;
  if (draft.amount) score += 30;
  if (draft.description) score += 25;
  if (draft.date || draft.dueDate) score += 10;
  if (hasDocumentData) score += 15;
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function buildReply(kind: DraftKind, draft: FinancialAssistantDraft, missingFields: Array<'description' | 'amount'>, usedDefaultDate: boolean): string {
  const label = kind === 'income' ? 'receita' : 'despesa';
  if (missingFields.length > 0) {
    const labels = missingFields.map((field) => field === 'description' ? 'a descrição' : 'o valor');
    return `Identifiquei uma ${label}, mas ainda preciso de ${labels.join(' e ')} para montar o rascunho.`;
  }

  const amount = draft.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '';
  const dateNote = usedDefaultDate ? ' Usei a data de hoje como referência.' : '';
  return `Preparei uma ${label} de ${amount}. Confira os dados antes de confirmar.${dateNote}`;
}

async function extractAttachment(attachment: AssistantAttachmentInput): Promise<ExtractedAttachment> {
  if (!SUPPORTED_ATTACHMENT_TYPES.has(attachment.tipo)) {
    throw new FinancialAssistantInputError('Envie PDF, imagem JPG/PNG/WEBP ou arquivo TXT para leitura.');
  }
  if (!attachment.nome || attachment.nome.length > 180 || !Number.isFinite(attachment.tamanho) || attachment.tamanho < 1) {
    throw new FinancialAssistantInputError('O anexo enviado não é válido.');
  }

  const buffer = normalizeBase64(attachment.dados);
  if (attachment.tamanho > MAX_ATTACHMENT_BYTES || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no máximo 10 MB.');
  }

  if (attachment.tipo === 'text/plain') {
    const text = buffer.toString('utf8').slice(0, 50_000);
    return { text, financial: extractFinancialInfo(text), pix: null, source: 'text' };
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'fingerence-assistant-'));
  const filePath = path.join(directory, `${randomUUID()}${getSafeExtension(attachment.tipo)}`);

  try {
    await writeFile(filePath, buffer);
    if (attachment.tipo === 'application/pdf') {
      const text = await extractTextFromPDF(filePath);
      return { text, financial: extractFinancialInfo(text), pix: null, source: 'pdf' };
    }

    const [text, pix] = await Promise.all([
      extractTextFromImage(filePath),
      readPixQRFromImage(filePath),
    ]);
    return { text, financial: extractFinancialInfo(text), pix, source: 'image' };
  } catch {
    throw new FinancialAssistantInputError('Não foi possível ler este arquivo. Tente uma imagem ou PDF mais nítido.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function validateInput(message: string, attachments: AssistantAttachmentInput[]): void {
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new FinancialAssistantInputError('A mensagem pode ter no máximo 2.000 caracteres.');
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new FinancialAssistantInputError('Envie no máximo três arquivos por vez.');
  }
  if (!message.trim() && attachments.length === 0) {
    throw new FinancialAssistantInputError('Escreva uma mensagem ou envie um arquivo para continuar.');
  }
}

export async function createFinancialAssistantDraft(input: {
  message: string;
  attachments: AssistantAttachmentInput[];
  context?: AssistantDraftContext;
  userId: number;
}): Promise<FinancialAssistantResult> {
  validateInput(input.message, input.attachments);

  const textInterpretation = interpretFinancialAssistantText(input.message, input.context);
  const attachments = await Promise.all(input.attachments.map(extractAttachment));
  const combinedText = normalizeText([textInterpretation.normalizedMessage, ...attachments.map((attachment) => attachment.text)].filter(Boolean).join(' '));
  const financial = attachments.map((attachment) => attachment.financial).find((value): value is FinancialInfo => value !== null) ?? null;
  const pix = attachments.map((attachment) => attachment.pix).find((value): value is PixInfo => value !== null) ?? null;
  const kind = inferKind(combinedText, input.context, financial);
  const extractedDate = financial?.data ?? extractDateFromText(combinedText);
  const dueDate = kind === 'expense'
    ? financial?.vencimento ?? extractedDate ?? financial?.data ?? input.context?.dueDate ?? input.context?.date ?? getTodayIsoInTimezone()
    : input.context?.dueDate ?? null;
  const usedDefaultDate = !extractedDate && !financial?.data && !input.context?.date;
  const date = extractedDate ?? financial?.data ?? input.context?.date ?? getTodayIsoInTimezone();
  const description = financial?.empresa
    ?? pix?.nome_destinatario
    ?? textInterpretation.description
    ?? input.context?.description
    ?? null;
  const amount = financial?.valor
    ?? pix?.valor
    ?? textInterpretation.amount
    ?? input.context?.amount
    ?? null;
  const category = description
    ? await classifyCategory(description, input.userId, [], '')
    : input.context?.category ?? null;
  const paymentMethod = inferPaymentMethod(combinedText, financial, pix, input.context);
  const paid = inferPaid(combinedText, kind, financial, input.context);

  const baseDraft = {
    kind,
    description,
    amount,
    date,
    dueDate,
    category,
    paymentMethod,
    paid,
  };
  const draft: FinancialAssistantDraft = {
    ...baseDraft,
    confidence: calculateConfidence(baseDraft, attachments.length > 0),
  };
  const missingFields: Array<'description' | 'amount'> = [];
  if (!draft.description) missingFields.push('description');
  if (!draft.amount) missingFields.push('amount');

  return {
    reply: buildReply(kind, draft, missingFields, usedDefaultDate),
    draft,
    missingFields,
    usedDefaultDate,
  };
}
