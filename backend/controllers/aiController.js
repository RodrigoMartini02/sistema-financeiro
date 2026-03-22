// ================================================================
// AI CONTROLLER - Gerencia todas as requisições do módulo IA
// ================================================================

const { query } = require('../config/database');
const { parsearDespesa, parsearReceita, responderPerguntaFinanceira, detectarIntencaoComIA } = require('../services/aiParser');
const { classificarCategoria, salvarAprendizado } = require('../services/categoryAI');
const { processarArquivo } = require('../services/ocrService');
const { analisarDocumentoComIA } = require('../services/visionService');
const { processarQRCodePIX, processarTextoPIX } = require('../services/pixReader');
const { parsearBoleto, encontrarLinhaDigitavel } = require('../services/boletoParser');
const { detectarRecorrencias, salvarRecorrencia, buscarRecorrencias } = require('../services/recurrenceDetector');
const { normalizarDespesa, validarCamposObrigatorios, perguntaParaCampo } = require('../utils/expenseNormalizer');

const fs = require('fs');

// ── SESSÕES DE CONVERSA (em memória, por usuário) ────────────────
const sessoes = new Map();

function obterSessao(usuarioId) {
    if (!sessoes.has(usuarioId)) {
        sessoes.set(usuarioId, {
            historico: [],
            despesaParcial: null,
            esperandoCampo: null,
            ultimaAcao: null,
            contextoSistema: null,      // { texto, carta, expira }
        });
    }
    return sessoes.get(usuarioId);
}

function limparSessao(usuarioId) {
    sessoes.delete(usuarioId);
}

// ── HELPER: Busca configuração de IA do usuário ───────────────────
async function buscarConfigIA(usuarioId) {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
        const df = r.rows[0]?.dados_financeiros || {};
        const provider       = df.ia_provider  || null;
        const apiKeys        = df.ia_api_keys  || {};
        const apiKey         = df.ia_api_key   || apiKeys[provider] || null;
        const instrucoesGen  = df.instrucoes_gen || '';
        return { provider, apiKey, apiKeys, instrucoesGen };
    } catch {
        return { provider: null, apiKey: null, apiKeys: {}, instrucoesGen: '' };
    }
}

// ── HELPER: Busca carta de serviços do usuário master no banco ────
async function buscarCartaServicos() {
    try {
        const r = await query(`SELECT dados_financeiros FROM usuarios WHERE tipo = 'master' LIMIT 1`);
        const carta = r.rows[0]?.dados_financeiros?.carta_servicos;
        if (carta) return carta;
        // Fallback para arquivo se ainda não migrado
        const fs = require('fs');
        const path = require('path');
        const CARTA_PATH = path.join(__dirname, '../../docs/gen-instrucoes.md');
        return fs.existsSync(CARTA_PATH) ? fs.readFileSync(CARTA_PATH, 'utf8') : '';
    } catch {
        return '';
    }
}

// ── Invalida cache da carta em todas as sessões ativas ────────────
function invalidarCacheCartaSessoes() {
    sessoes.forEach(function(sessao) {
        if (sessao.contextoSistema) {
            sessao.contextoSistema.carta = null;
            sessao.contextoSistema.expira = 0; // força refresh
        }
    });
}

// ── HELPER: Busca categorias do usuário ──────────────────────────
async function buscarCategorias(usuarioId) {
    try {
        const r = await query(
            'SELECT id, nome FROM categorias WHERE usuario_id = $1 ORDER BY nome',
            [usuarioId]
        );
        return r.rows;
    } catch {
        return [];
    }
}

// ── HELPER: Busca cartões do usuário ─────────────────────────────
async function buscarCartoes(usuarioId) {
    try {
        const r = await query(
            'SELECT id, nome FROM cartoes WHERE usuario_id = $1 AND ativo = true',
            [usuarioId]
        );
        return r.rows;
    } catch {
        return [];
    }
}

