import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CreditCard, Calendar, DollarSign } from 'lucide-react';
import { fetchCartoes, saveCartao, deleteCartao } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Cartao, CartaoFormValues, CartaoTipo } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { CFG, CFG_MONO_CLASS } from '../../ui/configTokens';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

const TIPO_OPCOES: { value: CartaoTipo; label: string }[] = [
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'ambos', label: 'Ambos' },
];

const COR_OPCOES = [
  { value: '#1e40af', label: 'Azul' },
  { value: '#065f46', label: 'Verde escuro' },
  { value: '#7c2d12', label: 'Marrom' },
  { value: '#4c1d95', label: 'Roxo' },
  { value: '#831843', label: 'Rosa escuro' },
  { value: '#134e4a', label: 'Teal escuro' },
  { value: '#1e293b', label: 'Grafite' },
  { value: '#b45309', label: 'Dourado' },
];

function formatValidade(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function formatLimite(limite?: number | string | null): string {
  if (limite === null || limite === undefined || limite === '') return '—';
  const n = Number(limite);
  if (!Number.isFinite(n)) return '—';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TIPO_LABEL: Record<string, string> = {
  credito: 'CRÉDITO',
  debito: 'DÉBITO',
  ambos: 'AMBOS',
};

/**
 * Cartão visual — usado tanto na listagem quanto como pré-visualização ao
 * vivo dentro do formulário. Renderiza só dados que já existem no tipo
 * `Cartao`; nenhum campo novo é exigido do backend.
 */
function CartaoPreview({
  nome, ultimos4, limite, vencimento, tipo, cor,
}: {
  nome: string;
  ultimos4?: string | null;
  limite?: number | string | null;
  vencimento?: number | string | null;
  tipo?: string | null;
  cor: string;
}) {
  return (
    <div
      style={{
        position: 'relative', aspectRatio: '1.58', borderRadius: 14, padding: 13,
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', overflow: 'hidden',
        background: cor,
        boxShadow: '0 6px 18px -6px rgba(2,20,28,.4)',
      }}
    >
      <div style={{
        position: 'absolute', top: '-40%', right: '-20%', width: 150, height: 150,
        borderRadius: '50%', background: 'rgba(255,255,255,.07)',
      }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 26, height: 19, borderRadius: 5, background: 'rgba(255,255,255,.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 14, height: 9, borderRadius: 2, border: '1px solid rgba(255,255,255,.6)' }} />
        </div>
        {tipo && (
          <span style={{
            fontSize: 8.5, fontWeight: 700, lineHeight: 1, letterSpacing: '.1em', color: '#fff',
            background: 'rgba(255,255,255,.22)', padding: '4px 6px', borderRadius: 999,
          }}>
            {TIPO_LABEL[tipo] ?? tipo.toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span className={CFG_MONO_CLASS} style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '.08em', color: '#fff' }}>
          •••• {ultimos4 || '0000'}
        </span>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nome || 'Nome do cartão'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>
            Venc. {vencimento || '—'}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,.92)' }}>
          Limite {formatLimite(limite)}
        </span>
      </div>
    </div>
  );
}

function CartaoDialog({
  open, cartao, isSaving, error, onClose, onSave,
}: {
  open: boolean; cartao?: Cartao; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: CartaoFormValues) => void;
}) {
  const [cor, setCor] = useState(cartao?.cor ?? COR_OPCOES[0].value);
  const [tipo, setTipo] = useState<CartaoTipo | undefined>(cartao?.tipo ?? undefined);
  const [validade, setValidade] = useState(cartao?.validade ?? '');
  // Espelho dos campos que aparecem na pré-visualização. O form continua
  // sendo lido via FormData no submit; estes estados servem só ao preview.
  const [previewNome, setPreviewNome] = useState(cartao?.nome ?? '');
  const [previewUltimos4, setPreviewUltimos4] = useState(cartao?.numero_cartao ?? '');
  const [previewLimite, setPreviewLimite] = useState<string>(cartao?.limite != null ? String(cartao.limite) : '');
  const [previewVencimento, setPreviewVencimento] = useState<string>(
    cartao?.dia_vencimento != null ? String(cartao.dia_vencimento) : '',
  );
  const limiteGuide = useFirstAccessGuide('cartoes:limite-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });
  const validadeGuide = useFirstAccessGuide('cartoes:validade-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });
  const fechamentoGuide = useFirstAccessGuide('cartoes:fechamento-vencimento-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });

  const validadeIncompleta = validade.length > 0 && validade.length < 5;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validadeIncompleta) return;
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: fd.get('nome') as string,
      limite: fd.get('limite') ? Number(fd.get('limite')) : undefined,
      dia_fechamento: fd.get('dia_fechamento') ? Number(fd.get('dia_fechamento')) : undefined,
      dia_vencimento: fd.get('dia_vencimento') ? Number(fd.get('dia_vencimento')) : undefined,
      cor,
      numero_cartao: fd.get('numero_cartao') as string || undefined,
      validade: validade || undefined,
      tipo,
    });
  };

  return (
    <Dialog open={open} title={cartao ? 'Editar cartão' : 'Novo cartão'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 140px', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DO CARTÃO</span><span style={{ color: C.primary }}>*</span></label>
              <input
                name="nome"
                defaultValue={cartao?.nome}
                onChange={(e) => setPreviewNome(e.target.value)}
                placeholder="Ex: Nubank"
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>ÚLTIMOS 4 DÍGITOS</label>
              <input
                name="numero_cartao"
                maxLength={4}
                defaultValue={cartao?.numero_cartao ?? ''}
                onChange={(e) => setPreviewUltimos4(e.target.value)}
                placeholder="0000"
                style={fieldInputStyle}
              />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>LIMITE (R$)</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input
                name="limite"
                type="number"
                step="0.01"
                min="0"
                defaultValue={cartao?.limite ?? ''}
                onChange={(e) => setPreviewLimite(e.target.value)}
                placeholder="0,00"
                style={fieldInputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>VALIDADE</label>
                <span style={{ fontSize: 11, color: validadeIncompleta ? C.danger : C.placeholder }}>
                  {validadeIncompleta ? 'formato incompleto' : 'MM/AA'}
                </span>
              </div>
              <input
                value={validade}
                onChange={(e) => setValidade(formatValidade(e.target.value))}
                maxLength={5}
                placeholder="12/28"
                inputMode="numeric"
                style={{ ...fieldInputStyle, border: validadeIncompleta ? `1.5px solid ${C.danger}` : fieldInputStyle.border }}
              />
            </div>
            {limiteGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(22rem,calc(100vw-2rem))]"
                icon={DollarSign}
                description={firstAccessGuideMessages.cartoesLimite}
                onDismiss={limiteGuide.dismiss}
                onSilenceAll={limiteGuide.silenceAll}
              />
            )}
            {validadeGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                align="right"
                className="w-[min(22rem,calc(100vw-2rem))]"
                icon={Calendar}
                description={firstAccessGuideMessages.cartoesValidade}
                onDismiss={validadeGuide.dismiss}
                onSilenceAll={validadeGuide.silenceAll}
              />
            )}
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DIA DE FECHAMENTO</label>
              <input name="dia_fechamento" type="number" min="1" max="31" defaultValue={cartao?.dia_fechamento ?? ''} placeholder="Ex: 25" style={fieldInputStyle} />
              <span style={{ fontSize: 12, color: C.textFaint }}>Dia do mês</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DIA DE VENCIMENTO</label>
              <input
                name="dia_vencimento"
                type="number"
                min="1"
                max="31"
                defaultValue={cartao?.dia_vencimento ?? ''}
                onChange={(e) => setPreviewVencimento(e.target.value)}
                placeholder="Ex: 5"
                style={fieldInputStyle}
              />
              <span style={{ fontSize: 12, color: C.textFaint }}>Dia do mês</span>
            </div>
            {fechamentoGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(24rem,calc(100vw-2rem))]"
                icon={Calendar}
                description={firstAccessGuideMessages.cartoesFechamentoVencimento}
                onDismiss={fechamentoGuide.dismiss}
                onSilenceAll={fechamentoGuide.silenceAll}
              />
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>TIPO</label>
              <span style={{ fontSize: 12, color: C.textFaint }}>Define quais despesas podem usar este cartão</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {TIPO_OPCOES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipo(opt.value)}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', transition: 'all .13s ease',
                      border: tipo === opt.value ? `1.5px solid ${C.primary}` : '1.5px solid #e6edf1',
                      background: tipo === opt.value ? 'rgba(8,145,178,0.08)' : '#fff',
                      color: tipo === opt.value ? C.primary : C.textMuted,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>COR DO CARTÃO</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COR_OPCOES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCor(c.value)}
                    title={c.label}
                    style={{
                      height: 32, width: 32, borderRadius: 9, border: cor === c.value ? `2px solid ${C.primary}` : '2px solid transparent',
                      boxShadow: cor === c.value ? `0 0 0 2px #fff, 0 0 0 4px ${C.primary}` : 'none',
                      background: c.value, cursor: 'pointer', transition: 'all .13s ease',
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, maxWidth: 214 }}>
                <CartaoPreview
                  nome={previewNome}
                  ultimos4={previewUltimos4}
                  limite={previewLimite}
                  vencimento={previewVencimento}
                  tipo={tipo}
                  cor={cor}
                />
                <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: CFG.muted, textAlign: 'center' }}>
                  Pré-visualização
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
              border: 'none', transition: 'all .15s ease', cursor: isSaving ? 'not-allowed' : 'pointer',
              ...(isSaving
                ? { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }
                : { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }),
            }}
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CartaoTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Cartao }>({ open: false });
  const createGuide = useFirstAccessGuide('cartoes:novo-v1');
  const confirm = useConfirm();

  const cartoes = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes });

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: CartaoFormValues; id?: number }) => saveCartao(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cartoes }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCartao,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cartoes }),
  });

  const handleDeleteCartao = async (cartao: Cartao) => {
    const ok = await confirm({
      title: 'Excluir cartão',
      message: `Excluir cartão "${cartao.nome}"?`,
      confirmLabel: 'Excluir',
    });
    if (ok) deleteMut.mutate(cartao.id);
  };

  const data = cartoes.data ?? [];

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        countLabel={`${data.length} cartão/cartões cadastrado(s)`}
        actionLabel="Novo cartão"
        onAction={() => setDialog({ open: true })}
      >
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={CreditCard}
            description={firstAccessGuideMessages.cartoesNovo}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </ConfigTabHeader>

      {cartoes.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      {/* Sem EmptyState dedicado: o card tracejado "Adicionar cartão" abaixo já
          é o convite à ação quando a lista está vazia. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        {data.map((c) => (
          <div key={c.id} style={{ position: 'relative' }} className="group">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDialog({ open: true, item: c })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDialog({ open: true, item: c });
                }
              }}
              style={{ cursor: 'pointer' }}
              title={`Editar ${c.nome}`}
            >
              <CartaoPreview
                nome={c.nome}
                ultimos4={c.numero_cartao}
                limite={c.limite}
                vencimento={c.dia_vencimento}
                tipo={c.tipo}
                cor={c.cor ?? '#1e293b'}
              />
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDeleteCartao(c); }}
              title="Excluir"
              aria-label={`Excluir ${c.nome}`}
              className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              style={{
                position: 'absolute', top: 8, right: 8, display: 'grid', placeItems: 'center',
                width: 24, height: 24, borderRadius: 999, border: 'none',
                background: 'rgba(255,255,255,.22)', color: '#fff', cursor: 'pointer',
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setDialog({ open: true })}
          style={{
            aspectRatio: '1.58', borderRadius: 14, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
            border: `1.5px dashed ${CFG.borderInput}`, background: 'transparent', color: CFG.faint,
            transition: 'border-color .13s ease, color .13s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = CFG.primary;
            e.currentTarget.style.color = CFG.primaryDark;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = CFG.borderInput;
            e.currentTarget.style.color = CFG.faint;
          }}
        >
          <Plus size={18} strokeWidth={2} />
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>Adicionar cartão</span>
        </button>
      </div>

      <CartaoDialog
        open={dialog.open} cartao={dialog.item}
        isSaving={saveMut.isPending} error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
      />
    </div>
  );
}
