import { useEffect, useState } from 'react';

/** Hora atual, renovada a cada minuto, para a contagem regressiva acompanhar o relógio. */
export function useNow(intervalMs = 60 * 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
