// ================================================================
// FIN GERENCE AI - Frontend do Módulo de Inteligência Artificial
// ================================================================

const IA = (() => {

    // ── CONFIGURAÇÃO ─────────────────────────────────────────────
    const API_URL = (() => {
        if (typeof window.API_BASE_URL !== 'undefined') return window.API_BASE_URL;
        if (typeof CONFIG !== 'undefined' && CONFIG.API_URL) return CONFIG.API_URL;
        return 'http://localhost:3010';
    })();

    // ── ESTADO ────────────────────────────────────────────────────
    let estado = {
        enviando: false,
        gravandoVoz: false,
        despesaPendente: null,
        categorias: [],
        cartoes: [],
        arquivoPendente: null,
        reconhecimento: null,
        sessaoAtiva: true,
        aprendizadoPendente: null,
    };

    // ── HELPERS DE API ────────────────────────────────────────────
    function getToken() {
        return sessionStorage.getItem('token') || localStorage.getItem('token');
    }

    async function apiPost(endpoint, body) {
        const r = await fetch(`${API_URL}/api/ai${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
            },
            body: JSON.stringify(body),
        });
        return r.json();
    }

    async function apiGet(endpoint) {
        const r = await fetch(`${API_URL}/api/ai${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        return r.json();
    }

    async function apiPostForm(endpoint, formData) {
        const r = await fetch(`${API_URL}/api/ai${endpoint}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
        });
        return r.json();
    }

    async function apiDespesas(despesa) {
        const r = await fetch(`${API_URL}/api/despesas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
            },
            body: JSON.stringify(despesa),
        });
        return r.json();
    }

    async function apiCategorias() {
        const r = await fetch(`${API_URL}/api/categorias`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await r.json();
        return data.categorias || data.data || [];
    }

    async function apiCartoes() {
        const r = await fetch(`${API_URL}/api/cartoes`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await r.json();
        return data.cartoes || data.data || [];
    }

    // ── INICIALIZAÇÃO ─────────────────────────────────────────────
    async function inicializar() {
        try {
            setStatus('inicializando', 'Conectando...');

            // Verifica autenticação
            const token = getToken();
            if (!token) {
                window.location.replace('login.html');
                return;
            }

            // Carrega categorias e cartões em paralelo
            [estado.categorias, estado.cartoes] = await Promise.all([
                apiCategorias().catch(() => []),
                apiCartoes().catch(() => []),
            ]);

            // Preenche selects do modal
            preencherSelectCategorias();
            preencherSelectCartoes();

            // Verifica status do módulo IA
            const statusIA = await apiGet('/status').catch(() => null);

            if (statusIA?.openai?.ativo) {
                setStatus('ia', `IA Ativa (${statusIA.openai.modelo})`);
            } else {
                setStatus('online', 'Modo Heurístico (sem OpenAI)');
            }

            // Configura eventos
            configurarEventos();

            // Foca no input
            document.getElementById('ia-texto-input')?.focus();

        } catch (err) {
            console.error('Erro ao inicializar IA:', err);
            setStatus('offline', 'Erro de conexão');
            adicionarMensagemSistema('⚠️ Erro ao conectar ao servidor. Verifique sua conexão.');
        }
    }

    function configurarEventos() {
        // Controla exibição do campo de cartão
        document.getElementById('ia-campo-forma-pagamento')?.addEventListener('change', (e) => {
            const rowCartao = document.getElementById('row-cartao');
            if (rowCartao) {
                rowCartao.style.display = e.target.value.includes('cartao') ? 'grid' : 'none';
            }
        });
    }

    function setStatus(tipo, texto) {
        const dot = document.getElementById('ia-status-dot');
        const txt = document.getElementById('ia-status-text');
        if (dot) {
            dot.className = `ia-status-dot ${tipo}`;
        }
        if (txt) txt.textContent = texto;
    }

    // ── CHAT ──────────────────────────────────────────────────────
    async function enviarMensagem() {
        const input = document.getElementById('ia-texto-input');
        const texto = input?.value?.trim();

        if (!texto && !estado.arquivoPendente) return;
        if (estado.enviando) return;

        // Processa arquivo se houver
        if (estado.arquivoPendente) {
            await processarArquivoEnvio();
            return;
        }

        input.value = '';
        autoResize(input);
        estado.enviando = true;
        document.getElementById('ia-btn-send').disabled = true;

        // Oculta welcome se visível
        ocultarWelcome();

        // Adiciona mensagem do usuário
        adicionarMensagem(texto, 'user');

        // Mostra indicador de digitação
        const typingId = adicionarTyping();

        try {
            const res = await apiPost('/chat', { mensagem: texto });

            removerTyping(typingId);

            if (!res.success) {
                adicionarMensagemAI('Desculpe, ocorreu um erro. Tente novamente.');
                return;
            }

            const resposta = res.resposta || '';

            if (res.acao === 'confirmar_despesa' && res.despesa) {
                // Exibe card de confirmação
                adicionarMensagemAIComDespesa(resposta, res.despesa);
                estado.despesaPendente = res.despesa;
            } else {
                adicionarMensagemAI(resposta);
            }

        } catch (err) {
            removerTyping(typingId);
            console.error('Erro no chat:', err);
            adicionarMensagemAI('Não consegui me conectar ao servidor. Tente novamente.');
        } finally {
            estado.enviando = false;
            document.getElementById('ia-btn-send').disabled = false;
        }
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            enviarMensagem();
        }
    }

    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function preencherInput(texto) {
        const input = document.getElementById('ia-texto-input');
        if (input) {
            input.value = texto;
            input.focus();
            autoResize(input);
        }
    }

    function enviarAcaoRapida(texto) {
        preencherInput(texto);
        enviarMensagem();
    }

    function limparConversa() {
        const chatArea = document.getElementById('ia-chat-area');
        if (!chatArea) return;

        estado.despesaPendente = null;
        estado.aprendizadoPendente = null;

        // Mostra welcome novamente
        chatArea.innerHTML = `
            <div class="ia-welcome">
                <div class="ia-welcome-icon"><i class="fas fa-robot"></i></div>
                <h2>Nova Conversa</h2>
                <p>Pronto para uma nova consulta! O que posso fazer por você?</p>
                <div class="ia-welcome-chips">
                    <span onclick="IA.preencherInput('paguei 150 de mercado no pix')">💸 Cadastrar despesa</span>
                    <span onclick="IA.preencherInput('quanto gastei esse mês')">📊 Analisar gastos</span>
                    <span onclick="IA.abrirUpload()">📄 Enviar documento</span>
                    <span onclick="IA.abrirBoleto()">🏦 Ler boleto</span>
                </div>
            </div>`;

        // Limpa sessão no backend
        apiPost('/chat', { mensagem: 'nova sessao', limpar_sessao: true }).catch(() => {});
    }

    // ── RENDERIZAÇÃO DE MENSAGENS ─────────────────────────────────
    function adicionarMensagem(texto, tipo) {
        const chatArea = document.getElementById('ia-chat-area');
        if (!chatArea) return;

        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isUser = tipo === 'user';

        const div = document.createElement('div');
        div.className = `ia-msg ia-msg--${tipo}`;
        div.innerHTML = `
            <div class="ia-msg-avatar">
                <i class="fas fa-${isUser ? 'user' : 'robot'}"></i>
            </div>
            <div>
                <div class="ia-msg-bubble">${formatarTexto(texto)}</div>
                <div class="ia-msg-time">${hora}</div>
            </div>`;

        chatArea.appendChild(div);
        rolarParaBaixo();
        return div;
    }

    function adicionarMensagemAI(texto) {
        return adicionarMensagem(texto, 'ai');
    }

    function adicionarMensagemSistema(texto) {
        const chatArea = document.getElementById('ia-chat-area');
        if (!chatArea) return;

        const div = document.createElement('div');
        div.className = 'ia-msg ia-msg--system';
        div.innerHTML = `<div class="ia-msg-bubble">${formatarTexto(texto)}</div>`;
        chatArea.appendChild(div);
        rolarParaBaixo();
    }

    function adicionarMensagemAIComDespesa(texto, despesa) {
        const chatArea = document.getElementById('ia-chat-area');
        if (!chatArea) return;

        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const valor = Number(despesa.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const forma = formatarFormaPagamento(despesa.forma_pagamento);

        const div = document.createElement('div');
        div.className = 'ia-msg ia-msg--ai';
        div.innerHTML = `
            <div class="ia-msg-avatar"><i class="fas fa-robot"></i></div>
            <div>
                <div class="ia-msg-bubble">
                    ${formatarTexto(texto)}
                    <div class="ia-despesa-card">
                        <div class="ia-dc-row">
                            <span class="ia-dc-label">Descrição</span>
                            <span class="ia-dc-value">${esc(despesa.descricao)}</span>
                        </div>
                        <div class="ia-dc-row">
                            <span class="ia-dc-label">Valor</span>
                            <span class="ia-dc-valor">${valor}</span>
                        </div>
                        <div class="ia-dc-row">
                            <span class="ia-dc-label">Categoria</span>
                            <span class="ia-dc-value">${esc(despesa.categoria || 'Outros')}</span>
                        </div>
                        <div class="ia-dc-row">
                            <span class="ia-dc-label">Pagamento</span>
                            <span class="ia-dc-value">${esc(forma)}</span>
                        </div>
                        ${despesa.parcelas > 1 ? `<div class="ia-dc-row"><span class="ia-dc-label">Parcelas</span><span class="ia-dc-value">${despesa.parcelas}x</span></div>` : ''}
                    </div>
                    <div class="ia-msg-actions">
                        <button class="ia-msg-action-btn confirmar" onclick="IA.abrirModalDespesa()">
                            <i class="fas fa-check"></i> Confirmar
                        </button>
                        <button class="ia-msg-action-btn editar" onclick="IA.abrirModalDespesa()">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="ia-msg-action-btn cancelar" onclick="IA.cancelarDespesa()">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                </div>
                <div class="ia-msg-time">${hora}</div>
            </div>`;

        chatArea.appendChild(div);
        rolarParaBaixo();
    }

    function adicionarTyping() {
        const chatArea = document.getElementById('ia-chat-area');
        if (!chatArea) return null;

        const id = `typing-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'ia-msg ia-msg--ai';
        div.id = id;
        div.innerHTML = `
            <div class="ia-msg-avatar"><i class="fas fa-robot"></i></div>
            <div class="ia-msg-bubble">
                <div class="ia-typing">
                    <span></span><span></span><span></span>
                </div>
            </div>`;
        chatArea.appendChild(div);
        rolarParaBaixo();
        return id;
    }

    function removerTyping(id) {
        if (id) document.getElementById(id)?.remove();
    }

    function rolarParaBaixo() {
        const chatArea = document.getElementById('ia-chat-area');
        if (chatArea) {
            setTimeout(() => {
                chatArea.scrollTop = chatArea.scrollHeight;
            }, 50);
        }
    }

    function ocultarWelcome() {
        document.querySelector('.ia-welcome')?.remove();
    }

    // ── MODAL DE DESPESA ──────────────────────────────────────────
    function abrirModalDespesa(dados) {
        const despesa = dados || estado.despesaPendente;
        if (!despesa) return;

        estado.despesaPendente = despesa;

        // Preenche os campos
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== null && val !== undefined) el.value = val;
        };

        set('ia-campo-descricao', despesa.descricao || '');
        set('ia-campo-valor', despesa.valor || '');
        set('ia-campo-forma-pagamento', despesa.forma_pagamento || 'dinheiro');
        set('ia-campo-parcelas', despesa.parcelas || 1);
        set('ia-campo-data', despesa.data || new Date().toISOString().split('T')[0]);
        set('ia-campo-vencimento', despesa.vencimento || '');

        // Categoria
        if (despesa.categoria_id) {
            set('ia-campo-categoria', despesa.categoria_id);
        } else if (despesa.categoria) {
            const opt = [...document.getElementById('ia-campo-categoria')?.options || []]
                .find(o => o.text.toLowerCase() === despesa.categoria.toLowerCase());
            if (opt) set('ia-campo-categoria', opt.value);
        }

        // Exibe campo cartão se necessário
        const rowCartao = document.getElementById('row-cartao');
        if (rowCartao) {
            rowCartao.style.display = despesa.forma_pagamento?.includes('cartao') ? 'grid' : 'none';
        }

        // Sugestão de aprendizado
        const hintEl = document.getElementById('ia-aprendizado-hint');
        const textoEl = document.getElementById('ia-aprendizado-texto');
        if (hintEl && textoEl && despesa.descricao && despesa.categoria) {
            textoEl.textContent = despesa.descricao;
            hintEl.style.display = 'flex';
            estado.aprendizadoPendente = {
                texto: despesa.descricao,
                categoria: despesa.categoria,
            };
        } else if (hintEl) {
            hintEl.style.display = 'none';
        }

        abrirModal('modal-confirmar-despesa');
    }

    async function salvarDespesa(event) {
        event.preventDefault();

        const despesa = {
            descricao: document.getElementById('ia-campo-descricao').value.trim(),
            valor: parseFloat(document.getElementById('ia-campo-valor').value),
            categoria_id: parseInt(document.getElementById('ia-campo-categoria').value) || null,
            forma_pagamento: document.getElementById('ia-campo-forma-pagamento').value,
            cartao_id: parseInt(document.getElementById('ia-campo-cartao').value) || null,
            numero_parcelas: parseInt(document.getElementById('ia-campo-parcelas').value) || 1,
            data_vencimento: document.getElementById('ia-campo-vencimento').value ||
                             document.getElementById('ia-campo-data').value,
            data_compra: document.getElementById('ia-campo-data').value,
            mes: new Date(document.getElementById('ia-campo-data').value + 'T12:00:00').getMonth(),
            ano: new Date(document.getElementById('ia-campo-data').value + 'T12:00:00').getFullYear(),
            parcelado: parseInt(document.getElementById('ia-campo-parcelas').value) > 1,
            parcela_atual: 1,
        };

        try {
            const btn = event.target.querySelector('button[type=submit]');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

            const res = await apiDespesas(despesa);

            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Despesa'; }

            if (res.success || res.id || (res.despesa && res.despesa.id)) {
                fecharModal('modal-confirmar-despesa');
                estado.despesaPendente = null;

                adicionarMensagemSistema('✅ Despesa cadastrada com sucesso!');

                // Salva aprendizado se confirmado
                if (estado.aprendizadoPendente) {
                    const catSelect = document.getElementById('ia-campo-categoria');
                    const catNome = catSelect?.options[catSelect.selectedIndex]?.text || despesa.categoria_nome;
                    if (catNome) {
                        await apiPost('/aprendizado', {
                            texto: estado.aprendizadoPendente.texto,
                            categoria: catNome,
                        }).catch(() => {});
                    }
                    estado.aprendizadoPendente = null;
                }
            } else {
                adicionarMensagemSistema('❌ Erro ao salvar: ' + (res.message || 'Tente novamente.'));
            }

        } catch (err) {
            console.error('Erro ao salvar despesa:', err);
            adicionarMensagemSistema('❌ Erro de conexão. Tente novamente.');
        }
    }

    function cancelarDespesa() {
        estado.despesaPendente = null;
        adicionarMensagemSistema('Operação cancelada.');
    }

    async function confirmarAprendizado() {
        if (!estado.aprendizadoPendente) return;
        const catSelect = document.getElementById('ia-campo-categoria');
        const catNome = catSelect?.options[catSelect.selectedIndex]?.text;

        if (catNome) {
            await apiPost('/aprendizado', {
                texto: estado.aprendizadoPendente.texto,
                categoria: catNome,
            }).catch(() => {});
            document.getElementById('ia-aprendizado-hint').style.display = 'none';
            estado.aprendizadoPendente = null;
            adicionarMensagemSistema('🧠 Aprendizado salvo! Vou usar essa categoria automaticamente.');
        }
    }

    // ── UPLOAD DE ARQUIVO ─────────────────────────────────────────
    function abrirUpload() {
        document.getElementById('ia-file-input')?.click();
    }

    function processarArquivo(input) {
        const file = input.files[0];
        if (!file) return;

        estado.arquivoPendente = file;

        const preview = document.getElementById('ia-file-preview');
        const nome = document.getElementById('ia-file-nome');
        if (preview) preview.style.display = 'flex';
        if (nome) nome.textContent = file.name;

        adicionarMensagemSistema(`📎 Arquivo "${file.name}" selecionado. Pressione enviar para processar.`);
        document.getElementById('ia-texto-input')?.focus();
    }

    function cancelarArquivo() {
        estado.arquivoPendente = null;
        const preview = document.getElementById('ia-file-preview');
        if (preview) preview.style.display = 'none';
        const fileInput = document.getElementById('ia-file-input');
        if (fileInput) fileInput.value = '';
    }

    async function processarArquivoEnvio() {
        if (!estado.arquivoPendente) return;

        const file = estado.arquivoPendente;
        const typingId = adicionarTyping();
        ocultarWelcome();
        estado.enviando = true;

        adicionarMensagem(`📄 Processando "${file.name}"...`, 'user');
        cancelarArquivo();

        try {
            const formData = new FormData();
            formData.append('arquivo', file);

            const res = await apiPostForm('/arquivo', formData);

            removerTyping(typingId);

            if (!res.success) {
                adicionarMensagemAI(`Não consegui processar o arquivo: ${res.message || 'erro desconhecido'}`);
                return;
            }

            const r = res.resultado || {};
            const despesa = res.despesa_sugerida || {};

            let textoResposta = `✅ Arquivo processado!\n\n`;
            if (r.tipo) textoResposta += `📋 Tipo: **${formatarTipoDocumento(r.tipo)}**\n`;
            if (r.empresa || r.descricao) textoResposta += `🏢 ${r.empresa || r.descricao}\n`;
            if (r.valor) textoResposta += `💰 Valor: **R$ ${Number(r.valor).toFixed(2).replace('.', ',')}**\n`;
            if (r.vencimento) textoResposta += `📅 Vencimento: ${formatarData(r.vencimento)}\n`;
            if (r.cnpj) textoResposta += `🔢 CNPJ: ${r.cnpj}\n`;

            if (despesa.valor) {
                textoResposta += '\n\nDeseja cadastrar esta despesa?';
                adicionarMensagemAIComDespesa(textoResposta, despesa);
                estado.despesaPendente = despesa;
            } else {
                textoResposta += '\n\nNão consegui identificar o valor. Informe manualmente para cadastrar.';
                adicionarMensagemAI(textoResposta);
            }

        } catch (err) {
            removerTyping(typingId);
            console.error('Erro ao processar arquivo:', err);
            adicionarMensagemAI('Erro ao processar o arquivo. Tente novamente.');
        } finally {
            estado.enviando = false;
            document.getElementById('ia-btn-send').disabled = false;
        }
    }

    // ── BOLETO ────────────────────────────────────────────────────
    function abrirBoleto() {
        const bar = document.getElementById('ia-boleto-bar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
            if (bar.style.display === 'flex') {
                document.getElementById('ia-boleto-input')?.focus();
            }
        }
    }

    function fecharBoleto() {
        const bar = document.getElementById('ia-boleto-bar');
        if (bar) bar.style.display = 'none';
    }

    async function processarBoleto() {
        const linha = document.getElementById('ia-boleto-input')?.value?.trim();
        if (!linha) {
            adicionarMensagemSistema('⚠️ Informe a linha digitável do boleto.');
            return;
        }

        ocultarWelcome();
        fecharBoleto();
        adicionarMensagem(`🏦 Processando boleto...`, 'user');
        const typingId = adicionarTyping();

        try {
            const res = await apiPost('/boleto', { linha_digitavel: linha });
            removerTyping(typingId);

            if (!res.sucesso) {
                adicionarMensagemAI(`Não consegui interpretar o boleto: ${res.erro || 'formato inválido'}`);
                return;
            }

            const valor = res.valor ? `R$ ${Number(res.valor).toFixed(2).replace('.', ',')}` : 'Não identificado';
            const venc = res.vencimento ? formatarData(res.vencimento) : 'Não identificado';

            const texto = `✅ Boleto lido!\n\n🏦 Banco: **${res.banco_nome || '?'}**\n💰 Valor: **${valor}**\n📅 Vencimento: ${venc}\n\nDeseja cadastrar esta despesa?`;

            if (res.despesa && res.despesa.valor) {
                adicionarMensagemAIComDespesa(texto, res.despesa);
                estado.despesaPendente = res.despesa;
            } else {
                adicionarMensagemAI(texto);
            }

            document.getElementById('ia-boleto-input').value = '';

        } catch (err) {
            removerTyping(typingId);
            console.error('Erro ao processar boleto:', err);
            adicionarMensagemAI('Erro ao processar boleto. Tente novamente.');
        }
    }

    // ── PIX ───────────────────────────────────────────────────────
    // (usado via upload - detecção automática no arquivo)

    // ── VOZ ───────────────────────────────────────────────────────
    function toggleVoz() {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            adicionarMensagemSistema('⚠️ Seu navegador não suporta reconhecimento de voz.');
            return;
        }

        if (estado.gravandoVoz) {
            pararGravacaoVoz();
        } else {
            iniciarGravacaoVoz();
        }
    }

    function iniciarGravacaoVoz() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SpeechRecognition();

        rec.lang = 'pt-BR';
        rec.continuous = false;
        rec.interimResults = false;

        rec.onstart = () => {
            estado.gravandoVoz = true;
            estado.reconhecimento = rec;
            const btn = document.getElementById('ia-btn-voice');
            if (btn) btn.className = 'ia-btn-voice gravando';
            adicionarMensagemSistema('🎙️ Ouvindo... fale agora!');
        };

        rec.onresult = (event) => {
            const texto = event.results[0][0].transcript;
            preencherInput(texto);
            adicionarMensagemSistema(`🎤 Reconhecido: "${texto}"`);
        };

        rec.onend = () => {
            estado.gravandoVoz = false;
            estado.reconhecimento = null;
            const btn = document.getElementById('ia-btn-voice');
            if (btn) btn.className = 'ia-btn-voice';
        };

        rec.onerror = (event) => {
            estado.gravandoVoz = false;
            const btn = document.getElementById('ia-btn-voice');
            if (btn) btn.className = 'ia-btn-voice';
            if (event.error !== 'aborted') {
                adicionarMensagemSistema('❌ Erro no reconhecimento de voz: ' + event.error);
            }
        };

        rec.start();
    }

    function pararGravacaoVoz() {
        if (estado.reconhecimento) {
            estado.reconhecimento.stop();
        }
    }

    // ── RECORRÊNCIAS ──────────────────────────────────────────────
    async function detectarRecorrencias() {
        const btn = document.querySelector('.ia-btn-detectar');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await apiGet('/recorrencias?detectar=true');

            if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i>';

            if (!res.success || !res.sugestoes?.length) {
                document.getElementById('recorrencias-lista').innerHTML =
                    '<p class="ia-hint">Nenhum padrão detectado ainda. Continue registrando despesas!</p>';
                return;
            }

            // Atualiza sidebar
            const lista = document.getElementById('recorrencias-lista');
            lista.innerHTML = res.sugestoes.slice(0, 5).map(r => `
                <div class="ia-recorrencia-item">
                    <div class="ia-rec-desc">${esc(r.descricao)}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                        <span class="ia-rec-valor">R$ ${Number(r.valor_medio).toFixed(2).replace('.', ',')}</span>
                        <span class="ia-rec-dia">dia ${r.dia_vencimento || '?'}/mês</span>
                    </div>
                </div>`).join('');

            // Abre modal com lista completa
            const modalLista = document.getElementById('recorrencias-modal-lista');
            if (modalLista) {
                modalLista.innerHTML = res.sugestoes.map(r => `
                    <div class="ia-rec-modal-item">
                        <div class="ia-rec-modal-info">
                            <h4>${esc(r.descricao)}</h4>
                            <p>Detectado em ${r.meses_detectados} meses • Dia ${r.dia_vencimento || '?'} do mês</p>
                            <span class="ia-badge ${r.confianca}">${r.confianca === 'alta' ? 'Alta confiança' : r.confianca === 'media' ? 'Média confiança' : 'Baixa confiança'}</span>
                        </div>
                        <div style="text-align:right">
                            <div class="ia-rec-modal-valor">R$ ${Number(r.valor_medio).toFixed(2).replace('.', ',')}</div>
                            <button class="ia-btn-primary" style="margin-top:8px;font-size:12px" onclick="IA.confirmarRecorrenciaItem(${JSON.stringify(r).replace(/"/g, '&quot;')}, this)">
                                <i class="fas fa-check"></i> Ativar
                            </button>
                        </div>
                    </div>`).join('');
            }

            abrirModal('modal-recorrencias');

        } catch (err) {
            if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            console.error('Erro ao detectar recorrências:', err);
        }
    }

    async function confirmarRecorrenciaItem(recorrencia, btn) {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

        try {
            const res = await apiPost('/recorrencias', recorrencia);
            if (res.success) {
                btn?.closest('.ia-rec-modal-item')?.remove();
                adicionarMensagemSistema(`✅ Recorrência "${recorrencia.descricao}" ativada!`);
            }
        } catch (err) {
            console.error(err);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Ativar'; }
        }
    }

    // ── HELPERS DE UI ─────────────────────────────────────────────
    function abrirModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'flex';
    }

    function fecharModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

    function toggleSidebar() {
        document.querySelector('.ia-sidebar')?.classList.toggle('open');
    }

    function preencherSelectCategorias() {
        const select = document.getElementById('ia-campo-categoria');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione a categoria...</option>';
        estado.categorias.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            select.appendChild(opt);
        });
    }

    function preencherSelectCartoes() {
        const select = document.getElementById('ia-campo-cartao');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um cartão...</option>';
        estado.cartoes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            select.appendChild(opt);
        });
    }

    // ── FORMATADORES ──────────────────────────────────────────────
    function formatarTexto(texto) {
        if (!texto) return '';
        return esc(texto)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

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

    function formatarTipoDocumento(tipo) {
        const mapa = {
            'boleto': 'Boleto', 'nota_fiscal': 'Nota Fiscal',
            'comprovante': 'Comprovante de Pagamento', 'recibo': 'Recibo',
            'documento': 'Documento',
        };
        return mapa[tipo] || tipo;
    }

    function formatarData(data) {
        if (!data) return '';
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    // Fecha modal ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('ia-modal-overlay')) {
            e.target.style.display = 'none';
        }
    });

    // Fecha sidebar mobile ao clicar fora
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.ia-sidebar');
        const btnMenu = document.querySelector('.ia-btn-menu-mobile');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !btnMenu?.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // ── INICIALIZA ────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', inicializar);

    // ── API PÚBLICA ───────────────────────────────────────────────
    return {
        enviarMensagem,
        enviarAcaoRapida,
        handleKeyDown,
        autoResize,
        preencherInput,
        limparConversa,
        abrirModalDespesa,
        salvarDespesa,
        cancelarDespesa,
        confirmarAprendizado,
        abrirUpload,
        processarArquivo,
        cancelarArquivo,
        abrirBoleto,
        fecharBoleto,
        processarBoleto,
        toggleVoz,
        detectarRecorrencias,
        confirmarRecorrenciaItem,
        abrirModal,
        fecharModal,
        toggleSidebar,
    };

})();
