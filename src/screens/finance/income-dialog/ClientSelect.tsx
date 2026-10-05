import { useRef, useState, type KeyboardEvent } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { normalizeCategoryText } from '../../../utils/categorySuggestions';
import { SEPARATOR, chevronStyle, ellipsisStyle, selectStyle } from '../entry-dialog/fieldStyles';
import type { ClientOption } from './draftRules';

interface ClientSelectProps {
  /** Cliente escolhido, pelo id do cadastro. */
  value: number | null;
  /** Clientes ativos do cadastro. */
  clients: ClientOption[];
  /** Nome do cliente que a receita já tinha e saiu da lista (desativado). */
  fallbackName?: string | null;
  onChange: (clientId: number | null) => void;
  /**
   * Abre o cadastro completo (o documento é obrigatório) com o nome digitado e
   * devolve o cliente gravado, ou null se a pessoa desistiu. Sem ele, não há
   * "+ cadastrar": só escolhe entre os já cadastrados.
   */
  onCreate?: (name: string) => Promise<ClientOption | null>;
  invalid: boolean;
}

/**
 * Cliente da receita (conta PJ): só clientes do cadastro, pelo id; mostra
 * sempre o nome atual. A busca filtra a lista e, sem um nome igual, oferece
 * "+ cadastrar". Clicar no cliente escolhido desmarca.
 */
export function ClientSelect({ value, clients, fallbackName, onChange, onCreate, invalid }: ClientSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedName = value === null ? '' : clients.find((client) => client.id === value)?.name ?? fallbackName ?? '';
  const normalizedQuery = normalizeCategoryText(query);
  const results = normalizedQuery
    ? clients.filter((client) => normalizeCategoryText(client.name).includes(normalizedQuery))
    : clients;
  const canCreate = !!onCreate && normalizedQuery !== ''
    && !clients.some((client) => normalizeCategoryText(client.name) === normalizedQuery);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (clientId: number) => {
    onChange(clientId === value ? null : clientId);
    close();
    triggerRef.current?.focus();
  };

  // O cadastro abre num modal por cima: o painel fecha antes, e o cliente gravado já vem escolhido.
  const create = async () => {
    const name = query.trim();
    if (!name || creating || !onCreate) return;
    setCreating(true);
    close();
    try {
      const created = await onCreate(name);
      if (created) onChange(created.id);
    } finally {
      setCreating(false);
      triggerRef.current?.focus();
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results[0]) pick(results[0].id);
    else if (canCreate) void create();
  };

  const rowStyle = (active: boolean) => ({
    display: 'flex', alignItems: 'center', flex: 'none', height: 28, padding: '0 8px', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
    background: active ? C.primarySoft : 'transparent', color: active ? C.primaryDark : C.text,
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title={selectedName || undefined}
        aria-label={`Cliente: ${selectedName || 'nenhum'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ ...selectStyle({ invalid }), color: selectedName ? C.text : C.placeholder }}
      >
        <span style={ellipsisStyle}>{selectedName || 'Selecionar'}</span>
        <span aria-hidden="true" style={chevronStyle}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={close} label="Clientes" minWidth={260} padding={8}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar cliente..."
          style={{ height: 28, padding: '0 9px', border: `1px solid ${C.borderInput}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 220, overflowY: 'auto', borderTop: `1px solid ${SEPARATOR}`, paddingTop: 6 }}>
          {results.map((client) => (
            <button key={client.id} type="button" onClick={() => pick(client.id)} style={rowStyle(client.id === value)}>
              <span style={ellipsisStyle}>{client.name}</span>
            </button>
          ))}
          {results.length === 0 && <span style={{ padding: '6px 8px', fontSize: 12, color: C.textFaint }}>Nenhum cliente encontrado</span>}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            style={{
              height: 28, padding: '0 8px', border: 'none', borderTop: `1px solid ${SEPARATOR}`, background: 'transparent',
              color: C.primary, fontSize: 12, fontWeight: 500, cursor: creating ? 'wait' : 'pointer', textAlign: 'left',
            }}
          >
            + cadastrar “{query.trim()}”
          </button>
        )}
      </FloatingPanel>
    </>
  );
}
