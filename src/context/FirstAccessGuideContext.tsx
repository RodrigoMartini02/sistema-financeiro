import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

// Ordem de prioridade por módulo, seguindo o fluxo natural de uso do sistema:
// cadastros base primeiro (o resto depende deles), depois configuração da
// conta, depois lançamentos do dia a dia, depois visão consolidada, e por
// último análise — só relevante quando já existem dados lançados.
const MODULE_PRIORITY: Record<string, number> = {
  // Nível 1 — cadastros base
  cartoes: 1,
  categorias: 1,
  perfis: 1,
  clientes: 1,
  representantes: 1,
  socios: 1,
  servicos: 1,
  // Nível 2 — configuração da conta
  conta: 2,
  usuarios: 2,
  // Nível 3 — lançamentos
  despesas: 3,
  receitas: 3,
  reservas: 3,
  // Nível 4 — visão consolidada
  painel: 4,
  meses: 4,
  planos: 4,
  // Nível 5 — análise
  relatorios: 5,
};

const DEFAULT_PRIORITY = 3;

function priorityForScope(scope: string): number {
  const [module] = scope.split(':');
  return MODULE_PRIORITY[module] ?? DEFAULT_PRIORITY;
}

interface FirstAccessGuideContextValue {
  register: (scope: string) => void;
  unregister: (scope: string) => void;
  isActive: (scope: string) => boolean;
}

const FirstAccessGuideContext = createContext<FirstAccessGuideContextValue | null>(null);

export function FirstAccessGuideProvider({ children }: { children: ReactNode }) {
  const [eligible, setEligible] = useState<Set<string>>(new Set());
  const countsRef = useRef<Map<string, number>>(new Map());

  const register = useCallback((scope: string) => {
    const counts = countsRef.current;
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    setEligible((prev) => (prev.has(scope) ? prev : new Set(prev).add(scope)));
  }, []);

  const unregister = useCallback((scope: string) => {
    const counts = countsRef.current;
    const next = (counts.get(scope) ?? 1) - 1;
    if (next <= 0) {
      counts.delete(scope);
      setEligible((prev) => {
        if (!prev.has(scope)) return prev;
        const copy = new Set(prev);
        copy.delete(scope);
        return copy;
      });
    } else {
      counts.set(scope, next);
    }
  }, []);

  const activeScope = useMemo(() => {
    let best: string | undefined;
    let bestPriority = Infinity;
    for (const scope of eligible) {
      const p = priorityForScope(scope);
      if (p < bestPriority) {
        bestPriority = p;
        best = scope;
      }
    }
    return best;
  }, [eligible]);

  const isActive = useCallback((scope: string) => scope === activeScope, [activeScope]);

  const value = useMemo(() => ({ register, unregister, isActive }), [register, unregister, isActive]);

  return (
    <FirstAccessGuideContext.Provider value={value}>
      {children}
    </FirstAccessGuideContext.Provider>
  );
}

export function useFirstAccessGuideCoordinator() {
  const ctx = useContext(FirstAccessGuideContext);
  if (!ctx) throw new Error('useFirstAccessGuideCoordinator must be used inside FirstAccessGuideProvider');
  return ctx;
}
