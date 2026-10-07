// Nomes da empresa e das soluções e o contato, num lugar só. São provisórios
// até a Parte 4 (marca e domínio, .plans/proposta-empresa-produtos-site.md):
// a troca passa por aqui e pelos títulos de src/screens/public/publicPages.json.

export const COMPANY_NAME = 'FINGERENCE';

/** Conceito da empresa (plano .plans/site-novo.md, decisão 1). */
export const COMPANY_TAGLINE = 'Soluções de tecnologia para decidir com clareza.';

export const SITE_SOLUTIONS = ['finance', 'tenders'] as const;
export type SiteSolution = (typeof SITE_SOLUTIONS)[number];

export const SOLUTION_NAMES: Record<SiteSolution, string> = {
  finance: 'FINGERENCE Finanças',
  tenders: 'FINGERENCE Licitações',
};

/** O que cada solução resolve, numa frase (menu "Acessar" e cards). */
export const SOLUTION_TAGLINES: Record<SiteSolution, string> = {
  finance: 'O dinheiro da casa e da empresa organizados, sem planilha.',
  tenders: 'Os editais que interessam, com aviso antes do prazo.',
};

export const SUPPORT_CONTACT = {
  email: 'fingerence@gmail.com',
  whatsappLabel: '(49) 99955-4856',
  whatsappUrl: 'https://wa.me/5549999554856',
} as const;
