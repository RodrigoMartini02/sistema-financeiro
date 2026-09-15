import { Handle, Position, type NodeProps } from '@xyflow/react';
import { List } from 'lucide-react';

/**
 * Uma resposta do usuário, como bloco próprio do canvas.
 *
 * Não é um `FlowNode`: não preenche campo nenhum, é uma opção de uma pergunta
 * (`variante.opcoes[n]`). Vive no grafo do React Flow, como a abertura.
 *
 * Fica fora do card da mensagem de propósito — a decisão é independente da
 * fala, e é dela que sai a seta para o próximo passo.
 */

/** Separa o nó dono do valor da opção no id sintético. */
const SEPARADOR = '::';

export function idDaResposta(nodeId: string, valor: string): string {
  return `${nodeId}${SEPARADOR}${valor}`;
}

/** Desmonta o id sintético. Devolve null para id que não é de resposta. */
export function partesDaResposta(id: string): { nodeId: string; valor: string } | null {
  const corte = id.indexOf(SEPARADOR);
  if (corte < 0) return null;

  return {
    nodeId: id.slice(0, corte),
    valor: id.slice(corte + SEPARADOR.length),
  };
}

export interface RespostaNodeData extends Record<string, unknown> {
  label: string;
  valor: string;
  selecionado: boolean;
  /** Opções vindas do catálogo da conta: um bloco só, não um por item. */
  dinamica: boolean;
}

export function RespostaNode({ data }: NodeProps) {
  const { label, valor, selecionado, dinamica } = data as RespostaNodeData;

  if (dinamica) {
    // A lista muda por usuário e a cada cadastro, e todo item leva ao mesmo
    // destino: desenhar um bloco por cartão fingiria que "Nubank" faz parte
    // do fluxo, quando o que faz parte é "escolher um cartão".
    return (
      <div
        className={[
          'flex w-44 items-center gap-1.5 rounded-lg border-2 border-dashed px-2.5 py-1.5',
          selecionado
            ? 'border-slate-400 bg-white'
            : 'border-slate-300 bg-white/70 dark:border-slate-600 dark:bg-slate-900/50',
        ].join(' ')}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-400" />
        <List size={11} className="shrink-0 text-slate-400" />
        <span className="truncate text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
      </div>
    );
  }

  return (
    <div
      title={`envia: ${valor}`}
      className={[
        'w-40 rounded-full border-2 px-3 py-1.5 text-center',
        selecionado
          ? 'border-cyan-500 bg-cyan-100 dark:bg-cyan-900'
          : 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/60',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />
      <span className="block truncate text-[11px] font-semibold text-cyan-800 dark:text-cyan-200">
        {label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}
