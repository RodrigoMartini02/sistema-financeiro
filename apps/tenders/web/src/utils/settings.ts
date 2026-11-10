import type { TendersPermissions } from './navigation';

// Configurações do módulo como modal (itens 1A e 1C): quais seções cada pessoa vê, e como o modal abre e fecha pela URL.
// O modal vale por um parâmetro da URL (`?config=usuarios`), como o painel do edital em Editais: o botão voltar do
// navegador fecha o modal, e o endereço pode ser compartilhado. A rota antiga `/configuracoes` é a que o Mercado Pago
// usa na volta da cobrança: ela redireciona para a página inicial com o modal aberto na Assinatura.

export type SettingsItemId = 'perfil' | 'usuarios' | 'assinatura' | 'coleta';
export type SettingsGroup = 'Empresa' | 'Conta' | 'Avançado';

export interface SettingsItem {
  id: SettingsItemId;
  label: string;
  group: SettingsGroup;
}

/** Cada seção e a permissão de `GET /access` que a libera (a API confere de novo em cada rota). */
const SETTINGS_ITEMS: ReadonlyArray<SettingsItem & { permission: keyof TendersPermissions }> = [
  { id: 'perfil', label: 'Perfil', group: 'Empresa', permission: 'manageCompany' },
  { id: 'usuarios', label: 'Usuários', group: 'Empresa', permission: 'manageTeam' },
  { id: 'assinatura', label: 'Assinatura', group: 'Conta', permission: 'manageBilling' },
  { id: 'coleta', label: 'Coleta', group: 'Avançado', permission: 'viewCollectionRuns' },
];

/** Ordem dos grupos no menu lateral do modal. */
const GROUP_ORDER: readonly SettingsGroup[] = ['Empresa', 'Conta', 'Avançado'];

/** Parâmetro da URL que abre o modal. */
export const SETTINGS_PARAM = 'config';

/** Rota antiga das Configurações, mantida por causa do retorno da cobrança do Mercado Pago. */
export const SETTINGS_ROUTE_PATH = '/configuracoes';

/** Seções que a pessoa pode ver, na ordem do menu. */
export function visibleSettingsItems(permissions: TendersPermissions): SettingsItem[] {
  return SETTINGS_ITEMS.filter((item) => permissions[item.permission]).map(({ id, label, group }) => ({ id, label, group }));
}

/** As seções agrupadas para o menu lateral; grupo sem seção visível não aparece. */
export function groupSettingsItems(items: readonly SettingsItem[]): Array<{ group: SettingsGroup; items: SettingsItem[] }> {
  return GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter(
    (entry) => entry.items.length > 0,
  );
}

function isSettingsItemId(value: string | null): value is SettingsItemId {
  return SETTINGS_ITEMS.some((item) => item.id === value);
}

/** A seção pedida na URL: só vale um código conhecido; sem parâmetro ou com código desconhecido, o modal fica fechado. */
export function readSettingsRequest(search: string): SettingsItemId | null {
  const value = new URLSearchParams(search).get(SETTINGS_PARAM);
  return isSettingsItemId(value) ? value : null;
}

/** A seção que abre: a pedida, se a pessoa a vê; senão a primeira que vê; sem nenhuma, o modal não abre (null). */
export function resolveSettingsItem(requested: SettingsItemId | null, visible: readonly SettingsItem[]): SettingsItemId | null {
  if (requested !== null && visible.some((item) => item.id === requested)) {
    return requested;
  }
  return visible[0]?.id ?? null;
}

/** A query string com o parâmetro do modal posto (seção) ou tirado (null), mantendo os outros parâmetros da página. */
export function withSettingsParam(search: string, item: SettingsItemId | null): string {
  const params = new URLSearchParams(search);
  if (item === null) {
    params.delete(SETTINGS_PARAM);
  } else {
    params.set(SETTINGS_PARAM, item);
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

/** Destino da rota antiga `/configuracoes`: a página inicial com o modal na Assinatura (ou na primeira seção visível). */
export function settingsRouteTarget(permissions: TendersPermissions): { pathname: string; search: string } {
  return { pathname: '/', search: withSettingsParam('', resolveSettingsItem('assinatura', visibleSettingsItems(permissions))) };
}
