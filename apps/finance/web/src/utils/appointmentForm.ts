// Regra do formulário de compromisso da Agenda. A duração é opcional: campo
// vazio é "sem duração" (o backend grava nulo), não zero; preenchida, precisa
// ser de pelo menos 1 minuto.
import { z } from 'zod';

export const DURATION_MESSAGE = 'A duração precisa ser de 1 minuto ou mais';

/** Campo numérico opcional vazio ('' ou nulo) fica sem valor antes de virar número. */
function blankToUndefined(value: unknown): unknown {
  return value === '' || value === null ? undefined : value;
}

export const appointmentFormSchema = z.object({
  titulo: z.string().min(1, 'Informe o título'),
  // A data incompleta chega vazia do campo de data.
  data: z.string().min(10, 'Informe a data'),
  hora: z.string().optional(),
  duracao_minutos: z.preprocess(
    blankToUndefined,
    z.coerce.number({ error: DURATION_MESSAGE }).int(DURATION_MESSAGE).min(1, DURATION_MESSAGE).optional(),
  ),
  local: z.string().optional(),
  descricao: z.string().optional(),
});

export type AppointmentFormData = z.infer<typeof appointmentFormSchema>;
