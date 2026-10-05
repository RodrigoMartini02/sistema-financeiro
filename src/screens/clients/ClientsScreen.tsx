import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Plus } from 'lucide-react';
import { useOwnPermissions } from '../../hooks/useOwnPermissions';
import { getActiveAccountId } from '../../services/apiClient';
import {
  fetchClients, fetchClientsSummary, type ClientFilters, type ClientListItem,
} from '../../services/clientsService';
import { invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { CFG, CFG_MONO_CLASS, cfgPrimaryButtonStyle } from '../../ui/configTokens';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { EmptyState } from '../../ui/EmptyState';
import { ListToolbar } from '../../ui/ListToolbar';
import { formatDocument, onlyDigits } from '../../utils/brazilDocuments';
import {
  CLIENT_TYPES, CLIENT_TYPE_LABELS, clientsSummaryCards, type ClientType,
} from '../../utils/contractDisplay';
import { canManageCatalog, type PermissionSet } from '../../utils/screenAccess';
import { formatCurrency } from '../finance/formatters';
import { ClientFormDialog } from './ClientFormDialog';
import { ClientPage } from './ClientPage';
import { ServiceCatalog } from './ServiceCatalog';
import {
  errorBoxStyle, linkButtonStyle, rowSubtitleStyle, rowTitleStyle, tabStyle, toneBadgeStyle, wrapRowStyle,
} from './clientStyles';

type Area = 'clients' | 'services';

const SUMMARY_TONES = {
  info: CFG.primaryDark,
  warn: CFG.warnText,
  danger: CFG.danger,
  neutral: CFG.text,
  success: CFG.success,
} as const;

function SummaryCards({ accountId }: { accountId: number }) {
  const summaryQuery = useQuery({ queryKey: queryKeys.clientsSummary(accountId), queryFn: () => fetchClientsSummary(accountId) });
  if (!summaryQuery.data) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {clientsSummaryCards(summaryQuery.data).map((card) => (
        <div
          key={card.label}
          style={{ padding: '10px 12px', borderRadius: 14, border: `1px solid ${CFG.border}`, background: CFG.surface, boxShadow: CFG.shadowRow }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: CFG.muted }}>{card.label}</p>
          <p style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: SUMMARY_TONES[card.tone], fontVariantNumeric: 'tabular-nums' }}>
            {card.value}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: CFG.muted }}>{card.detail}</p>
        </div>
      ))}
    </div>
  );
}

