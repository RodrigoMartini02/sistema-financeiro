import { Router, type Request, type RequestHandler } from 'express';
import { body, query } from 'express-validator';
import { and, eq, sql } from 'drizzle-orm';
import { accounts, users } from '../db/identity';
import { validate } from '../middleware/validation';
import {
  cancelRecurring,
  chargeCard,
  createCheckoutLink,
  createPixCharge,
  createRecurring,
  getPayment,
  getRecurring,
} from '../services/mercadoPagoCharges';
import { RequestInputError } from '../utils/requestInput';
import { readBillingUrls } from '../config/billing';
import type { TendersDb } from '../collector/database';
import { isAccountMember, type TenderAccount, type TenderRequester } from '../services/access';
import { describePayment, listBillingEvents, recordRefusedPayment } from '../services/billingHistory';
import {
  buildTendersPaymentReference,
  centsToAmount,
  monthlyAmountCents,
  parseTendersPaymentReference,
  TENDERS_PRICE,
} from '../services/billing';
import {
  applyOneTimePayment,
  applyRecurringCharge,
  clearRecurring,
  countModuleUsers,
  readModuleRow,
  readSubscription,
  setRecurring,
} from '../services/subscription';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';

// Cobrança do módulo (plano .plans/licitacoes-produto.md). Fica fora da trava
// do módulo: a conta pode estar vencida (pagar). Só o titular, e só em conta dele.

const TITULAR_ONLY = 'Só o titular da conta cuida da assinatura de Licitações.';
const ACCOUNT_NOT_FOUND = 'Conta não encontrada';
const COURTESY_ACCOUNT = 'Esta conta usa Licitações como cortesia: não há cobrança.';
const ACCOUNT_ID_MESSAGE = 'Informe a conta';

function requesterOf(req: Request): TenderRequester {
  return req.tendersUser!;
}

interface BillingAccount {
  account: TenderAccount;
  recurringId: string | null;
}

/** Conta do titular com o módulo (em qualquer situação); cortesia não paga. */
async function resolveBillingAccount(
  db: TendersDb,
  requester: TenderRequester,
  accountId: number,
  options: { allowCourtesy: boolean },
): Promise<BillingAccount> {
  if (requester.type === 'membro' || (await isAccountMember(db, requester.id))) {
    throw new RequestInputError(TITULAR_ONLY, 403);
  }

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, requester.id), sql`coalesce(${accounts.active}, true)`))
    .limit(1);
  const row = account ? await readModuleRow(db, account.id) : null;
  if (!account || !row || !row.active) {
    throw new RequestInputError(ACCOUNT_NOT_FOUND, 404);
  }
  if (!options.allowCourtesy && row.accessType === 'cortesia') {
    throw new RequestInputError(COURTESY_ACCOUNT, 409);
  }
  return { account, recurringId: row.recurringId };
}

async function readPayerEmail(db: TendersDb, userId: number): Promise<string> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new RequestInputError('Usuário não encontrado', 404);
  }
  return user.email;
}

/** Valor do mês (em reais e em centavos) e a descrição da cobrança, pela quantidade atual de usuários. */
async function currentCharge(
  db: TendersDb,
  accountId: number,
): Promise<{ amount: number; amountCents: number; description: string; usersCount: number }> {
  const usersCount = await countModuleUsers(db, accountId);
  const label = usersCount === 1 ? '1 usuário' : `${usersCount} usuários`;
  const amountCents = monthlyAmountCents(usersCount);
  return {
    amount: centsToAmount(amountCents),
    amountCents,
    description: `Licitações - assinatura mensal (${label})`,
    usersCount,
  };
}

const accountIdQuery = [query('accountId').isInt({ min: 1 }).withMessage(ACCOUNT_ID_MESSAGE), validate];
const accountIdBody = [body('accountId').isInt({ min: 1 }).withMessage(ACCOUNT_ID_MESSAGE)];
const cardTokenBody = [body('card_token').isString().notEmpty().withMessage('Dados do cartão incompletos')];

