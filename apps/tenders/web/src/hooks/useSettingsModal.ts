import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TendersPermissions } from '../utils/navigation';
import {
  readSettingsRequest,
  resolveSettingsItem,
  visibleSettingsItems,
  withSettingsParam,
  type SettingsItem,
  type SettingsItemId,
} from '../utils/settings';

/** Estado da navegação que abriu o modal pelo app (como o painel do edital em Editais): o fechar volta uma entrada. */
interface SettingsNavigation {
  settingsModal?: boolean;
}

export interface SettingsModalControl {
  /** As seções que a pessoa vê; vazio: não há Configurações para ela. */
  items: SettingsItem[];
  isOpen: boolean;
  activeItem: SettingsItemId | null;
  /** Abre numa seção (ou na primeira que a pessoa vê). Empurra o histórico: o botão voltar fecha o modal. */
  open: (item?: SettingsItemId) => void;
  /** Troca de seção sem criar outra entrada no histórico. */
  select: (item: SettingsItemId) => void;
  close: () => void;
}

/**
 * Abre e fecha o modal de Configurações pelo parâmetro `?config=` da página atual. Aberto pelo app, fecha voltando
 * uma entrada; aberto por um endereço (retorno da cobrança, link), fecha tirando o parâmetro.
 */
export function useSettingsModal(permissions: TendersPermissions): SettingsModalControl {
  const location = useLocation();
  const navigate = useNavigate();
  const items = useMemo(() => visibleSettingsItems(permissions), [permissions]);
  const requested = readSettingsRequest(location.search);
  const activeItem = resolveSettingsItem(requested, items);
  const isOpen = requested !== null && activeItem !== null;
  const openedByApp = (location.state as SettingsNavigation | null)?.settingsModal === true;
  const { pathname, search, state } = location;

  const open = useCallback(
    (item?: SettingsItemId) => {
      const target = resolveSettingsItem(item ?? null, items);
      if (target === null) return;
      const next: SettingsNavigation = { settingsModal: true };
      navigate({ pathname, search: withSettingsParam(search, target) }, { state: next });
    },
    [items, navigate, pathname, search],
  );

  const select = useCallback(
    (item: SettingsItemId) => navigate({ pathname, search: withSettingsParam(search, item) }, { replace: true, state }),
    [navigate, pathname, search, state],
  );

  const close = useCallback(() => {
    if (openedByApp) {
      navigate(-1);
      return;
    }
    navigate({ pathname, search: withSettingsParam(search, null) }, { replace: true });
  }, [navigate, openedByApp, pathname, search]);

  return { items, isOpen, activeItem, open, select, close };
}
