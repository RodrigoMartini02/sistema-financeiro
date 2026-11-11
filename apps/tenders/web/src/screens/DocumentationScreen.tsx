import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SanctionsTab } from '../components/SanctionsTab';
import { TabPanel, Tabs } from '../components/Tabs';
import { VaultDocumentsTab } from '../components/VaultDocumentsTab';
import { VaultPeopleTab } from '../components/VaultPeopleTab';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { vaultTabOf, vaultTabParams, vaultTabsFor, type VaultTab } from '../utils/vault';

// Documentação (planos .plans/licitacoes-5-cofre-de-documentos.md e .plans/licitacoes-6-sancoes.md): o cofre de documentos da
// empresa, as pessoas ligadas a ela com os documentos pessoais e a consulta de sanções. A aba de Pessoas é só do titular (dado
// pessoal de terceiros); o Cofre e as Sanções são de todos com acesso ao módulo (nas Sanções, o colaborador só vê a empresa). Os
// modelos de documentos entram mais adiante como outra aba. A aba fica na URL (`?aba=pessoas` ou `?aba=sancoes`), que é o destino
// do aviso de vencimento de documento de pessoa.

export function DocumentationScreen() {
  const access = useTenderAccess(true);
  const canSeePeople = access.data?.permissions.manageVaultPeople === true;
  const [params, setParams] = useSearchParams();
  const idPrefix = useId();
  const tabs = vaultTabsFor(canSeePeople);
  const tab = vaultTabOf(params, canSeePeople);

  return (
    <section>
      <Tabs tabs={tabs} active={tab} onChange={(next: VaultTab) => setParams(vaultTabParams(next))} label="Documentação" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={tab}>
        {tab === 'pessoas' ? <VaultPeopleTab /> : tab === 'sancoes' ? <SanctionsTab /> : <VaultDocumentsTab />}
      </TabPanel>
    </section>
  );
}
