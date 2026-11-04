// Erro da API do módulo com o status HTTP, para a entrada no módulo
// diferenciar conta sem o módulo (404), colaborador sem acesso (403),
// assinatura vencida (402), sessão vencida (401) e falha de rede (0). Na
// validação de formato (400), guarda também os erros por campo.

export interface ApiFieldError {
  field: string;
  message: string;
}

export class TendersApiError extends Error {
  constructor(
    message: string,
    /** Status HTTP; 0 quando não houve resposta (rede). */
    readonly status: number,
    readonly fieldErrors: ApiFieldError[] = [],
    /** `data` da resposta de erro (ex.: o papel e a conta no 402 da assinatura vencida). */
    readonly data: unknown = undefined,
    /** Código da resposta de erro, quando a API manda um (ex.: CONTRACT_STORE_UPDATING). */
    readonly code: string | undefined = undefined,
  ) {
    super(message);
    this.name = 'TendersApiError';
  }
}

export const NETWORK_ERROR_MESSAGE = 'Não foi possível falar com o servidor. Tente de novo em instantes.';

/** Código que a API manda quando os contratos estão sendo atualizados (o servidor acabou de subir ou trocou os arquivos). */
export const CONTRACT_STORE_UPDATING_CODE = 'CONTRACT_STORE_UPDATING';

export function isContractStoreUpdating(error: unknown): boolean {
  return error instanceof TendersApiError && error.code === CONTRACT_STORE_UPDATING_CODE;
}

/** Mensagem genérica da validação de formato da API; a tela mostra a do primeiro campo. */
const VALIDATION_ERROR_MESSAGE = 'Validation error';

function isFieldError(value: unknown): value is ApiFieldError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiFieldError).field === 'string' &&
    typeof (value as ApiFieldError).message === 'string'
  );
}

/** Erro a partir da resposta: a mensagem da API quando houver, senão a genérica. */
export function tendersErrorFrom(status: number, payload: unknown): TendersApiError {
  const body = typeof payload === 'object' && payload !== null
    ? (payload as { message?: unknown; errors?: unknown; data?: unknown; code?: unknown })
    : {};
  const fieldErrors = Array.isArray(body.errors) ? body.errors.filter(isFieldError) : [];
  const apiMessage = typeof body.message === 'string' ? body.message : undefined;
  const message = apiMessage === VALIDATION_ERROR_MESSAGE && fieldErrors[0] ? fieldErrors[0].message : apiMessage;
  return new TendersApiError(message ?? NETWORK_ERROR_MESSAGE, status, fieldErrors, body.data, typeof body.code === 'string' ? body.code : undefined);
}
