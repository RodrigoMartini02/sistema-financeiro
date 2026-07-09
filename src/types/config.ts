export interface Categoria {
  id: number;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  forma_favorita?: string | null;
  cartao_favorito_id?: number | null;
  cartao_favorito_nome?: string | null;
  parent_id?: number | null;
  tipo_despesa?: 'opex' | 'capex' | null;
  ativo: boolean;
  data_criacao: string;
  subcategorias?: Categoria[];
}

export interface CategoriaFormValues {
  nome: string;
  cor?: string;
  icone?: string;
  forma_favorita?: string;
  parent_id?: number | null;
  tipo_despesa?: 'opex' | 'capex';
}

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
  perfil_id?: number | null;
}

export interface CartaoFormValues {
  nome: string;
  limite?: number;
  dia_fechamento?: number;
  dia_vencimento?: number;
  cor?: string;
  numero_cartao?: string;
  validade?: string;
}

export type Enquadramento = 'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA';

export interface Perfil {
  id: number;
  usuario_id: number;
  tipo: 'pessoal' | 'empresa';
  nome: string;
  documento?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  atividade?: string | null;
  enquadramento?: Enquadramento | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  email?: string | null;
  ativo: boolean;
  data_criacao?: string;
}
