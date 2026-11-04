import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { AboutPage } from './screens/public/AboutPage';
import { ContactPage } from './screens/public/ContactPage';
import { FinancePage } from './screens/public/FinancePage';
import { HomePage } from './screens/public/HomePage';
import { LegalPage } from './screens/public/LegalPage';
import { TendersPage } from './screens/public/TendersPage';
import { StorefrontPage } from './screens/public/storefront/StorefrontPage';
import { StorefrontCartPage } from './screens/public/storefront/StorefrontCartPage';
import { StorefrontCheckoutPage } from './screens/public/storefront/StorefrontCheckoutPage';
import { StorefrontOrderPage } from './screens/public/storefront/StorefrontOrderPage';
import { PublicLayout } from './screens/public/components/PublicLayout';
import { PublicSeo } from './screens/public/components/PublicSeo';
import { CookieBanner } from './components/CookieBanner';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { UpdatePwaBanner } from './components/UpdatePwaBanner';
import { trackPageView } from './services/analyticsService';

/** Vitrine de uma loja (link novo ou antigo) e as páginas dela: são da empresa, não do FINGERENCE. */
function isStorefrontPath(pathname: string): boolean {
  return /^\/(loja|catalogo)\/[^/]+(\/.*)?$/.test(pathname);
}

/**
 * Partes do site do FINGERENCE que não entram na vitrine: SEO, contagem de
 * acessos, aviso de cookies e o convite para instalar o app.
 */
function MarketingSiteOnly({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return isStorefrontPath(pathname) ? null : <>{children}</>;
}

function PublicPageTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

function PublicSite() {
  return (
    <BrowserRouter>
      <MarketingSiteOnly>
        <PublicPageTracker />
        <PublicSeo />
      </MarketingSiteOnly>
      <Routes>
        {/* Site da empresa (plano .plans/site-novo.md), dentro da moldura comum. */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          {/* A volta do login com Google chega em /index.html. */}
          <Route path="/index.html" element={<HomePage />} />
          <Route path="/financas" element={<FinancePage />} />
          <Route path="/licitacoes" element={<TendersPage />} />
          <Route path="/sobre" element={<AboutPage />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/termos" element={<LegalPage type="termos" />} />
          <Route path="/privacidade" element={<LegalPage type="privacidade" />} />
          <Route path="*" element={<HomePage />} />
        </Route>
        <Route path="/loja/:storefront" element={<StorefrontPage />} />
        <Route path="/loja/:storefront/sacola" element={<StorefrontCartPage />} />
        <Route path="/loja/:storefront/checkout" element={<StorefrontCheckoutPage />} />
        <Route path="/loja/:storefront/pedido/:pedidoId" element={<StorefrontOrderPage />} />
        {/* Link antigo da vitrine, com o código: continua abrindo a mesma loja. */}
        <Route path="/catalogo/:storefront" element={<StorefrontPage />} />
      </Routes>
      <MarketingSiteOnly>
        <CookieBanner />
        <InstallPwaBanner />
      </MarketingSiteOnly>
    </BrowserRouter>
  );
}

/** Site da empresa e vitrines públicas: index.html e as páginas geradas por rota. */
export function SiteApp() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <FirstAccessGuideProvider>
          <PublicSite />
          <UpdatePwaBanner />
        </FirstAccessGuideProvider>
      </ConfirmProvider>
    </AppProvider>
  );
}
