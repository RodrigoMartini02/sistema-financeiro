import { useQuery } from '@tanstack/react-query';
import { getToken } from '../services/session';
import { verifySession } from '../services/authService';
import { queryKeys } from '../services/queryKeys';
import type { AuthUser } from '../types/auth';

interface UseAuthSessionOptions { enabled?: boolean; }

export function useAuthSession({ enabled = true }: UseAuthSessionOptions = {}) {
  const hasToken = Boolean(getToken());

  const query = useQuery<AuthUser, Error>({
    queryKey: queryKeys.session,
    queryFn: verifySession,
    enabled: enabled && hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    hasToken,
  };
}
