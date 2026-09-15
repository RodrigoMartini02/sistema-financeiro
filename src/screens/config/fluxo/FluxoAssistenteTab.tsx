import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow,
  type Node, type Edge, type NodeTypes, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, CheckCircle2, RotateCcw, Save } from 'lucide-react';
import {
  fetchActiveFlow, saveActiveFlow, restoreDefaultFlow,
  type FlowDefinition, type FlowNode, type FlowAbertura, TRANSICAO_QUALQUER,
} from '../../../services/assistantFlowService';
import { queryKeys } from '../../../services/queryKeys';
import { CFG } from '../../../ui/configTokens';
import { C } from '../../../ui/dialogFormTokens';
import { useConfirm } from '../../../context/ConfirmContext';
import { PerguntaNode, type PerguntaNodeData } from './PerguntaNode';
import { AberturaNode, ConsultaNode, type AberturaNodeData } from './AberturaNode';
import { RespostaNode, idDaResposta, partesDaResposta, type RespostaNodeData } from './RespostaNode';
import { respostasDesenhaveis, posicaoPadraoDaResposta } from './layoutRespostas';
import { PaletaCampos } from './PaletaCampos';
import { PainelEdicaoNo } from './PainelEdicaoNo';
import { PainelEdicaoResposta } from './PainelEdicaoResposta';
import { SLOTS_DISPONIVEIS, novoIdParaSlot } from './slotsDisponiveis';
import { validateFlow, issuesByNode, type FlowIssue } from './flowValidation';
import {
  branchesForNode, defaultTargetForNode, primeiroNoParaKind,
  ABERTURA_NODE_ID, CONSULTA_NODE_ID,
} from './flowBranches';

const nodeTypes: NodeTypes = { pergunta: PerguntaNode, abertura: AberturaNode, consulta: ConsultaNode, resposta: RespostaNode };

