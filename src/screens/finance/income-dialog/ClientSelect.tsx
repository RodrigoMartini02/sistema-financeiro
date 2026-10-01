import { useRef, useState, type KeyboardEvent } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { normalizeCategoryText } from '../../../utils/categorySuggestions';
import { SEPARATOR, chevronStyle, ellipsisStyle, selectStyle } from '../entry-dialog/fieldStyles';

interface ClientSelectProps {
  value: string;
  /** Nomes do cadastro de clientes. */
  clients: string[];
  onChange: (name: string) => void;
  /** Cadastra o cliente com o nome digitado e devolve o nome gravado. */
  /** Sem ele, não há "+ cadastrar": só escolhe entre os já cadastrados. */
  onCreate?: (name: string) => Promise<string>;
  invalid: boolean;
}

/**
 * Cliente da receita (conta PJ): só nomes do cadastro. A busca filtra a lista e,
 * sem um nome igual, oferece "+ cadastrar" ali mesmo. Clicar no cliente escolhido
 * desmarca.
 */
export function ClientSelect({ value, clients, onChange, onCreate, invalid }: ClientSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const normalizedQuery = normalizeCategoryText(query);
  const results = normalizedQuery
    ? clients.filter((name) => normalizeCategoryText(name).includes(normalizedQuery))
    : clients;
  const canCreate = !!onCreate && normalizedQuery !== '' && !clients.some((name) => normalizeCategoryText(name) === normalizedQuery);

  const close = () => {
    setOpen(false);
    setQuery('');
    setCreateError('');
  };

  const pick = (name: string) => {
    onChange(name === value ? '' : name);
    close();
    triggerRef.current?.focus();
  };

  const create = async () => {
    const name = query.trim();
    if (!name || creating || !onCreate) return;
    setCreating(true);
    setCreateError('');
    try {
      onChange(await onCreate(name));
      close();
      triggerRef.current?.focus();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setCreating(false);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results[0]) pick(results[0]);
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
        title={value || undefined}
        aria-label={`Cliente: ${value || 'nenhum'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ ...selectStyle({ invalid }), color: value ? C.text : C.placeholder }}
      >
        <span style={ellipsisStyle}>{value || 'Selecionar'}</span>
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
          {results.map((name) => (
            <button key={name} type="button" onClick={() => pick(name)} style={rowStyle(name === value)}>
              <span style={ellipsisStyle}>{name}</span>
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
        {createError && <span style={{ fontSize: 12, color: C.danger }}>{createError}</span>}
      </FloatingPanel>
    </>
  );
}
