import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabPanel, Tabs } from '../components/Tabs';
import { VaultDocumentsTab } from '../components/VaultDocumentsTab';
import { VaultPeopleTab } from '../components/VaultPeopleTab';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { vaultTabOf, vaultTabParams, vaultTabsFor, type VaultTab } from '../utils/vault';

// Documentação (plano .plans/licitacoes-5-cofre-de-documentos.md): o cofre de documentos da empresa e, em outra aba, as pessoas
// ligadas a ela com os documentos pessoais. A aba de Pessoas é só do titular (dado pessoal de terceiros); o colaborador vê só o
// Cofre, sem barra de abas. Os modelos de documentos entram mais adiante como outra aba. A aba fica na URL (`?aba=pessoas`),
// que é o destino do aviso de vencimento de documento de pessoa.

export function DocumentationScreen() {
  const access = useTenderAccess(true);
  const canSeePeople = access.data?.permissions.manageVaultPeople === true;
  const [params, setParams] = useSearchParams();
  const idPrefix = useId();
  const tabs = vaultTabsFor(canSeePeople);
  const tab = vaultTabOf(params, canSeePeople);

  if (tabs.length === 1) {
    return <VaultDocumentsTab />;
  }
  return (
    <section>
      <Tabs tabs={tabs} active={tab} onChange={(next: VaultTab) => setParams(vaultTabParams(next))} label="Documentação" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={tab}>
        {tab === 'pessoas' ? <VaultPeopleTab /> : <VaultDocumentsTab />}
      </TabPanel>
    </section>
  );
}
