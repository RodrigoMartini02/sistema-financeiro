import { CFG } from './configTokens';

interface ConfigSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /**
   * Em filtros, o azul indica o estado padrão (desligado). Quando os dois
   * estados são escolhas válidas — como tipo de conta — o controle fica sempre
   * azul e só a bolinha se move.
   */
  alwaysOn?: boolean;
}

/**
 * Switch inline para a barra de ações das telas de Configurações.
 *
 * Diferente de `ToggleRow` (src/ui/form.tsx), que é uma linha de 52px com card
 * própria — usada em listas de permissões. Este é compacto para conviver com o
 * contador e o botão de ação na mesma linha.
 */
export function ConfigSwitch({ checked, onChange, label, alwaysOn = false }: ConfigSwitchProps) {
  const highlighted = alwaysOn || !checked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
        fontSize: 12, fontWeight: 600, color: highlighted ? CFG.primaryDark : CFG.textSoft,
        transition: 'color .13s ease',
      }}
    >
      <span
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center',
          width: 30, height: 17, flex: 'none', borderRadius: 999,
          background: highlighted ? CFG.primary : '#cbd5e1',
          transition: 'background .16s ease',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: 2,
            width: 13, height: 13, borderRadius: '50%', background: '#fff',
            boxShadow: '0 1px 2px rgba(15,23,42,.2)',
            transform: checked ? 'translateX(13px)' : 'translateX(0)',
            transition: 'transform .16s ease',
          }}
        />
      </span>
      {label}
    </button>
  );
}
