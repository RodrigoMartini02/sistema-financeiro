import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, CreditCard, Calendar, DollarSign } from 'lucide-react';
import { fetchCartoes, saveCartao, deleteCartao } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Cartao, CartaoFormValues } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

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

function CartaoDialog({
  open, cartao, isSaving, error, onClose, onSave,
}: {
  open: boolean; cartao?: Cartao; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: CartaoFormValues) => void;
}) {
  const [cor, setCor] = useState(cartao?.cor ?? COR_OPCOES[0].value);
  const [validade, setValidade] = useState(cartao?.validade ?? '');
  const limiteGuide = useFirstAccessGuide('cartoes:limite-v1');
  const validadeGuide = useFirstAccessGuide('cartoes:validade-v1');
  const fechamentoGuide = useFirstAccessGuide('cartoes:fechamento-vencimento-v1');

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
    });
  };

  return (
    <Dialog open={open} title={cartao ? 'Editar cartão' : 'Novo cartão'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 140px', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DO CARTÃO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" defaultValue={cartao?.nome} placeholder="Ex: Nubank" autoFocus required style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>ÚLTIMOS 4 DÍGITOS</label>
              <input name="numero_cartao" maxLength={4} defaultValue={cartao?.numero_cartao ?? ''} placeholder="0000" style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>LIMITE (R$)</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input name="limite" type="number" step="0.01" min="0" defaultValue={cartao?.limite ?? ''} placeholder="0,00" style={fieldInputStyle} />
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
                className="absolute left-0 top-full z-[45] mt-3 w-[min(22rem,calc(100vw-2rem))]"
                icon={DollarSign}
                description={firstAccessGuideMessages.cartoesLimite}
                onDismiss={limiteGuide.dismiss}
              />
            )}
            {validadeGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                align="right"
                className="absolute right-0 top-full z-[45] mt-3 w-[min(22rem,calc(100vw-2rem))]"
                icon={Calendar}
                description={firstAccessGuideMessages.cartoesValidade}
                onDismiss={validadeGuide.dismiss}
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
              <input name="dia_vencimento" type="number" min="1" max="31" defaultValue={cartao?.dia_vencimento ?? ''} placeholder="Ex: 5" style={fieldInputStyle} />
              <span style={{ fontSize: 12, color: C.textFaint }}>Dia do mês</span>
            </div>
            {fechamentoGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="absolute left-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
                icon={Calendar}
                description={firstAccessGuideMessages.cartoesFechamentoVencimento}
                onDismiss={fechamentoGuide.dismiss}
              />
            )}
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

              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16, marginTop: 4 }}
              >
                <div style={{ background: `linear-gradient(135deg, ${cor}, ${cor}cc)`, borderRadius: 14, padding: 16, width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CreditCard size={24} color="rgba(255,255,255,0.8)" />
                  <div>
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: 14, margin: 0 }}>Nome do cartão</p>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace', margin: 0 }}>•••• •••• •••• 0000</p>
                  </div>
                </div>
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
    <div className="grid gap-4">
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.length} cartão/cartões cadastrado(s)</p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo cartão
        </Button>
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={CreditCard}
            description={firstAccessGuideMessages.cartoesNovo}
            align="right"
            floating
            placement="top"
            className="absolute right-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
          />
        )}
      </div>

      {cartoes.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      {data.length === 0 && !cartoes.isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-10 text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <CreditCard size={36} strokeWidth={1.5} />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Nenhum cartão cadastrado</p>
            <p className="mt-1 text-xs text-slate-400">Cadastre um cartão para acompanhar limite e vencimento.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.map((c) => {
          const cor = c.cor ?? '#1e293b';
          return (
            <div
              key={c.id}
              className="relative overflow-hidden rounded-2xl p-5 shadow-md"
              style={{ background: `linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%)` }}
            >
              <div className="flex items-start justify-between mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <CreditCard size={20} className="text-white" />
                </div>
                <div className="flex gap-1">
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 transition"
                    onClick={() => setDialog({ open: true, item: c })}
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-red-400/40 transition"
                    onClick={() => handleDeleteCartao(c)}
                    title="Excluir"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <p className="font-mono text-sm tracking-widest text-white/60 mb-1">
                •••• •••• •••• {c.numero_cartao ?? '????'}
              </p>
              <p className="text-base font-bold text-white mb-4">{c.nome}</p>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Limite</p>
                  <p className="text-sm font-bold text-white">
                    {c.limite ? `R$ ${Number(c.limite).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Vencimento</p>
                  <p className="text-sm font-bold text-white">
                    {c.dia_vencimento ? `Dia ${c.dia_vencimento}` : '—'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
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
