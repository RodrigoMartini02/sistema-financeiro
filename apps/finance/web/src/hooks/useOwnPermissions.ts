import { useQuery } from '@tanstack/react-query';
import { fetchOwnPermissions } from '../services/permissoesService';
import { queryKeys } from '../services/queryKeys';
import { PERMISSION_FLAGS, type PermissionFlag } from '../types/permissions';

export type OwnPermissions = Readonly<Record<PermissionFlag, boolean>>;

const ALL_ALLOWED = Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, true])) as OwnPermissions;

/**
 * Permissões de quem está logado, para esconder o que a pessoa não pode usar
 * (regras em utils/screenAccess.ts). Titular e admin recebem tudo liberado do
 * servidor. Enquanto carrega volta undefined, e quem usa esconde o que depende
 * de permissão; se a consulta falhar, tudo liberado — o servidor continua
 * barrando o que não pode.
 *
 * `enabled: false` fora do app logado: a consulta exige sessão, e um 401 encerra
 * a sessão local.
 */
export function useOwnPermissions({ enabled = true }: { enabled?: boolean } = {}): OwnPermissions | undefined {
  const query = useQuery({
    queryKey: queryKeys.ownPermissions,
    queryFn: fetchOwnPermissions,
    enabled,
    staleTime: 5 * 60_000,
  });
  if (!enabled) return undefined;
  if (query.isError) return ALL_ALLOWED;
  return query.data;
}