/** Posicao de origem da abertura quando o fluxo salvo ainda nao tem uma. */
const ABERTURA_POSICAO_PADRAO = { x: 0, y: -260 };

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

  // A abertura e um no sintetico: existe no desenho, nao em `definition.nos`.
  // Ela nao preenche slot nenhum — escolhe QUAL fluxo roda — e por isso nao
  // passa por parseNode nem entra na `ordem` que o motor percorre.
  if (definition.abertura) {
    nodes.push({
      id: ABERTURA_NODE_ID,
      type: 'abertura',
      position: definition.abertura.posicao ?? ABERTURA_POSICAO_PADRAO,
      data: {
        abertura: definition.abertura,
        issues: issuesPorNo.get(ABERTURA_NODE_ID) ?? [],
        selecionado: selecionadoId === ABERTURA_NODE_ID,
      } satisfies AberturaNodeData,
    });

    const temConsulta = definition.abertura.opcoes.some((o) => o.intent === 'ask');
    if (temConsulta) {
      nodes.push({
        id: CONSULTA_NODE_ID,
        type: 'consulta',
        position: { x: -320, y: 0 },
        data: {},
        selectable: false,
      });
    }

    // Cada intencao vira um bloco proprio abaixo do card, como as demais
    // respostas: a escolha e independente da saudacao.
    const posicaoAbertura = definition.abertura.posicao ?? ABERTURA_POSICAO_PADRAO;

    definition.abertura.opcoes.forEach((opcao, indice) => {
      const idOpcao = idDaResposta(ABERTURA_NODE_ID, opcao.intent);

      nodes.push({
        id: idOpcao,
        type: 'resposta',
        position: posicaoPadraoDaResposta(posicaoAbertura, indice, definition.abertura!.opcoes.length),
        data: {
          label: opcao.label,
          valor: opcao.intent,
          selecionado: selecionadoId === idOpcao,
          dinamica: false,
        } satisfies RespostaNodeData,
      });

      edges.push({
        id: `abertura-para-${idOpcao}`,
        source: ABERTURA_NODE_ID,
        target: idOpcao,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      });
    });

    for (const opcao of definition.abertura.opcoes) {
      // Cada intencao entra no fluxo por um `kind` diferente, e sao as
      // condicoes do proprio fluxo que decidem onde isso cai. E o que torna
      // visivel que receita so pergunta descricao e valor.
      const destino = opcao.intent === 'register_expense'
        ? primeiroNoParaKind(definition, 'expense')
        : opcao.intent === 'register_income'
          ? primeiroNoParaKind(definition, 'income')
          : CONSULTA_NODE_ID;

      if (!destino) continue;
      if (destino !== CONSULTA_NODE_ID && !nodePorId.has(destino)) continue;

      edges.push({
        id: `abertura-${opcao.intent}`,
        source: idDaResposta(ABERTURA_NODE_ID, opcao.intent),
        target: destino,
        type: 'smoothstep',
        label: opcao.label,
        labelStyle: { fontSize: 10, fill: '#6d28d9', fontWeight: 600 },
        labelBgStyle: { fill: '#f5f3ff', fillOpacity: 0.95 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 6,
        // Violeta separa a escolha de fluxo das ramificacoes de resposta
        // (ciano) e do tronco (cinza): sao tres coisas diferentes.
        style: { stroke: '#8b5cf6', strokeWidth: 1.5 },
      });
    }
  }

  for (const origem of definition.ordem) {
    if (!nodePorId.has(origem)) continue;

    const no = nodePorId.get(origem)!;

    // Transicao gravada manda no destino; a derivacao so preenche o que
    // ainda nao foi desenhado. E o que faz um fluxo v1 aparecer certo antes
    // de qualquer edicao, e a edicao ganhar precedencia depois.
    const destinoGravado = new Map<string, string | null>();
    for (const transicao of no.transicoes ?? []) {
      destinoGravado.set(transicao.quando, transicao.destino);
    }

    const respostas = respostasDesenhaveis(no);
    const ramos = branchesForNode(definition, origem);
    const destinoDerivado = new Map(ramos.map((ramo) => [ramo.valor, ramo.destinoId]));

    if (respostas.length > 0) {
      const posicaoDoNo = no.posicao ?? { x: 0, y: 0 };
      const indiceNaOrdem = definition.ordem.indexOf(origem);

      respostas.forEach((resposta, indice) => {
        const idResposta = idDaResposta(origem, resposta.valor);

        // A resposta e um bloco proprio, fora do card: a decisao e
        // independente da fala, e e dela que sai a seta do proximo passo.
        nodes.push({
          id: idResposta,
          type: 'resposta',
          position: resposta.posicao ?? posicaoPadraoDaResposta(posicaoDoNo, indice, respostas.length),
          data: {
            label: resposta.label,
            valor: resposta.valor,
            selecionado: selecionadoId === idResposta,
            dinamica: resposta.dinamica,
          } satisfies RespostaNodeData,
        });

        // Card -> bloco: sem rotulo, porque o rotulo e o proprio bloco.
        edges.push({
          id: `${origem}-para-${idResposta}`,
          source: origem,
          target: idResposta,
          type: 'smoothstep',
          style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
        });

        const destinoId = destinoGravado.has(resposta.valor)
          ? destinoGravado.get(resposta.valor)!
          : destinoDerivado.get(resposta.valor) ?? null;
        if (!destinoId || !nodePorId.has(destinoId)) return;

        // Retorno: a resposta volta para uma pergunta anterior ou para a
        // propria. E o caso do "Corrigir", que sempre existiu na conversa e
        // nunca aparecia no desenho.
        const indiceDestino = definition.ordem.indexOf(destinoId);
        const eRetorno = indiceDestino >= 0 && indiceNaOrdem >= 0 && indiceDestino <= indiceNaOrdem;

        edges.push({
          id: `${idResposta}-para-${destinoId}`,
          source: idResposta,
          target: destinoId,
          type: 'smoothstep',
          animated: eRetorno,
          ...(eRetorno ? { label: 'volta' } : {}),
          labelStyle: { fontSize: 9.5, fill: '#b45309', fontWeight: 600 },
          labelBgStyle: { fill: '#fffbeb', fillOpacity: 0.95 },
          labelBgPadding: [5, 2],
          labelBgBorderRadius: 5,
          style: {
            stroke: eRetorno ? '#f59e0b' : '#0891b2',
            strokeWidth: 1.5,
          },
        });
      });
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

/**
 * Detalhes da abertura. Separado do painel de pergunta porque os campos sao
 * outros: nao ha slot, variantes nem condicoes — ha a saudacao e as
 * intencoes, cada uma com a fala que o assistente dá logo apos a escolha.
 */
function PainelAbertura({ abertura }: { abertura: FlowAbertura }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
          Início da conversa
        </span>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.text }}>{abertura.saudacao}</p>
      </div>

      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CFG.muted }}>
          Opções ({abertura.opcoes.length})
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {abertura.opcoes.map((opcao) => (
            <div
              key={opcao.intent}
              style={{
                borderRadius: 8, border: `1px solid ${CFG.borderSoft}`, padding: '6px 8px',
                background: '#fff',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text }}>{opcao.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: CFG.muted }}>{opcao.abertura}</p>
              <p style={{ margin: '3px 0 0', fontFamily: 'monospace', fontSize: 10, color: '#7c3aed' }}>
                {opcao.intent}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/**
 * Wrapper com o Provider: `useReactFlow` (usado para converter a posicao do
 * drop em coordenada do canvas) so funciona dentro dele.
 */
export function FluxoAssistenteTab() {
  return (
    <ReactFlowProvider>
      <EditorFluxo />
    </ReactFlowProvider>
  );
}

function EditorFluxo() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [abaPainel, setAbaPainel] = useState<'campos' | 'propriedades'>('campos');
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

  const slotsEmUso = useMemo(
    () => new Set((definicao?.nos ?? []).map((no) => no.slot)),
    [definicao],
  );

  // Bloco de resposta selecionado: o id sintetico diz o no dono e o valor.
  const respostaSelecionada = useMemo(() => {
    if (!selecionadoId || !definicao) return null;

    const partes = partesDaResposta(selecionadoId);
    if (!partes || partes.nodeId === ABERTURA_NODE_ID) return null;

    const dono = definicao.nos.find((no) => no.id === partes.nodeId);
    if (!dono) return null;

    return { node: dono, valor: partes.valor };
  }, [definicao, selecionadoId]);

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
  /**
   * Liga uma resposta a um destino: e aqui que o desenho vira dado.
   *
   * O `sourceHandle` e o valor da resposta (foi assim que o handle foi
   * criado), entao ele vira o `quando` da transicao. Gravar move o fluxo
   * para v2, onde o motor passa a obedecer o desenho em vez de derivar o
   * destino das condicoes.
   */
  const handleConnect = (conexao: Connection) => {
    const { source, target, sourceHandle } = conexao;
    if (!source || !target) return;

    // Ligacao a partir da abertura nao e transicao de no: a abertura escolhe
    // o fluxo pelo `kind`, e isso nao se redireciona por aresta.
    if (source === ABERTURA_NODE_ID) return;

    // A ligacao sai do bloco da resposta: quem grava a transicao e o no dono
    // dela, com `quando` = valor da opcao.
    const partes = partesDaResposta(source);
    if (partes && partes.nodeId === ABERTURA_NODE_ID) return;

    const noOrigem = partes ? partes.nodeId : source;

    setRascunho((atual) => {
      if (!atual) return atual;

      // Sem handle a ligacao vale para qualquer resposta.
      const quando = partes ? partes.valor : (sourceHandle ?? TRANSICAO_QUALQUER);

      return {
        ...atual,
        versaoFormato: 2,
        nos: atual.nos.map((no) => {
          if (no.id !== noOrigem) return no;

          // Uma resposta leva a um lugar so: religar substitui.
          const semAntiga = (no.transicoes ?? []).filter((t) => t.quando !== quando);
          return { ...no, transicoes: [...semAntiga, { quando, destino: target }] };
        }),
      };
    });
    setAlterado(true);
  };

  /**
   * Apagar no canvas: bloco de resposta remove a opcao, card remove a
   * pergunta inteira. Tratar os dois igual apagaria a pergunta ao tentar
   * tirar so uma resposta dela.
   */
  const handleNodesDelete = (nos: Node[]) => {
    for (const no of nos) {
      const partes = partesDaResposta(no.id);
      if (!partes) {
        handleRemoverNo(no.id);
        continue;
      }
      if (partes.nodeId === ABERTURA_NODE_ID) continue;

      setRascunho((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          nos: atual.nos.map((noAtual) => {
            if (noAtual.id !== partes.nodeId) return noAtual;
            return {
              ...noAtual,
              variantes: noAtual.variantes.map((variante) => ({
                ...variante,
                opcoes: (variante.opcoes ?? []).filter((opcao) => opcao.value !== partes.valor),
              })),
              // A transicao daquela resposta perde o sentido junto com ela.
              ...(noAtual.transicoes
                ? { transicoes: noAtual.transicoes.filter((t) => t.quando !== partes.valor) }
                : {}),
            };
          }),
        };
      });
      setAlterado(true);
    }
  };

  /** Apagar a seta volta a resposta para a varredura da ordem. */
  const handleEdgesDelete = (arestas: Edge[]) => {
    setRascunho((atual) => {
      if (!atual) return atual;

      return {
        ...atual,
        nos: atual.nos.map((no) => {
          const remover = arestas.filter((aresta) => {
            const origemAresta = partesDaResposta(aresta.source);
            return (origemAresta ? origemAresta.nodeId : aresta.source) === no.id;
          });
          if (remover.length === 0 || !no.transicoes) return no;

          const quandos = new Set(remover.map((a) => {
            const origemAresta = partesDaResposta(a.source);
            return origemAresta ? origemAresta.valor : (a.sourceHandle ?? TRANSICAO_QUALQUER);
          }));
          const restantes = no.transicoes.filter((t) => !quandos.has(t.quando));
          if (restantes.length > 0) return { ...no, transicoes: restantes };

          const { transicoes: _removidas, ...semTransicoes } = no;
          return semTransicoes;
        }),
      };
    });
    setAlterado(true);
  };

  /** Grava a edicao do no no rascunho; Salvar manda tudo de uma vez. */
  const handleNoChange = (atualizado: FlowNode) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        nos: atual.nos.map((no) => (no.id === atualizado.id ? atualizado : no)),
      };
    });
    setAlterado(true);
  };

  /**
   * Remove o no, sua posicao na ordem e toda transicao que apontava para ele.
   * Sem a ultima parte sobraria referencia orfa, que o parser descarta em
   * silencio — e o desenho passaria a mentir sobre o caminho.
   */
  const handleRemoverNo = (nodeId: string) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        nos: atual.nos
          .filter((no) => no.id !== nodeId)
          .map((no) => (no.transicoes
            ? { ...no, transicoes: no.transicoes.filter((t) => t.destino !== nodeId) }
            : no)),
        ordem: atual.ordem.filter((id) => id !== nodeId),
      };
    });
    setSelecionadoId(null);
    setAlterado(true);
  };

  const { screenToFlowPosition } = useReactFlow();

  /**
   * Cria a pergunta no ponto onde o campo foi solto.
   *
   * O id vem de novoIdParaSlot porque o mesmo campo pode aparecer em mais de
   * um ponto do fluxo — o id nao pode ser o slot.
   */
  const handleDrop = (evento: React.DragEvent) => {
    evento.preventDefault();

    const slot = evento.dataTransfer.getData('application/fluxo-slot');
    if (!slot) return;

    const campo = SLOTS_DISPONIVEIS.find((item) => item.slot === slot);
    if (!campo) return;

    const posicao = screenToFlowPosition({ x: evento.clientX, y: evento.clientY });

    setRascunho((atual) => {
      if (!atual) return atual;

      const ids = new Set(atual.nos.map((no) => no.id));
      const id = novoIdParaSlot(campo.slot, ids);

      return {
        ...atual,
        // Gravar passa a produzir v2: o fluxo agora pode ter transicoes.
        versaoFormato: 2,
        nos: [...atual.nos, {
          id,
          slot: campo.slot,
          variantes: [{ texto: campo.perguntaPadrao }],
          posicao,
        }],
        ordem: [...atual.ordem, id],
      };
    });
    setAlterado(true);
    setSelecionadoId(null);
  };

  const handleDragOver = (evento: React.DragEvent) => {
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'move';
  };

  const handleNodeDragStop = (_event: unknown, node: Node) => {
    setRascunho((atual) => {
      if (!atual) return atual;

      // Bloco de resposta: a posicao mora na opcao, nao no no.
      const partes = partesDaResposta(node.id);
      if (partes) {
        return {
          ...atual,
          nos: atual.nos.map((no) => {
            if (no.id !== partes.nodeId) return no;
            return {
              ...no,
              variantes: no.variantes.map((variante) => ({
                ...variante,
                opcoes: (variante.opcoes ?? []).map((opcao) => (
                  opcao.value === partes.valor
                    ? { ...opcao, posicao: { x: node.position.x, y: node.position.y } }
                    : opcao
                )),
              })),
            };
          }),
        };
      }

      // A abertura nao esta em `nos`: a posicao dela mora no proprio bloco.
      if (node.id === ABERTURA_NODE_ID) {
        if (!atual.abertura) return atual;
        return {
          ...atual,
          abertura: { ...atual.abertura, posicao: { x: node.position.x, y: node.position.y } },
        };
      }

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
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ReactFlow
            nodes={grafo.nodes}
            edges={grafo.edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => {
              setSelecionadoId(node.id);
              setAbaPainel('propriedades');
            }}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={() => setSelecionadoId(null)}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onNodesDelete={handleNodesDelete}
            // Religar uma seta existente troca o destino em vez de duplicar.
            edgesReconnectable
            deleteKeyCode={['Backspace', 'Delete']}
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
          {/* Duas abas: de onde se tira campo novo, e o que se edita no que
              ja esta no quadro. */}
          <div className="mb-3 flex gap-1">
            {(['campos', 'propriedades'] as const).map((aba) => (
              <button
                key={aba}
                type="button"
                onClick={() => setAbaPainel(aba)}
                className={[
                  'flex-1 rounded-md px-2 py-1 text-[11.5px] font-semibold transition',
                  abaPainel === aba
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                {aba === 'campos' ? 'Campos' : 'Propriedades'}
              </button>
            ))}
          </div>

          {abaPainel === 'campos' ? (
            <PaletaCampos slotsEmUso={slotsEmUso} />
          ) : selecionadoId === ABERTURA_NODE_ID && definicao?.abertura ? (
            <PainelAbertura abertura={definicao.abertura} />
          ) : respostaSelecionada && definicao ? (
            <PainelEdicaoResposta
              definicao={definicao}
              node={respostaSelecionada.node}
              valor={respostaSelecionada.valor}
              onChange={handleNoChange}
            />
          ) : (
            <PainelEdicaoNo
              node={noSelecionado}
              onChange={handleNoChange}
              onRemover={handleRemoverNo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
