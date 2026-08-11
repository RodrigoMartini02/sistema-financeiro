import { X } from 'lucide-react';
import { useEffect } from 'react';
import { LoginPage } from '../LoginPage';

type LoginModalMode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  notice?: string;
  initialMode?: LoginModalMode;
  tone?: 'dark' | 'light';
}

export function LoginModal({ isOpen, onClose, notice, initialMode = 'login', tone = 'dark' }: LoginModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[data-legal-modal="true"]')) {
          return;
        }

        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLight = tone === 'light';

  return (
    <div
      className={[
        isLight ? '' : 'dark',
        'fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4',
        isLight ? 'bg-[#08343d]/24' : 'bg-[#040E12]/80',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        className={[
          'relative box-border max-h-[calc(100vh-24px)] w-[min(480px,calc(100vw-24px))] overflow-y-auto rounded-[22px] border p-5 scrollbar-thin',
          isLight
            ? 'border-slate-200 bg-white shadow-[0_28px_90px_rgba(8,52,61,0.18)]'
            : 'border-[rgba(14,196,216,0.24)] bg-[#061419] shadow-[0_28px_100px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(14,196,216,0.08)]',
        ].join(' ')}
      >
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="/icons/logo.png" alt="FINGERENCE" className="h-7 w-7 object-contain" />
            <p
              className={['tracking-[0.20em]', isLight ? 'text-slate-950' : 'text-site-text'].join(' ')}
              style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 600, fontStyle: 'italic' }}
            >
              FINGERENCE
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={[
              isLight ? 'site-neon-light-icon-button border-cyan-100 bg-white/80' : 'site-neon-icon-button',
              'flex h-8 w-8 items-center justify-center rounded-full border transition',
            ].join(' ')}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notice && (
          <p
            className={[
              'relative mb-3 rounded-lg border px-4 py-2.5 text-[13px]',
              isLight
                ? 'border-cyan-200 bg-cyan-50 text-slate-600'
                : 'border-[rgba(14,196,216,0.20)] bg-[rgba(14,196,216,0.06)] text-site-textSub',
            ].join(' ')}
          >
            {notice}
          </p>
        )}

        <div className="relative">
          <LoginPage initialMode={initialMode} tone={tone} />
        </div>
      </div>
    </div>
  );
}
