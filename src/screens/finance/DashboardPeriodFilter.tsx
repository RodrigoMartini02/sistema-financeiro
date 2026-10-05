import { MONTH_NAMES, type PainelPeriodo } from '../../types/finance';
import { DateRangeField } from '../../ui/DateRangeField';
import { isoToBrDate } from '../../utils/date';

interface Props {
  value: PainelPeriodo;
  onChange: (periodo: PainelPeriodo) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 01/01 a 31/12 do ano atual — período com que o Painel abre (e para onde o Limpar volta). */
export function periodoDoAnoAtual(hoje: Date = new Date()): PainelPeriodo {
  const ano = hoje.getFullYear();
  return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
}

/** "2026" para o ano inteiro; "setembro de 2026" para um mês inteiro; "10/09/2026 a 19/09/2026" para qualquer outro recorte. */
export function descreverPeriodo(periodo: PainelPeriodo): string {
  const [ano, mes] = periodo.de.split('-').map(Number);
  if (periodo.de === `${ano}-01-01` && periodo.ate === `${ano}-12-31`) {
    return String(ano);
  }
  const ultimoDia = new Date(ano!, mes!, 0).getDate();
  const ehMesInteiro = periodo.de.endsWith('-01')
    && periodo.ate === `${ano}-${pad(mes!)}-${pad(ultimoDia)}`;
  if (ehMesInteiro) {
    return `${MONTH_NAMES[mes! - 1]!.toLowerCase()} de ${ano}`;
  }
  return `${isoToBrDate(periodo.de)} a ${isoToBrDate(periodo.ate)}`;
}

/**
 * Período do Painel: dois cliques no calendário ou as datas digitadas. Vale na
 * hora (no segundo clique, no Enter ou ao sair de uma das datas), sem "Aplicar".
 */
export function DashboardPeriodFilter({ value, onChange }: Props) {
  return (
    <DateRangeField
      value={{ start: value.de, end: value.ate }}
      onChange={(range) => onChange({ de: range.start, ate: range.end })}
    />
  );
}
