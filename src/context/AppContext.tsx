import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface AppContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  // Quick-open dialogs from header
  quickAction: 'none' | 'nova-despesa' | 'nova-receita';
  setQuickAction: (a: 'none' | 'nova-despesa' | 'nova-receita', month?: string) => void;
  /** Contexto do mês consultado; não muda a data de compra do formulário. */
  quickActionMonth?: string;
  // Telas que precisam ocupar a altura restante da viewport sem scroll de
  // página (ex: calendário de Movimentações) avisam o AppShell por aqui.
  fillViewport: boolean;
  setFillViewport: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = (localStorage.getItem('theme') ?? 'light') as 'light' | 'dark';
    document.documentElement.classList.toggle('dark', saved === 'dark');
    return saved;
  });
  const [quickAction, setQuickActionValue] = useState<AppContextValue['quickAction']>('none');
  const [quickActionMonth, setQuickActionMonth] = useState<string>();
  const setQuickAction = useCallback((action: AppContextValue['quickAction'], month?: string) => {
    setQuickActionMonth(action === 'nova-despesa' ? month : undefined);
    setQuickActionValue(action);
  }, []);
  const [fillViewport, setFillViewport] = useState(false);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('theme', next);
      return next;
    });
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, quickAction, setQuickAction, quickActionMonth, fillViewport, setFillViewport }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
