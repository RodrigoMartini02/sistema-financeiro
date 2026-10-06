import { Crown } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface PremiumUpsellProps {
  description: string;
  /** Abre a assinatura; sem ele, o aviso aparece sem botão. */
  onSubscribe?: () => void;
}

/** Recurso do Premium aberto no Starter: explica e leva para a assinatura. */
export function PremiumUpsell({ description, onSubscribe }: PremiumUpsellProps) {
  return (
    <EmptyState
      icon={Crown}
      title="Disponível no Premium"
      description={description}
      action={onSubscribe && (
        <button
          type="button"
          onClick={onSubscribe}
          className="inline-flex h-8 items-center justify-center rounded-full bg-brand-600 px-4 text-[12.5px] font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Ver planos
        </button>
      )}
    />
  );
}
