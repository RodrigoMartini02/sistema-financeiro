import type { ClassificacaoReceita } from '../types/config';

export interface OpcaoClassificacao {
  id: number;
  /** "Contratos › Mensalidade" na subcategoria; só o nome na raiz. */
  rotulo: string;
}

/**
 * Classificações ativas como lista plana para selects simples (comissão,
 * contrato): a subcategoria leva o nome da raiz para não ficar ambígua.
 */
export function opcoesDeClassificacao(itens: ClassificacaoReceita[]): OpcaoClassificacao[] {
  const ativos = itens.filter((item) => item.ativo);
  const nomePorId = new Map(ativos.map((item) => [item.id, item.nome]));
  return ativos
    .map((item) => {
      const pai = item.parent_id ? nomePorId.get(item.parent_id) : undefined;
      return { id: item.id, rotulo: pai ? `${pai} › ${item.nome}` : item.nome };
    })
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
