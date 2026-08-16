export type BudgetTargetMode = 'amount' | 'income_percent';
export type BudgetReferenceStatus =
  | 'without_reference'
  | 'without_classified_expenses'
  | 'below_reference'
  | 'within_reference'
  | 'attention'
  | 'risk';

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
  referenceGroups: BudgetReferenceGroupOverview[];
  unclassifiedProjectedTotal: number;
}

export interface BudgetReferenceGroupOverview {
  key: string;
  label: string;
  referencePercentage: number;
  projectedAmount: number;
  paidAmount: number;
  shareOfClassifiedExpenses: number | null;
  status: BudgetReferenceStatus;
}
