import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CreditCard, Calendar, DollarSign } from 'lucide-react';
import { fetchCartoes, saveCartao } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Cartao, CartaoFormValues, CartaoTipo } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle,
  dangerButtonStyle, dialogFooterStyle,
} from '../../ui/dialogFormTokens';
import { CFG, CFG_MONO_CLASS } from '../../ui/configTokens';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { EmptyState } from '../../ui/EmptyState';
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

const TIPO_LABEL: Record<string, string> = {
  credito: 'CRÉDITO',
  debito: 'DÉBITO',
  ambos: 'AMBOS',
};

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

// ─── Cartão visual ───────────────────────────────────────────────────────────

/** Usado na grade e como pré-visualização ao vivo no formulário. */
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
        background: cor, boxShadow: '0 6px 18px -6px rgba(2,20,28,.4)',
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

// ─── Modal ───────────────────────────────────────────────────────────────────

function CartaoDialog({
  open, cartao, isSaving, error, onClose, onSave, onToggleAtivo,
}: {
  open: boolean; cartao?: Cartao; isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (v: CartaoFormValues) => void;
  onToggleAtivo?: () => void;
}) {
  const [cor, setCor] = useState(cartao?.cor ?? COR_OPCOES[0].value);
  const [tipo, setTipo] = useState<CartaoTipo | undefined>(cartao?.tipo ?? undefined);
  const [validade, setValidade] = useState(cartao?.validade ?? '');
  const [nome, setNome] = useState(cartao?.nome ?? '');
  const [ultimos4, setUltimos4] = useState(cartao?.numero_cartao ?? '');
  const [limite, setLimite] = useState(cartao?.limite != null ? String(cartao.limite) : '');
  const [vencimento, setVencimento] = useState(cartao?.dia_vencimento != null ? String(cartao.dia_vencimento) : '');

  const confirm = useConfirm();
  const limiteGuide = useFirstAccessGuide('cartoes:limite-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });
  const validadeGuide = useFirstAccessGuide('cartoes:validade-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });
  const fechamentoGuide = useFirstAccessGuide('cartoes:fechamento-vencimento-v1', { enabled: open, layer: GUIDE_LAYER_MODAL });

  const validadeIncompleta = validade.length > 0 && validade.length < 5;

  const handleToggleAtivo = async () => {
    if (!onToggleAtivo || !cartao) return;
    const ok = await confirm({
      title: cartao.ativo ? 'Desativar cartão' : 'Ativar cartão',
      message: cartao.ativo
        ? `Desativar "${cartao.nome}"? Ele deixará de aparecer nas opções ao lançar despesas. As despesas já lançadas continuam vinculadas.`
        : `Ativar "${cartao.nome}" novamente?`,
      confirmLabel: cartao.ativo ? 'Desativar' : 'Ativar',
      variant: cartao.ativo ? 'danger' : 'default',
    });
    if (ok) onToggleAtivo();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validadeIncompleta) return;
    const fd = new FormData(e.currentTarget);
    onSave({
      nome,
      limite: limite ? Number(limite) : undefined,
      dia_fechamento: fd.get('dia_fechamento') ? Number(fd.get('dia_fechamento')) : undefined,
      dia_vencimento: vencimento ? Number(vencimento) : undefined,
      cor,
      numero_cartao: ultimos4 || undefined,
      validade: validade || undefined,
      tipo,
    });
  };

  return (
    <Dialog open={open} title={cartao ? 'Editar cartão' : 'Novo cartão'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 306, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 214px', gap: 16, alignItems: 'start' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px', gap: 10 }}>
              <div>
                <label style={labelStyle}><span>Nome do cartão</span><span style={{ color: C.danger }}>*</span></label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Nubank"
                  autoFocus
                  required
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Últimos 4</label>
                <input
                  value={ultimos4}
                  onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  inputMode="numeric"
                  maxLength={4}
                  className={CFG_MONO_CLASS}
                  style={fieldInputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px', gap: 10, position: 'relative' }}>
              <div>
                <label style={labelStyle}><span>Limite (R$)</span><span style={{ color: C.danger }}>*</span></label>
                <input
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  required
                  className={CFG_MONO_CLASS}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Validade</label>
                <input
                  value={validade}
                  onChange={(e) => setValidade(formatValidade(e.target.value))}
                  maxLength={5}
                  placeholder="12/28"
                  inputMode="numeric"
                  className={CFG_MONO_CLASS}
                  style={{ ...fieldInputStyle, borderColor: validadeIncompleta ? C.danger : undefined }}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
              <div>
                <label style={labelStyle}>Fechamento</label>
                <input
                  name="dia_fechamento"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue={cartao?.dia_fechamento ?? ''}
                  placeholder="25"
                  className={CFG_MONO_CLASS}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Vencimento</label>
                <input
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  type="number"
                  min="1"
                  max="31"
                  placeholder="5"
                  className={CFG_MONO_CLASS}
                  style={fieldInputStyle}
                />
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

            <div>
              <label style={labelStyle}>Tipo</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: 3, borderRadius: 999, background: CFG.chipBg }}>
                {TIPO_OPCOES.map((opt) => {
                  const active = tipo === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTipo(opt.value)}
                      style={{
                        height: 26, border: 'none', borderRadius: 999,
                        background: active ? '#fff' : 'transparent',
                        color: active ? CFG.text : CFG.chipText,
                        fontSize: 11.5, fontWeight: 600, lineHeight: 1, cursor: 'pointer',
                        boxShadow: active ? '0 1px 2px rgba(15,23,42,.1)' : 'none',
                        transition: 'background .13s ease, color .13s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Cor do cartão</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {COR_OPCOES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCor(c.value)}
                    title={c.label}
                    aria-label={c.label}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', border: 'none', padding: 0,
                      background: c.value, cursor: 'pointer',
                      boxShadow: cor === c.value
                        ? `0 0 0 2px #fff, 0 0 0 4px ${CFG.primary}`
                        : '0 0 0 1px #e2e8f0',
                      transition: 'box-shadow .13s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CartaoPreview
              nome={nome}
              ultimos4={ultimos4}
              limite={limite}
              vencimento={vencimento}
              tipo={tipo}
              cor={cor}
            />
            <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: CFG.muted, textAlign: 'center' }}>
              Pré-visualização
            </span>
          </div>
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {cartao && onToggleAtivo && (
            <button type="button" style={dangerButtonStyle} onClick={handleToggleAtivo}>
              {cartao.ativo ? 'Desativar' : 'Ativar'}
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Tela ────────────────────────────────────────────────────────────────────

export function CartaoTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Cartao }>({ open: false });
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const createGuide = useFirstAccessGuide('cartoes:novo-v1');

  const cartoes = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes });

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: CartaoFormValues; id?: number }) => saveCartao(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cartoes }); setDialog({ open: false }); },
  });

  // Soft delete: o PUT exige nome e limite, então reenviamos os dados atuais
  // junto com o novo estado de `ativo`. Diferente do DELETE, funciona mesmo
  // com despesas vinculadas — elas preservam o histórico.
  const toggleAtivoMut = useMutation({
    mutationFn: (c: Cartao) => saveCartao({
      nome: c.nome,
      limite: c.limite ?? undefined,
      dia_fechamento: c.dia_fechamento ?? undefined,
      dia_vencimento: c.dia_vencimento ?? undefined,
      cor: c.cor ?? undefined,
      numero_cartao: c.numero_cartao ?? undefined,
      validade: c.validade ?? undefined,
      tipo: c.tipo ?? undefined,
      ativo: !c.ativo,
    }, c.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cartoes }); setDialog({ open: false }); },
  });

  const todos = cartoes.data ?? [];
  const data = todos.filter((c) => (mostrarDesativados ? !c.ativo : c.ativo));

  const estado = mostrarDesativados ? 'desativado' : 'ativo';
  const contagem = `${data.length} cartã${data.length === 1 ? 'o' : 'es'} ${estado}${data.length === 1 ? '' : 's'}`;

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={contagem}
          />
        }
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(214px, 1fr))', gap: 12 }}>
        {data.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setDialog({ open: true, item: c })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDialog({ open: true, item: c });
              }
            }}
            title={`Editar ${c.nome}`}
            style={{ cursor: 'pointer', transition: 'transform .13s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
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
        ))}

        {/* O tile tracejado é o convite à ação; só aparece na lista de ativos. */}
        {!mostrarDesativados && (
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
        )}
      </div>

      {mostrarDesativados && data.length === 0 && !cartoes.isLoading && (
        <EmptyState icon={CreditCard} title="Nenhum cartão desativado" />
      )}

      <CartaoDialog
        key={dialog.item ? String(dialog.item.id) : 'new'}
        open={dialog.open}
        cartao={dialog.item}
        isSaving={saveMut.isPending || toggleAtivoMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onToggleAtivo={dialog.item ? () => toggleAtivoMut.mutate(dialog.item as Cartao) : undefined}
      />
    </div>
  );
}