// ── HELPER: Busca dados financeiros resumidos ─────────────────────
async function buscarResumoFinanceiro(usuarioId, mes, ano) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    try {
        const [despesas, receitas, despesasPago] = await Promise.all([
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as total, categoria_id,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3
                   AND NOT (recorrente = true AND LOWER(forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))
                 GROUP BY categoria_id`,
                [usuarioId, m, a]
            ),
            query(
                'SELECT SUM(valor) as total FROM receitas WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
                [usuarioId, m, a]
            ),
            query(
                'SELECT SUM(COALESCE(valor_pago, valor)) as pago FROM despesas WHERE usuario_id = $1 AND mes = $2 AND ano = $3 AND pago = true',
                [usuarioId, m, a]
            )
        ]);

        const totalDespesas = despesas.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitas.rows[0]?.total || 0);
        const totalPago = parseFloat(despesasPago.rows[0]?.pago || 0);
        const totalEmAberto = Math.max(0, totalDespesas - totalPago);

        return {
            mes: m,
            ano: a,
            totalDespesas: parseFloat(totalDespesas.toFixed(2)),
            totalDespesasPago: parseFloat(totalPago.toFixed(2)),
            totalDespesasEmAberto: parseFloat(totalEmAberto.toFixed(2)),
            totalReceitas: parseFloat(totalReceitas.toFixed(2)),
            saldo: parseFloat((totalReceitas - totalDespesas).toFixed(2)),
            porCategoria: despesas.rows.map(r => ({
                categoria: r.categoria || 'Sem categoria',
                total: parseFloat(r.total || 0),
            }))
        };
    } catch {
        return { totalDespesas: 0, totalDespesasPago: 0, totalDespesasEmAberto: 0, totalReceitas: 0, saldo: 0, porCategoria: [] };
    }
}

// ── HELPER: Constrói contexto do sistema para enriquecer a IA ────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function buscarContextoSistema(usuarioId, mes, ano) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    try {
        const [categorias, cartoes, despesasMes, receitasMes, despesasRecentes] = await Promise.all([
            buscarCategorias(usuarioId),
            buscarCartoes(usuarioId),
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as total,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3
                   AND NOT (recorrente = true AND LOWER(forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))
                 GROUP BY categoria_id ORDER BY total DESC LIMIT 5`,
                [usuarioId, m, a]
            ),
            query(
                'SELECT SUM(valor) as total FROM receitas WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
                [usuarioId, m, a]
            ),
            query(
                `SELECT descricao, valor FROM despesas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3
                 ORDER BY criado_em DESC LIMIT 8`,
                [usuarioId, m, a]
            )
        ]);

        const totalDespesas = despesasMes.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitasMes.rows[0]?.total || 0);

        // Buscar total pago e em aberto separadamente
        const despesasPagoCtx = await query(
            'SELECT SUM(COALESCE(valor_pago, valor)) as pago FROM despesas WHERE usuario_id = $1 AND mes = $2 AND ano = $3 AND pago = true',
            [usuarioId, m, a]
        );
        const totalPagoCtx = parseFloat(despesasPagoCtx.rows[0]?.pago || 0);
        const totalEmAbertoCtx = Math.max(0, totalDespesas - totalPagoCtx);

        const linhas = [
            `Período atual: ${MESES[m]}/${a}`,
            `Categorias cadastradas: ${categorias.map(c => c.nome).join(', ') || 'nenhuma'}`,
            `Cartões do usuário: ${cartoes.map(c => c.nome).join(', ') || 'nenhum'}`,
            `Resumo do mês: Receitas R$ ${totalReceitas.toFixed(2)} | Despesas total R$ ${totalDespesas.toFixed(2)} (pagas R$ ${totalPagoCtx.toFixed(2)} | em aberto R$ ${totalEmAbertoCtx.toFixed(2)}) | Saldo R$ ${(totalReceitas - totalDespesas).toFixed(2)}`,
        ];

        if (despesasMes.rows.length > 0) {
            linhas.push(`Gastos por categoria: ${despesasMes.rows.map(r => `${r.categoria || 'Outros'} R$ ${parseFloat(r.total).toFixed(2)}`).join(', ')}`);
        }
        if (despesasRecentes.rows.length > 0) {
            linhas.push(`Despesas já registradas este mês: ${despesasRecentes.rows.map(r => `"${r.descricao}" R$ ${parseFloat(r.valor).toFixed(2)}`).join(', ')}`);
        }

        return linhas.join('\n');
    } catch {
        return '';
    }
}

