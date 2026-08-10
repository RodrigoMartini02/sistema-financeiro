import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Appointment, AppointmentFormValues } from '../../types/appointments';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, smallInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { getLocalTodayIso } from '../../utils/date';

const schema = z.object({
  titulo:          z.string().min(1, 'Informe o título'),
  data:             z.string().min(10, 'Informe a data'),
  hora:             z.string().optional(),
  duracao_minutos:  z.coerce.number().int().min(1).optional(),
  local:            z.string().optional(),
  descricao:        z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const todayIso = getLocalTodayIso;

interface Props {
  open: boolean;
  appointment?: Appointment;
  presetDate?: string;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (values: AppointmentFormValues) => Promise<void>;
}

export function AppointmentDialog({ open, appointment, presetDate, isSaving, error, onClose, onSave }: Props) {
  const isEditing = !!appointment;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: '', data: presetDate ?? todayIso(), hora: undefined,
      duracao_minutos: undefined, local: undefined, descricao: undefined,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      titulo:           appointment?.titulo ?? '',
      data:             appointment?.data ?? presetDate ?? todayIso(),
      hora:             appointment?.hora ?? undefined,
      duracao_minutos:  appointment?.duracao_minutos ?? undefined,
      local:            appointment?.local ?? undefined,
      descricao:        appointment?.descricao ?? undefined,
    });
  }, [appointment, open, presetDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (data: FormData) => {
    await onSave({
      titulo: data.titulo,
      data: data.data,
      hora: data.hora || undefined,
      duracao_minutos: data.duracao_minutos || undefined,
      local: data.local || undefined,
      descricao: data.descricao || undefined,
    });
  };

  const submitForm = form.handleSubmit(handleSubmit);

  return (
    <Dialog
      open={open}
      title={isEditing ? 'Editar compromisso' : 'Novo compromisso'}
      description="Registre um evento sem valor financeiro"
      onClose={onClose}
      size="md"
    >
      <form onSubmit={submitForm}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={labelStyle}>
              <span>TÍTULO</span><span style={{ color: C.primary }}>*</span>
            </label>
            <input {...form.register('titulo')} placeholder="Ex: Reunião com cliente" autoFocus style={fieldInputStyle} />
            {form.formState.errors.titulo?.message && (
              <div style={{ fontSize: 12, color: C.danger }}>{form.formState.errors.titulo.message}</div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>
                <span>DATA</span><span style={{ color: C.primary }}>*</span>
              </label>
              <input {...form.register('data')} type="date" style={smallInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>HORÁRIO</label>
              <input {...form.register('hora')} type="time" style={{ ...smallInputStyle, width: 120 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DURAÇÃO (MIN)</label>
              <input {...form.register('duracao_minutos')} type="number" min={1} placeholder="60" style={{ ...smallInputStyle, width: 110 }} />
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={labelStyle}>LOCAL</label>
            <input {...form.register('local')} placeholder="Ex: Google Meet, Sala 2" style={fieldInputStyle} />
          </div>
        </div>

        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={labelStyle}>OBSERVAÇÕES</label>
            <textarea
              {...form.register('descricao')}
              placeholder="Detalhes adicionais (opcional)"
              rows={3}
              style={{ ...fieldInputStyle, height: 'auto', padding: '12px 14px', fontSize: 14, resize: 'vertical' }}
            />
          </div>
        </div>

        {error && (
          <div style={{ margin: '0 var(--dialog-px) 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, margin: '0 var(--dialog-px)' }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
              whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              ...(!isSaving
                ? { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }
                : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
            }}
          >
            {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar compromisso'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
