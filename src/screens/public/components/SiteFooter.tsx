import { Link } from 'react-router-dom';

interface SiteFooterProps {
  onOpenTermos: () => void;
  onOpenPrivacidade: () => void;
}

export function SiteFooter({ onOpenTermos, onOpenPrivacidade }: SiteFooterProps) {
  return (
    <footer className="border-t border-[rgba(14,196,216,0.10)] bg-[#040E12]">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8 xl:px-10">
        <div className="flex items-center gap-3">
          <img src="/icons/logo.png" alt="FINGERENCE" className="h-7 w-7 object-contain" />
          <p
            className="tracking-[0.20em] text-site-textMuted"
            style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 400, fontStyle: 'italic' }}
          >
            FINGERENCE
          </p>
          <span className="text-[11px] text-site-textMuted">·</span>
          <p className="text-[11px] text-site-textMuted">
            © {new Date().getFullYear()}{' '}
            <a href="https://fin-gerence.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-site-text transition">
              fin-gerence.com.br
            </a>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-[11px] uppercase tracking-[0.14em] text-site-textMuted">
          <button type="button" onClick={onOpenPrivacidade} className="hover:text-site-text transition">Privacidade</button>
          <button type="button" onClick={onOpenTermos} className="hover:text-site-text transition">Termos</button>
        </div>
      </div>
    </footer>
  );
}
