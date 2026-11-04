import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppProvider } from '../context/AppContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { FirstAccessGuideProvider } from '../context/FirstAccessGuideContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ConfirmProvider>
          <FirstAccessGuideProvider>{children}</FirstAccessGuideProvider>
        </ConfirmProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
