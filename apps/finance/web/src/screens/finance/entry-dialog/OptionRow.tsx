import type { ReactNode } from 'react';
import { C } from '@ui/components/dialogFormTokens';

interface OptionRowProps {
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Controle da opção (quantidade, limite): aparece ao lado do texto só com a opção marcada. */
  children?: ReactNode;
}

/**
 * Uma opção dos menus de repetição e de cobrança. O marcador e o texto são um botão; o controle da opção fica ao lado
 * dele, nunca dentro, para o teclado e os leitores de tela tratarem cada um por si.
 */
export function OptionRow({ label, active, onSelect, children }: OptionRowProps) {
  const withControl = active && Boolean(children);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 34, paddingRight: 6, borderRadius: 8, background: active ? C.panelBg : 'transparent' }}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onSelect}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, minHeight: 32, padding: '0 8px', flex: withControl ? 'none' : 1,
          border: 'none', borderRadius: 8, background: 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 13, height: 13, flex: 'none', borderRadius: 7, boxShadow: 'inset 0 0 0 2px #fff',
            border: `1.5px solid ${active ? C.primary : '#cbd5e1'}`, background: active ? C.primary : '#fff',
          }}
        />
        {label}
      </button>
      {active && children}
    </div>
  );
}
