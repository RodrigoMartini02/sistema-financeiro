import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export type TagParseResult = { value: string } | { error: string };

interface TagInputProps {
  id?: string;
  /** Nome do campo para leitores de tela. */
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Confere e normaliza o texto digitado antes de virar etiqueta. */
  parse: (text: string) => TagParseResult;
  /** Como a etiqueta aparece (ex.: CNPJ com pontuação). */
  format?: (value: string) => string;
  placeholder?: string;
  maxItems: number;
  maxItemsMessage: string;
  /** A vírgula também fecha a etiqueta (termos); CNPJ só no Enter. */
  commaSeparates?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Lista de etiquetas (termos, CNPJs): Enter (ou vírgula) acrescenta, o "x"
 * remove, e o Backspace no campo vazio tira a última. Repetida não entra
 * (sem diferenciar maiúsculas).
 */
export function TagInput({
  id,
  label,
  values,
  onChange,
  parse,
  format = (value) => value,
  placeholder,
  maxItems,
  maxItemsMessage,
  commaSeparates = false,
  invalid = false,
  disabled = false,
}: TagInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (): boolean => {
    if (!text.trim()) return true;
    const result = parse(text);
    if ('error' in result) {
      setError(result.error);
      return false;
    }
    const key = result.value.toLocaleLowerCase('pt-BR');
    if (!values.some((existing) => existing.toLocaleLowerCase('pt-BR') === key)) {
      if (values.length >= maxItems) {
        setError(maxItemsMessage);
        return false;
      }
      onChange([...values, result.value]);
    }
    setText('');
    setError(null);
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || (commaSeparates && event.key === ',')) {
      event.preventDefault();
      add();
      return;
    }
    if (event.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const errorId = id ? `${id}-erro` : undefined;
  return (
    <div>
      <div
        className={[
          'flex min-h-8 flex-wrap items-center gap-1 rounded-[10px] border bg-white px-1.5 py-1 transition',
          'focus-within:border-[#0891b2] focus-within:ring-[3px] focus-within:ring-[rgba(8,145,178,0.12)]',
          'dark:bg-slate-700 dark:focus-within:border-brand-400',
          invalid || error ? 'border-red-400' : 'border-[#d8e0e8] dark:border-slate-600',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
          >
            <span className="truncate">{format(value)}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`Remover ${format(value)}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-brand-600 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            add();
          }}
          aria-label={label}
          aria-invalid={invalid || Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={values.length === 0 ? placeholder : undefined}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-[13px] font-medium text-[#0f172a] placeholder-[#9db0bb] outline-none dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[11px] font-medium text-[#dc2626]">
          {error}
        </p>
      )}
    </div>
  );
}
