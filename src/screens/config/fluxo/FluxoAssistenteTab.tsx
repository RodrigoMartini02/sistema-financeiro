import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, CheckCircle2, RotateCcw, Save } from 'lucide-react';
import {
  fetchActiveFlow, saveActiveFlow, restoreDefaultFlow,
  type FlowDefinition, type FlowNode,
} from '../../../services/assistantFlowService';
import { queryKeys } from '../../../services/queryKeys';
import { CFG } from '../../../ui/configTokens';
import { C } from '../../../ui/dialogFormTokens';
import { useConfirm } from '../../../context/ConfirmContext';
import { PerguntaNode, type PerguntaNodeData } from './PerguntaNode';
import { validateFlow, issuesByNode, type FlowIssue } from './flowValidation';
import { branchesForNode, defaultTargetForNode } from './flowBranches';

const nodeTypes: NodeTypes = { pergunta: PerguntaNode };

/**
 * Converte o fluxo salvo no grafo que o canvas desenha.
 *
 * As arestas saem da `ordem`, nao de uma lista propria: o fluxo e uma
 * sequencia com condicoes, e duas fontes de verdade para "o que vem depois"
 * divergiriam na primeira edicao.
 */
function toGraph(
  definition: FlowDefinition,
  issuesPorNo: Map<string, FlowIssue[]>,
  selecionadoId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodePorId = new Map(definition.nos.map((no) => [no.id, no]));

  const nodes: Node[] = definition.nos.map((no, index) => ({
    id: no.id,
    type: 'pergunta',
    position: no.posicao ?? { x: 0, y: index * 140 },
    data: {
      node: no,
      issues: issuesPorNo.get(no.id) ?? [],
      selecionado: no.id === selecionadoId,
    } satisfies PerguntaNodeData,
  }));

  // Arestas derivadas das condicoes que ja existem no fluxo: um no com chips
  // cujos valores levam a destinos diferentes vira uma seta por resposta,
  // rotulada. Antes todos os nos eram ligados em linha reta com um "se
  // aplicavel" que nao dizia se aplicavel quando o que.
  const edges: Edge[] = [];

  for (const origem of definition.ordem) {
    if (!nodePorId.has(origem)) continue;

    const ramos = branchesForNode(definition, origem);

    if (ramos.length > 0) {
      // Respostas que levam ao mesmo lugar compartilham a seta: "PIX" e
      // "Dinheiro" viram uma aresta "PIX · Dinheiro". Uma seta por chip
      // empilharia linhas identicas com rotulos diferentes.
      const porDestino = new Map<string, string[]>();
      for (const ramo of ramos) {
        if (!ramo.destinoId) continue;
        const lista = porDestino.get(ramo.destinoId) ?? [];
        lista.push(ramo.label);
        porDestino.set(ramo.destinoId, lista);
      }

      for (const [destinoId, labels] of porDestino) {
        edges.push({
          id: `${origem}-${destinoId}`,
          source: origem,
          target: destinoId,
          type: 'smoothstep',
          label: labels.join(' · '),
          labelStyle: { fontSize: 10, fill: '#0e7490', fontWeight: 600 },
          labelBgStyle: { fill: '#ecfeff', fillOpacity: 0.95 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
          style: { stroke: '#0891b2', strokeWidth: 1.5 },
        });
      }
      continue;
    }

    // Sem ramificacao: uma aresta so ate o proximo no que se aplica.
    const destino = defaultTargetForNode(definition, origem);
    if (!destino || !nodePorId.has(destino)) continue;

    // Tronco em cinza: o olho segue os ramos coloridos, que sao a informacao
    // nova, e a sequencia simples fica de fundo.
    edges.push({
      id: `${origem}-${destino}`,
      source: origem,
      target: destino,
      type: 'smoothstep',
      style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
    });
  }

  return { nodes, edges };
}

function PainelPropriedades({ node }: { node: FlowNode | null }) {
  if (!node) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: CFG.muted }}>
        Clique em uma pergunta no fluxo para ver os detalhes dela.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
          Campo
        </span>
        <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 12.5, color: C.text }}>{node.slot}</p>
      </div>

      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
          {node.variantes.length > 1 ? `Variantes (${node.variantes.length})` : 'Pergunta'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {node.variantes.map((variante, i) => (
            <div
              key={i}
              style={{
                borderRadius: 8, border: `1px solid ${CFG.borderSoft}`, padding: '6px 8px',
                background: '#fff',
              }}
            >
              {variante.quando && variante.quando.length > 0 && (
                <p style={{ margin: '0 0 3px', fontSize: 10.5, color: '#7c3aed' }}>
                  quando {variante.quando.map((c) => `${c.campo} ${c.operador} ${String(c.valor ?? '')}`).join(' e ')}
                </p>
              )}
              <p style={{ margin: 0, fontSize: 12, color: C.text }}>{variante.texto}</p>
              {(variante.opcoes ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {variante.opcoes!.map((o) => (
                    <span
                      key={`${o.value}-${o.label}`}
                      title={`envia: ${o.value}`}
                      style={{
                        borderRadius: 999, background: CFG.chipBg, padding: '1px 6px',
                        fontSize: 10, color: CFG.chipText,
                      }}
                    >
                      {o.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {node.aplicaQuando && node.aplicaQuando.length > 0 && (
        <div>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
            Só pergunta quando
          </span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11.5, color: C.textMuted }}>
            {node.aplicaQuando.map((c, i) => (
              <li key={i}>{c.campo} {c.operador} {String(c.valor ?? '')}</li>
            ))}
          </ul>
        </div>
      )}

      {node.limpaAoResponder && node.limpaAoResponder.length > 0 && (
        <div>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
            Ao responder, limpa
          </span>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.textMuted }}>
            {node.limpaAoResponder.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

export function FluxoAssistenteTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState('');

  const fluxoQ = useQuery({ queryKey: queryKeys.assistantFlow, queryFn: fetchActiveFlow });

  // Copia local do que veio do servidor: e nela que as edicoes acontecem.
  // Sem isso o botao Salvar reenviaria exatamente o que foi carregado.
  const [rascunho, setRascunho] = useState<FlowDefinition | null>(null);
  const [alterado, setAlterado] = useState(false);

  // Recarrega a copia quando o servidor devolve outra versao — depois de
  // salvar ou restaurar. `versao` no lugar do objeto evita sobrescrever o que
  // o usuario esta editando a cada refetch do React Query.
  const versaoCarregada = fluxoQ.data?.versao;
  useEffect(() => {
    if (!fluxoQ.data) return;
    setRascunho(fluxoQ.data.definicao);
    setAlterado(false);
  }, [versaoCarregada]); // eslint-disable-line react-hooks/exhaustive-deps

  const definicao = rascunho;

  const issues = useMemo(() => (definicao ? validateFlow(definicao) : []), [definicao]);
  const issuesPorNo = useMemo(() => issuesByNode(issues), [issues]);
  const erros = issues.filter((i) => i.severity === 'erro');

  const grafo = useMemo(
    () => (definicao ? toGraph(definicao, issuesPorNo, selecionadoId) : { nodes: [], edges: [] }),
    [definicao, issuesPorNo, selecionadoId],
  );

  const noSelecionado = useMemo(
    () => definicao?.nos.find((n) => n.id === selecionadoId) ?? null,
    [definicao, selecionadoId],
  );

  const salvarMut = useMutation({
    mutationFn: (def: FlowDefinition) => saveActiveFlow(def),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.assistantFlow });
      setErroSalvar('');
    },
    onError: (e: Error) => setErroSalvar(e.message),
  });

  const restaurarMut = useMutation({
    mutationFn: restoreDefaultFlow,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.assistantFlow });
      setErroSalvar('');
    },
    onError: (e: Error) => setErroSalvar(e.message),
  });

  /**
   * Guarda a posicao onde o no foi solto. So no fim do arrasto, nao a cada
   * pixel: o React Flow ja anima o movimento, e gravar em tempo real
   * re-renderizaria o grafo inteiro a cada frame.
   */
  const handleNodeDragStop = (_event: unknown, node: Node) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        nos: atual.nos.map((no) => (
          no.id === node.id ? { ...no, posicao: { x: node.position.x, y: node.position.y } } : no
        )),
      };
    });
    setAlterado(true);
  };

  const handleRestaurar = async () => {
    const ok = await confirm({
      title: 'Restaurar fluxo padrão',
      message: 'Isso descarta as alterações e volta o assistente ao fluxo original. Continuar?',
      confirmLabel: 'Restaurar',
      variant: 'danger',
    });
    if (ok) restaurarMut.mutate();
  };

  if (fluxoQ.isLoading) {
    return <p style={{ padding: 20, fontSize: 12.5, color: CFG.muted }}>Carregando o fluxo...</p>;
  }

  if (fluxoQ.error) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: C.danger }}>
          Não foi possível carregar o fluxo: {fluxoQ.error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      {/* Como tela propria, e ela que se apresenta — dentro do drawer o titulo
          vinha do cabecalho de Configuracoes. */}
      <div>
        <h1 className="m-0 text-[24px] font-bold tracking-[-0.02em] text-[#0f2b38] dark:text-white">
          Fluxo do assistente
        </h1>
        <p className="m-0 mt-[3px] text-[12px] text-[#7b93a1] dark:text-slate-400">
          A ordem e o texto das perguntas que o assistente faz ao registrar um lançamento.
          Arraste os blocos para reorganizar o desenho.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {erros.length === 0 ? (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} /> Fluxo sem erros
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle size={14} /> {erros.length} problema{erros.length === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-[11.5px]" style={{ color: CFG.muted }}>
            versão {fluxoQ.data?.versao ?? 0}
          </span>
          {alterado && (
            <span className="text-[11.5px] font-semibold" style={{ color: '#b54708' }}>
              alterações não salvas
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRestaurar()}
            disabled={restaurarMut.isPending}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
            style={{ borderColor: CFG.borderSoft, color: CFG.chipText, background: '#fff' }}
          >
            <RotateCcw size={13} /> Restaurar padrão
          </button>
          <button
            type="button"
            onClick={() => definicao && salvarMut.mutate(definicao)}
            disabled={salvarMut.isPending || erros.length > 0 || !definicao || !alterado}
            title={
              erros.length > 0 ? 'Corrija os problemas antes de salvar'
                : !alterado ? 'Nada foi alterado ainda'
                  : undefined
            }
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: C.primary }}
          >
            <Save size={13} /> {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {erroSalvar && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
          {erroSalvar}
        </div>
      )}

      {issues.length > 0 && (
        <div className="grid gap-1">
          {issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px]"
              style={{
                background: issue.severity === 'erro' ? C.dangerBg : '#fffcf5',
                color: issue.severity === 'erro' ? C.danger : '#b54708',
              }}
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                {issue.nodeId && <strong>{issue.nodeId}: </strong>}
                {issue.message}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div
          className="rounded-xl border"
          // Altura pela viewport, nao fixa: como tela inteira, o canvas deve
          // usar o espaco disponivel — e quanto maior, mais do fluxo cabe sem
          // precisar de zoom.
          style={{ borderColor: CFG.borderSoft, height: 'calc(100vh - 260px)', minHeight: 420, background: '#fafcfd' }}
        >
          <ReactFlow
            nodes={grafo.nodes}
            edges={grafo.edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => setSelecionadoId(node.id)}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={() => setSelecionadoId(null)}
            nodesDraggable
            fitView
            // Margem para os rotulos das ramificacoes nao encostarem na borda,
            // e teto de zoom para o fluxo nao abrir gigante em tela grande.
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{ borderColor: CFG.borderSoft, background: '#fff', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}
        >
          <PainelPropriedades node={noSelecionado} />
        </div>
      </div>
    </div>
  );
}
