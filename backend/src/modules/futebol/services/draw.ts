import { FootballPlayer } from '../db/schema';

export interface FootballTeam {
  name: string;
  players: FootballPlayer[];
}

const POSITION_GROUPS: Record<string, string> = {
  Zagueiro: 'defesa',
  'Lateral Direito': 'defesa',
  'Lateral Esquerdo': 'defesa',
  Volante: 'volante',
  'Meia Defensivo': 'volante',
  Meia: 'meia',
  'Meia Ofensivo': 'meia',
  'Ponta Direita': 'ataque',
  'Ponta Esquerda': 'ataque',
  'Segundo Atacante': 'ataque',
  Centroavante: 'ataque',
};

const GROUP_ORDER = ['defesa', 'volante', 'meia', 'ataque'];
const TIER_GAP = 12;

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

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let current = result.length - 1; current > 0; current -= 1) {
    const randomIndex = Math.floor(Math.random() * (current + 1));
    [result[current], result[randomIndex]] = [result[randomIndex]!, result[current]!];
  }
  return result;
}

function shuffleWithinTiers(players: FootballPlayer[]): FootballPlayer[] {
  if (!players.length) {
    return [];
  }

  const sorted = [...players].sort((a, b) => calcOverall(b.skills) - calcOverall(a.skills));
  const result: FootballPlayer[] = [];
  let index = 0;

  while (index < sorted.length) {
    const topOverall = calcOverall(sorted[index]!.skills);
    let nextIndex = index;
    while (nextIndex < sorted.length && topOverall - calcOverall(sorted[nextIndex]!.skills) < TIER_GAP) {
      nextIndex += 1;
    }
    result.push(...shuffle(sorted.slice(index, nextIndex)));
    index = nextIndex;
  }

  return result;
}

function teamOverall(players: FootballPlayer[]): number {
  if (!players.length) {
    return 0;
  }
  return players.reduce((sum, player) => sum + calcOverall(player.skills), 0) / players.length;
}

function optimizeBalance(teams: FootballTeam[], maxIterations = 150): void {
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const overalls = teams.map((team) => teamOverall(team.players));
    const spread = Math.max(...overalls) - Math.min(...overalls);
    if (spread <= 1) {
      break;
    }

    const strongIndex = overalls.indexOf(Math.max(...overalls));
    const weakIndex = overalls.indexOf(Math.min(...overalls));
    const strong = teams[strongIndex]!;
    const weak = teams[weakIndex]!;

    let best: { strongPlayer: FootballPlayer; weakPlayer: FootballPlayer } | null = null;
    let bestGain = 0.5;

    for (const strongPlayer of strong.players) {
      if (strongPlayer.position === 'Goleiro') {
        continue;
      }
      for (const weakPlayer of weak.players) {
        if (weakPlayer.position === 'Goleiro') {
          continue;
        }
        const strongOvr = calcOverall(strongPlayer.skills);
        const weakOvr = calcOverall(weakPlayer.skills);
        if (strongOvr <= weakOvr) {
          continue;
        }

        const strongSum = strong.players.reduce((sum, player) => sum + calcOverall(player.skills), 0);
        const weakSum = weak.players.reduce((sum, player) => sum + calcOverall(player.skills), 0);
        const newStrongOvr = (strongSum - strongOvr + weakOvr) / strong.players.length;
        const newWeakOvr = (weakSum - weakOvr + strongOvr) / weak.players.length;
        const newOveralls = overalls.map((value, index) => {
          if (index === strongIndex) return newStrongOvr;
          if (index === weakIndex) return newWeakOvr;
          return value;
        });
        const gain = spread - (Math.max(...newOveralls) - Math.min(...newOveralls));

        if (gain > bestGain) {
          bestGain = gain;
          best = { strongPlayer, weakPlayer };
        }
      }
    }

    if (!best) {
      break;
    }

    const strongPlayerIndex = strong.players.indexOf(best.strongPlayer);
    const weakPlayerIndex = weak.players.indexOf(best.weakPlayer);
    strong.players[strongPlayerIndex] = best.weakPlayer;
    weak.players[weakPlayerIndex] = best.strongPlayer;
  }
}

function createEmptyTeams(numTeams: number): FootballTeam[] {
  return Array.from({ length: numTeams }, (_, index) => ({
    name: `Time ${String.fromCharCode(65 + index)}`,
    players: [],
  }));
}

function balancedDraw(players: FootballPlayer[], numTeams: number): FootballTeam[] {
  const teams = createEmptyTeams(numTeams);

  const goalkeepers = shuffleWithinTiers(players.filter((player) => player.position === 'Goleiro'));
  const fieldPlayers = players.filter((player) => player.position !== 'Goleiro');
  const extraGoalkeepers = goalkeepers.slice(numTeams);
  const startTeam = Math.floor(Math.random() * numTeams);

  goalkeepers.slice(0, numTeams).forEach((goalkeeper, index) => {
    teams[(startTeam + index) % numTeams]!.players.push(goalkeeper);
  });

  const byPosition = new Map<string, FootballPlayer[]>();
  [...fieldPlayers, ...extraGoalkeepers].forEach((player) => {
    const position = player.position || 'Meia';
    const group = byPosition.get(position) ?? [];
    group.push(player);
    byPosition.set(position, group);
  });

  const positions = [...byPosition.keys()].sort(
    (a, b) => GROUP_ORDER.indexOf(POSITION_GROUPS[a] ?? 'meia') - GROUP_ORDER.indexOf(POSITION_GROUPS[b] ?? 'meia'),
  );

  for (const position of positions) {
    const sorted = shuffleWithinTiers(
      [...byPosition.get(position)!].sort((a, b) => calcOverall(b.skills) - calcOverall(a.skills)),
    );

    for (const player of sorted) {
      const ranked = teams
        .map((team) => ({
          team,
          totalCount: team.players.length,
          positionCount: team.players.filter((teamPlayer) => teamPlayer.position === position).length,
          overall: teamOverall(team.players),
        }))
        .sort((a, b) => {
          if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount;
          if (a.positionCount !== b.positionCount) return a.positionCount - b.positionCount;
          return a.overall - b.overall;
        });
      ranked[0]!.team.players.push(player);
    }
  }

  optimizeBalance(teams);

  return teams;
}

function randomDraw(players: FootballPlayer[], numTeams: number): FootballTeam[] {
  const teams = createEmptyTeams(numTeams);

  const goalkeepers = shuffle(players.filter((player) => player.position === 'Goleiro'));
  const rest = shuffle(players.filter((player) => player.position !== 'Goleiro'));

  goalkeepers.forEach((goalkeeper, index) => {
    if (index < numTeams) {
      teams[index]!.players.push(goalkeeper);
    } else {
      rest.push(goalkeeper);
    }
  });
  rest.forEach((player, index) => {
    teams[index % numTeams]!.players.push(player);
  });

  return teams;
}

export function runFootballDraw(players: FootballPlayer[], drawType: string, teamSize: number): FootballTeam[] {
  const numTeams = Math.max(2, Math.round(players.length / teamSize));
  return drawType === 'balanced' ? balancedDraw(players, numTeams) : randomDraw(players, numTeams);
}
