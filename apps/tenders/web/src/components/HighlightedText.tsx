import { highlightSegments } from '../utils/highlight';

/** Texto com os termos da busca destacados (marcadores << e >> da API), sem HTML. */
export function HighlightedText({ text }: { text: string }) {
  return (
    <>
      {highlightSegments(text).map((segment, index) =>
        segment.highlighted ? (
          <mark key={index} className="rounded bg-amber-100 px-0.5 text-inherit dark:bg-amber-400/25 dark:text-amber-100">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