/** /api/tenders/billing: situação da assinatura e os pagamentos do titular. */
export function billingRoutes(deps: TendersApiDeps): Router {
  const router = Router();

  // GET /api/tenders/billing/config: chave pública do Mercado Pago da plataforma, para o formulário de cartão.
  // Só com login (o servidor monta o roteador depois do authenticate); sem chave, o cartão fica indisponível.
  router.get('/config', (_req, res) => {
    res.json({ success: true, public_key: process.env['MP_PUBLIC_KEY'] ?? null });
  });

  router.get(
    '/',
    accountIdQuery,
    tenderRoute('Tender billing read failed:', 'Não foi possível carregar a assinatura agora.', async (req, res) => {
      const { account } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.query['accountId']), { allowCourtesy: true });
      const subscription = await readSubscription(deps.db, account.id, deps.now());
      res.json({ success: true, data: { account, subscription, price: TENDERS_PRICE } });
    }),
  );

  // GET /api/tenders/billing/history?accountId=: os eventos de cobrança e de cancelamento da conta, do mais recente
  // para o mais antigo (até 200). Só o titular, em conta dele; em cortesia a lista pode vir vazia.
  router.get(
    '/history',
    accountIdQuery,
    tenderRoute('Tender billing history failed:', 'Não foi possível carregar o histórico de cobrança agora.', async (req, res) => {
      const { account } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.query['accountId']), { allowCourtesy: true });
      res.json({ success: true, data: { events: await listBillingEvents(deps.db, account.id) } });
    }),
  );

  router.post(
    '/pix',
    [...accountIdBody, validate],
    tenderRoute('Tender billing pix failed:', 'Não foi possível gerar o Pix agora.', async (req, res) => {
      const { account } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.body.accountId), { allowCourtesy: false });
      const urls = readBillingUrls(process.env);
      const charge = await currentCharge(deps.db, account.id);
      const pix = await createPixCharge({
        amount: charge.amount,
        description: charge.description,
        reference: buildTendersPaymentReference(account.id),
        notificationUrl: urls.notificationUrl,
        payerEmail: await readPayerEmail(deps.db, requesterOf(req).id),
      });
      res.json({ success: true, data: { payment_id: pix.paymentId, qr_code: pix.qrCode, qr_code_base64: pix.qrCodeBase64 } });
    }),
  );

  router.post(
    '/card',
    [...accountIdBody, ...cardTokenBody, validate],
    tenderRoute('Tender billing card failed:', 'Não foi possível processar o pagamento agora.', async (req, res) => {
      const { account } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.body.accountId), { allowCourtesy: false });
      const urls = readBillingUrls(process.env);
      const charge = await currentCharge(deps.db, account.id);
      const cpf = typeof req.body.cpf === 'string' && req.body.cpf.trim() ? req.body.cpf : null;
      const payment = await chargeCard({
        amount: charge.amount,
        description: charge.description,
        reference: buildTendersPaymentReference(account.id),
        notificationUrl: urls.notificationUrl,
        payerEmail: await readPayerEmail(deps.db, requesterOf(req).id),
        cardToken: String(req.body.card_token),
        cpf,
      });

      const details = { amountCents: charge.amountCents, method: 'CARTAO' as const };
      if (payment.status === 'approved' && payment.id !== undefined) {
        await applyOneTimePayment(deps.db, account.id, String(payment.id), deps.now(), details);
        res.json({ success: true, message: 'Pagamento aprovado.' });
        return;
      }
      if (payment.status === 'in_process' || payment.status === 'pending') {
        res.json({ success: false, message: 'Pagamento em análise. A assinatura é liberada quando ele for aprovado.' });
        return;
      }
      if (payment.status === 'rejected') {
        await recordRefusedPayment(deps.db, {
          accountId: account.id,
          paymentId: payment.id === undefined ? undefined : String(payment.id),
          details,
          detail: payment.statusDetail,
          now: deps.now(),
        });
      }
      res.json({ success: false, message: `Pagamento recusado (${payment.statusDetail ?? payment.status}). Confira os dados do cartão.` });
    }),
  );

  router.post(
    '/checkout',
    [...accountIdBody, validate],
    tenderRoute('Tender billing checkout failed:', 'Não foi possível gerar o link de pagamento agora.', async (req, res) => {
      const { account } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.body.accountId), { allowCourtesy: false });
      const urls = readBillingUrls(process.env);
      const charge = await currentCharge(deps.db, account.id);
      const formaPagamento = req.body.forma_pagamento;
      const paymentUrl = await createCheckoutLink({
        itemId: 'licitacoes',
        amount: charge.amount,
        description: charge.description,
        reference: buildTendersPaymentReference(account.id),
        notificationUrl: urls.notificationUrl,
        backUrl: urls.returnUrl,
        paymentType: formaPagamento === 'cartao' || formaPagamento === 'debito' ? formaPagamento : null,
      });
      res.json({ success: true, data: { payment_url: paymentUrl } });
    }),
  );

  router.post(
    '/recurring',
    [...accountIdBody, ...cardTokenBody, validate],
    tenderRoute('Tender billing recurring failed:', 'Não foi possível criar a assinatura agora.', async (req, res) => {
      const { account, recurringId } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.body.accountId), { allowCourtesy: false });
      const urls = readBillingUrls(process.env);
      if (recurringId) {
        try {
          await cancelRecurring(recurringId);
        } catch (error) {
          console.warn('Tender previous recurring cancel failed:', { accountId: account.id, error: (error as Error).message });
        }
      }

      const charge = await currentCharge(deps.db, account.id);
      const recurring = await createRecurring({
        amount: charge.amount,
        description: charge.description,
        reference: buildTendersPaymentReference(account.id),
        notificationUrl: urls.notificationUrl,
        payerEmail: await readPayerEmail(deps.db, requesterOf(req).id),
        cardToken: String(req.body.card_token),
        backUrl: urls.returnUrl,
      });

      if (recurring.status === 'authorized' && recurring.id) {
        await setRecurring(deps.db, account.id, recurring.id, charge.usersCount, deps.now(), charge.amountCents);
        res.json({ success: true, message: 'Assinatura recorrente ativa.' });
        return;
      }
      res.json({ success: false, message: `Assinatura não autorizada (${recurring.status}).` });
    }),
  );

  // POST /api/tenders/billing/cancel: para a assinatura recorrente; o acesso vai até o fim do teste ou do período pago.
  // Vale também em cortesia: a cortesia dada depois não cancela o recorrente no Mercado Pago.
  router.post(
    '/cancel',
    [...accountIdBody, validate],
    tenderRoute('Tender billing cancel failed:', 'Não foi possível cancelar a assinatura agora.', async (req, res) => {
      const { account, recurringId } = await resolveBillingAccount(deps.db, requesterOf(req), Number(req.body.accountId), { allowCourtesy: true });
      if (recurringId) {
        await cancelRecurring(recurringId);
        await clearRecurring(deps.db, account.id, recurringId, deps.now(), 'TITULAR');
      }
      res.json({ success: true, data: await readSubscription(deps.db, account.id, deps.now()) });
    }),
  );

  return router;
}

