// Edição da data digitada (dd/mm/aaaa) no campo de data do sistema. O campo
// passa cada tecla (evento beforeinput) por estas regras, e o cursor não pula
// para o fim:
// - digitar no meio escreve por cima do dígito e o resto da data não anda;
// - apagar no meio deixa "_" no lugar do dígito ("0_/10/2026");
// - "/" (ou ".", "-", espaço) fecha a parte atual: "5/" vira "05/".

/** Posição de cada um dos 8 dígitos no texto dd/mm/aaaa. */
const DIGIT_POSITIONS: readonly number[] = [0, 1, 3, 4, 6, 7, 8, 9];
const DIGIT_COUNT = DIGIT_POSITIONS.length;
/** Primeiro dígito do dia, do mês e do ano, e o fim do ano. */
const PART_STARTS: readonly number[] = [0, 2, 4, 8];
const SLASH_POSITIONS = new Set([2, 5]);
const MAX_TEXT_LENGTH = 10;
export const EMPTY_DIGIT = '_';
const SEPARATORS = new Set(['/', '.', '-', ' ']);

export interface DateTextState {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface DateTextEdit {
  /** `InputEvent.inputType` do beforeinput. */
  inputType: string;
  /** Texto digitado ou colado; nulo nas exclusões. */
  data: string | null;
}

export interface DateTextResult {
  text: string;
  caret: number;
}

/** Os 8 dígitos da data: cada posição tem um dígito ou fica vazia (''). */
type DateDigits = string[];

const isDigit = (char: string | undefined) => char !== undefined && /\d/.test(char);

/** Texto já no formato do campo: dígitos ou "_" nos lugares dos dígitos e "/" nas barras. */
function isFieldText(text: string): boolean {
  if (text.length > MAX_TEXT_LENGTH) return false;
  return [...text].every((char, position) => (SLASH_POSITIONS.has(position) ? char === '/' : isDigit(char) || char === EMPTY_DIGIT));
}

/** Dígitos do texto: pelo lugar, quando o texto está no formato do campo; senão, na ordem em que aparecem. */
function readDigits(text: string): DateDigits {
  const digits: DateDigits = Array<string>(DIGIT_COUNT).fill('');
  if (isFieldText(text)) {
    DIGIT_POSITIONS.forEach((position, index) => {
      digits[index] = isDigit(text[position]) ? text[position]! : '';
    });
    return digits;
  }
  [...text.replace(/\D/g, '').slice(0, DIGIT_COUNT)].forEach((char, index) => {
    digits[index] = char;
  });
  return digits;
}

/** Texto dd/mm/aaaa: dígito vazio no meio vira "_", e o fim vazio não aparece ("05/1"). */
function formatDigits(digits: DateDigits): string {
  const lastFilled = digits.reduce((last, digit, index) => (digit ? index : last), -1);
  let text = '';
  for (let index = 0; index <= lastFilled; index += 1) {
    if (index === PART_STARTS[1] || index === PART_STARTS[2]) {
      text += '/';
    }
    text += digits[index] || EMPTY_DIGIT;
  }
  return text;
}

/** Texto do campo arrumado no formato dd/mm/aaaa (valor vindo de fora ou de uma edição que o campo não tratou). */
export function normalizeDateText(text: string): string {
  return formatDigits(readDigits(text));
}

/** Primeiro dígito no cursor ou depois dele; DIGIT_COUNT quando não há. */
function digitAtOrAfter(caret: number): number {
  const index = DIGIT_POSITIONS.findIndex((position) => position >= caret);
  return index < 0 ? DIGIT_COUNT : index;
}

/** Último dígito antes do cursor; -1 quando não há. */
function digitBefore(caret: number): number {
  return DIGIT_POSITIONS.reduce((found, position, index) => (position < caret ? index : found), -1);
}

/** Cursor depois do dígito, já do outro lado da barra quando ela vem em seguida. */
function caretAfterDigit(index: number): number {
  return DIGIT_POSITIONS[index + 1] ?? DIGIT_POSITIONS[index]! + 1;
}

/** Parte (0 dia, 1 mês, 2 ano) do dígito. */
function partOf(index: number): number {
  if (index < PART_STARTS[1]) return 0;
  if (index < PART_STARTS[2]) return 1;
  return 2;
}

function clearBetween(digits: DateDigits, start: number, end: number): void {
  DIGIT_POSITIONS.forEach((position, index) => {
    if (position >= start && position < end) {
      digits[index] = '';
    }
  });
}

/** "/" fecha o dia ou o mês: um dígito só ganha o zero na frente e o cursor vai para a parte seguinte. */
function closePart(digits: DateDigits, caret: number): number {
  const index = digitBefore(caret);
  if (index < 0) return caret;
  const part = partOf(index);
  if (part === 2) return caret;
  const tens = PART_STARTS[part]!;
  const units = tens + 1;
  if (!digits[tens] && !digits[units]) return caret;
  if (!digits[tens] || !digits[units]) {
    digits[units] = digits[units] || digits[tens]!;
    digits[tens] = '0';
  }
  return DIGIT_POSITIONS[PART_STARTS[part + 1]!]!;
}

function insertText(digits: DateDigits, caret: number, data: string): number {
  let current = caret;
  for (const char of data) {
    if (isDigit(char)) {
      const index = digitAtOrAfter(current);
      if (index >= DIGIT_COUNT) break;
      digits[index] = char;
      current = caretAfterDigit(index);
    } else if (SEPARATORS.has(char)) {
      current = closePart(digits, current);
    }
  }
  return current;
}

/** Apaga sem seleção; devolve o cursor. */
function deleteAtCaret(digits: DateDigits, caret: number, inputType: string): number {
  if (inputType === 'deleteContentBackward') {
    const index = digitBefore(caret);
    if (index < 0) return caret;
    digits[index] = '';
    return DIGIT_POSITIONS[index]!;
  }
  if (inputType === 'deleteContentForward') {
    const index = digitAtOrAfter(caret);
    if (index < DIGIT_COUNT) digits[index] = '';
    return caret;
  }
  if (inputType === 'deleteWordBackward') {
    const index = digitBefore(caret);
    if (index < 0) return caret;
    const partStart = DIGIT_POSITIONS[PART_STARTS[partOf(index)]!]!;
    clearBetween(digits, partStart, caret);
    return partStart;
  }
  if (inputType === 'deleteWordForward') {
    const index = digitAtOrAfter(caret);
    if (index >= DIGIT_COUNT) return caret;
    const partEnd = DIGIT_POSITIONS[PART_STARTS[partOf(index) + 1]! - 1]! + 1;
    clearBetween(digits, caret, partEnd);
    return caret;
  }
  if (inputType.endsWith('Backward')) {
    clearBetween(digits, 0, caret);
    return 0;
  }
  clearBetween(digits, caret, MAX_TEXT_LENGTH);
  return caret;
}

/**
 * Data colada inteira, em dd/mm/aaaa: "05/10/2026", "5/10/26", "05102026" ou
 * "2026-10-05" (também com horário). Nulo para qualquer outro texto. Não confere
 * se a data existe: o campo mostra o erro como numa data digitada.
 */
export function normalizePastedDate(text: string): string | null {
  const trimmed = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(trimmed);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const brazilian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(trimmed);
  if (brazilian) {
    const year = brazilian[3]!.length === 2 ? `20${brazilian[3]}` : brazilian[3]!;
    return `${brazilian[1]!.padStart(2, '0')}/${brazilian[2]!.padStart(2, '0')}/${year}`;
  }
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (compact) return `${compact[1]}/${compact[2]}/${compact[3]}`;
  return null;
}

/**
 * Aplica uma edição (tecla, colar, recortar) ao texto do campo. Nulo quando o
 * tipo de edição não é tratado aqui (desfazer, por exemplo): o campo deixa o
 * navegador agir e arruma o texto depois.
 */
export function applyDateEdit(state: DateTextState, edit: DateTextEdit): DateTextResult | null {
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  const digits = readDigits(state.text);
  let caret = start;

  if (edit.inputType.startsWith('insert')) {
    if (edit.inputType === 'insertLineBreak' || edit.inputType === 'insertParagraph') {
      return null;
    }
    const data = edit.data ?? '';
    const wholeDate = data.length > 1 ? normalizePastedDate(data) : null;
    if (wholeDate !== null) {
      return { text: wholeDate, caret: wholeDate.length };
    }
    clearBetween(digits, start, end);
    caret = insertText(digits, start, data);
  } else if (edit.inputType.startsWith('delete')) {
    if (end > start) {
      clearBetween(digits, start, end);
    } else {
      caret = deleteAtCaret(digits, start, edit.inputType);
    }
  } else {
    return null;
  }

  const text = formatDigits(digits);
  return { text, caret: Math.min(caret, text.length) };
}

/** Data com algum dígito apagado no meio ("0_/10/2026"): incompleta, não se completa ao sair do campo. */
export function hasEmptyDigit(text: string): boolean {
  return text.includes(EMPTY_DIGIT);
}
