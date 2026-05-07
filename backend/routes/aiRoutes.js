// ================================================================
// Gen Assistant Routes
// Rotas novas e legadas do assistente financeiro.
// ================================================================

const express = require('express');
const multer = require('multer');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const { revisarCarta } = require('../services/aiParser');
const workspace = require('../services/genWorkspaceService');
const ctrl = require('../controllers/aiController');

const router = express.Router();

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
        },
    }),
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG, WEBP, GIF ou PDF.'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});

async function getPersonalInstructions(req, res) {
    try {
        res.json({ conteudo: await workspace.getPersonalInstructions(req.usuario.id) });
    } catch {
        res.status(500).json({ erro: 'Erro ao ler instruções.' });
    }
}

async function savePersonalInstructions(req, res) {
    try {
        const { conteudo } = req.body;
        if (conteudo === undefined) return res.status(400).json({ erro: 'Conteúdo ausente.' });
        await workspace.savePersonalInstructions(req.usuario.id, conteudo);
        res.json({ success: true });
    } catch {
        res.status(500).json({ erro: 'Erro ao salvar instruções.' });
    }
}

async function getServiceLetter(req, res) {
    try {
        res.json({ conteudo: await ctrl.buscarCartaServicos() });
    } catch {
        res.status(500).json({ erro: 'Erro ao ler carta de serviços.' });
    }
}

async function reviseServiceLetter(req, res) {
    try {
        if (await workspace.userType(req.usuario.id) !== 'master') {
            return res.status(403).json({ erro: 'Apenas o master pode editar a carta de serviços.' });
        }

        const instrucao = String(req.body.instrucao || '').trim();
        if (!instrucao) return res.status(400).json({ erro: 'Instrução vazia.' });

        const cartaAtual = await ctrl.buscarCartaServicos();
        const providerConfig = await ctrl.buscarConfigIA(req.usuario.id);
        const cartaAtualizada = await revisarCarta(cartaAtual, instrucao, providerConfig);

        await workspace.saveServiceLetter(cartaAtualizada);
        ctrl.invalidarCacheCartaSessoes();
        res.json({ success: true, conteudo: cartaAtualizada });
    } catch (err) {
        console.error('Erro ao revisar carta:', err);
        res.status(500).json({ erro: 'Erro ao revisar carta com IA.' });
    }
}

async function listGoals(req, res) {
    try {
        res.json({ success: true, metas: await workspace.listGoals(req.usuario.id) });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao buscar metas.' });
    }
}

async function createGoal(req, res) {
    try {
        const { descricao, valor, prazo } = req.body;
        if (!descricao || !valor) return res.status(400).json({ success: false, message: 'Descrição e valor são obrigatórios.' });

        const metas = await workspace.listGoals(req.usuario.id);
        const meta = { id: Date.now(), descricao, valor: parseFloat(valor), prazo: prazo || null, criada: new Date().toISOString().split('T')[0] };
        metas.push(meta);

        await workspace.saveGoals(req.usuario.id, metas);
        res.json({ success: true, meta });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao salvar meta.' });
    }
}

async function deleteGoal(req, res) {
    try {
        const id = parseInt(req.params.id);
        const metas = (await workspace.listGoals(req.usuario.id)).filter(m => m.id !== id);
        await workspace.saveGoals(req.usuario.id, metas);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao remover meta.' });
    }
}

async function listBudgets(req, res) {
    try {
        res.json({ success: true, orcamentos: await workspace.listBudgets(req.usuario.id) });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao buscar orçamentos.' });
    }
}

async function upsertBudget(req, res) {
    try {
        const { categoria, limite } = req.body;
        if (!categoria || !limite) return res.status(400).json({ success: false, message: 'Categoria e limite são obrigatórios.' });

        const orcamentos = await workspace.listBudgets(req.usuario.id);
        const item = { id: Date.now(), categoria, limite: parseFloat(limite) };
        const idx = orcamentos.findIndex(o => o.categoria.toLowerCase() === categoria.toLowerCase());
        if (idx >= 0) orcamentos[idx] = { ...orcamentos[idx], ...item, id: orcamentos[idx].id };
        else orcamentos.push(item);

        await workspace.saveBudgets(req.usuario.id, orcamentos);
        res.json({ success: true, orcamento: idx >= 0 ? orcamentos[idx] : item });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao salvar orçamento.' });
    }
}

async function deleteBudget(req, res) {
    try {
        const id = parseInt(req.params.id);
        const orcamentos = (await workspace.listBudgets(req.usuario.id)).filter(o => o.id !== id);
        await workspace.saveBudgets(req.usuario.id, orcamentos);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Erro ao remover orçamento.' });
    }
}

