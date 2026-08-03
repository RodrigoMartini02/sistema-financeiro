import { useState } from 'react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { CookieBanner } from '../../components/CookieBanner';
import { PRIVACIDADE_CONTEUDO, TERMOS_CONTEUDO } from './TermosModal';

type LegalPageProps = {
  type: 'termos' | 'privacidade';
};

function renderLegalContent(content: string) {
  return content.trim().split('\n').map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      return (
        <h2 key={index} className="mt-8 first:mt-0 text-[18px] font-semibold leading-[1.35] text-site-text">
          {trimmed.replace(/\*\*/g, '')}
        </h2>
      );
    }

    if (trimmed.startsWith('•') || trimmed.startsWith('â€¢')) {
      return (
        <li key={index} className="ml-5 list-disc text-[14px] leading-[1.75] text-site-textSub">
          {trimmed.replace(/^â€¢\s?/, '').replace(/^•\s?/, '')}
        </li>
      );
    }

    return (
      <p key={index} className="text-[14px] leading-[1.8] text-site-textSub">
        {trimmed}
      </p>
    );
  });
}

export function LegalPage({ type }: LegalPageProps) {
  const [loginOpen, setLoginOpen] = useState(false);
  const isPrivacy = type === 'privacidade';
  const title = isPrivacy ? 'Política de Privacidade e LGPD' : 'Termos de Uso';
  const description = isPrivacy
    ? 'Informações sobre coleta, uso, segurança, retenção e direitos dos titulares de dados no FINGERENCE.'
    : 'Condições de acesso, responsabilidades, uso aceitável e regras gerais de utilização do FINGERENCE.';
  const content = isPrivacy ? PRIVACIDADE_CONTEUDO : TERMOS_CONTEUDO;

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero label="DOCUMENTO LEGAL" title={title} description={description} />

      <main id="conteudo-principal" className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <article className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 xl:py-16">
          <div className="rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.20)] sm:p-8">
            <div className="space-y-3">{renderLegalContent(content)}</div>
          </div>
        </article>
      </main>

      <SiteFooter />
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <CookieBanner />
    </div>
  );
}