// ================================================================
// AI ROUTES - Endpoints do módulo de Inteligência Artificial
// ================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const ctrl = require('../controllers/aiController');

// ── CONFIGURAÇÃO DO MULTER (Upload de arquivos) ──────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nome = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        cb(null, nome);
    }
});

const fileFilter = (req, file, cb) => {
    const tiposPermitidos = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf'
    ];
    if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG, WEBP ou PDF.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ── ROTAS ────────────────────────────────────────────────────────

// Status do módulo IA (não requer auth para debug)
router.get('/status', ctrl.status);

// Chat conversacional (endpoint principal)
router.post('/chat', authMiddleware, ctrl.chat);

// Interpretar texto de despesa diretamente
router.post('/despesa', authMiddleware, ctrl.interpretarDespesa);

// Upload de documento financeiro (boleto, nota fiscal, comprovante)
router.post('/arquivo', authMiddleware, upload.single('arquivo'), ctrl.processarArquivoUpload);

// QR Code PIX (imagem ou texto do payload)
router.post('/pix', authMiddleware, upload.single('imagem'), ctrl.interpretarPIX);

// Linha digitável de boleto
router.post('/boleto', authMiddleware, ctrl.interpretarBoleto);

// Recorrências detectadas/confirmadas
router.get('/recorrencias', authMiddleware, ctrl.listarRecorrencias);
router.post('/recorrencias', authMiddleware, ctrl.confirmarRecorrencia);

// Aprendizado de categoria
router.post('/aprendizado', authMiddleware, ctrl.salvarAprendizadoCategoria);

// Configuração de provedor de IA por usuário
router.get('/config', authMiddleware, ctrl.obterConfigIA);
router.post('/config/chave', authMiddleware, ctrl.salvarConfigChave);
router.get('/test', authMiddleware, ctrl.testarConexaoIA);
router.get('/resumo', authMiddleware, ctrl.resumoFinanceiro);
router.post('/extrato', authMiddleware, upload.single('arquivo'), ctrl.importarExtrato);

// Instruções da Gen — por usuário, armazenadas no banco
const { query } = require('../config/database');
const { revisarCarta } = require('../services/aiParser');

router.get('/instrucoes', authMiddleware, async (req, res) => {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const conteudo = r.rows[0]?.dados_financeiros?.instrucoes_gen || '';
        res.json({ conteudo });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao ler instruções' });
    }
});

