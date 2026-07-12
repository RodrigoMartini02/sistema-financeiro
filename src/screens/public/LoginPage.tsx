import { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  login, register, forgotPassword, verifyRecoveryCode, resetPassword,
  googleLogin, buildGoogleOAuthUrl, getGoogleRedirectUri,
} from '../../services/authService';
import { Button } from '../../ui/button';
import { Field, Input } from '../../ui/form';
import { TermosModal } from './TermosModal';

type Mode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

function saveSession(token: string, usuario: object) {
  sessionStorage.setItem('token', token);
  localStorage.setItem('token', token);
  localStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
  window.location.href = '/app.html';
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100 transition disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <path d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.5-.4-3.5z" fill="#FFC107"/>
          <path d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 7.5 29.5 5 24 5 16.2 5 9.4 9 6.3 14.7z" fill="#FF3D00"/>
          <path d="M24 44c5.3 0 10.1-2 13.7-5.2l-6.3-5.4C29.5 35.2 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.3C9.4 35.1 16.2 39 24 39V44z" fill="#4CAF50"/>
          <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.4C41 36.3 44 30.7 44 24c0-1.2-.1-2.5-.4-3.5z" fill="#1976D2"/>
        </svg>
      )}
      {loading ? 'Autenticando...' : 'Continuar com Google'}
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-slate-200 dark:bg-[rgba(14,196,216,0.18)]" />
      <span className="text-xs font-medium text-slate-400 dark:text-site-textMuted">ou</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-[rgba(14,196,216,0.18)]" />
    </div>
  );
}

