// Nomes da empresa e das soluções e o contato, num lugar só. São provisórios
// até a Parte 4 (marca e domínio, .plans/proposta-empresa-produtos-site.md):
// a troca passa por aqui e pelos títulos de src/screens/public/publicPages.json.

export const COMPANY_NAME = 'FINGERENCE';

/** Frase da empresa: título da Início e rodapé (plano .plans/site-menu-textos-cards.md, decisão 2). */
export const COMPANY_TAGLINE = 'Inovação e automação para uma gestão mais eficiente.';

export const SITE_SOLUTIONS = ['finance', 'tenders'] as const;
export type SiteSolution = (typeof SITE_SOLUTIONS)[number];

export const SOLUTION_NAMES: Record<SiteSolution, string> = {
  finance: 'FINGERENCE Finanças',
  tenders: 'FINGERENCE Licitações',
};

export const SUPPORT_CONTACT = {
  email: 'fingerence@gmail.com',
  whatsappLabel: '(49) 99955-4856',
  whatsappUrl: 'https://wa.me/5549999554856',
  /** Prazo de resposta prometido na Início e no Contato (espaço fixo: o número não fica sozinho no fim da linha). */
  responseTime: '1 dia útil',
} as const;
