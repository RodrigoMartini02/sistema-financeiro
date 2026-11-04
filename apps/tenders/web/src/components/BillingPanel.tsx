import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, XCircle } from 'lucide-react';
import { PaymentDialog } from '../../components/payments/PaymentDialog';
import { useConfirm } from '../../context/ConfirmContext';
import { Button } from '../../ui/button';
import { cancelRecurringSubscription, fetchBilling, TENDERS_PAYMENT_ENDPOINTS } from '../services/billingService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { TenderBilling, TenderSubscription } from '../types';
import { formatCents, priceNote, situationLabel, usersLabel } from '../utils/billing';
import { LoadError, LoadingBlock } from './LoadStates';

/**
 * Assinatura de Licitações da conta (só o titular): situação, valor do mês,
 * pagar (Pix, cartão ou recorrente) e cancelar o recorrente. Serve também à
 * conta vencida, porque as rotas de cobrança ficam fora da trava do módulo.
 */
export function BillingPanel({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [paying, setPaying] = useState(false);

  const billing = useQuery<TenderBilling, TendersApiError>({
    queryKey: tendersQueryKeys.billing(accountId),
    queryFn: () => fetchBilling(accountId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.billingAll });
    void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
  };

  const cancel = useMutation<TenderSubscription, TendersApiError, void>({
    mutationFn: () => cancelRecurringSubscription(accountId),
    onSuccess: refresh,
  });

  if (billing.isPending) return <LoadingBlock label="Carregando a assinatura…" />;
  if (billing.isError) {
    return <LoadError message={billing.error.message} onRetry={() => void billing.refetch()} retrying={billing.isFetching} />;
  }

  const { subscription, price } = billing.data;
  const monthly = `${formatCents(subscription.monthlyAmountCents)}/mês`;
  const canPay = subscription.accessType === 'assinatura';

  const handleCancel = async () => {
    const confirmed = await confirm({
      title: 'Cancelar a assinatura recorrente',
      message: 'O cartão deixa de ser cobrado. O acesso continua até o fim do período já pago.',
      confirmLabel: 'Cancelar assinatura',
      variant: 'danger',
    });
    if (confirmed) {
      cancel.mutate();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{situationLabel(subscription)}</p>
        {canPay && (
          <>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {usersLabel(subscription.usersCount)} · {monthly}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{priceNote(price)}</p>
          </>
        )}
        {!canPay && subscription.recurring && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            A assinatura recorrente no cartão continua ativa. Cancele para não ser mais cobrado.
          </p>
        )}
      </div>

      {(canPay || subscription.recurring) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canPay && (
            <Button type="button" icon={<CreditCard size={15} aria-hidden="true" />} onClick={() => setPaying(true)}>
              {subscription.situation === 'vencida' ? 'Assinar agora' : 'Pagar ou assinar'}
            </Button>
          )}
          {subscription.recurring && (
            <Button
              type="button"
              variant="secondary"
              icon={<XCircle size={15} aria-hidden="true" />}
              disabled={cancel.isPending}
              onClick={() => void handleCancel()}
            >
              Cancelar assinatura recorrente
            </Button>
          )}
        </div>
      )}

      {cancel.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{cancel.error.message}</p>
      )}

      {paying && (
        <PaymentDialog
          summary={{ name: 'Licitações', priceLabel: monthly }}
          endpoints={TENDERS_PAYMENT_ENDPOINTS}
          requestBody={{ accountId }}
          onClose={() => setPaying(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
