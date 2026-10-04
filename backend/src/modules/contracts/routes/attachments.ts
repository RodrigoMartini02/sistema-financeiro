import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  ATTACHMENT_MIME_TYPES, ATTACHMENT_SIZE_MESSAGE, ATTACHMENT_TYPE_MESSAGE, checkAttachmentUpload, contentDisposition,
} from '../../../services/contractAttachmentType';
import {
  attachmentNotFound, attachmentPath, deleteContractAttachment, findAttachment, listContractAttachments, saveContractAttachment,
} from '../../../services/contractAttachments';
import { findContractForRequester } from '../../../services/contracts';
import { MAX_ATTACHMENT_BYTES } from '../../../services/contractTypes';
import { RequestInputError, readRequiredId, sendRequestError } from '../../../utils/requestInput';
import type { ContractAttachment } from '../db/schema';

// Anexos do contrato, dentro de /api/contracts. O arquivo fica na memória até
// ser conferido pelo conteúdo; só então vai para o disco.
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
}).single('file');

/** Recebe o arquivo; acima de 20 MB, a resposta é a mesma da conferência. */
function receiveFile(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? ATTACHMENT_SIZE_MESSAGE : ATTACHMENT_TYPE_MESSAGE;
      res.status(400).json({ success: false, message });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
}

/** Anexo pelo id, desde que o contrato dele seja de uma conta do solicitante; senão, 404. */
async function loadAccessibleAttachment(req: Request): Promise<ContractAttachment> {
  const attachment = await findAttachment(readRequiredId(req.params['attachmentId'], 'Anexo não encontrado'));
  try {
    await findContractForRequester(req.user!.id, attachment.contractId);
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw attachmentNotFound();
    }
    throw error;
  }
  return attachment;
}

// GET /api/contracts/:id/attachments
router.get('/:id/attachments', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readRequiredId(req.params['id'], 'Contrato não encontrado'));
    res.json({ success: true, data: await listContractAttachments(contract.id) });
  } catch (error) {
    sendRequestError(res, error, 'List contract attachments error:', req.user?.id, 'Não foi possível carregar os anexos agora.');
  }
});

// POST /api/contracts/:id/attachments (multipart, campo "file") — só PDF, JPG ou PNG, até 20 MB
router.post('/:id/attachments', receiveFile, async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readRequiredId(req.params['id'], 'Contrato não encontrado'));
    if (!req.file) {
      throw new RequestInputError(ATTACHMENT_TYPE_MESSAGE);
    }
    const checked = checkAttachmentUpload({ originalName: req.file.originalname, content: req.file.buffer });
    const attachment = await saveContractAttachment(contract, req.user!.id, { ...checked, content: req.file.buffer });
    res.status(201).json({ success: true, message: 'Anexo enviado', data: attachment });
  } catch (error) {
    sendRequestError(res, error, 'Upload contract attachment error:', req.user?.id, 'Não foi possível enviar o anexo agora.');
  }
});

// GET /api/contracts/attachments/:attachmentId/file — com o tipo conferido no envio, para abrir na tela
router.get('/attachments/:attachmentId/file', async (req: Request, res: Response): Promise<void> => {
  try {
    const attachment = await loadAccessibleAttachment(req);
    const filePath = attachmentPath(attachment.fileName);
    if (!fs.existsSync(filePath)) {
      throw attachmentNotFound();
    }
    res.setHeader('Content-Type', ATTACHMENT_MIME_TYPES[attachment.kind]);
    res.setHeader('Content-Disposition', contentDisposition(attachment.originalName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      console.error('Read contract attachment error:', { attachmentId: attachment.id, error });
      res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    sendRequestError(res, error, 'Get contract attachment error:', req.user?.id, 'Não foi possível abrir o anexo agora.');
  }
});

// DELETE /api/contracts/attachments/:attachmentId
router.delete('/attachments/:attachmentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const attachment = await loadAccessibleAttachment(req);
    await deleteContractAttachment(attachment);
    res.json({ success: true, message: 'Anexo removido' });
  } catch (error) {
    sendRequestError(res, error, 'Delete contract attachment error:', req.user?.id, 'Não foi possível remover o anexo agora.');
  }
});

export default router;
