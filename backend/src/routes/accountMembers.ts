import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { and, eq, isNotNull, ne, or } from 'drizzle-orm';
import { body } from 'express-validator';
import { db, pool } from '../db/client';
import { users, accounts, accountMembers, expenses, memberPermissions } from '../db/schema';
import { authenticate, requireTitular } from '../middleware/auth';
import { validate, validateDocument } from '../middleware/validation';
import { resolveMemberAccountId, hasScreenAccess, type PermissionFlag } from '../middleware/permissions';

const router = Router();

// Resolve a Conta Padrão do gestor autenticado (mesma noção usada em todo o
// backend: a conta com eh_padrao=true é a que nasceu no cadastro externo).
/**
 * Conta onde os membros/colaboradores vivem. Vale para os dois tipos de
 * conta: em conta pessoal sao "membros da familia" com carteira
 * compartilhada (ver familyVisibility.ts); em conta empresa sao
 * "colaboradores", que permanecem isolados entre si — o tipo so muda a
 * visibilidade dos lancamentos, nunca a possibilidade do vinculo em si.
 */
async function resolveGestorAccountId(gestorId: number): Promise<number | null> {
  const [account] = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.userId, gestorId), eq(accounts.isDefault, true)))
    .limit(1);
  return account?.id ?? null;
}

/**
 * Resolve qual conta usar para as rotas de membros: a informada pelo client
 * (validando que pertence ao gestor autenticado — nunca confiar nela sem essa
 * checagem), ou a Conta Padrão quando nenhuma é informada, para não quebrar
 * quem já chamava essas rotas sem conta_id.
 */
async function resolveAccountIdForGestor(gestorId: number, contaIdParam: string | undefined): Promise<number | null> {
  if (!contaIdParam) return resolveGestorAccountId(gestorId);

  const contaId = parseInt(contaIdParam);
  if (!Number.isInteger(contaId) || contaId <= 0) return null;

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, contaId), eq(accounts.userId, gestorId)))
    .limit(1);
  return account?.id ?? null;
}

// GET /api/account-members — lista os membros vinculados à conta.
//
// Gestor: vê a conta que escolher (conta_id opcional, valida propriedade) ou
// a Conta Padrão. Aceita conta_id opcional para escolher uma conta específica
// (entre as várias que o gestor pode ter); sem ele, usa a Conta Padrão.
//
// Membro: conta_id é ignorado — a conta é sempre a que ele está vinculado
// (nunca aceita do client, para não vazar outra conta). Sem accessMembers,
// só recebe a si mesmo na lista; com accessMembers, recebe a lista completa,
// igual ao gestor veria.
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberAccountId = await resolveMemberAccountId(req.user!.id);
    const isMember = memberAccountId !== null;

    let accountId: number | null;
    if (isMember) {
      accountId = memberAccountId;
    } else {
      const { conta_id } = req.query as Record<string, string | undefined>;
      accountId = await resolveAccountIdForGestor(req.user!.id, conta_id);
    }

    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const podeVerTodos = !isMember || (await hasScreenAccess(req.user!.id, 'accessMembers'));

    const result = podeVerTodos
      ? await pool.query(
          `SELECT m.id AS membro_id, m.status AS membro_status, m.data_criacao AS vinculado_em,
                  u.id AS usuario_id, u.nome, u.email, u.documento, u.status AS usuario_status,
                  u.telefone, u.data_nascimento, u.pais, u.estado, u.cidade
           FROM conta_membros m
           JOIN usuarios u ON u.id = m.usuario_id
           WHERE m.conta_id = $1
           ORDER BY u.nome ASC`,
          [accountId],
        )
      : await pool.query(
          `SELECT m.id AS membro_id, m.status AS membro_status, m.data_criacao AS vinculado_em,
                  u.id AS usuario_id, u.nome, u.email, u.documento, u.status AS usuario_status,
                  u.telefone, u.data_nascimento, u.pais, u.estado, u.cidade
           FROM conta_membros m
           JOIN usuarios u ON u.id = m.usuario_id
           WHERE m.conta_id = $1 AND m.usuario_id = $2
           ORDER BY u.nome ASC`,
          [accountId, req.user!.id],
        );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List account members error:', error);
    res.status(500).json({ success: false, message: 'Failed to list account members' });
  }
});

