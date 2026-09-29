import { Router, Request, Response } from 'express';
import { ACCOUNT_ACCESS_DENIED, canWriteToAccount } from '../utils/accountAccess';
import { resolveDashboardScope } from '../utils/dashboardScope';
import { formatIsoDateBr, getTodayIsoInTimezone } from '../utils/date';
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

class ReportRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Parâmetro repetível (`?type=a&type=b`) como lista; ausente vira lista vazia. */
function readList(value: unknown): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String).filter((item) => item.length > 0);
}

function readEnumList<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const items = readList(value);
  if (!items.every((item) => (allowed as readonly string[]).includes(item))) {
    throw new ReportRequestError('Filtro inválido');
  }
  return items as T[];
}

function readIdList(value: unknown): number[] {
  const ids = readList(value).map(Number);
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new ReportRequestError('Filtro inválido');
  }
  return ids;
}

/**
 * Lê e valida o pedido: período, conta (só se o solicitante tiver acesso),
 * pessoas (validadas como no Painel) e os filtros do botão de filtros.
 */
async function readReportRequest(req: Request): Promise<ReportInput> {
  const { start_date: start, end_date: end, account_id: rawAccountId } = req.query;
  if (typeof start !== 'string' || typeof end !== 'string' || !ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    throw new ReportRequestError('Período inválido');
  }

  const accountId = rawAccountId === undefined ? null : Number(rawAccountId);
  if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
    throw new ReportRequestError('Conta inválida');
  }
  const userId = req.user!.id;
  if (accountId !== null && !(await canWriteToAccount(accountId, userId))) {
    throw new ReportRequestError(ACCOUNT_ACCESS_DENIED, 404);
  }

  const memberIds = readIdList(req.query['member_id']);
  const scope = await resolveDashboardScope(userId, accountId, memberIds.length > 0 ? memberIds : undefined);
  if (scope === null) {
    throw new ReportRequestError('Pessoa não disponível');
  }

  return {
    scope,
    accountId,
    period: { start, end },
    today: getTodayIsoInTimezone(),
    filters: {
      types: readEnumList(req.query['type'], REPORT_ENTRY_TYPES),
      expenseStatuses: readEnumList(req.query['status'], EXPENSE_STATUSES),
      categoryIds: readIdList(req.query['category_id']),
      paymentMethods: readList(req.query['payment_method']),
      cardIds: readIdList(req.query['card_id']),
      paymentDates: readEnumList(req.query['payment_date'], PAYMENT_DATE_WINDOWS),
    },
  };
}

function sendError(res: Response, error: unknown, context: string, userId: number | undefined): void {
  if (error instanceof ReportRequestError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  console.error(context, { userId, error });
  res.status(500).json({ success: false, message: 'Não foi possível gerar o relatório' });
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
