// Valores fixos do módulo de clientes e contratos (schema `comercial`). Os
// valores são os mesmos do banco e da API, como os status das receitas.

export const CLIENT_KINDS = ['pessoa_fisica', 'empresa', 'orgao_publico'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const GOVERNMENT_SPHERES = ['municipal', 'estadual', 'federal'] as const;
export type GovernmentSphere = (typeof GOVERNMENT_SPHERES)[number];

export const CONTRACT_STATUSES = ['ativo', 'encerrado'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Mensalidade: valor do mês. Implantação e projeto: valor total em parcelas mensais. */
export const CHARGE_KINDS = ['mensalidade', 'implantacao', 'projeto'] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];
export type InstallmentChargeKind = Exclude<ChargeKind, 'mensalidade'>;

export const ATTACHMENT_KINDS = ['pdf', 'jpg', 'png'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Tributos retidos por órgão público, na ordem em que aparecem. */
export const WITHHOLDING_TAXES = ['ir', 'pisCofinsCsll', 'iss', 'inss'] as const;
export type WithholdingTax = (typeof WITHHOLDING_TAXES)[number];
/** Percentuais do contrato; ausente = sem retenção daquele tributo. */
export type WithholdingRates = Partial<Record<WithholdingTax, number>>;
/** Valores retidos numa receita (R$), gravados em `receitas.retencoes`. */
export type WithholdingAmounts = Record<WithholdingTax, number>;

/** Contrato sem prazo: sempre esta quantidade de mensalidades previstas à frente do mês atual. */
export const OPEN_ENDED_MONTHS_AHEAD = 12;
/** Alerta de contrato vencendo: data final dentro deste número de dias. */
export const EXPIRING_SOON_DAYS = 60;
export const MAX_INSTALLMENTS = 120;
