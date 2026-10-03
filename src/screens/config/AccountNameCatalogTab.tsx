import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Network, type LucideIcon } from 'lucide-react';
import {
  fetchAccountNames, saveAccountName, deactivateAccountName,
  type AccountNameCatalogKind, type AccountNameItem,
} from '../../services/accountNameCatalogService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG } from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

interface CatalogTexts {
  singular: string;
  plural: string;
  /** Título do modal e do botão: "Setor", "Cargo". */
  title: string;
  placeholder: string;
  banner: string;
  guideKey: string;
  guideMessage: string;
  icon: LucideIcon;
  emptyDescription: string;
}

// Setores e cargos têm o mesmo formato (um nome por conta PJ) e a mesma tela;
// só os textos mudam.
const CATALOG_TEXTS: Record<AccountNameCatalogKind, CatalogTexts> = {
  sectors: {
    singular: 'setor',
    plural: 'setores',
    title: 'Setor',
    placeholder: 'Ex: Financeiro, Comercial, Suporte',
    banner: 'Os setores desta empresa aparecem para escolher no cadastro dos colaboradores.',
    guideKey: 'setores:novo-v1',
    guideMessage: firstAccessGuideMessages.setoresNovo,
    icon: Network,
    emptyDescription: 'Crie setores para organizar os colaboradores da empresa.',
  },
  'job-titles': {
    singular: 'cargo',
    plural: 'cargos',
    title: 'Cargo',
    placeholder: 'Ex: Gerente, Vendedor, Analista',
    banner: 'Os cargos desta empresa aparecem para escolher no cadastro dos colaboradores.',
    guideKey: 'cargos:novo-v1',
    guideMessage: firstAccessGuideMessages.cargosNovo,
    icon: Briefcase,
    emptyDescription: 'Crie cargos para identificar a função de cada colaborador.',
  },
};

function NameDialog({
  open, texts, item, isSaving, error, onClose, onSave, onDeactivate,
}: {
  open: boolean;
  texts: CatalogTexts;
  item?: AccountNameItem;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (nome: string) => void;
  onDeactivate?: () => void;
}) {
  const confirm = useConfirm();

  const handleDeactivate = async () => {
    if (!onDeactivate) return;
    const ok = await confirm({
      title: `Desativar ${texts.singular}`,
      message: `Desativar "${item?.nome}"? Ele some das opções do cadastro de colaboradores, mas continua em quem já o usa.`,
      confirmLabel: 'Desativar',
      variant: 'danger',
    });
    if (ok) onDeactivate();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(String(new FormData(e.currentTarget).get('nome') ?? '').trim());
  };

  return (
    <Dialog open={open} title={item ? `Editar ${texts.singular}` : `Novo ${texts.singular}`} onClose={onClose} size="sm" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 120, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="account-name-input"><span>Nome do {texts.singular}</span><span style={{ color: C.danger }}>*</span></label>
            <input
              id="account-name-input"
              name="nome"
              defaultValue={item?.nome}
              placeholder={texts.placeholder}
              maxLength={100}
              autoFocus
              required
              style={fieldInputStyle}
            />
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de um item ativo. */}
          {item?.ativo && onDeactivate && (
            <button type="button" style={dangerButtonStyle} onClick={handleDeactivate}>Desativar</button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** Tela de uma lista de nomes da conta PJ ativa (Setores, Cargos). */
export function AccountNameCatalogTab({ kind }: { kind: AccountNameCatalogKind }) {
  const texts = CATALOG_TEXTS[kind];
  const qc = useQueryClient();
  const accountId = getActiveAccountId();
  const [dialog, setDialog] = useState<{ open: boolean; item?: AccountNameItem }>({ open: false });
  const [showInactive, setShowInactive] = useState(false);
  const createGuide = useFirstAccessGuide(texts.guideKey);

  const listQuery = useQuery({
    queryKey: queryKeys.accountNames(kind, accountId),
    queryFn: () => fetchAccountNames(kind, accountId!),
    enabled: accountId !== null,
  });
  const items = (listQuery.data ?? []).filter((item) => (showInactive ? !item.ativo : item.ativo));

  // A linha do colaborador mostra o cargo e o setor pelo nome.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.accountNamesOfKind(kind) });
    void qc.invalidateQueries({ queryKey: queryKeys.membrosAll });
  };

  const saveMut = useMutation({
    mutationFn: ({ nome, id }: { nome: string; id?: number }) => saveAccountName(kind, { nome, conta_id: accountId! }, id),
    onSuccess: () => { refresh(); setDialog({ open: false }); },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => deactivateAccountName(kind, id),
    onSuccess: () => { refresh(); setDialog({ open: false }); },
  });

  const state = showInactive ? 'desativado' : 'ativo';
  const count = `${items.length} ${items.length === 1 ? texts.singular : texts.plural} ${state}${items.length === 1 ? '' : 's'}`;

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={<ConfigSwitch checked={showInactive} onChange={setShowInactive} label={count} />}
        actionLabel={`Novo ${texts.singular}`}
        onAction={() => { saveMut.reset(); setDialog({ open: true }); }}
      >
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={texts.icon}
            description={texts.guideMessage}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </ConfigTabHeader>

      <InfoBanner>{texts.banner}</InfoBanner>

      {listQuery.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      {listQuery.isError && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.danger }}>
          Não foi possível carregar os {texts.plural}.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, index) => (
          <ConfigListRow
            key={item.id}
            index={index}
            nome={item.nome}
            dataCriacao={item.data_criacao}
            onClick={() => { saveMut.reset(); setDialog({ open: true, item }); }}
          />
        ))}
        {items.length === 0 && !listQuery.isLoading && !listQuery.isError && (
          showInactive
            ? <EmptyState title={`Nenhum ${texts.singular} desativado`} />
            : <EmptyState icon={texts.icon} title={`Nenhum ${texts.singular} cadastrado`} description={texts.emptyDescription} />
        )}
      </div>

      <NameDialog
        key={dialog.item?.id ?? 'new'}
        open={dialog.open}
        texts={texts}
        item={dialog.item}
        isSaving={saveMut.isPending || deactivateMut.isPending}
        error={saveMut.error?.message ?? deactivateMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(nome) => saveMut.mutate({ nome, id: dialog.item?.id })}
        onDeactivate={dialog.item ? () => deactivateMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
