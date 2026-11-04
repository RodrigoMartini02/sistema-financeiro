// Abas Editais e Contratos de Favoritos e de Buscas salvas. A aba fica na URL
// (`?aba=contratos`), para os links de "Contratos a vencer" levarem direto a ela.

export const LIST_TABS = [
  { id: 'editais', label: 'Editais' },
  { id: 'contratos', label: 'Contratos' },
] as const;
export type ListTab = (typeof LIST_TABS)[number]['id'];

export const LIST_TAB_URL_PARAM = 'aba';

/** Aba da URL; sem ela ou desconhecida, Editais. */
export function listTabOf(params: URLSearchParams): ListTab {
  return params.get(LIST_TAB_URL_PARAM) === 'contratos' ? 'contratos' : 'editais';
}

/** Parâmetros só com a aba (a de Editais é o padrão e fica fora da URL). */
export function listTabParams(tab: ListTab): URLSearchParams {
  const params = new URLSearchParams();
  if (tab === 'contratos') params.set(LIST_TAB_URL_PARAM, tab);
  return params;
}
