import { createContext, useContext, useState, type ReactNode } from 'react';

interface AppContextValue {
  month: number;
  year: number;
  setMonth: (m: number) => void;
  setYear: (y: number) => void;
  setPeriod: (month: number, year: number) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  // Quick-open dialogs from header
  quickAction: 'none' | 'nova-despesa' | 'nova-receita';
  setQuickAction: (a: 'none' | 'nova-despesa' | 'nova-receita') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = (localStorage.getItem('theme') ?? 'light') as 'light' | 'dark';
    document.documentElement.classList.toggle('dark', saved === 'dark');
    return saved;
  });
  const [quickAction, setQuickAction] = useState<AppContextValue['quickAction']>('none');

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('theme', next);
      return next;
    });
  };

  const setPeriod = (m: number, y: number) => { setMonth(m); setYear(y); };

  return (
    <AppContext.Provider value={{ month, year, setMonth, setYear, setPeriod, theme, toggleTheme, quickAction, setQuickAction }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
