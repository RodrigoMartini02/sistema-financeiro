import { Router } from 'express';
import { requireTenderTitular } from '../middleware/tenderAccess';
import { readProfileUpdateInput } from '../services/memberInput';
import { readProfile, toProfileView, updateProfile, type ProfileRecord, type ProfileView } from '../services/profile';
import { changeUserPhoto, photoLink, readPhotoUpload } from '../services/userPhoto';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';

// Perfil do próprio titular da conta: nome, sobrenome, telefone e foto. O usuário é sempre o da sessão
// (`req.tendersUser`), nunca um identificador vindo do cliente. Só o titular: o colaborador não tem perfil próprio
// nesta entrega (e as rotas dele respondem 403).

export function profileRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  router.use(requireTenderTitular);

  const toView = async (record: ProfileRecord): Promise<ProfileView> =>
    toProfileView(record, await photoLink(deps.userFiles, record.photoKey));

  // O `requireTenderTitular` roda depois da trava do módulo, que já exige o login: `tendersUser` existe aqui.
  const sessionUserId = (req: { tendersUser?: { id: number } }): number => {
    if (!req.tendersUser) {
      throw new Error('authenticate não rodou antes da rota');
    }
    return req.tendersUser.id;
  };

  router.get(
    '/',
    tenderRoute('Tender profile read failed:', 'Não foi possível carregar o perfil agora.', async (req, res) => {
      res.json({ success: true, data: { profile: await toView(await readProfile(deps.db, sessionUserId(req))) } });
    }),
  );

  // PATCH /api/tenders/profile { name?, lastName?, phone? }
  router.patch(
    '/',
    tenderRoute('Tender profile update failed:', 'Não foi possível salvar o perfil agora.', async (req, res) => {
      const profile = await updateProfile(deps.db, sessionUserId(req), readProfileUpdateInput(req.body));
      res.json({ success: true, data: { profile: await toView(profile) } });
    }),
  );

  // PUT /api/tenders/profile/photo { image }
  router.put(
    '/photo',
    tenderRoute('Tender profile photo failed:', 'Não foi possível salvar a foto agora.', async (req, res) => {
      const userId = sessionUserId(req);
      await changeUserPhoto(deps.db, deps.userFiles, userId, readPhotoUpload(req.body));
      res.json({ success: true, data: { profile: await toView(await readProfile(deps.db, userId)) } });
    }),
  );

  // DELETE /api/tenders/profile/photo
  router.delete(
    '/photo',
    tenderRoute('Tender profile photo removal failed:', 'Não foi possível remover a foto agora.', async (req, res) => {
      const userId = sessionUserId(req);
      await changeUserPhoto(deps.db, deps.userFiles, userId, null);
      res.json({ success: true, data: { profile: await toView(await readProfile(deps.db, userId)) } });
    }),
  );

  return router;
}
