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

  const inputCls = (temErro: boolean) =>
    `w-[82px] rounded border-b bg-transparent px-1 py-0.5 text-[12px] tabular-nums text-[#0f2b38] focus:border-[#0891b2] focus:outline-none dark:text-slate-200 ${
      temErro ? 'border-red-300' : 'border-[#dcebf1] dark:border-slate-700'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Calendar size={12} className="shrink-0 text-[#a8bac4]" />
      <span className="text-[12px] text-[#7b93a1]">De</span>
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
      <span className="text-[12px] text-[#7b93a1]">até</span>
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
        className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0891b2] transition hover:bg-[#e0f2f7] disabled:cursor-not-allowed disabled:text-[#a8bac4] disabled:hover:bg-transparent"
      >
        Aplicar
      </button>
    </div>
  );
}
