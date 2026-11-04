import { Link } from 'react-router-dom';
import { COMPANY_NAME, COMPANY_TAGLINE, SITE_SOLUTIONS, SOLUTION_NAMES, SUPPORT_CONTACT } from '../../../brand';
import { pageOfSolution } from '../../../utils/publicPages';
import { SITE_CONTAINER } from './siteStyles';

interface FooterLink {
  label: string;
  to: string;
}

const SOLUTION_LINKS: FooterLink[] = SITE_SOLUTIONS.map((solution) => ({
  label: SOLUTION_NAMES[solution],
  to: pageOfSolution(solution).path,
}));

const COMPANY_LINKS: FooterLink[] = [
  { label: 'Sobre', to: '/sobre/' },
  { label: 'Contato', to: '/contato/' },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Termos de Uso', to: '/termos/' },
  { label: 'Privacidade', to: '/privacidade/' },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <ul className="mt-4 grid gap-2.5">
        {links.map(({ label, to }) => (
          <li key={to}>
            <Link
              to={to}
              className="site-neon-light-text-button rounded-md text-[14px] text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className={`${SITE_CONTAINER} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]`}>
        <div>
          <div className="flex items-center gap-3">
            <img src="/icons/fingerence-logo.webp" alt="" className="h-9 w-9 object-contain" />
            <p
              className="text-[13px] font-semibold uppercase tracking-[0.2em] text-slate-950"
              style={{ fontFamily: "'Cinzel', serif", fontStyle: 'italic' }}
            >
              {COMPANY_NAME}
            </p>
          </div>
          <p className="mt-4 max-w-[340px] text-[14px] leading-[1.7] text-slate-500">{COMPANY_TAGLINE}</p>
        </div>
        <FooterColumn title="Soluções" links={SOLUTION_LINKS} />
        <FooterColumn title="Empresa" links={COMPANY_LINKS} />
        <FooterColumn title="Legal" links={LEGAL_LINKS} />
      </div>
      <div className="border-t border-slate-100">
        <div className={`${SITE_CONTAINER} flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-slate-500`}>
          <p>
            © {new Date().getFullYear()} {COMPANY_NAME}. Todos os direitos reservados.
          </p>
          <a
            href={`mailto:${SUPPORT_CONTACT.email}`}
            className="site-neon-light-text-button rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {SUPPORT_CONTACT.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
