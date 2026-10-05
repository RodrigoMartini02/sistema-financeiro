import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import {
  createCatalogService, fetchCatalogServices, renameCatalogService, setCatalogServiceActive, type CatalogService,
} from '../../services/serviceCatalogService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import {
  C, dangerButtonStyle, dialogFooterStyle, labelStyle, saveButtonDisabledStyle, saveButtonStyle, successOutlineButtonStyle,
} from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { CFG, cfgBadgeStyle } from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { errorBoxStyle, fieldErrorStyle, inputStyle } from './clientStyles';

function ServiceDialog({ open, accountId, service, onClose, onSaved }: {
  open: boolean;
  accountId: number;
  service?: CatalogService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [nameError, setNameError] = useState('');
  const saveMutation = useMutation({
    mutationFn: (value: string) => (service ? renameCatalogService(service.id, value) : createCatalogService(accountId, value)),
    onSuccess: onSaved,
  });
  const activeMutation = useMutation({
    mutationFn: () => setCatalogServiceActive(service!.id, !service!.active),
    onSuccess: onSaved,
  });
  const busy = saveMutation.isPending || activeMutation.isPending;
  const error = saveMutation.error?.message ?? activeMutation.error?.message;

  const submit = () => {
    if (name.trim().length < 2) {
      setNameError('Informe o nome do serviço');
      return;
    }
    saveMutation.mutate(name.trim());
  };

  return (
    <Dialog open={open} title={service ? 'Editar serviço' : 'Novo serviço'} onClose={onClose} size="sm" scrollBody={false}>
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        noValidate
      >
        <div style={{ padding: '12px var(--dialog-px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}><span>Nome</span><span style={{ color: C.danger }}>*</span></label>
            <input
              value={name}
              onChange={(event) => { setName(event.target.value); setNameError(''); }}
              placeholder="Ex.: Suporte técnico"
              maxLength={150}
              autoFocus
              style={inputStyle(!!nameError)}
            />
            {nameError && <p role="alert" style={fieldErrorStyle}>{nameError}</p>}
          </div>
          {service && service.contractCount > 0 && (
            <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
              Listado em {service.contractCount} contrato{service.contractCount === 1 ? '' : 's'}: o novo nome aparece neles também.
            </p>
          )}
          {error && <div role="alert" style={errorBoxStyle}>{error}</div>}
        </div>
        <div style={dialogFooterStyle}>
          {service && (
            <button
              type="button"
              disabled={busy}
              style={service.active ? dangerButtonStyle : successOutlineButtonStyle}
              onClick={() => activeMutation.mutate()}
            >
              {service.active ? 'Desativar' : 'Reativar'}
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={busy} style={busy ? saveButtonDisabledStyle : saveButtonStyle}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Catálogo de serviços da conta PJ: aparece nos contratos como lista
 * informativa (com "implantado"), sem valor. Serviço desativado sai das opções
 * do contrato novo e continua nos antigos.
 */
export function ServiceCatalog({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; service?: CatalogService }>({ open: false });

  const servicesQuery = useQuery({
    queryKey: queryKeys.serviceCatalog(accountId, true),
    queryFn: () => fetchCatalogServices(accountId, true),
  });
  const services = (servicesQuery.data ?? []).filter((service) => service.active !== showInactive);

  const handleSaved = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.serviceCatalogAll });
    // A ficha do contrato mostra o nome do serviço.
    void qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'contract' });
    setDialog({ open: false });
  };

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={showInactive}
            onChange={setShowInactive}
            label={`${services.length} serviço${services.length === 1 ? '' : 's'} ${showInactive ? 'desativado' : 'ativo'}${services.length === 1 ? '' : 's'}`}
          />
        }
        actionLabel="Novo serviço"
        onAction={() => setDialog({ open: true })}
      />

      <InfoBanner>
        Os serviços aparecem no contrato como lista, com "implantado". O valor do contrato é a mensalidade.
      </InfoBanner>

      {servicesQuery.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}
      {servicesQuery.isError && (
        <div role="alert" style={errorBoxStyle}>
          Não foi possível carregar os serviços.{' '}
          <button type="button" onClick={() => void servicesQuery.refetch()} style={{ border: 'none', background: 'none', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
            Tentar de novo
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {services.map((service, index) => (
          <ConfigListRow
            key={service.id}
            index={index}
            nome={service.name}
            onClick={() => setDialog({ open: true, service })}
            badges={service.contractCount > 0 && (
              <span style={cfgBadgeStyle}>{service.contractCount} contrato{service.contractCount === 1 ? '' : 's'}</span>
            )}
          />
        ))}
        {services.length === 0 && servicesQuery.isSuccess && (
          <EmptyState
            icon={Wrench}
            title={showInactive ? 'Nenhum serviço desativado' : 'Nenhum serviço cadastrado'}
            description={showInactive ? undefined : 'Cadastre os serviços que a empresa presta para listar nos contratos.'}
          />
        )}
      </div>

      {/* Montado só aberto: cada abertura começa do zero. */}
      {dialog.open && (
        <ServiceDialog
          open
          accountId={accountId}
          service={dialog.service}
          onClose={() => setDialog({ open: false })}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
