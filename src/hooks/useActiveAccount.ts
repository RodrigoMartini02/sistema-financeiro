import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Conta } from '../types/config';
import { fetchContas } from '../services/configService';
import { queryKeys } from '../services/queryKeys';
import { usePlanFeatures } from './usePlanFeatures';

interface UseActiveAccountOptions {
  enabled?: boolean;
}

/**
 * No Starter só a Conta Padrão é usada (a API recusa as outras): as demais
 * nem entram no seletor. Sem Conta Padrão na lista, segue a lista inteira.
 */
export function accountsAllowedByPlan(contas: Conta[], premium: boolean): Conta[] {
  if (premium) {
    return contas;
  }

  const defaultAccounts = contas.filter((c) => c.eh_padrao);
  return defaultAccounts.length > 0 ? defaultAccounts : contas;
}

export function useActiveAccount({ enabled = true }: UseActiveAccountOptions = {}) {
  const { premium } = usePlanFeatures({ enabled });
  const contas = useQuery({
    queryKey: queryKeys.contas,
    queryFn: () => fetchContas(),
    enabled,
  });
  const data = accountsAllowedByPlan(contas.data ?? [], premium);
  const activeId = localStorage.getItem('contaAtivaId');
  const activeAccount = data.find((c) => String(c.id) === activeId) ?? data[0];

  useEffect(() => {
    if (!enabled) return;
    if (!activeAccount) return;

    if (String(activeAccount.id) !== activeId) {
      localStorage.setItem('contaAtivaId', String(activeAccount.id));
      localStorage.setItem('contaAtivaNome', activeAccount.nome);
      localStorage.setItem('contaAtivaTipo', activeAccount.tipo);
      window.location.reload();
      return;
    }

    if (localStorage.getItem('contaAtivaTipo') !== activeAccount.tipo) {
      localStorage.setItem('contaAtivaTipo', activeAccount.tipo);
    }
  }, [enabled, activeId, activeAccount]);

  const select = (c: Conta) => {
    if (String(c.id) === activeId) return;
    localStorage.setItem('contaAtivaId', String(c.id));
    localStorage.setItem('contaAtivaNome', c.nome);
    localStorage.setItem('contaAtivaTipo', c.tipo);
    window.location.reload();
  };

  // true no ciclo de render em que o efeito acima ainda vai gravar
  // contaAtivaId e recarregar a página — quem consome este hook para decidir
  // "a conta ativa já está estável" deve tratar isso como não resolvido
  // ainda, senão dispara buscas com o localStorage prestes a mudar.
  const willReloadForAccountSwitch = !!activeAccount && String(activeAccount.id) !== activeId;

  return { contas: data, activeId, activeAccount, select, isLoading: contas.isLoading, willReloadForAccountSwitch };
}
