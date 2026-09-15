import { CFG } from '../../../ui/configTokens';
import { C } from '../../../ui/dialogFormTokens';
import type { FlowDefinition, FlowNode } from '../../../services/assistantFlowService';
import { valorDeChipAceito, valoresAceitosDoSlot } from './flowValidation';

/**
 * Edição de uma resposta selecionada no canvas.
 *
 * Separado do painel da pergunta porque agora a resposta é um bloco próprio:
 * clicar nela abre o que é dela — o texto do botão, o valor que vai para o
 * assistente e para onde ela leva.
 */

interface PainelEdicaoRespostaProps {
  definicao: FlowDefinition;
  node: FlowNode;
  valor: string;
  onChange: (node: FlowNode) => void;
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

export function PainelEdicaoResposta({ definicao, node, valor, onChange }: PainelEdicaoRespostaProps) {
  const indiceVariante = node.variantes.findIndex(
    (variante) => (variante.opcoes ?? []).some((opcao) => opcao.value === valor),
  );
  const opcao = indiceVariante >= 0
    ? (node.variantes[indiceVariante]?.opcoes ?? []).find((item) => item.value === valor)
    : undefined;

  if (!opcao) {
    // Lista dinâmica (categorias, cartões): as opções vêm do cadastro da
    // conta, não do fluxo, então não há o que editar aqui.
    return (
      <p style={{ margin: 0, fontSize: 12, color: CFG.muted, lineHeight: 1.45 }}>
        As opções desta pergunta vêm do cadastro da conta e mudam por usuário.
        Não são editadas pelo fluxo.
      </p>
    );
  }

  const alterar = (campo: 'label' | 'value', novo: string) => {
    onChange({
      ...node,
      variantes: node.variantes.map((variante, i) => {
        if (i !== indiceVariante) return variante;
        return {
          ...variante,
          opcoes: (variante.opcoes ?? []).map((item) => (
            item.value === valor ? { ...item, [campo]: novo } : item
          )),
        };
      }),
      // O valor é a chave da transição: renomeá-lo sem levar a transição junto
      // deixaria a ligação desenhada apontando para um valor que não existe.
      ...(campo === 'value' && node.transicoes
        ? { transicoes: node.transicoes.map((t) => (t.quando === valor ? { ...t, quando: novo } : t)) }
        : {}),
    });
  };

  const alterarDestino = (destino: string) => {
    const semAntiga = (node.transicoes ?? []).filter((t) => t.quando !== valor);

    onChange({
      ...node,
      transicoes: destino === ''
        ? semAntiga
        : [...semAntiga, { quando: valor, destino }],
    });
  };

  const destinoAtual = (node.transicoes ?? []).find((t) => t.quando === valor)?.destino ?? '';
  const valorQuebra = !valorDeChipAceito(node.slot, opcao.value);
  const sugestoes = valoresAceitosDoSlot(node.slot);

  const indiceDoNo = definicao.ordem.indexOf(node.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <span style={rotuloSecao}>Resposta de</span>
        <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 12, color: C.text }}>
          {node.slot}
        </p>
      </div>

      <div>
        <span style={rotuloSecao}>Texto do botão</span>
        <input
          value={opcao.label}
          onChange={(evento) => alterar('label', evento.target.value)}
          style={{ ...campoTexto, marginTop: 4 }}
          aria-label="Texto do botão"
        />
      </div>

      <div>
        <span style={rotuloSecao}>Valor enviado</span>
        <input
          value={opcao.value}
          onChange={(evento) => alterar('value', evento.target.value)}
          style={{
            ...campoTexto,
            marginTop: 4,
            fontFamily: 'monospace',
            fontSize: 11.5,
            borderColor: valorQuebra ? '#f59e0b' : CFG.borderSoft,
          }}
          aria-label="Valor enviado ao assistente"
        />

        {/* É o valor, não o texto, que vai para o parser. Avisar aqui evita
            descobrir só conversando, com o assistente respondendo que não
            entendeu a própria opção que ofereceu. */}
        {valorQuebra && (
          <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#b45309', lineHeight: 1.4 }}>
            O assistente não entende &quot;{opcao.value}&quot;
            {sugestoes.length > 0 && <> — esperado: {sugestoes.join(', ')}</>}
          </p>
        )}
      </div>

      <div>
        <span style={rotuloSecao}>Leva para</span>
        <select
          value={destinoAtual ?? ''}
          onChange={(evento) => alterarDestino(evento.target.value)}
          style={{ ...campoTexto, marginTop: 4 }}
          aria-label="Pergunta de destino"
        >
          <option value="">Seguir o fluxo normal</option>
          {definicao.ordem.map((id, indice) => {
            const destino = definicao.nos.find((item) => item.id === id);
            if (!destino) return null;

            const eRetorno = indiceDoNo >= 0 && indice <= indiceDoNo;
            return (
              <option key={id} value={id}>
                {destino.slot}{eRetorno ? ' (volta)' : ''}
              </option>
            );
          })}
        </select>

        <p style={{ margin: '3px 0 0', fontSize: 10.5, color: CFG.muted, lineHeight: 1.4 }}>
          &quot;Seguir o fluxo normal&quot; deixa o assistente escolher a próxima
          pergunta pelas condições, como sempre fez.
        </p>
      </div>
    </div>
  );
}