// POST /api/account-members — gestor cria um membro vinculado à própria conta
router.post(
  '/',
  authenticate,
  requireTitular,
  [
    body('nome').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('senha').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nome, email, senha, documento, conta_id } = req.body as Record<string, string | undefined>;

      const accountId = await resolveAccountIdForGestor(req.user!.id, conta_id);
      if (!accountId) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      const normalizedEmail = email!.toLowerCase();
      const [emailExists] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (emailExists) {
        res.status(400).json({ success: false, message: 'Email already registered' });
        return;
      }

      let cleanDoc: string | null = null;
      if (documento?.trim()) {
        cleanDoc = documento.replace(/[^\d]+/g, '');
        if (!validateDocument(cleanDoc)) {
          res.status(400).json({ success: false, message: 'Invalid CPF/CNPJ' });
          return;
        }
        const [docExists] = await db.select({ id: users.id }).from(users).where(eq(users.document, cleanDoc)).limit(1);
        if (docExists) {
          res.status(400).json({ success: false, message: 'Document already registered' });
          return;
        }
      }

      const hashedPassword = await bcrypt.hash(senha!, 10);

      const created = await db.transaction(async (transaction) => {
        const [member] = await transaction
          .insert(users)
          .values({
            name: nome!,
            email: normalizedEmail,
            document: cleanDoc,
            password: hashedPassword,
            type: 'membro',
            status: 'ativo',
          })
          .returning({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status });

        await transaction.insert(accountMembers).values({
          accountId,
          userId: member!.id,
          status: 'ativo',
        });

        // Toda permissão nasce restritiva (false) — o gestor libera
        // explicitamente pela tela de permissões (Fase 3).
        await transaction.insert(memberPermissions).values({ userId: member!.id });

        // Categorias sao da conta, nao do usuario: o membro usa as mesmas do
        // gestor. Antes o sistema copiava cada uma para o novo usuario, o que
        // com a carteira compartilhada geraria duas categorias de mesmo nome
        // no mesmo relatorio.

        return member;
      });

      res.status(201).json({
        success: true,
        message: 'Member created successfully',
        data: { id: created!.id, nome: created!.name, email: created!.email, documento: created!.document, tipo: created!.type, status: created!.status },
      });
    } catch (error) {
      console.error('Create account member error:', error);
      res.status(500).json({ success: false, message: 'Failed to create member' });
    }
  },
);

// GET /api/account-members/:id/pending — pendências (parcelas futuras +
// recorrências ativas) do membro que precisam de destino antes da desativação
router.get('/:id/pending', authenticate, requireTitular, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const { conta_id } = req.query as Record<string, string | undefined>;
    const accountId = await resolveAccountIdForGestor(req.user!.id, conta_id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const pending = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        installmentGroupId: expenses.installmentGroupId,
        recurring: expenses.recurring,
        finalAmount: expenses.originalAmount,
        dueDate: expenses.dueDate,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, memberUserId),
          eq(expenses.paid, false),
          or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
        ),
      );

    res.json({ success: true, data: pending });
  } catch (error) {
    console.error('List pending expenses error:', error);
    res.status(500).json({ success: false, message: 'Failed to list pending expenses' });
  }
});

