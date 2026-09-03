import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCartoes, fetchCategorias } from '../services/configService';
import { fetchClientes } from '../services/clientesService';
import { fetchRepresentantes } from '../services/representantesService';
import { queryKeys } from '../services/queryKeys';
import type { ConfigItemId } from '../layout/ConfigPanel';
import { getFirstAccessGuideUserScope } from '../services/userScope';
import { useFirstAccessGuideCoordinator } from '../context/FirstAccessGuideContext';

export type OnboardingTarget = { kind: 'config'; item: ConfigItemId } | { kind: 'clientes' };

const STORAGE_PREFIX = 'fingerence:onboarding-checklist';

function isEmpresaConta() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('contaAtivaTipo') === 'empresa';
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
  target: OnboardingTarget;
}

export function useOnboardingChecklist(enabled: boolean) {
  const storageKey = useMemo(() => STORAGE_PREFIX + ':' + getFirstAccessGuideUserScope(), []);
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(storageKey));
  const isEmpresa = useMemo(() => isEmpresaConta(), []);
  const { isDemoMode, isSilencedAll, silenceAll } = useFirstAccessGuideCoordinator();

  const canQuery = enabled && !isDismissed && !isDemoMode && !isSilencedAll;
  const cartoesQuery = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes, enabled: canQuery });
  const categoriasQuery = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias, enabled: canQuery });
  const clientesQuery = useQuery({ queryKey: queryKeys.clientes, queryFn: fetchClientes, enabled: canQuery && isEmpresa });
  const representantesQuery = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes, enabled: canQuery && isEmpresa });

  useEffect(() => {
    setIsDismissed(readDismissed(storageKey));
  }, [storageKey]);

  const items = useMemo<OnboardingChecklistItem[]>(() => {
    const base: OnboardingChecklistItem[] = [
      {
        id: 'cartao',
        label: 'Cadastrar um cartão',
        description: 'Necessário para lançar despesas parceladas ou pagas no crédito/débito.',
        done: (cartoesQuery.data?.length ?? 0) > 0,
        target: { kind: 'config', item: 'cartoes' },
      },
      {
        id: 'categoria',
        label: 'Personalizar suas categorias',
        description: 'O sistema já vem com categorias padrão, mas você pode ajustá-las conforme sua rotina.',
        done: (categoriasQuery.data?.length ?? 0) > 0,
        target: { kind: 'config', item: 'categorias' },
      },
    ];

    if (isEmpresa) {
      base.push(
        {
          id: 'cliente',
          label: 'Cadastrar um cliente',
          description: 'Necessário para vincular receitas a contratos e faturamento.',
          done: (clientesQuery.data?.length ?? 0) > 0,
          target: { kind: 'clientes' },
        },
        {
          id: 'representante',
          label: 'Cadastrar um representante',
          description: 'Opcional — apenas se você calcula comissões automáticas por receita.',
          done: (representantesQuery.data?.length ?? 0) > 0,
          target: { kind: 'config', item: 'representantes' },
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
    isVisible: enabled && !isDismissed && !isDemoMode && !isSilencedAll,
    items,
    dismiss,
    silenceAll,
  };
}
