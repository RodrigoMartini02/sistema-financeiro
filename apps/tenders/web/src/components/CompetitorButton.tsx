import { Radar } from 'lucide-react';
import { useAddCompetitor, useCompetitors, useRemoveCompetitor } from '../hooks/useCompetitors';
import { findCompetitor } from '../utils/competitors';

// Botão "Acompanhar concorrente" do cabeçalho da página do CNPJ (plano .plans/licitacoes-4-concorrentes-monitorados.md), no
// estilo do botão com rótulo do favorito. Lê a lista de concorrentes da pessoa (só o Postgres, então não depende do armazém
// de contratos). Enquanto grava, já mostra o estado escolhido; com erro (por exemplo, o limite de 30), a mensagem aparece
// embaixo. Com a lista carregando ou com falha, o botão fica desabilitado e a página segue inteira.

const BUTTON_CLASS =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_ON = 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-200';
const BUTTON_OFF =
  'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

export function CompetitorButton({ cnpj }: { cnpj: string }) {
  const list = useCompetitors();
  const add = useAddCompetitor();
  const remove = useRemoveCompetitor();
  const pending = add.isPending || remove.isPending;
  // Enquanto grava, o botão já mostra o estado escolhido.
  const monitored = add.isPending ? true : remove.isPending ? false : findCompetitor(list.data, cnpj) !== undefined;
  const errorMessage = add.error?.message ?? remove.error?.message ?? null;
  const actionLabel = monitored ? 'Deixar de acompanhar este concorrente' : 'Acompanhar este concorrente e receber aviso de contrato novo';

  const toggle = () => {
    if (pending || !list.data) return;
    if (monitored) {
      remove.mutate(cnpj);
    } else {
      add.mutate({ cnpj });
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {/* Sem `disabled` enquanto grava, para o foco não sair do botão. */}
      <button
        type="button"
        aria-pressed={monitored}
        aria-busy={pending}
        title={list.isError ? 'Não foi possível carregar os concorrentes agora.' : actionLabel}
        disabled={!list.data}
        onClick={toggle}
        className={`${BUTTON_CLASS} ${monitored ? BUTTON_ON : BUTTON_OFF}`}
      >
        <Radar size={14} aria-hidden="true" />
        {monitored ? 'Acompanhando' : 'Acompanhar concorrente'}
      </button>
      {errorMessage && (
        <span role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
