// Data "hoje" fixada em America/Sao_Paulo, no formato YYYY-MM-DD, independente
// do fuso em que o processo Node está rodando (ex: UTC em produção). Mesma
// referência de fuso já usada na conexão do banco (ver db/client.ts).
const TIMEZONE = 'America/Sao_Paulo';

export function getTodayIsoInTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
