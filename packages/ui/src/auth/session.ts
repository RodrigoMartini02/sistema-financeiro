export type SessionProduct = 'finance' | 'tenders';
export type SessionAccountType = 'pessoal' | 'empresa';

export interface StoredSessionUser {
  id: number;
  nome?: string;
  sobrenome?: string | null;
  email?: string;
  documento?: string | null;
  tipo?: string;
  status?: string;
}

interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SessionStores {
  local: SessionStorage;
  tab: SessionStorage;
}

export interface SessionAccount {
  id: number;
  name: string;
  type: SessionAccountType;
}

/** Each product owns its keys, even when the products share a browser origin. */
export function createSession(product: SessionProduct, stores?: SessionStores) {
  const keys = {
    token: `${product}.token`,
    user: `${product}.user`,
    accountId: `${product}.activeAccountId`,
    accountName: `${product}.activeAccountName`,
    accountType: `${product}.activeAccountType`,
    loginOrigin: `${product}.loginOrigin`,
  };

  // Resolve lazily: importing a service must also work outside the browser.
  const local = () => stores?.local ?? globalThis.localStorage;
  const tab = () => stores?.tab ?? globalThis.sessionStorage;

  function read(key: string, scope: 'local' | 'tab' = 'local'): string | null {
    try {
      return (scope === 'local' ? local() : tab())?.getItem(key) ?? null;
    } catch (error) {
      // Browsers can deny storage (privacy settings or embedded pages). There is
      // no readable identity then; unexpected storage failures still propagate.
      if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'SecurityError') {
        return null;
      }
      throw error;
    }
  }

  function getToken(): string | null {
    return read(keys.token, 'tab') ?? read(keys.token);
  }

  function getUser(): StoredSessionUser | null {
    const raw = read(keys.user);
    if (!raw) return null;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      // A stale or damaged browser value is not an authenticated identity.
      if (error instanceof SyntaxError) return null;
      throw error;
    }
    if (typeof value !== 'object' || value === null || !('id' in value)
      || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id <= 0) {
      return null;
    }
    const user = value as Record<string, unknown> & { id: number };
    return {
      id: user.id,
      nome: typeof user.nome === 'string' ? user.nome : undefined,
      sobrenome: typeof user.sobrenome === 'string' || user.sobrenome === null ? user.sobrenome : undefined,
      email: typeof user.email === 'string' ? user.email : undefined,
      documento: typeof user.documento === 'string' || user.documento === null ? user.documento : undefined,
      tipo: typeof user.tipo === 'string' ? user.tipo : undefined,
      status: typeof user.status === 'string' ? user.status : undefined,
    };
  }

  function clearActiveAccount(): void {
    for (const key of [keys.accountId, keys.accountName, keys.accountType]) {
      local()?.removeItem(key);
      tab()?.removeItem(key);
    }
  }

  function setSession(token: string, user: StoredSessionUser): void {
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !token) {
      throw new Error('Invalid session identity');
    }
    const localStore = local();
    const tabStore = tab();
    if (!localStore || !tabStore) throw new Error('Browser session storage is unavailable');
    if (getUser()?.id !== user.id) clearActiveAccount();
    // The login destination is consumed by the caller after this write.
    localStore.setItem(keys.user, JSON.stringify(user));
    localStore.setItem(keys.token, token);
    tabStore.setItem(keys.token, token);
  }

  function getActiveAccountId(): number | null {
    const raw = read(keys.accountId);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function getActiveAccountType(): SessionAccountType | null {
    const type = read(keys.accountType);
    return type === 'pessoal' || type === 'empresa' ? type : null;
  }

  function setActiveAccount(account: SessionAccount): void {
    if (!Number.isSafeInteger(account.id) || account.id <= 0
      || (account.type !== 'pessoal' && account.type !== 'empresa')) {
      throw new Error('Invalid active account');
    }
    const storage = local();
    if (!storage) throw new Error('Browser session storage is unavailable');
    storage.setItem(keys.accountId, String(account.id));
    storage.setItem(keys.accountName, account.name);
    storage.setItem(keys.accountType, account.type);
  }

  function clear(): void {
    for (const key of Object.values(keys)) {
      local()?.removeItem(key);
      tab()?.removeItem(key);
    }
  }

  function consumeLoginOrigin(): string | null {
    const origin = read(keys.loginOrigin, 'tab');
    tab()?.removeItem(keys.loginOrigin);
    return origin;
  }

  return {
    getToken,
    getUser,
    setSession,
    clear,
    getActiveAccountId,
    getActiveAccountName: (): string | null => read(keys.accountName),
    getActiveAccountType,
    setActiveAccount,
    setLoginOrigin: (origin: string): void => { tab()?.setItem(keys.loginOrigin, origin); },
    consumeLoginOrigin,
  };
}
