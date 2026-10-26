import type { RunArchive } from './archive';

// O que as cargas em blocos (contratos, vencedores e contratos federais) têm em comum: o tempo do bloco dentro do
// prazo da rotina diária e o envio do arquivo bruto antes de publicar o armazém.

/** Folga do prazo da rotina: o bloco da carga termina e publica antes dele. */
export const DEADLINE_MARGIN_MINUTES = 15;

/**
 * Minutos do bloco da carga: os configurados, limitados ao que sobra da rotina (até `deadlineAt`) menos a folga de
 * DEADLINE_MARGIN_MINUTES, para o bloco terminar e publicar antes do limite. Null quando não sobra pelo menos
 * um minuto: a etapa sai pulada, sem abrir execução. Sem prazo, valem os minutos configurados.
 */
export function backfillBlockMinutes(configuredMinutes: number, deadlineAt: number | undefined, now: number): number | null {
  if (deadlineAt === undefined) {
    return configuredMinutes;
  }
  const available = Math.floor((deadlineAt - now) / 60_000) - DEADLINE_MARGIN_MINUTES;
  return available < 1 ? null : Math.min(configuredMinutes, available);
}

/**
 * Descarrega o arquivo bruto antes de publicar. O envio que falha não lança (conta erro e descarta a parte), então a
 * comparação das falhas antes e depois é o que cancela a publicação: sem o bruto, nada é dado como lido.
 */
export async function flushArchiveOrAbort(archive: RunArchive): Promise<void> {
  const before = archive.summary()?.failures ?? 0;
  await archive.flush();
  const after = archive.summary()?.failures ?? 0;
  if (after > before) {
    throw new Error('O arquivo bruto não foi enviado ao R2: a publicação foi cancelada e nada foi dado como lido');
  }
}
