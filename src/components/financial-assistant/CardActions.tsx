// Rodapé dos cards do assistente (lançamento e pagamento): "Salvar" e
// "Descartar" no modelo dos botões "Nova receita"/"Nova despesa" de
// Movimentações, sem ícone e com a mesma largura. No lugar de sempre:
// Salvar na ponta esquerda, Descartar na direita.
import type { CSSProperties } from 'react';
import { LoaderCircle } from 'lucide-react';
import { C, successOutlineButtonStyle } from '../../ui/dialogFormTokens';

/** Cabe o spinner com "Salvando…" sem o chip mudar de largura. */
const ACTION_WIDTH = 120;

const SAVE_STYLE: CSSProperties = { ...successOutlineButtonStyle, width: ACTION_WIDTH };

// Mesmo modelo do Salvar, em cinza: ação secundária.
const DISCARD_STYLE: CSSProperties = {
  ...successOutlineButtonStyle,
  width: ACTION_WIDTH,
  border: `1px solid ${C.chipOffBorder}`,
  color: C.chipOffText,
};

const BUSY_STYLE: CSSProperties = { opacity: 0.6, cursor: 'not-allowed' };

interface CardActionsProps {
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Descrição do Descartar para leitor de tela: diz o que deixa de ser salvo. */
  discardLabel: string;
}

export function CardActions({ isSaving, onSave, onDiscard, discardLabel }: CardActionsProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        style={isSaving ? { ...SAVE_STYLE, ...BUSY_STYLE } : SAVE_STYLE}
      >
        {isSaving && <LoaderCircle size={14} className="animate-spin" />}
        {isSaving ? 'Salvando…' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={onDiscard}
        aria-label={discardLabel}
        disabled={isSaving}
        style={isSaving ? { ...DISCARD_STYLE, ...BUSY_STYLE } : DISCARD_STYLE}
      >
        Descartar
      </button>
    </div>
  );
}