export function LoginPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');
  const [termosAceitos, setTermosAceitos] = useState(false);
  const [modalTermos, setModalTermos] = useState<'termos' | 'privacidade' | null>(null);

  // Handle Google OAuth callback (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || state !== 'google-oauth') return;

    // Clear the code from URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('scope');
    url.searchParams.delete('authuser');
    url.searchParams.delete('prompt');
    window.history.replaceState({}, '', url.toString());

    setGoogleLoading(true);
    setError('');
    googleLogin(code, getGoogleRedirectUri())
      .then(({ token, usuario }) => saveSession(token, usuario))
      .catch((err) => {
        setGoogleLoading(false);
        setError(err instanceof Error ? err.message : 'Erro ao autenticar com Google');
      });
  }, []);

  const handleGoogleClick = () => {
    const redirectUri = getGoogleRedirectUri();
    const url = buildGoogleOAuthUrl(redirectUri);
    // Add state param to identify Google callback
    window.location.href = url + '&state=google-oauth';
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { token, usuario } = await login(fd.get('documento') as string, fd.get('senha') as string);
      saveSession(token, usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!termosAceitos) { setError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.'); return; }
    setError(''); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { token, usuario } = await register(
        fd.get('nome') as string, fd.get('documento') as string,
        fd.get('email') as string, fd.get('senha') as string,
      );
      saveSession(token, usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email') as string;
    try {
      const r = await forgotPassword(email);
      setRecoveryEmail(email);
      setSuccess(r.message);
      setMode('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação');
    } finally { setLoading(false); }
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const codigo = fd.get('codigo') as string;
      await verifyRecoveryCode(recoveryEmail, codigo);
      setVerifiedCode(codigo);
      setMode('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado');
    } finally { setLoading(false); }
  };

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const nova = fd.get('nova_senha') as string;
    const confirma = fd.get('confirma_senha') as string;
    if (nova !== confirma) { setError('As senhas não coincidem'); setLoading(false); return; }
    try {
      await resetPassword(recoveryEmail, verifiedCode, nova);
      setSuccess('Senha redefinida com sucesso!');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha');
    } finally { setLoading(false); }
  };

  const backToLogin = () => { setMode('login'); setError(''); setSuccess(''); };

  // Show full-screen Google loading while processing OAuth callback
  if (googleLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 size={32} className="animate-spin text-brand-600 dark:text-site-accent" />
        <p className="text-sm font-semibold text-slate-700 dark:text-site-textSub">Autenticando com Google...</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-site-accent">Acesso</p>

      {mode === 'login'    && <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-site-text">Entrar no painel</h2>}
      {mode === 'register' && <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-site-text">Criar conta</h2>}
      {mode === 'forgot'   && <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-site-text">Recuperar senha</h2>}
      {mode === 'verify'   && <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-site-text">Verificar código</h2>}
      {mode === 'reset'    && <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-site-text">Nova senha</h2>}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {success && !error && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300">
          {success}
        </div>
      )}

      {/* LOGIN */}
      {mode === 'login' && (
        <div className="mt-4 grid gap-3">
          <form className="grid gap-3" onSubmit={handleLogin}>
            <Field label="CPF ou CNPJ">
              <Input name="documento" autoComplete="username" required />
            </Field>
            <Field label="Senha">
              <Input name="senha" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" disabled={loading} className="w-full justify-center">
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setMode('register'); setError(''); }} className="text-sm text-slate-500 hover:text-brand-600 dark:text-site-textMuted dark:hover:text-site-accent transition-colors">
                Criar nova conta
              </button>
              <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-sm text-slate-500 hover:text-brand-600 dark:text-site-textMuted dark:hover:text-site-accent transition-colors">
                Esqueci minha senha
              </button>
            </div>
          </form>
          <Divider />
          <GoogleButton loading={googleLoading} onClick={handleGoogleClick} />
        </div>
      )}

      {/* REGISTER */}
      {mode === 'register' && (
        <div className="mt-4 grid gap-3">
          <form className="grid gap-3" onSubmit={handleRegister}>
            <Field label="Nome"><Input name="nome" required /></Field>
            <Field label="CPF ou CNPJ"><Input name="documento" required /></Field>
            <Field label="Email"><Input name="email" type="email" required /></Field>
            <Field label="Senha"><Input name="senha" type="password" required /></Field>

            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-[rgba(14,196,216,0.15)] dark:bg-[rgba(14,196,216,0.04)]">
              <input
                type="checkbox"
                checked={termosAceitos}
                onChange={(e) => { setTermosAceitos(e.target.checked); setError(''); }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600 dark:accent-site-accent"
              />
              <span className="text-xs text-slate-600 leading-relaxed dark:text-site-textSub">
                Li e aceito os{' '}
                <button type="button" onClick={() => setModalTermos('termos')} className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-site-accent dark:hover:opacity-80">
                  Termos de Uso
                </button>
                {' '}e a{' '}
                <button type="button" onClick={() => setModalTermos('privacidade')} className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-site-accent dark:hover:opacity-80">
                  Política de Privacidade
                </button>
                , incluindo o tratamento de dados conforme a LGPD.
              </span>
            </label>

            <Button type="submit" disabled={loading || !termosAceitos} className="w-full justify-center">
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
            <button type="button" onClick={backToLogin} className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:text-site-textMuted dark:hover:text-site-accent transition-colors">
              <ArrowLeft size={14} /> Voltar para o login
            </button>
          </form>
          <Divider />
          <GoogleButton loading={googleLoading} onClick={handleGoogleClick} />
        </div>
      )}

      {/* FORGOT PASSWORD */}
      {mode === 'forgot' && (
        <form className="mt-4 grid gap-3" onSubmit={handleForgot}>
          <p className="text-sm text-slate-500 dark:text-site-textSub">Informe o e-mail cadastrado e enviaremos um código de recuperação.</p>
          <Field label="E-mail cadastrado">
            <Input name="email" type="email" required placeholder="seu@email.com" />
          </Field>
          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? 'Enviando...' : 'Enviar código'}
          </Button>
          <button type="button" onClick={backToLogin} className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:text-site-textMuted dark:hover:text-site-accent transition-colors">
            <ArrowLeft size={14} /> Voltar para o login
          </button>
        </form>
      )}

      {/* VERIFY CODE */}
      {mode === 'verify' && (
        <form className="mt-4 grid gap-3" onSubmit={handleVerify}>
          <p className="text-sm text-slate-500 dark:text-site-textSub">
            Digite o código de 6 dígitos enviado para <strong className="dark:text-site-text">{recoveryEmail}</strong>.
            <br /><span className="text-xs text-slate-400 dark:text-site-textMuted">Válido por 15 minutos.</span>
          </p>
          <Field label="Código de recuperação">
            <Input name="codigo" maxLength={6} placeholder="000000" className="text-center text-2xl tracking-widest font-mono" required />
          </Field>
          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? 'Verificando...' : 'Verificar código'}
          </Button>
          <button type="button" onClick={() => setMode('forgot')} className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:text-site-textMuted dark:hover:text-site-accent transition-colors">
            <ArrowLeft size={14} /> Reenviar código
          </button>
        </form>
      )}

      {/* RESET PASSWORD */}
      {mode === 'reset' && (
        <form className="mt-4 grid gap-3" onSubmit={handleReset}>
          <p className="text-sm text-slate-500 dark:text-site-textSub">Escolha uma nova senha com pelo menos 8 caracteres.</p>
          <Field label="Nova senha">
            <Input name="nova_senha" type="password" required minLength={8} placeholder="••••••••" />
          </Field>
          <Field label="Confirmar senha">
            <Input name="confirma_senha" type="password" required minLength={8} placeholder="••••••••" />
          </Field>
          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </Button>
        </form>
      )}

      <TermosModal
        open={modalTermos !== null}
        tipo={modalTermos ?? 'termos'}
        onClose={() => setModalTermos(null)}
      />
    </div>
  );
}
