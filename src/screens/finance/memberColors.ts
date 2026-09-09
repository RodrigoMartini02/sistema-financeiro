/**
 * Cor de cada membro da familia, estavel entre os graficos.
 *
 * Os donuts e as barras de categoria so funcionam juntos se a mesma pessoa
 * tiver a mesma cor nos tres: o usuario identifica alguem uma vez e reconhece
 * nos demais. Por isso a cor sai do `usuario_id`, nao da ordem em que o membro
 * aparece na resposta — ordenar por valor mudaria a cor quando o gasto mudasse.
 *
 * A paleta e a mesma ja usada nos outros graficos do painel, para o bloco por
 * membro nao destoar do resto da tela.
 */
export const PALETA = [
  '#0891b2', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

/**
 * Mapa usuario_id → cor, montado a partir da lista de membros da conta.
 *
 * A ordem da lista vem do backend (dono primeiro, depois os membros), e e
 * estavel entre requisicoes — logo a cor tambem e.
 */
export function buildMemberColors(membros: { usuario_id: number }[]): Map<number, string> {
  const cores = new Map<number, string>();
  membros.forEach((m, i) => {
    cores.set(m.usuario_id, PALETA[i % PALETA.length]!);
  });
  return cores;
}

/** Cor de um membro, com fallback neutro para id desconhecido. */
export function memberColor(cores: Map<number, string>, usuarioId: number): string {
  return cores.get(usuarioId) ?? '#94a3b8';
}

/**
 * Primeiro nome. Nos graficos o nome completo estoura a legenda, e o primeiro
 * nome ja distingue as pessoas de uma familia — mesmo criterio da coluna
 * "Quem lancou" na tabela de despesas.
 */
export function firstName(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0];
  return primeiro || nome;
}
