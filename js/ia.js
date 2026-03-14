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
        window.location.replace('home.html');
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
        modoPagina: false // true quando em ia.html
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
    function apiURL() {
        return window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    }

    function getToken() {
        return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    }

    function hdrs() {
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
    }

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
        var input = elInput();
        var texto = input ? input.value.trim() : '';
        if (!texto || estado.enviando) return;

        input.value = '';
        autoResize(input);
        estado.enviando = true;
        setBtnDisabled(true);
        addUser(texto);
        // Mensagem de espera aleatória para o chat parecer mais humano
        var frases = [
            'Deixa eu processar isso para você...',
            'Entendido! Preparando tudo, aguarde...',
            'Analisando sua mensagem...',
            'Um instante, estou organizando os dados...'
        ];
        addSys('⏳ ' + frases[Math.floor(Math.random() * frases.length)]);
        var tid = addTyping();

        apiPost('/chat', { mensagem: texto }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addGen('Desculpe, ocorreu um erro. Tente novamente.'); return; }

            if (res.acao === 'confirmar_despesa' && res.despesa) {
                estado.despesaPendente = res.despesa;
                addComDespesa(res.resposta, res.despesa);
            } else if (res.acao === 'confirmar_receita' && res.receita) {
                estado.receitaPendente = res.receita;
                addComReceita(res.resposta, res.receita);
            } else {
                addGen(res.resposta || '...');
            }
        }).catch(function () {
            removeTyping(tid);
            addSys('⏳ Servidor iniciando, pode levar alguns segundos. Clique em enviar para tentar de novo.');
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
            '<div class="ai-msg-av"><i class="fas fa-user"></i></div>' +
            '<div class="ai-msg-bub">' + esc(texto) + '</div></div>');
    }

    function addGen(html) {
        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-av"><i class="fas fa-robot"></i></div>' +
            '<div class="ai-msg-bub">' + html + '</div></div>');
    }

    function addSys(texto) {
        _ins('<div class="ai-msg ai-msg--sys"><div class="ai-msg-bub">' + esc(texto) + '</div></div>');
    }

    function addComDespesa(texto, d) {
        var v = fmtV(d.valor);
        var f = fmtF(d.forma_pagamento);
        var parc = d.parcelas > 1
            ? '<div class="ai-dc-row"><span class="ai-dc-label">Parcelas</span><span class="ai-dc-val">' + d.parcelas + 'x</span></div>'
            : '';
        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-av"><i class="fas fa-robot"></i></div>' +
            '<div class="ai-msg-bub">' + fmt(texto) +
            '<div class="ai-despesa-card">' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Descrição</span><span class="ai-dc-val">' + esc(d.descricao) + '</span></div>' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Valor</span><span class="ai-dc-valor">' + v + '</span></div>' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Categoria</span><span class="ai-dc-val">' + esc(d.categoria || 'Outros') + '</span></div>' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Pagamento</span><span class="ai-dc-val">' + f + '</span></div>' +
            parc + '</div>' +
            '<div class="ai-msg-btns">' +
            '<button class="ai-msg-btn-ok" data-action="confirmar-despesa"><i class="fas fa-check"></i> Confirmar</button>' +
            '<button class="ai-msg-btn-edit" data-action="editar-despesa"><i class="fas fa-edit"></i> Editar</button>' +
            '<button class="ai-msg-btn-no" data-action="cancelar-despesa"><i class="fas fa-times"></i> Cancelar</button>' +
            '</div></div></div>');
    }

    function addComReceita(texto, r) {
        _ins('<div class="ai-msg ai-msg--ai">' +
            '<div class="ai-msg-av"><i class="fas fa-robot"></i></div>' +
            '<div class="ai-msg-bub">' + fmt(texto) +
            '<div class="ai-despesa-card">' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Descrição</span><span class="ai-dc-val">' + esc(r.descricao) + '</span></div>' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Valor</span><span class="ai-dc-valor">' + fmtV(r.valor) + '</span></div>' +
            '<div class="ai-dc-row"><span class="ai-dc-label">Data</span><span class="ai-dc-val">' + fmtD(r.data) + '</span></div>' +
            '</div>' +
            '<div class="ai-msg-btns">' +
            '<button class="ai-msg-btn-ok" data-action="confirmar-receita"><i class="fas fa-check"></i> Confirmar</button>' +
            '<button class="ai-msg-btn-edit" data-action="editar-receita"><i class="fas fa-edit"></i> Editar</button>' +
            '<button class="ai-msg-btn-no" data-action="cancelar-receita"><i class="fas fa-times"></i> Cancelar</button>' +
            '</div></div></div>');
    }

    function addTyping() {
        var id = 'ai-typ-' + Date.now();
        _ins('<div class="ai-msg ai-msg--ai" id="' + id + '">' +
            '<div class="ai-msg-av"><i class="fas fa-robot"></i></div>' +
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
            // Página ia.html: preenche o modal interno
            _preencherModalDespesa(d);
            _abrirModal('modal-confirmar-despesa');
            return;
        }

        // Painel flutuante: salva diretamente via API (sem abrir modal)
        var hoje = new Date().toISOString().split('T')[0];
        var payload = {
            descricao:       d.descricao,
            valor:           d.valor,
            forma_pagamento: d.forma_pagamento || 'dinheiro',
            data:            d.data || hoje,
            vencimento:      d.vencimento || null,
            parcelas:        d.parcelas   || 1,
            ja_pago:         !!d.ja_pago,
            recorrente:      !!d.recorrente
        };
        if (d.categoria_id) payload.categoria_id = d.categoria_id;
        if (d.cartao_id)    payload.cartao_id    = d.cartao_id;

        addSys('⏳ Cadastrando sua despesa, aguarde um momento...');
        apiPost('/despesa/salvar', payload).then(function (res) {
            if (res && res.success) {
                addSys('✅ Despesa "' + d.descricao + '" cadastrada com sucesso!');
                // Atualiza a tela de detalhes do mês se estiver aberta
                if (typeof window.renderizarDetalhesDoMes === 'function') {
                    window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                }
                if (typeof window.carregarDadosDashboard === 'function') {
                    window.carregarDadosDashboard(window.anoAberto);
                }
            } else {
                addGen('Erro ao cadastrar: ' + (res?.message || 'tente novamente.'));
            }
        }).catch(function () {
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
                    addSys('Formulário preenchido! Edite o que precisar e clique em Salvar.');
                } else {
                    addSys('Modal aberto. Preencha os dados e salve.');
                }
                fechar();
            }, 400);
        } else {
            addSys('Abra o modal "Lançar Despesas" para editar.');
            fechar();
        }
        estado.despesaPendente = null;
    }

    function cancelarDespesa() {
        estado.despesaPendente = null;
        addSys('Operação cancelada.');
    }

    // ── CONFIRMAR RECEITA ─────────────────────────────────────────
    function confirmarReceita() {
        var r = estado.receitaPendente;
        if (!r) return;

        // Tanto modoPagina quanto painel flutuante: salva diretamente via API
        addSys('⏳ Registrando sua receita, aguarde um momento...');
        apiPost('/receita/salvar', { descricao: r.descricao, valor: r.valor, data: r.data })
            .then(function (res) {
                if (res && res.success) {
                    addSys('✅ Receita "' + r.descricao + '" cadastrada!');
                    if (typeof window.renderizarDetalhesDoMes === 'function') {
                        window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                    }
                    if (typeof window.carregarDadosDashboard === 'function') {
                        window.carregarDadosDashboard(window.anoAberto);
                    }
                } else {
                    addGen('Erro ao salvar: ' + (res?.message || 'tente novamente.'));
                }
            }).catch(function () { addGen('Erro de conexão ao salvar receita.'); });
        estado.receitaPendente = null;
    }

    function editarReceita() {
        var r = estado.receitaPendente;
        if (!r) return;
        // Editar = abre o modal preenchido para o usuário ajustar
        if (typeof window.abrirModalNovaReceita === 'function') {
            window.abrirModalNovaReceita();
            setTimeout(function () {
                _preencherFormReceita(r);
                addSys('Formulário preenchido! Edite o que precisar e clique em Salvar.');
                fechar();
            }, 400);
        } else {
            addSys('Abra o modal "Nova Receita" para editar.');
            fechar();
        }
        estado.receitaPendente = null;
    }

    function cancelarReceita() {
        estado.receitaPendente = null;
        addSys('Operação cancelada.');
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
                    else addSys('Selecione o cartão de crédito manualmente.');
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
        var descricao  = document.getElementById('ia-campo-descricao')?.value.trim();
        var valor      = parseFloat(document.getElementById('ia-campo-valor')?.value);
        var forma      = document.getElementById('ia-campo-forma-pagamento')?.value;
        var data       = document.getElementById('ia-campo-data')?.value;
        var vencimento = document.getElementById('ia-campo-vencimento')?.value || null;
        var parcelas   = parseInt(document.getElementById('ia-campo-parcelas')?.value) || 1;
        var catId      = document.getElementById('ia-campo-categoria')?.value || null;
        var cartaoId   = document.getElementById('ia-campo-cartao')?.value || null;

        if (!descricao || !valor || !forma || !data) { addSys('Preencha todos os campos obrigatórios.'); return; }

        var payload = { descricao, valor, forma_pagamento: forma, data, vencimento, parcelas };
        if (catId)    payload.categoria_id = parseInt(catId);
        if (cartaoId) payload.cartao_id    = parseInt(cartaoId);

        addSys('⏳ Cadastrando sua despesa, aguarde um momento...');
        apiPost('/despesa/salvar', payload).then(function (res) {
            _fecharModal('modal-confirmar-despesa');
            if (res && res.success) addSys('✅ Despesa "' + descricao + '" cadastrada!');
            else addGen('Erro ao salvar: ' + (res?.message || 'tente novamente.'));
        }).catch(function () {
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
            if (res && res.success) addSys('✅ Gen vai lembrar: "' + texto + '" → ' + categoria);
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
        addSys('"' + file.name + '" selecionado. Clique em enviar para processar.');
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
        addGen('📄 Analisando seu documento... isso pode levar alguns segundos, estou preparando tudo para você!');
        var tid = addTyping();
        var form = new FormData();
        form.append('arquivo', file);

        apiForm('/arquivo', form).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addGen('Não consegui processar: ' + (res?.message || 'erro')); return; }
            var r = res.resultado || {};
            var html = '✅ Documento processado!<br>';
            if (r.tipo) html += '📋 ' + fmtTipo(r.tipo) + '<br>';
            if (r.empresa || r.descricao) html += '🏢 ' + esc(r.empresa || r.descricao) + '<br>';
            if (r.valor) html += '💰 Valor: <strong>' + fmtV(r.valor) + '</strong><br>';
            if (r.vencimento) html += '📅 Vencimento: ' + fmtD(r.vencimento) + '<br>';
            var ds = res.despesa_sugerida;
            if (ds && ds.valor) { estado.despesaPendente = ds; addComDespesa(html + '<br>Cadastrar esta despesa?', ds); }
            else addGen(html + '<br>Não identifiquei o valor. Informe manualmente.');
        }).catch(function () {
            removeTyping(tid); addGen('Erro ao processar arquivo.');
        }).finally(function () { estado.enviando = false; setBtnDisabled(false); });
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
        if (!campo || !campo.value.trim()) { addSys('Informe a linha digitável.'); return; }
        var val = campo.value.trim();
        fecharBoleto();
        addUser('🏦 Linha digitável enviada');
        addGen('🔍 Decodificando o boleto... aguarde um instante, vou buscar todos os detalhes para você!');
        var tid = addTyping();

        apiPost('/boleto', { linha_digitavel: val }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.sucesso) { addGen('Não interpretei o boleto: ' + (res?.erro || 'formato inválido')); return; }
            var valor = res.valor ? fmtV(res.valor) : 'não identificado';
            var venc  = res.vencimento ? fmtD(res.vencimento) : 'não identificado';
            var html  = '✅ Boleto lido!<br>🏦 Banco: <strong>' + esc(res.banco_nome || '?') + '</strong><br>💰 Valor: <strong>' + valor + '</strong><br>📅 Vencimento: ' + venc + '<br><br>Cadastrar esta despesa?';
            if (res.despesa?.valor) { estado.despesaPendente = res.despesa; addComDespesa(html, res.despesa); }
            else addGen(html);
        }).catch(function () { removeTyping(tid); addGen('Erro ao processar boleto.'); });
    }

    // ── VOZ ───────────────────────────────────────────────────────
    function toggleVoz() {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            addSys('Seu navegador não suporta reconhecimento de voz.'); return;
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
            addSys('🎙️ Ouvindo...');
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
            if (e.error !== 'aborted') addSys('Erro de voz: ' + e.error);
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
        sel.addEventListener('change', atualizarUI);
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
    document.addEventListener('DOMContentLoaded', function () {
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

            // Botões de contexto nos modais
            document.getElementById('btn-ia-detalhes-mes')?.addEventListener('click', function () { abrir(); });
            document.getElementById('btn-ia-lancamento')?.addEventListener('click', function () { abrir('despesa'); });
            document.getElementById('btn-ia-nova-receita')?.addEventListener('click', function () { abrir('receita'); });

            // Config — provedor e chave
            setupProviderSelect();
            document.getElementById('ia-btn-salvar-chave')?.addEventListener('click', salvarChaveAPI);

            setTimeout(inicializar, 1500);
        }

        // ── Página completa (ia.html) ────────────────────────────
        if (estado.modoPagina) {
            document.getElementById('btn-voltar-sistema')?.addEventListener('click', function () { window.location.href = 'index.html'; });
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
    });

    return {
        abrir, fechar, limpar: limparConversa, enviar: enviarMensagem,
        enviarAcaoRapida, preencherInput, handleKeyDown, autoResize, toggleSidebar,
        confirmarDespesa, editarDespesa, cancelarDespesa,
        confirmarReceita, editarReceita, cancelarReceita,
        selecionarArquivo: processarArquivo, cancelarArquivo,
        abrirBoleto, fecharBoleto, processarBoleto, abrirUpload,
        toggleVoz, confirmarAprendizado, detectarRecorrencias,
        salvarChaveAPI, _chip
    };
}());
