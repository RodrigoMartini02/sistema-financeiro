// ================================================================
// GEN — IA Financeira Fin-Gerence
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

    var estado = {
        enviando: false,
        gravandoVoz: false,
        reconhecimento: null,
        despesaPendente: null,
        receitaPendente: null,
        arquivoPendente: null,
        contexto: null,
        modoPagina: false, // true quando em ia.html
        aguardandoCampo: null,   // campo sendo coletado ('descricao', 'valor', 'forma_pagamento', 'vencimento', 'data_receita')
        dadosParciais:   null,   // objeto despesa/receita em construção
        tipoColeta:      null,   // 'despesa' ou 'receita'
        filaCampos:      []      // fila de campos ainda a coletar
    };

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

    // ── PAINEL FLUTUANTE ──────────────────────────────────────────
    function abrir(contexto) {
        estado.contexto = contexto || null;
        var panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        var msgs = document.getElementById('ai-messages');
        if (msgs && msgs.children.length === 0) {
            boasVindas(contexto);
            inicializar();
        }
        setTimeout(function () { var inp = elInput(); if (inp) inp.focus(); }, 100);
    }

    function fechar() {
        var panel = document.getElementById('ai-chat-panel');
        if (panel) panel.style.display = 'none';
    }

    // ── INICIALIZAR STATUS ────────────────────────────────────────
    function _setStatus(texto, online) {
        var el  = document.getElementById('ai-panel-status');
        var txt = document.getElementById('ia-status-text');
        var dot = document.getElementById('ia-status-dot');
        if (el)  el.textContent  = texto;
        if (txt) txt.textContent = texto;
        if (dot) { dot.classList.toggle('online', !!online); dot.classList.toggle('offline', !online); }
    }

    function inicializar(tentativa) {
        tentativa = tentativa || 1;
        _setStatus(tentativa > 1 ? 'iniciando... (' + tentativa + ')' : 'conectando...', false);

        apiGet('/config').then(function (cfg) {
            var provider = (cfg && cfg.provider) || 'gen';
            var nome     = (cfg && cfg.nome)     || 'Gen ativa — IA interna Fin-Gerence';
            var isGen    = provider === 'gen';

            _setStatus(nome, true);

            var badge = document.getElementById('ia-badge-status');
            if (badge) { badge.textContent = nome; badge.className = 'badge ' + (isGen ? 'gen' : 'ativo'); }

            var sel = document.getElementById('ia-provider-select');
            if (sel) { sel.value = provider; sel.dispatchEvent(new Event('change')); }

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
                    _setStatus('servidor offline', false);
                }
            });
        });
    }

    // ── BOAS-VINDAS ───────────────────────────────────────────────
    function boasVindas(ctx) {
        var chips = '';
        if (ctx === 'despesa') {
            chips = '<button class="ai-welcome-chip" data-chip>paguei 120 de internet no cartão vence dia 15</button>' +
                    '<button class="ai-welcome-chip" data-chip>200 mercado pix hoje</button>' +
                    '<button class="ai-welcome-chip" data-chip>netflix 55,90 débito</button>';
            addGen('Descreva a despesa em texto livre e eu preencho o formulário para você.<div class="ai-welcome-chips">' + chips + '</div>');
        } else if (ctx === 'receita') {
            chips = '<button class="ai-welcome-chip" data-chip>recebi salário 3500 hoje</button>' +
                    '<button class="ai-welcome-chip" data-chip>freelance 800 pix</button>';
            addGen('Descreva a receita e eu preencho o formulário.<div class="ai-welcome-chips">' + chips + '</div>');
        } else {
            chips = '<button class="ai-welcome-chip" data-chip>paguei 150 de mercado no pix</button>' +
                    '<button class="ai-welcome-chip" data-chip>recebi salário 3500 hoje</button>' +
                    '<button class="ai-welcome-chip" data-chip>quanto gastei esse mês?</button>';
            addGen('Olá! Sou a Gen, sua IA financeira. Posso cadastrar despesas, receitas, analisar gastos e ler documentos.<div class="ai-welcome-chips">' + chips + '</div>');
        }
    }

    function limparConversa() {
        var area = elChat();
        if (area) area.innerHTML = '';
        estado.despesaPendente = null;
        estado.receitaPendente = null;
        cancelarArquivo();
        fecharBoleto();
        apiPost('/chat', { mensagem: '_reset_', limpar_sessao: true }).catch(function () { });
        boasVindas(estado.contexto);
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

        apiPost('/chat', { mensagem: texto }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addGen('Desculpe, ocorreu um erro. Tente novamente.'); return; }

            if (res.acao === 'confirmar_despesa' && res.despesa) {
                if (res.resposta) addGen(fmt(res.resposta));
                _iniciarColetaCampos(res.despesa, 'despesa');
            } else if (res.acao === 'confirmar_receita' && res.receita) {
                if (res.resposta) addGen(fmt(res.resposta));
                _iniciarColetaCampos(res.receita, 'receita');
            } else {
                addGen(res.resposta || '...');
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

    // ── MENSAGENS ─────────────────────────────────────────────────
    function addUser(texto) {
        _ins('<div class="ai-msg ai-msg--user">' +
            '<div class="ai-msg-bub">' + esc(texto) +
            '<span class="ai-msg-time">' + _hhmm() + '</span></div></div>');
    }

    function addGen(html) {
        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-bub">' + html +
            '<span class="ai-msg-time">' + _hhmm() + '</span></div></div>');
    }

    function addComDespesa(texto, d) {
        var totalParcelas = parseInt(d.parcelas) || 1;
        var parcelado     = totalParcelas > 1;
        var valorTotal    = parseFloat(d.valor) || 0;
        var valorParcela  = parcelado ? valorTotal / totalParcelas : valorTotal;

        // Calcula mês/ano do vencimento para exibir
        var dataVenc = d.vencimento || d.data || '';
        var mesLabel = '';
        if (dataVenc) {
            var p = dataVenc.split('-');
            var meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            mesLabel = ' → ' + (meses[parseInt(p[1])-1] || '') + '/' + p[0];
        }

        var semValor = valorTotal <= 0;

        var rows = '';
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Descrição</span><span class="ai-dc-val">' + esc(d.descricao || '—') + '</span></div>';
        if (parcelado) {
            rows += '<div class="ai-dc-row"><span class="ai-dc-label">Valor total</span><span class="ai-dc-valor' + (semValor ? ' ai-dc-alerta' : '') + '">' + (semValor ? '⚠ não informado' : fmtV(valorTotal)) + '</span></div>';
            rows += '<div class="ai-dc-row"><span class="ai-dc-label">Parcelas</span><span class="ai-dc-val">' + totalParcelas + 'x de ' + fmtV(valorParcela) + '</span></div>';
        } else {
            rows += '<div class="ai-dc-row"><span class="ai-dc-label">Valor</span><span class="ai-dc-valor' + (semValor ? ' ai-dc-alerta' : '') + '">' + (semValor ? '⚠ não informado' : fmtV(valorTotal)) + '</span></div>';
        }
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Categoria</span><span class="ai-dc-val">' + esc(d.categoria || 'Outros') + '</span></div>';
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Pagamento</span><span class="ai-dc-val">' + fmtF(d.forma_pagamento) + '</span></div>';
        if (dataVenc) rows += '<div class="ai-dc-row"><span class="ai-dc-label">Vencimento</span><span class="ai-dc-val">' + fmtD(dataVenc) + '<small class="ai-dc-mes">' + mesLabel + '</small></span></div>';
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Status</span><span class="ai-dc-val ' + (d.ja_pago ? 'ai-dc-pago' : 'ai-dc-pendente') + '">' + (d.ja_pago ? '✔ Paga' : '⏳ Pendente') + '</span></div>';
        if (d.recorrente) rows += '<div class="ai-dc-row"><span class="ai-dc-label">Recorrente</span><span class="ai-dc-val">🔄 Sim</span></div>';

        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-bub">' + fmt(texto) +
            '<div class="ai-despesa-card">' + rows + '</div>' +
            '<div class="ai-msg-btns">' +
            '<button class="ai-msg-btn-ok"   data-action="confirmar-despesa"><i class="fas fa-check"></i> Confirmar</button>' +
            '<button class="ai-msg-btn-edit" data-action="editar-despesa"><i class="fas fa-edit"></i> Editar</button>' +
            '<button class="ai-msg-btn-no"   data-action="cancelar-despesa"><i class="fas fa-times"></i> Cancelar</button>' +
            '</div>' +
            '<span class="ai-msg-time">' + _hhmm() + '</span>' +
            '</div></div>');
    }

    function addComReceita(texto, r) {
        var rows = '';
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Descrição</span><span class="ai-dc-val">' + esc(r.descricao || '—') + '</span></div>';
        rows += '<div class="ai-dc-row"><span class="ai-dc-label">Valor</span><span class="ai-dc-valor">' + fmtV(r.valor) + '</span></div>';
        if (r.data) rows += '<div class="ai-dc-row"><span class="ai-dc-label">Data</span><span class="ai-dc-val">' + fmtD(r.data) + '</span></div>';

        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-bub">' + fmt(texto) +
            '<div class="ai-despesa-card">' + rows + '</div>' +
            '<div class="ai-msg-btns">' +
            '<button class="ai-msg-btn-ok"   data-action="confirmar-receita"><i class="fas fa-check"></i> Confirmar</button>' +
            '<button class="ai-msg-btn-edit" data-action="editar-receita"><i class="fas fa-edit"></i> Editar</button>' +
            '<button class="ai-msg-btn-no"   data-action="cancelar-receita"><i class="fas fa-times"></i> Cancelar</button>' +
            '</div>' +
            '<span class="ai-msg-time">' + _hhmm() + '</span>' +
            '</div></div>');
    }

    function addTyping() {
        var id = 'ai-typ-' + Date.now();
        _ins('<div class="ai-msg ai-msg--ai" id="' + id + '">' +
            '<div class="ai-msg-bub"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>');
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
        var totalParcelas = parseInt(d.parcelas) || 1;
        var parcelado     = totalParcelas > 1;
        var valorTotal    = parseFloat(d.valor) || 0;
        var valorParcela  = parcelado ? valorTotal / totalParcelas : valorTotal;

        // Data de vencimento: usa a extraída ou o dia 15 do mês aberto
        var mesAb  = window.mesAberto;
        var anoAb  = window.anoAberto;
        var dataFallback = (mesAb !== undefined && anoAb)
            ? anoAb + '-' + String(mesAb + 1).padStart(2, '0') + '-15'
            : new Date().toISOString().split('T')[0];

        var dataVencimento = d.vencimento || d.data || dataFallback;
        var dataCompra     = d.data       || dataFallback;

        // mes/ano derivados do vencimento (sem new Date para evitar bug UTC)
        var partsVenc = dataVencimento.split('-');
        var mes = parseInt(partsVenc[1]) - 1;   // 0-based
        var ano = parseInt(partsVenc[0]);

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
            data_pagamento:        d.ja_pago ? (dataCompra || dataVencimento) : null,
            recorrente:            !!d.recorrente,
            categoria_id:          d.categoria_id || null,
            cartao_id:             cartaoId || null
        };

        var tidD = addTyping();
        // Chama o mesmo endpoint que o modal manual usa
        apiMainPost('/despesas', payload).then(function (res) {
            removeTyping(tidD);
            if (res && res.success) {
                var sufixo = parcelado ? ' (' + totalParcelas + 'x de ' + fmtV(valorParcela) + ')' : '';
                addGen('Despesa "' + d.descricao + '"' + sufixo + ' cadastrada com sucesso!');
                if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                    window.usuarioDataManager.limparCache();
                }
                if (typeof window.renderizarDetalhesDoMes === 'function') {
                    window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                }
                if (typeof window.carregarDadosDashboard === 'function') {
                    window.carregarDadosDashboard(window.anoAberto);
                }
            } else {
                addGen('Erro ao cadastrar: ' + ((res && res.message) || 'tente novamente.'));
            }
        }).catch(function () {
            removeTyping(tidD);
            addGen('Erro de conexão ao salvar a despesa.');
        });
    }

    function editarDespesa() {
        var d = estado.despesaPendente;
        if (!d) return;
        // Editar = abre o modal preenchido para o usuário ajustar antes de salvar
        if (typeof window.abrirModalNovaDespesa === 'function') {
            window.abrirModalNovaDespesa();
            setTimeout(function () {
                var card = document.querySelector('#despesa-cards-container .despesa-card');
                if (card) {
                    _preencherCardDespesa(card, d);
                    addGen('Formulário preenchido! Edite o que precisar e clique em Salvar.');
                } else {
                    addGen('Modal aberto. Preencha os dados e salve.');
                }
                fechar();
            }, 400);
        } else {
            addGen('Abra o modal "Lançar Despesas" para editar.');
            fechar();
        }
        estado.despesaPendente = null;
    }

    function cancelarDespesa() {
        estado.despesaPendente = null;
        addGen('Operação cancelada.');
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
            ano:               ano
        };

        var tidR = addTyping();
        // Chama o mesmo endpoint que o modal de receita usa
        apiMainPost('/receitas', payload).then(function (res) {
            removeTyping(tidR);
            if (res && res.success) {
                addGen('Receita "' + r.descricao + '" cadastrada!');
                if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                    window.usuarioDataManager.limparCache();
                }
                if (typeof window.renderizarDetalhesDoMes === 'function') {
                    window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                }
                if (typeof window.carregarDadosDashboard === 'function') {
                    window.carregarDadosDashboard(window.anoAberto);
                }
            } else {
                addGen('Erro ao salvar: ' + ((res && res.message) || 'tente novamente.'));
            }
        }).catch(function () { removeTyping(tidR); addGen('Erro de conexão ao salvar receita.'); });
    }

    function editarReceita() {
        var r = estado.receitaPendente;
        if (!r) return;
        // Editar = abre o modal preenchido para o usuário ajustar
        if (typeof window.abrirModalNovaReceita === 'function') {
            window.abrirModalNovaReceita();
            setTimeout(function () {
                _preencherFormReceita(r);
                addGen('Formulário preenchido! Edite o que precisar e clique em Salvar.');
                fechar();
            }, 400);
        } else {
            addGen('Abra o modal "Nova Receita" para editar.');
            fechar();
        }
        estado.receitaPendente = null;
    }

    function cancelarReceita() {
        estado.receitaPendente = null;
        addGen('Operação cancelada.');
    }

    // ── COLETA DE CAMPOS FALTANTES ────────────────────────────────
    function _camposFaltandoDespesa(d) {
        var falta = [];
        if (!d.descricao) falta.push('descricao');
        if (!d.valor || parseFloat(d.valor) <= 0) falta.push('valor');
        if (!d.forma_pagamento) falta.push('forma_pagamento');
        if (!d.vencimento && !d.data) falta.push('vencimento');
        // Se crédito e nenhum cartão foi resolvido, pergunta qual cartão
        var isCredito = d.forma_pagamento === 'cartao_credito' || d.forma_pagamento === 'credito';
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
        estado.dadosParciais = Object.assign({}, despesa);
        estado.tipoColeta    = tipo;
        estado.filaCampos    = tipo === 'despesa'
            ? _camposFaltandoDespesa(despesa)
            : _camposFaltandoReceita(despesa);

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
        var pergunta;
        if (campo === 'cartao_id') {
            var cartoes = (window.cartoesUsuario || []).filter(function(c) { return c.ativo !== false; });
            if (cartoes.length === 0) {
                pergunta = 'Qual cartão de crédito?';
            } else if (cartoes.length === 1) {
                // Só um cartão — resolve automaticamente sem perguntar
                estado.dadosParciais.cartao_id = cartoes[0].id;
                estado.filaCampos.shift();
                estado.aguardandoCampo = null;
                _proximoCampo();
                return;
            } else {
                var nomes = cartoes.map(function(c) { return c.nome || c.banco; }).join(', ');
                pergunta = 'Qual cartão de crédito? (' + nomes + ')';
            }
        } else {
            var perguntas = {
                'descricao':       'Qual a descrição da despesa?',
                'valor':           'Qual o valor?',
                'forma_pagamento': 'Como foi pago? (cartão crédito/débito, pix, dinheiro, transferência, boleto)',
                'vencimento':      'Qual a data de vencimento? (ex: hoje, amanhã, 15/04, 20/05/2026)',
                'data_receita':    'Qual a data de recebimento? (ex: hoje, 15/03)'
            };
            pergunta = perguntas[campo] || 'Informe o ' + campo + ':';
        }
        var tid2 = addTyping();
        setTimeout(function () {
            removeTyping(tid2);
            addGen(pergunta);
        }, 600);
    }

    function _processarCampoColetado(texto) {
        var campo = estado.aguardandoCampo;
        var d     = estado.dadosParciais;

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
        }

        estado.filaCampos.shift();
        estado.aguardandoCampo = null;
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
        return 'dinheiro';
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        var dm = s.match(/^(?:dia\s+)?(\d{1,2})$/);
        if (dm) return hoje.getFullYear() + '-' + pad(hoje.getMonth()+1) + '-' + pad(parseInt(dm[1]));
        return null;
    }

    // ── PREENCHIMENTO — CARD DE DESPESA (painel flutuante) ────────
    function _preencherCardDespesa(card, d) {
        // Descrição
        _setEl(card.querySelector('.card-descricao'), d.descricao);

        // Valor
        if (d.valor) {
            var valEl = card.querySelector('.card-valor-original');
            if (valEl) { valEl.value = Number(d.valor).toFixed(2); valEl.dispatchEvent(new Event('input', { bubbles: true })); }
        }

        // Parcelas (parcelado fica visível automaticamente via calcularInfoCard quando parcelas > 1)
        if (d.parcelas > 1) {
            var parEl = card.querySelector('.card-parcelas');
            if (parEl) { parEl.value = d.parcelas; parEl.dispatchEvent(new Event('input', { bubbles: true })); }
        }

        // Data de compra
        if (d.data) {
            var compraEl = card.querySelector('.card-compra');
            if (compraEl) { compraEl.value = d.data; compraEl.dispatchEvent(new Event('change', { bubbles: true })); }
        }

        // Vencimento
        if (d.vencimento) {
            var vencEl = card.querySelector('.card-vencimento');
            if (vencEl) { vencEl.value = d.vencimento; vencEl.dispatchEvent(new Event('change', { bubbles: true })); }
        }

        // Já pago
        if (d.ja_pago) {
            var jaPagoEl = card.querySelector('.card-ja-paga');
            if (jaPagoEl) { jaPagoEl.checked = true; jaPagoEl.dispatchEvent(new Event('change', { bubbles: true })); }
        }

        // Recorrente
        if (d.recorrente) {
            var recEl = card.querySelector('.card-recorrente');
            if (recEl) { recEl.checked = true; recEl.dispatchEvent(new Event('change', { bubbles: true })); }
        }

        // Categoria — após selecionar, dispara aplicarFavoritoCard (que já existe no sistema)
        if (d.categoria) {
            var sel = card.querySelector('.card-categoria');
            if (sel) {
                var opt = Array.from(sel.options).find(function (o) {
                    return o.text.toLowerCase() === d.categoria.toLowerCase();
                });
                if (opt) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    // aplicarFavoritoCard já é chamado pelo listener nativo de change da categoria
                    // mas chamamos explicitamente caso o listener ainda não exista
                    if (typeof window.aplicarFavoritoCard === 'function') {
                        window.aplicarFavoritoCard(card, opt.value);
                    }
                }
            }
        }

        // Forma de pagamento — primeiro tenta pelo favorito da categoria (já aplicado acima)
        // só sobrescreve se a Gen extraiu forma explícita no texto
        var forma = d.forma_pagamento || '';
        if (forma) {
            if (forma === 'cartao_credito' || forma === 'credito') {
                // Tenta identificar cartão pelo nome extraído
                var cartaoId = d.cartao_id || _resolverCartaoPorNome(d.nome_cartao);
                if (cartaoId && typeof window.selecionarPagamentoCartao === 'function') {
                    window.selecionarPagamentoCartao(card, cartaoId);
                } else {
                    // Clica no primeiro botão de cartão disponível
                    var btnCartao = card.querySelector('.pgto-btn[data-cartao-id]');
                    if (btnCartao) btnCartao.click();
                    else addGen('Selecione o cartão de crédito manualmente.');
                }
            } else if (forma === 'cartao_debito' || forma === 'debito') {
                card.querySelector('.pgto-btn[data-forma="debito"]')?.click();
            } else if (forma === 'pix') {
                card.querySelector('.pgto-btn[data-forma="pix"]')?.click();
            } else if (forma === 'dinheiro') {
                card.querySelector('.pgto-btn[data-forma="dinheiro"]')?.click();
            } else if (forma === 'transferencia') {
                card.querySelector('.pgto-btn[data-forma="transferencia"]')?.click();
            }
        }
    }

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

    // ── PREENCHIMENTO — FORM DE RECEITA (painel flutuante) ────────
    function _preencherFormReceita(r) {
        _setEl(document.getElementById('receita-descricao'), r.descricao);
        _setEl(document.getElementById('receita-valor'),     r.valor ? Number(r.valor).toFixed(2) : '');
        _setEl(document.getElementById('receita-data'),      r.data || '');
        document.getElementById('receita-descricao')?.dispatchEvent(new Event('input',  { bubbles: true }));
        document.getElementById('receita-valor')?.dispatchEvent(new Event('input',  { bubbles: true }));
        document.getElementById('receita-data')?.dispatchEvent(new Event('change', { bubbles: true }));
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

        if (!descricao || !valorTotal || !forma || !dataCompra) {
            addGen('Preencha todos os campos obrigatórios.');
            return;
        }

        var parcelado    = totalParcelas > 1;
        var valorParcela = parcelado ? valorTotal / totalParcelas : valorTotal;
        var dataVencimento = vencimento || dataCompra;

        // mes/ano derivados do vencimento (sem new Date para evitar bug UTC)
        var partsVenc = dataVencimento.split('-');
        var mes = parseInt(partsVenc[1]) - 1;
        var ano = parseInt(partsVenc[0]);

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
            pago:             false,
            recorrente:       false
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
                addGen('Despesa "' + descricao + '" cadastrada!');
            } else {
                addGen('Erro ao salvar: ' + ((res && res.message) || 'tente novamente.'));
            }
        }).catch(function () {
            removeTyping(tidM);
            _fecharModal('modal-confirmar-despesa');
            addGen('Erro de conexão ao salvar a despesa.');
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
            var partes = ['Documento analisado.'];
            if (r.tipo)                   partes.push(fmtTipo(r.tipo));
            if (r.empresa || r.descricao) partes.push(esc(r.empresa || r.descricao));
            if (r.valor)                  partes.push('Valor: ' + fmtV(r.valor));
            if (r.vencimento)             partes.push('Vencimento: ' + fmtD(r.vencimento));
            addGen(partes.join(' · '));
            var ds = res.despesa_sugerida || {};
            if (!ds.descricao && (r.empresa || r.descricao)) ds.descricao = r.empresa || r.descricao;
            if (!ds.valor && r.valor)           ds.valor     = r.valor;
            if (!ds.vencimento && r.vencimento) ds.vencimento = r.vencimento;
            // NÃO assume forma de pagamento — coleta do usuário
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
            // NÃO assume forma de pagamento — o boleto é o documento, não necessariamente a forma de pagar
            delete ds.forma_pagamento;
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
            addGen('🎙️ Ouvindo...');
        };
        rec.onresult = function (e) {
            var t = e.results[0][0].transcript;
            var inp = elInput();
            if (inp) { inp.value = t; autoResize(inp); }
        };
        rec.onend = function () {
            estado.gravandoVoz = false; estado.reconhecimento = null;
            document.getElementById('ia-btn-voice')?.classList.remove('gravando');
            document.getElementById('ai-btn-voice')?.classList.remove('gravando');
        };
        rec.onerror = function (e) {
            estado.gravandoVoz = false;
            document.getElementById('ia-btn-voice')?.classList.remove('gravando');
            document.getElementById('ai-btn-voice')?.classList.remove('gravando');
            if (e.error !== 'aborted') addGen('Erro de voz: ' + e.error);
        };
        rec.start();
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
        if (e.target.closest('[data-chip]')) { _chip(e.target.closest('[data-chip]')); return; }

        var action = e.target.closest('[data-action]');
        if (action) {
            var a = action.dataset.action;
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
        gen:    'Gen ativa — IA interna Fin-Gerence',
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
            if (sel.value === 'gen') salvarChaveAPI();
        });
        atualizarUI();
    }

    function salvarChaveAPI() {
        var provider = document.getElementById('ia-provider-select')?.value || 'gen';
        var input    = document.getElementById('ia-api-key-input');
        var chave    = input ? input.value.trim() : '';
        if (provider !== 'gen' && !chave) { alert('Informe a chave antes de salvar.'); return; }
        apiPost('/config/chave', { provider: provider, api_key: chave }).then(function (res) {
            if (res && res.success) {
                var msg = '✅ ' + (LABELS_PROVIDER[provider] || 'Configuração salva');
                alert(msg);
                if (input) input.value = '';
                // Atualiza badge de status
                var badge = document.getElementById('ia-badge-status');
                if (badge) { badge.textContent = LABELS_PROVIDER[provider] || provider; badge.className = 'badge ' + (provider === 'gen' ? 'gen' : 'ativo'); }
            } else {
                alert('Erro ao salvar: ' + (res?.message || 'tente novamente.'));
            }
        }).catch(function () { alert('Erro de conexão ao salvar a configuração.'); });
    }

    // ── INICIALIZAÇÃO ─────────────────────────────────────────────
    function _init() {
        estado.modoPagina = !!document.querySelector('.ia-container');

        // ── Painel flutuante (index.html) ────────────────────────
        if (!estado.modoPagina) {
            // FAB e controles do painel
            document.getElementById('btn-fab-ia')?.addEventListener('click', function () { abrir(); });
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
            document.getElementById('chip-upload')?.addEventListener('click', abrirUpload);
            document.getElementById('btn-abrir-boleto')?.addEventListener('click', abrirBoleto);
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
        }

        // ── Ambos os contextos ───────────────────────────────────
        var input = elInput();
        if (input) {
            input.addEventListener('keydown', handleKeyDown);
            input.addEventListener('input', function () { autoResize(this); });
        }

        // send btn — elSend() já resolve o botão certo em cada contexto
        var sendBtn = elSend();
        if (sendBtn) sendBtn.addEventListener('click', enviarMensagem);

        document.getElementById('ia-btn-voice')?.addEventListener('click', toggleVoz);
        document.getElementById('ai-btn-voice')?.addEventListener('click', toggleVoz);
    }

    // Garante inicialização mesmo se DOMContentLoaded já disparou
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    return {
        abrir, fechar, limpar: limparConversa, enviar: enviarMensagem,
        enviarAcaoRapida, preencherInput, handleKeyDown, autoResize, toggleSidebar,
        confirmarDespesa, editarDespesa, cancelarDespesa,
        confirmarReceita, editarReceita, cancelarReceita,
        selecionarArquivo: processarArquivo, cancelarArquivo,
        abrirBoleto, fecharBoleto, processarBoleto, abrirUpload,
        toggleVoz, confirmarAprendizado, detectarRecorrencias,
        salvarChaveAPI
    };
}());

function abrirModalInstrucoesGen() {
    var modal = document.getElementById('modal-instrucoes-gen');
    var input = document.getElementById('instrucoes-gen-input');
    if (!modal) return;
    if (input) input.value = '';
    modal.style.display = 'flex';
}

function fecharModalInstrucoesGen() {
    var modal = document.getElementById('modal-instrucoes-gen');
    if (modal) modal.style.display = 'none';
}

function salvarInstrucoesGen() {
    var input = document.getElementById('instrucoes-gen-input');
    var conteudo = input ? input.value.trim() : '';
    if (!conteudo) { alert('Escreva uma instrução antes de salvar.'); return; }
    fetch('/api/ai/instrucoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
        body: JSON.stringify({ conteudo: conteudo })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.success) {
            fecharModalInstrucoesGen();
        } else {
            alert('Erro ao salvar: ' + (res.erro || 'tente novamente'));
        }
    }).catch(function () { alert('Erro de conexão ao salvar instruções.'); });
}
