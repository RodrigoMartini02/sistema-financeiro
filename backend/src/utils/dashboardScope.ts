import { resolveVisibleUserIds } from './familyVisibility';

/**
 * Quais usuarios o painel deve somar.
 *
 * Quatro modos, escolhidos explicitamente pelo cliente via `memberId`:
 *
 *   memberId === undefined     so o proprio solicitante (padrao da tela)
 *   memberId === null          familia inteira (usuario clicou em "Familia")
 *   memberId === <id>          um usuario especifico, escolhido no seletor
 *   memberId === [<id>, ...]   combinacao especifica de usuarios (filtro
 *                              sanduiche do Painel, multi-selecao real)
 *
 * Sem escolha nenhuma do cliente, o painel nunca amplia sozinho — mesmo que
 * o solicitante tenha a permissao de familia, ele so ve a familia se pedir.
 * Isso mantem o padrao de resolveVisibleUserIds: a permissao habilita o
 * pedido, nao liga a expansao por conta propria.
 *
 * O `membro` pedido chega do cliente e por isso NAO e confiavel: ele so passa
 * se estiver no conjunto que `resolveVisibleUserIds` devolve com `expandir`
 * ligado. Pedir alguem de fora nao cai silenciosamente no proprio usuario —
 * devolve null, e a rota responde 400. Cair no proprio seria pior: o usuario
 * veria numeros achando que sao de outra pessoa. Uma lista com QUALQUER id
 * fora do conjunto visivel invalida o pedido inteiro, pelo mesmo motivo.
 */
export async function resolveDashboardScope(
  requesterId: number,
  accountId: number | null,
  memberId: number | number[] | null | undefined,
): Promise<number[] | null> {
  if (memberId === undefined) return [requesterId];

  const visiveis = await resolveVisibleUserIds(requesterId, accountId, true);

  if (memberId === null) return visiveis;

  if (Array.isArray(memberId)) {
    if (memberId.length === 0) return [requesterId];
    if (!memberId.every((id) => visiveis.includes(id))) return null;
    return [...new Set(memberId)];
  }

  if (!visiveis.includes(memberId)) return null;
  return [memberId];
}
