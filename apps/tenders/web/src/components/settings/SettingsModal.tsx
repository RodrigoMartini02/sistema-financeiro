import { Activity, Crown, Users, type LucideIcon } from 'lucide-react';
import { Drawer } from '@ui/components/drawer';
import { CFG, CONFIG_SCOPE_CLASS, cfgNavGroupLabelStyle } from '@ui/components/configTokens';
import {
  groupSettingsItems,
  type SettingsItem,
  type SettingsItemId,
} from '../../utils/settings';
import { BillingPanel } from '../BillingPanel';
import { CollectionPanel } from '../CollectionPanel';
import { UsersSection } from './UsersSection';

// Configurações do módulo como modal (item 1A), no método do modal de Configurações de Finanças: Drawer centrado,
// menu lateral por grupo à esquerda e a seção à direita. Casco próprio de Licitações: não usa o de Finanças nem os
// serviços dele.

const ICONS: Record<SettingsItemId, LucideIcon> = {
  usuarios: Users,
  assinatura: Crown,
  coleta: Activity,
};

interface SettingsModalProps {
  open: boolean;
  /** As seções que a pessoa pode ver (nunca vazio com o modal aberto). */
  items: readonly SettingsItem[];
  activeItem: SettingsItemId | null;
  /** Conta em uso: a assinatura e os usuários são dela. */
  accountId: number;
  onSelect: (item: SettingsItemId) => void;
  onClose: () => void;
}

export function SettingsModal({ open, items, activeItem, accountId, onSelect, onClose }: SettingsModalProps) {
  const current = items.find((item) => item.id === activeItem) ?? items[0];
  const groups = groupSettingsItems(items);

  return (
    <Drawer open={open && current !== undefined} title="Configurações" subtitle={current?.label} onClose={onClose} variant="centered" scrollBody={false}>
      <div className={[CONFIG_SCOPE_CLASS, 'flex h-full min-h-[420px] flex-col gap-4 sm:flex-row sm:gap-6'].join(' ')}>
        <nav
          aria-label="Seções das configurações"
          className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto pb-2 sm:w-[228px] sm:flex-col sm:gap-0 sm:overflow-y-auto sm:overflow-x-visible sm:border-r sm:pb-0 sm:pr-4"
          style={{ borderColor: CFG.borderSoft }}
        >
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex shrink-0 gap-1 sm:block sm:w-full">
              <span style={cfgNavGroupLabelStyle} className="hidden sm:block">{group}</span>
              {groupItems.map((item) => {
                const Icon = ICONS[item.id];
                const isActive = item.id === current?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] text-left sm:w-full"
                    style={{
                      height: 30,
                      padding: '0 8px',
                      fontSize: 12.5,
                      lineHeight: 1.15,
                      fontWeight: isActive ? 600 : 500,
                      background: isActive ? CFG.primarySoft : 'transparent',
                      color: isActive ? CFG.primaryDark : CFG.chipText,
                      transition: 'background .13s ease, color .13s ease',
                    }}
                    onMouseEnter={(event) => {
                      if (!isActive) event.currentTarget.style.background = CFG.chipBg;
                    }}
                    onMouseLeave={(event) => {
                      if (!isActive) event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon size={13} style={{ flex: 'none' }} aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {current?.id === 'usuarios' && <UsersSection accountId={accountId} />}
          {current?.id === 'assinatura' && <BillingPanel accountId={accountId} />}
          {current?.id === 'coleta' && <CollectionPanel />}
        </div>
      </div>
    </Drawer>
  );
}
