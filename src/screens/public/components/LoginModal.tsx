import { X } from 'lucide-react';
import { useEffect } from 'react';
import { SOLUTION_NAMES, type SiteSolution } from '../../../brand';
import { LoginPage } from '../LoginPage';

export type LoginModalMode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Licitações usa o login próprio: o cadastro já nasce com o teste dele. */
  solution: SiteSolution;
  initialMode?: LoginModalMode;
}

/** Login e cadastro sobre o site, na solução da página. */
export function LoginModal({ isOpen, onClose, solution, initialMode = 'login' }: LoginModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      // Com os termos abertos por cima, o Esc fecha só os termos.
      if (document.querySelector('[data-legal-modal="true"]')) {
        return;
      }
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const solutionName = SOLUTION_NAMES[solution];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#08343d]/24 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={solutionName}
        className="relative box-border max-h-[calc(100vh-24px)] w-[min(480px,calc(100vw-24px))] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_28px_90px_rgba(8,52,61,0.18)] scrollbar-thin"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icons/fingerence-logo.webp" alt="" className="h-7 w-7 object-contain" />
            <span className="text-[13px] font-semibold text-slate-950">{solutionName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="site-neon-light-icon-button flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100 bg-white/80 transition"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <LoginPage initialMode={initialMode} tone="light" context={solution === 'tenders' ? 'tenders' : undefined} />
      </div>
    </div>
  );
}
