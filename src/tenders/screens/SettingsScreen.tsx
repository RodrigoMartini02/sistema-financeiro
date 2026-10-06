import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { CollectionPanel } from '../components/CollectionPanel';
import { TabPanel, Tabs, type TabItem } from '../components/Tabs';
import { TeamList } from '../components/TeamList';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { canOpenSettings } from '../utils/navigation';

// Configurações do módulo (escopo, seção 9.4): Equipe só para o titular e
// Coleta para titular ou admin, conforme as permissões de GET /access.

type SettingsTab = 'equipe' | 'coleta';

export function SettingsScreen() {
  const access = useTenderAccess(true);
  const idPrefix = useId();
  const permissions = access.data?.permissions;
  const tabs: Array<TabItem<SettingsTab>> = [
    ...(permissions?.manageTeam ? [{ id: 'equipe' as const, label: 'Equipe' }] : []),
    ...(permissions?.viewCollectionRuns ? [{ id: 'coleta' as const, label: 'Coleta' }] : []),
  ];
  const [chosen, setChosen] = useState<SettingsTab | null>(null);
  const active = tabs.find((tab) => tab.id === chosen)?.id ?? tabs[0]?.id;

  if (!permissions || !canOpenSettings(permissions) || !active) {
    return <EmptyState icon={Lock} title="Só o titular da conta acessa as configurações do módulo." />;
  }

  return (
    <section>
      <Tabs tabs={tabs} active={active} onChange={setChosen} label="Configurações do módulo" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={active}>
        {active === 'equipe' ? <TeamList /> : <CollectionPanel />}
      </TabPanel>
    </section>
  );
}
