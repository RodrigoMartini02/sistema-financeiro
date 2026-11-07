// Numeros, valores e datas por extenso em pt-BR, para a resposta falada.
// A sintese le "R$ 640,00" de formas diferentes conforme o aparelho; escrito
// por extenso, sai igual em todos.

const UNITS = [
  '', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
];

const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];

const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Grupo de ate tres digitos. "cem" so quando exato: 100 é cem, 101 é cento e um. */
function spellUnder1000(value: number): string {
  if (value === 100) return 'cem';

  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(HUNDREDS[hundreds]!);

  if (rest > 0) {
    if (rest < 20) parts.push(UNITS[rest]!);
    else {
      const tens = Math.floor(rest / 10);
      const unit = rest % 10;
      parts.push(unit > 0 ? `${TENS[tens]} e ${UNITS[unit]}` : TENS[tens]!);
    }
  }

  return parts.join(' e ');
}

/** Inteiro por extenso, ate a casa dos milhoes. */
export function spellInteger(value: number): string {
  const rounded = Math.floor(Math.abs(value));
  if (rounded === 0) return 'zero';

  const millions = Math.floor(rounded / 1_000_000);
  const thousands = Math.floor((rounded % 1_000_000) / 1_000);
  const remainder = rounded % 1_000;
  const parts: string[] = [];

  if (millions > 0) {
    parts.push(millions === 1 ? 'um milhao' : `${spellUnder1000(millions)} milhoes`);
  }
  if (thousands > 0) {
    // "mil" nunca vem precedido de "um": 1.200 é "mil e duzentos".
    parts.push(thousands === 1 ? 'mil' : `${spellUnder1000(thousands)} mil`);
  }
  if (remainder > 0) parts.push(spellUnder1000(remainder));

  if (parts.length === 1) return parts[0]!;

  // "e" liga o ultimo grupo quando ele é pequeno ou redondo; senao, virgula.
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1).join(', ');
  const joinWithE = remainder === 0 || remainder < 100 || remainder % 100 === 0;
  return joinWithE ? `${head} e ${last}` : `${head}, ${last}`;
}

/** Valor em reais por extenso, com centavos quando houver. */
export function spellCurrency(value: number): string {
  const negative = value < 0;
  const total = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(total / 100);
  const cents = total % 100;

  const parts: string[] = [];
  if (reais > 0 || cents === 0) {
    parts.push(`${spellInteger(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cents > 0) {
    parts.push(`${spellInteger(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
  }

  const spelled = parts.join(' e ');
  return negative ? `menos ${spelled}` : spelled;
}

/** Percentual por extenso, com uma casa quando não for inteiro. */
export function spellPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.floor(Math.abs(rounded));
  const decimal = Math.round((Math.abs(rounded) - whole) * 10);
  const sign = rounded < 0 ? 'menos ' : '';

  if (decimal === 0) return `${sign}${spellInteger(whole)} por cento`;
  return `${sign}${spellInteger(whole)} vírgula ${spellInteger(decimal)} por cento`;
}

/** Data falada: "dia três de setembro"; sem o ano quando é o corrente. */
export function spellDate(iso: string, today = ''): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;

  const [, year, month, day] = match;
  const dayNumber = Number(day);
  const monthName = MONTHS[Number(month) - 1] ?? '';
  const sameYear = today.slice(0, 4) === year;

  const dayText = dayNumber === 1 ? 'primeiro' : spellInteger(dayNumber);
  const base = `dia ${dayText} de ${monthName}`;
  return sameYear ? base : `${base} de ${spellInteger(Number(year))}`;
}

/**
 * Rede de seguranca: mesmo instruido, o modelo as vezes devolve "R$ 640,00",
 * markdown ou percentual em digito. Aqui isso vira fala antes de chegar ao
 * sintetizador.
 */
export function toSpeakableText(text: string, today = ''): string {
  return text
    // Markdown primeiro, para os simbolos nao sobrarem no meio dos numeros.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/^\s*[-•]\s*/gm, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Datas ISO e brasileiras.
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y: string, m: string, d: string) => spellDate(`${y}-${m}-${d}`, today))
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, d: string, m: string, y: string) => (
      spellDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, today)
    ))
    // Valores em reais, com ou sem símbolo.
    .replace(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi, (_, raw: string) => (
      spellCurrency(Number(raw.replace(/\./g, '').replace(',', '.')))
    ))
    .replace(/\b(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*reais\b/gi, (_, raw: string) => (
      spellCurrency(Number(raw.replace(/\./g, '').replace(',', '.')))
    ))
    // Percentuais.
    .replace(/\b(\d+(?:[.,]\d+)?)\s*%/g, (_, raw: string) => spellPercent(Number(raw.replace(',', '.'))))
    // Números soltos que sobraram.
    .replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\b/g, (raw) => spellInteger(Number(raw.replace(/\./g, '').replace(',', '.'))))
    .replace(/\b\d+\b/g, (raw) => spellInteger(Number(raw)))
    .replace(/\s+/g, ' ')
    .trim();
}