function ClientRow({ client, index, onOpen }: { client: ClientListItem; index: number; onOpen: () => void }) {
  const contracts = client.contracts;
  const subtitle = [
    formatDocument(client.document),
    client.type === 'orgao_publico' ? client.agency : null,
    contracts && contracts.activeContracts > 0
      ? `${contracts.activeContracts} contrato${contracts.activeContracts === 1 ? '' : 's'} ativo${contracts.activeContracts === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onOpen}
      style={wrapRowStyle}
      onMouseEnter={(event) => { event.currentTarget.style.borderColor = CFG.primary; }}
      onMouseLeave={(event) => { event.currentTarget.style.borderColor = CFG.border; }}
    >
      <span className={CFG_MONO_CLASS} style={{ flex: 'none', width: 20, fontSize: 10.5, color: CFG.faint }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        <p style={rowTitleStyle}>{client.name}</p>
        <p style={rowSubtitleStyle}>{subtitle}</p>
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        {contracts && contracts.monthlyAmount > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: CFG.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(contracts.monthlyAmount)}/mês
          </span>
        )}
        <span style={toneBadgeStyle('neutral')}>{CLIENT_TYPE_LABELS[client.type]}</span>
        {contracts?.expiringSoon && <span style={toneBadgeStyle('warn')}>Contrato vencendo</span>}
        {contracts?.overdue && <span style={toneBadgeStyle('danger')}>Receita atrasada</span>}
        {contracts?.readjustmentAvailable && <span style={toneBadgeStyle('info')}>Reajuste disponível</span>}
        <ChevronRight size={13} strokeWidth={2.2} style={{ color: '#94a3b8' }} />
      </span>
    </button>
  );
}

/** Busca na lista já carregada: nome, órgão ou documento (com ou sem pontuação). */
function matchesSearch(client: ClientListItem, search: string): boolean {
  const text = search.trim().toLocaleLowerCase('pt-BR');
  if (!text) return true;
  const digits = onlyDigits(text);
  return client.name.toLocaleLowerCase('pt-BR').includes(text)
    || (client.agency ?? '').toLocaleLowerCase('pt-BR').includes(text)
    || (digits.length > 0 && client.document.includes(digits));
}

function ClientList({ accountId, canSeeContracts, onOpen }: {
  accountId: number;
  canSeeContracts: boolean;
  onOpen: (clientId: number) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ClientType | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const filters: ClientFilters = { search: '', type, status: showInactive ? 'inactive' : 'active' };

  const clientsQuery = useQuery({
    queryKey: queryKeys.clients(accountId, filters),
    queryFn: () => fetchClients(accountId, filters),
  });
  const clients = useMemo(
    () => (clientsQuery.data ?? []).filter((client) => matchesSearch(client, search)),
    [clientsQuery.data, search],
  );
  const countLabel = `${clients.length} cliente${clients.length === 1 ? '' : 's'} ${showInactive ? 'desativado' : 'ativo'}${clients.length === 1 ? '' : 's'}`;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {canSeeContracts && !showInactive && <SummaryCards accountId={accountId} />}

      <ListToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar por nome, órgão ou documento' }}
        filters={<ConfigSwitch checked={showInactive} onChange={setShowInactive} label={countLabel} />}
        action={(
          <button type="button" style={cfgPrimaryButtonStyle} onClick={() => setCreating(true)}>
            <Plus size={12} strokeWidth={2.6} /> Novo cliente
          </button>
        )}
      />

      <div role="radiogroup" aria-label="Tipo do cliente" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[null, ...CLIENT_TYPES].map((item) => (
          <button
            key={item ?? 'todos'}
            type="button"
            role="radio"
            aria-checked={type === item}
            onClick={() => setType(item)}
            style={{ ...tabStyle(type === item), height: 26, fontSize: 12 }}
          >
            {item ? CLIENT_TYPE_LABELS[item] : 'Todos'}
          </button>
        ))}
      </div>

      {clientsQuery.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}
      {clientsQuery.isError && (
        <div role="alert" style={errorBoxStyle}>
          Não foi possível carregar os clientes.{' '}
          <button type="button" onClick={() => void clientsQuery.refetch()} style={{ ...linkButtonStyle, color: 'inherit', textDecoration: 'underline' }}>
            Tentar de novo
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {clients.map((client, index) => (
          <ClientRow key={client.id} client={client} index={index} onOpen={() => onOpen(client.id)} />
        ))}
        {clientsQuery.isSuccess && clients.length === 0 && (
          <EmptyState
            icon={Building2}
            title={search.trim() || type ? 'Nenhum cliente encontrado' : showInactive ? 'Nenhum cliente desativado' : 'Nenhum cliente cadastrado'}
            description={search.trim() || type || showInactive ? undefined : 'Cadastre os clientes da empresa: pessoa física, empresa ou órgão público.'}
          />
        )}
      </div>

      {creating && (
        <ClientFormDialog
          open
          accountId={accountId}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            invalidateIncomeQueries(qc);
            if (saved) onOpen(saved.id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Seção Clientes (conta PJ): a lista com os indicadores dos contratos e o
 * catálogo de serviços, cada um com a sua permissão. Quem tem só "Serviços"
 * vê só o catálogo; sem "Contratos", a página do cliente não mostra contratos.
 */
export function ClientsScreen() {
  const ownPermissions = useOwnPermissions();
  const permissions: PermissionSet = ownPermissions ?? {};
  const accountId = getActiveAccountId();
  const canClients = canManageCatalog(permissions, 'clients');
  const canServices = canManageCatalog(permissions, 'services');
  const canSeeContracts = canManageCatalog(permissions, 'contracts');
  const canSeeIncomes = permissions.accessIncomes === true;
  // A escolha da aba só vale com as duas permissões; com uma só, a aba é a dela.
  const [area, setArea] = useState<Area>('clients');
  const [openClientId, setOpenClientId] = useState<number | null>(null);

  if (accountId === null) {
    return <EmptyState icon={Building2} title="Escolha uma conta de empresa" />;
  }
  if (!ownPermissions) {
    return <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>;
  }
  const shownArea: Area = canClients && canServices ? area : canClients ? 'clients' : 'services';

  if (shownArea === 'clients' && openClientId !== null) {
    return (
      <ClientPage
        key={openClientId}
        clientId={openClientId}
        accountId={accountId}
        canSeeContracts={canSeeContracts}
        canSeeIncomes={canSeeIncomes}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {canClients && canServices && (
        <div role="tablist" aria-label="Clientes" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" role="tab" aria-selected={shownArea === 'clients'} onClick={() => setArea('clients')} style={tabStyle(shownArea === 'clients')}>
            Clientes
          </button>
          <button type="button" role="tab" aria-selected={shownArea === 'services'} onClick={() => setArea('services')} style={tabStyle(shownArea === 'services')}>
            Catálogo de serviços
          </button>
        </div>
      )}
      {shownArea === 'clients'
        ? <ClientList accountId={accountId} canSeeContracts={canSeeContracts} onOpen={setOpenClientId} />
        : <ServiceCatalog accountId={accountId} />}
    </div>
  );
}
