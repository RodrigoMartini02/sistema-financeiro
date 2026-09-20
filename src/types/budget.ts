export type BudgetTargetMode = 'amount' | 'income_percent';

export interface BudgetOverviewItem {
  categoryId: number;
  categoryName: string;
  /** null nas categorias raiz; id do pai nas subcategorias. */
  parentId: number | null;
  /** true quando a categoria tem subcategoria ativa — nesse caso ela nunca tem meta própria, só o agregado. */
  hasActiveSubcategories: boolean;
  mode: BudgetTargetMode | null;
  targetValue: number | null;
  targetAmount: number | null;
  paidAmount: number;
  projectedAmount: number;
  incomePercentage: number | null;
  status: 'without_target' | 'healthy' | 'attention' | 'over';
  suggestedAmount: number | null;
}

export interface BudgetOverview {
  accountType: 'pessoal' | 'empresa';
  month: number;
  year: number;
  incomeTotal: number;
  paidTotal: number;
  projectedTotal: number;
  items: BudgetOverviewItem[];
}
