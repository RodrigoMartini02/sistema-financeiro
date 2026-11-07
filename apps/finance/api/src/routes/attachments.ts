import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { db } from '../db/client';
import type { Attachment } from '../db/schema';
import { requireActivePlan, requirePremiumPlan } from '../middleware/auth';
import { requireCatalogAccess, requireScreenAccess } from '../middleware/permissions';
import {
  assertCanAttachTo, assertCanRemoveAttachment, assertCanViewAttachment, attachmentNotFound,
} from '../services/attachmentAccess';
import type { AttachmentUpload } from '../services/attachmentFile';
import type { AttachmentOwner } from '../services/attachmentModel';
import { ATTACHMENT_OWNER_TYPES, ATTACHMENT_RULES, type AttachmentOwnerType, type AttachmentRule } from '../services/attachmentRules';
import {
  deleteAttachmentRow, findAttachment, saveAttachment, sweepPendingAttachmentsIfDue,
} from '../services/attachmentService';
import { createAttachmentLink, getAttachmentStorage, removeStoredObjects } from '../services/attachmentStorage';
import { isUuid } from '../services/catalogo';
import { RequestInputError, readRequiredId, sendRequestError } from '../utils/requestInput';

// Anexos de despesas, receitas, contratos e produtos, em /api/attachments (plano
// .plans/unificar-anexos-no-r2.md). O arquivo passa pelo servidor só no envio; para abrir, o app pede um
// link de vida curta e o navegador baixa direto do R2.
const router = Router();

type Guard = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

/** As mesmas travas das rotas que antes recebiam cada tipo de anexo: plano, tela ou cadastro liberados para a pessoa. */
const OWNER_GUARDS: Record<AttachmentOwnerType, readonly Guard[]> = {
  expense: [requireActivePlan, requireScreenAccess('accessExpenses')],
  income: [requireActivePlan, requireScreenAccess('accessIncomes')],
  contract: [requireActivePlan, requirePremiumPlan, requireCatalogAccess('contracts')],
  product: [requireScreenAccess('accessProductCatalog')],
};

/** Roda as travas em ordem. Quando uma recusa, ela já respondeu ao pedido e a rota para. */
async function passesGuards(guards: readonly Guard[], req: Request, res: Response): Promise<boolean> {
  for (const guard of guards) {
    let advanced = false;
    await guard(req, res, () => {
      advanced = true;
    });
    if (!advanced) {
      return false;
    }
  }
  return true;
}

interface UploadTarget {
  ownerType: AttachmentOwnerType;
  /** Contrato e produto, que já existem; despesa e receita não têm: o envio fica pendente. */
  owner?: AttachmentOwner;
}

function readUploadTarget(query: Request['query']): UploadTarget {
  const ownerType = ATTACHMENT_OWNER_TYPES.find((type) => type === query['ownerType']);
  if (ownerType === undefined) {
    throw new RequestInputError('Tipo de anexo inválido');
  }
  const ownerId = query['ownerId'];
  switch (ownerType) {
    case 'expense':
    case 'income':
      if (ownerId !== undefined) {
        throw new RequestInputError('O anexo de um lançamento é enviado antes de salvá-lo, sem informar o lançamento');
      }
      return { ownerType };
    case 'contract':
      return { ownerType, owner: { type: 'contract', id: readRequiredId(ownerId, 'Contrato não encontrado') } };
    case 'product':
      if (typeof ownerId !== 'string' || !isUuid(ownerId)) {
        throw new RequestInputError('Produto não encontrado', 404);
      }
      return { ownerType, owner: { type: 'product', id: ownerId } };
  }
}

/** Recebe o arquivo (campo "file") na memória, até o tamanho do tipo de dono; o conteúdo só é conferido depois. */
function receiveFile(req: Request, res: Response, rule: AttachmentRule): Promise<AttachmentUpload> {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: rule.maxBytes, files: 1 },
    // Os navegadores mandam o nome do arquivo em UTF-8; sem isto, "Relatório.pdf" chega como "RelatÃ³rio.pdf".
    defParamCharset: 'utf8',
  }).single('file');
  return new Promise((resolve, reject) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        reject(new RequestInputError(error.code === 'LIMIT_FILE_SIZE' ? rule.sizeMessage : rule.typeMessage));
        return;
      }
      if (error) {
        reject(error);
        return;
      }
      if (!req.file) {
        reject(new RequestInputError(rule.typeMessage));
        return;
      }
      resolve({ originalName: req.file.originalname, content: req.file.buffer });
    });
  });
}

async function loadAttachment(rawId: string | undefined): Promise<Attachment> {
  const attachment = await findAttachment(rawId ?? '');
  if (!attachment) {
    throw attachmentNotFound();
  }
  return attachment;
}

// POST /api/attachments?ownerType=expense|income|contract|product[&ownerId=] (multipart, campo "file")
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const target = readUploadTarget(req.query);
    if (!(await passesGuards(OWNER_GUARDS[target.ownerType], req, res))) {
      return;
    }
    if (target.owner) {
      await assertCanAttachTo(target.owner, req.user!.id);
    }
    const file = await receiveFile(req, res, ATTACHMENT_RULES[target.ownerType]);
    const storage = getAttachmentStorage();
    const attachment = await saveAttachment(storage, {
      uploadedBy: req.user!.id,
      ownerType: target.ownerType,
      ...(target.owner ? { owner: target.owner } : {}),
      file,
    });
    res.status(201).json({ success: true, message: 'Anexo enviado', data: attachment });
    sweepPendingAttachmentsIfDue(storage);
  } catch (error) {
    sendRequestError(res, error, 'Upload attachment error:', req.user?.id, 'Não foi possível enviar o anexo agora.');
  }
});

// GET /api/attachments/:id/link — link de vida curta para abrir ou baixar o arquivo direto do R2
router.get('/:id/link', async (req: Request, res: Response): Promise<void> => {
  try {
    const attachment = await loadAttachment(req.params['id']);
    if (!(await passesGuards(OWNER_GUARDS[attachment.ownerType], req, res))) {
      return;
    }
    await assertCanViewAttachment(attachment, req.user!.id);
    const link = await createAttachmentLink(getAttachmentStorage(), attachment.storageKey);
    res.json({ success: true, data: link });
  } catch (error) {
    sendRequestError(res, error, 'Create attachment link error:', req.user?.id, 'Não foi possível abrir o anexo agora.');
  }
});

// DELETE /api/attachments/:id — envio pendente, anexo de contrato ou imagem de produto
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const attachment = await loadAttachment(req.params['id']);
    if (!(await passesGuards(OWNER_GUARDS[attachment.ownerType], req, res))) {
      return;
    }
    await assertCanRemoveAttachment(attachment, req.user!.id);
    const storageKey = await deleteAttachmentRow(db, attachment.id);
    if (storageKey !== null) {
      await removeStoredObjects(getAttachmentStorage(), [storageKey]);
    }
    res.json({ success: true, message: 'Anexo removido' });
  } catch (error) {
    sendRequestError(res, error, 'Delete attachment error:', req.user?.id, 'Não foi possível remover o anexo agora.');
  }
});

export default router;
