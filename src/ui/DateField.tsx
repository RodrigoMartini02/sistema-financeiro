import {
  useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent,
} from 'react';
import { CalendarDays } from 'lucide-react';
import { brDateToIso, completeBrDate, getLocalTodayIso, isoToBrDate } from '../utils/date';
import { applyDateEdit, hasEmptyDigit, normalizeDateText } from '../utils/dateEditing';
import { CalendarPanel, calendarFooterButtonStyle } from './CalendarPanel';
import { C } from './dialogFormTokens';
import { FloatingPanel } from './FloatingPanel';

/** Borda da data inválida e fundo do campo desabilitado, os mesmos dos modais de lançamento. */
const INVALID_BORDER = '#fca5a5';
const DISABLED_BACKGROUND = '#f1f5f9';
const CALENDAR_WIDTH = 276;
/** Caixas a partir desta altura (formulários) usam o ícone maior. */
const TALL_FIELD_HEIGHT = 32;

/** Caixa padrão: a da grade dos modais de lançamento (28px, cantos de 8px, 12px). */
function defaultBoxStyle(height: number): CSSProperties {
  return {
    width: '100%', minWidth: 0, height, padding: '0 6px', boxSizing: 'border-box',
    border: `1px solid ${C.borderInput}`, borderRadius: 8, background: '#fff',
    fontSize: 12, color: C.text, outline: 'none', fontVariantNumeric: 'tabular-nums',
  };
}

/** Ícone do calendário dentro da caixa, à direita; compacto nas grades dos modais de lançamento. */
function calendarButtonSize(boxHeight: number): { icon: number; button: number } {
  return boxHeight >= TALL_FIELD_HEIGHT ? { icon: 14, button: 22 } : { icon: 12, button: 18 };
}

function calendarButtonStyle(size: number): CSSProperties {
  return {
    position: 'absolute', top: '50%', right: 2, transform: 'translateY(-50%)',
    display: 'grid', placeItems: 'center', width: size, height: size, padding: 0,
    border: 'none', borderRadius: 6, background: 'transparent',
  };
}

export interface DateFieldProps {
  /** dd/mm/aaaa; incompleta enquanto se digita. */
  value: string;
  onChange: (text: string) => void;
  todayIso: string;
  /** Nome do campo para leitores de tela. */
  label: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Ao sair do campo vazio, volta para esta data (dd/mm/aaaa). */
  emptyFallback?: string;
  /** Obrigatório: o calendário não oferece "Limpar". */
  required?: boolean;
  height?: number;
  /** Caixa com outro desenho (formulários, filtros). Sem ela, a caixa dos modais de lançamento. */
  inputStyle?: CSSProperties;
  /** Classes da caixa, para os lugares que usam Tailwind; com elas, a caixa padrão não entra. */
  inputClassName?: string;
  /** Sem o ícone do calendário: o período tem um só, para as duas datas. */
  hideCalendarButton?: boolean;
  /** Depois de completar a data (ao sair do campo ou escolher no calendário), com o texto final. */
  onCommit?: (text: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  id?: string;
}

/**
 * Campo de data do sistema: digitação dd/mm/aaaa em que o cursor não pula para
 * o fim (regras em `utils/dateEditing`) e ícone que abre o calendário. Ao sair
 * do campo, completa a data como antes ("5" é dia 5 deste mês).
 *
 * Cada tecla passa pelo evento nativo `beforeinput`, que o React não expõe com
 * o tipo da edição. O `onChange` fica de reserva para o que esse evento não
 * cobre (preenchimento automático, composição do teclado do celular, desfazer).
 */
export function DateField({
  value, onChange, todayIso, label, placeholder = 'dd/mm/aaaa', title, disabled = false, invalid = false,
  emptyFallback = '', required = false, height = 28, inputStyle, inputClassName, hideCalendarButton = false,
  onCommit, onKeyDown, id,
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const handleBeforeInput = (event: InputEvent) => {
      if (!event.cancelable) return;
      const result = applyDateEdit(
        {
          text: input.value,
          selectionStart: input.selectionStart ?? input.value.length,
          selectionEnd: input.selectionEnd ?? input.value.length,
        },
        { inputType: event.inputType, data: event.data ?? event.dataTransfer?.getData('text/plain') ?? null },
      );
      if (!result) return;
      event.preventDefault();
      if (result.text === input.value) {
        input.setSelectionRange(result.caret, result.caret);
        return;
      }
      pendingCaret.current = result.caret;
      onChangeRef.current(result.text);
    };
    input.addEventListener('beforeinput', handleBeforeInput);
    return () => input.removeEventListener('beforeinput', handleBeforeInput);
  }, []);

