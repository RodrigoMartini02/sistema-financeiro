import { useCoresGrafico } from '../coresGrafico';
import { useTransicao } from '../base';
import { FAIXAS_COMPROMETIMENTO } from '../painelFormat';

const CX = 46;
const CY = 48;
const RAIO = 38;

function ponto(percentual: number): [number, number] {
  const angulo = Math.PI * (1 - Math.min(100, Math.max(0, percentual)) / 100);
  return [CX + RAIO * Math.cos(angulo), CY - RAIO * Math.sin(angulo)];
}

function arco(de: number, ate: number): string {
  const [x1, y1] = ponto(de);
  const [x2, y2] = ponto(ate);
  return `M${x1} ${y1}A${RAIO} ${RAIO} 0 0 1 ${x2} ${y2}`;
}

/** Meia-lua com as faixas do comprometimento (70 / 90) e o marcador no valor. */
export function Medidor({ percentual, cor }: { percentual: number; cor: string }) {
  const cores = useCoresGrafico();
  const { de, p } = useTransicao(percentual, String(percentual), 800);
  const atual = (de ?? 0) + (percentual - (de ?? 0)) * p;
  const [alerta, critico] = FAIXAS_COMPROMETIMENTO;
  const [mx, my] = ponto(Math.max(0.1, atual));
  return (
    <svg width="92" height="54" viewBox="0 0 92 54" aria-hidden="true" className="shrink-0">
      <path d={arco(0, alerta - 0.5)} fill="none" strokeWidth={9} stroke={cores.positivo} opacity={0.18} />
      <path d={arco(alerta + 0.5, critico - 0.5)} fill="none" strokeWidth={9} stroke={cores.alerta} opacity={0.2} />
      <path d={arco(critico + 0.5, 100)} fill="none" strokeWidth={9} stroke={cores.negativo} opacity={0.2} />
      <path d={arco(0, Math.max(0.1, atual))} fill="none" strokeWidth={9} stroke={cor} />
      <circle cx={mx} cy={my} r={6} fill={cores.superficie} stroke={cor} strokeWidth={3} />
    </svg>
  );
}
