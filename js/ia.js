// ================================================================
// GEN — IA Financeira e-conomia
// Funciona como painel flutuante (outras páginas) e página completa (ia.html)
// Exposto como window.IA
// ================================================================

// ── AUTH GUARD (apenas na página ia.html) ────────────────────────
(function () {
    if (!document.querySelector('.ia-container')) return; // só executa na página completa
    var keys = ['token', 'usuarioAtual', 'dadosUsuarioLogado'];
    keys.forEach(function (k) {
        if (!sessionStorage.getItem(k)) {
            var val = localStorage.getItem(k);
            if (val) sessionStorage.setItem(k, val);
        }
    });
    if (!sessionStorage.getItem('usuarioAtual')) {
        window.location.replace('index.html');
    }
})();

// ── MÓDULO ───────────────────────────────────────────────────────
window.IA = (function () {

    var MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    // Helper: retorna true para qualquer variante de pagamento com cartão de crédito
    function _eCredito(fp) { return fp === 'cartao_credito' || fp === 'credito'; }

    // Helper: calcula parcelas a partir de um objeto despesa
    function _calcParcelas(d) {
        var totalParcelas = parseInt(d.parcelas) || 1;
        var parcelado     = totalParcelas > 1;
        var valorTotal    = parseFloat(d.valor) || 0;
        var valorParcela  = parcelado ? valorTotal / totalParcelas : valorTotal;
        return { totalParcelas: totalParcelas, parcelado: parcelado, valorTotal: valorTotal, valorParcela: valorParcela };
    }

    var estado = {
        enviando: false,
        gravandoVoz: false,
        reconhecimento: null,
        despesaPendente: null,
        receitaPendente: null,
        arquivoPendente: null,
        modoPagina: false, // true quando em ia.html
        aguardandoCampo: null,   // campo sendo coletado ('descricao', 'valor', 'forma_pagamento', 'vencimento', 'data_receita')
        dadosParciais:   null,   // objeto despesa/receita em construção
        tipoColeta:      null,   // 'despesa' ou 'receita'
        // campo_revisao: campo especial onde o usuário escolhe qual campo quer editar
        // ao receber o texto, a fila é resetada para [texto] e _proximoCampo() reprocessa
        filaCampos:      [],     // fila de campos ainda a coletar
        aguardandoTrocaPerfil: false  // true quando exibiu botões de troca e aguarda clique
    };

    var _iaInitializando = false;

    // ── HELPERS DE ELEMENTOS (painel flutuante vs página completa) ─
    // Painel flutuante: ai-messages / ai-input / ai-btn-send
    // Página ia.html:   ia-chat-area / ia-texto-input / ia-btn-send (mesmo id, só existe um por vez)
    function elChat()  { return document.getElementById('ia-chat-area')  || document.getElementById('ai-messages'); }
    function elInput() { return document.getElementById('ia-texto-input')|| document.getElementById('ai-input'); }
    function elSend()  { return document.getElementById('ia-btn-send')   || document.getElementById('ai-btn-send'); }

    // ── API ───────────────────────────────────────────────────────
    // window.API_URL já termina em /api (ex: https://…/api)
    // As rotas da IA ficam em /api/ai/…
    // As rotas principais ficam em /api/despesas, /api/receitas, etc.
    function apiURL() {
        return window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    }

    function getToken() {
        return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    }

    function hdrs() {
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
    }

    // Rotas do módulo IA (/api/ai/…)
    function apiPost(path, body) {
        return fetch(apiURL() + '/ai' + path, {
            method: 'POST', headers: hdrs(), body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    function apiForm(path, form) {
        return fetch(apiURL() + '/ai' + path, {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: form
        }).then(function (r) { return r.json(); });
    }

    function apiGet(path) {
        return fetch(apiURL() + '/ai' + path, { headers: hdrs() })
            .then(function (r) { return r.json(); });
    }

    // Rotas principais do sistema (/api/despesas, /api/receitas, …)
    function apiMainPost(path, body) {
        return fetch(apiURL() + path, {
            method: 'POST', headers: hdrs(), body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    function apiMainGet(path) {
        return fetch(apiURL() + path, { headers: hdrs() })
            .then(function (r) { return r.json(); });
    }

    // ── PAINEL FLUTUANTE ──────────────────────────────────────────
    function abrir() {
        var panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        var msgs = document.getElementById('ai-messages');
        if (msgs && msgs.children.length === 0) {
            boasVindas();
            inicializar();
        }
        setTimeout(function () { var inp = elInput(); if (inp) inp.focus(); }, 100);
    }

    function fechar() {
        var panel = document.getElementById('ai-chat-panel');
        if (panel) {
            panel.style.display = 'none';
            // Limpa height inline definido pelo listener de visualViewport
            panel.style.height = '';
        }
    }

    // ── INICIALIZAR STATUS ────────────────────────────────────────
    function _setStatus(texto, online) {
        var txt = document.getElementById('ia-status-text');
        var dot = document.getElementById('ia-status-dot');
        if (txt) txt.textContent = texto;
        if (dot) { dot.classList.toggle('online', !!online); dot.classList.toggle('offline', !online); }
    }

    function inicializar(tentativa) {
        tentativa = tentativa || 1;
        _setStatus(tentativa > 1 ? 'iniciando... (' + tentativa + ')' : 'conectando...', false);

        apiGet('/config').then(function (cfg) {
            var provider = (cfg && cfg.provider) || 'gen';
            var nome     = (cfg && cfg.nome)     || 'Gen ativa — IA interna e-conomia';
            var isGen    = provider === 'gen';

            _setStatus(nome, true);

            var badge = document.getElementById('ia-badge-status');
            if (badge) { badge.textContent = nome; badge.className = 'badge ' + (isGen ? 'gen' : 'ativo'); }

            // Cacheia quais provedores têm chave salva
            var hasKeys = (cfg && cfg.has_keys) || {};
            ['openai','gemini','claude'].forEach(function(p) {
                if (hasKeys[p]) sessionStorage.setItem('ia_tem_chave_' + p, '1');
            });

            var sel = document.getElementById('ia-provider-select');
            if (sel) { sel.value = provider; _iaInitializando = true; sel.dispatchEvent(new Event('change')); _iaInitializando = false; }

            // Notifica ia-mobile.js (e qualquer listener) que a IA terminou de inicializar
            document.dispatchEvent(new CustomEvent('ia:pronto'));

            // Se o provedor atual tem chave, mostra preview (primeiros chars + bullets)
            if (!isGen && (cfg.tem_chave || hasKeys[provider])) {
                var inp = document.getElementById('ia-api-key-input');
                var previews = (cfg && cfg.key_previews) || {};
                if (inp) inp.value = previews[provider] || '••••••••';
            }

            _atualizarBadgeExterna(provider);

            // Carrega cartões se ainda não estiverem disponíveis (ia.html não carrega main.js)
            if (!window.cartoesUsuario || window.cartoesUsuario.length === 0) {
                var perfilId = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
                var perfilQuery = perfilId ? '?perfil_id=' + perfilId : '';
                apiMainGet('/cartoes' + perfilQuery).then(function(res) {
                    if (res && res.success && Array.isArray(res.data)) {
                        window.cartoesUsuario = res.data;
                    }
                }).catch(function() {});
            }

        }).catch(function () {
            // /config falhou (novo endpoint ainda não deployado?) — tenta /status sem auth
            apiGet('/status').then(function (st) {
                var nome = (st && st.openai && st.openai.ativo)
                    ? 'OpenAI ativa — ' + (st.openai.modelo || 'gpt-4o-mini')
                    : 'Gen ativa — IA interna';
                _setStatus(nome, true);
                var badge = document.getElementById('ia-badge-status');
                if (badge) { badge.textContent = nome; badge.className = 'badge gen'; }
            }).catch(function () {
                if (tentativa < 3) {
                    // Retry com backoff (servidor pode estar acordando)
                    _setStatus('iniciando... aguarde', false);
                    setTimeout(function () { inicializar(tentativa + 1); }, tentativa * 10000);
                } else {
                    _setStatus('servidor offline — clique para tentar novamente', false);
                    // Permite retry manual ao clicar no status
                    var txt = document.getElementById('ia-status-text');
                    if (txt) txt.style.cursor = 'pointer';
                    if (txt) txt.onclick = function () {
                        txt.onclick = null;
                        txt.style.cursor = '';
                        inicializar(1);
                    };
                }
            });
        });
    }

    // ── BOAS-VINDAS ───────────────────────────────────────────────
    function _getPerfilAtualNome() {
        return localStorage.getItem('perfilAtivoNome') || 'Pessoal';
    }

    function _getPerfilAtualTipo() {
        return localStorage.getItem('perfilAtivoTipo') || 'pessoal';
    }

    function boasVindas() {
        var nome  = _getPerfilAtualNome();
        var tipo  = _getPerfilAtualTipo();
        var icone = tipo === 'empresa' ? '🏢' : '👤';
        var chips = '<button class="ai-welcome-chip" data-chip>Hiper, 150 de mercado no pix</button>' +
                    '<button class="ai-welcome-chip" data-chip>salário, caiu 3500 hoje</button>' +
                    '<button class="ai-welcome-chip" data-chip>quanto gastei esse mês?</button>';
        addGen('Olá! Estou aqui para te ajudar com o perfil <b>' + icone + ' ' + nome + '</b>. Pode mandar!<div class="ai-welcome-chips">' + chips + '</div>');
        setTimeout(function () {
            addGen('Se quiser usar outro perfil, é só dizer <b>"trocar perfil"</b>.');
        }, 600);
    }

    function _exibirBotoesTrocaPerfil() {
        estado.aguardandoTrocaPerfil = true;
        fetch(apiURL() + '/perfis', { headers: hdrs() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var perfis = (data && data.success && data.data) ? data.data.filter(function (p) { return p.ativo !== false; }) : [];
                if (perfis.length <= 1) {
                    estado.aguardandoTrocaPerfil = false;
                    addGen('Você só tem um perfil cadastrado.');
                    return;
                }
                var btns = perfis.map(function (p) {
                    var icone = p.tipo === 'empresa' ? '🏢' : '👤';
                    var nome  = p.nome_fantasia || p.razao_social || p.nome;
                    return '<button class="ai-welcome-chip ai-chip-perfil" data-perfil-id="' + p.id + '" data-perfil-nome="' + nome + '" data-perfil-tipo="' + p.tipo + '">' + icone + ' ' + nome + '</button>';
                }).join('');
                addGen('Qual perfil você quer usar?<div class="ai-welcome-chips">' + btns + '</div>');
            })
            .catch(function () {
                estado.aguardandoTrocaPerfil = false;
                addGen('Não consegui carregar os perfis. Tente novamente.');
            });
    }

    function _selecionarPerfil(id, nome, tipo) {
        estado.aguardandoTrocaPerfil = false;
        localStorage.setItem('perfilAtivoId', id);
        localStorage.setItem('perfilAtivoNome', nome);
        localStorage.setItem('perfilAtivoTipo', tipo);
        if (typeof window.setPerfilAtivo === 'function') window.setPerfilAtivo(id, nome, tipo);
        var icone = tipo === 'empresa' ? '🏢' : '👤';
        addGen('Pronto! Agora estou no perfil <b>' + icone + ' ' + nome + '</b>. Como posso ajudar?');
    }

    function _isTrocaPerfil(texto) {
        return /troc|mud|outro perfil|mudar perfil|trocar perfil|não (quero|esse)|nao (quero|esse)/i.test(texto);
    }

    function limparConversa() {
        var area = elChat();
        if (area) area.innerHTML = '';
        estado.despesaPendente = null;
        estado.receitaPendente = null;
        cancelarArquivo();
        fecharBoleto();
        apiPost('/chat', { mensagem: '_reset_', limpar_sessao: true }).catch(function () { });
        boasVindas();
    }

    // ── ENVIO ─────────────────────────────────────────────────────
    function enviarMensagem() {
        if (estado.arquivoPendente) { _enviarArquivo(); return; }

        // Se estamos coletando campos faltantes, processa localmente sem chamar backend
        if (estado.aguardandoCampo) {
            var inputC = elInput();
            var textoC = inputC ? inputC.value.trim() : '';
            if (!textoC) return;
            inputC.value = '';
            autoResize(inputC);
            addUser(textoC);
            _processarCampoColetado(textoC);
            return;
        }

        var input = elInput();
        var texto = input ? input.value.trim() : '';
        if (!texto || estado.enviando) return;

        input.value = '';
        autoResize(input);
        estado.enviando = true;
        setBtnDisabled(true);
        addUser(texto);
        var tid = addTyping();

        // Interceptar intenção de encerrar conversa
        if (/^encerrar$|^(encer|finaliz|tchau|obrigad|até|valeu|ok\s*obrigad)/i.test(texto.trim())) {
            estado.enviando = false;
            setBtnDisabled(false);
            removeTyping(tid);
            addGen('Até mais! Qualquer coisa é só chamar. 👋');
            return;
        }

        // Interceptar intenção de troca de perfil antes de ir ao backend
        if (_isTrocaPerfil(texto)) {
            estado.enviando = false;
            setBtnDisabled(false);
            removeTyping(tid);
            _exibirBotoesTrocaPerfil();
            return;
        }

        var _payload = { mensagem: texto };
        if (window.mesAberto !== undefined) _payload.mes_atual = window.mesAberto;
        if (window.anoAberto !== undefined) _payload.ano_atual = window.anoAberto;
        var _perfilId = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        if (_perfilId) _payload.perfil_id = _perfilId;
        apiPost('/chat', _payload).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addGen('Desculpe, ocorreu um erro. Tente novamente.'); return; }

            if (res.acao === 'confirmar_despesa' && res.despesa) {
                _iniciarColetaCampos(res.despesa, 'despesa');
            } else if (res.acao === 'confirmar_receita' && res.receita) {
                _iniciarColetaCampos(res.receita, 'receita');
            } else if (res.acao === 'encerrar') {
                addGen(res.resposta || 'Até mais!');
                setTimeout(fechar, 1500);
            } else {
                addGen(res.resposta || '...');
                // Após análise/consulta, oferece próxima ação (só se não termina com pergunta)
                var resp = (res.resposta || '').trim();
                if (resp && !resp.endsWith('?') && res.acao !== 'coletando_campos') {
                    _mostrarChipsContinuacao(null, 1000);
                }
            }
        }).catch(function () {
            removeTyping(tid);
            addGen('Servidor iniciando, pode levar alguns segundos. Clique em enviar para tentar de novo.');
            // Devolve o texto ao input para facilitar reenvio
            var inp = elInput();
            if (inp) { inp.value = texto; autoResize(inp); inp.focus(); }
        }).finally(function () {
            estado.enviando = false;
            setBtnDisabled(false);
        });
    }

    function enviarAcaoRapida(texto) {
        var input = elInput();
        if (input) input.value = texto;
        enviarMensagem();
    }

    function preencherInput(texto) {
        var input = elInput();
        if (input) { input.value = texto; autoResize(input); input.focus(); }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
    }

    function autoResize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function toggleSidebar() {
        var sidebar = document.querySelector('.ia-sidebar');
        if (sidebar) sidebar.classList.toggle('ia-sidebar--open');
    }

    // ── CHIPS DE PRÓXIMA AÇÃO (reutilizável) ─────────────────────
    function _chipsProximaAcao() {
        return '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="cadastrar despesa" data-opcao-label="Cadastrar despesa">💸 Cadastrar despesa</button>' +
               '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="cadastrar receita" data-opcao-label="Cadastrar receita">💰 Cadastrar receita</button>' +
               '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="encerrar" data-opcao-label="Encerrar">✓ Encerrar</button>';
    }

    function _mostrarChipsContinuacao(msg, delay) {
        setTimeout(function () {
            addGen((msg || 'Posso ajudar com mais alguma coisa?') + '<div class="ai-welcome-chips">' + _chipsProximaAcao() + '</div>');
        }, delay || 600);
    }

    // ── MENSAGENS ─────────────────────────────────────────────────
    function addUser(texto) {
        var c = _cloneTmpl('template-ia-msg-user');
        if (c) {
            c.querySelector('.ia-msg-texto').textContent = texto;
            c.querySelector('.ai-msg-time').textContent = _hhmm();
            _insNode(c);
        } else {
            _ins('<div class="ai-msg ai-msg--user"><div class="ai-msg-bub">' + esc(texto) + '<span class="ai-msg-time">' + _hhmm() + '</span></div></div>');
        }
    }

    function addGen(html) {
        var c = _cloneTmpl('template-ia-msg-gen');
        if (c) {
            c.querySelector('.ia-msg-conteudo').innerHTML = html;
            c.querySelector('.ai-msg-time').textContent = _hhmm();
            _insNode(c);
        } else {
            _ins('<div class="ai-msg ai-msg--ai"><div class="ai-msg-bub">' + html + '<span class="ai-msg-time">' + _hhmm() + '</span></div></div>');
        }
    }

    function addComDespesa(texto, d) {
        var pc = _calcParcelas(d);
        var totalParcelas = pc.totalParcelas, parcelado = pc.parcelado, valorTotal = pc.valorTotal, valorParcela = pc.valorParcela;
        var dataVenc   = d.vencimento || '';
        var dataCompra = d.data || '';
        var semValor   = valorTotal <= 0;
        var nomeCartao = d.nome_cartao || d.cartao_nome || (d.cartao_id ? 'Cartão #' + d.cartao_id : '');
        var isCredito  = _eCredito(d.forma_pagamento);

        var c = _cloneTmpl('template-ia-card-despesa');
        if (!c) return; // template obrigatório

        c.querySelector('.ia-card-intro').innerHTML = fmt(texto);
        c.querySelector('.dc-descricao').textContent = d.descricao || '—';

        if (parcelado) {
            c.querySelector('.dc-row-valor').hidden = true;
            c.querySelector('.dc-row-valor-total').hidden = false;
            var elVT = c.querySelector('.dc-valor-total');
            elVT.textContent = semValor ? '⚠ não informado' : fmtV(valorTotal);
            if (semValor) elVT.classList.add('ai-dc-alerta');
            c.querySelector('.dc-parcelas').textContent = totalParcelas + 'x de ' + fmtV(valorParcela);
        } else {
            var elV = c.querySelector('.dc-valor');
            elV.textContent = semValor ? '⚠ não informado' : fmtV(valorTotal);
            if (semValor) elV.classList.add('ai-dc-alerta');
            c.querySelector('.dc-parcelas').textContent = '1x';
        }

        c.querySelector('.dc-forma').textContent = fmtF(d.forma_pagamento);

        if (isCredito && nomeCartao) {
            c.querySelector('.dc-row-cartao').hidden = false;
            c.querySelector('.dc-cartao').textContent = nomeCartao;
        }

        c.querySelector('.dc-categoria').textContent = d.categoria || 'Outros';

        if (dataCompra && dataCompra !== dataVenc) {
            c.querySelector('.dc-row-data-compra').hidden = false;
            c.querySelector('.dc-data-compra').textContent = fmtD(dataCompra);
        }

        // Vencimento sempre visível — fallback para data de compra se não informado
        var vencDisplay = dataVenc || dataCompra;
        c.querySelector('.dc-row-vencimento').hidden = false;
        var elVenc = c.querySelector('.dc-vencimento');
        elVenc.textContent = vencDisplay ? fmtD(vencDisplay) : '—';

        var elStatusD = c.querySelector('.dc-status-despesa');
        var _isCredito = _eCredito(d.forma_pagamento);
        var _statusLabel, _statusCls;
        if (d.ja_pago && !_isCredito) {
            _statusLabel = 'Paga';     _statusCls = 'ai-dc-pago';
        } else if (d.status === 'atrasada') {
            _statusLabel = 'Atrasada'; _statusCls = 'ai-dc-atrasada';
        } else if (d.status === 'pendente' || _isCredito) {
            _statusLabel = 'Pendente'; _statusCls = 'ai-dc-pendente';
        } else {
            _statusLabel = 'Em Dia';   _statusCls = 'ai-dc-pendente';
        }
        elStatusD.textContent = _statusLabel;
        elStatusD.className = 'ai-dc-val ' + _statusCls;

        var elRecorr = c.querySelector('.dc-recorrente-val');
        if (elRecorr) {
            elRecorr.textContent = d.recorrente ? 'Sim' : 'Não';
            elRecorr.className = 'ai-dc-val ' + (d.recorrente ? 'ai-dc-pago' : '');
        }

        if (d.replicar_ate) {
            c.querySelector('.dc-row-replicar').hidden = false;
            c.querySelector('.dc-replicar').textContent = d.replicar_ate;
        }

        var numAnexos = (d.anexos && d.anexos.length) || 0;
        if (numAnexos > 0) {
            c.querySelector('.dc-row-anexos').hidden = false;
            c.querySelector('.dc-anexos-count').textContent = numAnexos + ' arquivo' + (numAnexos > 1 ? 's' : '');
        }

        c.querySelector('.ai-msg-time').textContent = _hhmm();
        _insNode(c);
    }

    function addComReceita(texto, r) {
        var c = _cloneTmpl('template-ia-card-receita');
        if (!c) return;
        c.querySelector('.ia-card-intro').innerHTML = fmt(texto);
        c.querySelector('.dc-descricao').textContent = r.descricao || '—';
        c.querySelector('.dc-valor').textContent = fmtV(r.valor);
        if (r.data) {
            c.querySelector('.dc-row-data').hidden = false;
            c.querySelector('.dc-data').textContent = fmtD(r.data);
        }
        c.querySelector('.ai-msg-time').textContent = _hhmm();
        _insNode(c);
    }

    function addTyping() {
        var id = 'ai-typ-' + Date.now();
        var c = _cloneTmpl('template-ia-typing');
        if (c) {
            var el = c.querySelector('.ai-msg');
            el.id = id;
            _insNode(c);
        } else {
            _ins('<div class="ai-msg ai-msg--ai" id="' + id + '"><div class="ai-msg-bub"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>');
        }
        return id;
    }

    function removeTyping(id) { var el = document.getElementById(id); if (el) el.remove(); }

    function _ins(html) {
        var area = elChat();
        if (!area) return;
        var welcome = area.querySelector('.ia-welcome');
        if (welcome) welcome.remove();
        area.insertAdjacentHTML('beforeend', html);
        area.scrollTop = area.scrollHeight;
    }

    // Insere um nó DOM (DocumentFragment ou Element) na área de chat
    function _insNode(node) {
        var area = elChat();
        if (!area) return;
        var welcome = area.querySelector('.ia-welcome');
        if (welcome) welcome.remove();
        area.appendChild(node);
        area.scrollTop = area.scrollHeight;
    }

    function _cloneTmpl(id) {
        var t = document.getElementById(id);
        return t ? t.content.cloneNode(true) : null;
    }

    // ── CONFIRMAR DESPESA ─────────────────────────────────────────
    function confirmarDespesa() {
        var d = estado.despesaPendente;
        if (!d) return;
        estado.despesaPendente = null;

        if (estado.modoPagina) {
            // Página ia.html: preenche o modal interno para revisão
            _preencherModalDespesa(d);
            _abrirModal('modal-confirmar-despesa');
            return;
        }

        // ── Monta payload idêntico ao do modal manual ────────────
        var pc2 = _calcParcelas(d);
        var totalParcelas = pc2.totalParcelas, parcelado = pc2.parcelado, valorTotal = pc2.valorTotal, valorParcela = pc2.valorParcela;

        // Data de vencimento: definida pela IA ou coletada do usuário.
        // Para pagamentos imediatos (PIX, débito, dinheiro), _camposFaltandoDespesa já seta hoje.
        // Data de compra: data da compra/emissão (campo d.data).
        var dataVencimento = d.vencimento || d.data || '';
        var dataCompra     = d.data || d.vencimento || '';

        // mes/ano derivados do vencimento — split direto na string para evitar bug UTC
        var _refData = dataVencimento || dataCompra || _hoje();
        var partsVenc = _refData.split('-');
        var mes = parseInt(partsVenc[1]) - 1;   // 0-based (0=Jan … 11=Dez)
        var ano = parseInt(partsVenc[0]);

        // data_pagamento: se já pago, usa data_pagamento explícita ou hoje
        var dataPagamento = null;
        if (d.ja_pago) {
            dataPagamento = d.data_pagamento || _hoje();
        }

        // Cartão: tenta por ID direto ou resolve pelo nome mencionado
        var cartaoId = d.cartao_id || _resolverCartaoPorNome(d.nome_cartao);

        var payload = {
            descricao:             d.descricao,
            valor:                 parseFloat(valorParcela.toFixed(2)),
            valor_original:        parseFloat(valorTotal.toFixed(2)),
            forma_pagamento:       d.forma_pagamento || 'dinheiro',
            data_vencimento:       dataVencimento,
            data_compra:           dataCompra,
            mes:                   mes,
            ano:                   ano,
            parcelado:             parcelado,
            total_parcelas:        parcelado ? totalParcelas : null,
            parcela_atual:         parcelado ? 1 : null,
            pago:                  !!d.ja_pago,
            data_pagamento:        dataPagamento,
            recorrente:            !!d.recorrente,
            categoria_id:          d.categoria_id || null,
            cartao_id:             cartaoId || null,
            perfil_id:             typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null
        };

        var tidD = addTyping();
        // Chama o mesmo endpoint que o modal manual usa
        apiMainPost('/despesas', payload).then(function (res) {
            removeTyping(tidD);
            if (res && res.success) {
                var sufixo = parcelado ? ' (' + totalParcelas + 'x de ' + fmtV(valorParcela) + ')' : '';
                addGen('✔ "' + d.descricao + '"' + sufixo + ' salva em ' + (MESES[mes] || '') + '/' + ano + '.');
                // Recarrega só as despesas do mês afetado e re-renderiza a tabela
                var _refreshMes = function() {
                    if (typeof window.renderizarDetalhesDoMes === 'function') {
                        window.renderizarDetalhesDoMes(mes, ano);
                    }
                    if (typeof window.carregarDadosDashboard === 'function') {
                        window.carregarDadosDashboard(ano);
                    }
                };
                if (typeof window.recarregarDespesasDoMes === 'function') {
                    window.recarregarDespesasDoMes(mes, ano).then(_refreshMes).catch(_refreshMes);
                } else {
                    _refreshMes();
                }
                _mostrarChipsContinuacao('Posso ajudar com mais alguma coisa?');
            } else {
                addGen('Erro ao cadastrar: ' + ((res && res.message) || (res && res.errors && res.errors[0] && res.errors[0].msg) || 'tente novamente.'));
                _mostrarChipsContinuacao('Quer tentar novamente ou fazer outra coisa?', 800);
            }
        }).catch(function () {
            removeTyping(tidD);
            addGen('Erro de conexão ao salvar a despesa.');
            _mostrarChipsContinuacao('Quer tentar novamente?', 800);
        });
    }

    function editarDespesa() {
        var d = estado.despesaPendente;
        if (!d) return;
        estado.dadosParciais   = Object.assign({}, d);
        estado.tipoColeta      = 'despesa';
        estado.aguardandoCampo = 'campo_revisao';
        var campos = [
            { label: 'Descrição',          val: 'descricao' },
            { label: 'Valor',              val: 'valor' },
            { label: 'Forma de pagamento', val: 'forma_pagamento' },
            { label: 'Data de vencimento', val: 'vencimento' },
            { label: 'Categoria',          val: 'categoria' },
            { label: 'Status',             val: 'status_despesa' },
            { label: 'Parcelas',           val: 'parcelas' },
            { label: 'Recorrente',         val: 'recorrente' },
            { label: 'Replicar até',       val: 'replicar_ate' }
        ];
        var btns = campos.map(function(c) {
            return '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="' + esc(c.val) + '" data-opcao-label="' + esc(c.label) + '">' + esc(c.label) + '</button>';
        }).join('');
        addGen('Qual informação deseja corrigir?<div class="ai-welcome-chips">' + btns + '</div>');
    }

    function cancelarDespesa() {
        estado.despesaPendente = null;
        _mostrarChipsContinuacao('Ok, descartei. O que mais posso fazer?', 0);
    }

    // ── CONFIRMAR RECEITA ─────────────────────────────────────────
    function confirmarReceita() {
        var r = estado.receitaPendente;
        if (!r) return;
        estado.receitaPendente = null;

        // Data: usa a extraída ou o dia 15 do mês aberto
        var mesAb  = window.mesAberto;
        var anoAb  = window.anoAberto;
        var dataFallback = (mesAb !== undefined && anoAb)
            ? anoAb + '-' + String(mesAb + 1).padStart(2, '0') + '-15'
            : new Date().toISOString().split('T')[0];

        var dataReceita = r.data || dataFallback;

        // mes/ano derivados da data (sem new Date para evitar bug UTC)
        var parts = dataReceita.split('-');
        var mes = parseInt(parts[1]) - 1;  // 0-based
        var ano = parseInt(parts[0]);

        var payload = {
            descricao:         r.descricao,
            valor:             parseFloat(r.valor),
            data_recebimento:  dataReceita,
            mes:               mes,
            ano:               ano,
            perfil_id:         (estado.perfilSelecionado && estado.perfilSelecionado.id) ||
                               (typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null)
        };

        var tidR = addTyping();
        // Chama o mesmo endpoint que o modal de receita usa
        apiMainPost('/receitas', payload).then(function (res) {
            removeTyping(tidR);
            if (res && res.success) {
                addGen('✔ Receita "' + r.descricao + '" salva em ' + (MESES[mes] || '') + '/' + ano + '.');
                if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                    window.usuarioDataManager.limparCache();
                }
                if (typeof window.renderizarDetalhesDoMes === 'function') {
                    window.mesAberto = mes;
                    window.anoAberto = ano;
                    window.renderizarDetalhesDoMes(mes, ano);
                }
                if (typeof window.carregarDadosDashboard === 'function') {
                    window.carregarDadosDashboard(ano);
                }
                _mostrarChipsContinuacao('Posso ajudar com mais alguma coisa?');
            } else {
                addGen('Erro ao salvar: ' + ((res && res.message) || 'tente novamente.'));
                _mostrarChipsContinuacao('Quer tentar novamente ou fazer outra coisa?', 800);
            }
        }).catch(function () {
            removeTyping(tidR);
            addGen('Erro de conexão ao salvar receita.');
            _mostrarChipsContinuacao('Quer tentar novamente?', 800);
        });
    }

    function editarReceita() {
        var r = estado.receitaPendente;
        if (!r) return;
        estado.dadosParciais   = Object.assign({}, r);
        estado.tipoColeta      = 'receita';
        estado.aguardandoCampo = 'campo_revisao';
        var campos = [
            { label: 'Descrição', val: 'descricao' },
            { label: 'Valor',     val: 'valor' },
            { label: 'Data',      val: 'data_receita' }
        ];
        var btns = campos.map(function(c) {
            return '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="' + esc(c.val) + '" data-opcao-label="' + esc(c.label) + '">' + esc(c.label) + '</button>';
        }).join('');
        addGen('Qual informação deseja corrigir?<div class="ai-welcome-chips">' + btns + '</div>');
    }

    function cancelarReceita() {
        estado.receitaPendente = null;
        _mostrarChipsContinuacao('Ok, descartei. O que mais posso fazer?', 0);
    }

    // ── COLETA DE CAMPOS FALTANTES ────────────────────────────────
    var _FORMAS_IMEDIATAS = ['pix', 'dinheiro', 'cartao_debito', 'debito'];

    function _vencimentoImediato(forma) {
        return _FORMAS_IMEDIATAS.indexOf(forma) !== -1;
    }

    function _hoje() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function _camposFaltandoDespesa(d) {
        var falta = [];
        if (!d.descricao) falta.push('descricao');
        if (!d.valor || parseFloat(d.valor) <= 0) falta.push('valor');
        if (!d.forma_pagamento) falta.push('forma_pagamento');
        // PIX, débito, dinheiro, transferência e boleto → vencimento = hoje automaticamente
        if (!d.vencimento) {
            if (_vencimentoImediato(d.forma_pagamento)) {
                d.vencimento = _hoje();
                if (!d.data) d.data = d.vencimento;
            } else {
                falta.push('vencimento');
            }
        }
        // Se crédito e nenhum cartão foi resolvido, pergunta qual cartão
        var isCredito = _eCredito(d.forma_pagamento);
        if (isCredito && !d.cartao_id && !_resolverCartaoPorNome(d.nome_cartao)) {
            falta.push('cartao_id');
        }
        return falta;
    }

    function _camposFaltandoReceita(r) {
        var falta = [];
        if (!r.descricao) falta.push('descricao');
        if (!r.valor || parseFloat(r.valor) <= 0) falta.push('valor');
        return falta;
    }

    function _iniciarColetaCampos(despesa, tipo) {
        // Validar ANTES de copiar — auto-sets (ex: vencimento PIX = hoje) devem estar no dadosParciais
        var falta = tipo === 'despesa'
            ? _camposFaltandoDespesa(despesa)
            : _camposFaltandoReceita(despesa);
        estado.dadosParciais = Object.assign({}, despesa);
        estado.tipoColeta    = tipo;
        estado.filaCampos    = falta;

        if (estado.filaCampos.length === 0) {
            // Nada faltando — exibe card direto
            if (tipo === 'despesa') {
                estado.despesaPendente = estado.dadosParciais;
                addComDespesa('Confirma o cadastro desta despesa?', estado.dadosParciais);
            } else {
                estado.receitaPendente = estado.dadosParciais;
                addComReceita('Confirma o cadastro desta receita?', estado.dadosParciais);
            }
            estado.dadosParciais = null;
            estado.tipoColeta    = null;
        } else {
            _proximoCampo();
        }
    }

    function _proximoCampo() {
        if (estado.filaCampos.length === 0) {
            var d  = estado.dadosParciais;
            var tp = estado.tipoColeta;
            estado.aguardandoCampo = null;
            estado.dadosParciais   = null;
            estado.tipoColeta      = null;
            var tid = addTyping();
            setTimeout(function () {
                removeTyping(tid);
                if (tp === 'despesa') {
                    estado.despesaPendente = d;
                    addComDespesa('Confirma o cadastro desta despesa?', d);
                } else {
                    estado.receitaPendente = d;
                    addComReceita('Confirma o cadastro desta receita?', d);
                }
            }, 500);
            return;
        }

        var campo = estado.filaCampos[0];
        estado.aguardandoCampo = campo;
        var tid2 = addTyping();

        if (campo === 'forma_pagamento') {
            var btnsPgto =
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="saldo_conta" data-opcao-label="Saldo em conta">Saldo em conta</button>' +
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="crédito" data-opcao-label="Crédito">Crédito</button>';
            setTimeout(function () {
                removeTyping(tid2);
                addGen('Foi pago com saldo em conta ou crédito?<div class="ai-welcome-chips">' + btnsPgto + '</div>');
            }, 600);
            return;
        }

        if (campo === 'cartao_id') {
            // Sempre busca cartões frescos da API para evitar dados desatualizados
            var _perfilIdCartao = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
            var _perfilQueryCartao = _perfilIdCartao ? '?perfil_id=' + _perfilIdCartao : '';
            apiMainGet('/cartoes' + _perfilQueryCartao).then(function(res) {
                if (res && res.success && Array.isArray(res.data)) {
                    window.cartoesUsuario = res.data;
                }
                var cartoes = (window.cartoesUsuario || []).filter(function(c) { return c.ativo !== false; });
                removeTyping(tid2);
                if (cartoes.length === 0) {
                    addGen('Nenhum cartão cadastrado. Cadastre um cartão no sistema e tente novamente.');
                    // Cancela a coleta deste campo e prossegue sem cartão
                    estado.filaCampos.shift();
                    estado.aguardandoCampo = null;
                    _proximoCampo();
                } else if (cartoes.length === 1) {
                    estado.dadosParciais.cartao_id = cartoes[0].id;
                    estado.dadosParciais.nome_cartao = cartoes[0].nome || cartoes[0].banco || 'Cartão';
                    estado.filaCampos.shift();
                    estado.aguardandoCampo = null;
                    _proximoCampo();
                } else {
                    var btnsCartao = cartoes.map(function(c) {
                        var nome = c.nome || c.banco || 'Cartão';
                        return '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="' + esc(nome) + '" data-opcao-label="' + esc(nome) + '">' + esc(nome) + '</button>';
                    }).join('');
                    addGen('Qual cartão de crédito?<div class="ai-welcome-chips">' + btnsCartao + '</div>');
                }
            }).catch(function() {
                removeTyping(tid2);
                addGen('Não foi possível carregar os cartões. Verifique sua conexão e tente novamente.');
                // Cancela a coleta deste campo para não travar o fluxo
                estado.filaCampos.shift();
                estado.aguardandoCampo = null;
                _proximoCampo();
            });
            return;
        }

        if (campo === 'status_despesa') {
            var _isCreditoStatus = estado.dadosParciais && _eCredito(estado.dadosParciais.forma_pagamento);
            var btnsStatus =
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="em_dia"   data-opcao-label="Em Dia">Em Dia</button>' +
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="pendente" data-opcao-label="Pendente">Pendente</button>' +
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="atrasada" data-opcao-label="Atrasada">Atrasada</button>';
            if (!_isCreditoStatus) {
                btnsStatus += '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="quitada" data-opcao-label="Paga">Paga</button>';
            }
            setTimeout(function () {
                removeTyping(tid2);
                addGen('Qual o status da despesa?<div class="ai-welcome-chips">' + btnsStatus + '</div>');
            }, 600);
            return;
        }

        if (campo === 'recorrente') {
            var btnsRecorr =
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="sim" data-opcao-label="Sim">Sim</button>' +
                '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="nao" data-opcao-label="Não">Não</button>';
            setTimeout(function () {
                removeTyping(tid2);
                addGen('É uma despesa recorrente (todo mês)?<div class="ai-welcome-chips">' + btnsRecorr + '</div>');
            }, 600);
            return;
        }

        var perguntas = {
            'descricao':    'Qual a descrição da despesa?',
            'valor':        'Qual o valor?',
            'vencimento':   'Qual a data de vencimento? (ex: hoje, amanhã, 15/04, 20/05/2026)',
            'data_receita': 'Qual a data de recebimento? (ex: hoje, 15/03)',
            'categoria':    'Qual a categoria? (ex: Alimentação, Transporte, Lazer)',
            'parcelas':     'Quantas parcelas? (ex: 3, 12 — ou 1 para à vista)',
            'replicar_ate': 'Replicar até qual mês? (ex: 12/2026) — ou "não" para remover'
        };
        var pergunta = perguntas[campo] || 'Informe o ' + campo + ':';
        setTimeout(function () {
            removeTyping(tid2);
            addGen(pergunta);
        }, 600);
    }

    function _processarCampoColetado(texto) {
        var campo = estado.aguardandoCampo;
        var d     = estado.dadosParciais;

        if (campo === 'campo_revisao') {
            estado.filaCampos      = [texto];
            estado.aguardandoCampo = null;
            _proximoCampo();
            return;
        }

        switch (campo) {
            case 'descricao':
                d.descricao = texto.trim();
                break;
            case 'valor':
                var v = _normValor(texto);
                if (v <= 0) { addGen('Valor inválido. Informe apenas o número, ex: 50 ou 120,50'); return; }
                d.valor = v;
                break;
            case 'forma_pagamento':
                if (texto === 'saldo_conta') {
                    // Sub-nível: PIX, Débito, Dinheiro — mantém aguardandoCampo para capturar próximo clique
                    var btnsSubForma =
                        '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="pix" data-opcao-label="PIX">PIX</button>' +
                        '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="débito" data-opcao-label="Débito">Débito</button>' +
                        '<button class="ai-welcome-chip ai-opcao-btn" data-opcao="dinheiro" data-opcao-label="Dinheiro">Dinheiro</button>';
                    addGen('Como foi pago?<div class="ai-welcome-chips">' + btnsSubForma + '</div>');
                    return; // não avança a fila — aguarda o clique seguinte
                }
                d.forma_pagamento = _normForma(texto);
                break;
            case 'vencimento':
                var dt = _normData(texto);
                if (!dt) { addGen('Não entendi a data. Tente: hoje, amanhã, 15/04, 20/05/2026'); return; }
                d.vencimento = dt;
                if (!d.data) d.data = dt;
                break;
            case 'data_receita':
                var dt2 = _normData(texto);
                if (!dt2) { addGen('Não entendi a data. Tente: hoje, amanhã, 15/04'); return; }
                d.data = dt2;
                break;
            case 'cartao_id':
                var cartoes = (window.cartoesUsuario || []).filter(function(c) { return c.ativo !== false; });
                var lower = texto.toLowerCase().trim();
                var found = cartoes.find(function(c) {
                    return (c.nome || '').toLowerCase().includes(lower) ||
                           (c.banco || '').toLowerCase().includes(lower);
                });
                if (!found) {
                    var nomes = cartoes.map(function(c) { return c.nome || c.banco; }).join(', ');
                    addGen('Não encontrei esse cartão. Disponíveis: ' + nomes);
                    return;
                }
                d.cartao_id = found.id;
                break;
            case 'categoria':
                d.categoria = texto.trim();
                break;
            case 'status_despesa':
                if (texto === 'quitada') {
                    d.ja_pago = true;
                    d.status  = 'quitada';
                } else if (texto === 'atrasada') {
                    d.ja_pago = false;
                    d.status  = 'atrasada';
                } else if (texto === 'pendente') {
                    d.ja_pago = false;
                    d.status  = 'pendente';
                } else {
                    d.ja_pago = false;
                    d.status  = 'em_dia';
                }
                break;
            case 'parcelas':
                var np = parseInt(texto);
                if (isNaN(np) || np < 1) { addGen('Informe um número válido de parcelas. Ex: 1, 3, 12'); return; }
                d.parcelas = np;
                break;
            case 'recorrente':
                d.recorrente = (texto === 'sim');
                break;
            case 'replicar_ate':
                var textoLower = texto.toLowerCase().trim();
                if (textoLower === 'não' || textoLower === 'nao' || textoLower === 'n') {
                    d.replicar_ate = null;
                } else {
                    // Aceita MM/YYYY ou YYYY-MM → normaliza para YYYY-MM-DD
                    var mMatch = texto.match(/^(\d{1,2})[\/\-](\d{4})$/);
                    var yMatch = texto.match(/^(\d{4})[\/\-](\d{1,2})$/);
                    if (mMatch) {
                        d.replicar_ate = mMatch[2] + '-' + String(mMatch[1]).padStart(2,'0') + '-01';
                    } else if (yMatch) {
                        d.replicar_ate = yMatch[1] + '-' + String(yMatch[2]).padStart(2,'0') + '-01';
                    } else {
                        addGen('Não entendi. Use o formato MM/AAAA (ex: 12/2026) ou "não" para remover.');
                        return;
                    }
                }
                break;
        }

        estado.filaCampos.shift();
        estado.aguardandoCampo = null;
        // Se forma_pagamento=crédito, insere cartao_id APÓS remover forma_pagamento da fila
        if (campo === 'forma_pagamento') {
            var _d = estado.dadosParciais;
            if (_d && (_d.forma_pagamento === 'cartao_credito') && !_d.cartao_id && !_resolverCartaoPorNome(_d.nome_cartao)) {
                estado.filaCampos.unshift('cartao_id');
            }
        }
        _proximoCampo();
    }

    // Normalizadores locais (sem chamada ao backend)
    function _normValor(str) {
        var s = String(str).replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.').trim();
        var v = parseFloat(s);
        return isNaN(v) ? 0 : v;
    }

    function _normForma(str) {
        var s = str.toLowerCase().trim();
        if (/cart[aã]o\s*(de\s*)?cr[eé]dito|cr[eé]dito\b/.test(s)) return 'cartao_credito';
        if (/cart[aã]o\s*(de\s*)?d[eé]bito|d[eé]bito\b/.test(s)) return 'cartao_debito';
        if (/pix/.test(s)) return 'pix';
        if (/dinheiro|esp[eé]cie/.test(s)) return 'dinheiro';
        if (/transfer[eê]ncia|ted|doc\b/.test(s)) return 'transferencia';
        if (/boleto/.test(s)) return 'boleto';
        if (/cart[aã]o|card/.test(s)) return 'cartao_credito';
        return null; // desconhecido — não assume silenciosamente
    }

    function _normData(str) {
        var s = str.toLowerCase().trim();
        var hoje = new Date();
        var pad  = function (n) { return String(n).padStart(2, '0'); };
        var fmt0 = function (d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); };
        if (s === 'hoje') return fmt0(hoje);
        if (s === 'amanha' || s === 'amanhã') { var a = new Date(hoje); a.setDate(a.getDate()+1); return fmt0(a); }
        var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (m) {
            var y = m[3] ? (m[3].length === 2 ? '20'+m[3] : m[3]) : String(hoje.getFullYear());
            return y + '-' + pad(parseInt(m[2])) + '-' + pad(parseInt(m[1]));
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            var anoData = parseInt(s.substring(0, 4));
            if (anoData > hoje.getFullYear() + 5) return null; // data implausível (> 5 anos no futuro)
            return s;
        }
        var dm = s.match(/^(?:dia\s+)?(\d{1,2})$/);
        if (dm) return hoje.getFullYear() + '-' + pad(hoje.getMonth()+1) + '-' + pad(parseInt(dm[1]));
        return null;
    }

    // ── PREENCHIMENTO — CARD DE DESPESA (painel flutuante) ────────

    // Resolve cartão pelo nome mencionado no texto (ex: "Nubank", "Inter")
    function _resolverCartaoPorNome(nome) {
        if (!nome || !window.cartoesUsuario) return null;
        var lower = nome.toLowerCase();
        var cartao = window.cartoesUsuario.find(function (c) {
            return (c.nome || '').toLowerCase().includes(lower) ||
                   (c.banco || '').toLowerCase().includes(lower);
        });
        return cartao ? cartao.id : null;
    }

// ── POPULAR SELECT DE CATEGORIAS (modal) ─────────────────────
    var _categoriasCarregadas = false;

    function _popularSelectCategorias(sel, callback) {
        if (!sel) { if (callback) callback(); return; }

        // Já populado — não refaz
        if (sel.options.length > 1) { if (callback) callback(); return; }

        // Usa window.categoriasUsuario se já carregado (app.html + configuracao.js)
        var cats = (window.categoriasUsuario && window.categoriasUsuario.despesas) || [];
        if (cats.length > 0) {
            _preencherOpcoesCategoria(sel, cats);
            if (callback) callback();
            return;
        }

        // Busca da API (ia-mobile.html não carrega configuracao.js)
        var perfilId = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        var q = perfilId ? '?perfil_id=' + perfilId : '';
        apiGet('/categorias' + q).then(function (res) {
            if (res && res.success && Array.isArray(res.data)) {
                _preencherOpcoesCategoria(sel, res.data);
                _categoriasCarregadas = true;
            }
            if (callback) callback();
        }).catch(function () { if (callback) callback(); });
    }

    function _preencherOpcoesCategoria(sel, cats) {
        // Limpa mantendo só a opção vazia
        while (sel.options.length > 1) sel.remove(1);
        cats.forEach(function (c) {
            if (!c || c.ativo === false) return;
            var opt = document.createElement('option');
            opt.value = c.id || c.nome;
            opt.text  = c.nome;
            sel.appendChild(opt);
        });
    }

// ── PREENCHIMENTO — MODAL DE DESPESA (página ia.html) ─────────
    function _preencherModalDespesa(d) {
        _setId('ia-campo-descricao',   d.descricao);
        _setId('ia-campo-valor',       d.valor ? Number(d.valor).toFixed(2) : '');
        _setId('ia-campo-parcelas',    d.parcelas || 1);
        _setId('ia-campo-data',        d.data || '');
        _setId('ia-campo-vencimento',  d.vencimento || '');

        var selForma = document.getElementById('ia-campo-forma-pagamento');
        if (selForma && d.forma_pagamento) {
            selForma.value = d.forma_pagamento;
            selForma.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Checkbox "já pago"
        var jaPagoEl = document.getElementById('ia-campo-ja-pago');
        if (jaPagoEl) {
            jaPagoEl.checked = !!d.ja_pago;
            jaPagoEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Checkbox "recorrente"
        var recorrenteEl = document.getElementById('ia-campo-recorrente');
        if (recorrenteEl) {
            recorrenteEl.checked = !!d.recorrente;
            recorrenteEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Categoria — popula o select se vazio, depois seleciona
        var selCat = document.getElementById('ia-campo-categoria');
        _popularSelectCategorias(selCat, function () {
            if (!selCat) return;
            if (d.categoria_id) {
                selCat.value = d.categoria_id;
            } else if (d.categoria) {
                var optCat = Array.from(selCat.options).find(function(o) {
                    return o.text.toLowerCase() === String(d.categoria).toLowerCase();
                });
                if (optCat) selCat.value = optCat.value;
            }
            selCat.dispatchEvent(new Event('change', { bubbles: true }));
        });

        if (d.descricao && d.categoria) {
            var hint = document.getElementById('ia-aprendizado-hint');
            var textoEl = document.getElementById('ia-aprendizado-texto');
            if (hint) hint.style.display = 'flex';
            if (textoEl) textoEl.textContent = d.descricao;
        }
    }

    function _salvarModalDespesa(e) {
        e.preventDefault();
        var descricao  = document.getElementById('ia-campo-descricao') ? document.getElementById('ia-campo-descricao').value.trim() : '';
        var valorTotal = parseFloat(document.getElementById('ia-campo-valor') ? document.getElementById('ia-campo-valor').value : 0);
        var forma      = document.getElementById('ia-campo-forma-pagamento') ? document.getElementById('ia-campo-forma-pagamento').value : '';
        var dataCompra = document.getElementById('ia-campo-data') ? document.getElementById('ia-campo-data').value : '';
        var vencimento = document.getElementById('ia-campo-vencimento') ? (document.getElementById('ia-campo-vencimento').value || null) : null;
        var totalParcelas = parseInt(document.getElementById('ia-campo-parcelas') ? document.getElementById('ia-campo-parcelas').value : 1) || 1;
        var catId      = document.getElementById('ia-campo-categoria') ? (document.getElementById('ia-campo-categoria').value || null) : null;
        var cartaoId   = document.getElementById('ia-campo-cartao') ? (document.getElementById('ia-campo-cartao').value || null) : null;
        // Lê checkbox "já pago" e "recorrente" do modal — evita hardcode false
        var jaPagoEl   = document.getElementById('ia-campo-ja-pago');
        var jaPago     = jaPagoEl ? !!jaPagoEl.checked : false;
        var recorrenteEl = document.getElementById('ia-campo-recorrente');
        var recorrente   = recorrenteEl ? !!recorrenteEl.checked : false;

        if (!descricao || !valorTotal || !forma || !dataCompra) {
            addGen('Preencha todos os campos obrigatórios.');
            return;
        }

        var parcelado    = totalParcelas > 1;
        var valorParcela = parcelado ? (valorTotal / totalParcelas) : valorTotal;
        var dataVencimento = vencimento || dataCompra;

        // mes/ano derivados do vencimento (sem new Date para evitar bug UTC)
        var partsVenc = dataVencimento.split('-');
        var mes = parseInt(partsVenc[1]) - 1;
        var ano = parseInt(partsVenc[0]);

        // data_pagamento: se já pago, usa hoje
        var _hj = new Date();
        var _p2 = function(n) { return String(n).padStart(2,'0'); };
        var dataPagamentoModal = jaPago
            ? (_hj.getFullYear() + '-' + _p2(_hj.getMonth()+1) + '-' + _p2(_hj.getDate()))
            : null;

        var payload = {
            descricao:        descricao,
            valor:            parseFloat(valorParcela.toFixed(2)),
            valor_original:   parseFloat(valorTotal.toFixed(2)),
            forma_pagamento:  forma,
            data_vencimento:  dataVencimento,
            data_compra:      dataCompra,
            mes:              mes,
            ano:              ano,
            parcelado:        parcelado,
            total_parcelas:   parcelado ? totalParcelas : null,
            parcela_atual:    parcelado ? 1 : null,
            pago:             jaPago,
            data_pagamento:   dataPagamentoModal,
            recorrente:       recorrente
        };
        if (catId)    payload.categoria_id = parseInt(catId);
        if (cartaoId) payload.cartao_id    = parseInt(cartaoId);

        var tidM = addTyping();
        apiMainPost('/despesas', payload).then(function (res) {
            removeTyping(tidM);
            _fecharModal('modal-confirmar-despesa');
            if (res && res.success) {
                if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                    window.usuarioDataManager.limparCache();
                }
                // Limpa cache global para forçar recarga da API com a nova despesa
                if (window.dadosFinanceiros) {
                    window.dadosFinanceiros = {};
                }
                addGen('Despesa "' + descricao + '" cadastrada!');
                // Atualiza a tabela do mês correto
                if (typeof window.renderizarDetalhesDoMes === 'function') {
                    window.mesAberto = mes;
                    window.anoAberto = ano;
                    window.renderizarDetalhesDoMes(mes, ano);
                }
                if (typeof window.carregarDadosDashboard === 'function') {
                    window.carregarDadosDashboard(ano);
                }
                _mostrarChipsContinuacao('Posso ajudar com mais alguma coisa?');
            } else {
                addGen('Erro ao salvar: ' + ((res && res.message) || 'tente novamente.'));
                _mostrarChipsContinuacao('Quer tentar novamente ou fazer outra coisa?', 800);
            }
        }).catch(function () {
            removeTyping(tidM);
            _fecharModal('modal-confirmar-despesa');
            addGen('Erro de conexão ao salvar a despesa.');
            _mostrarChipsContinuacao('Quer tentar novamente?', 800);
        });
    }

    // ── MODAIS (página ia.html) ───────────────────────────────────
    function _abrirModal(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    function _fecharModal(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

    // ── RECORRÊNCIAS ──────────────────────────────────────────────
    function detectarRecorrencias() {
        var lista = document.getElementById('recorrencias-lista');
        if (lista) lista.innerHTML = '<p class="ia-hint">Analisando...</p>';

        apiGet('/recorrencias?detectar=true').then(function (res) {
            if (!res || !res.sugestoes || res.sugestoes.length === 0) {
                if (lista) lista.innerHTML = '<p class="ia-hint">Nenhuma recorrência detectada.</p>';
                return;
            }
            var html = res.sugestoes.map(function (s) {
                return '<div class="ia-recorrencia-item"><span class="ia-rec-desc">' + esc(s.descricao) + '</span><span class="ia-rec-val">' + fmtV(s.valor_medio) + '</span></div>';
            }).join('');
            if (lista) lista.innerHTML = html;
            var modalLista = document.getElementById('recorrencias-modal-lista');
            if (modalLista) { modalLista.innerHTML = html; _abrirModal('modal-recorrencias'); }
        }).catch(function () {
            if (lista) lista.innerHTML = '<p class="ia-hint">Erro ao buscar recorrências.</p>';
        });
    }

    // ── APRENDIZADO ───────────────────────────────────────────────
    function confirmarAprendizado() {
        var texto    = document.getElementById('ia-aprendizado-texto')?.textContent;
        var catEl    = document.getElementById('ia-campo-categoria');
        var categoria = catEl?.options[catEl.selectedIndex]?.text;
        if (!texto || !categoria) return;
        apiPost('/aprendizado', { texto, categoria }).then(function (res) {
            var hint = document.getElementById('ia-aprendizado-hint');
            if (hint) hint.style.display = 'none';
            if (res && res.success) addGen('Gen vai lembrar: "' + texto + '" → ' + categoria);
        }).catch(function () { });
    }

    // ── ARQUIVO ───────────────────────────────────────────────────
    function abrirUpload() {
        var fi = _el('ia-file-input', 'ai-file-input');
        if (fi) fi.click();
    }

    function processarArquivo(input) {
        var file = input.files[0];
        if (!file) return;
        estado.arquivoPendente = file;
        var prev = _el('ia-file-preview', 'ai-file-preview');
        var nome = _el('ia-file-nome',    'ai-file-nome');
        if (prev) prev.style.display = 'flex';
        if (nome) nome.textContent = file.name;
        addGen('"' + file.name + '" selecionado. Clique em enviar para processar.');
    }

    function cancelarArquivo() {
        estado.arquivoPendente = null;
        var prev = _el('ia-file-preview', 'ai-file-preview');
        if (prev) prev.style.display = 'none';
        var fi = _el('ia-file-input', 'ai-file-input');
        if (fi) fi.value = '';
    }

    function _enviarArquivo() {
        var file = estado.arquivoPendente;
        cancelarArquivo();
        estado.enviando = true;
        setBtnDisabled(true);
        addUser('📎 ' + file.name);
        var tid = addTyping();
        var form = new FormData();
        form.append('arquivo', file);

        // Garante mínimo de 10 segundos de análise para leitura mais precisa
        var apiPromise  = apiForm('/arquivo', form);
        var minDelay    = new Promise(function (resolve) { setTimeout(resolve, 10000); });
        // Mensagens de progresso durante análise
        var prog1 = setTimeout(function () { removeTyping(tid); addGen('Lendo conteúdo do documento...'); tid = addTyping(); }, 3000);
        var prog2 = setTimeout(function () { removeTyping(tid); addGen('Identificando campos e valores...'); tid = addTyping(); }, 6500);

        Promise.all([apiPromise, minDelay]).then(function (results) {
            clearTimeout(prog1); clearTimeout(prog2);
            removeTyping(tid);
            var res = results[0];
            if (!res || !res.success) { addGen('Não consegui processar o arquivo: ' + (res?.message || 'tente outro formato ou informe os dados manualmente.')); estado.enviando = false; setBtnDisabled(false); return; }
            var r = res.resultado || {};
            var partes = [res.fonte === 'vision_ia' ? 'Documento analisado com IA.' : 'Documento analisado.'];
            if (r.tipo)                   partes.push(fmtTipo(r.tipo));
            if (r.empresa || r.descricao) partes.push(esc(r.empresa || r.descricao));
            if (r.valor)                  partes.push('Valor: ' + fmtV(r.valor));
            if (r.vencimento)             partes.push('Vencimento: ' + fmtD(r.vencimento));
            addGen(partes.join(' · '));
            var ds = res.despesa_sugerida || {};
            if (!ds.descricao && (r.empresa || r.descricao)) ds.descricao = r.empresa || r.descricao;
            if (!ds.valor && r.valor)                       ds.valor      = r.valor;
            if (!ds.vencimento && r.vencimento)             ds.vencimento = r.vencimento;
            if (!ds.categoria && r.categoria_sugerida)      ds.categoria  = r.categoria_sugerida;
            // Forma de pagamento: não assume — coleta do usuário
            delete ds.forma_pagamento;
            _iniciarColetaCampos(ds, 'despesa');
            estado.enviando = false; setBtnDisabled(false);
        }).catch(function () {
            clearTimeout(prog1); clearTimeout(prog2);
            removeTyping(tid);
            addGen('Erro ao processar arquivo. Tente novamente ou informe os dados manualmente.');
            estado.enviando = false; setBtnDisabled(false);
        });
    }

    // ── BOLETO ────────────────────────────────────────────────────
    function abrirBoleto() {
        var bar = _el('ia-boleto-bar', 'ai-boleto-bar');
        if (!bar) return;
        bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
        if (bar.style.display === 'flex') { var inp = _el('ia-boleto-input', 'ai-boleto-input'); if (inp) inp.focus(); }
    }

    function fecharBoleto() {
        var bar = _el('ia-boleto-bar', 'ai-boleto-bar');
        if (bar) bar.style.display = 'none';
        var inp = _el('ia-boleto-input', 'ai-boleto-input');
        if (inp) inp.value = '';
    }

    function processarBoleto() {
        var campo = _el('ia-boleto-input', 'ai-boleto-input');
        if (!campo || !campo.value.trim()) { addGen('Informe a linha digitável.'); return; }
        var val = campo.value.trim();
        fecharBoleto();
        addUser('🏦 Linha digitável enviada');
        var tid = addTyping();

        apiPost('/boleto', { linha_digitavel: val }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.sucesso) { addGen('Não consegui interpretar o boleto: ' + (res?.erro || 'verifique a linha digitável e tente novamente.')); return; }
            var partes = [];
            if (res.banco_nome) partes.push('Banco: ' + esc(res.banco_nome));
            if (res.valor)      partes.push('Valor: ' + fmtV(res.valor));
            if (res.vencimento) partes.push('Vencimento: ' + fmtD(res.vencimento));
            addGen('Boleto lido. ' + partes.join(' · '));
            var ds = res.despesa || {};
            if (!ds.descricao) ds.descricao = 'Boleto ' + (res.banco_nome || '');
            delete ds.forma_pagamento; // boleto é documento — coleta forma de pagamento do usuário
            _iniciarColetaCampos(ds, 'despesa');
        }).catch(function () { removeTyping(tid); addGen('Erro ao processar boleto.'); });
    }

    // ── VOZ ───────────────────────────────────────────────────────
    function toggleVoz() {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            addGen('Seu navegador não suporta reconhecimento de voz.'); return;
        }
        if (estado.gravandoVoz) { if (estado.reconhecimento) estado.reconhecimento.stop(); }
        else _iniciarVoz();
    }

    function _iniciarVoz() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var rec = new SR();
        rec.lang = 'pt-BR'; rec.continuous = false; rec.interimResults = false;
        rec.onstart = function () {
            estado.gravandoVoz = true; estado.reconhecimento = rec;
            document.getElementById('ia-btn-voice')?.classList.add('gravando');
            document.getElementById('ai-btn-voice')?.classList.add('gravando');
            document.getElementById('ia-btn-send')?.classList.add('gravando');
            addGen('🎙️ Ouvindo...');
        };
        rec.onresult = function (e) {
            var t = e.results[0][0].transcript;
            var inp = elInput();
            if (inp) { inp.value = t; autoResize(inp); _atualizarIconeMicSend(); }
        };
        rec.onend = function () {
            estado.gravandoVoz = false; estado.reconhecimento = null;
            document.getElementById('ia-btn-voice')?.classList.remove('gravando');
            document.getElementById('ai-btn-voice')?.classList.remove('gravando');
            document.getElementById('ia-btn-send')?.classList.remove('gravando');
        };
        rec.onerror = function (e) {
            estado.gravandoVoz = false;
            document.getElementById('ia-btn-voice')?.classList.remove('gravando');
            document.getElementById('ai-btn-voice')?.classList.remove('gravando');
            document.getElementById('ia-btn-send')?.classList.remove('gravando');
            if (e.error !== 'aborted') addGen('Erro de voz: ' + e.error);
        };
        rec.start();
    }

    // ── ATUALIZAR ÍCONE MIC/SEND (botão WhatsApp) ─────────────────
    // Quando o input tem texto → mostra seta de enviar (verde)
    // Quando está vazio → mostra microfone
    function _atualizarIconeMicSend() {
        var inp  = elInput();
        var icon = document.getElementById('ia-mic-send-icon');
        var btn  = document.getElementById('ia-btn-send');
        if (!icon || !btn) return;
        var temTexto = inp && inp.value.trim().length > 0;
        if (temTexto) {
            icon.className = 'fas fa-paper-plane';
            btn.classList.add('ia-btn-mic-send--send');
        } else {
            icon.className = 'fas fa-microphone';
            btn.classList.remove('ia-btn-mic-send--send');
        }
    }

    // ── UTILITÁRIOS ───────────────────────────────────────────────
    // Resolve elemento que pode ter prefixo 'ia-' (página ia.html) ou 'ai-' (painel flutuante)
    function _el(idIA, idAI) {
        return document.getElementById(idIA) || document.getElementById(idAI);
    }

    function setBtnDisabled(v) {
        var b = elSend();
        if (b) b.disabled = v;
    }

    function _setEl(el, val) { if (el && val !== null && val !== undefined) el.value = val; }
    function _setId(id, val) { _setEl(document.getElementById(id), val); }

    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }
    function fmtV(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
    function _hhmm() {
        var n = new Date();
        return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
    }
    function fmtD(d) { if (!d) return ''; var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
    function fmtF(f) {
        var m = { cartao_credito: 'Cartão Crédito', cartao_debito: 'Cartão Débito', credito: 'Cartão Crédito', debito: 'Cartão Débito', pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', boleto: 'Boleto' };
        return m[f] || f || 'Dinheiro';
    }
    function fmtTipo(t) {
        var m = { boleto: 'Boleto', nota_fiscal: 'Nota Fiscal', comprovante: 'Comprovante PIX', recibo: 'Recibo', documento: 'Documento' };
        return m[t] || t;
    }

    // ── DELEGAÇÃO GLOBAL DE EVENTOS ───────────────────────────────
    document.addEventListener('click', function (e) {
        var perfilEl = e.target.closest('[data-perfil-id]');
        if (perfilEl) {
            var msgPerfil = perfilEl.closest('.ai-msg');
            if (msgPerfil) msgPerfil.querySelectorAll('[data-perfil-id]').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
            _selecionarPerfil(parseInt(perfilEl.dataset.perfilId), perfilEl.dataset.perfilNome, perfilEl.dataset.perfilTipo);
            return;
        }

        if (e.target.closest('[data-chip]')) { _chip(e.target.closest('[data-chip]')); return; }

        // Botões de opção rápida (forma de pagamento, cartão, etc.)
        // e chips de continuação (próxima ação após confirmar despesa/receita)
        var opcaoEl = e.target.closest('[data-opcao]');
        if (opcaoEl) {
            var opcaoVal   = opcaoEl.dataset.opcao;
            var opcaoLabel = opcaoEl.dataset.opcaoLabel || opcaoEl.textContent.trim();
            // Desabilita todos os botões da mesma mensagem para evitar re-clique
            var msgContainer = opcaoEl.closest('.ai-msg');
            if (msgContainer) {
                msgContainer.querySelectorAll('[data-opcao]').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
            }
            if (estado.aguardandoCampo) {
                // Coleta de campos faltantes: processa localmente
                addUser(opcaoLabel);
                _processarCampoColetado(opcaoVal);
            } else {
                // Chip de continuação / próxima ação: envia como mensagem ao backend
                enviarAcaoRapida(opcaoVal);
            }
            return;
        }

        var action = e.target.closest('[data-action]');
        if (action) {
            var a = action.dataset.action;
            // Bloqueia todos os botões do card imediatamente para evitar duplo clique
            var cardContainer = action.closest('.ai-msg');
            if (cardContainer) {
                cardContainer.querySelectorAll('[data-action]').forEach(function(b) {
                    b.disabled = true;
                    b.style.opacity = '0.5';
                    b.style.pointerEvents = 'none';
                });
            }
            if (a === 'confirmar-despesa') confirmarDespesa();
            else if (a === 'editar-despesa')    editarDespesa();
            else if (a === 'cancelar-despesa')  cancelarDespesa();
            else if (a === 'confirmar-receita') confirmarReceita();
            else if (a === 'editar-receita')    editarReceita();
            else if (a === 'cancelar-receita')  cancelarReceita();
        }
    });

    function _chip(btn) {
        var input = elInput();
        if (input) { input.value = btn.textContent.trim(); autoResize(input); input.focus(); }
    }

    // ── SALVAR CHAVE / PROVEDOR DE IA ────────────────────────────
    var HINTS_PROVIDER = {
        openai:  'Chave começa com <code>sk-</code>. Obtenha em platform.openai.com',
        gemini:  'Obtenha sua chave em aistudio.google.com/apikey',
        claude:  'Chave começa com <code>sk-ant-</code>. Obtenha em console.anthropic.com'
    };
    var LABELS_PROVIDER = {
        gen:    'Gen ativa — IA interna e-conomia',
        openai: 'OpenAI ativa — GPT-4o mini',
        gemini: 'Google Gemini ativo — Gemini 2.0 Flash',
        claude: 'Anthropic Claude ativo — Claude Haiku'
    };

    function setupProviderSelect() {
        var sel = document.getElementById('ia-provider-select');
        if (!sel) return;
        function atualizarUI() {
            var v = sel.value;
            var row  = document.getElementById('ia-key-row');
            var hint = document.getElementById('ia-key-hint');
            if (row)  row.style.display  = (v === 'gen') ? 'none' : 'flex';
            if (hint) hint.innerHTML = HINTS_PROVIDER[v] || '';
        }
        sel.addEventListener('change', function () {
            atualizarUI();
            if (_iaInitializando) return; // carregamento inicial — não salvar nem toastar
            var v = sel.value;
            if (v === 'gen') {
                salvarChaveAPI();
                return;
            }
            var inp = document.getElementById('ia-api-key-input');
            // Se já tem chave salva para este provedor, mostra máscara e auto-salva
            if (sessionStorage.getItem('ia_tem_chave_' + v)) {
                if (inp) inp.value = '••••••••';
                salvarChaveAPI(); // envia provider com chave vazia → backend mantém existente
            } else {
                if (inp) inp.value = '';
            }
        });
        atualizarUI();
    }

    function _toast(msg, tipo) {
        if (typeof window.mostrarToast === 'function') window.mostrarToast(msg, tipo || 'info');
        else if (typeof window.mostrarNotificacao === 'function') window.mostrarNotificacao(msg, tipo || 'info');
    }

    function _atualizarBadgeExterna(provider) {
        var badge = document.getElementById('ai-externa-badge');
        if (!badge) return;
        badge.style.display = (provider && provider !== 'gen') ? 'inline-flex' : 'none';
    }

    var _CHAVE_MASK = '••••••••';

    function salvarChaveAPI() {
        var provider = document.getElementById('ia-provider-select')?.value || 'gen';
        var input    = document.getElementById('ia-api-key-input');
        var chave    = input ? input.value.trim() : '';

        // Máscara = usuário não alterou, envia vazio (backend mantém chave existente)
        if (chave === _CHAVE_MASK) chave = '';

        // Sem chave e sem registro anterior
        if (provider !== 'gen' && !chave && !sessionStorage.getItem('ia_tem_chave_' + provider)) {
            _toast('Informe a chave antes de salvar.', 'warning'); return;
        }

        apiPost('/config/chave', { provider: provider, api_key: chave }).then(function (res) {
            if (res && res.success) {
                _toast((LABELS_PROVIDER[provider] || 'Configuração salva') + ' ativa!', 'success');
                // Mostra máscara em vez de limpar
                if (input && provider !== 'gen') {
                    input.value = _CHAVE_MASK;
                    sessionStorage.setItem('ia_tem_chave_' + provider, '1');
                } else if (input) {
                    input.value = '';
                }
                var badge = document.getElementById('ia-badge-status');
                if (badge) { badge.textContent = LABELS_PROVIDER[provider] || provider; badge.className = 'badge ' + (provider === 'gen' ? 'gen' : 'ativo'); }
                _atualizarBadgeExterna(provider);
            } else {
                _toast('Erro ao salvar: ' + (res?.message || 'tente novamente.'), 'error');
            }
        }).catch(function () { _toast('Erro de conexão ao salvar a configuração.', 'error'); });
    }

    // ── SAUDAÇÃO COM PERFIL ATIVO ─────────────────────────────────
    function _mostrarPerfilNaSaudacao() {
        var wrapper = document.getElementById('ia-welcome-perfil');
        var badge   = document.getElementById('ia-welcome-perfil-badge');
        if (!wrapper || !badge) return;

        var nome = localStorage.getItem('perfilAtivoNome') || '';
        var tipo = localStorage.getItem('perfilAtivoTipo') || 'pessoal';

        if (!nome) return; // sem perfil carregado ainda

        var icone = tipo === 'empresa' ? '🏢' : '👤';
        var label = tipo === 'empresa' ? 'PJ' : 'PF';

        badge.textContent = icone + ' Perfil ativo: ' + nome + ' (' + label + ')';
        badge.className   = 'ia-welcome-perfil-badge ' + (tipo === 'empresa' ? 'pj' : 'pf');
        wrapper.style.display = 'flex';

        // Atualiza se o perfil mudar durante a sessão (troca via select)
        window.addEventListener('storage', function (e) {
            if (e.key !== 'perfilAtivoNome' && e.key !== 'perfilAtivoTipo') return;
            var n = localStorage.getItem('perfilAtivoNome') || '';
            var t = localStorage.getItem('perfilAtivoTipo') || 'pessoal';
            if (!n) return;
            badge.textContent = (t === 'empresa' ? '🏢' : '👤') + ' Perfil ativo: ' + n + ' (' + (t === 'empresa' ? 'PJ' : 'PF') + ')';
            badge.className   = 'ia-welcome-perfil-badge ' + (t === 'empresa' ? 'pj' : 'pf');
        });
    }

    // ── INICIALIZAÇÃO ─────────────────────────────────────────────
    function _init() {
        estado.modoPagina = !!document.querySelector('.ia-container');

        // ── Painel flutuante (index.html) ────────────────────────
        if (!estado.modoPagina) {
            // FAB: NÃO registra addEventListener aqui — aplicarVisibilidadeIA() controla
            // o onclick do FAB exclusivamente para evitar disparo duplo no plano gratuito.
            document.getElementById('ai-btn-fechar-panel')?.addEventListener('click', fechar);
            document.getElementById('ai-btn-nova-conversa')?.addEventListener('click', limparConversa);

            // Boleto
            document.getElementById('ai-btn-abrir-boleto')?.addEventListener('click', abrirBoleto);
            document.getElementById('ai-btn-processar-boleto')?.addEventListener('click', processarBoleto);
            document.getElementById('ai-btn-fechar-boleto')?.addEventListener('click', fecharBoleto);

            // Arquivo
            document.getElementById('ai-btn-attach')?.addEventListener('click', abrirUpload);
            document.getElementById('ai-btn-cancelar-arquivo')?.addEventListener('click', cancelarArquivo);
            document.getElementById('ai-file-input')?.addEventListener('change', function () { processarArquivo(this); });

            // Config — provedor e chave
            setupProviderSelect();
            document.getElementById('ia-btn-salvar-chave')?.addEventListener('click', salvarChaveAPI);

            // Botões da navbar / IA (app.html)
            document.getElementById('btn-instrucoes-gen')?.addEventListener('click', abrirModalInstrucoesGen);
            document.getElementById('btn-carta-nova-instrucao')?.addEventListener('click', abrirModalCartaInstrucao);
            document.getElementById('btn-carta-nova-instrucao-global')?.addEventListener('click', abrirModalCartaInstrucao);

            // Modais de instruções Gen
            document.getElementById('btn-fechar-instrucoes-gen')?.addEventListener('click', fecharModalInstrucoesGen);
            document.getElementById('btn-salvar-instrucoes-gen')?.addEventListener('click', salvarInstrucoesGen);

            // Modal carta de instrução
            document.getElementById('btn-fechar-carta-instrucao')?.addEventListener('click', fecharModalCartaInstrucao);
            document.getElementById('btn-salvar-carta-instrucao')?.addEventListener('click', salvarCartaInstrucao);

            setTimeout(inicializar, 1500);
        }

        // ── Página completa (ia.html) ────────────────────────────
        if (estado.modoPagina) {
            document.getElementById('btn-voltar-sistema')?.addEventListener('click', function () { window.location.href = 'app.html'; });
            document.getElementById('btn-nova-conversa')?.addEventListener('click', limparConversa);
            document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);

            document.querySelectorAll('[data-acao-rapida]').forEach(function (btn) {
                btn.addEventListener('click', function () { enviarAcaoRapida(this.dataset.acaoRapida); });
            });
            document.querySelectorAll('[data-exemplo]').forEach(function (el) {
                el.addEventListener('click', function () { preencherInput(this.dataset.exemplo); });
            });
            document.querySelectorAll('[data-preencher]').forEach(function (el) {
                el.addEventListener('click', function () { preencherInput(this.dataset.preencher); });
            });

            document.getElementById('btn-abrir-upload')?.addEventListener('click', abrirUpload);
            document.getElementById('btn-attach-file')?.addEventListener('click', abrirUpload);
            document.getElementById('chip-upload')?.addEventListener('click', abrirUpload);
            document.getElementById('btn-abrir-boleto')?.addEventListener('click', abrirBoleto);
            document.getElementById('btn-barcode-desktop')?.addEventListener('click', abrirBoleto);
            document.getElementById('chip-boleto')?.addEventListener('click', abrirBoleto);
            document.getElementById('btn-processar-boleto-page')?.addEventListener('click', processarBoleto);
            document.getElementById('btn-fechar-boleto-page')?.addEventListener('click', fecharBoleto);
            document.getElementById('btn-cancelar-arquivo-page')?.addEventListener('click', cancelarArquivo);
            document.getElementById('btn-detectar-recorrencias')?.addEventListener('click', detectarRecorrencias);
            document.getElementById('ia-file-input')?.addEventListener('change', function () { processarArquivo(this); });

            document.getElementById('btn-fechar-modal-despesa')?.addEventListener('click', function () { _fecharModal('modal-confirmar-despesa'); });
            document.getElementById('btn-cancelar-modal-despesa')?.addEventListener('click', function () { _fecharModal('modal-confirmar-despesa'); });
            document.getElementById('btn-fechar-modal-recorrencias')?.addEventListener('click', function () { _fecharModal('modal-recorrencias'); });
            document.getElementById('btn-fechar-recorrencias')?.addEventListener('click', function () { _fecharModal('modal-recorrencias'); });
            document.getElementById('btn-confirmar-aprendizado')?.addEventListener('click', confirmarAprendizado);

            document.getElementById('form-despesa-ia')?.addEventListener('submit', _salvarModalDespesa);
            document.getElementById('ia-campo-forma-pagamento')?.addEventListener('change', function () {
                var row = document.getElementById('row-cartao');
                if (row) row.style.display = (this.value === 'cartao_credito') ? 'flex' : 'none';
            });

            inicializar();
            _mostrarPerfilNaSaudacao();

            // Esconde o loader assim que a UI está pronta
            if (typeof window.hideLoadingScreen === 'function') {
                window.hideLoadingScreen();
            }
        }

        // ── Ambos os contextos ───────────────────────────────────
        var input = elInput();
        if (input) {
            input.addEventListener('keydown', handleKeyDown);
            input.addEventListener('input', function () { autoResize(this); });
        }

        // send btn — elSend() já resolve o botão certo em cada contexto
        // O botão ia-btn-send agora age como mic (voz) quando o input está vazio,
        // e como enviar quando há texto — estilo WhatsApp.
        var sendBtn = elSend();
        if (sendBtn) {
            sendBtn.addEventListener('click', function () {
                var inp = elInput();
                var temTexto = inp && inp.value.trim().length > 0;
                if (temTexto || estado.arquivoPendente) {
                    enviarMensagem();
                } else {
                    toggleVoz();
                }
            });
        }

        // Atualiza ícone do botão mic/send ao digitar
        var inputEl = elInput();
        if (inputEl) {
            inputEl.addEventListener('input', function () {
                _atualizarIconeMicSend();
            });
        }

        document.getElementById('ia-btn-voice')?.addEventListener('click', toggleVoz);
        document.getElementById('ai-btn-voice')?.addEventListener('click', toggleVoz);
    }

    // Garante inicialização mesmo se DOMContentLoaded já disparou
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    function notificarTrocaPerfil(nome, tipo) {
        var icone = tipo === 'empresa' ? '🏢' : '👤';
        var tipoLabel = tipo === 'empresa' ? 'empresa' : 'perfil pessoal';
        addGen(icone + ' Perfil alterado! Agora estou analisando ' + (tipo === 'empresa' ? 'a empresa <b>' + nome + '</b>' : 'seu <b>perfil Pessoal</b>') + '. Como posso ajudar?');
    }

    return {
        abrir, fechar, limpar: limparConversa, enviar: enviarMensagem,
        enviarAcaoRapida, preencherInput, handleKeyDown, autoResize, toggleSidebar,
        confirmarDespesa, editarDespesa, cancelarDespesa,
        confirmarReceita, editarReceita, cancelarReceita,
        selecionarArquivo: processarArquivo, cancelarArquivo,
        abrirBoleto, fecharBoleto, processarBoleto, abrirUpload,
        toggleVoz, confirmarAprendizado, detectarRecorrencias,
        salvarChaveAPI, notificarTrocaPerfil
    };
}());

// ── VISUAL VIEWPORT — ajuste do painel quando teclado virtual abre ──
// Em iOS/Android, quando o teclado virtual abre, a viewport diminui.
// dvh já resolve na maioria dos casos modernos, mas este listener
// garante compatibilidade com navegadores mais antigos.
(function () {
    if (!window.visualViewport) return;
    function _ajustarPainelIA() {
        var panel = document.getElementById('ai-chat-panel');
        if (!panel || panel.style.display === 'none') return;
        // Só aplica em mobile (< 481px) onde o painel é tela cheia
        if (window.innerWidth > 480) return;
        panel.style.height = window.visualViewport.height + 'px';
    }
    window.visualViewport.addEventListener('resize', _ajustarPainelIA);
    window.visualViewport.addEventListener('scroll', _ajustarPainelIA);
}());

function abrirModalInstrucoesGen() {
    var modal = document.getElementById('modal-instrucoes-gen');
    var input = document.getElementById('instrucoes-gen-input');
    if (!modal) return;
    modal.style.display = 'flex';
    // Carrega instruções existentes do usuário
    var url = (window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api') + '/ai/instrucoes';
    var token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.json(); })
        .then(function (res) { if (input) input.value = res.conteudo || ''; })
        .catch(function () { if (input) input.value = ''; });
}

function fecharModalInstrucoesGen() {
    var modal = document.getElementById('modal-instrucoes-gen');
    if (modal) modal.style.display = 'none';
}

function salvarInstrucoesGen() {
    var input = document.getElementById('instrucoes-gen-input');
    var conteudo = input ? input.value.trim() : '';
    // Permite salvar vazio (para limpar as instruções)
    var url = (window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api') + '/ai/instrucoes';
    var token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ conteudo: conteudo })
    }).then(function (r) { return r.json(); }).then(function (res) {
        var _t = window.mostrarToast || window.mostrarNotificacao || function(){};
        if (res && res.success) {
            fecharModalInstrucoesGen();
            _t('Instruções salvas com sucesso!', 'success');
        } else {
            _t('Erro ao salvar: ' + (res.erro || 'tente novamente'), 'error');
        }
    }).catch(function () { (window.mostrarToast || window.mostrarNotificacao || function(){})('Erro de conexão ao salvar instruções.', 'error'); });
}

