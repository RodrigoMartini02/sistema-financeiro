import cron from 'node-cron';
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
      notes: `Sorteio automatico - ${schedule.drawType === 'balanced' ? 'Equilibrado' : 'Aleatorio'}`,
    });

    console.log(`[futebol cron] Sorteio automatico realizado: ${players.length} jogadores, ${teams.length} times`);
  } catch (error) {
    console.error('[futebol cron] Erro no sorteio automatico:', error);
  }
}

export function startFootballCron(): void {
  if (process.env['FUTEBOL_CRON_ENABLED'] !== 'true') {
    console.log('[futebol cron] Desabilitado. Configure FUTEBOL_CRON_ENABLED=true para ativar.');
    return;
  }

  cron.schedule('* * * * *', async () => {
    try {
      const schedules = await db
        .select()
        .from(footballSchedules)
        .where(eq(footballSchedules.active, true));

      if (!schedules.length) {
        return;
      }

      const now = new Date();
      for (const schedule of schedules) {
        const dayMatch = now.getDay() === schedule.dayOfWeek;
        const hourMatch = now.getHours() === schedule.hour;
        const minuteMatch = now.getMinutes() === schedule.minute;

        if (dayMatch && hourMatch && minuteMatch) {
          console.log('[futebol cron] Disparando sorteio automatico...');
          await runScheduledDraw(schedule);
        }
      }
    } catch (error) {
      console.error('[futebol cron] Erro:', error);
    }
  });

  console.log('[futebol cron] Monitoramento de sorteio automatico iniciado');
}
