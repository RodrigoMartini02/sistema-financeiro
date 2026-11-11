import { RequestInputError, readRecord } from '../utils/requestInput';

// Pedido da consulta de sanções (item 6): `POST /sanctions/check { personId? }`. Sem `personId`, a consulta é da empresa da
// conta; com ele, de uma pessoa do cofre (só o titular; a conta da pessoa é conferida no serviço). O documento nunca vem do
// pedido: o CNPJ é o da conta e o CPF é o gravado na pessoa.

export interface SanctionCheckInput {
  /** A pessoa a consultar; nulo: a empresa. */
  personId: number | null;
}

const INVALID_REQUEST_MESSAGE = 'Pedido inválido';
const INVALID_PERSON_MESSAGE = 'Pessoa inválida';

/** O corpo do pedido: ausente ou vazio, a empresa; `personId` tem de ser um inteiro positivo. Campo desconhecido é recusado. */
export function readSanctionCheckInput(body: unknown): SanctionCheckInput {
  if (body === undefined || body === null) {
    return { personId: null };
  }
  const record = readRecord(body, INVALID_REQUEST_MESSAGE);
  for (const key of Object.keys(record)) {
    if (key !== 'personId') {
      throw new RequestInputError(INVALID_REQUEST_MESSAGE);
    }
  }
  const personId = record['personId'];
  if (personId === undefined || personId === null) {
    return { personId: null };
  }
  if (typeof personId !== 'number' || !Number.isSafeInteger(personId) || personId < 1) {
    throw new RequestInputError(INVALID_PERSON_MESSAGE);
  }
  return { personId };
}
