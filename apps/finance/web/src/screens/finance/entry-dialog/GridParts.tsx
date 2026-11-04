import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { C } from '../../../ui/dialogFormTokens';
import { ROW_GRID_CLASS } from './fieldStyles';

export type RowVariant = 'entry' | 'batch' | 'edit';

/** Asterisco dos campos obrigatórios. */
export function RequiredMark() {
  return <span style={{ color: C.danger }}>*</span>;
}

/** Estilo do cabeçalho das colunas. */
export const columnHeaderStyle = { fontSize: 11, fontWeight: 600, color: C.chipOffText };

/**
 * Uma linha da grade. A linha de entrada tem fundo e contorno próprios e é o
 * alvo do Shift+Enter; os itens do lote ficam sem fundo (com contorno só no
 * celular, onde os campos empilhados precisam de separação).
 */
export function GridRow({ variant, columnsClass, onFocus, children }: {
  variant: RowVariant;
  /** Modelo das colunas no desktop, de cada modal. */
  columnsClass: string;
  onFocus: () => void;
  children: ReactNode;
}) {
  const isEntry = variant === 'entry';
  return (
    <div
      onFocus={onFocus}
      data-entry-row={isEntry ? '' : undefined}
      className={[ROW_GRID_CLASS, columnsClass, isEntry ? '' : 'max-lg:shadow-[inset_0_0_0_1px_#eef2f6]'].join(' ')}
      style={{
        padding: isEntry ? 8 : '5px 8px', borderRadius: 10,
        background: isEntry ? C.panelBg : 'transparent',
        boxShadow: isEntry ? `inset 0 0 0 1px ${C.panelBorder}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** Campo da linha, com o rótulo visível só abaixo de 1024px (no desktop o cabeçalho das colunas faz esse papel). */
export function GridCell({ label, required = false, className = '', children }: {
  label?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {label && (
        <span className="lg:hidden" style={{ fontSize: 11, fontWeight: 600, color: C.chipOffText }}>
          {label}{required && <> <RequiredMark /></>}
        </span>
      )}
      {children}
    </div>
  );
}

/** "+" da linha de entrada: leva ao lote. Acende quando a linha tem algo digitado. */
export function AddToBatchButton({ filled, onClick }: { filled: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Adicionar ao lote (Shift+Enter)"
      aria-label="Adicionar ao lote"
      style={{
        width: 28, height: 28, padding: 0, border: 'none', borderRadius: 8, fontSize: 17, lineHeight: 1, cursor: 'pointer',
        background: filled ? C.primary : '#e6edf1', color: filled ? '#fff' : '#a3b6c0',
      }}
    >
      +
    </button>
  );
}

export function RemoveFromBatchButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remover do lote"
      aria-label="Remover do lote"
      className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
    >
      <Trash2 size={14} />
    </button>
  );
}
