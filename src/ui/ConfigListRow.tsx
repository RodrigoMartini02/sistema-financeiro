import { ChevronRight } from 'lucide-react';

type ColorScheme = 'brand' | 'red' | 'green';

interface ConfigListRowProps {
  index: number;
  nome: string;
  dataCriacao?: string;
  dataAtualizacao?: string;
  colorScheme?: ColorScheme;
  onClick: () => void;
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return null;
  }
}

const SCHEME = {
  brand: {
    border: 'hover:border-brand-300',
    badge: 'group-hover:bg-brand-50 group-hover:text-brand-600',
    chevron: 'group-hover:text-brand-400',
  },
  red: {
    border: 'hover:border-red-300',
    badge: 'group-hover:bg-red-50 group-hover:text-red-600',
    chevron: 'group-hover:text-red-400',
  },
  green: {
    border: 'hover:border-green-300',
    badge: 'group-hover:bg-green-50 group-hover:text-green-600',
    chevron: 'group-hover:text-green-400',
  },
};

export function ConfigListRow({ index, nome, dataCriacao, dataAtualizacao, colorScheme = 'brand', onClick }: ConfigListRowProps) {
  const criado = fmtDate(dataCriacao);
  const atualizado = fmtDate(dataAtualizacao);
  const s = SCHEME[colorScheme];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md ${s.border}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-sm font-semibold text-slate-500 transition ${s.badge}`}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="lg:hidden">
          <p className="truncate text-sm font-semibold text-slate-900">{nome}</p>
          {(criado || atualizado) && (
            <p className="mt-0.5 text-xs text-slate-400">
              {[criado && `Criado ${criado}`, atualizado && `Atualizado ${atualizado}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr] lg:items-center lg:gap-6">
          <p className="truncate text-sm font-semibold text-slate-900">{nome}</p>
          <p className="text-xs text-slate-400">{criado ?? '—'}</p>
          <p className="text-xs text-slate-400">{atualizado ?? '—'}</p>
        </div>
      </div>

      <ChevronRight size={15} className={`shrink-0 text-slate-300 transition group-hover:translate-x-0.5 ${s.chevron}`} />
    </button>
  );
}
