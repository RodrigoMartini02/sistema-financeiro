import { useState } from 'react';
import { Building2, CalendarClock, ChevronDown, Pencil, UserMinus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KebabMenu } from '@ui/components/KebabMenu';
import { ToggleRow } from '@ui/components/form';
import { usePatchCompetitor } from '../hooks/useCompetitors';
import type { Competitor, CompetitorSummary } from '../types';
import { cnpjPagePath } from '../utils/cnpj';
import { cnpjContractsPath } from '../utils/cnpjPage';
import { competitorContextLines, competitorMetrics, competitorTitle } from '../utils/competitors';
import { CnpjContractList } from './CnpjLists';
import { ListCard, ListCardLine } from './ListCard';

// O card de um concorrente monitorado (plano .plans/licitacoes-4-concorrentes-monitorados.md): o título (apelido, nome ou
// CNPJ), os números do armazém, o interruptor do aviso de contrato novo e os contratos recentes, que abrem ao clique (a
// mesma lista curta da página do CNPJ). Sem os números (carregando ou armazém atualizando), o card continua inteiro e
// mostra o motivo no lugar deles.

const LINK_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600';
const LINK_PRIMARY =
  'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20';
const LINK_NEUTRAL =
  'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

interface CompetitorCardProps {
  competitor: Competitor;
  /** Os números do armazém deste concorrente; ausente enquanto carregam ou se o armazém não respondeu. */
  summary: CompetitorSummary | undefined;
  /** Por que não há números ("Carregando…", "Atualizando os contratos…"); nulo quando há ou não há o que dizer. */
  numbersNote: string | null;
  onEdit: () => void;
  onRemove: () => void;
}

export function CompetitorCard({ competitor, summary, numbersNote, onEdit, onRemove }: CompetitorCardProps) {
  const patch = usePatchCompetitor();
  const [showContracts, setShowContracts] = useState(false);
  // Enquanto a API grava, o interruptor já mostra a escolha.
  const notify = patch.isPending && patch.variables?.changes.notify !== undefined ? patch.variables.changes.notify : competitor.notify;
  const metrics = competitorMetrics(summary);
  const contextLines = competitorContextLines(competitor, summary);

  return (
    <ListCard
      title={
        <Link
          to={cnpjPagePath(competitor.cnpj)}
          className="break-words rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300"
        >
          {competitorTitle(competitor, summary)}
        </Link>
      }
      topAction={
        <KebabMenu
          actions={[
            { key: 'edit', label: 'Editar apelido', icon: <Pencil size={15} />, onClick: onEdit },
            { key: 'remove', label: 'Deixar de acompanhar', icon: <UserMinus size={15} />, onClick: onRemove, tone: 'danger' },
          ]}
        />
      }
      context={contextLines.map((line) => (
        <ListCardLine key={line} lines="all">
          {line}
        </ListCardLine>
      ))}
      metrics={metrics}
      footer={
        <div className="grid grid-cols-1 gap-3">
          {metrics.length === 0 && numbersNote && <p className="text-xs text-slate-500 dark:text-slate-400">{numbersNote}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={showContracts}
              onClick={() => setShowContracts((open) => !open)}
              className={`${LINK_BUTTON} ${LINK_PRIMARY}`}
            >
              <CalendarClock size={14} aria-hidden="true" />
              Contratos recentes
              <ChevronDown size={14} className={showContracts ? 'rotate-180' : ''} aria-hidden="true" />
            </button>
            <Link to={cnpjContractsPath('fornecedor', competitor.cnpj)} className={`${LINK_BUTTON} ${LINK_NEUTRAL}`}>
              Ver todos os contratos
            </Link>
            <Link to={cnpjPagePath(competitor.cnpj)} className={`${LINK_BUTTON} ${LINK_NEUTRAL}`}>
              <Building2 size={14} aria-hidden="true" />
              Página do CNPJ
            </Link>
          </div>
          {showContracts && <CnpjContractList tab="fornecedor" cnpj={competitor.cnpj} />}
          <ToggleRow
            label="Avisar contratos novos"
            description={notify ? 'Avisa no sino quando sair contrato novo deste concorrente.' : 'Sem avisos no sino.'}
            checked={notify}
            disabled={patch.isPending}
            onChange={() => patch.mutate({ cnpj: competitor.cnpj, changes: { notify: !notify } })}
          />
          {patch.error && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {patch.error.message}
            </p>
          )}
        </div>
      }
    />
  );
}