// ── CARTA DE SERVIÇOS ─────────────────────────────────────────────
function carregarCartaServicos() {
    var container = document.getElementById('carta-servicos-content');
    if (!container) return;
    var url = (window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api') + '/ai/carta';
    var token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.conteudo && typeof marked !== 'undefined') {
                container.innerHTML = marked.parse(res.conteudo);
            } else if (res.conteudo) {
                container.innerHTML = '<pre style="white-space:pre-wrap;font-size:13px">' + res.conteudo + '</pre>';
            } else {
                container.innerHTML = '<p style="color:var(--gray-400)">Carta não disponível.</p>';
            }
        })
        .catch(function () {
            container.innerHTML = '<p style="color:var(--danger-color)">Erro ao carregar carta.</p>';
        });
}

function abrirModalCartaInstrucao() {
    var modal = document.getElementById('modal-carta-instrucao');
    var input = document.getElementById('carta-instrucao-input');
    var status = document.getElementById('carta-instrucao-status');
    if (!modal) return;
    if (input) input.value = '';
    if (status) status.textContent = '';
    modal.style.display = 'flex';
    setTimeout(function () { if (input) input.focus(); }, 100);
}

function fecharModalCartaInstrucao() {
    var modal = document.getElementById('modal-carta-instrucao');
    if (modal) modal.style.display = 'none';
}