// ================================================================
// POST /api/ai/chat
// Endpoint principal do assistente conversacional
// ================================================================
async function chat(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { mensagem, limpar_sessao, mes_atual, ano_atual } = req.body;

        if (!mensagem?.trim()) {
            return res.status(400).json({ success: false, message: 'Mensagem não pode estar vazia.' });
        }

        if (limpar_sessao) limparSessao(usuarioId);

        const sessao = obterSessao(usuarioId);
        const providerConfig = await buscarConfigIA(usuarioId);

        // ── Contexto do sistema (cache de 5 min) ────────────────
        const agora = Date.now();
        if (!sessao.contextoSistema || agora > sessao.contextoSistema.expira) {
            const texto = await buscarContextoSistema(usuarioId, mes_atual, ano_atual);
            const carta = await buscarCartaServicos();
            sessao.contextoSistema = { texto, carta, expira: agora + 5 * 60 * 1000 };
        }
        // Monta contexto: dados do sistema (separado das instruções personalizadas)
        const instrucoesUsuario = providerConfig.instrucoesGen || '';
        const ctxSistema = sessao.contextoSistema.texto;
        const cartaBase  = sessao.contextoSistema.carta || '';

        // Adiciona ao histórico
        sessao.historico.push({ role: 'user', content: mensagem });

        // Limita histórico a 20 mensagens
        if (sessao.historico.length > 20) {
            sessao.historico = sessao.historico.slice(-20);
        }

        let resposta = '';
        let acao = null;
        let dadosDespesa = null;

        // ── Se estava esperando campo específico ────────────────
        if (sessao.esperandoCampo && sessao.despesaParcial) {
            const campo = sessao.esperandoCampo;
            const valor = mensagem.trim();

            // Aplica o valor ao campo esperado
            if (campo === 'valor') {
                const { normalizarValor } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.valor = normalizarValor(valor);
            } else if (campo === 'forma_pagamento') {
                const { normalizarFormaPagamento } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.forma_pagamento = normalizarFormaPagamento(valor);
            } else if (campo === 'vencimento') {
                const { normalizarData } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.vencimento = normalizarData(valor);
            } else if (campo === 'parcelas') {
                sessao.despesaParcial.parcelas = parseInt(valor) || 1;
            } else if (campo === 'categoria') {
                sessao.despesaParcial.categoria = valor;
            } else {
                sessao.despesaParcial[campo] = valor;
            }

            sessao.esperandoCampo = null;
        }

        // ── Detecta intenção ────────────────────────────────────
        const intencao = await detectarIntencaoComIA(mensagem, sessao.historico, providerConfig);

        if (intencao === 'saudacao') {
            resposta = 'Olá! Sou a Gen, sua IA financeira do Fin-Gerence. Posso ajudá-lo a:\n\n• Cadastrar despesas (ex: "paguei 150 de mercado no pix")\n• Cadastrar receitas (ex: "recebi salário 3500 hoje")\n• Responder perguntas (ex: "quanto gastei esse mês")\n• Interpretar boletos, PIX e documentos\n\nComo posso ajudar?';
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'saudacao' });
        }

        if (intencao === 'receita') {
            const dadosReceita = await parsearReceita(mensagem, sessao.historico, providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
            const hoje = new Date().toISOString().split('T')[0];
            if (!dadosReceita.data || dadosReceita.data === 'HOJE') dadosReceita.data = hoje;
            if (!dadosReceita.descricao) dadosReceita.descricao = 'Receita';
            resposta = `Encontrei a seguinte receita:\n\n💰 **${dadosReceita.descricao}**\n${dadosReceita.valor ? `💵 Valor: R$ ${Number(dadosReceita.valor).toFixed(2).replace('.', ',')}\n` : ''}📅 Data: ${(dadosReceita.data || hoje).split('-').reverse().join('/')}\n\nDeseja confirmar o cadastro?`;
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'confirmar_receita', receita: dadosReceita });
        }

        if (intencao === 'analise') {
            const resumo = await buscarResumoFinanceiro(usuarioId, mes_atual, ano_atual);
            resposta = await responderPerguntaFinanceira(mensagem, resumo, sessao.historico.slice(-6), providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'analise', dados: resumo });
        }

        // ── Parseia despesa ─────────────────────────────────────
        let parsedResult;
        try {
            parsedResult = await parsearDespesa(mensagem, sessao.historico, false, providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
        } catch (err) {
            parsedResult = { dados: null, metodo: 'erro', intencao: 'despesa' };
        }

        let despesa = parsedResult.dados;

        // Mescla com despesa parcial da sessão
        if (sessao.despesaParcial) {
            for (const [k, v] of Object.entries(sessao.despesaParcial)) {
                if (v !== null && v !== undefined) {
                    despesa[k] = despesa[k] ?? v;
                }
            }
        }

        sessao.despesaParcial = despesa;

        // ── Verifica categorias do usuário ──────────────────────
        const categorias = await buscarCategorias(usuarioId);
        const nomesCategorias = categorias.map(c => c.nome);

        if (!despesa.categoria || despesa.categoria === 'Outros') {
            const instrucoesClassif = [cartaBase, instrucoesUsuario].filter(Boolean).join('\n\n');
            despesa.categoria = await classificarCategoria(
                despesa.descricao, usuarioId, nomesCategorias, instrucoesClassif
            );
        }

        // Mapeia categoria nome para ID
        const categoriaObj = categorias.find(c =>
            c.nome.toLowerCase() === (despesa.categoria || '').toLowerCase()
        );
        if (categoriaObj) despesa.categoria_id = categoriaObj.id;

        // ── Verifica campos obrigatórios ────────────────────────
        const faltando = validarCamposObrigatorios(despesa);

        if (faltando.length > 0) {
            const campo = faltando[0];
            sessao.esperandoCampo = campo;
            resposta = perguntaParaCampo(campo);
            sessao.historico.push({ role: 'assistant', content: resposta });

            return res.json({
                success: true,
                resposta,
                acao: 'aguardando_campo',
                campo_faltando: campo,
                despesa_parcial: despesa,
            });
        }

        // ── Despesa completa - retorna para confirmação ─────────
        acao = 'confirmar_despesa';
        dadosDespesa = despesa;
        sessao.ultimaAcao = 'despesa_completa';
        sessao.despesaParcial = null;
        sessao.esperandoCampo = null;

        const valorFormatado = `R$ ${Number(despesa.valor).toFixed(2).replace('.', ',')}`;
        const forma = formatarFormaPagamento(despesa.forma_pagamento);

        resposta = `Encontrei a seguinte despesa:\n\n📋 **${despesa.descricao}**\n💰 Valor: ${valorFormatado}\n🏷️ Categoria: ${despesa.categoria || 'Outros'}\n💳 Pagamento: ${forma}\n${despesa.vencimento ? `📅 Vencimento: ${formatarData(despesa.vencimento)}\n` : ''}${despesa.parcelas > 1 ? `🔢 Parcelas: ${despesa.parcelas}x\n` : ''}\nDeseja confirmar o cadastro?`;

        sessao.historico.push({ role: 'assistant', content: resposta });

        return res.json({
            success: true,
            resposta,
            acao,
            despesa: dadosDespesa,
            metodo_parser: parsedResult.metodo,
        });

    } catch (err) {
        console.error('Erro no chat IA:', err);
        res.status(500).json({ success: false, message: 'Erro interno do assistente.' });
    }
}

