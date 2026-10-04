import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileSignature, Pencil, Plus, Receipt } from 'lucide-react';
import { fetchClient, fetchClientIncomes, type Client } from '../../services/clientsService';
import { fetchClientContracts, type ContractListItem } from '../../services/contractsService';
import { invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { CFG, CFG_MONO_CLASS, cfgPrimaryButtonStyle } from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { formatCep, formatDocument, formatPhone } from '../../utils/brazilDocuments';
import {
  CLIENT_TYPE_LABELS, CONTRACT_STATUS_LABELS, SPHERE_LABELS, expiryLabel, incomeStatusView, termLabel,
} from '../../utils/contractDisplay';
import { getLocalTodayIso, isoToBrDate } from '../../utils/date';
import { formatCurrency } from '../finance/formatters';
import { ClientFormDialog } from './ClientFormDialog';
import { ContractDetail } from './ContractDetail';
import { ContractWizard } from './ContractWizard';
import {
  detailLabelStyle, detailRowStyle, errorBoxStyle, linkButtonStyle, mutedTextStyle, panelStyle, rowSubtitleStyle,
  rowTitleStyle, secondaryButtonStyle, tabStyle, toneBadgeStyle, wrapRowStyle,
} from './clientStyles';

type ClientTab = 'contracts' | 'incomes' | 'data';

function Loading({ text }: { text: string }) {
  return <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>{text}</p>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={errorBoxStyle}>
      {message}{' '}
      <button type="button" onClick={onRetry} style={{ ...linkButtonStyle, color: 'inherit', textDecoration: 'underline' }}>Tentar de novo</button>
    </div>
  );
}

function ContractRow({ contract, todayIso, onOpen }: { contract: ContractListItem; todayIso: string; onOpen: () => void }) {
  const active = contract.status === 'ativo';
  const expiry = active && contract.expiringSoon ? expiryLabel(contract.endDate, todayIso) : null;
  const title = contract.number ? `Contrato ${contract.number}` : 'Contrato sem número';
  return (
    <button type="button" onClick={onOpen} style={wrapRowStyle}>
      <span style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={rowTitleStyle}>
          {title}{contract.amendmentNumber > 0 ? ` · aditivo nº ${contract.amendmentNumber}` : ''}
        </p>
        <p style={rowSubtitleStyle}>
          {termLabel(contract.startDate, contract.endDate)}{contract.description ? ` · ${contract.description}` : ''}
        </p>
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {contract.monthlyNet !== null && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: CFG.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(contract.monthlyNet)}/mês
          </span>
        )}
        {contract.hasHours && <span style={toneBadgeStyle('neutral')}>Banco de horas</span>}
        <span style={toneBadgeStyle(active ? 'success' : 'neutral')}>{CONTRACT_STATUS_LABELS[contract.status]}</span>
        {expiry && <span style={toneBadgeStyle('warn')}>{expiry}</span>}
        {contract.overdueCount > 0 && <span style={toneBadgeStyle('danger')}>Receita atrasada</span>}
        {contract.readjustmentAvailable && <span style={toneBadgeStyle('info')}>Reajuste disponível</span>}
      </span>
    </button>
  );
}

function ContractsTab({ client, accountId, todayIso, onOpen }: {
  client: Client;
  accountId: number;
  todayIso: string;
  onOpen: (contractId: number) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const contractsQuery = useQuery({
    queryKey: queryKeys.contracts(accountId, client.id),
    queryFn: () => fetchClientContracts(accountId, client.id),
  });
  const contracts = contractsQuery.data ?? [];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ ...mutedTextStyle, flex: 1 }}>
          {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
        </p>
        {client.active ? (
          <button type="button" style={cfgPrimaryButtonStyle} onClick={() => setCreating(true)}>
            <Plus size={12} strokeWidth={2.6} /> Novo contrato
          </button>
        ) : (
          <span style={mutedTextStyle}>Reative o cliente para criar contratos.</span>
        )}
      </div>
      {contractsQuery.isLoading && <Loading text="Carregando os contratos..." />}
      {contractsQuery.isError && <LoadError message={contractsQuery.error.message} onRetry={() => void contractsQuery.refetch()} />}
      {contracts.map((contract) => (
        <ContractRow key={contract.id} contract={contract} todayIso={todayIso} onOpen={() => onOpen(contract.id)} />
      ))}
      {contractsQuery.isSuccess && contracts.length === 0 && (
        <EmptyState icon={FileSignature} title="Nenhum contrato" description="Cadastre o contrato para gerar as receitas previstas." />
      )}
      {creating && (
        <ContractWizard
          mode="create"
          accountId={accountId}
          client={client}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            invalidateIncomeQueries(qc);
            onOpen(saved.id);
          }}
        />
      )}
    </div>
  );
}

