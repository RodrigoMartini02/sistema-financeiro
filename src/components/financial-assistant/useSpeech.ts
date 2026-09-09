import { useCallback, useEffect, useRef, useState } from 'react';

// Sintese de fala do proprio navegador: local, sem custo e sem enviar a
// resposta a terceiros. Os tres cuidados abaixo sao o que faz a fala sair em
// vez de falhar em silencio.

/** Vozes carregam de forma assincrona; sem esperar, a primeira fala sai muda. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    const timeout = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1_000);
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeout);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

function pickPortugueseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((voice) => voice.lang === 'pt-BR')
    ?? voices.find((voice) => voice.lang.startsWith('pt'))
    ?? null;
}

export interface SpeechController {
  supported: boolean;
  speaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
}

export function useSpeech(): SpeechController {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void loadVoices().then((voices) => {
      if (active) voiceRef.current = pickPortugueseVoice(voices);
    });
    return () => {
      active = false;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return;

    // Safari trava a fila quando um enunciado anterior nao foi cancelado.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    // Sem voz pt-BR instalada, a fala sai na voz padrao do aparelho — com
    // sotaque, mas sai, que e melhor que silencio.
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [supported]);

  return { supported, speaking, speak, stop };
}