// PUT /api/account-members/:id/deactivate — desativa o membro, transferindo
// antes as pendências (parcelas futuras + recorrências) para outro usuário
// da mesma conta. Operação atômica: tudo ou nada.
router.put(
  '/:id/deactivate',
  authenticate,
  requireTitular,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const memberUserId = parseInt(req.params['id']!);
      const { transferir_para: rawTransferTo, conta_id: contaId } = req.body as Record<string, unknown>;

      const accountId = await resolveAccountIdForGestor(req.user!.id, contaId != null ? String(contaId) : undefined);
      if (!accountId) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      const [membership] = await db
        .select({ id: accountMembers.id })
        .from(accountMembers)
        .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId), eq(accountMembers.status, 'ativo')))
        .limit(1);

      if (!membership) {
        res.status(404).json({ success: false, message: 'Active member not found in this account' });
        return;
      }

      const pending = await db
        .select({
          id: expenses.id,
          description: expenses.description,
          installmentGroupId: expenses.installmentGroupId,
          recurring: expenses.recurring,
          finalAmount: expenses.originalAmount,
          dueDate: expenses.dueDate,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, memberUserId),
            eq(expenses.paid, false),
            or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
          ),
        );

      // Sem pendências, a desativação não exige destino de transferência.
      if (pending.length === 0) {
        await db.transaction(async (transaction) => {
          await transaction.update(accountMembers).set({ status: 'inativo' }).where(eq(accountMembers.id, membership.id));
          await transaction.update(users).set({ status: 'inativo', updatedAt: new Date() }).where(eq(users.id, memberUserId));
        });

        res.json({ success: true, message: 'Member deactivated successfully', data: { pendencias_transferidas: 0 } });
        return;
      }

      if (rawTransferTo === undefined || rawTransferTo === null || rawTransferTo === '') {
        res.status(400).json({
          success: false,
          message: 'This member has pending expenses. Choose a transfer target before deactivating.',
          code: 'PENDING_EXPENSES',
          data: pending,
        });
        return;
      }

      const transferToUserId = parseInt(String(rawTransferTo));
      if (isNaN(transferToUserId)) {
        res.status(400).json({ success: false, message: 'Invalid transfer target' });
        return;
      }

      if (transferToUserId === memberUserId) {
        res.status(400).json({ success: false, message: 'Cannot transfer pending expenses to the member being deactivated' });
        return;
      }

      // Destino precisa ser o próprio gestor ou outro membro ativo da mesma conta.
      const isGestorTarget = transferToUserId === req.user!.id;
      let isMemberTarget = false;
      if (!isGestorTarget) {
        const [targetMembership] = await db
          .select({ id: accountMembers.id })
          .from(accountMembers)
          .where(and(eq(accountMembers.userId, transferToUserId), eq(accountMembers.accountId, accountId), eq(accountMembers.status, 'ativo')))
          .limit(1);
        isMemberTarget = !!targetMembership;
      }

      if (!isGestorTarget && !isMemberTarget) {
        res.status(400).json({ success: false, message: 'Transfer target must be the account manager or an active member of the same account' });
        return;
      }

      await db.transaction(async (transaction) => {
        if (pending.length > 0) {
          await transaction
            .update(expenses)
            .set({ userId: transferToUserId })
            .where(
              and(
                eq(expenses.userId, memberUserId),
                eq(expenses.paid, false),
                or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
              ),
            );
        }

        await transaction.update(accountMembers).set({ status: 'inativo' }).where(eq(accountMembers.id, membership.id));
        await transaction.update(users).set({ status: 'inativo', updatedAt: new Date() }).where(eq(users.id, memberUserId));
      });

      res.json({ success: true, message: 'Member deactivated successfully', data: { pendencias_transferidas: pending.length } });
    } catch (error) {
      console.error('Deactivate account member error:', error);
      res.status(500).json({ success: false, message: 'Failed to deactivate member' });
    }
  },
);

