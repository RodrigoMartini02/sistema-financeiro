import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  footballConfirmations,
  footballMatches,
  footballPlayers,
  footballSchedules,
  FootballSchedule,
} from './db/schema';
import { runFootballDraw } from './services/draw';

const activeTimers = new Map<string, NodeJS.Timeout>();

async function runScheduledDraw(schedule: FootballSchedule): Promise<void> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    const allPlayers = await db
      .select()
      .from(footballPlayers)
      .where(eq(footballPlayers.userId, schedule.userId));

    const confirmations = await db
      .select({ playerId: footballConfirmations.playerId })
      .from(footballConfirmations)
      .where(
        and(
          eq(footballConfirmations.userId, schedule.userId),
          eq(footballConfirmations.gameDate, dateStr),
        ),
      );

    const confirmedIds = new Set(confirmations.map((confirmation) => confirmation.playerId));
    const players = allPlayers.filter((player) => confirmedIds.has(player.id));

    if (players.length < 2) {
      console.log(`[futebol cron] Sorteio cancelado: apenas ${players.length} jogador(es) confirmado(s)`);
      return;
    }

    const teams = runFootballDraw(players, schedule.drawType, schedule.teamSize);

    await db.insert(footballMatches).values({
      userId: schedule.userId,
      date: dateStr,
      teams,
      notes: `Sorteio automático - ${schedule.drawType === 'balanced' ? 'Equilibrado' : 'Aleatório'}`,
    });

    console.log(`[futebol cron] Sorteio automático realizado: ${players.length} jogadores, ${teams.length} times`);
  } catch (error) {
    console.error('[futebol cron] Erro no sorteio automático:', error);
  }
}

function nextOccurrence(dayOfWeek: number, hour: number, minute: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setHours(hour, minute, 0, 0);

  let dayDiff = (dayOfWeek - result.getDay() + 7) % 7;
  if (dayDiff === 0 && result.getTime() <= from.getTime()) {
    dayDiff = 7;
  }
  result.setDate(result.getDate() + dayDiff);

  return result;
}

function scheduleNext(schedule: FootballSchedule): void {
  const existing = activeTimers.get(schedule.userId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(schedule.userId);
  }

  if (!schedule.active) {
    return;
  }

  const next = nextOccurrence(schedule.dayOfWeek, schedule.hour, schedule.minute);
  const delay = next.getTime() - Date.now();

  const timer = setTimeout(() => {
    console.log('[futebol cron] Disparando sorteio automático...');
    runScheduledDraw(schedule)
      .catch((error) => console.error('[futebol cron] Erro no disparo agendado:', error))
      .finally(() => scheduleNext(schedule));
  }, delay);

  activeTimers.set(schedule.userId, timer);
  console.log(`[futebol cron] Próximo sorteio agendado para ${next.toISOString()} (usuário ${schedule.userId})`);
}

export function refreshFootballSchedule(schedule: FootballSchedule): void {
  if (process.env['FUTEBOL_CRON_ENABLED'] !== 'true') {
    return;
  }
  scheduleNext(schedule);
}

export function cancelFootballSchedule(userId: string): void {
  const existing = activeTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(userId);
  }
}

export async function startFootballCron(): Promise<void> {
  if (process.env['FUTEBOL_CRON_ENABLED'] !== 'true') {
    console.log('[futebol cron] Desabilitado. Configure FUTEBOL_CRON_ENABLED=true para ativar.');
    return;
  }

  try {
    const schedules = await db
      .select()
      .from(footballSchedules)
      .where(eq(footballSchedules.active, true));

    schedules.forEach(scheduleNext);

    console.log(`[futebol cron] Monitoramento orientado a evento iniciado (${schedules.length} agendamento(s) ativo(s))`);
  } catch (error) {
    console.error('[futebol cron] Erro ao carregar agendamentos ativos:', error);
  }
}
