export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

export function budgetPercentage(item: { targetAmount: number | null; projectedAmount: number }): number {
  if (!item.targetAmount) return 0;
  return (item.projectedAmount / item.targetAmount) * 100;
}
