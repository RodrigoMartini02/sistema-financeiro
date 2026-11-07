/**
 * Decide se o solicitante pode acessar os lancamentos (ou cartoes) de OUTRAS
 * pessoas da mesma conta. Vale igual para conta pessoal e conta empresa: o dono
 * sempre pode; quem nao e dono precisa de vinculo ativo com a conta E da
 * permissao correspondente liberada pelo dono.
 *
 * Funcao pura, sem banco, para a regra de seguranca poder ser testada
 * isoladamente — quem busca vinculo e permissao e `familyVisibility.ts`.
 */
export interface AcessoCarteiraInput {
  ehDono: boolean;
  vinculoAtivo: boolean;
  permissaoLiberada: boolean;
}

export function podeAcessarCarteiraDeOutros({ ehDono, vinculoAtivo, permissaoLiberada }: AcessoCarteiraInput): boolean {
  if (ehDono) {
    return true;
  }

  if (!vinculoAtivo) {
    return false;
  }

  return permissaoLiberada;
}
