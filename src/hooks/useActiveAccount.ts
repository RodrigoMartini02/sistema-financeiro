import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Conta } from '../types/config';
import { fetchContas } from '../services/configService';
import { queryKeys } from '../services/queryKeys';

interface UseActiveAccountOptions {
  enabled?: boolean;
}

export function useActiveAccount({ enabled = true }: UseActiveAccountOptions = {}) {
  const contas = useQuery({
    queryKey: queryKeys.contas,
    queryFn: () => fetchContas(),
    enabled,
  });
  const data = contas.data ?? [];
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

  return { contas: data, activeId, activeAccount, select };
}
