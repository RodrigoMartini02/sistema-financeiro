// Cargo e setor do colaborador de conta PJ: o rótulo da linha na lista da conta
// e as opções dos selects do modal.
import type { AccountNameItem } from '../services/accountNameCatalogService';

export interface CatalogOption {
  value: number;
  label: string;
}

/** "Gerente · Financeiro", pulando o que faltar; vazio quando não há nenhum. */
export function collaboratorRoleLabel(member: { cargo_nome?: string | null; setor_nome?: string | null }): string {
  return [member.cargo_nome, member.setor_nome]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * Opções do select: os itens ativos e, se estiver desativado, o que o
 * colaborador já tem — ele não some de quem o usa.
 */
export function catalogOptions(items: readonly AccountNameItem[], currentId?: number | null): CatalogOption[] {
  return items
    .filter((item) => item.ativo || item.id === currentId)
    .map((item) => ({ value: item.id, label: item.ativo ? item.nome : `${item.nome} (desativado)` }));
}

export interface CollaboratorWorkFields {
  setor_id?: number | null;
  cargo_id?: number | null;
  data_admissao?: string | null;
}

/**
 * Setor, cargo e admissão do formulário do colaborador. Campo ausente (lista
 * que não carregou, ou "Meus dados", que só mostra) não muda nada; vazio limpa.
 */
export function readCollaboratorWorkFields(form: FormData): CollaboratorWorkFields {
  const fields: CollaboratorWorkFields = {};
  const readId = (name: 'setor_id' | 'cargo_id') => {
    if (!form.has(name)) return;
    const value = String(form.get(name) ?? '');
    fields[name] = value ? Number(value) : null;
  };
  readId('setor_id');
  readId('cargo_id');
  if (form.has('data_admissao')) {
    fields.data_admissao = String(form.get('data_admissao') ?? '') || null;
  }
  return fields;
}
