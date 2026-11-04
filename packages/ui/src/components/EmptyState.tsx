import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        borderRadius: 12,
        border: '1px solid var(--cfg-border, #e2e8f0)',
        background: 'var(--cfg-surface, #ffffff)',
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--cfg-muted, #94a3b8)',
      }}
    >
      {Icon && <Icon size={26} strokeWidth={1.5} />}
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--cfg-text-soft, #475569)' }}>{title}</p>
      {description && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--cfg-muted, #94a3b8)' }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}
