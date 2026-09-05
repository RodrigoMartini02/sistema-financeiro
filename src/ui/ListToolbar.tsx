import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

interface ListToolbarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: ReactNode;
  action?: ReactNode;
  countLabel?: string;
}

export function ListToolbar({ search, filters, action, countLabel }: ListToolbarProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {countLabel && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--cfg-text-soft, #64748b)' }}>
          {countLabel}
        </p>
      )}

      {search && (
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search
            size={13}
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: 'var(--cfg-muted, #94a3b8)',
            }}
          />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'Buscar...'}
            style={{
              width: '100%', boxSizing: 'border-box', height: 30, padding: '0 10px 0 28px',
              borderRadius: 999,
              border: '1px solid var(--cfg-border-input, #e2e8f0)',
              background: 'var(--cfg-surface, #ffffff)',
              fontSize: 12.5, color: 'var(--cfg-text, #1e293b)', outline: 'none',
            }}
          />
        </div>
      )}

      {filters}

      {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
    </div>
  );
}
