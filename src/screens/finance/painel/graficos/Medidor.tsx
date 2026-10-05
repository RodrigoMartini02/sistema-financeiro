import type { ReactNode } from 'react';
import { useCoresGrafico } from '../coresGrafico';
import { useTransicao } from '../base';
import { FAIXAS_COMPROMETIMENTO } from '../painelFormat';

const LARGURA = 120;
const ALTURA = 68;
const CX = 60;
const CY = 60;
const RAIO = 54;
const TRACO = 10;
const RAIO_MARCADOR = 6;

function ponto(percentual: number): [number, number] {
  const angulo = Math.PI * (1 - Math.min(100, Math.max(0, percentual)) / 100);
  return [CX + RAIO * Math.cos(angulo), CY - RAIO * Math.sin(angulo)];
}

function arco(de: number, ate: number): string {
  const [x1, y1] = ponto(de);
  const [x2, y2] = ponto(ate);
  return `M${x1} ${y1}A${RAIO} ${RAIO} 0 0 1 ${x2} ${y2}`;
}

/**
 * Meia-lua com as faixas do comprometimento (70 / 90), o arco do valor com as
 * pontas arredondadas e o marcador no valor. O que vier em `children` (o
 * percentual e a situação) fica centralizado dentro do arco, embaixo.
 */
export function Medidor({ percentual, cor, children }: { percentual: number; cor: string; children?: ReactNode }) {
  const cores = useCoresGrafico();
  const { de, p } = useTransicao(percentual, String(percentual), 800);
  const atual = (de ?? 0) + (percentual - (de ?? 0)) * p;
  const [alerta, critico] = FAIXAS_COMPROMETIMENTO;
  const [mx, my] = ponto(Math.max(0.1, atual));
  const [inicioX, inicioY] = ponto(0);
  const [fimX, fimY] = ponto(100);
  return (
    <div className="relative shrink-0" style={{ width: LARGURA, height: ALTURA }}>
      <svg width={LARGURA} height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`} aria-hidden="true" className="absolute inset-0">
        {/* Faixas num grupo só, com a transparência aplicada uma vez: as pontas redondas não escurecem onde encostam. */}
        <g opacity={0.2}>
          <path d={arco(0, alerta)} fill="none" strokeWidth={TRACO} stroke={cores.positivo} />
          <path d={arco(alerta, critico)} fill="none" strokeWidth={TRACO} stroke={cores.alerta} />
          <path d={arco(critico, 100)} fill="none" strokeWidth={TRACO} stroke={cores.negativo} />
          <circle cx={inicioX} cy={inicioY} r={TRACO / 2} fill={cores.positivo} />
          <circle cx={fimX} cy={fimY} r={TRACO / 2} fill={cores.negativo} />
        </g>
        <path d={arco(0, Math.max(0.1, atual))} fill="none" strokeWidth={TRACO} strokeLinecap="round" stroke={cor} />
        <circle cx={mx} cy={my} r={RAIO_MARCADOR} fill={cores.superficie} stroke={cor} strokeWidth={3} />
      </svg>
      {children && (
        <div className="absolute inset-x-0 flex flex-col items-center leading-none" style={{ bottom: ALTURA - CY + 1 }}>
          {children}
        </div>
      )}
    </div>
  );
}
