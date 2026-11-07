import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/ratings — public
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, autor, estrelas, comentario, data_criacao
       FROM avaliacoes
       WHERE aprovada = true
       ORDER BY data_criacao DESC
       LIMIT 100`,
    );

    const rows = result.rows as Array<{ estrelas: number }>;
    const total = rows.length;
    const media = total > 0 ? (rows.reduce((acc, r) => acc + r.estrelas, 0) / total).toFixed(1) : '0.0';

    res.json({ success: true, data: { avaliacoes: result.rows, total, media: parseFloat(media) } });
  } catch (error) {
    console.error('List ratings error:', error);
    res.status(500).json({ success: false, message: 'Failed to list ratings' });
  }
});

// GET /api/ratings/status
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [ratingResult, userResult] = await Promise.all([
      pool.query('SELECT id FROM avaliacoes WHERE usuario_id = $1', [req.user!.id]),
      pool.query('SELECT data_cadastro FROM usuarios WHERE id = $1', [req.user!.id]),
    ]);

    const alreadyRated = ratingResult.rows.length > 0;
    const registeredAt = (userResult.rows[0] as { data_cadastro: string | null } | undefined)?.data_cadastro;

    let daysSince = 0;
    if (registeredAt) {
      daysSince = Math.floor((Date.now() - new Date(registeredAt).getTime()) / 86400000);
    }

    res.json({
      success: true,
      data: { jaAvaliou: alreadyRated, diasDesde: daysSince, deveExibir: !alreadyRated && daysSince >= 5 },
    });
  } catch (error) {
    console.error('Rating status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get rating status' });
  }
});

// POST /api/ratings
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { estrelas, comentario } = req.body as { estrelas: unknown; comentario: unknown };
    const stars = parseInt(String(estrelas));

    if (!stars || stars < 1 || stars > 5) {
      res.status(400).json({ success: false, message: 'Rating must be between 1 and 5 stars' });
      return;
    }

    const comment = String(comentario ?? '').trim();
    if (comment.length < 10) {
      res.status(400).json({ success: false, message: 'Comment must be at least 10 characters' });
      return;
    }
    if (comment.length > 500) {
      res.status(400).json({ success: false, message: 'Comment must be at most 500 characters' });
      return;
    }

    const existing = await pool.query('SELECT id FROM avaliacoes WHERE usuario_id = $1', [req.user!.id]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, message: 'You have already submitted a rating' });
      return;
    }

    const userResult = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [req.user!.id]);
    const fullName = (userResult.rows[0] as { nome: string } | undefined)?.nome ?? 'User';
    const author = fullName.split(' ')[0]!;

    const result = await pool.query(
      `INSERT INTO avaliacoes (usuario_id, autor, estrelas, comentario, aprovada)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, autor, estrelas, comentario, data_criacao`,
      [req.user!.id, author, stars, comment],
    );

    await pool.query('UPDATE usuarios SET avaliacao_feita = true WHERE id = $1', [req.user!.id]);

    res.status(201).json({ success: true, message: 'Rating submitted', data: result.rows[0] });
  } catch (error) {
    console.error('Create rating error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
});

export default router;
