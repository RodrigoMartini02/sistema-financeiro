// ================================================================
// AI CONTROLLER - Gerencia todas as requisições do módulo IA
// ================================================================

const { query } = require('../config/database');
const { parsearDespesa, responderPerguntaFinanceira, detectarIntencao } = require('../services/aiParser');
const { classificarCategoria, salvarAprendizado } = require('../services/categoryAI');
const { processarArquivo } = require('../services/ocrService');
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
            historico: [], // formato OpenAI: [{role, content}]
            despesaParcial: null,
            esperandoCampo: null,
            ultimaAcao: null,
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
        const provider = df.ia_provider || null;
        const apiKey   = df.ia_api_key   || null;
        return provider && provider !== 'gen' && apiKey ? { provider, apiKey } : null;
    } catch {
        return null;
    }
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
        const [despesas, receitas] = await Promise.all([
            query(
                `SELECT SUM(valor) as total, categoria_id,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3
                 GROUP BY categoria_id`,
                [usuarioId, m, a]
            ),
            query(
                'SELECT SUM(valor) as total FROM receitas WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
                [usuarioId, m, a]
            )
        ]);

        const totalDespesas = despesas.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitas.rows[0]?.total || 0);

        return {
            mes: m,
            ano: a,
            totalDespesas: parseFloat(totalDespesas.toFixed(2)),
            totalReceitas: parseFloat(totalReceitas.toFixed(2)),
            saldo: parseFloat((totalReceitas - totalDespesas).toFixed(2)),
            porCategoria: despesas.rows.map(r => ({
                categoria: r.categoria || 'Sem categoria',
                total: parseFloat(r.total || 0),
            }))
        };
    } catch {
        return { totalDespesas: 0, totalReceitas: 0, saldo: 0, porCategoria: [] };
    }
}

