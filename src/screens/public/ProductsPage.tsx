import { Link } from 'react-router-dom';
import { FREE_TRIAL_DAYS } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { PageIntro } from './components/PageIntro';
import { SolutionCards } from './components/SolutionCards';
import { ON_DARK_BUTTON, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

/** "Produtos" no menu: as duas soluções em cards, cada um levando ao detalhe. */
export function ProductsPage() {
  return (
    <>
      <PageIntro
        label="Soluções"
        title="Escolha a solução certa para o seu dia a dia."
        description={`Cada solução tem ${FREE_TRIAL_DAYS} dias grátis, sem cartão de crédito. Clique para ver o que ela faz, as telas e os preços.`}
      />

      <section className={SITE_SECTION}>
        <div className={SITE_CONTAINER}>
          <SolutionCards />
        </div>
      </section>

      <CallToAction title="Ficou em dúvida?" text="Fale com a gente: ajudamos você a escolher a melhor opção.">
        <Link to="/contato/" className={ON_DARK_BUTTON}>
          Fale com a gente
        </Link>
      </CallToAction>
    </>
  );
}
