import { sql, type SQL } from 'drizzle-orm';
import type { TenderNotificationType, TrackingStatus } from '../domains';
import type { TendersDb } from './database';

// Geração de notificações pelo coletor. SQL direto (via sql do Drizzle,
// parametrizado) porque a regra "edital bate com a busca" está na função
// licitacoes.fn_edital_bate e os destinatários saem de um UNION lateral; o
// índice único (conta, usuário, tipo, edital, referência) com ON CONFLICT DO
// NOTHING impede notificação repetida. Só contas com acesso valendo recebem
// (licitacoes.fn_conta_com_acesso: cortesia, teste, período pago ou recorrente).
//
// O link é o caminho a partir do início do app do módulo (/editais/<id>); a
// tela completa com /licitacoes/app.

const MESSAGE_LENGTH = 200;
const BRASILIA_REFERENCE_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS';
const PARTICIPATE: TrackingStatus = 'PARTICIPAR';

const DEADLINE_WINDOWS: ReadonlyArray<{ type: TenderNotificationType; hours: number; title: string }> = [
  { type: 'PRAZO_3D', hours: 72, title: 'Prazo de proposta termina em até 3 dias' },
  { type: 'PRAZO_1D', hours: 24, title: 'Prazo de proposta termina em até 1 dia' },
];

/**
 * Destinatários de um edital acompanhado pela conta `a`: quem tem busca salva
 * ativa (com aviso ligado) que bate com o edital `e` e quem mexeu no
 * acompanhamento (histórico).
 */
const trackedNoticeRecipients = sql`
  SELECT b.usuario_id
    FROM licitacoes.busca_salva b
   WHERE b.conta_id = a.conta_id AND b.ativa AND b.notificar AND licitacoes.fn_edital_bate(e, b)
  UNION
  SELECT hist.usuario_id
    FROM licitacoes.acompanhamento_historico hist
   WHERE hist.conta_id = a.conta_id AND hist.edital_id = e.id AND hist.usuario_id IS NOT NULL`;

async function insertNewNoticeNotifications(db: TendersDb, noticeFilter: SQL): Promise<number> {
  const type: TenderNotificationType = 'NOVO_EDITAL';
  const result = await db.execute(sql`
    INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, edital_id, busca_salva_id)
    SELECT b.conta_id, b.usuario_id, ${type}, 'Novo edital: ' || b.nome, left(e.objeto, ${MESSAGE_LENGTH}),
           '/editais/' || e.id, e.id, b.id
      FROM licitacoes.edital e
      JOIN licitacoes.busca_salva b ON b.ativa AND b.notificar
      JOIN licitacoes.conta_habilitada h ON h.conta_id = b.conta_id AND licitacoes.fn_conta_com_acesso(h)
     WHERE ${noticeFilter}
       AND licitacoes.fn_edital_bate(e, b)
    ON CONFLICT DO NOTHING`);
  return result.rowCount ?? 0;
}

/** NOVO_EDITAL para os editais que entraram nesta coleta. Nada retroativo: só os IDs informados. */
export async function notifyNewNotices(db: TendersDb, noticeIds: number[]): Promise<number> {
  if (noticeIds.length === 0) {
    return 0;
  }
  return insertNewNoticeNotifications(db, sql`e.id = ANY (${sql.param(noticeIds)}::bigint[])`);
}

/** Reprocessamento manual: NOVO_EDITAL dos editais coletados desde a data (AAAA-MM-DD). */
export async function notifyNewNoticesCollectedSince(db: TendersDb, sinceDate: string): Promise<number> {
  return insertNewNoticeNotifications(db, sql`e.primeira_coleta_em >= ${sinceDate}::date`);
}

/** EDITAL_ALTERADO para editais atualizados que alguma conta habilitada acompanha. Referência: a data de atualização no PNCP. */
export async function notifyChangedNotices(db: TendersDb, noticeIds: number[]): Promise<number> {
  if (noticeIds.length === 0) {
    return 0;
  }
  const type: TenderNotificationType = 'EDITAL_ALTERADO';
  const result = await db.execute(sql`
    INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, edital_id, referencia)
    SELECT a.conta_id, r.usuario_id, ${type}, 'Edital acompanhado foi alterado no PNCP', left(e.objeto, ${MESSAGE_LENGTH}),
           '/editais/' || e.id, e.id,
           coalesce(to_char(e.data_atualizacao_pncp AT TIME ZONE 'America/Sao_Paulo', ${BRASILIA_REFERENCE_FORMAT}), e.hash_payload)
      FROM licitacoes.edital e
      JOIN licitacoes.acompanhamento a ON a.edital_id = e.id
      JOIN licitacoes.conta_habilitada h ON h.conta_id = a.conta_id AND licitacoes.fn_conta_com_acesso(h)
      CROSS JOIN LATERAL (${trackedNoticeRecipients}) r
     WHERE e.id = ANY (${sql.param(noticeIds)}::bigint[])
    ON CONFLICT DO NOTHING`);
  return result.rowCount ?? 0;
}

/**
 * PRAZO_3D e PRAZO_1D para acompanhamentos "Vou participar" com encerramento
 * nas próximas 72 h e 24 h. Referência: a data de encerramento, para que um
 * prazo alterado por retificação gere novo lembrete.
 */
export async function notifyUpcomingDeadlines(db: TendersDb): Promise<number> {
  let created = 0;
  for (const window of DEADLINE_WINDOWS) {
    const result = await db.execute(sql`
      INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, edital_id, referencia)
      SELECT a.conta_id, r.usuario_id, ${window.type}, ${window.title}, left(e.objeto, ${MESSAGE_LENGTH}),
             '/editais/' || e.id, e.id,
             to_char(e.data_encerramento_proposta AT TIME ZONE 'America/Sao_Paulo', ${BRASILIA_REFERENCE_FORMAT})
        FROM licitacoes.acompanhamento a
        JOIN licitacoes.edital e ON e.id = a.edital_id
        JOIN licitacoes.conta_habilitada h ON h.conta_id = a.conta_id AND licitacoes.fn_conta_com_acesso(h)
        CROSS JOIN LATERAL (${trackedNoticeRecipients}) r
       WHERE a.status = ${PARTICIPATE}
         AND e.data_encerramento_proposta > now()
         AND e.data_encerramento_proposta <= now() + make_interval(hours => ${window.hours})
      ON CONFLICT DO NOTHING`);
    created += result.rowCount ?? 0;
  }
  return created;
}
