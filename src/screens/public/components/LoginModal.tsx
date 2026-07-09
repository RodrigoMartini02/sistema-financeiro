import { X } from 'lucide-react';
import { LoginPage } from '../LoginPage';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  notice?: string;
}

export function LoginModal({ isOpen, onClose, notice }: LoginModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dark fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#040E12]/80 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative box-border w-[min(480px,calc(100vw-24px))] rounded-[22px] border border-[rgba(14,196,216,0.24)] bg-[#061419] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(14,196,216,0.08)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[rgba(14,196,216,0.06)] blur-3xl" />

        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="/icons/logo.png" alt="FINGERENCE" className="h-7 w-7 object-contain" />
            <p
              className="tracking-[0.20em] text-site-text"
              style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 600, fontStyle: 'italic' }}
            >
              FINGERENCE
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(14,196,216,0.18)] text-site-textMuted transition hover:border-site-accent hover:text-site-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notice && (
          <p className="relative mb-3 rounded-lg border border-[rgba(14,196,216,0.20)] bg-[rgba(14,196,216,0.06)] px-4 py-2.5 text-[13px] text-site-textSub">
            {notice}
          </p>
        )}

        <div className="relative">
          <LoginPage />
        </div>
      </div>
    </div>
  );
}
