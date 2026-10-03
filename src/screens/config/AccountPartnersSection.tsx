import type { CSSProperties } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { C, labelStyle, fieldInputStyle, MoneyField, formatMoney } from '../../ui/dialogFormTokens';
import {
  FULL_PARTICIPATION_HUNDREDTHS, MAX_PARTNERS_PER_ACCOUNT, formatIsoDateBR, newPartnerRow, partnersTotals,
  type PartnerRow,
} from '../../utils/accountPartners';

const sectionTitleStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: C.text };
const mutedTextStyle: CSSProperties = { margin: 0, fontSize: 11.5, fontWeight: 500, color: C.textMuted };

const rowCardStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 12,
  border: `1px solid ${C.border}`, background: C.cardBg,
};

const addButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', padding: 0,
  cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: C.primaryDark,
};

const removeButtonStyle: CSSProperties = {
  flex: 'none', display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 10,
  border: `1px solid ${C.borderInput}`, background: '#fff', color: C.danger, cursor: 'pointer',
};

const readOnlyMoneyStyle: CSSProperties = {
  ...fieldInputStyle, display: 'flex', alignItems: 'center', background: C.panelBg, color: C.textSoft,
};

interface AccountPartnersSectionProps {
  rows: PartnerRow[];
  onChange: (rows: PartnerRow[]) => void;
  isLoading: boolean;
  loadError: string | null;
}

/**
 * Sócios da conta PJ dentro do modal da conta: nome, participação, capital e o
 * checkbox que lança o capital como receita, uma vez só. Controlado pelo
 * modal, que manda a lista inteira no mesmo "Salvar" da conta.
 */
export function AccountPartnersSection({ rows, onChange, isLoading, loadError }: AccountPartnersSectionProps) {
  const totals = partnersTotals(rows);
  const isFull = totals.percentHundredths === FULL_PARTICIPATION_HUNDREDTHS;
  const canAdd = !isLoading && !loadError && rows.length < MAX_PARTNERS_PER_ACCOUNT;

  const updateRow = (key: string, changes: Partial<PartnerRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removeRow = (key: string) => onChange(rows.filter((row) => row.key !== key));

  return (
    <section aria-labelledby="account-partners-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span id="account-partners-title" style={sectionTitleStyle}>Sócios</span>
        {canAdd && (
          <button type="button" onClick={() => onChange([...rows, newPartnerRow()])} style={addButtonStyle}>
            <Plus size={11} strokeWidth={2.8} /> Adicionar sócio
          </button>
        )}
      </div>

      {isLoading && <p style={mutedTextStyle}>Carregando sócios...</p>}

      {!isLoading && loadError && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
          {loadError}
        </div>
      )}

      {!isLoading && !loadError && rows.length === 0 && <p style={mutedTextStyle}>Nenhum sócio cadastrado.</p>}

      {!isLoading && !loadError && rows.map((row) => {
        const name = row.nome.trim() || 'sócio';
        return (
          <div key={row.key} style={rowCardStyle}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                <label style={labelStyle} htmlFor={`${row.key}-name`}>Nome</label>
                <input
                  id={`${row.key}-name`}
                  value={row.nome}
                  onChange={(e) => updateRow(row.key, { nome: e.target.value })}
                  placeholder="Ex: Maria Souza"
                  maxLength={100}
                  style={fieldInputStyle}
                />
              </div>
              <div style={{ flex: '0 0 96px' }}>
                <label style={labelStyle} htmlFor={`${row.key}-percentage`}>Participação</label>
                <input
                  id={`${row.key}-percentage`}
                  value={row.percentual}
                  onChange={(e) => updateRow(row.key, { percentual: e.target.value })}
                  placeholder="%"
                  inputMode="decimal"
                  style={fieldInputStyle}
                />
              </div>
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <span style={labelStyle}>Capital inicial</span>
                {row.launched
                  ? <div style={readOnlyMoneyStyle}>R$ {formatMoney(row.capital ?? 0)}</div>
                  : <MoneyField value={row.capital} onChange={(value) => updateRow(row.key, { capital: value })} />}
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                aria-label={`Remover ${name}`}
                title={row.launched ? 'Remover sócio (a receita do capital continua em Receitas)' : 'Remover sócio'}
                style={removeButtonStyle}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {row.launched ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.success }}>
                Lançado como receita{row.launchedAt ? ` em ${formatIsoDateBR(row.launchedAt)}` : ''}
              </span>
            ) : (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.textSoft, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={row.launchAsIncome}
                  onChange={(e) => updateRow(row.key, { launchAsIncome: e.target.checked })}
                />
                Lançar como receita
              </label>
            )}
          </div>
        );
      })}

      {!isLoading && !loadError && rows.length > 0 && (
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: isFull ? C.success : C.danger }}>
          Participação: {formatMoney(totals.percentHundredths / 100)}% · Capital: R$ {formatMoney(totals.capital)}
          {!isFull && ' · A soma das participações precisa dar 100%'}
        </p>
      )}
    </section>
  );
}
