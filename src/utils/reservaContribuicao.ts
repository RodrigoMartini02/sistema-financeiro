/**
 * Quanto ainda falta por mês para a reserva atingir a meta até o prazo.
 *
 * Estava duplicada com corpo idêntico em ReservasScreen e ReservaDialog.
 *
 * Devolve null quando não há o que sugerir: sem meta, sem prazo, prazo já
 * vencido (ou no mês corrente) ou meta já alcançada.
 */
export function calcContribuicaoMensal(
  valorAtual: number,
  meta: number,
  prazo: string,
): number | null {
  if (!meta || !prazo) return null;

  const hoje = new Date();
  const dataPrazo = new Date(prazo);
  const meses =
    (dataPrazo.getFullYear() - hoje.getFullYear()) * 12 +
    (dataPrazo.getMonth() - hoje.getMonth());
  if (meses <= 0) return null;

  const restante = meta - valorAtual;
  if (restante <= 0) return null;

  return Math.ceil(restante / meses);
}
