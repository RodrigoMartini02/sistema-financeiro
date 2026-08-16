export type BudgetReferenceStatus =
  | 'without_reference'
  | 'without_classified_expenses'
  | 'below_reference'
  | 'within_reference'
  | 'attention'
  | 'risk';

export interface BudgetCategoryReference {
  key: string;
  label: string;
  referencePercentage: number;
}

interface BudgetReferenceDefinition extends BudgetCategoryReference {
  aliases: string[];
}

const REFERENCES: BudgetReferenceDefinition[] = [
  {
    key: 'housing',
    label: 'Habitacao',
    referencePercentage: 36.6,
    aliases: ['habitacao', 'moradia', 'aluguel', 'condominio', 'energia', 'luz', 'agua', 'gas', 'internet', 'telefone', 'reforma residencial'],
  },
  {
    key: 'food',
    label: 'Alimentacao',
    referencePercentage: 17.5,
    aliases: ['alimentacao', 'mercado', 'supermercado', 'feira', 'restaurante', 'lanche', 'comida', 'refeicao'],
  },
  {
    key: 'transport',
    label: 'Transporte',
    referencePercentage: 18.1,
    aliases: ['transporte', 'combustivel', 'gasolina', 'etanol', 'uber', 'taxi', 'onibus', 'metro', 'carro', 'estacionamento', 'pedagio'],
  },
  {
    key: 'health',
    label: 'Saude',
    referencePercentage: 8,
    aliases: ['saude', 'farmacia', 'medico', 'medica', 'dentista', 'hospital', 'exame', 'terapia', 'plano de saude'],
  },
  {
    key: 'education',
    label: 'Educacao',
    referencePercentage: 4.7,
    aliases: ['educacao', 'escola', 'faculdade', 'curso', 'livro', 'material escolar'],
  },
  {
    key: 'clothing',
    label: 'Vestuario',
    referencePercentage: 4.3,
    aliases: ['vestuario', 'roupa', 'calcado', 'tenis', 'sapato'],
  },
  {
    key: 'personal-care',
    label: 'Higiene e cuidados pessoais',
    referencePercentage: 3.6,
    aliases: ['higiene', 'cuidados pessoais', 'beleza', 'cosmetico', 'cabeleireiro', 'barbearia'],
  },
  {
    key: 'leisure-culture',
    label: 'Lazer e cultura',
    referencePercentage: 2.6,
    aliases: ['lazer', 'cultura', 'cinema', 'show', 'viagem', 'streaming', 'jogos'],
  },
];

function normalizeCategoryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveBudgetCategoryReference(categoryName: string): BudgetCategoryReference | null {
  const normalizedName = normalizeCategoryName(categoryName);
  const reference = REFERENCES.find((item) => item.aliases.some((alias) => normalizedName.includes(alias)));
  if (!reference) return null;

  return {
    key: reference.key,
    label: reference.label,
    referencePercentage: reference.referencePercentage,
  };
}

export function classifyBudgetReference(
  currentPercentage: number | null,
  referencePercentage: number | null,
): BudgetReferenceStatus {
  if (referencePercentage === null) return 'without_reference';
  if (currentPercentage === null) return 'without_classified_expenses';
  if (currentPercentage < referencePercentage * 0.8) return 'below_reference';
  if (currentPercentage <= referencePercentage * 1.2) return 'within_reference';
  if (currentPercentage <= referencePercentage * 1.5) return 'attention';
  return 'risk';
}
