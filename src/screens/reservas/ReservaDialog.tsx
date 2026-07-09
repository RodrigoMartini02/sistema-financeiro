import { useEffect, useState } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Dialog } from '../../ui/dialog';
import { Field, Input, SectionDivider, ToggleRow } from '../../ui/form';
import { Button } from '../../ui/button';
import type { Reserva, ReservaFormValues, MovimentacaoFormValues } from '../../types/reservas';

const EMOJIS = ['💰', '🏠', '🚗', '✈️', '📚', '🛡️', '🎓', '💊', '🎮', '💻', '💶', '🐾'];

const CORES = [
  { value: '#6366f1', label: 'Índigo' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Âmbar' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#84cc16', label: 'Lima' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
];

const configSchema = z.object({
  observacoes: z.string().min(2, 'Informe o nome da reserva'),
  icone: z.string().default('💰'),
  cor: z.string().default('#6366f1'),
  objetivo_valor: z.preprocess(
    (value) => value === '' || value === null ? undefined : value,
    z.coerce.number().min(0).optional(),
  ),
  data_objetivo: z.string().optional(),
});

const movSchema = z.object({
  tipo: z.enum(['deposito', 'retirada']),
  valor: z.coerce.number().positive('Valor deve ser maior que zero'),
  descricao: z.string().optional(),
  data: z.string().min(10),
});

const TIPOS = [
  { value: 'deposito', label: 'Depósito',  description: 'Adicionar dinheiro à reserva' },
  { value: 'retirada', label: 'Retirada',  description: 'Sacar da reserva' },
];

interface Props {
  open: boolean;
  reserva?: Reserva;
  isSaving: boolean;
  isMovimentando?: boolean;
  error?: string;
  startTab?: 'config' | 'movimentar';
  onClose: () => void;
  onSave: (v: ReservaFormValues) => void;
  onMovimentar: (v: MovimentacaoFormValues) => void;
}

function calcContribuicao(valorAtual: number, meta: number, prazo: string): number | null {
  if (!meta || !prazo) return null;
  const hoje = new Date();
  const dataPrazo = new Date(prazo);
  const meses =
    (dataPrazo.getFullYear() - hoje.getFullYear()) * 12 +
    (dataPrazo.getMonth() - hoje.getMonth());
  if (meses <= 0) return null;
  const restante = meta - valorAtual;
  if (restante <= 0) return null;
  return Math.ceil(restante / meses);
}

export function ReservaDialog({
  open, reserva, isSaving, isMovimentando = false, error, startTab, onClose, onSave, onMovimentar,
}: Props) {
  const [tab, setTab] = useState<'config' | 'movimentar'>('config');

  // --- Form: Configurações ---
  const configForm = useForm<ReservaFormValues>({
    resolver: zodResolver(configSchema) as Resolver<ReservaFormValues>,
    defaultValues: {
      observacoes: '',
      icone: '💰',
      cor: '#6366f1',
      objetivo_valor: undefined,
      data_objetivo: undefined,
    },
  });

  const icone = configForm.watch('icone');
  const cor = configForm.watch('cor');
  const objetivoValor = configForm.watch('objetivo_valor');
  const dataObjetivo = configForm.watch('data_objetivo');

  const contribuicao = objetivoValor && dataObjetivo
    ? calcContribuicao(Number(reserva?.valor ?? 0), Number(objetivoValor), dataObjetivo)
    : null;

  // --- Form: Movimentar ---
  const today = new Date().toISOString().slice(0, 10);

  const movForm = useForm<z.input<typeof movSchema>, unknown, MovimentacaoFormValues>({
    resolver: zodResolver(movSchema),
    defaultValues: { tipo: 'deposito', valor: 0, descricao: '', data: today },
  });

  const movTipo = movForm.watch('tipo');

  // Sync ao abrir
  useEffect(() => {
    if (!open) return;
    setTab(startTab ?? 'config');
    configForm.reset({
      observacoes: reserva?.observacoes ?? '',
      icone: reserva?.icone ?? '💰',
      cor: reserva?.cor ?? '#6366f1',
      objetivo_valor: reserva?.objetivo_valor ?? undefined,
      data_objetivo: reserva?.data_objetivo?.slice(0, 10) ?? undefined,
    });
    movForm.reset({ tipo: 'deposito', valor: 0, descricao: '', data: today });
  }, [open, reserva, startTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMovimentar = (values: MovimentacaoFormValues) => {
    onMovimentar(values);
    movForm.reset({ tipo: 'deposito', valor: 0, descricao: '', data: today });
  };

  return (
    <Dialog open={open} title={reserva ? 'Editar reserva' : 'Nova reserva'} onClose={onClose} size="lg">

      {/* Seletor de abas — só aparece ao editar */}
      {reserva && (
        <div className="flex gap-1 mb-5 rounded-xl bg-slate-100 dark:bg-slate-700/60 p-1">
          {(['config', 'movimentar'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all',
                tab === t
                  ? 'bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              ].join(' ')}
            >
              {t === 'config' ? 'Configurações' : 'Movimentar'}
            </button>
          ))}
        </div>
      )}

      {/* ── Aba: Configurações ── */}
      {tab === 'config' && (
        <form className="grid gap-5" onSubmit={configForm.handleSubmit(onSave)}>

          {/* Ícone + Nome */}
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-start">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Ícone</p>
              <div className="grid grid-cols-4 gap-1.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => configForm.setValue('icone', e)}
                    className={[
                      'h-8 w-8 rounded-lg text-lg transition flex items-center justify-center',
                      icone === e
                        ? 'ring-2 ring-offset-1 ring-brand-600 bg-slate-100'
                        : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Nome da reserva" error={configForm.formState.errors.observacoes?.message}>
              <Input
                {...configForm.register('observacoes')}
                placeholder="Ex: Fundo de emergência"
                autoFocus
              />
            </Field>
          </div>

          {/* Paleta de cores */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cor</p>
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => configForm.setValue('cor', c.value)}
                  title={c.label}
                  className={[
                    'h-7 w-7 rounded-full transition-all',
                    cor === c.value ? 'ring-2 ring-offset-2 ring-brand-600 scale-110' : 'hover:scale-105',
                  ].join(' ')}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>

          {/* Prévia */}
          <div
            className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
            style={{ borderColor: `${cor}40`, background: `${cor}10` }}
          >
            <span className="text-xl">{icone}</span>
            <div className="h-3 w-3 rounded-full shrink-0" style={{ background: cor }} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {configForm.watch('observacoes') || 'Prévia da reserva'}
            </span>
          </div>

          {/* Meta (opcional) */}
          <SectionDivider label="Meta (opcional)" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor-alvo (R$)" hint="Defina uma meta de economia">
              <Input
                {...configForm.register('objetivo_valor')}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
              />
            </Field>
            <Field label="Prazo da meta" hint="Data para atingir a meta">
              <Input {...configForm.register('data_objetivo')} type="date" />
            </Field>
          </div>

          {contribuicao !== null && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>⏱</span>
              <span>
                Você precisa guardar cerca de{' '}
                <strong>
                  {contribuicao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  /mês
                </strong>{' '}
                para atingir a meta.
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      )}

      {/* ── Aba: Movimentar (só ao editar) ── */}
      {tab === 'movimentar' && reserva && (
        <form className="grid gap-5" onSubmit={movForm.handleSubmit(handleMovimentar as any)}>

          <Controller
            control={movForm.control}
            name="tipo"
            render={({ field }) => (
              <Field label="Tipo de movimentação">
                <div className="grid gap-2">
                  {TIPOS.map((opt) => (
                    <ToggleRow
                      key={opt.value}
                      label={opt.label}
                      description={opt.description}
                      checked={field.value === opt.value}
                      onChange={() => field.onChange(opt.value)}
                    />
                  ))}
                </div>
              </Field>
            )}
          />

          <div className={[
            'rounded-xl border p-4 transition',
            movTipo === 'deposito' ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50',
          ].join(' ')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)" error={movForm.formState.errors.valor?.message}>
                <Input
                  {...movForm.register('valor')}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  autoFocus
                />
              </Field>
              <Field label="Data">
                <Input {...movForm.register('data')} type="date" />
              </Field>
            </div>
          </div>

          <Field label="Descrição" hint="Opcional">
            <Input {...movForm.register('descricao')} placeholder="Ex: Aporte mensal" />
          </Field>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={isMovimentando}
              variant={movTipo === 'retirada' ? 'danger' : 'primary'}
            >
              {isMovimentando ? 'Confirmando...' : movTipo === 'deposito' ? 'Depositar' : 'Retirar'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
