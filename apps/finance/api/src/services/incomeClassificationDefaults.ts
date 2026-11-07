import { othersSubcategoryName } from './catalogRules';

export type IncomeClassificationAccountType = 'pessoal' | 'empresa';

export interface DefaultIncomeClassification {
  nome: string;
  subcategorias: readonly string[];
}

/** Raiz com as subcategorias padrão e, por último, o "Outros de <raiz>". */
function group(nome: string, subcategorias: readonly string[]): DefaultIncomeClassification {
  return { nome, subcategorias: [...subcategorias, othersSubcategoryName(nome)] };
}

/**
 * Conta PF: a raiz é só o nome do grupo (não se escolhe ao lançar) e as subcategorias
 * padrão ficam na raiz a que pertencem. O salário do mês é uma subcategoria de
 * "Emprego", ao lado de 13º, Férias e Vale Refeição/Alimentação.
 */
const PERSONAL_DEFAULT_INCOME_CLASSIFICATIONS: readonly DefaultIncomeClassification[] = [
  group('Emprego', ['Salário', '13º', 'Férias', 'Vale Refeição/Alimentação', 'Bônus e PLR']),
  group('Renda Extra', ['Freelance', 'Serviços e Bicos', 'Vendas', 'Comissões']),
  group('Benefícios', ['Aposentadoria', 'Pensão', 'Auxílios', 'Seguro-Desemprego', 'FGTS']),
  group('Investimentos e Rendimentos', ['Juros', 'Dividendos', 'Aluguéis', 'Venda de Ativos']),
  group('Reembolsos e Restituições', ['Reembolso de Despesas', 'Restituição de IR', 'Cashback e Estornos']),
  group('Outras Entradas', ['Presentes Recebidos', 'Venda de Bens Usados', 'Empréstimos Recebidos']),
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
