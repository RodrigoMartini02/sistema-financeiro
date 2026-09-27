import { apiRequest, getActiveAccountId } from './apiClient';
import type { ClassificacaoFixa, ClassificacaoReceita, ClassificacaoReceitaFormValues } from '../types/config';

// Toda chamada leva a conta: o catálogo é o da conta (padrão do tipo dela +
// criadas nela) e o servidor valida que ela pertence a quem pede.
function contaQuery(accountId?: number | null): string {
  const id = accountId ?? getActiveAccountId();
  return id ? `?conta_id=${id}` : '';
}

export async function fetchClassificacoesReceita(accountId?: number | null): Promise<ClassificacaoReceita[]> {
  return apiRequest<ClassificacaoReceita[]>(`/income-classifications${contaQuery(accountId)}`);
}

export async function saveClassificacaoReceita(
  values: ClassificacaoReceitaFormValues,
  id?: number,
  accountId?: number | null,
): Promise<ClassificacaoReceita> {
  if (id) {
    return apiRequest<ClassificacaoReceita>(`/income-classifications/${id}${contaQuery(accountId)}`, {
      method: 'PUT',
      body: JSON.stringify({ nome: values.nome.trim() }),
    });
  }
  return apiRequest<ClassificacaoReceita>('/income-classifications', {
    method: 'POST',
    body: JSON.stringify({
      nome: values.nome.trim(),
      parent_id: values.parent_id ?? null,
      conta_id: accountId ?? getActiveAccountId(),
    }),
  });
}

/** Liga/altera a fixa desta conta; `null` desliga. */
export async function saveClassificacaoReceitaFixa(
  id: number,
  fixa: ClassificacaoFixa | null,
  accountId?: number | null,
): Promise<ClassificacaoReceita> {
  return apiRequest<ClassificacaoReceita>(`/income-classifications/${id}/fixa${contaQuery(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify(fixa ? { fixa: true, ...fixa } : { fixa: false }),
  });
}

export async function toggleClassificacaoReceita(id: number, accountId?: number | null): Promise<void> {
  return apiRequest<void>(`/income-classifications/${id}/toggle-active${contaQuery(accountId)}`, { method: 'PATCH' });
}
