import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFirstAccessGuideCoordinator } from '../context/FirstAccessGuideContext';

const STORAGE_PREFIX = 'fingerence:first-access-guide';

function getActiveProfileScope() {
  if (typeof window === 'undefined') {
    return 'global';
  }

  try {
    return window.localStorage.getItem('perfilAtivoId') || 'global';
  } catch {
    return 'global';
  }
}

function readDismissed(key: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(key) === 'dismissed';
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, 'dismissed');
  } catch {
    return;
  }
}

export function useFirstAccessGuide(scope: string) {
  const storageKey = useMemo(() => STORAGE_PREFIX + ':' + getActiveProfileScope() + ':' + scope, [scope]);
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(storageKey));
  const { register, unregister, isActive } = useFirstAccessGuideCoordinator();

  useEffect(() => {
    setIsDismissed(readDismissed(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (isDismissed) return;
    register(scope);
    return () => unregister(scope);
  }, [scope, isDismissed, register, unregister]);

  const dismiss = useCallback(() => {
    writeDismissed(storageKey);
    setIsDismissed(true);
  }, [storageKey]);

  return {
    isVisible: !isDismissed && isActive(scope),
    dismiss,
  };
}