function IncomesTab({ client, todayIso }: { client: Client; todayIso: string }) {
  const incomesQuery = useQuery({ queryKey: queryKeys.clientIncomes(client.id), queryFn: () => fetchClientIncomes(client.id) });
  const incomes = incomesQuery.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {incomesQuery.isLoading && <Loading text="Carregando as receitas..." />}
      {incomesQuery.isError && <LoadError message={incomesQuery.error.message} onRetry={() => void incomesQuery.refetch()} />}
      {incomesQuery.isSuccess && incomes.length === 0 && (
        <EmptyState icon={Receipt} title="Nenhuma receita deste cliente" />
      )}
      {incomes.length > 0 && (
        <section style={{ ...panelStyle, gap: 0 }}>
          {incomes.map((income, index) => {
            const status = incomeStatusView(income.status, income.receiptDate, todayIso);
            return (
              <div
                key={income.id}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '7px 0',
                  borderTop: index === 0 ? undefined : `1px solid ${CFG.borderSoft}`,
                }}
              >
                <span style={{ flex: 'none', width: 78, fontSize: 12, color: CFG.textSoft, fontVariantNumeric: 'tabular-nums' }}>
                  {isoToBrDate(income.receiptDate)}
                </span>
                <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 12.5, color: CFG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {income.description}
                  {income.classificationName && <span style={{ color: CFG.muted }}> · {income.classificationName}</span>}
                </span>
                <span style={{ flex: 'none', fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(income.amount)}</span>
                <span style={toneBadgeStyle(status.tone)}>{status.label}</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children || '—'}</span>
    </div>
  );
}

function DataTab({ client }: { client: Client }) {
  const address = [
    [client.street, client.number].filter(Boolean).join(', '),
    client.complement,
    client.district,
    [client.city, client.state].filter(Boolean).join(' - '),
    client.zipCode ? formatCep(client.zipCode) : null,
  ].filter(Boolean).join(' · ');
  return (
    <section style={panelStyle}>
      <DataRow label="Tipo">{CLIENT_TYPE_LABELS[client.type]}</DataRow>
      <DataRow label={client.type === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}>
        <span className={CFG_MONO_CLASS}>{formatDocument(client.document)}</span>
      </DataRow>
      {client.type === 'orgao_publico' && (
        <>
          <DataRow label="Esfera">{client.sphere ? SPHERE_LABELS[client.sphere] : null}</DataRow>
          <DataRow label="Órgão ou secretaria">{client.agency}</DataRow>
        </>
      )}
      <DataRow label="Contato">{client.contactName}</DataRow>
      <DataRow label="E-mail">{client.contactEmail}</DataRow>
      <DataRow label="Telefone">{client.contactPhone ? formatPhone(client.contactPhone) : null}</DataRow>
      <DataRow label="Endereço">{address}</DataRow>
      <DataRow label="Situação">{client.active ? 'Ativo' : 'Desativado'}</DataRow>
    </section>
  );
}

interface ClientPageProps {
  clientId: number;
  accountId: number;
  canSeeContracts: boolean;
  canSeeIncomes: boolean;
  onBack: () => void;
}

/** Página do cliente: cabeçalho com tipo, documento e contato, e as abas Contratos, Receitas e Dados. */
export function ClientPage({ clientId, accountId, canSeeContracts, canSeeIncomes, onBack }: ClientPageProps) {
  const qc = useQueryClient();
  const todayIso = getLocalTodayIso();
  const tabs: ClientTab[] = [...(canSeeContracts ? ['contracts' as const] : []), ...(canSeeIncomes ? ['incomes' as const] : []), 'data'];
  const [tab, setTab] = useState<ClientTab>(tabs[0]!);
  const [editing, setEditing] = useState(false);
  const [openContractId, setOpenContractId] = useState<number | null>(null);
  const clientQuery = useQuery({ queryKey: queryKeys.client(clientId), queryFn: () => fetchClient(clientId) });

  if (clientQuery.isLoading) return <Loading text="Carregando o cliente..." />;
  if (clientQuery.isError || !clientQuery.data) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div><button type="button" style={linkButtonStyle} onClick={onBack}><ArrowLeft size={13} /> Clientes</button></div>
        <LoadError message={clientQuery.error?.message ?? 'Não foi possível carregar o cliente.'} onRetry={() => void clientQuery.refetch()} />
      </div>
    );
  }
  const client = clientQuery.data;

  if (openContractId !== null) {
    return (
      <ContractDetail
        key={openContractId}
        contractId={openContractId}
        accountId={accountId}
        backLabel={client.name}
        onBack={() => setOpenContractId(null)}
        onOpenContract={setOpenContractId}
      />
    );
  }

  const TAB_LABELS: Record<ClientTab, string> = { contracts: 'Contratos', incomes: 'Receitas', data: 'Dados' };
  const subtitle = [
    CLIENT_TYPE_LABELS[client.type],
    client.type === 'orgao_publico' ? [client.sphere ? SPHERE_LABELS[client.sphere] : null, client.agency].filter(Boolean).join(' · ') : null,
  ].filter(Boolean).join(' · ');
  const contact = [client.contactName, client.contactPhone ? formatPhone(client.contactPhone) : null, client.contactEmail].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div><button type="button" style={linkButtonStyle} onClick={onBack}><ArrowLeft size={13} /> Clientes</button></div>

      <section style={panelStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, flex: '1 1 200px', minWidth: 0, fontSize: 16, fontWeight: 700, color: CFG.text, overflowWrap: 'anywhere' }}>
            {client.name}
          </h2>
          {!client.active && <span style={toneBadgeStyle('neutral')}>Desativado</span>}
          <button type="button" style={secondaryButtonStyle} onClick={() => setEditing(true)}><Pencil size={12} /> Editar</button>
        </div>
        <p style={mutedTextStyle}>
          {subtitle} · <span className={CFG_MONO_CLASS}>{formatDocument(client.document)}</span>
        </p>
        {contact && <p style={mutedTextStyle}>{contact}</p>}
      </section>

      <div role="tablist" aria-label="Dados do cliente" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} style={tabStyle(tab === item)}>
            {TAB_LABELS[item]}
          </button>
        ))}
      </div>

      {tab === 'contracts' && <ContractsTab client={client} accountId={accountId} todayIso={todayIso} onOpen={setOpenContractId} />}
      {tab === 'incomes' && <IncomesTab client={client} todayIso={todayIso} />}
      {tab === 'data' && <DataTab client={client} />}

      {editing && (
        <ClientFormDialog
          open
          accountId={accountId}
          client={client}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            invalidateIncomeQueries(qc);
            if (saved === null) onBack();
          }}
        />
      )}
    </div>
  );
}