/**
 * POST /api/tenders/billing/webhook — aviso do Mercado Pago (público). O
 * pagamento e a assinatura são buscados no Mercado Pago pelo id; só vale a
 * referência `lic:<conta>` (a do FINGERENCE é tratada em /api/plans/webhook).
 */
export function createBillingWebhook(deps: TendersApiDeps): RequestHandler {
  return async (req, res) => {
    res.sendStatus(200);

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const action = payload['action'];
    const data = payload['data'] as Record<string, unknown> | undefined;
    const eventType = payload['type'] ?? req.query['type'];
    const resourceId = data?.['id'] ?? req.query['data.id'];
    if (resourceId === undefined || resourceId === null || resourceId === '') {
      return;
    }

    try {
      const isPaymentEvent = eventType === 'payment' || eventType === 'subscription_authorized_payment'
        || action === 'payment.created' || action === 'payment.updated';
      if (isPaymentEvent) {
        const payment = await getPayment(String(resourceId));
        const accountId = parseTendersPaymentReference(payment.externalReference);
        if (accountId === null || payment.id === undefined) {
          return;
        }
        const details = describePayment(payment);
        if (payment.status === 'approved') {
          const applied = payment.recurringId
            ? await applyRecurringCharge(deps.db, accountId, payment.recurringId, String(payment.id), deps.now(), details.amountCents)
            : await applyOneTimePayment(deps.db, accountId, String(payment.id), deps.now(), details);
          if (applied) {
            console.log(`[Tenders webhook] Payment ${payment.id} applied to account ${accountId}`);
          }
        } else if (payment.status === 'rejected') {
          await recordRefusedPayment(deps.db, {
            accountId,
            paymentId: String(payment.id),
            details,
            detail: payment.statusDetail,
            now: deps.now(),
          });
          if (payment.recurringId) {
            await clearRecurring(deps.db, accountId, payment.recurringId, deps.now(), 'COBRANCA_RECUSADA');
            console.warn(`[Tenders webhook] Recurring charge rejected for account ${accountId}: ${payment.statusDetail}`);
          }
        }
        return;
      }

      if (eventType === 'subscription_preapproval' || action === 'subscription_preapproval.updated') {
        const recurring = await getRecurring(String(resourceId));
        const accountId = parseTendersPaymentReference(recurring.externalReference);
        if (accountId === null || !recurring.id) {
          return;
        }
        if (recurring.status === 'cancelled' || recurring.status === 'paused') {
          const cleared = await clearRecurring(deps.db, accountId, recurring.id, deps.now(), 'MERCADO_PAGO');
          if (cleared) {
            console.log(`[Tenders webhook] Recurring ${recurring.id} ${recurring.status} for account ${accountId}`);
          }
        }
      }
    } catch (error) {
      console.error('[Tenders webhook] Error processing event:', (error as Error).message);
    }
  };
}
