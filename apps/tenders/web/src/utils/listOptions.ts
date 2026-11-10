// Listas padrão do módulo nos campos de seleção (setor, cargo, porte, tipo jurídico): a API grava o código e a tela
// mostra o nome.

export type NamedList = ReadonlyArray<{ id: string; name: string }>;

/**
 * A lista padrão mais o valor atual, que fica visível mesmo se a lista ainda carrega ou o código saiu dela (um código
 * gravado antes de a lista mudar não some do campo nem é trocado em silêncio ao salvar).
 */
export function optionsWithCurrent(list: NamedList | undefined, current: string): NamedList {
  const items = list ?? [];
  return current !== '' && !items.some((item) => item.id === current) ? [...items, { id: current, name: current }] : items;
}
