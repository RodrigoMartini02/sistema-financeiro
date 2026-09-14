import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Play } from 'lucide-react';
import type { FlowIssue } from './flowValidation';
import type { FlowAbertura } from '../../../services/assistantFlowService';

export interface AberturaNodeData extends Record<string, unknown> {
  abertura: FlowAbertura;
  issues: FlowIssue[];
  selecionado: boolean;
}

/**
 * Primeira tela da conversa, desenhada no canvas.
 *
 * Visual deliberadamente diferente do PerguntaNode: aquele preenche um campo
 * do lançamento, este escolhe QUAL fluxo vai rodar. Tratar os dois igual
 * esconderia justamente a decisão mais importante do desenho.
 *
 * Sem handle de entrada — nada aponta para a abertura, ela é a raiz.
 */
export function AberturaNode({ data }: NodeProps) {
  const { abertura, issues, selecionado } = data as AberturaNodeData;

  const temAviso = issues.length > 0;

  const borda = temAviso
    ? 'border-amber-400 dark:border-amber-500'
    : selecionado
      ? 'border-violet-500'
      : 'border-violet-300 dark:border-violet-700';

  return (
    <div className={`w-64 rounded-xl border-2 bg-violet-50/70 shadow-sm dark:bg-violet-950/30 ${borda}`}>
      <div className="flex items-center gap-1.5 border-b border-violet-200/70 px-3 py-1.5 dark:border-violet-800/70">
        <Play size={12} className="shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
          início da conversa
        </span>
        {temAviso && <AlertTriangle size={12} className="ml-auto shrink-0 text-amber-500" />}
      </div>

      <div className="px-3 py-2">
        <p className="line-clamp-3 text-xs leading-snug text-slate-700 dark:text-slate-200">
          {abertura.saudacao}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {abertura.opcoes.map((opcao) => (
            <span
              key={opcao.intent}
              title={opcao.abertura}
              className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9.5px] font-medium text-violet-700 dark:bg-violet-900/60 dark:text-violet-200"
            >
              {opcao.label}
            </span>
          ))}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-violet-500" />
    </div>
  );
}

/**
 * Fim de linha da consulta.
 *
 * A consulta não entra no preenchimento guiado: ela sai para a via de
 * perguntas livres. Sem este nó a seta de "Consultar" não teria destino e
 * sumiria do desenho, dando a impressão de caminho quebrado — o que existe
 * de fato é um caminho que termina fora daqui.
 */
export function ConsultaNode() {
  return (
    <div className="w-52 rounded-xl border-2 border-dashed border-slate-300 bg-white/80 px-3 py-2 dark:border-slate-600 dark:bg-slate-900/60">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
        fora do fluxo guiado
      </p>
      <p className="m-0 mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        A consulta segue para perguntas livres, sem preencher campos.
      </p>
    </div>
  );
}
