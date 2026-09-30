import type { KeyboardEvent, ReactNode } from 'react';
import { Dialog } from '../../../ui/dialog';
import { C, dialogFooterStyle, saveButtonDisabledStyle, saveButtonStyle } from '../../../ui/dialogFormTokens';
import { formatCurrency } from '../formatters';
import type { SavingProgress } from './batchState';
import { SEPARATOR } from './fieldStyles';

export type FooterTone = 'neutral' | 'warning' | 'danger';

const FOOTER_COLORS: Record<FooterTone, string> = {
  neutral: C.textSoft,
  warning: C.warn,
  danger: C.danger,
};

export interface ItemNoun {
  singular: string;
  plural: string;
}

interface EntryDialogFrameProps {
  title: string;
  description: string;
  onRequestClose: () => void;
  onSave: () => void;
  /** Shift+Enter na linha de entrada. Sem ele (edição), o atalho não faz nada. */
  onAddToBatch?: () => void;
  /** Topo fixo: barra, cabeçalho das colunas e a linha de entrada com o resumo. */
  top: ReactNode;
  /** O lote; null quando está vazio. */
  batch: { count: number; sumCents: number; header: ReactNode; rows: ReactNode } | null;
  /** "despesa"/"despesas", "receita"/"receitas". */
  itemNoun: ItemNoun;
  footerMessage: string;
  footerTone: FooterTone;
  saveLabel: string;
  /** Sem nada a gravar, o botão fica apagado — mas o clique ainda mostra o que falta. */
  canSave: boolean;
  saving: SavingProgress | null;
  toast: string | null;
}

/**
 * Estrutura dos modais de lançamento em grade. Altura fixa de ~85% da tela: no
 * desktop o topo (barra, cabeçalho e linha de entrada) fica preso e o lote ocupa
 * e rola no espaço que sobra; abaixo de 1024px o corpo inteiro rola, porque os
 * campos empilhados ocupam muito espaço.
 *
 * Enter num campo salva; Shift+Enter na linha de entrada leva ao lote. Dentro do
 * autocomplete e dos popovers o Enter é deles (eles marcam o evento).
 */
export function EntryDialogFrame({
  title, description, onRequestClose, onSave, onAddToBatch, top, batch, itemNoun,
  footerMessage, footerTone, saveLabel, canSave, saving, toast,
}: EntryDialogFrameProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT' || target.closest('[data-floating-panel]')) return;
    event.preventDefault();
    if (!event.shiftKey) onSave();
    else if (onAddToBatch && target.closest('[data-entry-row]')) onAddToBatch();
  };

  return (
    <Dialog open title={title} description={description} onClose={onRequestClose} size="xxl" scrollBody={false} fullHeight>
      <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3.5 pt-3.5 lg:overflow-hidden xl:px-5">
          <div className="flex-none">{top}</div>

          {batch && (
            <div className="flex flex-col lg:min-h-0 lg:flex-1">
              <div className="flex-none" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '20px 8px 8px', borderBottom: `1px solid ${SEPARATOR}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>No lote</span>
                <span style={{ fontSize: 12, color: C.textSoft }}>
                  {batch.count === 1 ? `1 ${itemNoun.singular}` : `${batch.count} ${itemNoun.plural}`}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textSoft }}>
                  soma <span style={{ fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>{formatCurrency(batch.sumCents / 100)}</span>
                </span>
              </div>
              <div className="flex-none">{batch.header}</div>
              <div className="scrollbar-thin flex flex-col gap-2 pt-2 lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-y-auto lg:pt-0">
                {batch.rows}
              </div>
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          <span role={footerTone === 'danger' ? 'alert' : undefined} style={{ flex: 1, minWidth: 0, fontSize: 12, color: FOOTER_COLORS[footerTone] }}>
            {footerMessage}
          </span>
          <button type="button" onClick={onSave} disabled={!!saving} style={canSave ? saveButtonStyle : saveButtonDisabledStyle}>
            {saveLabel}
          </button>
        </div>

        {saving && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-white/85" role="status">
            <span style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>
              {saving.total > 1 ? `Salvando ${itemNoun.plural}... ${saving.current} de ${saving.total}` : `Salvando ${itemNoun.singular}...`}
            </span>
            <div style={{ width: 200, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((saving.current / saving.total) * 100)}%`, background: C.primary, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {toast && (
          <div
            role="status"
            className="fixed bottom-7 left-1/2 z-50 flex h-[38px] -translate-x-1/2 items-center rounded-full px-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
            style={{ background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 500 }}
          >
            {toast}
          </div>
        )}
      </div>
    </Dialog>
  );
}
