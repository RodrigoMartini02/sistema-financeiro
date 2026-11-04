import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCartoes, fetchCategorias } from '../services/configService';
import { getActiveAccountId } from '../services/apiClient';
import { fetchClients, type ClientFilters } from '../services/clientsService';
import { fetchRepresentantes } from '../services/representantesService';
import { queryKeys } from '../services/queryKeys';
import type { ConfigItemId } from '../layout/ConfigPanel';
import { getFirstAccessGuideUserScope } from '../services/userScope';
import { useFirstAccessGuideCoordinator } from '../context/FirstAccessGuideContext';
import { usePlanFeatures } from './usePlanFeatures';

export type OnboardingTarget = { kind: 'config'; item: ConfigItemId } | { kind: 'clientes' };

const STORAGE_PREFIX = 'fingerence:onboarding-checklist';
/** A mesma lista da tela de Clientes (ativos): o cache é o mesmo. */
const ACTIVE_CLIENTS: ClientFilters = { search: '', type: null, status: 'active' };

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
  // Clientes são do Premium: no Starter, o passo nem aparece.
  const { premium } = usePlanFeatures({ enabled });
  const includesClients = isEmpresa && premium;
  const cartoesQuery = useQuery({ queryKey: queryKeys.cartoes(), queryFn: () => fetchCartoes(), enabled: canQuery });
  const accountId = getActiveAccountId();
  const categoriasQuery = useQuery({ queryKey: queryKeys.categorias(accountId), queryFn: () => fetchCategorias(accountId), enabled: canQuery });
  const clientesQuery = useQuery({
    queryKey: queryKeys.clients(accountId, ACTIVE_CLIENTS),
    queryFn: () => fetchClients(accountId!, ACTIVE_CLIENTS),
    enabled: canQuery && includesClients && accountId !== null,
  });
  const representantesQuery = useQuery({ queryKey: queryKeys.representantes, queryFn: () => fetchRepresentantes(), enabled: canQuery && isEmpresa });

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

    if (includesClients) {
      base.push({
        id: 'cliente',
        label: 'Cadastrar um cliente',
        description: 'Necessário para os contratos e para ligar as receitas a quem pagou.',
        done: (clientesQuery.data?.length ?? 0) > 0,
        target: { kind: 'clientes' },
      });
    }

    if (isEmpresa) {
      base.push({
        id: 'representante',
        label: 'Cadastrar um representante',
        description: 'Opcional — apenas se você calcula comissões automáticas por receita.',
        done: (representantesQuery.data?.length ?? 0) > 0,
        target: { kind: 'config', item: 'representantes' },
      });
    }

    return base;
  }, [isEmpresa, includesClients, cartoesQuery.data, categoriasQuery.data, clientesQuery.data, representantesQuery.data]);

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
