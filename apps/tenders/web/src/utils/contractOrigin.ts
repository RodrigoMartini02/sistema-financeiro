import type { ContractDetail } from '../types';

// O que o detalhe do contrato mostra a mais ou a menos conforme a origem (plano .plans/licitacoes-contratos-federais.md).
// O contrato federal vem do sistema de contratos do governo federal: não tem página pública do documento, não informa
// aditivos, e o vencimento dele pode estar sem o último aditivo. A regra fica aqui, num lugar só, para a tela só
// escolher o que mostrar.

export const FEDERAL_EXPIRY_NOTICE = 'O vencimento vem do sistema de contratos do governo federal e pode não incluir aditivos recentes.';
export const FEDERAL_AMENDMENTS_NOTICE = 'O sistema de contratos do governo federal não informa aditivos nem rescisões deste contrato.';

export interface ContractOriginView {
  /** Endereço do documento original; sem ele, a tela não mostra o botão. */
  documentLink: string | null;
  /** O número de controle só identifica o contrato na base nacional; no federal é um identificador interno. */
  showControlNumber: boolean;
  /** Aviso junto do vencimento; null quando o vencimento já considera os aditivos. */
  expiryNotice: string | null;
  /** Texto no lugar da lista de aditivos, quando a origem não os informa. */
  amendmentsNotice: string | null;
}

export function contractOriginView(contract: Pick<ContractDetail, 'origin' | 'pncpLink'>): ContractOriginView {
  const federal = contract.origin === 'FEDERAL';
  return {
    documentLink: contract.pncpLink,
    showControlNumber: !federal,
    expiryNotice: federal ? FEDERAL_EXPIRY_NOTICE : null,
    amendmentsNotice: federal ? FEDERAL_AMENDMENTS_NOTICE : null,
  };
}