function salvarCartaInstrucao() {
    var input  = document.getElementById('carta-instrucao-input');
    var status = document.getElementById('carta-instrucao-status');
    var btn    = document.getElementById('btn-salvar-carta-instrucao');
    var instrucao = input ? input.value.trim() : '';
    if (!instrucao) { if (status) status.textContent = 'Escreva uma instrução antes de continuar.'; return; }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Revisando...'; }
    if (status) status.textContent = 'A IA está analisando e incorporando a instrução...';

    var url = (window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api') + '/ai/carta';
    var token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ instrucao: instrucao })
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Revisar com IA'; }
        if (res.success) {
            fecharModalCartaInstrucao();
            (window.mostrarToast || window.mostrarNotificacao || function(){})('Carta atualizada com sucesso!', 'success');
            // Recarrega a carta na aba
            var container = document.getElementById('carta-servicos-content');
            if (container && res.conteudo) {
                container.innerHTML = typeof marked !== 'undefined'
                    ? marked.parse(res.conteudo)
                    : '<pre style="white-space:pre-wrap;font-size:13px">' + res.conteudo + '</pre>';
            }
        } else {
            if (status) status.textContent = 'Erro: ' + (res.erro || 'tente novamente');
        }
    })
    .catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Revisar com IA'; }
        if (status) status.textContent = 'Erro de conexão.';
    });
}

