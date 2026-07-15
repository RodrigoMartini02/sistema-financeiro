const API_BASE = 'https://api.football-data.org/v4';

export const SUPPORTED_COMPETITIONS = ['BSA', 'CL'] as const;
export type SupportedCompetition = (typeof SUPPORTED_COMPETITIONS)[number];

export interface ExternalMatch {
  externalMatchId: string;
  competition: SupportedCompetition;
  homeTeam: string;
  awayTeam: string;
  utcDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

interface FootballDataMatchesResponse {
  matches: FootballDataMatch[];
}

function getApiKey(): string {
  const key = process.env['FOOTBALL_DATA_API_KEY'];
  if (!key) {
    throw new Error('FOOTBALL_DATA_API_KEY não configurada');
  }
  return key;
}

function normalizeMatch(competition: SupportedCompetition, match: FootballDataMatch): ExternalMatch {
  return {
    externalMatchId: String(match.id),
    competition,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    utcDate: match.utcDate,
    status: match.status,
    homeScore: match.score.fullTime.home,
    awayScore: match.score.fullTime.away,
  };
}

export interface FetchMatchesOptions {
  matchday?: number;
  status?: 'SCHEDULED' | 'FINISHED';
}

export async function fetchCompetitionMatches(
  competition: SupportedCompetition,
  options: FetchMatchesOptions = {},
): Promise<ExternalMatch[]> {
  const url = new URL(`${API_BASE}/competitions/${competition}/matches`);
  if (options.matchday) {
    url.searchParams.set('matchday', String(options.matchday));
  }
  if (options.status) {
    url.searchParams.set('status', options.status);
  }

  const res = await fetch(url, {
    headers: { 'X-Auth-Token': getApiKey() },
  });

  if (!res.ok) {
    throw new Error(`football-data.org retornou ${res.status} para ${competition}`);
  }

  const data = (await res.json()) as FootballDataMatchesResponse;
  return data.matches.map((match) => normalizeMatch(competition, match));
}

export async function fetchMatchById(
  competition: SupportedCompetition,
  externalMatchId: string,
): Promise<ExternalMatch | null> {
  const res = await fetch(`${API_BASE}/matches/${externalMatchId}`, {
    headers: { 'X-Auth-Token': getApiKey() },
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`football-data.org retornou ${res.status} para partida ${externalMatchId}`);
  }

  const match = (await res.json()) as FootballDataMatch;
  return normalizeMatch(competition, match);
}
