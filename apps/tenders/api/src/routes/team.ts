import { Router } from 'express';
import { body } from 'express-validator';
import { requireTenderTitular, tenderAccessOf } from '../middleware/tenderAccess';
import { validate } from '../middleware/validation';
import { readMemberUpdateInput, readNewMemberInput } from '../services/memberInput';
import { syncRecurringAmount } from '../services/recurringAmount';
import {
  assertTeamMember,
  createTeamMember,
  listTeam,
  readTeamMember,
  setTeamMemberAccess,
  toTeamMemberView,
  updateTeamMember,
  type TeamMemberRecord,
  type TeamMemberView,
} from '../services/team';
import { changeUserPhoto, photoLink, readPhotoUpload } from '../services/userPhoto';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { idParam } from './validators';

// Usuários do módulo (só o titular): lista, cadastro, edição, acesso e foto dos colaboradores. O `accountId` é
// sempre o da conta resolvida pela trava do módulo, nunca o que o cliente mandar; o alvo precisa ser colaborador
// ativo dessa conta (404 para qualquer outro, inclusive de outra conta).

export function teamRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  router.use(requireTenderTitular);

  /** A foto vira um link assinado de vida curta; a chave do R2 não sai da API. */
  const toView = async (record: TeamMemberRecord): Promise<TeamMemberView> =>
    toTeamMemberView(record, await photoLink(deps.userFiles, record.photoKey));

  router.get(
    '/',
    tenderRoute('Tender team list failed:', 'Não foi possível carregar a equipe agora.', async (req, res) => {
      const records = await listTeam(deps.db, tenderAccessOf(req).account.id);
      res.json({ success: true, data: await Promise.all(records.map(toView)) });
    }),
  );

  // POST /api/tenders/team: usuário novo, já com acesso ao módulo e com os dados de trabalho.
  router.post(
    '/',
    tenderRoute('Tender team create failed:', 'Não foi possível cadastrar o usuário agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const member = await createTeamMember(deps.db, access.account.id, access.userId, readNewMemberInput(req.body));
      const warning = await syncRecurringAmount(deps.db, access.account.id, deps.now());
      res.status(201).json({ success: true, data: { member: await toView(member), warning } });
    }),
  );

  // PUT /api/tenders/team/:userId { hasAccess }: a mudança vale no valor da próxima cobrança.
  router.put(
    '/:userId',
    [idParam('userId'), body('hasAccess').isBoolean({ strict: true }).withMessage('Use true ou false'), validate],
    tenderRoute('Tender team access failed:', 'Não foi possível alterar o acesso agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const member = await setTeamMemberAccess(
        deps.db,
        access.account.id,
        access.userId,
        Number(req.params['userId']),
        req.body.hasAccess === true,
      );
      const warning = await syncRecurringAmount(deps.db, access.account.id, deps.now());
      res.json({ success: true, data: { member: await toView(member), warning } });
    }),
  );

  // PATCH /api/tenders/team/:userId: edita os dados do colaborador; não mexe no acesso nem no valor da assinatura.
  router.patch(
    '/:userId',
    [idParam('userId'), validate],
    tenderRoute('Tender team update failed:', 'Não foi possível salvar o usuário agora.', async (req, res) => {
      const member = await updateTeamMember(
        deps.db,
        tenderAccessOf(req).account.id,
        Number(req.params['userId']),
        readMemberUpdateInput(req.body),
      );
      res.json({ success: true, data: { member: await toView(member) } });
    }),
  );

  // PUT /api/tenders/team/:userId/photo { image }: troca a foto (data URL do recorte do app).
  router.put(
    '/:userId/photo',
    [idParam('userId'), validate],
    tenderRoute('Tender team photo failed:', 'Não foi possível salvar a foto agora.', async (req, res) => {
      const accountId = tenderAccessOf(req).account.id;
      const memberUserId = Number(req.params['userId']);
      await assertTeamMember(deps.db, accountId, memberUserId);
      await changeUserPhoto(deps.db, deps.userFiles, memberUserId, readPhotoUpload(req.body));
      res.json({ success: true, data: { member: await toView(await readTeamMember(deps.db, accountId, memberUserId)) } });
    }),
  );

  // DELETE /api/tenders/team/:userId/photo: tira a foto.
  router.delete(
    '/:userId/photo',
    [idParam('userId'), validate],
    tenderRoute('Tender team photo removal failed:', 'Não foi possível remover a foto agora.', async (req, res) => {
      const accountId = tenderAccessOf(req).account.id;
      const memberUserId = Number(req.params['userId']);
      await assertTeamMember(deps.db, accountId, memberUserId);
      await changeUserPhoto(deps.db, deps.userFiles, memberUserId, null);
      res.json({ success: true, data: { member: await toView(await readTeamMember(deps.db, accountId, memberUserId)) } });
    }),
  );

  return router;
}