// PUT /api/account-members/:id — gestor edita nome/foto/senha de um membro
// vinculado à própria conta. Poder administrativo: nunca exige a senha
// atual do membro, diferente de PUT /usuarios/me (o próprio usuário
// trocando a própria senha).
router.put(
  '/:id',
  authenticate,
  requireTitular,
  [
    body('nome').notEmpty().withMessage('Name is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const memberUserId = parseInt(req.params['id']!);
      const {
        nome, foto, nova_senha: novaSenha, conta_id: contaId,
        email, documento, telefone, data_nascimento: dataNascimento,
        pais, estado, cidade,
      } = req.body as Record<string, string | undefined>;

      const accountId = await resolveAccountIdForGestor(req.user!.id, contaId != null ? String(contaId) : undefined);
      if (!accountId) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      const [membership] = await db
        .select({ id: accountMembers.id })
        .from(accountMembers)
        .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
        .limit(1);

      if (!membership) {
        res.status(404).json({ success: false, message: 'Member not found in this account' });
        return;
      }

      const [current] = await db
        .select({ email: users.email, document: users.document })
        .from(users)
        .where(eq(users.id, memberUserId))
        .limit(1);

      if (!current) {
        res.status(404).json({ success: false, message: 'Member not found' });
        return;
      }

      const updateData: Partial<typeof users.$inferInsert> = {
        name: String(nome).trim(),
        updatedAt: new Date(),
      };
      if (foto !== undefined) updateData.photo = foto as string | null;
      if (telefone !== undefined) updateData.telefone = telefone || null;
      if (dataNascimento !== undefined) updateData.dataNascimento = dataNascimento || null;
      if (pais !== undefined) updateData.country = pais || null;
      if (estado !== undefined) updateData.state = estado || null;
      if (cidade !== undefined) updateData.city = cidade || null;

      if (email) {
        const newEmail = email.toLowerCase();
        if (newEmail !== current.email) {
          const [emailInUse] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, newEmail), ne(users.id, memberUserId)))
            .limit(1);

          if (emailInUse) {
            res.status(400).json({ success: false, message: 'Email already in use' });
            return;
          }
        }
        updateData.email = newEmail;
      }

      if (documento) {
        const cleanDoc = documento.replace(/[^\d]+/g, '');

        if (!validateDocument(cleanDoc)) {
          res.status(400).json({ success: false, message: 'Invalid CPF/CNPJ' });
          return;
        }

        if (cleanDoc !== current.document) {
          const [documentInUse] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.document, cleanDoc), ne(users.id, memberUserId)))
            .limit(1);

          if (documentInUse) {
            res.status(400).json({ success: false, message: 'Document already in use' });
            return;
          }
        }

        updateData.document = cleanDoc;
      }

      if (novaSenha) {
        if (novaSenha.length < 8) {
          res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
          return;
        }
        updateData.password = await bcrypt.hash(novaSenha, 10);
      }

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, memberUserId))
        .returning({
          id: users.id, nome: users.name, foto: users.photo, email: users.email, documento: users.document,
          telefone: users.telefone, data_nascimento: users.dataNascimento,
          pais: users.country, estado: users.state, cidade: users.city,
        });

      res.json({ success: true, message: 'Member updated successfully', data: updated });
    } catch (error) {
      console.error('Update account member error:', error);
      res.status(500).json({ success: false, message: 'Failed to update member' });
    }
  },
);

