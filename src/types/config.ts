export interface Categoria {
  id: number;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  forma_favorita?: string | null;
  cartao_favorito_id?: number | null;
  cartao_favorito_nome?: string | null;
  parent_id?: number | null;
  tipo?: 'pessoal' | 'empresa' | null;
  conta_id?: number | null;
  ativo: boolean;
  data_criacao: string;
  subcategorias?: Categoria[];
}

export interface CategoriaFormValues {
  nome: string;
  parent_id?: number | null;
}

/** O mínimo que um item de catálogo em árvore precisa para virar opção de seleção. */
export interface OpcaoCatalogo {
  id: number;
  nome: string;
  parent_id?: number | null;
  ativo: boolean;
}

/** Classificação fixa nesta conta: valor e dia do recebimento, com ou sem lançamento automático. */
export interface ClassificacaoFixa {
  valor: number;
  dia_recebimento: number;
  lancar_automatico: boolean;
}

/** Classificação de receita: catálogo em árvore no mesmo molde das categorias de despesa. */
export interface ClassificacaoReceita {
  id: number;
  nome: string;
  parent_id: number | null;
  /** Preenchido nas padrão do sistema (globais por tipo de conta). */
  tipo: 'pessoal' | 'empresa' | null;
  /** Preenchido nas criadas pelo usuário (exclusivas da conta). */
  conta_id: number | null;
  ativo: boolean;
  data_criacao: string;
  /** Configuração de fixa da conta consultada; null quando não é fixa. */
  fixa: ClassificacaoFixa | null;
  /** Usada por contrato ativo da conta: o contrato já lança, então não liga o automático. */
  em_contrato_ativo: boolean;
  subcategorias?: ClassificacaoReceita[];
}

export type ClassificacaoReceitaFormValues = CategoriaFormValues;

export type CartaoTipo = 'credito' | 'debito' | 'ambos';

export interface Cartao {
  id: number;
  nome: string;
  limite?: number | null;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
  cor?: string | null;
  ativo: boolean;
  numero_cartao?: string | null;
  validade?: string | null;
  conta_id?: number | null;
  tipo?: CartaoTipo | null;
}

export interface CartaoFormValues {
  nome: string;
  limite?: number;
  dia_fechamento?: number;
  dia_vencimento?: number;
  cor?: string;
  numero_cartao?: string;
  validade?: string;
  tipo?: CartaoTipo;
  /** Soft delete: o PUT aceita este campo (backend/src/routes/cards.ts). */
  ativo?: boolean;
}

export type Enquadramento = 'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA';

export interface Conta {
  id: number;
  usuario_id: number;
  tipo: 'pessoal' | 'empresa';
  nome: string;
  documento?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  enquadramento?: Enquadramento | null;
  data_abertura?: string | null;
  eh_padrao: boolean;
  ativo: boolean;
  data_criacao?: string;
}
