import { useEffect, useState } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, MoneyField } from '../../ui/dialogFormTokens';
import type { Reserva, ReservaFormValues, MovimentacaoFormValues } from '../../types/reservas';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { getLocalTodayIso } from '../../utils/date';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '../finance/formatters';

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
  const tabsGuide = useFirstAccessGuide('reservas:aba-movimentar-v1', {
    enabled: open && !!reserva,
    layer: GUIDE_LAYER_MODAL,
  });
  const contribuicaoGuide = useFirstAccessGuide('reservas:contribuicao-sugerida-v1', {
    enabled: open && tab === 'config',
    layer: GUIDE_LAYER_MODAL,
  });

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
  const today = getLocalTodayIso();

  const movForm = useForm<MovimentacaoFormValues>({
    resolver: zodResolver(movSchema) as Resolver<MovimentacaoFormValues>,
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
    <Dialog open={open} title={reserva ? 'Editar reserva' : 'Nova reserva'} onClose={onClose} size="lg" scrollBody={false}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* Seletor de abas — só aparece ao editar */}
        {reserva && (
          <div style={{ position: 'relative', margin: '0 26px 14px', flex: 'none' }}>
            <div style={{ display: 'flex', gap: 4, borderRadius: 12, background: '#f2f5f7', padding: 4 }}>
              {(['config', 'movimentar'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, borderRadius: 9, padding: '7px 0', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all .13s ease',
                    background: tab === t ? '#fff' : 'transparent',
                    color: tab === t ? C.text : C.textMuted,
                    boxShadow: tab === t ? '0 1px 4px -1px rgba(13,47,63,0.2)' : 'none',
                  }}
                >
                  {t === 'config' ? 'Configurações' : 'Movimentar'}
                </button>
              ))}
            </div>
            {tabsGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(24rem,calc(100vw-2rem))]"
                icon={TrendingUp}
                description={firstAccessGuideMessages.reservasAbaMovimentar}
                onDismiss={tabsGuide.dismiss}
                onSilenceAll={tabsGuide.silenceAll}
              />
            )}
          </div>
        )}

        {/* ── Aba: Configurações ── */}
        {tab === 'config' && (
          <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={configForm.handleSubmit(onSave)}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

              <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 18, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>ÍCONE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => configForm.setValue('icone', e)}
                        style={{
                          height: 34, width: 34, borderRadius: 9, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: icone === e ? `2px solid ${C.primary}` : '2px solid transparent',
                          background: icone === e ? C.primarySoft : 'transparent', cursor: 'pointer', transition: 'all .13s ease',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}><span>NOME DA RESERVA</span><span style={{ color: C.primary }}>*</span></label>
                  <input
                    {...configForm.register('observacoes')}
                    placeholder="Ex: Fundo de emergência"
                    autoFocus
                    style={fieldInputStyle}
                  />
                  {configForm.formState.errors.observacoes?.message && (
                    <span style={{ fontSize: 12, color: C.danger }}>{configForm.formState.errors.observacoes.message}</span>
                  )}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={labelStyle}>COR</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {CORES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => configForm.setValue('cor', c.value)}
                        title={c.label}
                        style={{
                          height: 28, width: 28, borderRadius: '50%', border: cor === c.value ? `2px solid ${C.primary}` : '2px solid transparent',
                          boxShadow: cor === c.value ? `0 0 0 2px #fff, 0 0 0 4px ${C.primary}` : 'none',
                          background: c.value, cursor: 'pointer', transition: 'all .13s ease',
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, border: `1px solid ${cor}40`, background: `${cor}10`, padding: '10px 14px' }}>
                    <span style={{ fontSize: 20 }}>{icone}</span>
                    <div style={{ height: 12, width: 12, borderRadius: '50%', flexShrink: 0, background: cor }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                      {configForm.watch('observacoes') || 'Prévia da reserva'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={labelStyle}>META (OPCIONAL)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <Controller
                        control={configForm.control}
                        name="objetivo_valor"
                        render={({ field }) => <MoneyField value={field.value ?? undefined} onChange={field.onChange} />}
                      />
                      <span style={{ fontSize: 12, color: C.textFaint }}>Defina uma meta de economia</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <input {...configForm.register('data_objetivo')} type="date" style={fieldInputStyle} />
                      <span style={{ fontSize: 12, color: C.textFaint }}>Data para atingir a meta</span>
                    </div>
                  </div>

                  {contribuicao !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1px solid ${C.warnBorder}`, background: C.warnBg, padding: '10px 14px', fontSize: 13, color: C.warn }}>
                      <span>⏱</span>
                      <span>
                        Você precisa guardar cerca de{' '}
                        <strong>
                          {formatCurrency(contribuicao)}/mês
                        </strong>{' '}
                        para atingir a meta.
                      </span>
                    </div>
                  )}
                </div>
                {contribuicaoGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={TrendingUp}
                    description={firstAccessGuideMessages.reservasContribuicaoSugerida}
                    onDismiss={contribuicaoGuide.dismiss}
                    onSilenceAll={contribuicaoGuide.silenceAll}
                  />
                )}
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
        )}

        {/* ── Aba: Movimentar (só ao editar) ── */}
        {tab === 'movimentar' && reserva && (
          <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={movForm.handleSubmit(handleMovimentar)}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>TIPO DE MOVIMENTAÇÃO</label>
                  <Controller
                    control={movForm.control}
                    name="tipo"
                    render={({ field }) => (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {TIPOS.map((opt) => {
                          const checked = field.value === opt.value;
                          return (
                            <div
                              key={opt.value}
                              onClick={() => field.onChange(opt.value)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer',
                                borderRadius: 10, border: `1.5px solid ${checked ? C.primary : C.borderInput}`,
                                background: checked ? C.primarySoft : '#fff', padding: '10px 12px', transition: 'all .13s ease',
                              }}
                            >
                              <div>
                                <p style={{ fontSize: 13.5, fontWeight: 600, color: checked ? C.primaryDark : C.text, margin: 0 }}>{opt.label}</p>
                                <p style={{ fontSize: 12, color: checked ? C.primaryDark : C.textMuted, margin: 0 }}>{opt.description}</p>
                              </div>
                              <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${checked ? C.primary : C.chipOffBorder}`, background: checked ? C.primary : 'transparent', flexShrink: 0 }} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>
              </div>

              <div style={{ ...cardStyle, background: movTipo === 'deposito' ? '#f0fdf6' : '#fef3f2', borderColor: movTipo === 'deposito' ? '#bbf0cf' : C.dangerBorder }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <label style={labelStyle}><span>VALOR (R$)</span><span style={{ color: C.primary }}>*</span></label>
                    <Controller
                      control={movForm.control}
                      name="valor"
                      render={({ field }) => <MoneyField value={field.value || undefined} onChange={field.onChange} autoFocus />}
                    />
                    {movForm.formState.errors.valor?.message && (
                      <span style={{ fontSize: 12, color: C.danger }}>{movForm.formState.errors.valor.message}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <label style={labelStyle}>DATA</label>
                    <input {...movForm.register('data')} type="date" style={fieldInputStyle} />
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                    <label style={{ ...labelStyle, height: 'auto' }}>DESCRIÇÃO</label>
                    <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                  </div>
                  <input {...movForm.register('descricao')} placeholder="Ex: Aporte mensal" style={fieldInputStyle} />
                </div>
              </div>
            </div>

            <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isMovimentando}
                style={{
                  padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                  border: 'none', transition: 'all .15s ease', cursor: isMovimentando ? 'not-allowed' : 'pointer',
                  ...(isMovimentando
                    ? { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }
                    : movTipo === 'retirada'
                      ? { background: C.danger, color: '#fff', boxShadow: '0 6px 16px -6px rgba(180,35,24,0.5)' }
                      : { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }),
                }}
              >
                {isMovimentando ? 'Confirmando...' : movTipo === 'deposito' ? 'Depositar' : 'Retirar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
