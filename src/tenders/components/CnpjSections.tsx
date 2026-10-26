import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CnpjPartner, CnpjWinnersYear } from '../types';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';

// Peças da página do CNPJ: os indicadores, os valores por ano, o ranking de parceiros e o cabeçalho de cada seção.

export interface StatTile {
  label: string;
  value: string;
  hint?: string;
}

/** Indicadores do papel do CNPJ (contratos, valores, licitações vencidas, editais abertos). */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 ${tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
      {tiles.map((tile) => (
        <li key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tile.label}</p>
          <p className="mt-2 break-words text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">{tile.value}</p>
          {tile.hint && <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{tile.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Seção da página com título, um texto de apoio e o atalho "Ver todos". */
export function CnpjSection({
  title,
  hint,
  seeAll,
  children,
}: {
  title: string;
  hint?: string;
  seeAll?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
          {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        {seeAll && (
          <Link
            to={seeAll.to}
            className="rounded text-xs font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300"
          >
            {seeAll.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Licitações vencidas por ano, do mais recente para o mais antigo. */
export function WinnersByYear({ years }: { years: CnpjWinnersYear[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full min-w-[420px] text-left text-xs">
        <caption className="sr-only">Licitações vencidas por ano</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th scope="col" className="px-4 py-2 font-semibold">Ano</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Licitações</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Itens</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.year} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
              <th scope="row" className="px-4 py-2 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{year.year}</th>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{year.purchases.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{year.items.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{formatMoneyValue(year.totalValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranking de parceiros nos contratos (os órgãos de um fornecedor, ou os fornecedores de um órgão), com link para o CNPJ de cada um. */
export function PartnerRanking({ partners, label }: { partners: CnpjPartner[]; label: string }) {
  return (
    <ol aria-label={label} className="grid grid-cols-1 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-700/60 dark:border-slate-700 dark:bg-slate-800">
      {partners.map((partner, index) => (
        <li key={partner.cnpj} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              <CnpjLink cnpj={partner.cnpj}>{partner.name ?? formatCnpj(partner.cnpj)}</CnpjLink>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              CNPJ {formatCnpj(partner.cnpj)} · {partner.contracts.toLocaleString('pt-BR')} {partner.contracts === 1 ? 'contrato' : 'contratos'}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-slate-800 dark:text-slate-100">{formatMoneyValue(partner.totalValue)}</p>
        </li>
      ))}
    </ol>
  );
}