// GET /api/account-members/summary — visão agregada da conta (soma de
// despesas/receitas de todos os autores vinculados, gestor incluído).
// Gestor sempre acessa; membro só se tiver acesso_relatorios liberado (a
// visão agregada por autor é um tipo de relatório/consolidação da conta).
router.get('/summary', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, de_mes, de_ano, ate_mes, ate_ano } = req.query as Record<string, string | undefined>;

    const memberAccountId = await resolveMemberAccountId(req.user!.id);
    const isMember = memberAccountId !== null;

    if (isMember) {
      const [permissions] = await db
        .select({ accessReports: memberPermissions.accessReports })
        .from(memberPermissions)
        .where(eq(memberPermissions.userId, req.user!.id))
        .limit(1);

      if (!permissions?.accessReports) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }

    const accountId = isMember ? memberAccountId : await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const memberRows = await pool.query(
      `SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`,
      [accountId],
    );
    const accountOwner = await pool.query(`SELECT usuario_id FROM contas WHERE id = $1`, [accountId]);
    const ownerId = (accountOwner.rows[0] as { usuario_id: number } | undefined)?.usuario_id;
    const authorIds = [
      ...(ownerId ? [ownerId] : []),
      ...memberRows.rows.map((r: { usuario_id: number }) => r.usuario_id),
    ];

    // O painel filtra por INTERVALO (de/ate), nao por mes unico. Os parametros
    // mes/ano continuam aceitos para nao quebrar quem ja chamava assim.
    const deChave = de_ano !== undefined ? parseInt(de_ano) * 12 + (de_mes !== undefined ? parseInt(de_mes) : 0) : null;
    const ateChave = ate_ano !== undefined ? parseInt(ate_ano) * 12 + (ate_mes !== undefined ? parseInt(ate_mes) : 11) : null;
    const mesUnico = mes !== undefined && ano !== undefined
      ? parseInt(ano) * 12 + parseInt(mes)
      : null;

    const de = mesUnico ?? deChave;
    const ate = mesUnico ?? ateChave;

    const periodFilter = `(ano * 12 + mes) BETWEEN COALESCE($2::int, -2147483648) AND COALESCE($3::int, 2147483647)`;

    // A soma tambem passa a respeitar a conta: antes filtrava so por autor, e
    // um lancamento do mesmo usuario em outra conta entrava no total.
    const contaFiltro = `($4::int IS NULL OR conta_id = $4 OR (conta_id IS NULL AND EXISTS (
      SELECT 1 FROM contas pf WHERE pf.id = $4 AND pf.tipo = 'pessoal' AND pf.usuario_id = $5
    )))`;
    const ownerForFallback = ownerId ?? req.user!.id;
    const baseParams = [authorIds, de, ate, accountId, ownerForFallback];

    const [expensesResult, incomesResult, categoryResult, namesResult] = await Promise.all([
      // Mesma formula do painel: despesa paga vale o que foi pago, e lancamento
      // cancelado nao entra. Sem isso, os blocos por membro divergiam dos totais
      // da tela ao lado.
      pool.query(
        `SELECT usuario_id, COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END), 0) AS total
         FROM despesas WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodFilter} AND ${contaFiltro}
         GROUP BY usuario_id`,
        baseParams,
      ),
      pool.query(
        `SELECT usuario_id, COALESCE(SUM(valor), 0) AS total
         FROM receitas WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodFilter} AND ${contaFiltro}
         GROUP BY usuario_id`,
        baseParams,
      ),
      // Despesa por membro E categoria: alimenta as barras divididas.
      pool.query(
        `SELECT d.usuario_id, d.categoria_id, COALESCE(c.nome, 'Sem categoria') AS categoria_nome,
                COALESCE(SUM(CASE WHEN d.pago THEN COALESCE(d.valor_pago, d.valor_original) ELSE d.valor_original END), 0) AS total
         FROM despesas d
         LEFT JOIN categorias c ON c.id = d.categoria_id
         WHERE d.usuario_id = ANY($1) AND d.status = 'ativa'
           AND (d.ano * 12 + d.mes) BETWEEN COALESCE($2::int, -2147483648) AND COALESCE($3::int, 2147483647)
           AND ($4::int IS NULL OR d.conta_id = $4 OR (d.conta_id IS NULL AND EXISTS (
             SELECT 1 FROM contas pf WHERE pf.id = $4 AND pf.tipo = 'pessoal' AND pf.usuario_id = $5
           )))
         GROUP BY d.usuario_id, d.categoria_id, c.nome`,
        baseParams,
      ),
      // Os graficos rotulam por nome; o id sozinho nao serve para o usuario.
      // COALESCE com a conta padrao: o dono pode ter corrigido o nome na
      // conta (contas.nome) sem isso refletir no cadastro de login
      // (usuarios.nome, que pode ter vindo em caixa alta de um import). Um
      // membro sem conta propria cai direto no nome do cadastro, que e o
      // unico que ele tem.
      pool.query(
        `SELECT u.id AS usuario_id, COALESCE(ct.nome, u.nome) AS nome
         FROM usuarios u
         LEFT JOIN contas ct ON ct.usuario_id = u.id AND ct.eh_padrao = true
         WHERE u.id = ANY($1)`,
        [authorIds],
      ),
    ]);

    res.json({
      success: true,
      data: {
        despesas_por_autor: expensesResult.rows,
        receitas_por_autor: incomesResult.rows,
        despesas_por_autor_categoria: categoryResult.rows,
        membros: namesResult.rows,
      },
    });
  } catch (error) {
    console.error('Account summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to load account summary' });
  }
});

