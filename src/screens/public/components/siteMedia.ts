// Vídeo e imagens do site, guardados em public/media/site/. A origem e a
// licença de cada arquivo ficam em public/media/site/CREDITS.md. As telas de
// Finanças saem da demonstração (demo.html?secao=...), com dados fictícios.

export const SITE_MEDIA = {
  heroVideo: '/media/site/hero.mp4',
  heroPoster: '/media/site/hero-poster.webp',
  financeCard: '/media/site/finance-card.webp',
  tendersCard: '/media/site/tenders-card.webp',
  financeScreens: {
    entries: '/media/site/finance-screen-entries.jpg',
    calendar: '/media/site/finance-screen-calendar.jpg',
    reports: '/media/site/finance-screen-reports.jpg',
  },
} as const;
