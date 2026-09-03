import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type FirstAccessGuideLayer = 'page' | 'modal';

export const GUIDE_LAYER_PAGE: FirstAccessGuideLayer = 'page';
export const GUIDE_LAYER_MODAL: FirstAccessGuideLayer = 'modal';

const SILENCE_ALL_STORAGE_KEY = 'fingerence:first-access-guide:silenced-all';

function readSilencedAll(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SILENCE_ALL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSilencedAll() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SILENCE_ALL_STORAGE_KEY, 'true');
  } catch {
    return;
  }
}

const MODULE_PRIORITY: Record<string, number> = {
  cartoes: 1,
  categorias: 1,
  perfis: 1,
  contas: 1,
  clientes: 1,
  representantes: 1,
  socios: 1,
  servicos: 1,
  usuarios: 2,
  despesas: 3,
  receitas: 3,
  reservas: 3,
  painel: 4,
  meses: 4,
  planos: 4,
  relatorios: 5,
};

const DEFAULT_PRIORITY = 3;
const LAYER_PRIORITY: Record<FirstAccessGuideLayer, number> = {
  [GUIDE_LAYER_PAGE]: 1,
  [GUIDE_LAYER_MODAL]: 2,
};

function priorityForScope(scope: string): number {
  const [module] = scope.split(':');
  return MODULE_PRIORITY[module] ?? DEFAULT_PRIORITY;
}

function makeRegistrationKey(scope: string, layer: FirstAccessGuideLayer): string {
  return `${layer}::${scope}`;
}

function parseRegistrationKey(key: string): { layer: FirstAccessGuideLayer; scope: string } {
  const separator = key.indexOf('::');
  if (separator === -1) {
    return { layer: GUIDE_LAYER_PAGE, scope: key };
  }
  return {
    layer: key.slice(0, separator) as FirstAccessGuideLayer,
    scope: key.slice(separator + 2),
  };
}

interface FirstAccessGuideContextValue {
  register: (scope: string, layer?: FirstAccessGuideLayer) => void;
  unregister: (scope: string, layer?: FirstAccessGuideLayer) => void;
  registerSurface: (layer: FirstAccessGuideLayer) => void;
  unregisterSurface: (layer: FirstAccessGuideLayer) => void;
  isActive: (scope: string, layer?: FirstAccessGuideLayer) => boolean;
  isDemoMode: boolean;
  isSilencedAll: boolean;
  silenceAll: () => void;
}

const FirstAccessGuideContext = createContext<FirstAccessGuideContextValue | null>(null);

interface FirstAccessGuideProviderProps {
  children: ReactNode;
  isDemoMode?: boolean;
}

export function FirstAccessGuideProvider({ children, isDemoMode = false }: FirstAccessGuideProviderProps) {
  const [eligible, setEligible] = useState<Set<string>>(new Set());
  const [activeSurfaces, setActiveSurfaces] = useState<Set<FirstAccessGuideLayer>>(new Set([GUIDE_LAYER_PAGE]));
  const [isSilencedAll, setIsSilencedAll] = useState(() => readSilencedAll());
  const countsRef = useRef<Map<string, number>>(new Map());
  const surfaceCountsRef = useRef<Map<FirstAccessGuideLayer, number>>(new Map([[GUIDE_LAYER_PAGE, 1]]));

  const silenceAll = useCallback(() => {
    writeSilencedAll();
    setIsSilencedAll(true);
  }, []);

  const register = useCallback((scope: string, layer: FirstAccessGuideLayer = GUIDE_LAYER_PAGE) => {
    const key = makeRegistrationKey(scope, layer);
    const counts = countsRef.current;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    setEligible((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const unregister = useCallback((scope: string, layer: FirstAccessGuideLayer = GUIDE_LAYER_PAGE) => {
    const key = makeRegistrationKey(scope, layer);
    const counts = countsRef.current;
    const next = (counts.get(key) ?? 1) - 1;

    if (next <= 0) {
      counts.delete(key);
      setEligible((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const copy = new Set(prev);
        copy.delete(key);
        return copy;
      });
      return;
    }

    counts.set(key, next);
  }, []);

  const registerSurface = useCallback((layer: FirstAccessGuideLayer) => {
    const counts = surfaceCountsRef.current;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
    setActiveSurfaces((prev) => (prev.has(layer) ? prev : new Set(prev).add(layer)));
  }, []);

  const unregisterSurface = useCallback((layer: FirstAccessGuideLayer) => {
    const counts = surfaceCountsRef.current;
    const next = (counts.get(layer) ?? 1) - 1;

    if (next <= 0) {
      counts.delete(layer);
      setActiveSurfaces((prev) => {
        if (!prev.has(layer)) {
          return prev;
        }
        const copy = new Set(prev);
        copy.delete(layer);
        return copy;
      });
      return;
    }

    counts.set(layer, next);
  }, []);

  const activeLayer = useMemo(() => {
    let best: FirstAccessGuideLayer = GUIDE_LAYER_PAGE;
    let bestPriority = LAYER_PRIORITY[best];

    for (const layer of activeSurfaces) {
      const priority = LAYER_PRIORITY[layer];
      if (priority > bestPriority) {
        bestPriority = priority;
        best = layer;
      }
    }

    return best;
  }, [activeSurfaces]);

  const activeScope = useMemo(() => {
    let best: string | undefined;
    let bestPriority = Infinity;

    for (const key of eligible) {
      const { layer, scope } = parseRegistrationKey(key);
      if (layer !== activeLayer) {
        continue;
      }

      const priority = priorityForScope(scope);
      if (priority < bestPriority) {
        bestPriority = priority;
        best = scope;
      }
    }

    return best;
  }, [activeLayer, eligible]);

  const isActive = useCallback(
    (scope: string, layer: FirstAccessGuideLayer = GUIDE_LAYER_PAGE) =>
      !isDemoMode && !isSilencedAll && layer === activeLayer && scope === activeScope,
    [isDemoMode, isSilencedAll, activeLayer, activeScope],
  );

  const value = useMemo(
    () => ({ register, unregister, registerSurface, unregisterSurface, isActive, isDemoMode, isSilencedAll, silenceAll }),
    [register, unregister, registerSurface, unregisterSurface, isActive, isDemoMode, isSilencedAll, silenceAll],
  );

  return (
    <FirstAccessGuideContext.Provider value={value}>
      {children}
    </FirstAccessGuideContext.Provider>
  );
}

export function useFirstAccessGuideCoordinator() {
  const ctx = useContext(FirstAccessGuideContext);
  if (!ctx) {
    throw new Error('useFirstAccessGuideCoordinator must be used inside FirstAccessGuideProvider');
  }
  return ctx;
}

export function useFirstAccessGuideSurface(layer: FirstAccessGuideLayer, enabled: boolean) {
  const ctx = useContext(FirstAccessGuideContext);
  const registerSurface = ctx?.registerSurface;
  const unregisterSurface = ctx?.unregisterSurface;

  useEffect(() => {
    if (!enabled || !registerSurface || !unregisterSurface) {
      return;
    }

    registerSurface(layer);
    return () => unregisterSurface(layer);
  }, [enabled, layer, registerSurface, unregisterSurface]);
}
