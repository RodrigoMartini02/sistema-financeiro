import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../utils/color';

interface ColorPickerProps {
  /** Cor atual, '#rrggbb'. */
  value: string;
  onChange: (hex: string) => void;
  /** Nome do campo, para leitores de tela (ex.: "Cor do cartão"). */
  label: string;
}

const HUE_GRADIENT = 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';
const FALLBACK_COLOR = '#1e40af';
const STEP = 0.02;
const HUE_STEP = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Seletor de cor livre: quadrado de saturação × brilho, barra de matiz e o
 * código da cor. Funciona com mouse, toque (arrastando) e teclado (setas;
 * com Shift, passos maiores).
 */
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  // O matiz fica guardado aqui: num cinza (saturação 0) o código não o carrega,
  // e o quadrado não pode trocar de cor sozinho enquanto se arrasta.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalizeHex(value) ?? FALLBACK_COLOR));
  const [hexText, setHexText] = useState(normalizeHex(value) ?? FALLBACK_COLOR);
  const lastEmitted = useRef(normalizeHex(value) ?? FALLBACK_COLOR);
  const squareRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'square' | 'hue' | null>(null);

  // Cor trocada de fora (outro cartão aberto no modal): acompanha.
  useEffect(() => {
    const normalized = normalizeHex(value);
    if (!normalized || normalized === lastEmitted.current) return;
    lastEmitted.current = normalized;
    setHsv(hexToHsv(normalized));
    setHexText(normalized);
  }, [value]);

  const emit = (next: Hsv) => {
    const hex = hsvToHex(next);
    setHsv(next);
    setHexText(hex);
    lastEmitted.current = hex;
    if (hex !== value) onChange(hex);
  };

  const pickInSquare = (clientX: number, clientY: number) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    emit({ h: hsv.h, s: clamp((clientX - rect.left) / rect.width, 0, 1), v: clamp(1 - (clientY - rect.top) / rect.height, 0, 1) });
  };
  const pickHue = (clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    emit({ ...hsv, h: clamp((clientX - rect.left) / rect.width, 0, 1) * 360 });
  };

  const startDrag = (target: 'square' | 'hue') => (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = target;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (target === 'square') pickInSquare(event.clientX, event.clientY);
    else pickHue(event.clientX);
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current === 'square') pickInSquare(event.clientX, event.clientY);
    if (dragging.current === 'hue') pickHue(event.clientX);
  };
  const stopDrag = () => {
    dragging.current = null;
  };

  const onSquareKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP * 5 : STEP;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step, 0, 1) },
      ArrowRight: { s: clamp(hsv.s + step, 0, 1) },
      ArrowUp: { v: clamp(hsv.v + step, 0, 1) },
      ArrowDown: { v: clamp(hsv.v - step, 0, 1) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    emit({ ...hsv, ...move });
  };
  const onHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? HUE_STEP * 5 : HUE_STEP;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    emit({ ...hsv, h: clamp(hsv.h + delta, 0, 360) });
  };

  const onHexInput = (text: string) => {
    setHexText(text);
    const normalized = normalizeHex(text);
    if (!normalized) return;
    lastEmitted.current = normalized;
    setHsv(hexToHsv(normalized));
    if (normalized !== value) onChange(normalized);
  };

  const current = lastEmitted.current;
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={squareRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturação e brilho`}
        aria-valuetext={`saturação ${percent(hsv.s)}, brilho ${percent(hsv.v)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        onPointerDown={startDrag('square')}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={onSquareKey}
        className="relative h-[92px] w-full cursor-crosshair rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0EC4D8]"
        style={{
          touchAction: 'none',
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${hsv.h} 100% 50%)`,
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: percent(hsv.s), top: percent(1 - hsv.v), background: current, boxShadow: '0 0 0 1px rgba(15,23,42,.35), 0 1px 3px rgba(15,23,42,.4)' }}
        />
      </div>

      <div
        ref={hueRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: matiz`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={startDrag('hue')}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={onHueKey}
        className="relative h-3 w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#0EC4D8]"
        style={{ touchAction: 'none', background: HUE_GRADIENT }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: percent(hsv.h / 360), background: `hsl(${hsv.h} 100% 50%)`, boxShadow: '0 0 0 1px rgba(15,23,42,.35), 0 1px 3px rgba(15,23,42,.4)' }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-md border border-slate-200 dark:border-slate-600" style={{ background: current }} />
        <input
          value={hexText}
          onChange={(event) => onHexInput(event.target.value)}
          onBlur={() => setHexText(lastEmitted.current)}
          aria-label={`${label}: código`}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[12.5px] uppercase text-slate-800 outline-none focus:border-[#0EC4D8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
