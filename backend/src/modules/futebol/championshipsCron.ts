import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { footballChampionshipMatches, FootballChampionshipMatch } from './db/schema';
import {
  SUPPORTED_COMPETITIONS,
  SupportedCompetition,
  fetchCompetitionMatches,
} from './services/footballData';

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isSupportedCompetition(value: unknown): value is SupportedCompetition {
  return (SUPPORTED_COMPETITIONS as readonly string[]).includes(value as string);
}

async function openNewMatches(): Promise<number> {
  let opened = 0;

  for (const competition of SUPPORTED_COMPETITIONS) {
    const externalMatches = await fetchCompetitionMatches(competition, { status: 'SCHEDULED' }).catch((error) => {
      console.error(`[campeonatos cron] Erro ao buscar partidas (${competition}):`, (error as Error).message);
      return [];
    });

    for (const external of externalMatches) {
      const [match] = await db
        .insert(footballChampionshipMatches)
        .values({
          competition: external.competition,
          externalMatchId: external.externalMatchId,
          homeTeam: external.homeTeam,
          awayTeam: external.awayTeam,
          homeCrest: external.homeCrest,
          awayCrest: external.awayCrest,
          matchday: external.matchday,
          stage: external.stage,
          matchDate: new Date(external.utcDate),
          open: true,
        })
        .onConflictDoNothing({ target: footballChampionshipMatches.externalMatchId })
        .returning();

      if (match) opened += 1;
    }
  }

  return opened;
}

async function syncFinishedResults(): Promise<number> {
  const pending = await db
    .select()
    .from(footballChampionshipMatches)
    .where(eq(footballChampionshipMatches.finished, false));

  if (pending.length === 0) return 0;

  const pendingByCompetition = new Map<SupportedCompetition, FootballChampionshipMatch[]>();
  for (const match of pending) {
    if (!isSupportedCompetition(match.competition)) continue;
    const list = pendingByCompetition.get(match.competition) ?? [];
    list.push(match);
    pendingByCompetition.set(match.competition, list);
  }

  let updated = 0;

  for (const [competition, competitionPending] of pendingByCompetition) {
    const finishedExternal = await fetchCompetitionMatches(competition, { status: 'FINISHED' }).catch((error) => {
      console.error(`[campeonatos cron] Erro ao sincronizar placares (${competition}):`, (error as Error).message);
      return [];
    });

    const finishedById = new Map(finishedExternal.map((external) => [external.externalMatchId, external]));

    for (const match of competitionPending) {
      const external = finishedById.get(match.externalMatchId);
      if (!external) continue;

      await db
        .update(footballChampionshipMatches)
        .set({
          homeScore: external.homeScore,
          awayScore: external.awayScore,
          finished: true,
        })
        .where(eq(footballChampionshipMatches.id, match.id));

      updated += 1;
    }
  }

  return updated;
}

async function runChampionshipsSync(): Promise<void> {
  console.log('[campeonatos cron] Iniciando sincronizacao automatica...');
  try {
    const opened = await openNewMatches();
    const updated = await syncFinishedResults();
    console.log(`[campeonatos cron] Concluido: ${opened} nova(s) partida(s) aberta(s), ${updated} placar(es) atualizado(s)`);
  } catch (error) {
    console.error('[campeonatos cron] Erro na sincronizacao:', (error as Error).message);
  }
}

let activeTimer: NodeJS.Timeout | null = null;

export function startChampionshipsCron(): void {
  if (process.env['FUTEBOL_CRON_ENABLED'] !== 'true') {
    console.log('[campeonatos cron] Desabilitado. Configure FUTEBOL_CRON_ENABLED=true para ativar.');
    return;
  }

  runChampionshipsSync().catch((error) => console.error('[campeonatos cron] Erro na sincronizacao inicial:', error));

  activeTimer = setInterval(() => {
    runChampionshipsSync().catch((error) => console.error('[campeonatos cron] Erro na sincronizacao agendada:', error));
  }, SYNC_INTERVAL_MS);

  console.log(`[campeonatos cron] Sincronizacao automatica ativa (a cada ${SYNC_INTERVAL_MS / (60 * 60 * 1000)}h)`);
}

export function stopChampionshipsCron(): void {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}
