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
  /** Categoria que o sistema usa nos lançamentos que gera (ex.: encargos da fatura): fora da escolha e da edição. */
  is_system?: boolean;
  /** Quem recebe lançamento é decidido pelo servidor (conta pessoal: só subcategoria). Ausente vale "recebe". */
  selectable?: boolean;
  data_criacao: string;
  subcategorias?: Categoria[];
}

export interface CategoriaFormValues {
  nome: string;
  parent_id?: number | null;
  /** Categoria nova em conta pessoal: as subcategorias que nascem junto, na mesma operação. */
  subcategories?: string[];
}

/** O que o servidor devolve ao criar: o item e, numa categoria nova, as subcategorias criadas junto. */
export type ComSubcategoriasCriadas<T> = T & { subcategories?: T[] };

/** O mínimo que um item de catálogo em árvore precisa para virar opção de seleção. */
export interface OpcaoCatalogo {
  id: number;
  nome: string;
  parent_id?: number | null;
  ativo: boolean;
  /** Ver `Categoria.selectable`. */
  selectable?: boolean;
  /** Ver `Categoria.is_system`. */
  is_system?: boolean;
}

/** Receita fixa de quem está logado, nesta conta: valor e dia do recebimento. Ligar grava o ano como previsto. */
export interface ClassificacaoFixa {
  valor: number;
  dia_recebimento: number;
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
  /** Ver `Categoria.selectable`. */
  selectable?: boolean;
  data_criacao: string;
  /** Receita fixa de quem consultou, nesta conta; null quando não é fixa. */
  fixa: ClassificacaoFixa | null;
  /** Usada por contrato ativo da conta: o contrato já lança, então não pode ser fixa. */
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
  /**
   * 'AAAA-MM': com o dia de vencimento mudando, as despesas não pagas no
   * crédito desse mês em diante passam para o dia novo (só no PUT).
   */
  vigente_desde?: string;
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