// ── ATIVAR / DESATIVAR IA ─────────────────────────────────────
function _iaMaster() {
    try {
        var u = JSON.parse(sessionStorage.getItem('dadosUsuarioLogado') || '{}');
        return (u.tipo || '').toLowerCase() === 'master';
    } catch (e) { return false; }
}

function aplicarVisibilidadeIA() {
    var ativo         = localStorage.getItem('ia_ativo') !== 'false'; // padrão: true
    var planoStatus   = window._planoStatus || 'trial';
    var planoPago     = (planoStatus === 'ativo');

    // Verificar tipo do usuário logado
    var usuarioAtual  = window.usuarioDataManager?.getUsuarioAtual?.();
    var tipoUsuario   = usuarioAtual?.tipo || 'padrao';
    var isMaster      = (tipoUsuario === 'master');

    var fab              = document.getElementById('btn-fab-ia');
    var btnInstrucoes    = document.getElementById('btn-instrucoes-gen');
    var tabBtn           = document.querySelector('.config-tab-btn[data-tab="assistente-ia"]');
    var toggle           = document.getElementById('ia-toggle-ativo');
    var toggleContainer  = document.getElementById('ia-toggle-container');

    // Sincronizar toggle
    if (toggle) toggle.checked = ativo;

    // ── Master: acesso total + toggle visível ──
    if (isMaster) {
        if (toggleContainer) toggleContainer.style.display = '';
        if (fab) {
            fab.style.display = '';
            fab.onclick = function () { if (typeof window.IA !== 'undefined') window.IA.abrir(); };
        }
        if (btnInstrucoes) btnInstrucoes.style.display = '';
        if (tabBtn)        tabBtn.style.display        = '';
        return;
    }

    // Não-master: sempre ocultar o toggle
    if (toggleContainer) toggleContainer.style.display = 'none';

    // ── Prioridade 1: toggle OFF → tudo oculto para padrão e admin ──
    if (!ativo) {
        if (fab)           fab.style.display           = 'none';
        if (btnInstrucoes) btnInstrucoes.style.display = 'none';
        if (tabBtn)        tabBtn.style.display        = 'none';
        return;
    }

    // ── Prioridade 2: toggle ON + plano gratuito (trial/expirado) ──
    if (!planoPago) {
        // FAB visível mas redireciona para planos ao clicar
        if (fab) {
            fab.style.display = '';
            fab.onclick = function (e) {
                e.stopPropagation();
                if (typeof window.abrirModalPlanos === 'function') window.abrirModalPlanos();
            };
        }
        if (btnInstrucoes) btnInstrucoes.style.display = 'none';
        if (tabBtn)        tabBtn.style.display        = 'none';
        return;
    }

    // ── Prioridade 3: toggle ON + plano pago → acesso total ──
    if (fab) {
        fab.style.display = '';
        fab.onclick = function () { if (typeof window.IA !== 'undefined') window.IA.abrir(); };
    }
    if (btnInstrucoes) btnInstrucoes.style.display = '';
    if (tabBtn)        tabBtn.style.display        = '';
}

function _initToggleIA() {
    var toggle = document.getElementById('ia-toggle-ativo');
    if (!toggle) return;
    toggle.addEventListener('change', function () {
        localStorage.setItem('ia_ativo', this.checked ? 'true' : 'false');
        aplicarVisibilidadeIA();
    });
    aplicarVisibilidadeIA();
}

// Inicializar toggle quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(_initToggleIA, 300);
    });
} else {
    setTimeout(_initToggleIA, 300);
}

// Re-aplicar quando a aba IA for aberta (o toggle pode ainda não existir no DOM)
document.addEventListener('click', function (e) {
    if (e.target.closest('.config-tab-btn[data-tab="assistente-ia"]')) {
        setTimeout(function () { _initToggleIA(); aplicarVisibilidadeIA(); }, 100);
    }
});
