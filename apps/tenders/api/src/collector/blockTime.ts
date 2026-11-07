import type { RunArchive } from './archive';
import type { CollectorContext } from './runs';

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
 * Confere também falhas anteriores ao flush: uma parte descartada durante append não volta a existir só porque
 * o envio final funcionou. Nenhuma publicação posterior desta execução pode confirmar esse bloco incompleto.
 */
export async function flushArchiveOrAbort(archive: RunArchive): Promise<void> {
  assertArchiveHealthy(archive);
  await archive.flush();
  assertArchiveHealthy(archive);
}

export function assertArchiveHealthy(archive: RunArchive): void {
  if ((archive.summary()?.failures ?? 0) > 0) {
    throw new Error('O arquivo bruto não foi enviado ao R2: a publicação foi cancelada e nada foi dado como lido');
  }
}

/** A confirmação pertence a esta publicação, não ao fato de alguma publicação anterior ter funcionado. */
export async function publishAndConfirm<T>(archive: RunArchive, publish: () => Promise<T>, confirm: (result: T) => Promise<void>): Promise<T> {
  await flushArchiveOrAbort(archive);
  const result = await publish();
  await confirm(result);
  return result;
}

export type CollectionLimitReason = 'time' | 'disk' | 'local';

/** O limite de tempo para antes da publicação; a reserva de disco é administrada pelo orçamento compartilhado. */
export async function collectionStopReason(context: CollectorContext, stopAt?: number, localReady = true): Promise<CollectionLimitReason | null> {
  if (!localReady) {
    return 'local';
  }
  if (stopAt !== undefined && context.now().getTime() >= stopAt) {
    return 'time';
  }
  if (context.resourceBudget && !(await context.resourceBudget.canContinue())) {
    return 'disk';
  }
  return null;
}