function mountRoutes(prefix = '') {
    router.get(`${prefix}/health`, ctrl.getAssistantHealth);
    router.post(`${prefix}/conversation`, authMiddleware, ctrl.handleConversation);
    router.post(`${prefix}/expenses/parse`, authMiddleware, ctrl.parseExpenseDraft);
    router.post(`${prefix}/documents`, authMiddleware, upload.single('arquivo'), ctrl.analyzeFinancialDocument);
    router.post(`${prefix}/pix/parse`, authMiddleware, upload.single('imagem'), ctrl.parsePixPayload);
    router.post(`${prefix}/boletos/parse`, authMiddleware, ctrl.parseBoletoPayload);
    router.get(`${prefix}/recurrences`, authMiddleware, ctrl.listRecurrenceInsights);
    router.post(`${prefix}/recurrences`, authMiddleware, ctrl.confirmRecurrenceInsight);
    router.post(`${prefix}/category-learning`, authMiddleware, ctrl.saveCategoryLearning);
    router.get(`${prefix}/providers`, authMiddleware, ctrl.getProviderConfiguration);
    router.post(`${prefix}/providers`, authMiddleware, ctrl.saveProviderConfiguration);
    router.get(`${prefix}/providers/test`, authMiddleware, ctrl.validateProviderConfiguration);
    router.get(`${prefix}/financial-summary`, authMiddleware, ctrl.getAssistantFinancialOverview);
    router.post(`${prefix}/statements/import`, authMiddleware, upload.single('arquivo'), ctrl.importStatementWithAI);
    router.get(`${prefix}/personal-instructions`, authMiddleware, getPersonalInstructions);
    router.put(`${prefix}/personal-instructions`, authMiddleware, savePersonalInstructions);
    router.get(`${prefix}/service-letter`, authMiddleware, getServiceLetter);
    router.patch(`${prefix}/service-letter`, authMiddleware, reviseServiceLetter);
    router.get(`${prefix}/goals`, authMiddleware, listGoals);
    router.post(`${prefix}/goals`, authMiddleware, createGoal);
    router.delete(`${prefix}/goals/:id`, authMiddleware, deleteGoal);
    router.get(`${prefix}/budgets`, authMiddleware, listBudgets);
    router.post(`${prefix}/budgets`, authMiddleware, upsertBudget);
    router.delete(`${prefix}/budgets/:id`, authMiddleware, deleteBudget);
}

mountRoutes('');

// Compatibilidade com o frontend atual.
router.get('/status', ctrl.getAssistantHealth);
router.post('/chat', authMiddleware, ctrl.handleConversation);
router.post('/despesa', authMiddleware, ctrl.parseExpenseDraft);
router.post('/arquivo', authMiddleware, upload.single('arquivo'), ctrl.analyzeFinancialDocument);
router.post('/pix', authMiddleware, upload.single('imagem'), ctrl.parsePixPayload);
router.post('/boleto', authMiddleware, ctrl.parseBoletoPayload);
router.get('/recorrencias', authMiddleware, ctrl.listRecurrenceInsights);
router.post('/recorrencias', authMiddleware, ctrl.confirmRecurrenceInsight);
router.post('/aprendizado', authMiddleware, ctrl.saveCategoryLearning);
router.get('/config', authMiddleware, ctrl.getProviderConfiguration);
router.post('/config/chave', authMiddleware, ctrl.saveProviderConfiguration);
router.get('/test', authMiddleware, ctrl.validateProviderConfiguration);
router.get('/resumo', authMiddleware, ctrl.getAssistantFinancialOverview);
router.post('/extrato', authMiddleware, upload.single('arquivo'), ctrl.importStatementWithAI);
router.get('/instrucoes', authMiddleware, getPersonalInstructions);
router.post('/instrucoes', authMiddleware, savePersonalInstructions);
router.get('/carta', authMiddleware, getServiceLetter);
router.post('/carta', authMiddleware, reviseServiceLetter);
router.get('/metas', authMiddleware, listGoals);
router.post('/metas', authMiddleware, createGoal);
router.delete('/metas/:id', authMiddleware, deleteGoal);
router.get('/orcamentos', authMiddleware, listBudgets);
router.post('/orcamentos', authMiddleware, upsertBudget);
router.delete('/orcamentos/:id', authMiddleware, deleteBudget);

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'Arquivo muito grande (máx 10MB).' });
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err.message?.includes('Tipo de arquivo')) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

module.exports = router;
