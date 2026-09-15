import { CFG } from '../../../ui/configTokens';
import { C } from '../../../ui/dialogFormTokens';
import { SLOTS_DISPONIVEIS, type SlotDisponivel } from './slotsDisponiveis';

/**
 * Campos que podem virar perguntas, para arrastar ao canvas.
 *
 * Arrastar daqui e soltar lá cria o nó já com uma pergunta inicial, que
 * depois se edita no painel de propriedades.
 */
export function PaletaCampos({ slotsEmUso }: { slotsEmUso: Set<string> }) {
  const aoArrastar = (evento: React.DragEvent, campo: SlotDisponivel) => {
    // O canvas lê isto no drop para saber qual campo criar.
    evento.dataTransfer.setData('application/fluxo-slot', campo.slot);
    evento.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, color: CFG.muted, lineHeight: 1.45 }}>
        Arraste um campo para o quadro para criar uma pergunta.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SLOTS_DISPONIVEIS.map((campo) => {
          const jaUsado = slotsEmUso.has(campo.slot);

          return (
            <div
              key={campo.slot}
              draggable
              onDragStart={(evento) => aoArrastar(evento, campo)}
              title={campo.perguntaPadrao}
              style={{
                borderRadius: 8,
                border: `1px solid ${CFG.borderSoft}`,
                padding: '6px 8px',
                background: '#fff',
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ flex: 1, fontSize: 12, color: C.text }}>{campo.rotulo}</span>

              {/* Um campo pode repetir no fluxo (perguntar o valor de um jeito
                  no crédito e de outro no Pix), então "em uso" informa, não
                  bloqueia. */}
              {jaUsado && (
                <span style={{ fontSize: 9.5, color: CFG.muted }}>em uso</span>
              )}

              {campo.somenteDespesa && (
                <span
                  title="Receita grava apenas descrição e valor"
                  style={{
                    borderRadius: 4,
                    background: '#f5f3ff',
                    padding: '1px 4px',
                    fontSize: 9,
                    color: '#7c3aed',
                  }}
                >
                  despesa
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
