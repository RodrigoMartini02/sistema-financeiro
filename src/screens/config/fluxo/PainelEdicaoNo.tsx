import { Trash2 } from 'lucide-react';
import { CFG } from '../../../ui/configTokens';
import { C } from '../../../ui/dialogFormTokens';
import type { FlowNode } from '../../../services/assistantFlowService';

/**
 * Edição do nó selecionado: pergunta, chips e comportamento.
 *
 * O painel era só leitura, então ver uma pergunta errada no canvas não
 * adiantava nada — era preciso pedir a mudança no código. Aqui ela se corrige
 * onde é vista.
 */

interface PainelEdicaoNoProps {
  node: FlowNode | null;
  onChange: (node: FlowNode) => void;
  onRemover: (nodeId: string) => void;
}

const rotuloSecao: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: CFG.muted,
};

const campoTexto: React.CSSProperties = {
  width: '100%',
  borderRadius: 6,
  border: `1px solid ${CFG.borderSoft}`,
  padding: '5px 7px',
  fontSize: 12,
  color: C.text,
  background: '#fff',
  fontFamily: 'inherit',
};

export function PainelEdicaoNo({ node, onChange, onRemover }: PainelEdicaoNoProps) {
  if (!node) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: CFG.muted }}>
        Clique em um bloco do fluxo para editar a pergunta e as respostas.
      </p>
    );
  }

  const alterarVariante = (indice: number, texto: string) => {
    onChange({
      ...node,
      variantes: node.variantes.map((variante, i) => (
        i === indice ? { ...variante, texto } : variante
      )),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <span style={rotuloSecao}>Campo</span>
        <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 12.5, color: C.text }}>
          {node.slot}
        </p>
      </div>

      <div>
        <span style={rotuloSecao}>
          {node.variantes.length > 1 ? `Perguntas (${node.variantes.length})` : 'Pergunta'}
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {node.variantes.map((variante, indiceVariante) => (
            <div
              key={indiceVariante}
              style={{
                borderRadius: 8,
                border: `1px solid ${CFG.borderSoft}`,
                padding: '7px 8px',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {/* A condição da variante não se edita aqui: ela decide QUAL
                  texto aparece, e mexer nisso é mudar a lógica, não o texto. */}
              {variante.quando && variante.quando.length > 0 && (
                <p style={{ margin: 0, fontSize: 10.5, color: '#7c3aed' }}>
                  quando {variante.quando.map((c) => `${c.campo} ${c.operador} ${String(c.valor ?? '')}`).join(' e ')}
                </p>
              )}

              <textarea
                value={variante.texto}
                onChange={(evento) => alterarVariante(indiceVariante, evento.target.value)}
                rows={2}
                style={{ ...campoTexto, resize: 'vertical' }}
                aria-label={`Texto da pergunta ${indiceVariante + 1}`}
              />

              {/* As respostas se editam nos proprios blocos do canvas: cada
                  uma e um no, e clicar nela abre o painel dela. */}
              {(variante.opcoes ?? []).length > 0 && (
                <p style={{ margin: 0, fontSize: 10.5, color: CFG.muted }}>
                  {(variante.opcoes ?? []).length} resposta(s) — clique no bloco de cada uma para editar.
                </p>
              )}

              {(variante.opcoesSource === 'categorias' || variante.opcoesSource === 'cartoes') && (
                <p style={{ margin: 0, fontSize: 10, fontStyle: 'italic', color: CFG.muted }}>
                  As opções vêm {variante.opcoesSource === 'categorias' ? 'das categorias' : 'dos cartões'} da conta.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={rotuloSecao}>Comportamento</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.text }}>
          <input
            type="checkbox"
            checked={node.skippable === true}
            onChange={(evento) => onChange({ ...node, skippable: evento.target.checked })}
          />
          Pode ser pulada
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.text }}>
          <input
            type="checkbox"
            checked={node.exigeConfirmacao === true}
            onChange={(evento) => onChange({ ...node, exigeConfirmacao: evento.target.checked })}
          />
          Pede confirmação
        </label>
      </div>

      {node.aplicaQuando && node.aplicaQuando.length > 0 && (
        <div>
          <span style={rotuloSecao}>Só pergunta quando</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11.5, color: C.textMuted }}>
            {node.aplicaQuando.map((condicao, i) => (
              <li key={i}>{condicao.campo} {condicao.operador} {String(condicao.valor ?? '')}</li>
            ))}
          </ul>
        </div>
      )}

      {node.limpaAoResponder && node.limpaAoResponder.length > 0 && (
        <div>
          <span style={rotuloSecao}>Ao responder, limpa</span>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.textMuted }}>
            {node.limpaAoResponder.join(', ')}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => onRemover(node.id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2',
          color: '#b91c1c', fontSize: 11.5, fontWeight: 600, padding: '6px 8px',
          cursor: 'pointer',
        }}
      >
        <Trash2 size={13} /> Remover pergunta
      </button>
    </div>
  );
}