// ================================================================
// POST /api/ai/chat
// Endpoint principal do assistente conversacional
// ================================================================
async function chat(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { mensagem, limpar_sessao } = req.body;

        if (!mensagem?.trim()) {
            return res.status(400).json({ success: false, message: 'Mensagem não pode estar vazia.' });
        }

        if (limpar_sessao) limparSessao(usuarioId);

        const sessao = obterSessao(usuarioId);
        const providerConfig = await buscarConfigIA(usuarioId);

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
        const intencao = detectarIntencao(mensagem);

        if (intencao === 'saudacao') {
            resposta = 'Olá! Sou a Gen, sua IA financeira do Fin-Gerence. Posso ajudá-lo a:\n\n• Cadastrar despesas (ex: "paguei 150 de mercado no pix")\n• Cadastrar receitas (ex: "recebi salário 3500 hoje")\n• Responder perguntas (ex: "quanto gastei esse mês")\n• Interpretar boletos, PIX e documentos\n\nComo posso ajudar?';
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'saudacao' });
        }

        if (intencao === 'receita') {
            // Parse básico de receita a partir do texto
            const valorMatch = mensagem.match(/(\d+(?:[.,]\d{1,2})?)/);
            const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null;
            const hoje = new Date().toISOString().split('T')[0];
            // Remove palavras-chave e extrai descrição
            let descricao = mensagem
                .replace(/recebi|ganhei|entrou|salário|salario|freelance|renda/gi, '')
                .replace(/R\$\s*[\d.,]+/gi, '')
                .replace(/[\d.,]+\s*reais?/gi, '')
                .replace(/pix|dinheiro|hoje|ontem/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            descricao = descricao.replace(/^(?:de|do|da|um|uma|o|a)\s+/i, '').trim();
            if (!descricao) descricao = 'Receita';
            descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

            const dadosReceita = { descricao, valor, data: hoje };
            resposta = `Encontrei a seguinte receita:\n\n💰 **${descricao}**\n${valor ? `💵 Valor: R$ ${Number(valor).toFixed(2).replace('.', ',')}\n` : ''}📅 Data: ${hoje.split('-').reverse().join('/')}\n\nDeseja confirmar o cadastro?`;
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'confirmar_receita', receita: dadosReceita });
        }

        if (intencao === 'analise') {
            const resumo = await buscarResumoFinanceiro(usuarioId);
            resposta = await responderPerguntaFinanceira(mensagem, resumo, sessao.historico.slice(-6), providerConfig);
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'analise', dados: resumo });
        }

        // ── Parseia despesa ─────────────────────────────────────
        let parsedResult;
        try {
            parsedResult = await parsearDespesa(mensagem, sessao.historico, false, providerConfig);
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
            despesa.categoria = await classificarCategoria(
                despesa.descricao, usuarioId, nomesCategorias
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

        const { dados, metodo } = await parsearDespesa(texto, [], false);

        // Busca categorias e aplica classificação
        const categorias = await buscarCategorias(usuarioId);
        const nomesCategorias = categorias.map(c => c.nome);
        dados.categoria = await classificarCategoria(dados.descricao, usuarioId, nomesCategorias);

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

        const resultado = await processarArquivo(filePath, mimeType);

        // Tenta extrair linha digitável de boleto do texto
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

        // Monta sugestão de despesa
        const despesaSugerida = {
            descricao: resultado.descricao || resultado.empresa || 'Documento financeiro',
            valor: resultado.valor,
            forma_pagamento: resultado.tipo === 'boleto' ? 'boleto' : resultado.tipo === 'comprovante' ? 'pix' : 'dinheiro',
            vencimento: resultado.vencimento,
            data: resultado.data || new Date().toISOString().split('T')[0],
            parcelas: 1,
        };

        return res.json({
            success: true,
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
        const resposta = await responderPerguntaFinanceira(
            pergunta, resumo, sessao.historico.slice(-4), providerConfig
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
// POST /api/ai/despesa/salvar
// Salva despesa diretamente via IA (usado pela página ia.html)
// ================================================================
async function salvarDespesaIA(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { descricao, valor, forma_pagamento, data, vencimento, parcelas, categoria_id, cartao_id, ja_pago, recorrente } = req.body;

        if (!descricao || !valor || !forma_pagamento || !data) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: descricao, valor, forma_pagamento, data.' });
        }

        const dataVenc = vencimento || data;
        const dataObj = new Date(dataVenc);
        const mes = dataObj.getMonth();
        const ano = dataObj.getFullYear();
        const totalParcelas = parseInt(parcelas) || 1;
        const parcelado = totalParcelas > 1;
        const pago = !!ja_pago;
        const ehRecorrente = !!recorrente;

        // Busca categoria padrão se não informada
        let categoriaFinal = categoria_id || null;
        if (!categoriaFinal) {
            const catR = await query('SELECT id FROM categorias WHERE usuario_id = $1 ORDER BY id ASC LIMIT 1', [usuarioId]);
            if (catR.rows.length > 0) categoriaFinal = catR.rows[0].id;
        }

        const result = await query(
            `INSERT INTO despesas (
                usuario_id, descricao, valor, data_vencimento, data_compra,
                mes, ano, categoria_id, cartao_id, forma_pagamento,
                parcelado, numero_parcelas, parcela_atual, pago, recorrente
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING id, descricao, valor`,
            [
                usuarioId, descricao, parseFloat(valor), dataVenc, data,
                mes, ano, categoriaFinal || null, cartao_id || null, forma_pagamento,
                parcelado, parcelado ? totalParcelas : null, parcelado ? 1 : null, pago, ehRecorrente
            ]
        );

        // Salva aprendizado de categoria
        if (categoriaFinal) {
            const catR = await query('SELECT nome FROM categorias WHERE id = $1', [categoriaFinal]);
            if (catR.rows.length > 0) {
                await salvarAprendizado(usuarioId, descricao, catR.rows[0].nome).catch(() => {});
            }
        }

        return res.json({ success: true, message: `Despesa "${descricao}" cadastrada!`, data: result.rows[0] });

    } catch (err) {
        console.error('Erro ao salvar despesa via IA:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar despesa.' });
    }
}

// ================================================================
// POST /api/ai/receita/salvar
// Salva receita diretamente via IA (usado pela página ia.html)
// ================================================================
async function salvarReceitaIA(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { descricao, valor, data } = req.body;

        if (!descricao || !valor || !data) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: descricao, valor, data.' });
        }

        const dataObj = new Date(data);
        const mes = dataObj.getMonth();
        const ano = dataObj.getFullYear();

        const result = await query(
            `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, descricao, valor`,
            [usuarioId, descricao, parseFloat(valor), data, mes, ano]
        );

        return res.json({ success: true, message: `Receita "${descricao}" cadastrada!`, data: result.rows[0] });

    } catch (err) {
        console.error('Erro ao salvar receita via IA:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar receita.' });
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

        if (provider !== 'gen' && !api_key) {
            return res.status(400).json({ success: false, message: 'Chave de API obrigatória para esse provedor.' });
        }

        if (provider === 'openai' && !api_key.startsWith('sk-')) {
            return res.status(400).json({ success: false, message: 'Chave OpenAI inválida. Deve começar com sk-' });
        }

        if (provider === 'claude' && !api_key.startsWith('sk-ant-')) {
            return res.status(400).json({ success: false, message: 'Chave Anthropic inválida. Deve começar com sk-ant-' });
        }

        const config = { ia_provider: provider, ia_api_key: provider === 'gen' ? null : api_key };

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
        const config = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';
        const nomes = { gen: 'Gen (IA interna)', openai: 'OpenAI GPT-4o mini', gemini: 'Google Gemini 2.0 Flash', claude: 'Anthropic Claude Haiku' };
        return res.json({ success: true, provider, nome: nomes[provider] || provider, tem_chave: !!config?.apiKey });
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
    salvarDespesaIA,
    salvarReceitaIA,
    salvarConfigChave,
    obterConfigIA,
    status,
};
