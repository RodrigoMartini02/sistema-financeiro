export const PAYMENT_METHOD_MAP: Record<string, string> = {
  cartao: 'cartao_credito',
  cartão: 'cartao_credito',
  credito: 'cartao_credito',
  crédito: 'cartao_credito',
  cc: 'cartao_credito',
  debito: 'cartao_debito',
  débito: 'cartao_debito',
  cd: 'cartao_debito',
  pix: 'pix',
  dinheiro: 'dinheiro',
  especie: 'dinheiro',
  espécie: 'dinheiro',
  transferencia: 'transferencia',
  transferência: 'transferencia',
  ted: 'transferencia',
  doc: 'transferencia',
  boleto: 'boleto',
};

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação': ['mercado', 'supermercado', 'restaurante', 'lanche', 'ifood', 'rappi', 'uber eats', 'padaria', 'açougue', 'pizza', 'hamburguer', 'almoço', 'jantar', 'cafe', 'café', 'sushi', 'comida', 'refeição', 'delivery', 'hortifruti', 'feira', 'hiper', 'atacadão', 'atacadao', 'assaí', 'assai', 'carrefour', 'pao de acucar', 'pão de açúcar', "sam's club", 'sams club', 'makro', 'condor', 'bistek'],
  'Transporte': ['uber', '99', 'combustivel', 'combustível', 'gasolina', 'etanol', 'alcool', 'álcool', 'ônibus', 'metro', 'metrô', 'taxi', 'táxi', 'passagem', 'transporte', 'estacionamento', 'pedágio', 'pedagio', 'carro', 'moto', 'bicicleta', 'patinete', 'trem'],
  'Moradia': ['aluguel', 'condominio', 'condomínio', 'iptu', 'luz', 'energia', 'água', 'agua', 'gas', 'gás', 'internet', 'telefone', 'tv', 'cabo', 'reforma', 'manutenção', 'manutencao', 'móveis', 'moveis', 'eletrodomestico'],
  'Saúde': ['farmacia', 'farmácia', 'remedio', 'remédio', 'médico', 'medico', 'consulta', 'hospital', 'clinica', 'clínica', 'dentista', 'exame', 'plano de saude', 'unimed', 'amil', 'bradesco saude', 'academia', 'gym'],
  'Educação': ['escola', 'faculdade', 'curso', 'livro', 'material escolar', 'mensalidade', 'uniforme', 'colegio', 'colégio', 'creche', 'aula', 'treinamento', 'certificado'],
  'Lazer': ['cinema', 'teatro', 'show', 'ingresso', 'viagem', 'hotel', 'airbnb', 'passeio', 'parque', 'museu', 'jogo', 'esporte', 'hobby'],
  'Assinaturas': ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'apple', 'google', 'youtube', 'deezer', 'globoplay', 'telecine', 'paramount', 'adobe', 'microsoft', 'office', 'assinatura', 'mensalidade', 'plano'],
  'Vestuário': ['roupa', 'calçado', 'sapato', 'tenis', 'tênis', 'camisa', 'calça', 'vestido', 'acessório', 'acessorio', 'bolsa', 'moda', 'zara', 'renner', 'c&a', 'riachuelo'],
  'Finanças': ['emprestimo', 'empréstimo', 'financiamento', 'parcela', 'juros', 'banco', 'seguro', 'investimento', 'poupança', 'poupanca', 'tarifa', 'taxa'],
};

export function normalizeAmount(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return parseFloat(value.toFixed(2));

  let str = String(value).trim().replace(/R\$\s*/gi, '').trim();
  str = str.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(str);
  return isNaN(val) ? null : parseFloat(val.toFixed(2));
}

export function normalizePaymentMethod(method: unknown): string {
  if (!method) return 'dinheiro';
  const lower = String(method).toLowerCase().trim();
  return PAYMENT_METHOD_MAP[lower] ?? lower ?? 'dinheiro';
}

export function inferCategory(description: string): string {
  if (!description) return 'Outros';
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Outros';
}

export function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeDate(dateStr: unknown, reference: Date = new Date()): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).toLowerCase().trim();
  const today = new Date(reference);

  if (str === 'hoje') return formatDate(today);
  if (str === 'amanha' || str === 'amanhã') { today.setDate(today.getDate() + 1); return formatDate(today); }

  const dayOnly = str.match(/(?:dia\s*)?(\d{1,2})$/);
  if (dayOnly) {
    const day = parseInt(dayOnly[1]!);
    if (day >= 1 && day <= 31) return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const ddmm = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (ddmm) {
    const day = parseInt(ddmm[1]!);
    const month = parseInt(ddmm[2]!);
    let year = ddmm[3] ? parseInt(ddmm[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

export function normalizeInstallments(value: unknown): number {
  if (!value) return 1;
  const n = parseInt(String(value).replace(/[^\d]/g, ''));
  return isNaN(n) || n < 1 ? 1 : n;
}

export interface NormalizedExpense {
  descricao: string | null;
  valor: number | null;
  categoria: string;
  forma_pagamento: string;
  vencimento: string | null;
  data: string;
  parcelas: number;
  ja_pago: boolean;
  recorrente: boolean;
  data_pagamento?: string;
  nome_cartao?: string;
  categoria_id?: unknown;
  cartao_id?: unknown;
}

export function normalizeExpense(data: Record<string, unknown>): NormalizedExpense {
  const normalized: NormalizedExpense = {
    descricao: data['descricao'] ? String(data['descricao']).trim().substring(0, 255) : null,
    valor: normalizeAmount(data['valor']),
    categoria: String(data['categoria'] ?? inferCategory(String(data['descricao'] ?? ''))),
    forma_pagamento: normalizePaymentMethod(data['forma_pagamento']),
    vencimento: data['vencimento'] ? normalizeDate(data['vencimento']) : null,
    data: data['data'] ? (normalizeDate(data['data']) ?? formatDate(new Date())) : formatDate(new Date()),
    parcelas: normalizeInstallments(data['parcelas']),
    ja_pago: !!data['ja_pago'],
    recorrente: !!data['recorrente'],
  };

  if (data['data_pagamento']) normalized.data_pagamento = String(data['data_pagamento']);
  if (data['nome_cartao']) normalized.nome_cartao = String(data['nome_cartao']);
  if (data['categoria_id']) normalized.categoria_id = data['categoria_id'];
  if (data['cartao_id']) normalized.cartao_id = data['cartao_id'];

  return normalized;
}

export function validateRequiredFields(data: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!data['descricao']) missing.push('descricao');
  if (!data['valor'] || Number(data['valor']) <= 0) missing.push('valor');
  if (!data['forma_pagamento']) missing.push('forma_pagamento');
  return missing;
}

export function fieldQuestion(field: string): string {
  const questions: Record<string, string> = {
    descricao: 'What is the description of this expense?',
    valor: 'What is the amount?',
    forma_pagamento: 'What is the payment method? (card, pix, cash, etc)',
    vencimento: 'What is the due date?',
    categoria: 'What is the category? (Food, Transport, Housing, etc)',
    parcelas: 'How many installments?',
  };
  return questions[field] ?? `What is the ${field}?`;
}
