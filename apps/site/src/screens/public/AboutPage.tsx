import { Link } from 'react-router-dom';
import { EyeIcon, ShieldCheckIcon, TrendUpIcon, WalletIcon } from '@phosphor-icons/react';
import { COMPANY_NAME } from '../../brand';
import { formatPriceCents, FREE_TRIAL_DAYS, STARTING_PRICE_CENTS } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { FeatureGrid, type FeatureItem } from './components/FeatureGrid';
import { PageIntro } from './components/PageIntro';
import { ScrollReveal } from './components/ScrollReveal';
import { SolutionCards } from './components/SolutionCards';
import { ON_DARK_BUTTON, SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

const PRINCIPLES: FeatureItem[] = [
  { icon: EyeIcon, title: 'Transparência', description: 'Saldos, prazos e valores sempre visíveis, sem custos ocultos.' },
  {
    icon: ShieldCheckIcon,
    title: 'Segurança e privacidade',
    description: 'Sem conexão com a sua conta bancária, e os dados de cartão são processados pelo Mercado Pago.',
  },
  {
    icon: WalletIcon,
    title: 'Preço acessível',
    description: `Planos a partir de ${formatPriceCents(STARTING_PRICE_CENTS)} por mês, com ${FREE_TRIAL_DAYS} dias de avaliação gratuita.`,
  },
  { icon: TrendUpIcon, title: 'Evolução contínua', description: 'As soluções evoluem a partir do uso real e do retorno de quem as utiliza.' },
];

/** Quem é a FINGERENCE e o que guia o trabalho. */
export function AboutPage() {
  return (
    <>
      <PageIntro
        label="Sobre"
        title="Tecnologia que transforma informação em gestão."
        description={`A ${COMPANY_NAME} nasceu para organizar finanças sem depender de planilhas soltas. Hoje, também apoia empresas na busca e no acompanhamento de licitações públicas. Nas duas frentes, o compromisso é o mesmo: automatizar o que é repetitivo e entregar informação confiável, organizada e pronta para a decisão.`}
      />

      <FeatureGrid label="Nossos princípios" title="O que orienta o nosso trabalho." items={PRINCIPLES} columns={4} />

      <section className={`${SITE_SECTION} border-t border-slate-200/70`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Nossas soluções</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Conheça as soluções da {COMPANY_NAME}.</h2>
          </ScrollReveal>
          <div className="mt-10">
            <SolutionCards />
          </div>
        </div>
      </section>

      <CallToAction title="Fale com a nossa equipe." text="Dúvidas comerciais, suporte ou parcerias: estamos à disposição.">
        <Link to="/contato/" className={ON_DARK_BUTTON}>
          Falar com a equipe
        </Link>
      </CallToAction>
    </>
  );
}