// ================================================================
// POST /api/ai/despesa
// Interpreta texto direto de despesa (sem contexto de conversa)
// ================================================================
async function interpretarDespesa(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { texto } = req.body;

        if (!texto?.trim()) {
            return res.status(400).json({ success: false, message: 'Texto da despesa não informado.' });
        }

        const providerCfg = await buscarConfigIA(usuarioId);
        const instrucoesGen = providerCfg.instrucoesGen || '';
        const cartaServicos = await buscarCartaServicos();
        const { dados, metodo } = await parsearDespesa(texto, [], false, providerCfg, '', cartaServicos, instrucoesGen);

        // Busca categorias e aplica classificação
        const categorias = await buscarCategorias(usuarioId);
        const nomesCategorias = categorias.map(c => c.nome);
        const instrucoesClassif = [cartaServicos, instrucoesGen].filter(Boolean).join('\n\n');
        dados.categoria = await classificarCategoria(dados.descricao, usuarioId, nomesCategorias, instrucoesClassif);

        const categoriaObj = categorias.find(c =>
            c.nome.toLowerCase() === dados.categoria.toLowerCase()
        );
        if (categoriaObj) dados.categoria_id = categoriaObj.id;

        const faltando = validarCamposObrigatorios(dados);

        return res.json({
            success: true,
            dados,
            campos_faltando: faltando,
            metodo_parser: metodo,
            completo: faltando.length === 0,
        });

    } catch (err) {
        console.error('Erro ao interpretar despesa:', err);
        res.status(500).json({ success: false, message: 'Erro ao interpretar texto.' });
    }
}

