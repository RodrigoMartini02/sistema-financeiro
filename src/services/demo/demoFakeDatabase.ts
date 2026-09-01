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
  cliente: string | null;
  tipo_receita: string | null;
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
  valor_final: number;
  numero_nf: string | null;
  data_emissao_nf: string | null;
  tipo_despesa: string | null;
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
  perfil_id: number | null;
  tipo: 'credito' | 'debito' | 'ambos' | null;
}

export interface ReservaDemo {
  id: number;
  observacoes: string;
  valor: number;
  data: string;
  mes: number;
  ano: number;
  tipo_reserva: 'normal' | 'objetivo';
  objetivo_valor: number | null;
  objetivo_atingido: boolean;
  data_objetivo: string | null;
  cor: string | null;
  icone: string | null;
  perfil_id: number | null;
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

function createSeed() {
  const { mes, ano } = currentMonthYear();

  const categorias: CategoriaDemo[] = [
    { id: 1, nome: 'Moradia', cor: '#18BFD8', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 2, nome: 'Alimentação', cor: '#8B7CF6', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 3, nome: 'Transporte', cor: '#F6A623', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 4, nome: 'Lazer', cor: '#EF6464', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
    { id: 5, nome: 'Outros', cor: '#26C281', icone: null, forma_favorita: null, cartao_favorito_id: null, cartao_favorito_nome: null, parent_id: null, tipo_despesa: null, ativo: true, data_criacao: todayIso(-90) },
  ];

  const cartoes: CartaoDemo[] = [
    { id: 1, nome: 'Cartão principal', limite: 5000, dia_fechamento: 20, dia_vencimento: 28, cor: '#0EC4D8', ativo: true, numero_cartao: null, validade: null, perfil_id: null, tipo: 'credito' },
  ];

  const receitas: RawIncomeDemo[] = [
    {
      id: generateId(), descricao: 'Salário', valor: 4500, data_recebimento: todayIso(-3), mes, ano,
      status: 'ativa', contrato_id: null, observacoes: null, cliente: null, tipo_receita: null,
      representante_id: null, representante_nome: null, valor_comissao: null, anexos: null,
    },
  ];

  const despesas: RawExpenseDemo[] = [
    {
      id: generateId(), descricao: 'Aluguel', categoria_nome: 'Moradia', categoria_id: 1,
      forma_pagamento: 'pix', cartao_id: null, data_vencimento: todayIso(-2), data_compra: null,
      data_pagamento: todayIso(-2), mes, ano, status: 'ativa', pago: true, parcelado: false,
      recorrente: false, numero_parcelas: null, parcela_atual: null, observacoes: null,
      valor_original: 1200, valor_final: 1200, numero_nf: null, data_emissao_nf: null,
      tipo_despesa: null, anexos: null,
    },
  ];

  const reservas: ReservaDemo[] = [
    {
      id: generateId(), observacoes: 'Viagem de férias', valor: 900, data: todayIso(-10), mes, ano,
      tipo_reserva: 'objetivo', objetivo_valor: 3000, objetivo_atingido: false, data_objetivo: null,
      cor: '#0EC4D8', icone: null, perfil_id: null,
    },
  ];

  return { categorias, cartoes, receitas, despesas, reservas };
}

export interface DemoFakeDatabase {
  categorias: CategoriaDemo[];
  cartoes: CartaoDemo[];
  receitas: RawIncomeDemo[];
  despesas: RawExpenseDemo[];
  reservas: ReservaDemo[];
}

export function createDemoFakeDatabase(): DemoFakeDatabase {
  return createSeed();
}

export { generateId, todayIso, currentMonthYear };
