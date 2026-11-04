import { X } from 'lucide-react';
import { useEffect, useId } from 'react';
import { parseLegalText, type LegalBlock } from '../../utils/legalText';
import { PRIVACY_CONTENT, TERMS_CONTENT } from './legalContent';

interface ModalProps {
  open: boolean;
  tipo: 'termos' | 'privacidade';
  onClose: () => void;
}

function renderBlock(block: LegalBlock, index: number) {
  if (block.kind === 'heading') {
    return <p key={index} className="mt-4 first:mt-0 font-bold text-slate-900 text-sm">{block.text}</p>;
  }
  if (block.kind === 'item') {
    return <p key={index} className="ml-4 text-sm text-slate-600">• {block.text}</p>;
  }
  return <p key={index} className="text-sm text-slate-600 leading-relaxed">{block.text}</p>;
}

/** Termos ou privacidade numa janela: no cadastro e no aviso de cookies. */
export function TermosModal({ open, tipo, onClose }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const titulo = tipo === 'termos' ? 'Termos de Uso' : 'Política de Privacidade e LGPD';
  const conteudo = tipo === 'termos' ? TERMS_CONTENT : PRIVACY_CONTENT;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-legal-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Documento legal</p>
            <h2 id={titleId} className="text-lg font-bold text-slate-900">{titulo}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="site-neon-light-icon-button flex h-8 w-8 items-center justify-center rounded-lg border transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
          {parseLegalText(conteudo).map(renderBlock)}
        </div>
        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="site-neon-light-button rounded-lg border px-5 py-2 text-sm font-semibold transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
