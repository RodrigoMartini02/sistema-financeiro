import { Router, type Request, type RequestHandler } from 'express';
import { requireTenderTitular, tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import { validate } from '../middleware/validation';
import { readDocumentUpload } from '../services/documentUpload';
import { readDocumentChanges, readNewDocumentInput, readPersonChanges, readPersonInput } from '../services/vaultInput';
import { createDocument, deleteDocument, documentLink, listDocuments, updateDocument, type VaultActor, type VaultDeps } from '../services/vaultDocuments';
import { createPerson, deletePerson, listPeople, updatePerson } from '../services/vaultPeople';
import { readRecord } from '../utils/requestInput';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { idParam } from './validators';

// Documentação › Cofre (plano .plans/licitacoes-5-cofre-de-documentos.md): as pessoas ligadas à empresa e os documentos de
// habilitação. A conta e o papel vêm sempre da trava do módulo, nunca do pedido. Os documentos da empresa são de todos com
// acesso ao módulo; as pessoas e os documentos delas são dado pessoal de terceiros e só o titular os vê e altera (o
// colaborador não os vê na lista e recebe 404 se pedir um). O arquivo chega no corpo como data URL e mora no R2: sem R2
// configurado, o envio e a abertura respondem 503 e o resto segue.

/** Envios de arquivo por usuário: 30 a cada 10 minutos (em memória, vale por instância do servidor). */
export const DOCUMENT_UPLOAD_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };

export function vaultRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const uploadLimiter = userRateLimiter({
    ...DOCUMENT_UPLOAD_RATE_LIMIT,
    message: 'Muitos envios seguidos. Espere alguns minutos e tente de novo.',
  });
  // Só o pedido com arquivo conta no limite: alterar as datas de um documento não custa nada.
  const limitUploads: RequestHandler = (req, res, next) => {
    const hasFile = typeof req.body === 'object' && req.body !== null && 'file' in req.body;
    if (hasFile) {
      uploadLimiter(req, res, next);
      return;
    }
    next();
  };
  const vaultDeps = (): VaultDeps => ({ db: deps.db, storage: deps.userFiles, now: deps.now });
  const actorOf = (req: Request): VaultActor => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId, role: access.role };
  };

  // GET /api/tenders/vault/documents → { items, limit, storageAvailable }; o colaborador só recebe os da empresa.
  router.get(
    '/documents',
    tenderRoute('Tender vault documents list failed:', 'Não foi possível carregar os documentos agora.', async (req, res) => {
      res.json({ success: true, data: await listDocuments(vaultDeps(), actorOf(req)) });
    }),
  );

  // POST /api/tenders/vault/documents { type, personId?, description?, issuedOn?, validUntil?, file: { name, data } } → 201
  router.post(
    '/documents',
    limitUploads,
    tenderRoute('Tender vault document create failed:', 'Não foi possível guardar o documento agora.', async (req, res) => {
      const body = readRecord(req.body, 'Pedido inválido');
      const input = readNewDocumentInput(body);
      const upload = readDocumentUpload(body['file']);
      res.status(201).json({ success: true, data: { document: await createDocument(vaultDeps(), actorOf(req), input, upload) } });
    }),
  );

  // PATCH /api/tenders/vault/documents/:id { description?, issuedOn?, validUntil?, file? }: o tipo e a pessoa não mudam.
  router.patch(
    '/documents/:id',
    [idParam('id'), validate],
    limitUploads,
    tenderRoute('Tender vault document update failed:', 'Não foi possível salvar o documento agora.', async (req, res) => {
      const body = readRecord(req.body, 'Pedido inválido');
      const { changes, hasFile } = readDocumentChanges(body);
      const upload = hasFile ? readDocumentUpload(body['file']) : null;
      const document = await updateDocument(vaultDeps(), actorOf(req), Number(req.params['id']), changes, upload);
      res.json({ success: true, data: { document } });
    }),
  );

  // DELETE /api/tenders/vault/documents/:id: apaga o documento, os avisos dele e o arquivo.
  router.delete(
    '/documents/:id',
    [idParam('id'), validate],
    tenderRoute('Tender vault document delete failed:', 'Não foi possível apagar o documento agora.', async (req, res) => {
      const documentId = Number(req.params['id']);
      await deleteDocument(vaultDeps(), actorOf(req), documentId);
      res.json({ success: true, data: { id: documentId } });
    }),
  );

  // GET /api/tenders/vault/documents/:id/link → { url, expiresInSeconds, fileName }: o link do arquivo, de vida curta.
  router.get(
    '/documents/:id/link',
    [idParam('id'), validate],
    tenderRoute('Tender vault document link failed:', 'Não foi possível abrir o documento agora.', async (req, res) => {
      res.json({ success: true, data: await documentLink(vaultDeps(), actorOf(req), Number(req.params['id'])) });
    }),
  );

  // As pessoas: só o titular (403 para o colaborador).
  const people = Router();
  people.use(requireTenderTitular);

  // GET /api/tenders/vault/people → { items, limit }
  people.get(
    '/',
    tenderRoute('Tender vault people list failed:', 'Não foi possível carregar as pessoas agora.', async (req, res) => {
      res.json({ success: true, data: await listPeople(deps.db, actorOf(req).accountId) });
    }),
  );

  // POST /api/tenders/vault/people { name, cpf, roles, jobTitle?, email?, phone? } → 201
  people.post(
    '/',
    tenderRoute('Tender vault person create failed:', 'Não foi possível cadastrar a pessoa agora.', async (req, res) => {
      const person = await createPerson(deps.db, actorOf(req), readPersonInput(req.body));
      res.status(201).json({ success: true, data: { person } });
    }),
  );

  // PATCH /api/tenders/vault/people/:id: só os campos que vieram.
  people.patch(
    '/:id',
    [idParam('id'), validate],
    tenderRoute('Tender vault person update failed:', 'Não foi possível salvar a pessoa agora.', async (req, res) => {
      const person = await updatePerson(deps.db, actorOf(req).accountId, Number(req.params['id']), readPersonChanges(req.body));
      res.json({ success: true, data: { person } });
    }),
  );

  // DELETE /api/tenders/vault/people/:id → { id, removedDocuments }: apaga também os documentos da pessoa.
  people.delete(
    '/:id',
    [idParam('id'), validate],
    tenderRoute('Tender vault person delete failed:', 'Não foi possível apagar a pessoa agora.', async (req, res) => {
      const personId = Number(req.params['id']);
      const { removedDocuments } = await deletePerson({ db: deps.db, storage: deps.userFiles }, actorOf(req).accountId, personId);
      res.json({ success: true, data: { id: personId, removedDocuments } });
    }),
  );

  router.use('/people', people);
  return router;
}
