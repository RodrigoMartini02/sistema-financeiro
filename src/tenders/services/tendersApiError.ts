// Erro da API do módulo com o status HTTP, para a entrada no módulo
// diferenciar conta sem o módulo (404), colaborador sem acesso (403),
// sessão vencida (401) e falha de rede (0).

export class TendersApiError extends Error {
  constructor(
    message: string,
    /** Status HTTP; 0 quando não houve resposta (rede). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'TendersApiError';
  }
}

export const NETWORK_ERROR_MESSAGE = 'Não foi possível falar com o servidor. Tente de novo em instantes.';

/** Erro a partir da resposta: a mensagem da API quando houver, senão a genérica. */
export function tendersErrorFrom(status: number, payload: unknown): TendersApiError {
  const message =
    typeof payload === 'object' && payload !== null && typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : undefined;
  return new TendersApiError(message ?? NETWORK_ERROR_MESSAGE, status);
}
