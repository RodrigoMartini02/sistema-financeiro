import { FootballPlayer } from '../db/schema';

export interface FootballTeam {
  name: string;
  players: FootballPlayer[];
}

function calcOverall(skills: unknown): number {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    return 50;
  }

  const vals = Object.values(skills).filter((value): value is number => typeof value === 'number');
  if (!vals.length) {
    return 50;
  }

  return Math.round(vals.reduce((total, value) => total + value, 0) / vals.length);
}

function shuffleWithinTiers(players: FootballPlayer[]): FootballPlayer[] {
  const tierGap = 12;
  if (!players.length) {
    return [];
  }

  const sorted = [...players].sort((a, b) => calcOverall(b.skills) - calcOverall(a.skills));
  const result: FootballPlayer[] = [];
  let index = 0;

  while (index < sorted.length) {
    const topOverall = calcOverall(sorted[index]!.skills);
    let nextIndex = index;
    while (nextIndex < sorted.length && topOverall - calcOverall(sorted[nextIndex]!.skills) < tierGap) {
      nextIndex += 1;
    }

    const tier = sorted.slice(index, nextIndex);
    for (let current = tier.length - 1; current > 0; current -= 1) {
      const randomIndex = Math.floor(Math.random() * (current + 1));
      [tier[current], tier[randomIndex]] = [tier[randomIndex]!, tier[current]!];
    }
    result.push(...tier);
    index = nextIndex;
  }

  return result;
}

export function runFootballDraw(players: FootballPlayer[], drawType: string, teamSize: number): FootballTeam[] {
  const numTeams = Math.floor(players.length / teamSize) || 2;
  const teams = Array.from({ length: numTeams }, (_, index) => ({
    name: `Time ${String.fromCharCode(65 + index)}`,
    players: [] as FootballPlayer[],
  }));

  if (drawType === 'balanced') {
    const goalkeepers = players.filter((player) => player.position === 'Goleiro');
    const fieldPlayers = players.filter((player) => player.position !== 'Goleiro');
    const shuffledGoalkeepers = shuffleWithinTiers(goalkeepers);
    const shuffledFieldPlayers = shuffleWithinTiers(fieldPlayers);
    const allPlayers = [...shuffledGoalkeepers.slice(0, numTeams), ...shuffledFieldPlayers];

    let direction = 1;
    let playerIndex = 0;
    let teamIndex = Math.floor(Math.random() * numTeams);

    while (playerIndex < allPlayers.length) {
      teams[teamIndex]!.players.push(allPlayers[playerIndex]!);
      playerIndex += 1;

      const nextTeamIndex = teamIndex + direction;
      if (nextTeamIndex < 0 || nextTeamIndex >= numTeams) {
        direction *= -1;
        teamIndex += direction;
      } else {
        teamIndex = nextTeamIndex;
      }
    }
  } else {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    shuffled.forEach((player, index) => {
      teams[index % numTeams]!.players.push(player);
    });
  }

  return teams;
}
