import { Heart } from 'lucide-react';
import { useToggleContractFavorite } from '../hooks/useContractFavorite';
import { useToggleFavorite } from '../hooks/useNoticeFavorite';
import type { ContractListItem, NoticeListItem } from '../types';

// Coração de favorito (card, tabela e detalhe), da pessoa logada, para edital
// e para contrato. Enquanto grava, o coração já mostra o estado escolhido; com
// erro, volta e a mensagem aparece.

const ICON_CLASS =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 sm:h-8 sm:w-8';
const ICON_ON = 'text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10';
const ICON_OFF = 'text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400';

const LABELED_CLASS =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600';
const LABELED_ON = 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300';
const LABELED_OFF =
  'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-300';

/** Só o coração (card e tabela) ou coração com texto (detalhe). */
type FavoriteVariant = 'icon' | 'labeled';

interface FavoriteToggleProps {
  favorite: boolean;
  pending: boolean;
  errorMessage: string | null;
  onToggle: () => void;
  variant: FavoriteVariant;
}

function FavoriteToggle({ favorite, pending, errorMessage, onToggle, variant }: FavoriteToggleProps) {
  const actionLabel = favorite ? 'Remover dos favoritos' : 'Favoritar';
  const labeled = variant === 'labeled';
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {/* Sem `disabled` enquanto grava, para o foco não sair do botão. */}
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={labeled ? undefined : actionLabel}
        title={actionLabel}
        aria-busy={pending}
        onClick={() => {
          if (!pending) onToggle();
        }}
        className={labeled ? `${LABELED_CLASS} ${favorite ? LABELED_ON : LABELED_OFF}` : `${ICON_CLASS} ${favorite ? ICON_ON : ICON_OFF}`}
      >
        <Heart size={labeled ? 14 : 16} className={favorite ? 'fill-current' : undefined} aria-hidden="true" />
        {labeled && (favorite ? 'Favorito' : 'Favoritar')}
      </button>
      {errorMessage && (
        <span role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {errorMessage}
        </span>
      )}
    </span>
  );
}

interface FavoriteButtonProps {
  notice: Pick<NoticeListItem, 'id' | 'isFavorite'>;
  variant?: FavoriteVariant;
}

export function FavoriteButton({ notice, variant = 'icon' }: FavoriteButtonProps) {
  const toggle = useToggleFavorite();
  const favorite = toggle.isPending && toggle.variables ? toggle.variables.favorite : notice.isFavorite;
  return (
    <FavoriteToggle
      favorite={favorite}
      pending={toggle.isPending}
      errorMessage={toggle.error?.message ?? null}
      onToggle={() => toggle.mutate({ noticeId: notice.id, favorite: !notice.isFavorite })}
      variant={variant}
    />
  );
}

interface ContractFavoriteButtonProps {
  contract: Pick<ContractListItem, 'id' | 'isFavorite'>;
  variant?: FavoriteVariant;
}

export function ContractFavoriteButton({ contract, variant = 'icon' }: ContractFavoriteButtonProps) {
  const toggle = useToggleContractFavorite();
  const favorite = toggle.isPending && toggle.variables ? toggle.variables.favorite : contract.isFavorite;
  return (
    <FavoriteToggle
      favorite={favorite}
      pending={toggle.isPending}
      errorMessage={toggle.error?.message ?? null}
      onToggle={() => toggle.mutate({ contractId: contract.id, favorite: !contract.isFavorite })}
      variant={variant}
    />
  );
}
