import { resolveVisibleUserIds } from './familyVisibility';

/**
 * Quais usuarios o painel deve somar.
 *
 * O painel nasceu individual: filtrava sempre `usuario_id = <solicitante>`,
 * mesmo depois que a carteira compartilhada passou a existir. A tabela de
 * despesas ja respeitava a carteira; o painel ficou de fora e continuava
 * mostrando so os lancamentos de quem estava olhando.
 *
 * Agora ele tem dois modos:
 *
 *   familia  soma todos os usuarios que a carteira permite enxergar
 *   membro   um usuario especifico, escolhido no seletor
 *
 * O `membro` pedido chega do cliente e por isso NAO e confiavel: ele so passa
 * se estiver no conjunto que `resolveVisibleUserIds` devolve. Pedir alguem de
 * fora nao cai silenciosamente no proprio usuario — devolve null, e a rota
 * responde 400. Cair no proprio seria pior: o usuario veria numeros achando
 * que sao de outra pessoa.
 *
 * Sem membros vinculados, `resolveVisibleUserIds` devolve so o solicitante e o
 * comportamento fica identico ao de antes.
 */
export async function resolveDashboardScope(
  requesterId: number,
  accountId: number | null,
  memberId: number | null,
): Promise<number[] | null> {
  const visiveis = await resolveVisibleUserIds(requesterId, accountId);

  if (memberId === null) return visiveis;
  if (!visiveis.includes(memberId)) return null;
  return [memberId];
}
