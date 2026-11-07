// Setores e cargos com que toda conta PJ começa (telas Setores e Cargos em
// Configurações → Pessoas). São itens normais: podem ser renomeados e
// desativados. Cargos são de nível, sem área no nome — combinados com o setor
// dão o cargo completo ("Gerente · Financeiro").
//
// A migration 0063 tem uma cópia fixa destas listas para as contas que já
// existiam: mudar aqui só vale para contas novas.

export const DEFAULT_SECTORS: readonly string[] = [
  'Administrativo',
  'Financeiro',
  'Comercial',
  'Marketing',
  'Recursos Humanos',
  'Operacional',
  'Atendimento',
  'TI',
];

export const DEFAULT_JOB_TITLES: readonly string[] = [
  'Diretor',
  'Gerente',
  'Coordenador',
  'Supervisor',
  'Analista',
  'Assistente',
  'Auxiliar',
  'Estagiário',
  'Vendedor',
  'Atendente',
];
