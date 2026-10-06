import type { CollectionRun, CollectionStatus, Paginated, TeamMember } from '../types';
import { tendersRequest } from './tendersApi';

// Configurações do módulo: equipe (titular) e coleta (titular ou admin).

export function fetchTeam(): Promise<TeamMember[]> {
  return tendersRequest<TeamMember[]>('/team');
}

export function setTeamMemberAccess(userId: number, hasAccess: boolean): Promise<TeamMember> {
  return tendersRequest<TeamMember>(`/team/${userId}`, { method: 'PUT', body: JSON.stringify({ hasAccess }) });
}

export function fetchCollectionStatus(): Promise<CollectionStatus> {
  return tendersRequest<CollectionStatus>('/collection/status');
}

export function fetchCollectionRuns(page: number, perPage: number): Promise<Paginated<CollectionRun>> {
  return tendersRequest<Paginated<CollectionRun>>(`/collection/runs?page=${page}&perPage=${perPage}`);
}
