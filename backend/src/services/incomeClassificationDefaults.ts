export type IncomeClassificationAccountType = 'pessoal' | 'empresa';

export interface DefaultIncomeClassification {
  nome: string;
  subcategorias: readonly string[];
}

/**
 * Uma palavra por classificação; as subcategorias padrão ficam na raiz a que pertencem.
 * Raiz com subcategorias é só o nome do grupo (não se escolhe ao lançar), por isso o
 * salário do mês é uma subcategoria de "Emprego", ao lado de 13º, Férias e Vale refeição.
 */
const PERSONAL_DEFAULT_INCOME_CLASSIFICATIONS: readonly DefaultIncomeClassification[] = [
  { nome: 'Emprego', subcategorias: ['Salário', '13º', 'Férias', 'Vale refeição'] },
  { nome: 'Benefícios', subcategorias: ['Aposentadoria', 'Pensão', 'Auxílio'] },
  { nome: 'Freelance', subcategorias: [] },
  { nome: 'Aluguéis', subcategorias: [] },
  { nome: 'Investimentos', subcategorias: ['Juros', 'Dividendos'] },
  { nome: 'Comissões', subcategorias: [] },
  { nome: 'Reembolsos', subcategorias: [] },
  { nome: 'Outros', subcategorias: [] },
];

export const CONTRACT_INCOME_CLASSIFICATION = {
  raiz: 'Contratos',
  mensalidade: 'Mensalidade',
  implantacao: 'Implantação',
} as const;

/** Onde entra o capital inicial dos sócios lançado como receita (modal da conta PJ). */
export const CAPITAL_INCOME_CLASSIFICATION = 'Aportes';

const BUSINESS_DEFAULT_INCOME_CLASSIFICATIONS: readonly DefaultIncomeClassification[] = [
  {
    nome: CONTRACT_INCOME_CLASSIFICATION.raiz,
    subcategorias: [CONTRACT_INCOME_CLASSIFICATION.mensalidade, CONTRACT_INCOME_CLASSIFICATION.implantacao],
  },
  { nome: 'Serviços', subcategorias: [] },
  { nome: 'Vendas', subcategorias: [] },
  { nome: 'Rendimentos', subcategorias: [] },
  { nome: 'Reembolsos', subcategorias: [] },
  { nome: CAPITAL_INCOME_CLASSIFICATION, subcategorias: [] },
  { nome: 'Outros', subcategorias: [] },
];

export function getDefaultIncomeClassifications(
  accountType: IncomeClassificationAccountType,
): readonly DefaultIncomeClassification[] {
  return accountType === 'empresa' ? BUSINESS_DEFAULT_INCOME_CLASSIFICATIONS : PERSONAL_DEFAULT_INCOME_CLASSIFICATIONS;
}

/**
 * A classificação de implantação do contrato não muda depois que a receita de
 * implantação foi gerada: é por ela que o contrato sabe que já gerou a sua.
 */
export function canChangeContractSetupClassification(
  setupAlreadyGenerated: boolean,
  currentId: number | null,
  nextId: number | null,
): boolean {
  return !setupAlreadyGenerated || currentId === nextId;
}
