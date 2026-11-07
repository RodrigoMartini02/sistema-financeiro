// Login pelo CPF/CNPJ quando o mesmo documento tem mais de um acesso: o acesso
// próprio (titular ou admin) e acessos de membro/colaborador, que são logins
// separados criados por um gestor (migration 0059). Sem acesso ao banco.

export interface LoginCandidate {
  id: number;
  type: 'membro' | 'titular' | 'admin' | null;
  status: 'ativo' | 'inativo' | 'bloqueado' | null;
}

export type LoginPick<T extends LoginCandidate> =
  | { kind: 'found'; user: T }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

/** Acesso próprio: titular ou admin. Tipo nulo conta como titular, o padrão da coluna. */
export function isOwnLogin(candidate: Pick<LoginCandidate, 'type'>): boolean {
  return candidate.type !== 'membro';
}

/**
 * Qual acesso o documento abre, sem sorteio:
 * 1. o acesso próprio, se houver (o índice do banco garante no máximo um) —
 *    mesmo bloqueado, para a pessoa ver o aviso do bloqueio depois da senha;
 * 2. sem ele, o único acesso de membro/colaborador;
 * 3. com vários, o único ativo;
 * 4. senão é ambíguo: a pessoa entra pelo e-mail.
 */
export function pickLoginByDocument<T extends LoginCandidate>(candidates: readonly T[]): LoginPick<T> {
  const byId = [...candidates].sort((first, second) => first.id - second.id);

  const ownLogin = byId.find(isOwnLogin);
  if (ownLogin) {
    return { kind: 'found', user: ownLogin };
  }

  if (byId.length === 0) {
    return { kind: 'none' };
  }

  if (byId.length === 1) {
    return { kind: 'found', user: byId[0]! };
  }

  const active = byId.filter((candidate) => candidate.status === 'ativo');
  if (active.length === 1) {
    return { kind: 'found', user: active[0]! };
  }

  return { kind: 'ambiguous' };
}