// ================================================================
// POST /api/ai/arquivo
// Processa upload de documento financeiro (imagem/PDF)
// ================================================================
async function processarArquivoUpload(req, res) {
    const filePath = req.file?.path;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }

        const mimeType = req.file.mimetype;
        const tamanhoMax = 10 * 1024 * 1024; // 10MB

        if (req.file.size > tamanhoMax) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, message: 'Arquivo muito grande (máx 10MB).' });
        }

        // ── 1. Tenta análise com IA Vision (mais precisa) ─────────
        const providerConfig = await buscarConfigIA(req.usuario.id);
        const visionResult = await analisarDocumentoComIA(filePath, mimeType, providerConfig);

        let resultado;
        if (visionResult) {
            // Usa resultado da IA Vision
            resultado = { sucesso: true, ...visionResult };
            // Se a IA extraiu linha digitável, confirma via parser para garantir valor/vencimento
            if (visionResult.linha_digitavel) {
                const boleto = parsearBoleto(visionResult.linha_digitavel);
                if (boleto.sucesso) {
                    resultado.boleto = boleto;
                    if (!resultado.valor && boleto.valor) resultado.valor = boleto.valor;
                    if (!resultado.vencimento && boleto.vencimento) resultado.vencimento = boleto.vencimento;
                    resultado.tipo = 'boleto';
                }
            }
        } else {
            // ── 2. Fallback: OCR + regex ──────────────────────────
            resultado = await processarArquivo(filePath, mimeType);
            // Tenta extrair linha digitável de boleto do texto OCR
            if (resultado.texto_bruto) {
                const linhaDigitavel = encontrarLinhaDigitavel(resultado.texto_bruto);
                if (linhaDigitavel) {
                    const boleto = parsearBoleto(linhaDigitavel);
                    if (boleto.sucesso) {
                        resultado.boleto = boleto;
                        if (!resultado.valor && boleto.valor) resultado.valor = boleto.valor;
                        if (!resultado.vencimento && boleto.vencimento) resultado.vencimento = boleto.vencimento;
                        resultado.tipo = 'boleto';
                    }
                }
            }
        }

        // ── Monta sugestão de despesa ─────────────────────────────
        const despesaSugerida = {
            descricao:  resultado.descricao || resultado.empresa || 'Documento financeiro',
            valor:      resultado.valor || null,
            vencimento: resultado.vencimento || null,
            data:       resultado.data || new Date().toISOString().split('T')[0],
            parcelas:   1,
            categoria:  resultado.categoria_sugerida || null,
        };

        return res.json({
            success: true,
            fonte: visionResult ? 'vision_ia' : 'ocr',
            arquivo: {
                nome: req.file.originalname,
                tipo: mimeType,
                tamanho: req.file.size,
            },
            resultado,
            despesa_sugerida: despesaSugerida,
        });

    } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar arquivo.' });
    } finally {
        // Remove arquivo temporário
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ================================================================
// POST /api/ai/pix
// Interpreta QR Code PIX de imagem ou texto
// ================================================================
async function interpretarPIX(req, res) {
    const filePath = req.file?.path;

    try {
        let resultado;

        if (req.file) {
            // QR Code em imagem
            resultado = await processarQRCodePIX(req.file.path);
        } else if (req.body.payload) {
            // Payload PIX em texto
            resultado = processarTextoPIX(req.body.payload);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Envie uma imagem com QR Code ou o payload PIX em texto.'
            });
        }

        return res.json({ success: true, ...resultado });

    } catch (err) {
        console.error('Erro ao interpretar PIX:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar PIX.' });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ================================================================
