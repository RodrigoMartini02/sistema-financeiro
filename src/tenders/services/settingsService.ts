import type { CollectionRun, CollectionStatus, NewTeamUser, Paginated, TeamChange, TeamMember } from '../types';
import { tendersRequest } from './tendersApi';

// Configurações do módulo: usuários (titular) e coleta (titular ou admin).

export function fetchTeam(): Promise<TeamMember[]> {
  return tendersRequest<TeamMember[]>('/team');
}

export function setTeamMemberAccess(userId: number, hasAccess: boolean): Promise<TeamChange> {
  return tendersRequest<TeamChange>(`/team/${userId}`, { method: 'PUT', body: JSON.stringify({ hasAccess }) });
}

/** Usuário novo do módulo, já com acesso. */
export function createTeamUser(user: NewTeamUser): Promise<TeamChange> {
  return tendersRequest<TeamChange>('/team', { method: 'POST', body: JSON.stringify(user) });
}

export function fetchCollectionStatus(): Promise<CollectionStatus> {
  return tendersRequest<CollectionStatus>('/collection/status');
}

export function fetchCollectionRuns(page: number, perPage: number): Promise<Paginated<CollectionRun>> {
  return tendersRequest<Paginated<CollectionRun>>(`/collection/runs?page=${page}&perPage=${perPage}`);
}
