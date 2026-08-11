import { Link } from 'react-router-dom';

interface SiteFooterProps {
  onOpenTermos?: () => void;
  onOpenPrivacidade?: () => void;
  tone?: 'dark' | 'light';
}

export function SiteFooter({ onOpenTermos, onOpenPrivacidade, tone = 'dark' }: SiteFooterProps = {}) {
  const isLight = tone === 'light';
  const legalLinkClass = [
    isLight ? 'site-neon-light-text-button' : 'site-neon-text-button',
    'transition',
  ].join(' ');

  return (
    <footer className={[
      'border-t',
      isLight ? 'border-slate-200 bg-white' : 'border-[rgba(14,196,216,0.10)] bg-[#040E12]',
    ].join(' ')}>
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8 xl:px-10">
        <div className="flex items-center gap-3">
          <img src="/icons/logo.png" alt="FINGERENCE" className="h-7 w-7 object-contain" />
          <p
            className={['tracking-[0.20em]', isLight ? 'text-slate-500' : 'text-site-textMuted'].join(' ')}
            style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 400, fontStyle: 'italic' }}
          >
            FINGERENCE
          </p>
          <span className="text-[11px] text-site-textMuted">·</span>
          <p className={['text-[11px]', isLight ? 'text-slate-500' : 'text-site-textMuted'].join(' ')}>
            © {new Date().getFullYear()}{' '}
            <a href="https://fin-gerence.com.br" target="_blank" rel="noopener noreferrer" className={['transition', isLight ? 'hover:text-slate-950' : 'hover:text-site-text'].join(' ')}>
              fin-gerence.com.br
            </a>
          </p>
        </div>

        <div className={['flex flex-wrap items-center gap-5 text-[11px] uppercase tracking-[0.14em]', isLight ? 'text-slate-500' : 'text-site-textMuted'].join(' ')}>
          {onOpenPrivacidade ? (
            <button type="button" onClick={onOpenPrivacidade} className={legalLinkClass}>Privacidade</button>
          ) : (
            <Link to="/privacidade/" className={legalLinkClass}>Privacidade</Link>
          )}
          {onOpenTermos ? (
            <button type="button" onClick={onOpenTermos} className={legalLinkClass}>Termos</button>
          ) : (
            <Link to="/termos/" className={legalLinkClass}>Termos</Link>
          )}
        </div>
      </div>
    </footer>
  );
}