  // O valor novo chegou: o cursor volta para o lugar da edição (o React o põe no fim).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (pendingCaret.current === null || !input) return;
    const caret = Math.min(pendingCaret.current, input.value.length);
    pendingCaret.current = null;
    if (document.activeElement === input) {
      input.setSelectionRange(caret, caret);
    }
  }, [value]);

  const commit = () => {
    const completed = hasEmptyDigit(value) ? value : completeBrDate(value, todayIso) || emptyFallback;
    if (completed !== value) onChange(completed);
    onCommit?.(completed);
  };

  const pick = (text: string) => {
    onChange(text);
    onCommit?.(text);
    setCalendarOpen(false);
    inputRef.current?.focus();
  };

  const valueIso = brDateToIso(value);
  const invalidBorder: CSSProperties = invalid ? { border: `1px solid ${INVALID_BORDER}` } : {};
  const boxStyle: CSSProperties = inputClassName
    ? { ...inputStyle, ...invalidBorder }
    : {
        ...defaultBoxStyle(height), ...inputStyle, ...invalidBorder,
        ...(disabled ? { background: DISABLED_BACKGROUND, cursor: 'not-allowed' } : {}),
      };

  const iconSize = calendarButtonSize(typeof boxStyle.height === 'number' ? boxStyle.height : height);

  return (
    <div style={{ position: 'relative', minWidth: 0, width: boxStyle.width ?? '100%' }}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(normalizeDateText(event.target.value))}
        onBlur={commit}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        title={title}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={inputClassName}
        style={{ ...boxStyle, width: '100%', ...(hideCalendarButton ? {} : { paddingRight: iconSize.button + 3 }) }}
      />
      {!hideCalendarButton && (
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => setCalendarOpen((open) => !open)}
          aria-label={`Abrir o calendário: ${label}`}
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          style={{ ...calendarButtonStyle(iconSize.button), color: disabled ? C.placeholder : C.textFaint, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <CalendarDays size={iconSize.icon} />
        </button>
      )}
      <FloatingPanel
        open={calendarOpen}
        anchorRef={buttonRef}
        onClose={() => setCalendarOpen(false)}
        label={`Calendário: ${label}`}
        width={CALENDAR_WIDTH}
        align="end"
      >
        <CalendarPanel
          todayIso={todayIso}
          initialFocusIso={valueIso || todayIso}
          selectedIsos={valueIso ? [valueIso] : []}
          onDayClick={(iso) => pick(isoToBrDate(iso))}
          label={label}
          footer={(
            <>
              <button type="button" onClick={() => pick(isoToBrDate(todayIso))} style={calendarFooterButtonStyle}>Hoje</button>
              {!required && !emptyFallback && value && (
                <button type="button" onClick={() => pick('')} style={{ ...calendarFooterButtonStyle, color: C.textSoft }}>
                  Limpar
                </button>
              )}
            </>
          )}
        />
      </FloatingPanel>
    </div>
  );
}

export interface IsoDateFieldProps extends Omit<DateFieldProps, 'value' | 'onChange' | 'todayIso' | 'emptyFallback' | 'onCommit'> {
  /** aaaa-mm-dd; com ele o campo é controlado. */
  value?: string;
  /** aaaa-mm-dd inicial, para os formulários lidos por FormData. */
  defaultValue?: string;
  /** aaaa-mm-dd, ou '' com o campo vazio ou a data inválida (como o campo de data do navegador). */
  onChange?: (iso: string) => void;
  /** Campo escondido com a data em aaaa-mm-dd, para o FormData. */
  name?: string;
  todayIso?: string;
}

/**
 * Campo de data com o valor em aaaa-mm-dd, no lugar do campo de data do
 * navegador: controlado (`value`/`onChange`) ou dentro de um formulário lido
 * por FormData (`defaultValue`/`name`), mandando o mesmo formato de antes.
 */
export function IsoDateField({
  value, defaultValue, onChange, name, todayIso = getLocalTodayIso(), invalid = false, ...fieldProps
}: IsoDateFieldProps) {
  const [text, setText] = useState(() => isoToBrDate(value ?? defaultValue ?? ''));
  const [committed, setCommitted] = useState(false);
  const iso = brDateToIso(text);

  // Data trocada de fora (outra escolha, formulário limpo): o texto acompanha.
  useEffect(() => {
    if (value === undefined) return;
    setText((current) => (brDateToIso(current) === value ? current : isoToBrDate(value)));
  }, [value]);

  const handleChange = (nextText: string) => {
    setText(nextText);
    const nextIso = brDateToIso(nextText);
    if (nextIso !== iso) onChange?.(nextIso);
  };

  return (
    <>
      <DateField
        {...fieldProps}
        value={text}
        onChange={handleChange}
        todayIso={todayIso}
        invalid={invalid || (committed && text !== '' && !iso)}
        onCommit={() => setCommitted(true)}
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </>
  );
}
