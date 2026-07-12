import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Paperclip, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { MONTH_NAMES, type Attachment, type Income, type IncomeFormValues } from '../../types/finance';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input, ToggleGroup, SectionDivider } from '../../ui/form';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { fetchRepresentantes } from '../../services/representantesService';
import { fetchIncomeTypes } from '../../services/incomeTypesService';
import { fetchContratosAtivos } from '../../services/clientesService';
import { queryKeys } from '../../services/queryKeys';

const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor:           z.coerce.number().positive('Valor deve ser maior que zero'),
  data:            z.string().min(10, 'Informe a data'),
  cliente:         z.string().optional(),
  tipoReceita:     z.string().optional(),
  representanteId: z.coerce.number().nullable().optional(),
});

interface Props {
  open: boolean; month: number; year: number;
  income?: Income; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: IncomeFormValues) => Promise<void>;
}

export function IncomeDialog({ open, month, year, income, isSaving, error, onClose, onSave }: Props) {
  const defaultDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const isNew = !income;

  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);
  const [replicar, setReplicar] = useState(false);
  const [replicarMes, setReplicarMes] = useState(month);
  const [replicarAno, setReplicarAno] = useState(year);

  const [horasFaturar, setHorasFaturar] = useState(false);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [tipoHora, setTipoHora] = useState<'presencial' | 'remoto' | null>(null);
  const [quantidadeHoras, setQuantidadeHoras] = useState<number | ''>('');

  const repsQ = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes, staleTime: 60_000 });
  const representantes = repsQ.data ?? [];

  const contratosQ = useQuery({ queryKey: queryKeys.contratosAtivos, queryFn: fetchContratosAtivos, staleTime: 60_000 });
  const contratosAtivos = contratosQ.data ?? [];

  const typesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes, staleTime: 60_000 });
  const tiposOpcoes = (typesQ.data ?? [])
    .filter((t) => t.ativo)
    .map((t) => ({ value: t.nome, label: t.nome, icon: null as React.ReactNode }));

  const repOpcoes = [
    { value: '', label: 'Nenhum' },
    ...representantes.map((r) => ({ value: String(r.id), label: r.nome })),
  ];

  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: '', valor: '' as unknown as number, data: defaultDate,
      cliente: '', tipoReceita: '', representanteId: null,
    },
  });

  const contratoSelecionado = contratoId ? (contratosAtivos.find((c) => c.id === contratoId) ?? null) : null;
  const valorHora = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_valor ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_valor ?? null)
    : null;
  const saldoAtual = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_saldo_atual ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_saldo_atual ?? null)
    : null;
  const valorCalculado = (valorHora && quantidadeHoras) ? Number(quantidadeHoras) * valorHora : null;

  useEffect(() => {
    if (valorCalculado && valorCalculado > 0) {
      form.setValue('valor', valorCalculado);
    }
  }, [valorCalculado, form]);

  useEffect(() => {
    if (!open) {
      setAnexos([]); setReplicar(false);
      setReplicarMes(month); setReplicarAno(year);
      setHorasFaturar(false); setContratoId(null); setTipoHora(null); setQuantidadeHoras('');
      return;
    }
    setAnexos(income?.anexos ?? []);
    form.reset({
      descricao:       income?.descricao ?? '',
      valor:           income?.valor ?? ('' as unknown as number),
      data:            income?.data ?? defaultDate,
      cliente:         income?.cliente ?? '',
      tipoReceita:     income?.tipoReceita ?? '',
      representanteId: income?.representanteId ?? null,
    });
  }, [income, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorWatch           = useWatch({ control: form.control, name: 'valor' });
  const tipoReceitaWatch     = useWatch({ control: form.control, name: 'tipoReceita' });
  const representanteIdWatch = useWatch({ control: form.control, name: 'representanteId' });

  const repSelecionado = representanteIdWatch
    ? representantes.find((r) => r.id === Number(representanteIdWatch))
    : null;
  const comissaoMatch = repSelecionado?.comissoes?.find((c) => c.tipo_receita === tipoReceitaWatch);
  const valorComissao =
    comissaoMatch && valorWatch > 0
      ? (valorWatch * Number(comissaoMatch.percentual)) / 100
      : null;

  const handleSubmit = async (data: z.output<typeof schema>) => {
    const formValues: IncomeFormValues = {
      descricao:         data.descricao,
      valor:             data.valor,
      data:              data.data,
      cliente:           data.cliente,
      tipoReceita:       data.tipoReceita,
      representanteId:   data.representanteId,
      valorComissao:     valorComissao ?? null,
      anexos,
      replicarAte:       isNew && replicar ? { mes: replicarMes, ano: replicarAno } : null,
      contratoId:        isNew && horasFaturar ? contratoId : null,
      tipoHora:          isNew && horasFaturar ? tipoHora : null,
      quantidadeHoras:   isNew && horasFaturar && quantidadeHoras !== '' ? Number(quantidadeHoras) : null,
    };
    await onSave(formValues);
  };

  const currentYear = new Date().getFullYear();
  const replicarAnoOptions = Array.from({ length: 3 }, (_, i) => currentYear + i);
  const replicarMesOptions = Array.from({ length: 12 }, (_, i) => ({ value: i, label: MONTH_NAMES[i] }));

  return (
    <Dialog
      open={open}
      title={income ? 'Editar receita' : 'Nova receita'}
      description="Registre uma entrada financeira"
      onClose={onClose}
      size="lg"
    >
      <form className="grid gap-4" onSubmit={form.handleSubmit(handleSubmit)}>

        {/* ── Descrição + Anexos ────────────────────────────────── */}
        <div className="grid gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Descrição" required error={form.formState.errors.descricao?.message}>
                <Input {...form.register('descricao')} placeholder="Ex: Salário mensal" autoFocus />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => attachmentRef.current?.openPicker()}
              title="Anexar arquivo"
              className={[
                'mb-[1px] flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-all shrink-0',
                anexos.length > 0
                  ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500',
              ].join(' ')}
            >
              <Paperclip size={13} />
              {anexos.length > 0 && <span>{anexos.length}</span>}
            </button>
          </div>
          <div className={anexos.length > 0 ? 'rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50' : ''}>
            <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
          </div>
        </div>

        {/* ── Valor | Data | Cliente ────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Valor (R$)" required error={form.formState.errors.valor?.message}>
            <Input {...form.register('valor')} type="number" step="0.01" min="0" placeholder="0,00" />
          </Field>
          <Field label="Data de recebimento" required error={form.formState.errors.data?.message}>
            <Input {...form.register('data')} type="date" />
          </Field>
          <Field label="Cliente / Fonte">
            <Input {...form.register('cliente')} placeholder="Ex: Empresa XYZ" />
          </Field>
        </div>

        {/* ── Tipo de receita ───────────────────────────────────── */}
        {tiposOpcoes.length > 0 && (
          <>
            <SectionDivider label="Tipo de receita" />
            <Controller
              control={form.control}
              name="tipoReceita"
              render={({ field }) => (
                <ToggleGroup
                  value={field.value ?? ''}
                  options={tiposOpcoes}
                  onChange={field.onChange}
                />
              )}
            />
          </>
        )}

        {/* ── Representante (pills) ─────────────────────────────── */}
        {representantes.length > 0 && (
          <>
            <SectionDivider label="Representante" />
            <Controller
              control={form.control}
              name="representanteId"
              render={({ field }) => (
                <ToggleGroup
                  value={field.value ? String(field.value) : ''}
                  options={repOpcoes}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                />
              )}
            />
          </>
        )}

        {/* ── Preview de comissão ───────────────────────────────── */}
        {valorComissao !== null && repSelecionado && comissaoMatch && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span className="font-medium">{repSelecionado.nome}</span>
            <span className="text-brand-400">receberá</span>
            <span className="font-semibold">
              {valorComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
            <span className="text-brand-300">·</span>
            <span>{comissaoMatch.percentual}%</span>
            <span className="text-brand-300">·</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium capitalize">
              {comissaoMatch.tipo === 'unica' ? 'única' : 'mensal'}
            </span>
          </div>
        )}

        {/* ── Horas a faturar (nova receita only) ──────────────── */}
        {isNew && contratosAtivos.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <button
              type="button"
              onClick={() => { setHorasFaturar((v) => !v); if (horasFaturar) { setContratoId(null); setTipoHora(null); setQuantidadeHoras(''); } }}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              <span className="flex items-center gap-2"><Clock size={14} />Horas a faturar...</span>
              {horasFaturar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {horasFaturar && (
              <div className="mt-3 space-y-3">
                <Field label="Contrato">
                  <select
                    value={contratoId ?? ''}
                    onChange={(e) => { setContratoId(e.target.value ? Number(e.target.value) : null); setTipoHora(null); setQuantidadeHoras(''); }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Selecione o contrato</option>
                    {contratosAtivos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cliente_nome}{c.numero ? ` — ${c.numero}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>

                {contratoSelecionado && (
                  <>
                    <div className="flex gap-2">
                      {(contratoSelecionado.horas_presenciais_valor ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setTipoHora('presencial')}
                          className={[
                            'rounded-full border px-3 py-1 text-xs font-semibold transition',
                            tipoHora === 'presencial'
                              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:text-slate-400',
                          ].join(' ')}
                        >
                          Presencial
                        </button>
                      )}
                      {(contratoSelecionado.horas_remotas_valor ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setTipoHora('remoto')}
                          className={[
                            'rounded-full border px-3 py-1 text-xs font-semibold transition',
                            tipoHora === 'remoto'
                              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:text-slate-400',
                          ].join(' ')}
                        >
                          Remoto
                        </button>
                      )}
                    </div>

                    {tipoHora && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Quantidade de horas">
                          <Input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={quantidadeHoras}
                            onChange={(e) => setQuantidadeHoras(e.target.value !== '' ? Number(e.target.value) : '')}
                            placeholder="0"
                          />
                        </Field>
                        <div className="flex flex-col gap-0.5 pt-6">
                          <span className="text-xs font-medium text-slate-500">
                            {valorHora != null
                              ? valorHora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h'
                              : '—'}
                          </span>
                          {saldoAtual != null && (
                            <span className="text-xs text-slate-400">
                              Saldo: {saldoAtual}h disponíveis
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {valorCalculado != null && valorCalculado > 0 && (
                      <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-900/20">
                        <span className="text-brand-600 dark:text-brand-400">Valor calculado:</span>
                        <span className="font-bold text-brand-700 dark:text-brand-300">
                          {valorCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Replicar até (nova receita only) ─────────────────── */}
        {isNew && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <button
              type="button"
              onClick={() => setReplicar((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              <span>Replicar até...</span>
              {replicar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {replicar && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <Field label="Mês">
                    <select
                      value={replicarMes}
                      onChange={(e) => setReplicarMes(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {replicarMesOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="w-28">
                  <Field label="Ano">
                    <select
                      value={replicarAno}
                      onChange={(e) => setReplicarAno(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {replicarAnoOptions.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Salvando...' : income ? 'Salvar alterações' : 'Registrar receita'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
