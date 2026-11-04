export type AssistantFontSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'assistant:fontSize';

export function readStoredFontSize(): AssistantFontSize {
  if (typeof window === 'undefined') return 'medium';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'small' || stored === 'medium' || stored === 'large' ? stored : 'medium';
}

export function storeFontSize(fontSize: AssistantFontSize): void {
  window.localStorage.setItem(STORAGE_KEY, fontSize);
}

export function fontSizeToScale(fontSize: AssistantFontSize): number {
  if (fontSize === 'small') return 0.92;
  if (fontSize === 'large') return 1.15;
  return 1;
}
