// ================================================================
// AI ROUTES - Endpoints do módulo de Inteligência Artificial
// ================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs   = require('fs');
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

// Análise financeira - responde perguntas
router.get('/analise', authMiddleware, ctrl.analisarFinancas);

// Recorrências detectadas/confirmadas
router.get('/recorrencias', authMiddleware, ctrl.listarRecorrencias);
router.post('/recorrencias', authMiddleware, ctrl.confirmarRecorrencia);

// Aprendizado de categoria
router.post('/aprendizado', authMiddleware, ctrl.salvarAprendizadoCategoria);

// Configuração de provedor de IA por usuário
router.get('/config', authMiddleware, ctrl.obterConfigIA);
router.post('/config/chave', authMiddleware, ctrl.salvarConfigChave);

// Instruções da Gen
const INSTRUCOES_PATH = path.join(__dirname, '../../docs/gen-instrucoes.md');

router.get('/instrucoes', authMiddleware, (req, res) => {
    try {
        const conteudo = fs.existsSync(INSTRUCOES_PATH)
            ? fs.readFileSync(INSTRUCOES_PATH, 'utf8')
            : '';
        res.json({ conteudo });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao ler instruções' });
    }
});

router.post('/instrucoes', authMiddleware, (req, res) => {
    try {
        const { conteudo } = req.body;
        if (!conteudo || !conteudo.trim()) return res.status(400).json({ erro: 'Conteúdo vazio' });
        const atual = fs.existsSync(INSTRUCOES_PATH)
            ? fs.readFileSync(INSTRUCOES_PATH, 'utf8')
            : '# Instruções da Gen\n';
        fs.writeFileSync(INSTRUCOES_PATH, atual + '\n' + conteudo.trim(), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao salvar instruções' });
    }
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
