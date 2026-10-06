import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDomainLists } from '../services/overviewService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { DomainLists } from '../types';

/** Modalidades, UFs e municípios com edital aberto (a API guarda os municípios por 10 min). */
export function useDomainLists() {
  return useQuery<DomainLists, TendersApiError>({
    queryKey: tendersQueryKeys.domains,
    queryFn: fetchDomainLists,
    staleTime: 10 * 60 * 1000,
  });
}

export interface DomainLookups {
  /** "Campinas/SP"; município fora da lista, undefined. */
  municipalityName: (code: string) => string | undefined;
  modalityName: (id: number) => string | undefined;
}

/** Nomes de município e modalidade para chips e resumos. */
export function useDomainLookups(): DomainLookups {
  const { data } = useDomainLists();
  return useMemo(() => {
    const municipalities = new Map((data?.municipalities ?? []).map((item) => [item.code, `${item.name}/${item.state}`]));
    const modalities = new Map((data?.modalities ?? []).map((item) => [item.id, item.name]));
    return {
      municipalityName: (code: string) => municipalities.get(code),
      modalityName: (id: number) => modalities.get(id),
    };
  }, [data]);
}
