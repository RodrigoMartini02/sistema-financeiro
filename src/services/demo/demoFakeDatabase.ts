import { daysAgoLocalIso } from '../../utils/date';

export interface RawIncomeDemo {
  id: number;
  descricao: string;
  valor: number;
  data_recebimento: string;
  mes: number;
  ano: number;
  status: string;
  contrato_id: number | null;
  observacoes: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  classificacao_id: number | null;
  classificacao_nome: string | null;
  representante_id: number | null;
  representante_nome: string | null;
  valor_comissao: number | null;
  anexos: null;
}

export interface RawExpenseDemo {
  id: number;
  descricao: string;
  categoria_nome: string | null;
  categoria_id: number | null;
  forma_pagamento: string;
  cartao_id: number | null;
  cartao_nome?: string | null;
  data_vencimento: string;
  data_compra: string | null;
  data_pagamento: string | null;
  mes: number;
  ano: number;
  status: string;
  pago: boolean;
  parcelado: boolean;
  recorrente: boolean;
  numero_parcelas: number | null;
  parcela_atual: number | null;
  observacoes: string | null;
  valor_original: number | null;
  numero_nf: string | null;
  data_emissao_nf: string | null;
  anexos: null;
}

export interface CategoriaDemo {
  id: number;
  nome: string;
  cor: string | null;
  icone: string | null;
  forma_favorita: string | null;
  cartao_favorito_id: number | null;
  cartao_favorito_nome: string | null;
  parent_id: number | null;
  tipo_despesa: null;
  ativo: boolean;
  data_criacao: string;
}

export interface CartaoDemo {
  id: number;
  nome: string;
  limite: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  cor: string | null;
  ativo: boolean;
  numero_cartao: string | null;
  validade: string | null;
  conta_id: number | null;
  tipo: 'credito' | 'debito' | 'ambos' | null;
}

let nextId = 1000;
function generateId(): number {
  nextId += 1;
  return nextId;
}

function todayIso(offsetDays = 0): string {
  return daysAgoLocalIso(-offsetDays);
}

function currentMonthYear() {
  const now = new Date();
  return { mes: now.getMonth(), ano: now.getFullYear() };
}

/**
 * Dias do mês corrente para o exemplo: o que já aconteceu fica antes de hoje e
 * o que vence fica depois, sempre dentro do mês (vale em qualquer dia).
 */
function monthDays(mes: number, ano: number) {
  const today = new Date().getDate();
  const lastDay = new Date(ano, mes + 1, 0).getDate();
  const iso = (day: number) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    past: (daysBefore: number) => iso(Math.max(1, today - daysBefore)),
    upcoming: (daysAfter: number) => iso(Math.min(lastDay, today + daysAfter)),
  };
}

interface DemoExpenseInput {
  descricao: string;
  categoriaId: number;
  formaPagamento: 'pix' | 'debito' | 'credito';
  valor: number;
  vencimento: string;
  pago: boolean;
  recorrente?: boolean;
  parcelas?: { atual: number; total: number };
}

function createSeed() {
  const { mes, ano } = currentMonthYear();
  const days = monthDays(mes, ano);

  const categorias: CategoriaDemo[] = [
    { id: 1, nome: 'Moradia', cor: '#18BFD8', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 2, nome: 'Alimentação', cor: '#8B7CF6', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 3, nome: 'Transporte', cor: '#F6A623', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 4, nome: 'Lazer', cor: '#EF6464', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 5, nome: 'Outros', cor: '#26C281', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
  ];

  const cartoes: CartaoDemo[] = [
    { id: 1, nome: 'Cartão principal', limite: 5000, dia_fechamento: 20, dia_vencimento: 28, cor: '#0EC4D8', ativo: true, numero_cartao: null, validade: null, conta_id: null, tipo: 'credito' },
  ];

  const income = (descricao: string, valor: number, dataRecebimento: string): RawIncomeDemo => ({
    id: generateId(), descricao, valor, data_recebimento: dataRecebimento, mes, ano,
    status: 'ativa', contrato_id: null, observacoes: null, cliente_id: null, cliente_nome: null, classificacao_id: null, classificacao_nome: null,
    representante_id: null, representante_nome: null, valor_comissao: null, anexos: null,
  });

  const receitas: RawIncomeDemo[] = [
    income('Salário', 4500, days.past(5)),
    income('Projeto freelance', 1800, days.past(1)),
  ];

  const expense = (input: DemoExpenseInput): RawExpenseDemo => {
    const categoria = categorias.find((item) => item.id === input.categoriaId);
    const onCard = input.formaPagamento === 'credito';
    return {
      id: generateId(), descricao: input.descricao, categoria_nome: categoria?.nome ?? null, categoria_id: input.categoriaId,
      forma_pagamento: input.formaPagamento, cartao_id: onCard ? 1 : null, cartao_nome: onCard ? 'Cartão principal' : null,
      data_vencimento: input.vencimento, data_compra: onCard ? input.vencimento : null,
      data_pagamento: input.pago ? input.vencimento : null, mes, ano, status: 'ativa', pago: input.pago,
      parcelado: Boolean(input.parcelas), recorrente: input.recorrente ?? false,
      numero_parcelas: input.parcelas?.total ?? null, parcela_atual: input.parcelas?.atual ?? null, observacoes: null,
      valor_original: input.valor, numero_nf: null, data_emissao_nf: null,
      anexos: null,
    };
  };

  // Um mês fictício: o que mostra a demonstração e as telas do site.
  const despesas: RawExpenseDemo[] = [
    expense({ descricao: 'Aluguel', categoriaId: 1, formaPagamento: 'pix', valor: 1200, vencimento: days.past(4), pago: true }),
    expense({ descricao: 'Supermercado', categoriaId: 2, formaPagamento: 'debito', valor: 642.3, vencimento: days.past(2), pago: true }),
    expense({ descricao: 'Farmácia', categoriaId: 5, formaPagamento: 'pix', valor: 74.2, vencimento: days.past(3), pago: true }),
    expense({ descricao: 'Restaurante', categoriaId: 2, formaPagamento: 'credito', valor: 186.4, vencimento: days.past(1), pago: false }),
    expense({ descricao: 'Combustível', categoriaId: 3, formaPagamento: 'credito', valor: 280, vencimento: days.past(2), pago: false }),
    expense({ descricao: 'Academia', categoriaId: 4, formaPagamento: 'credito', valor: 99.9, vencimento: days.upcoming(3), pago: false, recorrente: true }),
    expense({ descricao: 'Streaming', categoriaId: 4, formaPagamento: 'credito', valor: 55.9, vencimento: days.upcoming(6), pago: false, recorrente: true }),
    expense({ descricao: 'Notebook', categoriaId: 5, formaPagamento: 'credito', valor: 389.9, vencimento: days.upcoming(8), pago: false, parcelas: { atual: 2, total: 10 } }),
    expense({ descricao: 'Internet e telefone', categoriaId: 1, formaPagamento: 'pix', valor: 149.9, vencimento: days.upcoming(5), pago: false }),
    expense({ descricao: 'Conta de luz', categoriaId: 1, formaPagamento: 'pix', valor: 218.35, vencimento: days.upcoming(9), pago: false }),
  ];

  return { categorias, cartoes, receitas, despesas };
}

export interface DemoFakeDatabase {
  categorias: CategoriaDemo[];
  cartoes: CartaoDemo[];
  receitas: RawIncomeDemo[];
  despesas: RawExpenseDemo[];
}

export function createDemoFakeDatabase(): DemoFakeDatabase {
  return createSeed();
}

export { generateId, todayIso };
