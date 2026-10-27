import { Link } from 'react-router-dom';
import type { CountItem } from '../utils/dashboard';

interface CountBarsProps {
  label: string;
  items: CountItem[];
  /**
   * `short`: rótulo curto (sigla da UF); `wide`: rótulo de texto curto (esfera, semana, janela); `stacked`: rótulo longo
   * (órgão, categoria) numa linha própria, com a barra embaixo.
   */
  labelSize?: 'short' | 'wide' | 'stacked';
}

const COLUMNS = {
  short: 'grid-cols-[2.5rem_minmax(0,1fr)_3.5rem]',
  wide: 'grid-cols-[8rem_minmax(0,1fr)_3.5rem]',
  wideWithSuffix: 'grid-cols-[8rem_minmax(0,1fr)_6rem]',
} as const;

const labelClass = 'min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200';
const linkClass = `${labelClass} hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300`;

function Label({ item }: { item: CountItem }) {
  return item.to ? (
    <Link to={item.to} title={item.label} className={linkClass}>
      {item.label}
    </Link>
  ) : (
    <span title={item.label} className={labelClass}>
      {item.label}
    </span>
  );
}

function Bar({ share }: { share: number }) {
  return (
    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
      <span className="block h-full rounded-full bg-brand-500 dark:bg-brand-400" style={{ width: `${share}%` }} />
    </span>
  );
}

function Value({ item }: { item: CountItem }) {
  return (
    <span className="text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
      {item.count.toLocaleString('pt-BR')}
      {item.suffix && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">{item.suffix}</span>}
    </span>
  );
}

/**
 * Barras horizontais de contagem (o BarrasHorizontais do painel financeiro só formata reais). A maior barra ocupa a
 * largura toda, e a de contagem zero fica vazia (uma barra mínima daria a ideia de que há algo).
 */
export function CountBars({ label, items, labelSize = 'short' }: CountBarsProps) {
  const max = Math.max(1, ...items.map((item) => item.count));
  const hasSuffix = items.some((item) => item.suffix);
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-2">
      {items.map((item) => {
        const share = item.count === 0 ? 0 : Math.max(2, Math.round((item.count / max) * 100));
        if (labelSize === 'stacked') {
          return (
            <li key={item.key} className="grid grid-cols-1 gap-1 text-xs">
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                <Label item={item} />
                <Value item={item} />
              </span>
              <Bar share={share} />
            </li>
          );
        }
        const columns = labelSize === 'wide' && hasSuffix ? COLUMNS.wideWithSuffix : COLUMNS[labelSize];
        return (
          <li key={item.key} className={`grid ${columns} items-center gap-2 text-xs`}>
            <Label item={item} />
            <Bar share={share} />
            <Value item={item} />
          </li>
        );
      })}
    </ul>
  );
}
