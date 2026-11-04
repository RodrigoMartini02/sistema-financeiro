import { useEffect, useRef, useState } from 'react';

export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        registrationRef.current?.update().catch(() => {});
      }
    };

    const registerAndWatch = async () => {
      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        console.warn('Nao foi possivel registrar o modo instalado.', error);
        return;
      }
      registrationRef.current = registration;

      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });

      document.addEventListener('visibilitychange', handleVisibilityChange);
    };

    window.addEventListener('load', () => { void registerAndWatch(); }, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const applyUpdate = () => {
    registrationRef.current?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  return { updateAvailable, applyUpdate };
}
