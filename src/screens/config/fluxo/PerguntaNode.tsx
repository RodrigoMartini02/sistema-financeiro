import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import type { FlowIssue } from './flowValidation';
import type { FlowNode } from '../../../services/assistantFlowService';

export interface PerguntaNodeData extends Record<string, unknown> {
  node: FlowNode;
  issues: FlowIssue[];
  selecionado: boolean;
}

/**
 * Caixa de uma pergunta no canvas.
 *
 * Mostra o texto que o assistente fala e os chips que oferece — o suficiente
 * para bater o olho e ver onde a conversa desanda, sem abrir o painel.
 */
export function PerguntaNode({ data }: NodeProps) {
  const { node, issues } = data as PerguntaNodeData;

  const temErro = issues.some((issue) => issue.severity === 'erro');
  const temAviso = issues.some((issue) => issue.severity === 'aviso');

  // A primeira variante e a que aparece com mais frequencia; as demais sao
  // casos condicionais e ficam indicadas pelo contador.
  const principal = node.variantes[0];

  // A condicao de `kind` vale para quase todo no de despesa e diria pouco no
  // rotulo; o que interessa e a condicao que de fato ramifica.
  const condicoesRelevantes = (node.aplicaQuando ?? []).filter((c) => c.campo !== 'kind');
  const condicaoResumida = condicoesRelevantes
    .map((c) => (Array.isArray(c.valor) ? `${c.campo} é ${c.valor.join(' ou ')}` : `${c.campo} ${c.operador === 'diferente' ? '≠' : '='} ${String(c.valor)}`))
    .join(' e ');
  const condicaoCompleta = (node.aplicaQuando ?? [])
    .map((c) => `${c.campo} ${c.operador} ${String(c.valor ?? '')}`)
    .join(' e ');

  const borda = temErro
    ? 'border-red-400 dark:border-red-500'
    : temAviso
      ? 'border-amber-400 dark:border-amber-500'
      : 'border-slate-200 dark:border-slate-700';

  return (
    <div
      className={`w-64 rounded-xl border-2 bg-white shadow-sm dark:bg-slate-900 ${borda}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />

      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
        <MessageSquare size={12} className="shrink-0 text-cyan-600 dark:text-cyan-400" />
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {node.slot}
        </span>
        {temErro && <AlertTriangle size={12} className="ml-auto shrink-0 text-red-500" />}
        {!temErro && temAviso && <AlertTriangle size={12} className="ml-auto shrink-0 text-amber-500" />}
      </div>

      <div className="px-3 py-2">
        <p className="line-clamp-3 text-xs leading-snug text-slate-700 dark:text-slate-200">
          {principal?.texto ?? '(sem texto)'}
        </p>


        <div className="mt-1.5 flex flex-wrap gap-1">
          {node.variantes.length > 1 && (
            <span className="text-[9.5px] text-slate-400">{node.variantes.length} variantes</span>
          )}
          {node.skippable && (
            <span className="rounded bg-slate-100 px-1 text-[9.5px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">pulável</span>
          )}
          {condicaoResumida && (
            // Diz QUANDO o no aparece, nao so que e condicional — era o que
            // faltava para entender por que um campo some da conversa.
            <span
              className="rounded bg-violet-50 px-1 text-[9.5px] text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
              title={condicaoCompleta}
            >
              só se {condicaoResumida}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}
