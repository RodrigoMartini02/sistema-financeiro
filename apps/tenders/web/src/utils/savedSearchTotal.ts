import type { ContractSavedSearch } from '../types';
import { formatIsoDate } from './dates';

// O total "vigentes agora" de uma busca salva de contratos (plano
// .plans/licitacoes-contratos-no-r2.md): é contado no armazém ao salvar e na
// rotina diária, então a tela mostra o total gravado e a data da contagem.

export interface SavedSearchTotal {
  /** "1.234", ou "—" quando o total ainda não foi contado. */
  count: string;
  label: string;
  /** A data da contagem, ou o motivo de não haver total; null quando não há o que explicar. */
  note: string | null;
}

export function contractSavedSearchTotal(search: Pick<ContractSavedSearch, 'activeCount' | 'countedAt'>): SavedSearchTotal {
  if (search.activeCount === null) {
    return { count: '—', label: 'contratos vigentes', note: 'Ainda não contado: o total aparece depois da próxima atualização dos contratos.' };
  }
  return {
    count: search.activeCount.toLocaleString('pt-BR'),
    label: search.activeCount === 1 ? 'contrato vigente' : 'contratos vigentes',
    note: search.countedAt ? `Contados em ${formatIsoDate(search.countedAt)}` : null,
  };
}
