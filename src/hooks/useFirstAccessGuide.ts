import { useCallback, useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    setIsDismissed(readDismissed(storageKey));
  }, [storageKey]);

  const dismiss = useCallback(() => {
    writeDismissed(storageKey);
    setIsDismissed(true);
  }, [storageKey]);

  return {
    isVisible: !isDismissed,
    dismiss,
  };
}
