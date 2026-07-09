import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, CreditCard } from 'lucide-react';
import { fetchCartoes, saveCartao, deleteCartao } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Cartao, CartaoFormValues } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, SectionDivider } from '../../ui/form';

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

function CartaoDialog({
  open, cartao, isSaving, error, onClose, onSave,
}: {
  open: boolean; cartao?: Cartao; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: CartaoFormValues) => void;
}) {
  const [cor, setCor] = useState(cartao?.cor ?? COR_OPCOES[0].value);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: fd.get('nome') as string,
      limite: fd.get('limite') ? Number(fd.get('limite')) : undefined,
      dia_fechamento: fd.get('dia_fechamento') ? Number(fd.get('dia_fechamento')) : undefined,
      dia_vencimento: fd.get('dia_vencimento') ? Number(fd.get('dia_vencimento')) : undefined,
      cor,
      numero_cartao: fd.get('numero_cartao') as string || undefined,
      validade: fd.get('validade') as string || undefined,
    });
  };

  return (
    <Dialog open={open} title={cartao ? 'Editar cartão' : 'Novo cartão'} onClose={onClose} size="lg">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Nome do cartão">
            <Input name="nome" defaultValue={cartao?.nome} placeholder="Ex: Nubank" autoFocus required />
          </Field>
          <Field label="Últimos 4 dígitos">
            <Input name="numero_cartao" maxLength={4} defaultValue={cartao?.numero_cartao ?? ''} placeholder="0000" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Limite (R$)" hint="Opcional">
            <Input name="limite" type="number" step="0.01" min="0" defaultValue={cartao?.limite ?? ''} placeholder="0,00" />
          </Field>
          <Field label="Validade" hint="MM/AA">
            <Input name="validade" maxLength={5} defaultValue={cartao?.validade ?? ''} placeholder="12/28" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dia de fechamento" hint="Dia do mês">
            <Input name="dia_fechamento" type="number" min="1" max="31" defaultValue={cartao?.dia_fechamento ?? ''} placeholder="Ex: 25" />
          </Field>
          <Field label="Dia de vencimento" hint="Dia do mês">
            <Input name="dia_vencimento" type="number" min="1" max="31" defaultValue={cartao?.dia_vencimento ?? ''} placeholder="Ex: 5" />
          </Field>
        </div>

        <SectionDivider label="Cor do cartão" />

        <div className="flex flex-wrap gap-2.5">
          {COR_OPCOES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCor(c.value)}
              title={c.label}
              className={[
                'h-8 w-8 rounded-lg transition-all',
                cor === c.value ? 'ring-2 ring-offset-2 ring-brand-600 scale-110' : 'hover:scale-105',
              ].join(' ')}
              style={{ background: c.value }}
            />
          ))}
        </div>

        {/* Preview cartão */}
        <div
          className="flex items-center gap-3 rounded-xl p-4 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${cor}, ${cor}cc)` }}
        >
          <CreditCard size={24} className="text-white/80" />
          <div>
            <p className="font-bold text-white text-sm">{cor === COR_OPCOES[0].value ? 'Nome do cartão' : ''}</p>
            <p className="text-white/60 text-xs font-mono">•••• •••• •••• 0000</p>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CartaoTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Cartao }>({ open: false });

  const cartoes = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes });

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: CartaoFormValues; id?: number }) => saveCartao(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cartoes }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCartao,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cartoes }),
  });

  const data = cartoes.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.length} cartão/cartões cadastrado(s)</p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo cartão
        </Button>
      </div>

      {cartoes.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      {data.length === 0 && !cartoes.isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-12 text-slate-400">
          <CreditCard size={36} strokeWidth={1.5} />
          <p className="text-sm">Nenhum cartão cadastrado</p>
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
                    onClick={() => { if (confirm(`Excluir cartão "${c.nome}"?`)) deleteMut.mutate(c.id); }}
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
