import { getUser } from './session';

export function getFirstAccessGuideUserScope(): string {
  return `user:${getUser()?.id ?? 'unknown'}`;
}
