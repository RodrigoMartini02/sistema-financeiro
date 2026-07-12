import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, TrendingDown, TrendingUp, ArrowUpDown, ChevronDown, ChevronUp, X } from 'lucide-react';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import { MONTH_NAMES } from '../../types/finance';
import { Card } from '../../ui/card';
import { formatCurrency, formatDate } from '../finance/formatters';

// ── types ──────────────────────────────────────────────────────────────────────

interface RawDespesa {
  id: number; descricao: string; valor_final: string | number;
  categoria_nome?: string | null; forma_pagamento?: string | null;
  data_vencimento: string; data_pagamento?: string | null;
  mes: number; ano: number; pago?: boolean;
}

interface RawReceita {
  id: number; descricao: string; valor: string | number;
  tipo_receita?: string | null; data_recebimento: string;
  mes: number; ano: number;
}

type MesAno = { mes: number; ano: number };
type SortDir = 'asc' | 'desc';

// ── helpers ───────────────────────────────────────────────────────────────────

function dateToMesAno(dateStr: string): MesAno {
  const [ano, mes] = dateStr.split('-').map(Number);
  return { mes: mes - 1, ano };
}

function getMesesRange(inicio: MesAno, fim: MesAno): MesAno[] {
  const result: MesAno[] = [];
  let cur = { ...inicio };
  let safety = 0;
  while ((cur.ano < fim.ano || (cur.ano === fim.ano && cur.mes <= fim.mes)) && safety < 24) {
    result.push({ ...cur });
    cur = cur.mes === 11 ? { mes: 0, ano: cur.ano + 1 } : { mes: cur.mes + 1, ano: cur.ano };
    safety++;
  }
  return result;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function lastDayOf(ano: number, mes1indexed: number) {
  return new Date(ano, mes1indexed, 0).getDate();
}

async function fetchDespesasMes(mes: number, ano: number): Promise<RawDespesa[]> {
  const pid = getActiveProfileId();
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  if (pid) q.set('perfil_id', String(pid));
  return apiRequest<RawDespesa[]>(`/despesas?${q}`);
}

async function fetchReceitasMes(mes: number, ano: number): Promise<RawReceita[]> {
  const pid = getActiveProfileId();
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  if (pid) q.set('perfil_id', String(pid));
  return apiRequest<RawReceita[]>(`/receitas?${q}`);
}

function sumBy<T>(arr: T[], fn: (x: T) => number) {
  return arr.reduce((s, x) => s + fn(x), 0);
}

function periodoLabel(inicioStr: string, fimStr: string): string {
  const ini = dateToMesAno(inicioStr);
  const fim = dateToMesAno(fimStr);
  if (ini.mes === fim.mes && ini.ano === fim.ano)
    return `${MONTH_NAMES[ini.mes]} de ${ini.ano}`;
  return `${MONTH_NAMES[ini.mes].slice(0, 3)}/${ini.ano} – ${MONTH_NAMES[fim.mes].slice(0, 3)}/${fim.ano}`;
}

// ── sub-components ─────────────────────────────────────────────────────────────

interface FilterOption { value: string; label: string }

function FilterChip({ options, value, onChange }: { options: FilterOption[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== (options[0]?.value ?? '');
  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-xs font-medium transition select-none whitespace-nowrap',
          isActive
            ? 'bg-[#0EC4D8]/15 text-[#0a9db5] dark:bg-[#0EC4D8]/20 dark:text-[#0EC4D8]'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
        ].join(' ')}>
        {currentLabel}
        <ChevronDown size={11} className={['transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 min-w-[148px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={[
                'flex w-full items-center px-3 py-2 text-left text-xs transition whitespace-nowrap',
                opt.value === value
                  ? 'bg-[#0EC4D8]/10 font-semibold text-[#0a9db5] dark:text-[#0EC4D8]'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700',
              ].join(' ')}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dateCls = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[#0EC4D8] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';

// ── main component ─────────────────────────────────────────────────────────────

export function RelatoriosScreen() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const [dataInicio, setDataInicio] = useState(`${anoAtual}-${pad2(mesAtual + 1)}-01`);
  const [dataFim, setDataFim] = useState(`${anoAtual}-${pad2(mesAtual + 1)}-${pad2(lastDayOf(anoAtual, mesAtual + 1))}`);
  const [queryDataInicio, setQueryDataInicio] = useState(`${anoAtual}-${pad2(mesAtual + 1)}-01`);
  const [queryDataFim, setQueryDataFim] = useState(`${anoAtual}-${pad2(mesAtual + 1)}-${pad2(lastDayOf(anoAtual, mesAtual + 1))}`);

  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'despesas' | 'receitas'>('todos');
  const [formaFiltro, setFormaFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [sortKey, setSortKey] = useState<'data' | 'valor' | 'descricao'>('data');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Inject print CSS to hide sidebar + header
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'relatorio-print-style';
    style.textContent = `
      @media print {
        aside, header { display: none !important; }
        body > div > div { padding-left: 0 !important; }
        .no-print { display: none !important; }
        @page { margin: 1.5cm; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('relatorio-print-style')?.remove(); };
  }, []);

  // ── atalhos ──────────────────────────────────────────────────────────────────

  function aplicarAtalho(key: 'este_mes' | 'mes_anterior' | 'trimestre' | 'este_ano') {
    const m1 = mesAtual + 1;
    if (key === 'este_mes') {
      setDataInicio(`${anoAtual}-${pad2(m1)}-01`);
      setDataFim(`${anoAtual}-${pad2(m1)}-${pad2(lastDayOf(anoAtual, m1))}`);
    } else if (key === 'mes_anterior') {
      const pm = m1 === 1 ? 12 : m1 - 1;
      const pa = m1 === 1 ? anoAtual - 1 : anoAtual;
      setDataInicio(`${pa}-${pad2(pm)}-01`);
      setDataFim(`${pa}-${pad2(pm)}-${pad2(lastDayOf(pa, pm))}`);
    } else if (key === 'trimestre') {
      let im = m1 - 2;
      let ia = anoAtual;
      if (im <= 0) { im += 12; ia--; }
      setDataInicio(`${ia}-${pad2(im)}-01`);
      setDataFim(`${anoAtual}-${pad2(m1)}-${pad2(lastDayOf(anoAtual, m1))}`);
    } else {
      setDataInicio(`${anoAtual}-01-01`);
      setDataFim(`${anoAtual}-12-31`);
    }
  }

  function atalhoAtivo(key: string): boolean {
    const ini = dateToMesAno(dataInicio);
    const fim = dateToMesAno(dataFim);
    if (key === 'este_mes') return ini.mes === mesAtual && ini.ano === anoAtual && fim.mes === mesAtual && fim.ano === anoAtual;
    if (key === 'mes_anterior') {
      const m = mesAtual === 0 ? 11 : mesAtual - 1;
      const a = mesAtual === 0 ? anoAtual - 1 : anoAtual;
      return ini.mes === m && ini.ano === a && fim.mes === m && fim.ano === a;
    }
    if (key === 'este_ano') return ini.mes === 0 && ini.ano === anoAtual && fim.mes === 11 && fim.ano === anoAtual;
    return false;
  }

  // ── data ─────────────────────────────────────────────────────────────────────

  const mesesQueryRange = useMemo(() => getMesesRange(dateToMesAno(queryDataInicio), dateToMesAno(queryDataFim)), [queryDataInicio, queryDataFim]);

  const despQuery = useQuery({
    queryKey: ['rel-desp-range', queryDataInicio, queryDataFim],
    queryFn: async () => {
      const results = await Promise.all(mesesQueryRange.map(({ mes, ano }) => fetchDespesasMes(mes, ano)));
      return results.flat();
    },
  });

  const recQuery = useQuery({
    queryKey: ['rel-rec-range', queryDataInicio, queryDataFim],
    queryFn: async () => {
      const results = await Promise.all(mesesQueryRange.map(({ mes, ano }) => fetchReceitasMes(mes, ano)));
      return results.flat();
    },
  });

  const hasPendingChange = dataInicio !== queryDataInicio || dataFim !== queryDataFim;

  function handleConsultar() {
    setQueryDataInicio(dataInicio);
    setQueryDataFim(dataFim);
  }

  const despesas = despQuery.data ?? [];
  const receitas = recQuery.data ?? [];
  const totalDesp = sumBy(despesas, (d) => Number(d.valor_final));
  const totalRec  = sumBy(receitas, (r) => Number(r.valor));

  const formasDisponiveis = useMemo(() => Array.from(new Set(despesas.map((d) => d.forma_pagamento ?? 'dinheiro'))).sort(), [despesas]);

  // ── unified rows ─────────────────────────────────────────────────────────────

  type Row = { id: number; tipo: 'despesa' | 'receita'; descricao: string; valor: number; data: string; categoria: string; forma: string; pago?: boolean };

  const allRows: Row[] = useMemo(() => {
    const despRows: Row[] = (tipoFiltro !== 'receitas' ? despesas : [])
      .filter((d) => {
        if (formaFiltro !== 'todos' && (d.forma_pagamento ?? 'dinheiro') !== formaFiltro) return false;
        if (statusFiltro === 'pago' && !d.pago) return false;
        if (statusFiltro === 'pendente' && d.pago) return false;
        return true;
      })
      .map((d) => ({ id: d.id, tipo: 'despesa' as const, descricao: d.descricao, valor: Number(d.valor_final), data: d.data_vencimento, categoria: d.categoria_nome ?? 'Sem categoria', forma: d.forma_pagamento ?? 'dinheiro', pago: d.pago }));

    const recRows: Row[] = (tipoFiltro !== 'despesas' ? receitas : [])
      .map((r) => ({ id: r.id, tipo: 'receita' as const, descricao: r.descricao, valor: Number(r.valor), data: r.data_recebimento, categoria: r.tipo_receita ?? 'Outros', forma: 'receita', pago: true }));

    return [...despRows, ...recRows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'data') cmp = a.data.localeCompare(b.data);
      else if (sortKey === 'valor') cmp = a.valor - b.valor;
      else cmp = a.descricao.localeCompare(b.descricao);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [despesas, receitas, tipoFiltro, formaFiltro, statusFiltro, sortKey, sortDir]);

  const totalVisible = useMemo(() => ({
    desp: sumBy(allRows.filter((r) => r.tipo === 'despesa'), (r) => r.valor),
    rec:  sumBy(allRows.filter((r) => r.tipo === 'receita'), (r) => r.valor),
  }), [allRows]);

  // ── sort ─────────────────────────────────────────────────────────────────────

  const handleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  function SortIcon({ k }: { k: typeof sortKey }) {
    return sortKey === k
      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
      : <ArrowUpDown size={12} className="text-slate-300" />;
  }

  const hasFilter = tipoFiltro !== 'todos' || formaFiltro !== 'todos' || statusFiltro !== 'todos';
  const saldo = totalRec - totalDesp;

  // ── UI ────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto grid max-w-6xl gap-5">

      {/* Header — single row */}
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-950 dark:text-white shrink-0">Relatórios</h2>
        <button
          onClick={() => window.print()}
          className="no-print ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Printer size={15} /> Exportar PDF
        </button>
      </div>

      {/* Filters — sem overflow-hidden para dropdowns aparecerem */}
      <div className="no-print rounded-xl border border-slate-200 bg-white shadow-sm p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-semibold text-[#0EC4D8] mb-2">
          {periodoLabel(dataInicio, dataFim)}
          {hasPendingChange && <span className="ml-1.5 font-medium text-amber-500">· não consultado</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Atalhos */}
          {([
            { key: 'este_mes', label: 'Este mês' },
            { key: 'mes_anterior', label: 'Mês anterior' },
            { key: 'trimestre', label: 'Trimestre' },
            { key: 'este_ano', label: 'Este ano' },
          ] as const).map(({ key, label }) => (
            <button key={key} type="button" onClick={() => aplicarAtalho(key)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                atalhoAtivo(key)
                  ? 'bg-[#0EC4D8] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
              ].join(' ')}>
              {label}
            </button>
          ))}

          {/* Separador visual */}
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-600 mx-0.5" />

          {/* Chips de tipo / forma / status */}
          <FilterChip
            value={tipoFiltro}
            onChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'despesas', label: 'Só despesas' },
              { value: 'receitas', label: 'Só receitas' },
            ]}
          />
          {tipoFiltro !== 'receitas' && (
            <FilterChip
              value={formaFiltro}
              onChange={setFormaFiltro}
              options={[{ value: 'todos', label: 'Todas as formas' }, ...formasDisponiveis.map((f) => ({ value: f, label: f }))]}
            />
          )}
          {tipoFiltro !== 'receitas' && (
            <FilterChip
              value={statusFiltro}
              onChange={(v) => setStatusFiltro(v as typeof statusFiltro)}
              options={[
                { value: 'todos', label: 'Status' },
                { value: 'pago', label: 'Pagas' },
                { value: 'pendente', label: 'Pendentes' },
              ]}
            />
          )}
          {hasFilter && (
            <button type="button"
              onClick={() => { setTipoFiltro('todos'); setFormaFiltro('todos'); setStatusFiltro('todos'); }}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              <X size={10} /> Limpar
            </button>
          )}

          {/* De / Até / Consultar */}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 shrink-0">De:</span>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={dateCls} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 shrink-0">Até:</span>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={dateCls} />
            </div>
            <button
              type="button"
              onClick={handleConsultar}
              disabled={!hasPendingChange}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition shrink-0',
                hasPendingChange
                  ? 'bg-[#0EC4D8] text-white hover:bg-[#0ab5c7]'
                  : 'bg-slate-100 text-slate-400 cursor-default dark:bg-slate-700 dark:text-slate-500',
              ].join(' ')}
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-green-500" />
            <span className="text-xs font-semibold uppercase text-slate-500">Receitas</span>
          </div>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalRec)}</p>
          <p className="text-xs text-slate-400">{receitas.length} lançamento(s)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-red-500" />
            <span className="text-xs font-semibold uppercase text-slate-500">Despesas</span>
          </div>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totalDesp)}</p>
          <p className="text-xs text-slate-400">{despesas.length} lançamento(s)</p>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <span className="text-xs font-semibold uppercase text-slate-500">Saldo do período</span>
          <p className={['mt-1 text-xl font-bold', saldo >= 0 ? 'text-[#0EC4D8]' : 'text-amber-700'].join(' ')}>
            {formatCurrency(saldo)}
          </p>
          <p className="text-xs text-slate-400">
            {totalRec > 0
              ? `${((totalDesp / totalRec) * 100).toFixed(1)}% das receitas em despesas`
              : totalDesp > 0 ? 'Sem receitas no período' : 'Sem movimentação'}
          </p>
        </Card>
      </div>

      {/* Transaction table */}
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-3.5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Lançamentos ({allRows.length})
          </h3>
          <div className="text-xs">
            <span className="text-green-600 font-semibold">+{formatCurrency(totalVisible.rec)}</span>
            <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
            <span className="text-red-600 font-semibold">-{formatCurrency(totalVisible.desp)}</span>
          </div>
        </div>
        {despQuery.isLoading || recQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">Carregando...</p>
        ) : allRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum lançamento com estes filtros</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50">
                  <th className="px-4 py-2.5 text-left">
                    <button className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500" onClick={() => handleSort('descricao')}>
                      Descrição <SortIcon k="descricao" />
                    </button>
                  </th>
                  <th className="hidden px-4 py-2.5 text-left sm:table-cell">
                    <span className="text-xs font-semibold uppercase text-slate-500">Categoria</span>
                  </th>
                  <th className="hidden px-4 py-2.5 text-left md:table-cell">
                    <span className="text-xs font-semibold uppercase text-slate-500">Forma</span>
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <button className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500" onClick={() => handleSort('data')}>
                      Data <SortIcon k="data" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    <button className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 ml-auto" onClick={() => handleSort('valor')}>
                      Valor <SortIcon k="valor" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {allRows.map((row) => (
                  <tr key={`${row.tipo}-${row.id}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={['h-1.5 w-1.5 rounded-full shrink-0',
                          row.tipo === 'receita' ? 'bg-green-500' : row.pago ? 'bg-slate-300' : 'bg-red-500'].join(' ')} />
                        <span className={['font-medium truncate max-w-[180px]',
                          row.pago && row.tipo === 'despesa' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'].join(' ')}>
                          {row.descricao}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 sm:table-cell">{row.categoria}</td>
                    <td className="hidden px-4 py-2.5 text-xs capitalize text-slate-500 dark:text-slate-400 md:table-cell">{row.forma}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(row.data)}</td>
                    <td className={['px-4 py-2.5 text-right text-sm font-bold',
                      row.tipo === 'receita' ? 'text-green-700' : 'text-red-700'].join(' ')}>
                      {row.tipo === 'receita' ? '+' : '-'}{formatCurrency(row.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
