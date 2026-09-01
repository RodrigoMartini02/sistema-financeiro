import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Perfil } from '../types/config';
import { fetchPerfis } from '../services/configService';
import { queryKeys } from '../services/queryKeys';

interface UseActiveProfileOptions {
  enabled?: boolean;
}

export function useActiveProfile({ enabled = true }: UseActiveProfileOptions = {}) {
  const perfis = useQuery({
    queryKey: queryKeys.perfis,
    queryFn: fetchPerfis,
    enabled,
  });
  const data = perfis.data ?? [];
  const activeId = localStorage.getItem('perfilAtivoId');
  const activePerfil = data.find((p) => String(p.id) === activeId) ?? data[0];

  useEffect(() => {
    if (!enabled || !activePerfil) return;

    if (String(activePerfil.id) !== activeId) {
      localStorage.setItem('perfilAtivoId', String(activePerfil.id));
      localStorage.setItem('perfilAtivoNome', activePerfil.nome);
      localStorage.setItem('perfilAtivoTipo', activePerfil.tipo);
      window.location.reload();
      return;
    }

    if (localStorage.getItem('perfilAtivoTipo') !== activePerfil.tipo) {
      localStorage.setItem('perfilAtivoTipo', activePerfil.tipo);
    }
  }, [enabled, activeId, activePerfil]);

  const select = (p: Perfil) => {
    if (String(p.id) === activeId) return;
    localStorage.setItem('perfilAtivoId', String(p.id));
    localStorage.setItem('perfilAtivoNome', p.nome);
    localStorage.setItem('perfilAtivoTipo', p.tipo);
    window.location.reload();
  };

  return { perfis: data, activeId, activePerfil, select };
}