// POST /api/ai/boleto
// Interpreta linha digitável de boleto
// ================================================================
async function interpretarBoleto(req, res) {
    try {
        const { linha_digitavel, texto } = req.body;

        let linha = linha_digitavel;

        // Se veio como texto livre, tenta extrair a linha
        if (!linha && texto) {
            linha = encontrarLinhaDigitavel(texto);
        }

        if (!linha) {
            return res.status(400).json({
                success: false,
                message: 'Informe a linha digitável do boleto.'
            });
        }

        const resultado = parsearBoleto(linha);
        return res.json({ success: true, ...resultado });

    } catch (err) {
        console.error('Erro ao interpretar boleto:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar boleto.' });
    }
}

// ================================================================
// GET /api/ai/analise
// Análise financeira - responde perguntas sobre os dados
// ================================================================
async function analisarFinancas(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { pergunta, mes, ano } = req.query;

        if (!pergunta?.trim()) {
            return res.status(400).json({ success: false, message: 'Pergunta não informada.' });
        }

        const resumo = await buscarResumoFinanceiro(
            usuarioId,
            mes !== undefined ? parseInt(mes) : null,
            ano !== undefined ? parseInt(ano) : null
        );

        const sessao = obterSessao(usuarioId);
        const providerConfig = await buscarConfigIA(usuarioId);
        const instrucoesUsuario = providerConfig.instrucoesGen || '';

        // Usa cache de sessão igual ao chat(), com fallback para busca direta
        const agora = Date.now();
        if (!sessao.contextoSistema || agora > sessao.contextoSistema.expira) {
            const mAnal = mes !== undefined ? parseInt(mes) : null;
            const aAnal = ano !== undefined ? parseInt(ano) : null;
            const texto = await buscarContextoSistema(usuarioId, mAnal, aAnal);
            const carta = await buscarCartaServicos();
            sessao.contextoSistema = { texto, carta, expira: agora + 5 * 60 * 1000 };
        }
        const ctxSistemaAnalise = sessao.contextoSistema.texto;
        const cartaAnalise = sessao.contextoSistema.carta;

        const resposta = await responderPerguntaFinanceira(
            pergunta, resumo, sessao.historico.slice(-4), providerConfig, ctxSistemaAnalise, cartaAnalise, instrucoesUsuario
        );

        return res.json({
            success: true,
            pergunta,
            resposta,
            dados: resumo,
        });

    } catch (err) {
        console.error('Erro na análise financeira:', err);
        res.status(500).json({ success: false, message: 'Erro ao analisar finanças.' });
    }
}

// ================================================================
// GET /api/ai/recorrencias
// Detecta e lista despesas recorrentes
// ================================================================
async function listarRecorrencias(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { detectar } = req.query;

        if (detectar === 'true') {
            const sugestoes = await detectarRecorrencias(usuarioId);
            return res.json({ success: true, sugestoes, total: sugestoes.length });
        }

        const recorrencias = await buscarRecorrencias(usuarioId);
        return res.json({ success: true, recorrencias, total: recorrencias.length });

    } catch (err) {
        console.error('Erro ao listar recorrências:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar recorrências.' });
    }
}

// ================================================================
// POST /api/ai/recorrencias
// Salva uma recorrência confirmada pelo usuário
// ================================================================
async function confirmarRecorrencia(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const recorrencia = req.body;

        if (!recorrencia.descricao || !recorrencia.valor_medio) {
            return res.status(400).json({ success: false, message: 'Dados incompletos.' });
        }

        const ok = await salvarRecorrencia(usuarioId, recorrencia);
        return res.json({ success: ok, message: ok ? 'Recorrência salva!' : 'Erro ao salvar.' });

    } catch (err) {
        console.error('Erro ao confirmar recorrência:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
}

// ================================================================
// POST /api/ai/aprendizado
// Salva correção de categoria do usuário
// ================================================================
async function salvarAprendizadoCategoria(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { texto, categoria } = req.body;

        if (!texto || !categoria) {
            return res.status(400).json({ success: false, message: 'texto e categoria são obrigatórios.' });
        }

        await salvarAprendizado(usuarioId, texto, categoria);

        return res.json({ success: true, message: 'Aprendizado salvo! Usarei essa categoria no futuro.' });

    } catch (err) {
        console.error('Erro ao salvar aprendizado:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar aprendizado.' });
    }
}

