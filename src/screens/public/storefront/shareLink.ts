/**
 * Compartilha pelo menu do aparelho quando existe (celular); senão, copia o
 * link. Fechar o menu sem escolher não é erro: volta 'cancelled'.
 */
export async function shareLink(data: { title: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(data.url);
  return 'copied';
}
