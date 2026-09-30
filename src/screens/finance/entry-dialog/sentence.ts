/** "a, b e c". */
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Junta as orações numa frase do rodapé: "Preencha descrição e valor e escolha o cartão." Vazio sem orações. */
export function toSentence(clauses: string[]): string {
  const sentence = joinWithAnd(clauses);
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : '';
}
