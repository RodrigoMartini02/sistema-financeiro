import { useEffect } from 'react';
import { LoginPage } from '../../screens/public/LoginPage';
import { setAuthOrigin } from '../../services/session';

/**
 * Login embutido do módulo: mesmo LoginPage, voltando para Licitações. "Criar
 * nova conta" cadastra já com o módulo, em 15 dias grátis.
 */
export function TendersLoginScreen() {
  useEffect(() => {
    setAuthOrigin('tenders');
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <LoginPage tone="light" context="tenders" />
      </div>
    </div>
  );
}