// GET /api/account-members/overview — panorama agregado entre TODAS as
// contas do dono (PF + PJs). Dono sempre acessa todas as suas contas; membro
// so acessa se accessGeneralOverview estiver liberado, e mesmo assim ve
// apenas a(s) conta(s) as quais esta vinculado — nunca outras contas do dono.
router.get('/overview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, de_mes, de_ano, ate_mes, ate_ano } = req.query as Record<string, string | undefined>;

    const memberAccountId = await resolveMemberAccountId(req.user!.id);
    const isMember = memberAccountId !== null;

    let accountIds: number[];
    let ownerId: number;

    if (isMember) {
      const [permissions] = await db
        .select({ accessGeneralOverview: memberPermissions.accessGeneralOverview })
        .from(memberPermissions)
        .where(eq(memberPermissions.userId, req.user!.id))
        .limit(1);

      if (!permissions?.accessGeneralOverview) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }

      const contaVinculada = await pool.query(`SELECT usuario_id FROM contas WHERE id = $1`, [memberAccountId]);
      const donoDaConta = (contaVinculada.rows[0] as { usuario_id: number } | undefined)?.usuario_id;
      if (!donoDaConta) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      // Membro so enxerga a conta a qual esta vinculado, nunca as demais
      // contas do dono — accessGeneralOverview libera VER o panorama, nao
      // amplia quais contas entram nele.
      ownerId = donoDaConta;
      accountIds = [memberAccountId];
    } else {
      ownerId = req.user!.id;
      const ownedAccounts = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, ownerId), eq(accounts.active, true)));

      if (ownedAccounts.length === 0) {
        res.status(404).json({ success: false, message: 'No accounts found' });
        return;
      }

      accountIds = ownedAccounts.map((a) => a.id);
    }

    // Registros legados sem conta_id caem na conta padrao do dono (mesma regra
    // de accountAccess.ts/familyVisibility.ts). Em conta pessoal, membros
    // lancam sob o proprio usuario_id — por isso o fallback tambem precisa
    // cobrir os autores vinculados, nao so o dono.
    const contaPadraoDono = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, ownerId), eq(accounts.isDefault, true)))
      .limit(1);
    const contaPadraoId = contaPadraoDono[0]?.id ?? null;
    const membrosDaContaPadrao = contaPadraoId
      ? await pool.query(`SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`, [contaPadraoId])
      : { rows: [] as { usuario_id: number }[] };
    const autoresFallback = [ownerId, ...membrosDaContaPadrao.rows.map((r) => r.usuario_id)];

    const mesUnico = mes !== undefined && ano !== undefined
      ? parseInt(ano) * 12 + parseInt(mes)
      : null;
    const deChave = de_ano !== undefined ? parseInt(de_ano) * 12 + (de_mes !== undefined ? parseInt(de_mes) : 0) : null;
    const ateChave = ate_ano !== undefined ? parseInt(ate_ano) * 12 + (ate_mes !== undefined ? parseInt(ate_mes) : 11) : null;
    const de = mesUnico ?? deChave;
    const ate = mesUnico ?? ateChave;

    const periodFilter = `(ano * 12 + mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)`;
    const baseParams = [accountIds, contaPadraoId, autoresFallback, de, ate];

    const [contasResult, expensesResult, incomesResult] = await Promise.all([
      pool.query(
        `SELECT id, tipo, nome, razao_social, nome_fantasia FROM contas WHERE id = ANY($1) ORDER BY eh_padrao DESC, data_criacao, id`,
        [accountIds],
      ),
      // Despesas de TODOS os autores das contas listadas, somadas por conta —
      // conta_id nunca vem do client, so da lista ja resolvida acima. Fallback
      // (conta_id nulo) so entra quando a conta padrao do dono esta no
      // conjunto pedido, e so pelos autores vinculados a ela.
      pool.query(
        `SELECT COALESCE(d.conta_id, $2) AS conta_id,
                COALESCE(SUM(CASE WHEN d.pago THEN COALESCE(d.valor_pago, d.valor_original) ELSE d.valor_original END), 0) AS total
         FROM despesas d
         WHERE d.status = 'ativa' AND ${periodFilter}
           AND (
             d.conta_id = ANY($1)
             OR (d.conta_id IS NULL AND $2::int IS NOT NULL AND $2 = ANY($1) AND d.usuario_id = ANY($3))
           )
         GROUP BY COALESCE(d.conta_id, $2)`,
        baseParams,
      ),
      pool.query(
        `SELECT COALESCE(r.conta_id, $2) AS conta_id, COALESCE(SUM(r.valor), 0) AS total
         FROM receitas r
         WHERE r.status = 'ativa' AND ${periodFilter}
           AND (
             r.conta_id = ANY($1)
             OR (r.conta_id IS NULL AND $2::int IS NOT NULL AND $2 = ANY($1) AND r.usuario_id = ANY($3))
           )
         GROUP BY COALESCE(r.conta_id, $2)`,
        baseParams,
      ),
    ]);

    res.json({
      success: true,
      data: {
        contas: contasResult.rows,
        despesas_por_conta: expensesResult.rows,
        receitas_por_conta: incomesResult.rows,
      },
    });
  } catch (error) {
    console.error('Accounts overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load accounts overview' });
  }
});

