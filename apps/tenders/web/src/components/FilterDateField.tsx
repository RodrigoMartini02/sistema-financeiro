import { useEffect, useState } from 'react';
import { DateField } from '../../ui/DateField';
import { inputBase } from '../../ui/form';
import { brDateToIso, getLocalTodayIso, isoToBrDate } from '../../utils/date';

interface FilterDateFieldProps {
  label: string;
  /** AAAA-MM-DD; sem data, null. */
  value: string | null;
  onCommit: (iso: string | null) => void;
  disabled?: boolean;
}

/**
 * Data de filtro com o campo de data do sistema. Vale ao sair do campo ou ao
 * escolher no calendário, para a busca não rodar a cada tecla; vazio tira o
 * filtro e data incompleta não muda nada.
 */
export function FilterDateField({ label, value, onCommit, disabled = false }: FilterDateFieldProps) {
  const [text, setText] = useState(() => isoToBrDate(value ?? ''));
  const [invalid, setInvalid] = useState(false);

  // Filtro trocado de fora (atalho, chip, Limpar tudo): o texto acompanha.
  useEffect(() => {
    setText(isoToBrDate(value ?? ''));
    setInvalid(false);
  }, [value]);

  const commit = (finalText: string) => {
    if (finalText === '') {
      setInvalid(false);
      if (value !== null) onCommit(null);
      return;
    }
    const iso = brDateToIso(finalText);
    setInvalid(!iso);
    if (iso && iso !== value) onCommit(iso);
  };

  return (
    <DateField
      label={label}
      value={text}
      onChange={setText}
      onCommit={commit}
      todayIso={getLocalTodayIso()}
      invalid={invalid}
      disabled={disabled}
      inputClassName={`${inputBase} disabled:cursor-not-allowed disabled:opacity-50`}
    />
  );
}
