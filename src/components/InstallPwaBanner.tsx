import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { getConsent, CONSENT_RESOLVED_EVENT } from './CookieBanner';

const DISMISS_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    return !!until && Date.now() < Number(until);
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // ignore
  }
}

export function InstallPwaBanner() {
  const [cookiesResolved, setCookiesResolved] = useState(() => !!getConsent());
  const [dismissed, setDismissed] = useState(isDismissed);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    if (cookiesResolved) return;
    const handleResolved = () => setCookiesResolved(true);
    window.addEventListener(CONSENT_RESOLVED_EVENT, handleResolved);
    return () => window.removeEventListener(CONSENT_RESOLVED_EVENT, handleResolved);
  }, [cookiesResolved]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    dismiss();
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (installed || dismissed || !cookiesResolved) return null;

  const showAndroidBanner = !!installEvent;
  const showIosBanner = !installEvent && isIosSafari();

  if (!showAndroidBanner && !showIosBanner) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-cyan-200 bg-white p-4 shadow-2xl dark:border-cyan-900/70 dark:bg-slate-900">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0891b2] text-white">
          {showAndroidBanner ? <Download size={20} /> : <Share size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            Tenha o assistente na palma da sua mão, baixe agora mesmo
          </p>
          {showIosBanner && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Toque em Compartilhar e depois em "Adicionar à Tela de Início".
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {showAndroidBanner && (
              <button
                type="button"
                onClick={handleInstall}
                className="rounded-lg bg-[#0891b2] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0e7490]"
              >
                Instalar
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
