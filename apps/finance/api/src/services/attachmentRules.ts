// O que cada tipo de dono aceita como anexo e os prazos do ciclo de vida do arquivo (plano
// .plans/unificar-anexos-no-r2.md, decisão 4). As regras valem no backend, pelo conteúdo do
// arquivo (attachmentFile.ts); a tela só repete o aviso antes do envio.

/** Quem pode ter anexo. */
export const ATTACHMENT_OWNER_TYPES = ['expense', 'income', 'contract', 'product'] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

/** Formatos de arquivo reconhecidos pelo conteúdo. */
export const ATTACHMENT_FORMATS = ['pdf', 'jpg', 'png', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt'] as const;
export type AttachmentFormat = (typeof ATTACHMENT_FORMATS)[number];

export interface AttachmentRule {
  /** Formatos aceitos. */
  formats: readonly AttachmentFormat[];
  maxBytes: number;
  /** Mensagem quando o arquivo não é de um tipo aceito. */
  typeMessage: string;
  /** Mensagem quando o arquivo passa do tamanho. */
  sizeMessage: string;
  /** Imagem reduzida e convertida para WebP antes de ser guardada (fotos do catálogo). */
  convertToWebp: boolean;
}

const MEGABYTE = 1024 * 1024;

/** Despesa e receita aceitam os mesmos tipos, como a tela de lançamento sempre aceitou. */
const ENTRY_RULE: AttachmentRule = {
  formats: ['pdf', 'jpg', 'png', 'gif', 'xls', 'xlsx', 'doc', 'docx', 'txt'],
  maxBytes: 10 * MEGABYTE,
  typeMessage: 'Envie PDF, imagem (JPG, PNG ou GIF), planilha (XLS ou XLSX), documento (DOC ou DOCX) ou TXT',
  sizeMessage: 'O arquivo passa de 10 MB',
  convertToWebp: false,
};

export const ATTACHMENT_RULES: Record<AttachmentOwnerType, AttachmentRule> = {
  expense: ENTRY_RULE,
  income: ENTRY_RULE,
  contract: {
    formats: ['pdf', 'jpg', 'png'],
    maxBytes: 20 * MEGABYTE,
    typeMessage: 'Envie um arquivo PDF, JPG ou PNG',
    sizeMessage: 'O arquivo passa de 20 MB',
    convertToWebp: false,
  },
  product: {
    formats: ['jpg', 'png', 'webp'],
    maxBytes: 8 * MEGABYTE,
    typeMessage: 'Envie uma imagem JPG, PNG ou WebP',
    sizeMessage: 'A imagem passa de 8 MB',
    convertToWebp: true,
  },
};

/** Quanto tempo um envio sem dono espera ser reivindicado antes de a varredura apagá-lo. */
export const PENDING_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Validade do link de leitura de um anexo privado: o tempo de abrir o arquivo. */
export const ATTACHMENT_LINK_TTL_SECONDS = 120;

/** Anexos que um pedido pode reivindicar de uma vez: teto técnico contra listas gigantes. */
export const MAX_ATTACHMENTS_PER_REQUEST = 100;

/** Envios pendentes que uma pessoa pode ter ao mesmo tempo: protege o R2 de quem envia sem parar. */
export const MAX_PENDING_ATTACHMENTS_PER_USER = 100;