// ================================================================
// POST /api/ai/config/chave
// Salva provedor e chave de IA por usuário
// ================================================================
async function salvarConfigChave(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { provider, api_key } = req.body;

        const provedoresValidos = ['gen', 'openai', 'gemini', 'claude'];
        if (!provider || !provedoresValidos.includes(provider)) {
            return res.status(400).json({ success: false, message: 'Provedor inválido. Use: gen, openai, gemini ou claude.' });
        }

        // Busca chaves já salvas para manter as de outros provedores
        const current   = await buscarConfigIA(usuarioId);
        const apiKeys   = current.apiKeys || {};

        // Chave vazia = manter a existente para este provedor
        const chaveAtual = api_key || apiKeys[provider] || null;

        if (provider !== 'gen' && !chaveAtual) {
            return res.status(400).json({ success: false, message: 'Chave de API obrigatória para esse provedor.' });
        }

        if (api_key) {
            if (provider === 'openai' && !api_key.startsWith('sk-')) {
                return res.status(400).json({ success: false, message: 'Chave OpenAI inválida. Deve começar com sk-' });
            }
            if (provider === 'claude' && !api_key.startsWith('sk-ant-')) {
                return res.status(400).json({ success: false, message: 'Chave Anthropic inválida. Deve começar com sk-ant-' });
            }
            // Atualiza chave deste provedor no mapa
            apiKeys[provider] = api_key;
        }

        const config = {
            ia_provider:  provider,
            ia_api_key:   provider === 'gen' ? null : chaveAtual,
            ia_api_keys:  apiKeys
        };

        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify(config), usuarioId]
        );

        const nomes = { gen: 'Gen (IA interna)', openai: 'OpenAI GPT-4o mini', gemini: 'Google Gemini', claude: 'Anthropic Claude Haiku' };
        return res.json({ success: true, message: `Configuração salva! Usando: ${nomes[provider]}` });

    } catch (err) {
        console.error('Erro ao salvar config IA:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configuração.' });
    }
}

// ================================================================
// GET /api/ai/config
// Retorna configuração de IA do usuário autenticado
// ================================================================
async function obterConfigIA(req, res) {
    try {
        const config   = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';
        const apiKeys  = config?.apiKeys  || {};
        const nomes    = { gen: 'Gen (IA interna)', openai: 'OpenAI GPT-4o mini', gemini: 'Google Gemini 2.0 Flash', claude: 'Anthropic Claude Haiku' };
        // has_keys: mapa de quais provedores têm chave salva (sem expor as chaves)
        const has_keys = { openai: !!apiKeys.openai, gemini: !!apiKeys.gemini, claude: !!apiKeys.claude };
        return res.json({ success: true, provider, nome: nomes[provider] || provider, tem_chave: !!config?.apiKey, has_keys });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar configuração.' });
    }
}

// ================================================================
// GET /api/ai/status
// Status do módulo IA
// ================================================================
async function status(req, res) {
    const openaiAtivo = !!process.env.OPENAI_API_KEY;

    res.json({
        success: true,
        modulo_ia: 'Gen',
        versao: '1.0.0',
        gen: {
            ativo: true,
            descricao: 'IA interna Fin-Gerence',
        },
        openai: {
            ativo: openaiAtivo,
            modelo: openaiAtivo ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : null,
        },
        funcionalidades: {
            chat: true,
            parser_texto: true,
            ocr: true,
            qr_code_pix: true,
            boleto: true,
            deteccao_recorrencia: true,
            aprendizado_categoria: true,
            analise_financeira: true,
        }
    });
}

// ── HELPERS ──────────────────────────────────────────────────────
function formatarFormaPagamento(forma) {
    const mapa = {
        'cartao_credito': 'Cartão de Crédito',
        'cartao_debito': 'Cartão de Débito',
        'pix': 'PIX',
        'dinheiro': 'Dinheiro',
        'transferencia': 'Transferência',
        'boleto': 'Boleto',
    };
    return mapa[forma] || forma || 'Dinheiro';
}

function formatarData(data) {
    if (!data) return '';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

module.exports = {
    chat,
    interpretarDespesa,
    processarArquivoUpload,
    interpretarPIX,
    interpretarBoleto,
    analisarFinancas,
    listarRecorrencias,
    confirmarRecorrencia,
    salvarAprendizadoCategoria,
    salvarConfigChave,
    obterConfigIA,
    status,
    buscarConfigIA,
    buscarCartaServicos,
    invalidarCacheCartaSessoes,
};
