import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { CFG, CFG_MONO_CLASS, cfgRowStyle, cfgRowIndexStyle } from './configTokens';

type ColorScheme = 'brand' | 'red' | 'green';

interface ConfigListRowProps {
  index: number;
  nome: string;
  dataCriacao?: string;
  dataAtualizacao?: string;
  colorScheme?: ColorScheme;
  foto?: string | null;
  /** Conteúdo opcional entre a data e o chevron (badges de status, ações). */
  badges?: ReactNode;
  onClick: () => void;
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return null;
  }
}

// Cor de realce no hover. A linha em si é neutra; o esquema só tinge a borda
// e o índice, mantendo a distinção que as telas já faziam (contas = brand,
// categorias = red).
const SCHEME: Record<ColorScheme, string> = {
  brand: CFG.primary,
  red: '#dc2626',
  green: '#059669',
};

export function ConfigListRow({
  index, nome, dataCriacao, dataAtualizacao, colorScheme = 'brand', foto, badges, onClick,
}: ConfigListRowProps) {
  const criado = fmtDate(dataCriacao);
  const atualizado = fmtDate(dataAtualizacao);
  const accent = SCHEME[colorScheme];

  return (
    <button
      type="button"
      onClick={onClick}
      style={cfgRowStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.background = CFG.surfaceSunken;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = CFG.border;
        e.currentTarget.style.background = CFG.surface;
      }}
    >
      <span className={CFG_MONO_CLASS} style={cfgRowIndexStyle}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {foto && (
        <img
          src={foto}
          alt=""
          style={{ flex: 'none', height: 26, width: 26, borderRadius: 10, objectFit: 'cover' }}
        />
      )}

      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: CFG.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {nome}
      </span>

      {badges}

      {(criado || atualizado) && (
        <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
          {criado ?? atualizado}
        </span>
      )}

      <ChevronRight size={13} strokeWidth={2.2} style={{ flex: 'none', color: CFG.muted }} />
    </button>
  );
}
