export type BudgetTargetMode = 'amount' | 'income_percent';

export interface BudgetOverviewItem {
  categoryId: number;
  categoryName: string;
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
  profileType: 'pessoal' | 'empresa';
  month: number;
  year: number;
  incomeTotal: number;
  paidTotal: number;
  projectedTotal: number;
  items: BudgetOverviewItem[];
}
