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

function normalizeBase64(value: string): Buffer {
  const normalized = value.replace(/\s/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new FinancialAssistantInputError('O arquivo enviado nao esta em um formato valido.');
  }

  const estimatedBytes = Math.floor((normalized.length * 3) / 4);
  if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no maximo 10 MB.');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no maximo 10 MB.');
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

  let normalized = compact;
  if (compact.includes(',') && compact.includes('.')) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else if (compact.includes(',')) {
    normalized = compact.replace(',', '.');
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) return null;
  return Math.round(amount * 100) / 100;
}

function extractAmountFromText(text: string): number | null {
  const standaloneAmount = text.trim().match(/^([\d.]+,\d{2}|\d+(?:\.\d{2})?)$/);
  if (standaloneAmount?.[1]) return parseBrazilianAmount(standaloneAmount[1]);

  const currencyMatch = text.match(/R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i);
  if (currencyMatch?.[1]) return parseBrazilianAmount(currencyMatch[1]);

  const contextualMatch = text.match(
    /(?:paguei|pagamento|recebi|recebimento|valor|total|entrada|saida|sa[íi]da|por)\s+(?:de\s+)?([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i,
  );
  if (contextualMatch?.[1]) return parseBrazilianAmount(contextualMatch[1]);

  return null;
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
  if (/\b(recebi|recebimento|entrada|sal[aá]rio|venda|faturamento|cliente pagou|ganhei|dep[oó]sito)\b/.test(lower)) {
    return 'income';
  }
  if (/\b(paguei|pagar|despesa|boleto|fatura|compra|d[eé]bito|sa[ií]da)\b/.test(lower)) {
    return 'expense';
  }
  if (financial?.tipo === 'boleto' || financial?.tipo === 'nota_fiscal') return 'expense';
  return context?.kind ?? 'expense';
}

function inferPaymentMethod(text: string, financial?: FinancialInfo | null, pix?: PixInfo | null, context?: AssistantDraftContext): PaymentMethod {
  const lower = text.toLowerCase();
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
  if (kind === 'expense' && /\b(paguei|pago|quitado|comprovante)\b/.test(lower)) return true;
  if (financial?.tipo === 'comprovante') return true;
  return context?.paid ?? false;
}

function extractDescription(text: string): string | null {
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
    const labels = missingFields.map((field) => field === 'description' ? 'a descricao' : 'o valor');
    return `Identifiquei uma ${label}, mas ainda preciso de ${labels.join(' e ')} para montar o rascunho.`;
  }

  const amount = draft.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '';
  const dateNote = usedDefaultDate ? ' Usei a data de hoje como referencia.' : '';
  return `Preparei uma ${label} de ${amount}. Confira os dados antes de confirmar.${dateNote}`;
}

async function extractAttachment(attachment: AssistantAttachmentInput): Promise<ExtractedAttachment> {
  if (!SUPPORTED_ATTACHMENT_TYPES.has(attachment.tipo)) {
    throw new FinancialAssistantInputError('Envie PDF, imagem JPG/PNG/WEBP ou arquivo TXT para leitura.');
  }
  if (!attachment.nome || attachment.nome.length > 180 || !Number.isFinite(attachment.tamanho) || attachment.tamanho < 1) {
    throw new FinancialAssistantInputError('O anexo enviado nao e valido.');
  }

  const buffer = normalizeBase64(attachment.dados);
  if (attachment.tamanho > MAX_ATTACHMENT_BYTES || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new FinancialAssistantInputError('Cada arquivo pode ter no maximo 10 MB.');
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
    throw new FinancialAssistantInputError('Nao foi possivel ler este arquivo. Tente uma imagem ou PDF mais nitido.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function validateInput(message: string, attachments: AssistantAttachmentInput[]): void {
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new FinancialAssistantInputError('A mensagem pode ter no maximo 2.000 caracteres.');
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new FinancialAssistantInputError('Envie no maximo tres arquivos por vez.');
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

  const attachments = await Promise.all(input.attachments.map(extractAttachment));
  const combinedText = normalizeText([input.message, ...attachments.map((attachment) => attachment.text)].filter(Boolean).join(' '));
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
    ?? extractDescription(input.message)
    ?? input.context?.description
    ?? null;
  const amount = financial?.valor
    ?? pix?.valor
    ?? extractAmountFromText(input.message)
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
