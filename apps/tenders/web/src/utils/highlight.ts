// Trecho do objeto com os termos da busca entre << e >> (ts_headline da API)
// em pedaços de texto, para a tela montar o destaque com elementos React, sem
// HTML. Marcador sem par fica como texto.

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

const OPEN = '<<';
const CLOSE = '>>';

function pushText(segments: HighlightSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && !last.highlighted) {
    last.text += text;
    return;
  }
  segments.push({ text, highlighted: false });
}

export function highlightSegments(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(OPEN, cursor);
    const close = open === -1 ? -1 : text.indexOf(CLOSE, open + OPEN.length);
    if (open === -1 || close === -1) {
      pushText(segments, text.slice(cursor));
      break;
    }
    pushText(segments, text.slice(cursor, open));
    const marked = text.slice(open + OPEN.length, close);
    if (marked) {
      segments.push({ text: marked, highlighted: true });
    }
    cursor = close + CLOSE.length;
  }
  return segments;
}
