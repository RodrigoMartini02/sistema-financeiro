import type {
  CollectionRun,
  CollectionStatus,
  NewTeamUser,
  OwnerProfileChange,
  OwnerProfileUpdate,
  Paginated,
  TeamChange,
  TeamMember,
  TeamMemberChange,
  TeamUserUpdate,
} from '../types';
import { tendersRequest } from './tendersApi';

// Configurações do módulo: usuários e perfil do titular (só o titular) e coleta (titular ou admin).

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

export function updateTeamUser(userId: number, changes: TeamUserUpdate): Promise<TeamMemberChange> {
  return tendersRequest<TeamMemberChange>(`/team/${userId}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

/** `image` é o data URL do recorte (AvatarUploadDialog). */
export function uploadTeamUserPhoto(userId: number, image: string): Promise<TeamMemberChange> {
  return tendersRequest<TeamMemberChange>(`/team/${userId}/photo`, { method: 'PUT', body: JSON.stringify({ image }) });
}

export function removeTeamUserPhoto(userId: number): Promise<TeamMemberChange> {
  return tendersRequest<TeamMemberChange>(`/team/${userId}/photo`, { method: 'DELETE' });
}

export function fetchOwnerProfile(): Promise<OwnerProfileChange> {
  return tendersRequest<OwnerProfileChange>('/profile');
}

export function updateOwnerProfile(changes: OwnerProfileUpdate): Promise<OwnerProfileChange> {
  return tendersRequest<OwnerProfileChange>('/profile', { method: 'PATCH', body: JSON.stringify(changes) });
}

export function uploadOwnerPhoto(image: string): Promise<OwnerProfileChange> {
  return tendersRequest<OwnerProfileChange>('/profile/photo', { method: 'PUT', body: JSON.stringify({ image }) });
}

export function removeOwnerPhoto(): Promise<OwnerProfileChange> {
  return tendersRequest<OwnerProfileChange>('/profile/photo', { method: 'DELETE' });
}

export function fetchCollectionStatus(): Promise<CollectionStatus> {
  return tendersRequest<CollectionStatus>('/collection/status');
}

export function fetchCollectionRuns(page: number, perPage: number): Promise<Paginated<CollectionRun>> {
  return tendersRequest<Paginated<CollectionRun>>(`/collection/runs?page=${page}&perPage=${perPage}`);
}
