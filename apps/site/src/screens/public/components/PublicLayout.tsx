import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationType, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { SiteSolution } from '../../../brand';
import { setAuthOrigin, type AuthOrigin } from '../../../services/session';
import { LOGIN_REQUEST_PARAM } from '../../../utils/authOrigin';
import { publicPageFor } from '../../../utils/publicPages';
import { LoginModal } from './LoginModal';
import { PublicSiteContext, type PublicSiteActions } from './publicSiteContext';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/** Para onde a pessoa vai depois de entrar, conforme a solução do login. */
const AUTH_ORIGIN_BY_SOLUTION: Record<SiteSolution, AuthOrigin> = {
  finance: 'app',
  tenders: 'tenders',
};

const GOOGLE_LOGIN_RETURN_STATE = 'google-oauth';

interface LoginRequest {
  solution: SiteSolution;
  mode: 'login' | 'register';
}

/** O login com Google volta para /index.html com ?state=google-oauth. */
function isGoogleLoginReturn(): boolean {
  return new URLSearchParams(window.location.search).get('state') === GOOGLE_LOGIN_RETURN_STATE;
}

/**
 * Rolagem ao trocar de página: a página nova abre no topo, e o endereço com
 * âncora (ex.: /#solucoes) desce até a seção. Voltar e avançar ficam com o
 * navegador, que devolve a posição de antes. No primeiro carregamento, só a
 * âncora é tratada: a seção só existe depois que a página monta.
 */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const firstRender = isFirstRender.current;
    isFirstRender.current = false;

    if (navigationType === NavigationType.Pop && !firstRender) {
      return;
    }
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) {
      target.scrollIntoView();
      return;
    }
    if (!firstRender) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash, navigationType]);
}

/**
 * Moldura do site: cabeçalho, rodapé e o login de cada solução (plano
 * .plans/site-novo.md). As vitrines ficam fora dela.
 */
export function PublicLayout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const pageSolution = publicPageFor(pathname).solution;
  // Na volta do Google, o login abre para concluir a entrada sem gravar a
  // origem: a gravada antes de ir ao Google diz para qual solução a pessoa vai.
  const [login, setLogin] = useState<LoginRequest | null>(() =>
    isGoogleLoginReturn() ? { solution: 'finance', mode: 'login' } : null,
  );

  const openLogin = useCallback((request: LoginRequest) => {
    setAuthOrigin(AUTH_ORIGIN_BY_SOLUTION[request.solution]);
    setLogin(request);
  }, []);

  const closeLogin = useCallback(() => setLogin(null), []);

  useScrollOnNavigate();

  // `?entrar=1` na página de uma solução (o sistema dela manda para cá quem está
  // sem sessão ou acabou de sair): abre o login dela e limpa o endereço. Nas
  // páginas da empresa, é ignorado.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (pageSolution === null || !params.has(LOGIN_REQUEST_PARAM)) {
      return;
    }
    params.delete(LOGIN_REQUEST_PARAM);
    const remaining = params.toString();
    navigate({ pathname, search: remaining ? `?${remaining}` : '' }, { replace: true });
    openLogin({ solution: pageSolution, mode: 'login' });
  }, [navigate, openLogin, pageSolution, pathname, search]);

  const actions = useMemo<PublicSiteActions>(
    () => ({
      enter: (solution) => openLogin({ solution, mode: 'login' }),
      startFree: (solution) => openLogin({ solution, mode: 'register' }),
    }),
    [openLogin],
  );

  return (
    <PublicSiteContext.Provider value={actions}>
      <div className="flex min-h-screen flex-col bg-[#f8fbfb] text-slate-950">
        <SiteHeader pageSolution={pageSolution} />
        <main id="conteudo-principal" className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
      <LoginModal
        isOpen={login !== null}
        solution={login?.solution ?? 'finance'}
        initialMode={login?.mode ?? 'login'}
        onClose={closeLogin}
      />
    </PublicSiteContext.Provider>
  );
}
