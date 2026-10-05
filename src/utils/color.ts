// Cores em código '#rrggbb' e no espaço do seletor de cor (matiz 0–360,
// saturação e brilho 0–1), mais a cor de texto legível sobre um fundo.

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** Texto sobre fundos claros e escuros (slate-900 e branco). */
export const DARK_INK = '#0f172a';
export const LIGHT_INK = '#ffffff';

/** '#rgb' ou '#rrggbb', com ou sem '#', em maiúsculas ou não → '#rrggbb'; `null` quando não é uma cor. */
export function normalizeHex(value: string): string | null {
  const text = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(text)) {
    return `#${text.split('').map((digit) => digit + digit).join('')}`;
  }
  return /^[0-9a-f]{6}$/.test(text) ? `#${text}` : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((start) => parseInt(normalized.slice(start, start + 2), 16)) as [number, number, number];
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const chroma = v * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] = sector < 1 ? [chroma, x, 0]
    : sector < 2 ? [x, chroma, 0]
      : sector < 3 ? [0, chroma, x]
        : sector < 4 ? [0, x, chroma]
          : sector < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const m = v - chroma;
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminância relativa (WCAG) de uma cor '#rrggbb'. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(first: string, second: string): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Cor do texto sobre o fundo: a de maior contraste entre branco e escuro. */
export function readableTextColor(background: string): string {
  return contrastRatio(background, LIGHT_INK) >= contrastRatio(background, DARK_INK) ? LIGHT_INK : DARK_INK;
}