router.post('/instrucoes', authMiddleware, async (req, res) => {
    try {
        const { conteudo } = req.body;
        if (conteudo === undefined) return res.status(400).json({ erro: 'Conteúdo ausente' });
        // UPSERT: substitui as instruções do usuário (não acumula)
        await query(
            `UPDATE usuarios
             SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('instrucoes_gen', $1::text)
             WHERE id = $2`,
            [conteudo.trim(), req.usuario.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao salvar instruções' });
    }
});

// Carta de Serviços global — leitura para todos
router.get('/carta', authMiddleware, async (req, res) => {
    try {
        const conteudo = await ctrl.buscarCartaServicos();
        res.json({ conteudo });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao ler carta' });
    }
});

// Carta de Serviços global — revisão com IA (só master)
router.post('/carta', authMiddleware, async (req, res) => {
    try {
        const r = await query('SELECT tipo FROM usuarios WHERE id = $1', [req.usuario.id]);
        if (!r.rows[0] || r.rows[0].tipo !== 'master') {
            return res.status(403).json({ erro: 'Apenas o master pode editar a carta de serviços' });
        }
        const { instrucao } = req.body;
        if (!instrucao || !instrucao.trim()) return res.status(400).json({ erro: 'Instrução vazia' });

        // Lê carta atual (com fallback para arquivo via helper do controller)
        const cartaAtual = await ctrl.buscarCartaServicos();

        // Usa IA para mesclar a instrução na carta
        const providerConfig = await ctrl.buscarConfigIA(req.usuario.id);
        const cartaAtualizada = await revisarCarta(cartaAtual, instrucao.trim(), providerConfig);

        // Salva no banco no usuário master
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('carta_servicos', $1::text) WHERE tipo = 'master'`,
            [cartaAtualizada]
        );
        // Invalida cache de sessão de todos os usuários ativos
        ctrl.invalidarCacheCartaSessoes();
        res.json({ success: true, conteudo: cartaAtualizada });
    } catch (e) {
        console.error('Erro ao revisar carta:', e);
        res.status(500).json({ erro: 'Erro ao revisar carta com IA' });
    }
});

// ── METAS DE ECONOMIA ────────────────────────────────────────────
router.get('/metas', authMiddleware, async (req, res) => {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const metas = r.rows[0]?.dados_financeiros?.metas || [];
        res.json({ success: true, metas });
    } catch { res.status(500).json({ success: false, message: 'Erro ao buscar metas.' }); }
});

router.post('/metas', authMiddleware, async (req, res) => {
    try {
        const { descricao, valor, prazo } = req.body;
        if (!descricao || !valor) return res.status(400).json({ success: false, message: 'Descrição e valor são obrigatórios.' });
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const df = r.rows[0]?.dados_financeiros || {};
        const metas = df.metas || [];
        const nova = { id: Date.now(), descricao, valor: parseFloat(valor), prazo: prazo || null, criada: new Date().toISOString().split('T')[0] };
        metas.push(nova);
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}' ::jsonb) || jsonb_build_object('metas', $1::jsonb) WHERE id = $2`,
            [JSON.stringify(metas), req.usuario.id]
        );
        res.json({ success: true, meta: nova });
    } catch { res.status(500).json({ success: false, message: 'Erro ao salvar meta.' }); }
});

router.delete('/metas/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const df = r.rows[0]?.dados_financeiros || {};
        const metas = (df.metas || []).filter(m => m.id !== id);
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}' ::jsonb) || jsonb_build_object('metas', $1::jsonb) WHERE id = $2`,
            [JSON.stringify(metas), req.usuario.id]
        );
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, message: 'Erro ao remover meta.' }); }
});

// ── ALERTAS DE ORÇAMENTO POR CATEGORIA ──────────────────────────
router.get('/orcamentos', authMiddleware, async (req, res) => {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const orcamentos = r.rows[0]?.dados_financeiros?.orcamentos || [];
        res.json({ success: true, orcamentos });
    } catch { res.status(500).json({ success: false, message: 'Erro ao buscar orçamentos.' }); }
});

router.post('/orcamentos', authMiddleware, async (req, res) => {
    try {
        const { categoria, limite } = req.body;
        if (!categoria || !limite) return res.status(400).json({ success: false, message: 'Categoria e limite são obrigatórios.' });
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const df = r.rows[0]?.dados_financeiros || {};
        const orcamentos = df.orcamentos || [];
        // Atualiza se já existe para essa categoria, senão adiciona
        const idx = orcamentos.findIndex(o => o.categoria.toLowerCase() === categoria.toLowerCase());
        const item = { id: Date.now(), categoria, limite: parseFloat(limite) };
        if (idx >= 0) orcamentos[idx] = item; else orcamentos.push(item);
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}' ::jsonb) || jsonb_build_object('orcamentos', $1::jsonb) WHERE id = $2`,
            [JSON.stringify(orcamentos), req.usuario.id]
        );
        res.json({ success: true, orcamento: item });
    } catch { res.status(500).json({ success: false, message: 'Erro ao salvar orçamento.' }); }
});

router.delete('/orcamentos/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [req.usuario.id]);
        const df = r.rows[0]?.dados_financeiros || {};
        const orcamentos = (df.orcamentos || []).filter(o => o.id !== id);
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}' ::jsonb) || jsonb_build_object('orcamentos', $1::jsonb) WHERE id = $2`,
            [JSON.stringify(orcamentos), req.usuario.id]
        );
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, message: 'Erro ao remover orçamento.' }); }
});

// ── TRATAMENTO DE ERRO DO MULTER ─────────────────────────────────
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'Arquivo muito grande (máx 10MB).' });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err.message?.includes('Tipo de arquivo')) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

module.exports = router;
