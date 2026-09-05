import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { CFG, cfgPrimaryButtonStyle } from './configTokens';

interface ConfigTabHeaderProps {
  /**
   * Texto do contador à esquerda (ex.: "3 contas ativas"). Opcional — telas
   * cujo filtro já exibe a contagem (ver ContasTab) omitem para não repetir.
   */
  countLabel?: ReactNode;
  /** Controles entre o contador e a ação (ex.: ToggleGroup de Ativas/Desativadas). */
  filters?: ReactNode;
  /** Rótulo do botão primário. Omitido, o botão não é renderizado. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Escape hatch para conteúdo posicionado em relação ao cabeçalho — na
   * prática, os FirstAccessGuideCard, que dependem do `position: relative`
   * deste container para ancorar.
   */
  children?: ReactNode;
}

/**
 * Cabeçalho padrão das telas de Configurações: contador à esquerda, filtros
 * opcionais, ação primária à direita.
 *
 * Existe porque esse bloco era repetido de forma idêntica em 7 tabs. Telas
 * cujo cabeçalho é uma busca (UsuariosTab, MembrosTab) continuam usando
 * `ListToolbar` — não força-se este componente onde ele não serve.
 */
export function ConfigTabHeader({
  countLabel, filters, actionLabel, onAction, children,
}: ConfigTabHeaderProps) {
  return (
    <div className="relative flex flex-wrap items-center gap-2.5">
      {countLabel && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: CFG.textSoft }}>
          {countLabel}
        </p>
      )}

      {filters}

      <div style={{ flex: 1 }} />

      {actionLabel && (
        <button type="button" style={cfgPrimaryButtonStyle} onClick={onAction}>
          <Plus size={12} strokeWidth={2.6} />
          {actionLabel}
        </button>
      )}

      {children}
    </div>
  );
}
