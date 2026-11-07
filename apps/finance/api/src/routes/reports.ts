import { Router, Request, Response } from 'express';
import { ACCOUNT_ACCESS_DENIED, canWriteToAccount } from '../utils/accountAccess';
import { resolveDashboardScope } from '../utils/dashboardScope';
import { formatIsoDateBr, getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError, readQueryEnumList, readQueryIdList, readQueryList, sendRequestError } from '../utils/requestInput';
import { describeFilters, generateReportPdf } from '../services/reportPdf';
import {
  EXPENSE_STATUSES,
  PAYMENT_DATE_WINDOWS,
  REPORT_ENTRY_TYPES,
  buildReport,
  type ReportInput,
} from '../services/reportService';

// Autenticação, plano ativo e acesso à tela vêm do server.ts (app.use('/api/reports', ...)).
const router = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const INVALID_FILTER = 'Filtro inválido';

/**
 * Lê e valida o pedido: período, conta (só se o solicitante tiver acesso),
 * pessoas (validadas como no Painel) e os filtros do botão de filtros.
 */
async function readReportRequest(req: Request): Promise<ReportInput> {
  const { start_date: start, end_date: end, account_id: rawAccountId } = req.query;
  if (typeof start !== 'string' || typeof end !== 'string' || !ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    throw new RequestInputError('Período inválido');
  }

  const accountId = rawAccountId === undefined ? null : Number(rawAccountId);
  if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
    throw new RequestInputError('Conta inválida');
  }
  const userId = req.user!.id;
  if (accountId !== null && !(await canWriteToAccount(accountId, userId))) {
    throw new RequestInputError(ACCOUNT_ACCESS_DENIED, 404);
  }

  const memberIds = readQueryIdList(req.query['member_id'], INVALID_FILTER);
  const scope = await resolveDashboardScope(userId, accountId, memberIds.length > 0 ? memberIds : undefined);
  if (scope === null) {
    throw new RequestInputError('Pessoa não disponível');
  }

  return {
    scope,
    accountId,
    period: { start, end },
    today: getTodayIsoInTimezone(),
    filters: {
      types: readQueryEnumList(req.query['type'], REPORT_ENTRY_TYPES, INVALID_FILTER),
      expenseStatuses: readQueryEnumList(req.query['status'], EXPENSE_STATUSES, INVALID_FILTER),
      categoryIds: readQueryIdList(req.query['category_id'], INVALID_FILTER),
      paymentMethods: readQueryList(req.query['payment_method']),
      cardIds: readQueryIdList(req.query['card_id'], INVALID_FILTER),
      paymentDates: readQueryEnumList(req.query['payment_date'], PAYMENT_DATE_WINDOWS, INVALID_FILTER),
    },
  };
}

function sendError(res: Response, error: unknown, context: string, userId: number | undefined): void {
  sendRequestError(res, error, context, userId, 'Não foi possível gerar o relatório');
}

// GET /api/reports?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD[&type=...][&status=...][&category_id=...]
//   [&payment_method=...][&card_id=...][&payment_date=...][&member_id=...][&account_id=...]
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const input = await readReportRequest(req);
    res.json({ success: true, data: await buildReport(input) });
  } catch (error) {
    sendError(res, error, 'Report error:', req.user?.id);
  }
});

// GET /api/reports/pdf — mesmos parâmetros; o PDF sai com exatamente o que a tela mostra.
router.get('/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const input = await readReportRequest(req);
    const report = await buildReport(input);
    const pdf = await generateReportPdf(report, {
      period: `${formatIsoDateBr(input.period.start)} a ${formatIsoDateBr(input.period.end)}`,
      filters: describeFilters(input.filters, report, input.scope.length),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${input.period.start}-a-${input.period.end}.pdf"`);
    res.send(pdf);
  } catch (error) {
    sendError(res, error, 'Report PDF error:', req.user?.id);
  }
});

export default router;
