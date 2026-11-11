import { z } from 'zod';
import { isValidCnpj, onlyDigits } from '@ui/utils/brazilDocuments';
import type { Competitor, CompetitorList, CompetitorSummary } from '../types';
import { formatIsoDate } from './dates';
import { formatCnpj } from './labels';

// Concorrentes monitorados (plano .plans/licitacoes-4-concorrentes-monitorados.md): o título e as linhas do card, o
// formulário (CNPJ e apelido, com as mesmas regras da API), os textos dos números e a busca na lista.

/** O apelido tem até 80 caracteres (API). */
export const MAX_COMPETITOR_NICKNAME_LENGTH = 80;

export const COMPETITOR_CNPJ_MESSAGE = 'CNPJ inválido: confira os 14 dígitos.';

const nicknameSchema = z.string().trim().max(MAX_COMPETITOR_NICKNAME_LENGTH, `Apelido com até ${MAX_COMPETITOR_NICKNAME_LENGTH} caracteres`);

/** Formulário de adicionar: o CNPJ (com ou sem pontuação, com os dígitos verificadores certos) e o apelido opcional. */
export const competitorFormSchema = z.object({
  cnpj: z.string().refine((value) => isValidCnpj(value), COMPETITOR_CNPJ_MESSAGE),
  nickname: nicknameSchema,
});
export type CompetitorFormValues = z.infer<typeof competitorFormSchema>;

/** Formulário de editar o apelido: o CNPJ não muda. */
export const competitorNicknameSchema = z.object({ nickname: nicknameSchema });
export type CompetitorNicknameValues = z.infer<typeof competitorNicknameSchema>;

export const EMPTY_COMPETITOR_FORM: CompetitorFormValues = { cnpj: '', nickname: '' };

/** Corpo de `POST /competitors`: o CNPJ só com os dígitos; apelido em branco não vai. */
export function competitorFormToBody(values: CompetitorFormValues): { cnpj: string; nickname?: string } {
  const nickname = values.nickname.trim();
  return { cnpj: onlyDigits(values.cnpj), ...(nickname !== '' ? { nickname } : {}) };
}

/** O título do card: o apelido; senão o nome no contrato mais recente; senão o CNPJ formatado. */
export function competitorTitle(competitor: Pick<Competitor, 'cnpj' | 'nickname'>, summary?: Pick<CompetitorSummary, 'name'> | null): string {
  return competitor.nickname ?? summary?.name ?? formatCnpj(competitor.cnpj);
}

/**
 * As linhas de contexto do card: o nome no contrato quando o título é o apelido (ajuda a reconhecer o concorrente) e o
 * CNPJ, a não ser que o título já seja o CNPJ.
 */
export function competitorContextLines(competitor: Pick<Competitor, 'cnpj' | 'nickname'>, summary?: Pick<CompetitorSummary, 'name'> | null): string[] {
  const lines: string[] = [];
  const name = summary?.name ?? null;
  if (competitor.nickname !== null && name !== null && name !== competitor.nickname) {
    lines.push(name);
  }
  if (competitor.nickname !== null || name !== null) {
    lines.push(`CNPJ ${formatCnpj(competitor.cnpj)}`);
  }
  return lines;
}

/** "N de 30 concorrentes", no cabeçalho da lista. */
export function competitorLimitText(count: number, limit: number): string {
  return `${count} de ${limit} ${limit === 1 ? 'concorrente' : 'concorrentes'}`;
}

/** Os números do card, na ordem da tela; sem o resumo do armazém (ainda carregando ou atualizando), nenhum. */
export function competitorMetrics(summary: CompetitorSummary | undefined): Array<{ label: string; value: string }> {
  if (!summary) return [];
  const count = (value: number) => value.toLocaleString('pt-BR');
  return [
    { label: 'Contratos', value: count(summary.total) },
    { label: 'Vigentes', value: count(summary.active) },
    { label: 'Novos em 30 dias', value: count(summary.last30Days) },
    { label: 'Último publicado', value: summary.lastPublishedAt ? formatIsoDate(summary.lastPublishedAt) : '—' },
  ];
}

/** O concorrente com este CNPJ (só dígitos) na lista da pessoa. */
export function findCompetitor(list: Pick<CompetitorList, 'items'> | undefined, cnpj: string): Competitor | undefined {
  return list?.items.find((item) => item.cnpj === cnpj);
}

/** O resumo do concorrente na resposta do armazém. */
export function findCompetitorSummary(items: readonly CompetitorSummary[] | undefined, cnpj: string): CompetitorSummary | undefined {
  return items?.find((item) => item.cnpj === cnpj);
}
