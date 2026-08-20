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
