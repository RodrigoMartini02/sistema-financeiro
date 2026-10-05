// Data "hoje" no fuso local do navegador, no formato YYYY-MM-DD.
// new Date().toISOString() serializa em UTC e pode adiantar/atrasar o dia
// em relação ao horário local do usuário (ex: 23:xx em São Paulo já é o dia
// seguinte em UTC) — usar os getters locais evita esse desalinhamento.
export function getLocalTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Data N dias atrás (ou à frente, com N negativo) no fuso local, YYYY-MM-DD.
export function daysAgoLocalIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 2026-10-05 → 05/10/2026. Vazio quando não há data. */
export function isoToBrDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** 2026-10-05 → 05/10 (dia e mês, para resumos). */
export function isoToShortBrDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** 05/10/2026 → 2026-10-05. Vazio quando o texto está incompleto ou a data não existe (30/02). */
export function brDateToIso(text: string): string {
  // "_" é dígito apagado no meio pelo campo de data: a data está incompleta.
  if (text.includes('_')) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Data de um campo em ISO, completando como o campo faria ao perder o foco ("5" é
 * dia 5 deste mês). Assim salvar com Enter, ainda dentro do campo, grava a mesma
 * data que a tela vai mostrar. Vazio quando a data não existe.
 */
export function brDateInputToIso(text: string, todayIso: string): string {
  return brDateToIso(completeBrDate(text, todayIso));
}

/** Máscara durante a digitação: só dígitos, no formato dd/mm/aaaa. */
export function maskBrDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Complemento ao sair do campo: "5" vira dia 05 do mês e do ano de hoje, "0510"
 * vira 05/10 do ano de hoje e "051026" vira 05/10/2026. Outros tamanhos ficam
 * como foram digitados — a validação é que aponta a data incompleta.
 */
export function completeBrDate(text: string, todayIso: string): string {
  // Com dígito apagado no meio ("0_/10/2026"), completar mudaria o sentido dos outros dígitos.
  if (text.includes('_')) return text;
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const currentMonth = todayIso.slice(5, 7);
  const currentYear = todayIso.slice(0, 4);
  let day: string;
  let month: string;
  let year: string;
  if (digits.length <= 2) {
    [day, month, year] = [digits, currentMonth, currentYear];
  } else if (digits.length <= 4) {
    [day, month, year] = [digits.slice(0, 2), digits.slice(2), currentYear];
  } else if (digits.length === 6) {
    [day, month, year] = [digits.slice(0, 2), digits.slice(2, 4), `20${digits.slice(4)}`];
  } else {
    return text;
  }
  return `${pad2(Number(day))}/${pad2(Number(month))}/${year}`;
}
