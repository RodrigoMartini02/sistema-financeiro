import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'contratos');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

interface AnexoRow {
  id: number;
  contrato_id: number;
  nome_original: string;
  nome_arquivo: string;
  mime_type: string | null;
  tamanho: number | null;
  created_at: string;
}

const router = Router();

// GET /api/contrato-anexos?contrato_id=X
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { contrato_id } = req.query as Record<string, string | undefined>;

  if (!contrato_id) {
    res.status(400).json({ success: false, message: 'contrato_id is required' });
    return;
  }

  try {
    const contratoCheck = await pool.query(
      'SELECT id FROM contratos WHERE id = $1 AND usuario_id = $2',
      [parseInt(contrato_id), req.user!.id],
    );
    if (contratoCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const result = await pool.query<AnexoRow>(
      `SELECT id, contrato_id, nome_original, mime_type, tamanho, created_at
       FROM contrato_anexos
       WHERE contrato_id = $1 AND usuario_id = $2
       ORDER BY created_at DESC`,
      [parseInt(contrato_id), req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List contract attachments error:', error);
    res.status(500).json({ success: false, message: 'Failed to list attachments' });
  }
});

// POST /api/contrato-anexos — upload file
router.post(
  '/',
  authenticate,
  upload.single('arquivo'),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    const { contrato_id } = req.body as Record<string, string | undefined>;

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    if (!contrato_id) {
      fs.unlinkSync(file.path);
      res.status(400).json({ success: false, message: 'contrato_id is required' });
      return;
    }

    try {
      const contratoCheck = await pool.query(
        'SELECT id FROM contratos WHERE id = $1 AND usuario_id = $2',
        [parseInt(contrato_id), req.user!.id],
      );
      if (contratoCheck.rows.length === 0) {
        fs.unlinkSync(file.path);
        res.status(404).json({ success: false, message: 'Contract not found' });
        return;
      }

      const result = await pool.query<AnexoRow>(
        `INSERT INTO contrato_anexos (contrato_id, usuario_id, nome_original, nome_arquivo, mime_type, tamanho)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, contrato_id, nome_original, mime_type, tamanho, created_at`,
        [parseInt(contrato_id), req.user!.id, file.originalname, file.filename, file.mimetype, file.size],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      fs.unlinkSync(file.path);
      console.error('Upload contract attachment error:', error);
      res.status(500).json({ success: false, message: 'Failed to save attachment' });
    }
  },
);

// GET /api/contrato-anexos/:id/arquivo — stream file inline
router.get('/:id/arquivo', authenticate, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '0');

  try {
    const result = await pool.query<Pick<AnexoRow, 'nome_original' | 'nome_arquivo' | 'mime_type'>>(
      `SELECT nome_original, nome_arquivo, mime_type
       FROM contrato_anexos
       WHERE id = $1 AND usuario_id = $2`,
      [id, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    const row = result.rows[0]!;
    const filePath = path.join(UPLOAD_DIR, path.basename(row.nome_arquivo));

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found on disk' });
      return;
    }

    res.setHeader('Content-Type', row.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.nome_original)}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Get attachment file error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve file' });
  }
});

// DELETE /api/contrato-anexos/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '0');

  try {
    const result = await pool.query<Pick<AnexoRow, 'nome_arquivo'>>(
      `DELETE FROM contrato_anexos
       WHERE id = $1 AND usuario_id = $2
       RETURNING nome_arquivo`,
      [id, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, path.basename(result.rows[0]!.nome_arquivo));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
});

export default router;
