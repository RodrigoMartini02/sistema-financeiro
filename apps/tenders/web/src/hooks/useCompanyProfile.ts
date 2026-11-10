import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchCompany, lookupCompany, updateCompany } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { CompanyChange, CompanyUpdate } from '../types';

/**
 * Perfil da empresa (só o titular o lê). Busca de novo quando a seção abre, mas não ao voltar para a janela: o
 * formulário recomeça dos dados novos, e isso não deve acontecer no meio da digitação.
 */
export function useCompanyProfile() {
  return useQuery<CompanyChange, TendersApiError>({
    queryKey: tendersQueryKeys.company,
    queryFn: fetchCompany,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Salvar a edição e consultar o CNPJ da conta. As duas devolvem o perfil já gravado. O nome da conta, que o app mostra,
 * acompanha a razão social e o nome fantasia, então o acesso (que traz o nome da conta) é buscado de novo.
 */
export function useCompanyMutations() {
  const queryClient = useQueryClient();
  const store = (change: CompanyChange) => {
    queryClient.setQueryData(tendersQueryKeys.company, change);
    void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
  };

  const save = useMutation<CompanyChange, TendersApiError, CompanyUpdate>({
    mutationFn: updateCompany,
    onSuccess: store,
  });
  const lookup = useMutation<CompanyChange, TendersApiError, void>({
    mutationFn: lookupCompany,
    onSuccess: store,
  });

  return { save, lookup };
}
