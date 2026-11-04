import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { BillingPanel } from '../components/BillingPanel';
import { CollectionPanel } from '../components/CollectionPanel';
import { TabPanel, Tabs, type TabItem } from '../components/Tabs';
import { UsersPanel } from '../components/UsersPanel';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { canOpenSettings } from '../utils/navigation';

// Configurações do módulo: Usuários e Assinatura só para o titular; Coleta
// para titular ou admin, conforme as permissões de GET /access.

type SettingsTab = 'usuarios' | 'assinatura' | 'coleta';

export function SettingsScreen() {
  const access = useTenderAccess(true);
  const idPrefix = useId();
  const permissions = access.data?.permissions;
  const accountId = access.data?.account.id;
  const tabs: Array<TabItem<SettingsTab>> = [
    ...(permissions?.manageTeam ? [{ id: 'usuarios' as const, label: 'Usuários' }] : []),
    ...(permissions?.manageBilling ? [{ id: 'assinatura' as const, label: 'Assinatura' }] : []),
    ...(permissions?.viewCollectionRuns ? [{ id: 'coleta' as const, label: 'Coleta' }] : []),
  ];
  const [chosen, setChosen] = useState<SettingsTab | null>(null);
  const active = tabs.find((tab) => tab.id === chosen)?.id ?? tabs[0]?.id;

  if (!permissions || accountId === undefined || !canOpenSettings(permissions) || !active) {
    return <EmptyState icon={Lock} title="Só o titular da conta acessa as configurações do módulo." />;
  }

  return (
    <section>
      <Tabs tabs={tabs} active={active} onChange={setChosen} label="Configurações do módulo" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={active}>
        {active === 'usuarios' && <UsersPanel accountId={accountId} />}
        {active === 'assinatura' && <BillingPanel accountId={accountId} />}
        {active === 'coleta' && <CollectionPanel />}
      </TabPanel>
    </section>
  );
}
