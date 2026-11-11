import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@ui/components/button';
import type { SanctionBaseResult, SanctionRecord } from '../types';
import {
  SANCTIONS_UNAVAILABLE_LABEL,
  SANCTION_BASE_NAMES,
  SANCTION_STATUS_LABELS,
  SANCTION_STATUS_TONES,
  checkedAtText,
  recordDetailLines,
  recordTitle,
  recordsToggleText,
  summarizeSanctionBases,
} from '../utils/sanctions';
import { ListCard, ListCardLine } from './ListCard';
import { Pill } from './Pill';

// O cartão de um assunto da aba Sanções (a empresa ou uma pessoa do cofre): o selo da pior situação, as bases consultadas, cada
// uma com a situação, a data da consulta e os registros recolhidos, e o botão de consultar. A situação vem pronta da API.

function SanctionRecordItem({ record, base }: { record: SanctionRecord; base: SanctionBaseResult['base'] }) {
  const lines = recordDetailLines(record, base);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={record.inForce ? 'danger' : 'warning'}>{record.inForce ? 'Em vigor' : 'Encerrado'}</Pill>
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{recordTitle(record)}</span>
      </div>
      {lines.length > 0 && (
        <ul className="mt-1 grid gap-0.5 text-[11.5px] text-slate-600 dark:text-slate-300">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Uma base consultada: o selo da situação, o nome do cadastro, quando foi consultada e os registros, recolhidos. */
export function SanctionBaseRow({ result, staleDays }: { result: SanctionBaseResult; staleDays: number }) {
  const names = SANCTION_BASE_NAMES[result.base];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={SANCTION_STATUS_TONES[result.status]}>{SANCTION_STATUS_LABELS[result.status]}</Pill>
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{names.name}</span>
        <span className="text-[11.5px] text-slate-500 dark:text-slate-400">{names.fullName}</span>
      </div>
      <p className={`mt-0.5 text-[11.5px] ${result.stale ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
        {checkedAtText(result, staleDays)}
      </p>
      {result.records.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-xs font-semibold text-brand-700 dark:text-brand-300">
            {recordsToggleText(result.records.length)}
          </summary>
          <ul className="mt-2 grid gap-2">
            {result.records.map((record, index) => (
              <SanctionRecordItem key={`${index}-${record.category ?? ''}`} record={record} base={result.base} />
            ))}
          </ul>
        </details>
      )}
      {result.truncated && (
        <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
          O cadastro tem mais registros do que os mostrados aqui. Confira a certidão oficial.
        </p>
      )}
    </div>
  );
}

interface SanctionSubjectCardProps {
  title: string;
  /** Linhas de contexto abaixo do título (o CNPJ da empresa, os papéis da pessoa). */
  context?: readonly string[];
  bases: readonly SanctionBaseResult[];
  staleDays: number;
  /** Há chave do portal: sem ela, a consulta fica indisponível. */
  available: boolean;
  /** Esta consulta está em andamento. */
  checking: boolean;
  /** Outra consulta está em andamento (ou a do "Consultar todos"): o botão espera. */
  busy: boolean;
  /** O que mostrar no lugar das bases e do botão quando o assunto não pode ser consultado (conta sem CNPJ). */
  blockedText?: string | null;
  /** Bloco antes das bases (a situação cadastral da empresa na Receita). */
  extra?: ReactNode;
  /** O erro ou o aviso da última consulta deste assunto. */
  note?: string | null;
  onCheck: () => void;
}

export function SanctionSubjectCard({
  title,
  context = [],
  bases,
  staleDays,
  available,
  checking,
  busy,
  blockedText = null,
  extra,
  note = null,
  onCheck,
}: SanctionSubjectCardProps) {
  const summary = summarizeSanctionBases(bases);
  const badge = !available && summary.tone === 'muted' ? { label: SANCTIONS_UNAVAILABLE_LABEL, tone: 'muted' as const } : summary;
  return (
    <ListCard
      badges={<Pill tone={badge.tone}>{badge.label}</Pill>}
      title={title}
      context={context.map((line) => (
        <ListCardLine key={line} lines="all">
          {line}
        </ListCardLine>
      ))}
      footer={
        <div className="grid grid-cols-1 gap-3">
          {extra}
          {blockedText === null ? (
            <div className="grid gap-1.5">
              {bases.map((result) => (
                <SanctionBaseRow key={result.base} result={result} staleDays={staleDays} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{blockedText}</p>
          )}
          {note && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {note}
            </p>
          )}
          {blockedText === null && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onCheck}
                disabled={!available || busy || checking}
                aria-busy={checking}
                title={available ? undefined : 'A consulta de sanções está indisponível no momento'}
                icon={<RefreshCw size={14} className={checking ? 'animate-spin' : ''} aria-hidden="true" />}
              >
                {checking ? 'Consultando…' : 'Consultar agora'}
              </Button>
            </div>
          )}
        </div>
      }
    />
  );
}
