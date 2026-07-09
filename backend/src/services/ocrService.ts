import * as fs from 'fs';

export interface FinancialInfo {
  valor: number | null;
  data: string | null;
  vencimento: string | null;
  empresa: string | null;
  descricao: string | null;
  tipo: string | null;
  cnpj: string | null;
  cpf: string | null;
  numero_documento: string | null;
}

function normalizeOcrDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const day = m[1]!.padStart(2, '0');
  const month = m[2]!.padStart(2, '0');
  let year = parseInt(m[3]!);
  if (year < 100) year += 2000;
  return `${year}-${month}-${day}`;
}

export function extractFinancialInfo(text: string): FinancialInfo {
  const info: FinancialInfo = { valor: null, data: null, vencimento: null, empresa: null, descricao: null, tipo: null, cnpj: null, cpf: null, numero_documento: null };
  if (!text) return info;

  const valuePatterns = [
    /(?:valor\s+cobrado|valor\s+do\s+documento|valor\s+total|total\s+a\s+pagar|total\s+cobrado)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /(?:valor|total|pagamento|cobrad[o]?|pagar)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /R\$\s*([\d.]+,\d{2})/,
    /\b([\d]{1,4}\.\d{3},\d{2})\b/,
    /\b([\d]{1,4},\d{2})\b/,
  ];

  for (const pattern of valuePatterns) {
    const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags + 'g'))];
    let best: number | null = null;
    for (const m of matches) {
      const raw = (m[1] ?? m[0])!;
      const v = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(v) && v > 0 && v < 10000000 && (best === null || v > best)) best = v;
    }
    if (best !== null) { info.valor = best; break; }
  }

  const duePatterns = [
    /(?:vencimento|vence|validade|prazo|venc\.?)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /data\s+de?\s+vencimento\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  ];
  for (const p of duePatterns) {
    const m = text.match(p);
    if (m) { info.vencimento = normalizeOcrDate(m[1]!); break; }
  }

  const datePatterns = [
    /(?:data|emissão|emissao|emitido)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ];
  for (const p of datePatterns) {
    const m = text.match(p);
    if (m && !info.data) { info.data = normalizeOcrDate(m[1]!); if (info.data) break; }
  }

  const companyPatterns = [
    /(?:favorecido|beneficiário|beneficiario|destinatário|empresa|estabelecimento|cedente)\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.,]+)/im,
    /(?:pago\s+a|pgto\s+a|pagamento\s+a)\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.,]+)/im,
  ];
  for (const p of companyPatterns) {
    const m = text.match(p);
    if (m) { info.empresa = m[1]!.trim().substring(0, 100); break; }
  }

  const cnpjM = text.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2}/);
  if (cnpjM) info.cnpj = cnpjM[0].replace(/\D/g, '');

  const cpfM = text.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2}(?!\d)/);
  if (cpfM) info.cpf = cpfM[0].replace(/\D/g, '');

  if (/boleto/i.test(text)) info.tipo = 'boleto';
  else if (/nota\s+fiscal|nf-?e|nfs-?e/i.test(text)) info.tipo = 'nota_fiscal';
  else if (/comprovante\s+(?:de\s+)?(?:pix|pagamento|transf)/i.test(text)) info.tipo = 'comprovante';
  else if (/recibo/i.test(text)) info.tipo = 'recibo';

  return info;
}

export async function extractTextFromImage(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Tesseract = require('tesseract.js') as { recognize: (path: string, lang: string, opts: Record<string, unknown>) => Promise<{ data: { text: string } }> };
  const { data: { text } } = await Tesseract.recognize(filePath, 'por', { logger: () => {} });
  return text;
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

export async function preprocessImage(inputPath: string, outputPath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Jimp = require('jimp') as { read: (path: string) => Promise<{ greyscale: () => { contrast: (v: number) => { normalize: () => { writeAsync: (p: string) => Promise<void> } } } }> };
    const img = await Jimp.read(inputPath);
    await img.greyscale().contrast(0.2).normalize().writeAsync(outputPath);
    return outputPath;
  } catch {
    return inputPath;
  }
}
