// A escolha de pessoas do Painel (quem entra nas somas), lembrada no navegador por usuário e
// conta. A permissão de ver as outras pessoas continua sendo do servidor: o que está salvo
// só vale para as pessoas que a lista atual ainda traz (plano .plans/financas-pendencias.md, E1).

export interface PessoaEscopo {
  usuarioId: number;
  nome: string;
}

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Uma chave por usuário e conta: a mesma pessoa pode escolher coisas diferentes em cada conta. */
export function chaveEscopoPessoas(usuarioId: string | number, contaId: string | number | null): string {
  return `painel:pessoas:v1:${usuarioId}:${contaId ?? 'ativa'}`;
}

/** Os ids salvos, ou null quando não há nada salvo, o texto está inválido ou o navegador recusa o acesso. */
export function lerEscopoPessoas(armazenamento: Armazenamento, chave: string): string[] | null {
  try {
    const texto = armazenamento.getItem(chave);
    if (texto === null) return null;
    const valor: unknown = JSON.parse(texto);
    if (!Array.isArray(valor) || !valor.every((item) => typeof item === 'string')) return null;
    return valor;
  } catch {
    return null;
  }
}

/** Guarda a escolha. "Só eu" é o padrão e não ocupa espaço: apaga o que havia. Nunca lança. */
export function gravarEscopoPessoas(armazenamento: Armazenamento, chave: string, ids: ReadonlySet<string>, meId: string): void {
  try {
    if (ids.size === 0 || (ids.size === 1 && ids.has(meId))) {
      armazenamento.removeItem(chave);
      return;
    }
    armazenamento.setItem(chave, JSON.stringify([...ids].sort()));
  } catch {
    // Sem armazenamento (janela privada, dados bloqueados): a escolha vale só nesta visita.
  }
}

/**
 * As pessoas marcadas ao abrir o Painel: as salvas que ainda estão na lista (quem saiu da conta ou
 * perdeu a permissão cai fora). Sem nada que sirva, só o próprio usuário.
 */
export function escopoInicial(salvo: readonly string[] | null, meId: string, pessoasIds: readonly string[]): Set<string> {
  const validos = (salvo ?? []).filter((id) => pessoasIds.includes(id));
  return new Set(validos.length > 0 ? validos : [meId]);
}

/** Quem está sendo somado, em poucas palavras: "Só você", "Você + Rodrigo", "Você + 3 pessoas". */
export function descreverEscopoPessoas(ids: ReadonlySet<string>, pessoas: readonly PessoaEscopo[], meId: string): string {
  const marcadas = pessoas.filter((pessoa) => ids.has(String(pessoa.usuarioId)));
  const incluiVoce = marcadas.some((pessoa) => String(pessoa.usuarioId) === meId);
  const outras = marcadas.filter((pessoa) => String(pessoa.usuarioId) !== meId).map((pessoa) => pessoa.nome);
  if (outras.length === 0) return 'Só você';
  const nomes = outras.length <= 2 ? outras : [`${outras.length} pessoas`];
  return [...(incluiVoce ? ['Você'] : []), ...nomes].join(' + ');
}