const PERMISSION_FLAGS: PermissionFlag[] = [
  'accessExpenses', 'accessIncomes', 'accessMonthClosing', 'accessReserves', 'accessBudget', 'accessCalendar',
  'accessDashboard', 'accessReports', 'accessNotifications', 'accessAssistant',
  'accessAccounts', 'accessCategories', 'accessCards', 'accessServices', 'accessRepresentatives', 'accessPartners', 'accessMembers', 'accessSubscription',
  'accessClients', 'accessContracts', 'accessProductCatalog',
  'accessFamilyEntries', 'editFamilyEntries', 'accessFamilyCards',
  'accessGeneralOverview',
];

// GET /api/account-members/me/permissions — o próprio usuário logado consulta
// suas permissões (usado pelo frontend para decidir o que exibir na UI).
// Gestor/admin sempre recebe tudo liberado, sem depender de linha na tabela.
router.get('/me/permissions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberAccountId = await resolveMemberAccountId(req.user!.id);

    if (memberAccountId === null) {
      const allTrue = Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, true]));
      res.json({ success: true, data: allTrue });
      return;
    }

    const [permissions] = await db.select().from(memberPermissions).where(eq(memberPermissions.userId, req.user!.id)).limit(1);
    if (!permissions) {
      const allFalse = Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, false]));
      res.json({ success: true, data: allFalse });
      return;
    }

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get own permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get permissions' });
  }
});

// GET /api/account-members/:id/permissions — permissões atuais de um membro
// (visão do gestor). Gestão de permissões nunca é delegável a outro membro.
router.get('/:id/permissions', authenticate, requireTitular, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const [permissions] = await db.select().from(memberPermissions).where(eq(memberPermissions.userId, memberUserId)).limit(1);
    if (!permissions) {
      res.status(404).json({ success: false, message: 'Permissions not found for this member' });
      return;
    }

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get member permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get member permissions' });
  }
});

// PUT /api/account-members/:id/permissions — gestor atualiza as permissões
// de um membro específico. Nunca delegável a outro membro (só requireTitular).
router.put('/:id/permissions', authenticate, requireTitular, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updateData: Partial<typeof memberPermissions.$inferInsert> = { updatedAt: new Date() };

    for (const flag of PERMISSION_FLAGS) {
      if (flag in body) {
        if (typeof body[flag] !== 'boolean') {
          res.status(400).json({ success: false, message: `${flag} must be a boolean` });
          return;
        }
        (updateData as Record<string, unknown>)[flag] = body[flag];
      }
    }

    const [updated] = await db
      .update(memberPermissions)
      .set(updateData)
      .where(eq(memberPermissions.userId, memberUserId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: 'Permissions not found for this member' });
      return;
    }

    res.json({ success: true, message: 'Permissions updated successfully', data: updated });
  } catch (error) {
    console.error('Update member permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update member permissions' });
  }
});

export default router;
