import { useEffect } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { TrendingUp } from 'lucide-react';

import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, dialogFooterStyle,
  saveButtonStyle, saveButtonDisabledStyle, MoneyField,
} from '../../ui/dialogFormTokens';
import type { Reserva, ReservaFormValues } from '../../types/reservas';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { calcContribuicaoMensal } from '../../utils/reservaContribuicao';
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

interface Props {
  open: boolean;
  reserva?: Reserva;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (v: ReservaFormValues) => void;
}

/**
 * Cadastro da reserva: nome, ícone, cor e meta.
 *
 * Depositar e retirar ficam no ReservasPanel — este modal tinha uma aba
 * "Movimentar" que era a terceira implementação do mesmo formulário.
 */
export function ReservaDialog({ open, reserva, isSaving, error, onClose, onSave }: Props) {
  const contribuicaoGuide = useFirstAccessGuide('reservas:contribuicao-sugerida-v1', {
    enabled: open,
    layer: GUIDE_LAYER_MODAL,
  });

  const form = useForm<ReservaFormValues>({
    resolver: zodResolver(configSchema) as Resolver<ReservaFormValues>,
    defaultValues: {
      observacoes: '',
      icone: '💰',
      cor: '#6366f1',
      objetivo_valor: undefined,
      data_objetivo: undefined,
    },
  });

  const icone = form.watch('icone');
  const cor = form.watch('cor');
  const objetivoValor = form.watch('objetivo_valor');
  const dataObjetivo = form.watch('data_objetivo');

  const contribuicao = objetivoValor && dataObjetivo
    ? calcContribuicaoMensal(Number(reserva?.valor ?? 0), Number(objetivoValor), dataObjetivo)
    : null;

  useEffect(() => {
    if (!open) return;
    form.reset({
      observacoes: reserva?.observacoes ?? '',
      icone: reserva?.icone ?? '💰',
      cor: reserva?.cor ?? '#6366f1',
      objetivo_valor: reserva?.objetivo_valor ?? undefined,
      data_objetivo: reserva?.data_objetivo?.slice(0, 10) ?? undefined,
    });
  }, [open, reserva]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} title={reserva ? 'Editar reserva' : 'Nova reserva'} onClose={onClose} size="sm" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={form.handleSubmit(onSave)}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div>
            <label style={labelStyle}><span>Nome da reserva</span><span style={{ color: C.danger }}>*</span></label>
            <input
              {...form.register('observacoes')}
              placeholder="Ex: Fundo de emergência"
              autoFocus
              style={fieldInputStyle}
            />
            {form.formState.errors.observacoes?.message && (
              <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: C.danger }}>
                {form.formState.errors.observacoes.message}
              </span>
            )}
          </div>

          <div>
            <label style={labelStyle}>Ícone</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => form.setValue('icone', emoji)}
                  style={{
                    height: 28, width: 28, borderRadius: 8, fontSize: 14, cursor: 'pointer',
                    border: icone === emoji ? `2px solid ${C.primary}` : '1px solid #d8e0e8',
                    background: icone === emoji ? C.primarySoft : '#fff',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Cor</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CORES.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  onClick={() => form.setValue('cor', opcao.value)}
                  title={opcao.label}
                  style={{
                    height: 22, width: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: opcao.value,
                    boxShadow: cor === opcao.value ? `0 0 0 2px #fff, 0 0 0 4px ${C.primary}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: '#eef2f6' }} />

          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Meta</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Controller
                control={form.control}
                name="objetivo_valor"
                render={({ field }) => <MoneyField value={field.value ?? undefined} onChange={field.onChange} />}
              />
              <input {...form.register('data_objetivo')} type="date" style={fieldInputStyle} />
            </div>

            {contribuicao !== null && (
              <p style={{
                margin: '8px 0 0', borderRadius: 10, border: `1px solid ${C.warnBorder}`,
                background: C.warnBg, padding: '7px 9px', fontSize: 11.5, color: C.warn,
              }}>
                Guarde cerca de <strong>{formatCurrency(contribuicao)}/mês</strong> para atingir a meta no prazo.
              </p>
            )}

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
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
          <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
