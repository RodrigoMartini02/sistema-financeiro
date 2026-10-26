import type { ReactNode } from 'react';

// O cartão-base das listas do módulo (plano .plans/licitacoes-lista-infinita.md): editais, contratos, licitações
// vencidas, buscas salvas, notificações e execuções da coleta usam a mesma casca, e cada tela só preenche os encaixes:
// selos e ação no topo, título, linhas de contexto, métricas e rodapé de ações.

export interface ListCardMetric {
  label: string;
  value: ReactNode;
}

interface ListCardProps {
  /** Selos, à esquerda do topo. Sem selos, a ação do topo fica ao lado do título. */
  badges?: ReactNode;
  /** Ação do canto (coração, menu de três pontos). */
  topAction?: ReactNode;
  /** O título (normalmente o link do item); a casca cuida do tamanho e da cor. */
  title: ReactNode;
  /** Linhas de contexto abaixo do título: `ListCardLine`, uma por linha. */
  context?: ReactNode;
  metrics?: readonly ListCardMetric[];
  /** Ações do rodapé (acompanhar, ver detalhes, interruptores). */
  footer?: ReactNode;
  /** Item desligado ou em segundo plano: borda tracejada. */
  muted?: boolean;
  /** Item que pede atenção (notificação não lida): fundo de destaque. */
  highlighted?: boolean;
}

/** Quantas linhas uma linha de contexto ocupa antes de cortar: 1 corta com reticências; "all" mostra o texto inteiro. */
export type ListCardLines = 1 | 2 | 3 | 'all';

const LINE_CLASSES: Record<ListCardLines, string> = {
  1: 'truncate',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  all: 'break-words',
};

/** Uma linha de contexto do cartão (órgão e local, fornecedor, critérios, mensagem). */
export function ListCardLine({ children, lines = 1 }: { children: ReactNode; lines?: ListCardLines }) {
  return <p className={LINE_CLASSES[lines]}>{children}</p>;
}

export function ListCard({ badges, topAction, title, context, metrics, footer, muted = false, highlighted = false }: ListCardProps) {
  const hasBadges = badges !== undefined && badges !== null && badges !== false;
  const border = muted
    ? 'border-dashed border-slate-300 dark:border-slate-600'
    : 'border-slate-200 hover:border-brand-200 dark:border-slate-700 dark:hover:border-brand-500/40';
  const background = highlighted ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'bg-white dark:bg-slate-800';
  const titleClass = 'min-w-0 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100';

  return (
    <article className={`relative rounded-2xl border p-4 shadow-sm transition ${border} ${background}`}>
      {hasBadges && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
          {topAction}
        </div>
      )}

      {hasBadges ? (
        <h3 className={`mt-2 ${titleClass}`}>{title}</h3>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <h3 className={`flex-1 ${titleClass}`}>{title}</h3>
          {topAction}
        </div>
      )}

      {context && <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-slate-500 dark:text-slate-400">{context}</div>}

      {metrics && metrics.length > 0 && (
        <dl className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 text-xs">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-slate-500 dark:text-slate-400">{metric.label}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {footer && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">{footer}</div>}
    </article>
  );
}
