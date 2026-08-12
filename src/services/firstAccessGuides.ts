const FIRST_ACCESS_GUIDES_SESSION_KEY = 'fingerence:first-access-guides:after-register';

interface FirstAccessGuideSession {
  userId?: number;
  startedAt: number;
}

function parseUserId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getStoredUserId(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem('dadosUsuarioLogado') ?? window.localStorage.getItem('usuarioAtual');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { id?: unknown };
    return parseUserId(parsed.id);
  } catch {
    return null;
  }
}

export function getFirstAccessGuideUserScope(): string {
  return `user:${getStoredUserId() ?? 'unknown'}`;
}

export function startFirstAccessGuidesForUser(user: { id?: unknown } | null | undefined) {
  if (typeof window === 'undefined') {
    return;
  }

  const userId = parseUserId(user?.id);
  const payload: FirstAccessGuideSession = {
    startedAt: Date.now(),
    ...(userId ? { userId } : {}),
  };

  try {
    window.sessionStorage.setItem(FIRST_ACCESS_GUIDES_SESSION_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

export function clearFirstAccessGuidesSession() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(FIRST_ACCESS_GUIDES_SESSION_KEY);
  } catch {
    return;
  }
}

export function isFirstAccessGuidesSessionActive(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const raw = window.sessionStorage.getItem(FIRST_ACCESS_GUIDES_SESSION_KEY);
    if (!raw) {
      return false;
    }

    const payload = JSON.parse(raw) as FirstAccessGuideSession;
    const currentUserId = getStoredUserId();

    if (payload.userId && currentUserId && payload.userId !== currentUserId) {
      clearFirstAccessGuidesSession();
      return false;
    }

    return true;
  } catch {
    clearFirstAccessGuidesSession();
    return false;
  }
}
