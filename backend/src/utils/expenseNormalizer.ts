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

export function inferCategory(description: string): string {
  if (!description) return 'Outros';
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Outros';
}

