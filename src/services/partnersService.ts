import { apiRequest } from './apiClient';

/** Sócio de uma conta PJ como o servidor devolve. Decimais chegam em texto ("60.00"). */
export interface AccountPartner {
  id: number;
  nome: string;
  percentual: string;
  /** Depois do lançamento, o valor atual da receita do capital. */
  capital_inicial: string;
  capital_lancado: boolean;
  /** Data da receita do capital (AAAA-MM-DD), quando já foi lançado. */
  capital_lancado_em: string | null;
}

/** Sócio no pedido de salvar a conta (campo `socios` de POST/PUT /contas). */
export interface AccountPartnerSaveValue {
  /** Ausente: sócio novo. */
  id?: number;
  nome: string;
  percentual: number;
  capital_inicial: number;
  lancar_como_receita: boolean;
}

/** Sócios ativos de uma conta do titular, para o modal da conta. A gravação vai junto com a conta. */
export async function fetchAccountPartners(accountId: number): Promise<AccountPartner[]> {
  return apiRequest<AccountPartner[]>(`/partners?conta_id=${accountId}`);
}
