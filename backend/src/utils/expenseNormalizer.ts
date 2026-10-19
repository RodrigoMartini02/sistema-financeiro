// Palavras da descrição que apontam para uma subcategoria do catálogo padrão da conta
// PF (defaultCategories.ts). A ordem das chaves é a prioridade: a primeira que casar
// vence, então as mais específicas vêm antes ("uber eats" antes de "uber", "mercado
// livre" antes de "mercado"). A sugestão só vale se a conta tiver a subcategoria.
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Delivery': ['ifood', 'rappi', 'uber eats', 'delivery'],
  'Streaming de Vídeo': ['netflix', 'amazon prime', 'disney', 'hbo', 'youtube', 'globoplay', 'telecine', 'paramount'],
  'Música': ['spotify', 'deezer'],
  'Compras Online': ['mercado livre', 'shopee', 'aliexpress', 'amazon', 'magalu', 'americanas'],
  'Restaurantes e Bares': ['restaurante', 'pizza', 'hamburguer', 'almoço', 'jantar', 'sushi', 'comida', 'refeição'],
  'Padaria e Lanches': ['padaria', 'lanche', 'cafe', 'café'],
  'Mercado': [
    'mercado', 'supermercado', 'açougue', 'hortifruti', 'feira', 'hiper', 'atacadão', 'atacadao', 'assaí', 'assai',
    'carrefour', 'pao de acucar', 'pão de açúcar', "sam's club", 'sams club', 'makro', 'condor', 'bistek',
  ],
  'Aplicativo e Táxi': ['uber', '99', 'taxi', 'táxi', 'bicicleta', 'patinete'],
  'Combustível': ['combustivel', 'combustível', 'gasolina', 'etanol', 'alcool', 'álcool'],
  'Pedágio e Estacionamento': ['estacionamento', 'pedágio', 'pedagio'],
  'Transporte Público': ['ônibus', 'metro', 'metrô', 'trem', 'passagem', 'transporte'],
  'Manutenção do Veículo': ['carro', 'moto'],
  'Aluguel': ['aluguel'],
  'Condomínio': ['condominio', 'condomínio'],
  'IPTU e Taxas': ['iptu'],
  'Energia': ['luz', 'energia'],
  'Água e Gás': ['água', 'agua', 'gas', 'gás'],
  'Internet': ['internet', 'tv', 'cabo'],
  'Telefone': ['telefone'],
  'Manutenção e Reparos': ['reforma', 'manutenção', 'manutencao'],
  'Móveis e Decoração': ['móveis', 'moveis'],
  'Eletrodomésticos': ['eletrodomestico'],
  'Farmácia': ['farmacia', 'farmácia', 'remedio', 'remédio'],
  'Consultas': ['médico', 'medico', 'consulta', 'hospital', 'clinica', 'clínica'],
  'Dentista': ['dentista'],
  'Exames': ['exame'],
  'Plano de Saúde': ['plano de saude', 'unimed', 'amil', 'bradesco saude'],
  'Academia': ['academia', 'gym'],
  'Mensalidade': ['escola', 'faculdade', 'colegio', 'colégio', 'creche', 'mensalidade'],
  'Cursos': ['curso', 'aula', 'treinamento', 'certificado'],
  'Livros e Material': ['livro', 'material escolar', 'uniforme'],
  'Eventos e Passeios': ['cinema', 'teatro', 'show', 'ingresso', 'passeio', 'parque', 'museu'],
  'Viagens': ['viagem', 'hotel', 'airbnb'],
  'Jogos': ['jogo'],
  'Esportes e Hobbies': ['esporte', 'hobby'],
  'Software e Apps': ['apple', 'google', 'adobe', 'microsoft', 'office', 'assinatura', 'plano'],
  'Roupas e Calçados': [
    'roupa', 'calçado', 'sapato', 'tenis', 'tênis', 'camisa', 'calça', 'vestido', 'moda', 'zara', 'renner', 'c&a',
    'riachuelo',
  ],
  'Acessórios': ['acessório', 'acessorio', 'bolsa'],
  'Empréstimos': ['emprestimo', 'empréstimo', 'financiamento', 'parcela'],
  'Tarifas Bancárias': ['banco', 'tarifa'],
  'Seguros Pessoais': ['seguro'],
};

/** A subcategoria que a descrição sugere, ou nulo quando nenhuma palavra casa: aí quem escolhe é o usuário. */
export function inferCategory(description: string): string | null {
  if (!description) return null;
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}
