/** Only operation labels belong in authentication logs; errors can contain SQL parameters or provider payloads. */
export type AuthOperation =
  | 'login'
  | 'registration'
  | 'forgot-password'
  | 'verify-recovery-code'
  | 'reset-password'
  | 'google'
  | 'recovery-email'
  | 'authenticate'
  | 'create-admin';

export function logAuthFailure(operation: AuthOperation): void {
  console.error('[Tenders auth] Unexpected failure:', { operation });
}
