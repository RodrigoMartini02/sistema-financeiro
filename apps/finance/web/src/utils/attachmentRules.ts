// Regras de anexo por tipo de dono, iguais às do backend (backend/src/services/attachmentRules.ts). A tela
// confere antes de enviar para avisar logo; quem decide, pelo conteúdo do arquivo, é o servidor.

/** Quem pode ter anexo. */
export type AttachmentOwnerType = 'expense' | 'income' | 'contract' | 'product';

export interface AttachmentRule {
  extensions: readonly string[];
  maxBytes: number;
  /** Tipos aceitos, por extenso, para as mensagens ("PDF, JPG ou PNG"). */
  typesLabel: string;
  /** Valor do atributo `accept` do seletor de arquivos (extensões e tipos, para o seletor do celular também filtrar). */
  accept: string;
  /** Dica ao lado do botão de anexar: tipos e tamanho. */
  hint: string;
}

const MEGABYTE = 1024 * 1024;

function buildRule(
  extensions: readonly string[],
  mimeTypes: readonly string[],
  maxMegabytes: number,
  typesLabel: string,
): AttachmentRule {
  return {
    extensions,
    maxBytes: maxMegabytes * MEGABYTE,
    typesLabel,
    accept: [...extensions.map((extension) => `.${extension}`), ...mimeTypes].join(','),
    hint: `${typesLabel}, até ${maxMegabytes} MB.`,
  };
}

/** Despesa e receita aceitam os mesmos tipos. */
const ENTRY_RULE = buildRule(
  ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx', 'doc', 'docx', 'txt'],
  [
    'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
  ],
  10,
  'PDF, imagem, planilha, DOC ou TXT',
);

export const ATTACHMENT_RULES: Record<AttachmentOwnerType, AttachmentRule> = {
  expense: ENTRY_RULE,
  income: ENTRY_RULE,
  contract: buildRule(['pdf', 'jpg', 'jpeg', 'png'], ['application/pdf', 'image/jpeg', 'image/png'], 20, 'PDF, JPG ou PNG'),
  product: buildRule(['jpg', 'jpeg', 'png', 'webp'], ['image/jpeg', 'image/png', 'image/webp'], 8, 'JPG, PNG ou WebP'),
};

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function formatFileSize(bytes: number): string {
  if (bytes < MEGABYTE) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MEGABYTE).toFixed(1).replace('.', ',')} MB`;
}

/** Conferência antes de enviar (o servidor confere de novo, pelo conteúdo). Vazio quando o arquivo serve. */
export function attachmentProblem(ownerType: AttachmentOwnerType, file: { name: string; size: number }): string {
  const rule = ATTACHMENT_RULES[ownerType];
  if (!rule.extensions.includes(extensionOf(file.name))) {
    return `"${file.name}": envie ${rule.typesLabel}.`;
  }
  if (file.size === 0) {
    return `"${file.name}" está vazio.`;
  }
  if (file.size > rule.maxBytes) {
    return `"${file.name}" passa de ${rule.maxBytes / MEGABYTE} MB.`;
  }
  return '';
}
