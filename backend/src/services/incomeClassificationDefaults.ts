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

/** Raiz das receitas geradas por contrato e a subcategoria de cada cobrança. */
export const CONTRACT_INCOME_CLASSIFICATION = {
  raiz: 'Contratos',
  mensalidade: 'Mensalidade',
  implantacao: 'Implantação',
  projeto: 'Projeto',
} as const;

/** Onde entra o capital inicial dos sócios lançado como receita (modal da conta PJ). */
export const CAPITAL_INCOME_CLASSIFICATION = 'Aportes';

/** Onde entram as vendas pagas pela vitrine (um pedido, uma receita por item). */
export const SALES_INCOME_CLASSIFICATION = 'Vendas';

const BUSINESS_DEFAULT_INCOME_CLASSIFICATIONS: readonly DefaultIncomeClassification[] = [
  {
    nome: CONTRACT_INCOME_CLASSIFICATION.raiz,
    subcategorias: [
      CONTRACT_INCOME_CLASSIFICATION.mensalidade,
      CONTRACT_INCOME_CLASSIFICATION.implantacao,
      CONTRACT_INCOME_CLASSIFICATION.projeto,
    ],
  },
  { nome: 'Serviços', subcategorias: [] },
  { nome: SALES_INCOME_CLASSIFICATION, subcategorias: [] },
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
