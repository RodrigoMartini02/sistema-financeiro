import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { formatCurrency } from '../formatters';
import { ellipsisStyle, fieldStyle } from './fieldStyles';

/** Uma sugestão do histórico: descrição, um detalhe (forma de pagamento, cliente) e o valor. */
export interface DescriptionOption {
  description: string;
  detail: string;
  amount: number;
}

interface DescriptionFieldProps {
  value: string;
  onChange: (text: string) => void;
  /** Sugestões do histórico para o texto digitado (já sem repetição). */
  options: DescriptionOption[];
  onPick: (index: number) => void;
  /** Tab sem Shift: aceitar a categoria sugerida (o foco segue para o próximo campo). */
  onTab?: () => void;
  placeholder: string;
  invalid?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Descrição com o autocomplete do histórico: abre a partir de 2 letras, ↑↓ andam
 * pela lista, Enter escolhe (sem salvar o modal) e Esc fecha só a lista.
 */
export function DescriptionField({ value, onChange, options, onPick, onTab, placeholder, invalid = false, inputRef }: DescriptionFieldProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const showList = open && options.length > 0 && value.trim().length >= 2;

  const pick = (index: number) => {
    setOpen(false);
    onPick(index);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((index) => (index <= 0 ? options.length - 1 : index - 1));
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        pick(highlighted >= 0 && highlighted < options.length ? highlighted : 0);
        return;
      }
    }
    if (event.key === 'Tab' && !event.shiftKey && onTab) {
      setOpen(false);
      onTab();
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        aria-label="Descrição"
        aria-autocomplete="list"
        aria-expanded={showList}
        autoComplete="off"
        maxLength={255}
        style={fieldStyle({ invalid })}
      />
      <FloatingPanel
        open={showList}
        anchorRef={ref}
        onClose={() => setOpen(false)}
        label="Sugestões do histórico"
        minWidth={320}
        padding={6}
        sheetOnSmallScreens={false}
        keepAnchorFocus
      >
        <div role="listbox" aria-label="Sugestões do histórico" style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ padding: '3px 8px 6px', fontSize: 11, color: C.textFaint }}>Do seu histórico · ↑↓ e Enter</span>
          {options.map((option, index) => (
            <div
              key={option.description}
              role="option"
              aria-selected={index === highlighted}
              onClick={() => pick(index)}
              onMouseEnter={() => setHighlighted(index)}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', height: 32,
                padding: '0 8px', borderRadius: 7, cursor: 'pointer', background: index === highlighted ? C.primarySoft : 'transparent',
              }}
            >
              <span style={{ ...ellipsisStyle, fontSize: 12, color: C.text }}>{option.description}</span>
              <span style={{ fontSize: 11, color: C.textSoft }}>{option.detail}</span>
              <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(option.amount)}</span>
            </div>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}
