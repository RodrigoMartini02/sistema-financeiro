import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { MONTH_NAMES, type PainelPeriodo } from '../../types/finance';

interface Props {
  value: PainelPeriodo;
  onChange: (periodo: PainelPeriodo) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Primeiro e último dia do mês atual — período com que o Painel abre. */
export function periodoDoMesAtual(hoje: Date = new Date()): PainelPeriodo {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return { de: `${ano}-${pad(mes + 1)}-01`, ate: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}` };
}

function isoParaBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "setembro de 2026" para um mês inteiro; "10/09/2026 a 19/09/2026" para qualquer outro recorte. */
export function descreverPeriodo(periodo: PainelPeriodo): string {
  const [ano, mes] = periodo.de.split('-').map(Number);
  const ultimoDia = new Date(ano!, mes!, 0).getDate();
  const ehMesInteiro = periodo.de.endsWith('-01')
    && periodo.ate === `${ano}-${pad(mes!)}-${pad(ultimoDia)}`;
  if (ehMesInteiro) {
    return `${MONTH_NAMES[mes! - 1]!.toLowerCase()} de ${ano}`;
  }
  return `${isoParaBr(periodo.de)} a ${isoParaBr(periodo.ate)}`;
}

// Formata dígitos digitados livremente em dd/mm/aaaa, inserindo as barras
// automaticamente conforme o usuário digita (sem exigir que ele mesmo as digite).
function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

/** dd/mm/aaaa válido → 'AAAA-MM-DD'; qualquer outra coisa → null. */
function brParaIso(masked: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  if (year < 2000 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function DashboardPeriodFilter({ value, onChange }: Props) {
  const [de, setDe] = useState(isoParaBr(value.de));
  const [ate, setAte] = useState(isoParaBr(value.ate));

  const deIso = brParaIso(de);
  const ateIso = brParaIso(ate);
  const invalido = !deIso || !ateIso || deIso > ateIso;

  const apply = () => {
    if (!deIso || !ateIso || invalido) return;
    onChange({ de: deIso, ate: ateIso });
  };

  // Mesma pílula da busca do ListToolbar: altura 30, borda slate-200, 12.5px.
  const inputCls = (temErro: boolean) =>
    `h-[30px] w-[104px] rounded-full border bg-white px-3 text-[12.5px] tabular-nums text-slate-800 outline-none transition focus:border-cyan-600 dark:bg-slate-800 dark:text-slate-100 ${
      temErro ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200 dark:border-slate-700'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
      <span className="text-xs text-slate-500 dark:text-slate-400">De</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        aria-label="Data inicial"
        value={de}
        onChange={(e) => setDe(maskDate(e.target.value))}
        onKeyDown={(e) => e.key === 'Enter' && apply()}
        className={inputCls(Boolean(de) && !deIso)}
      />
      <span className="text-xs text-slate-500 dark:text-slate-400">até</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        aria-label="Data final"
        value={ate}
        onChange={(e) => setAte(maskDate(e.target.value))}
        onKeyDown={(e) => e.key === 'Enter' && apply()}
        className={inputCls(Boolean(ate) && !ateIso)}
      />
      <button
        type="button"
        onClick={apply}
        disabled={invalido}
        className="h-[30px] rounded-full px-3 text-[12.5px] font-semibold text-cyan-600 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent dark:text-cyan-400 dark:hover:bg-cyan-950/40 dark:disabled:text-slate-500"
      >
        Aplicar
      </button>
    </div>
  );
}
