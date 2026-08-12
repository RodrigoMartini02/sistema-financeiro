import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCartoes, fetchCategorias } from '../services/configService';
import { fetchClientes } from '../services/clientesService';
import { fetchRepresentantes } from '../services/representantesService';
import { queryKeys } from '../services/queryKeys';
import type { ConfigTab } from '../layout/AppShell';
import { getFirstAccessGuideUserScope, isFirstAccessGuidesSessionActive } from '../services/firstAccessGuides';

const STORAGE_PREFIX = 'fingerence:onboarding-checklist';

function isEmpresaPerfil() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('perfilAtivoTipo') === 'empresa';
  } catch {
    return false;
  }
}

function readDismissed(key: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(key) === 'dismissed';
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, 'dismissed');
  } catch {
    return;
  }
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  targetTab: ConfigTab;
}

export function useOnboardingChecklist(enabled: boolean) {
  const storageKey = useMemo(() => STORAGE_PREFIX + ':' + getFirstAccessGuideUserScope(), []);
  const [isFirstAccessActive, setIsFirstAccessActive] = useState(() => isFirstAccessGuidesSessionActive());
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(storageKey));
  const isEmpresa = useMemo(() => isEmpresaPerfil(), []);

  const canQuery = enabled && isFirstAccessActive && !isDismissed;
  const cartoesQuery = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes, enabled: canQuery });
  const categoriasQuery = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias, enabled: canQuery });
  const clientesQuery = useQuery({ queryKey: queryKeys.clientes, queryFn: fetchClientes, enabled: canQuery && isEmpresa });
  const representantesQuery = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes, enabled: canQuery && isEmpresa });

  useEffect(() => {
    setIsFirstAccessActive(isFirstAccessGuidesSessionActive());
    setIsDismissed(readDismissed(storageKey));
  }, [storageKey]);

  const items = useMemo<OnboardingChecklistItem[]>(() => {
    const base: OnboardingChecklistItem[] = [
      {
        id: 'cartao',
        label: 'Cadastrar um cartão',
        description: 'Necessário para lançar despesas parceladas ou pagas no crédito/débito.',
        done: (cartoesQuery.data?.length ?? 0) > 0,
        targetTab: 'cartoes',
      },
      {
        id: 'categoria',
        label: 'Personalizar suas categorias',
        description: 'O sistema já vem com categorias padrão, mas você pode ajustá-las conforme sua rotina.',
        done: (categoriasQuery.data?.length ?? 0) > 0,
        targetTab: 'categorias',
      },
    ];

    if (isEmpresa) {
      base.push(
        {
          id: 'cliente',
          label: 'Cadastrar um cliente',
          description: 'Necessário para vincular receitas a contratos e faturamento.',
          done: (clientesQuery.data?.length ?? 0) > 0,
          targetTab: 'clientes',
        },
        {
          id: 'representante',
          label: 'Cadastrar um representante',
          description: 'Opcional — apenas se você calcula comissões automáticas por receita.',
          done: (representantesQuery.data?.length ?? 0) > 0,
          targetTab: 'representantes',
        },
      );
    }

    return base;
  }, [isEmpresa, cartoesQuery.data, categoriasQuery.data, clientesQuery.data, representantesQuery.data]);

  const dismiss = useCallback(() => {
    writeDismissed(storageKey);
    setIsDismissed(true);
  }, [storageKey]);

  return {
    isVisible: enabled && isFirstAccessActive && !isDismissed,
    items,
    dismiss,
  };
}
