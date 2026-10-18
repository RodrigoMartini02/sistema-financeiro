import { sql } from 'drizzle-orm';
import type { TenderNotificationType } from '../domains';
import type { TendersDb } from './database';

// Avisos de contratos (plano .plans/licitacoes-contratos-a-vencer.md, Parte B).
// SQL direto (via sql do Drizzle, parametrizado), como em notifications.ts: os
// destinatários saem de favoritos e de buscas salvas, e o índice único
// (conta, pessoa, tipo, contrato, referência) com ON CONFLICT DO NOTHING impede
// aviso repetido. A referência é o vencimento (AAAA-MM-DD): um vencimento novo
// gera os avisos de novo. Só contas com acesso valendo recebem
// (licitacoes.fn_conta_com_acesso).
//
// O link é o caminho a partir do início do app do módulo (/contratos/<id>).

const MESSAGE_LENGTH = 200;
const EXPIRY_REFERENCE_FORMAT = 'YYYY-MM-DD';
const EXPIRY_TITLE_FORMAT = 'DD/MM/YYYY';

interface DayRange {
  /** Dias depois de hoje (Brasília), inclusive. */
  from: number;
  to: number;
}

/**
 * Janelas dos avisos de vencimento. Nas buscas salvas, só os contratos que
 * entraram na janela nos últimos 7 dias (sem aviso retroativo em massa ao
 * criar a busca); nos favoritos, a janela inteira, com um aviso só por janela.
 */
const EXPIRY_WINDOWS: ReadonlyArray<{
  type: TenderNotificationType;
  savedSearch: DayRange;
  favorite: DayRange;
  savedSearchTitle: string;
  favoriteTitle: string;
}> = [
  {
    type: 'CONTRATO_VENCE_90D',
    savedSearch: { from: 84, to: 90 },
    favorite: { from: 31, to: 90 },
    savedSearchTitle: 'Contrato vence em até 90 dias: ',
    favoriteTitle: 'Contrato favorito vence em até 90 dias',
  },
  {
    type: 'CONTRATO_VENCE_30D',
    savedSearch: { from: 24, to: 30 },
    favorite: { from: 0, to: 30 },
    savedSearchTitle: 'Contrato vence em até 30 dias: ',
    favoriteTitle: 'Contrato favorito vence em até 30 dias',
  },
];

function expiryBetween(today: string, range: DayRange) {
  return sql`c.vencimento BETWEEN ${today}::date + ${range.from}::int AND ${today}::date + ${range.to}::int`;
}

/**
 * CONTRATO_ALTERADO para quem favoritou, quando o vencimento muda. Referência:
 * o vencimento novo. Contrato que ficou sem vencimento não gera aviso: o título
 * e a referência são a data.
 */
export async function notifyChangedContractExpiry(db: TendersDb, controlNumbers: string[]): Promise<number> {
  if (controlNumbers.length === 0) {
    return 0;
  }
  const type: TenderNotificationType = 'CONTRATO_ALTERADO';
  const result = await db.execute(sql`
    INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, contrato_id, referencia)
    SELECT f.conta_id, f.usuario_id, ${type},
           'Vencimento de contrato favorito mudou para ' || to_char(c.vencimento, ${EXPIRY_TITLE_FORMAT}),
           left(c.objeto, ${MESSAGE_LENGTH}), '/contratos/' || c.id, c.id, to_char(c.vencimento, ${EXPIRY_REFERENCE_FORMAT})
      FROM licitacoes.contrato c
      JOIN licitacoes.favorito_contrato f ON f.contrato_id = c.id
      JOIN licitacoes.conta_habilitada h ON h.conta_id = f.conta_id AND licitacoes.fn_conta_com_acesso(h)
     WHERE c.numero_controle_pncp = ANY (${sql.param(controlNumbers)}::text[])
       AND c.vencimento IS NOT NULL
    ON CONFLICT DO NOTHING`);
  return result.rowCount ?? 0;
}

/**
 * CONTRATO_VENCE_90D e CONTRATO_VENCE_30D do dia `today` (AAAA-MM-DD, Brasília):
 * primeiro os favoritos, depois as buscas salvas ativas com Notificar. Um
 * contrato que já recebeu o aviso pelo favorito não recebe de novo pela busca.
 * Nas buscas, a consulta de texto é calculada uma vez por busca (CTE
 * materializada), e quem decide se o contrato bate é
 * licitacoes.fn_contrato_atende_criterios, a mesma regra da tela.
 */
export async function notifyContractExpirations(db: TendersDb, today: string): Promise<number> {
  let created = 0;
  for (const window of EXPIRY_WINDOWS) {
    const favorites = await db.execute(sql`
      INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, contrato_id, referencia)
      SELECT f.conta_id, f.usuario_id, ${window.type}, ${window.favoriteTitle}, left(c.objeto, ${MESSAGE_LENGTH}),
             '/contratos/' || c.id, c.id, to_char(c.vencimento, ${EXPIRY_REFERENCE_FORMAT})
        FROM licitacoes.favorito_contrato f
        JOIN licitacoes.contrato c ON c.id = f.contrato_id
        JOIN licitacoes.conta_habilitada h ON h.conta_id = f.conta_id AND licitacoes.fn_conta_com_acesso(h)
       WHERE ${expiryBetween(today, window.favorite)}
      ON CONFLICT DO NOTHING`);
    created += favorites.rowCount ?? 0;

    const savedSearches = await db.execute(sql`
      WITH buscas AS MATERIALIZED (
        SELECT b.conta_id, b.usuario_id, b.nome, b.ufs, b.municipios_ibge::text[] AS municipios,
               b.orgaos_cnpj::text[] AS orgaos, b.categorias, b.fornecedores_cnpj::text[] AS fornecedores,
               b.valor_min, b.valor_max, b.incluir_sem_valor,
               licitacoes.fn_tsquery_termos(b.termos, b.modo_termos) AS consulta,
               licitacoes.fn_tsquery_termos(b.termos_exclusao, 'OU') AS exclusao
          FROM licitacoes.busca_salva_contrato b
          JOIN licitacoes.conta_habilitada h ON h.conta_id = b.conta_id AND licitacoes.fn_conta_com_acesso(h)
         WHERE b.ativa AND b.notificar)
      INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, contrato_id, referencia)
      SELECT bs.conta_id, bs.usuario_id, ${window.type}, ${window.savedSearchTitle} || bs.nome, left(c.objeto, ${MESSAGE_LENGTH}),
             '/contratos/' || c.id, c.id, to_char(c.vencimento, ${EXPIRY_REFERENCE_FORMAT})
        FROM buscas bs
        JOIN licitacoes.contrato c
          ON ${expiryBetween(today, window.savedSearch)}
         AND licitacoes.fn_contrato_atende_criterios(
               c, bs.consulta, bs.exclusao, bs.ufs, bs.municipios, bs.orgaos, bs.categorias, bs.fornecedores,
               bs.valor_min, bs.valor_max, bs.incluir_sem_valor)
      ON CONFLICT DO NOTHING`);
    created += savedSearches.rowCount ?? 0;
  }
  return created;
}
