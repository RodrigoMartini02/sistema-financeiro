// Leitura dos textos legais (src/screens/public/legalContent.ts) em blocos:
// "**título**" vira título, "• item" vira item e o resto vira parágrafo.
// Linhas vazias só separam blocos.

export type LegalBlockKind = 'heading' | 'item' | 'paragraph';

export interface LegalBlock {
  kind: LegalBlockKind;
  text: string;
}

const HEADING_MARK = '**';
const ITEM_MARK = '•';

export function parseLegalText(content: string): LegalBlock[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): LegalBlock => {
      if (line.length > HEADING_MARK.length * 2 && line.startsWith(HEADING_MARK) && line.endsWith(HEADING_MARK)) {
        return { kind: 'heading', text: line.slice(HEADING_MARK.length, -HEADING_MARK.length).trim() };
      }
      if (line.startsWith(ITEM_MARK)) {
        return { kind: 'item', text: line.slice(ITEM_MARK.length).trim() };
      }
      return { kind: 'paragraph', text: line };
    });
}
