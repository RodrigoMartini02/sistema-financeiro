/**
 * Primeiro nome. Nos graficos o nome completo estoura a legenda, e o primeiro
 * nome ja distingue as pessoas de uma familia — mesmo criterio da coluna
 * "Quem lancou" na tabela de despesas.
 */
export function firstName(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0];
  return primeiro || nome;
}
