// ================================================================
// FIN GERENCE AI — Assistente integrado (painel flutuante)
// Exposto como window.IAChat
// ================================================================

window.IAChat = (function () {

    var estado = {
        enviando: false,
        gravandoVoz: false,
        reconhecimento: null,
        despesaPendente: null,
        arquivoPendente: null,
        contexto: null
    };

    function apiURL() {
        if (typeof CONFIG !== 'undefined' && CONFIG.API_URL) return CONFIG.API_URL;
        if (typeof window.API_BASE_URL !== 'undefined') return window.API_BASE_URL;
        return 'http://localhost:3010';
    }

    function getToken() {
        return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    }

    function hdrs() {
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
    }

    function apiPost(path, body) {
        return fetch(apiURL() + '/api/ai' + path, {
            method: 'POST', headers: hdrs(), body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    function apiForm(path, form) {
        return fetch(apiURL() + '/api/ai' + path, {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: form
        }).then(function (r) { return r.json(); });
    }

    function apiGet(path) {
        return fetch(apiURL() + '/api/ai' + path, { headers: hdrs() })
            .then(function (r) { return r.json(); });
    }

    // ── PAINEL ────────────────────────────────────────────────────
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
        setTimeout(function () {
            var inp = document.getElementById('ai-input');
            if (inp) inp.focus();
        }, 100);
    }

    function fechar() {
        var panel = document.getElementById('ai-chat-panel');
        if (panel) panel.style.display = 'none';
    }

    function limpar() {
        var msgs = document.getElementById('ai-messages');
        if (msgs) msgs.innerHTML = '';
        estado.despesaPendente = null;
        cancelarArquivo();
        fecharBoleto();
        boasVindas(estado.contexto);
        apiPost('/chat', { mensagem: '_reset_', limpar_sessao: true }).catch(function () { });
    }

    function inicializar() {
        apiGet('/status').then(function (st) {
            var el = document.getElementById('ai-panel-status');
            if (el) {
                el.textContent = (st && st.openai && st.openai.ativo)
                    ? 'IA ativa (' + st.openai.modelo + ')'
                    : 'modo heurístico';
            }
            var badge = document.getElementById('ia-badge-status');
            if (badge) {
                if (st && st.openai && st.openai.ativo) {
                    badge.textContent = 'OpenAI ativa — ' + st.openai.modelo;
                    badge.className = 'badge ativo';
                } else {
                    badge.textContent = 'Modo heurístico — configure OPENAI_API_KEY no .env';
                    badge.className = 'badge heurist';
                }
            }
        }).catch(function () {
            var el = document.getElementById('ai-panel-status');
            if (el) el.textContent = 'offline';
        });
    }

    function boasVindas(ctx) {
        var chips = '';
        if (ctx === 'despesa') {
            chips = '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">paguei 120 de internet no cartão vence dia 15</button>' +
                    '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">200 mercado pix hoje</button>' +
                    '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">netflix 55,90 débito</button>';
            addAI('Descreva a despesa em texto livre e eu preencho o formulário para você.<div class="ai-welcome-chips">' + chips + '</div>');
        } else if (ctx === 'receita') {
            chips = '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">recebi salário 3500 hoje</button>' +
                    '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">freelance 800 pix</button>';
            addAI('Descreva a receita e eu preencho o formulário.<div class="ai-welcome-chips">' + chips + '</div>');
        } else {
            chips = '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">paguei 150 de mercado no pix</button>' +
                    '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">quanto gastei esse mês?</button>' +
                    '<button class="ai-welcome-chip" onclick="IAChat._chip(this)">qual meu saldo?</button>';
            addAI('Olá! Sou o assistente financeiro. Posso cadastrar despesas, analisar gastos e ler documentos.<div class="ai-welcome-chips">' + chips + '</div>');
        }
    }

    function _chip(btn) {
        var input = document.getElementById('ai-input');
        if (input) { input.value = btn.textContent.trim(); resize(input); input.focus(); }
    }

    // ── ENVIO ─────────────────────────────────────────────────────
    function enviar() {
        if (estado.arquivoPendente) { _enviarArquivo(); return; }
        var input = document.getElementById('ai-input');
        var texto = input ? input.value.trim() : '';
        if (!texto || estado.enviando) return;

        input.value = '';
        resize(input);
        estado.enviando = true;
        setBtnDisabled(true);
        addUser(texto);
        var tid = addTyping();

        apiPost('/chat', { mensagem: texto }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addAI('Desculpe, ocorreu um erro. Tente novamente.'); return; }
            if (res.acao === 'confirmar_despesa' && res.despesa) {
                estado.despesaPendente = res.despesa;
                addComDespesa(res.resposta, res.despesa);
            } else {
                addAI(res.resposta || '...');
            }
        }).catch(function () {
            removeTyping(tid);
            addAI('Erro de conexão. Verifique se o servidor está rodando.');
        }).finally(function () {
            estado.enviando = false;
            setBtnDisabled(false);
        });
    }

    function keydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    }

    function resize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 80) + 'px';
    }

    // ── MENSAGENS ─────────────────────────────────────────────────
    function addUser(texto) {
        _ins('<div class="ai-msg ai-msg--user">' +
            '<div class="ai-msg-av"><i class="fas fa-user"></i></div>' +
            '<div class="ai-msg-bub">' + esc(texto) + '</div></div>');
    }

    function addAI(html) {
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
            '<button class="ai-msg-btn-ok" onclick="IAChat.confirmarDespesa()"><i class="fas fa-check"></i> Confirmar</button>' +
            '<button class="ai-msg-btn-edit" onclick="IAChat.editarDespesa()"><i class="fas fa-edit"></i> Editar</button>' +
            '<button class="ai-msg-btn-no" onclick="IAChat.cancelarDespesa()"><i class="fas fa-times"></i> Cancelar</button>' +
            '</div></div></div>');
    }

    function addTyping() {
        var id = 'ai-typ-' + Date.now();
        _ins('<div class="ai-msg ai-msg--ai" id="' + id + '">' +
            '<div class="ai-msg-av"><i class="fas fa-robot"></i></div>' +
            '<div class="ai-msg-bub"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>');
        return id;
    }

    function removeTyping(id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    }

    function _ins(html) {
        var msgs = document.getElementById('ai-messages');
        if (!msgs) return;
        msgs.insertAdjacentHTML('beforeend', html);
        msgs.scrollTop = msgs.scrollHeight;
    }

    // ── CONFIRMAR / EDITAR DESPESA ────────────────────────────────
    function confirmarDespesa() {
        var d = estado.despesaPendente;
        if (!d) return;
        if (_preencherCard(d)) {
            addSys('Despesa preenchida no formulário!');
            fechar();
        } else {
            if (typeof abrirModalLancamentoDespesas === 'function') abrirModalLancamentoDespesas();
            setTimeout(function () {
                if (_preencherCard(d)) { addSys('Formulário preenchido!'); fechar(); }
                else { addSys('Abra o modal "Lançar Despesas" e tente novamente.'); }
            }, 500);
        }
        estado.despesaPendente = null;
    }

    function editarDespesa() {
        var d = estado.despesaPendente;
        if (!d) return;
        if (typeof abrirModalLancamentoDespesas === 'function') abrirModalLancamentoDespesas();
        setTimeout(function () { _preencherCard(d); }, 500);
        addSys('Formulário aberto para edição.');
        estado.despesaPendente = null;
        fechar();
    }

    function cancelarDespesa() {
        estado.despesaPendente = null;
        addSys('Operação cancelada.');
    }

    function _preencherCard(d) {
        var card = document.querySelector('.despesa-card-item, .despesa-card, [data-despesa-card]');
        if (!card) return false;
        _sv(card, 'input[placeholder*="escri"], input[placeholder*="Descri"]', d.descricao);
        _sv(card, 'input[type="number"]', d.valor);
        var sel = card.querySelector('select');
        if (sel && d.forma_pagamento) sel.value = d.forma_pagamento;
        if (d.vencimento) _sv(card, 'input[type="date"]', d.vencimento);
        if (d.parcelas > 1) _sv(card, 'input[id*="parcela"], input[name*="parcela"]', d.parcelas);
        return true;
    }

    function _sv(parent, selector, val) {
        if (val === null || val === undefined) return;
        var el = parent.querySelector(selector);
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // ── ARQUIVO ───────────────────────────────────────────────────
    function selecionarArquivo(input) {
        var file = input.files[0];
        if (!file) return;
        estado.arquivoPendente = file;
        var prev = document.getElementById('ai-file-preview');
        var nome = document.getElementById('ai-file-nome');
        if (prev) prev.style.display = 'flex';
        if (nome) nome.textContent = file.name;
        addSys('"' + file.name + '" selecionado. Clique em enviar para processar.');
    }

    function cancelarArquivo() {
        estado.arquivoPendente = null;
        var prev = document.getElementById('ai-file-preview');
        if (prev) prev.style.display = 'none';
        var fi = document.getElementById('ai-file-input');
        if (fi) fi.value = '';
    }

    function _enviarArquivo() {
        var file = estado.arquivoPendente;
        cancelarArquivo();
        estado.enviando = true;
        setBtnDisabled(true);
        addUser('📄 ' + file.name);
        var tid = addTyping();
        var form = new FormData();
        form.append('arquivo', file);

        apiForm('/arquivo', form).then(function (res) {
            removeTyping(tid);
            if (!res || !res.success) { addAI('Não consegui processar: ' + (res && res.message ? res.message : 'erro')); return; }
            var r = res.resultado || {};
            var html = '✅ Documento processado!<br>';
            if (r.tipo) html += '📋 ' + fmtTipo(r.tipo) + '<br>';
            if (r.empresa || r.descricao) html += '🏢 ' + esc(r.empresa || r.descricao) + '<br>';
            if (r.valor) html += '💰 Valor: <strong>' + fmtV(r.valor) + '</strong><br>';
            if (r.vencimento) html += '📅 Vencimento: ' + fmtD(r.vencimento) + '<br>';
            var ds = res.despesa_sugerida;
            if (ds && ds.valor) {
                estado.despesaPendente = ds;
                addComDespesa(html + '<br>Cadastrar esta despesa?', ds);
            } else {
                addAI(html + '<br>Não identifiquei o valor. Informe manualmente.');
            }
        }).catch(function () {
            removeTyping(tid); addAI('Erro ao processar arquivo.');
        }).finally(function () {
            estado.enviando = false; setBtnDisabled(false);
        });
    }

    // ── BOLETO ────────────────────────────────────────────────────
    function abrirBoleto() {
        var bar = document.getElementById('ai-boleto-bar');
        if (!bar) return;
        bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
        if (bar.style.display === 'flex') {
            var inp = document.getElementById('ai-boleto-input');
            if (inp) inp.focus();
        }
    }

    function fecharBoleto() {
        var bar = document.getElementById('ai-boleto-bar');
        if (bar) bar.style.display = 'none';
        var inp = document.getElementById('ai-boleto-input');
        if (inp) inp.value = '';
    }

    function processarBoleto() {
        var campo = document.getElementById('ai-boleto-input');
        if (!campo || !campo.value.trim()) { addSys('Informe a linha digitável.'); return; }
        var val = campo.value.trim();
        fecharBoleto();
        addUser('🏦 Processando boleto...');
        var tid = addTyping();

        apiPost('/boleto', { linha_digitavel: val }).then(function (res) {
            removeTyping(tid);
            if (!res || !res.sucesso) { addAI('Não interpretei o boleto: ' + (res && res.erro ? res.erro : 'formato inválido')); return; }
            var valor = res.valor ? fmtV(res.valor) : 'não identificado';
            var venc  = res.vencimento ? fmtD(res.vencimento) : 'não identificado';
            var html  = '✅ Boleto lido!<br>🏦 Banco: <strong>' + esc(res.banco_nome || '?') + '</strong><br>💰 Valor: <strong>' + valor + '</strong><br>📅 Vencimento: ' + venc + '<br><br>Cadastrar esta despesa?';
            if (res.despesa && res.despesa.valor) {
                estado.despesaPendente = res.despesa;
                addComDespesa(html, res.despesa);
            } else {
                addAI(html);
            }
        }).catch(function () { removeTyping(tid); addAI('Erro ao processar boleto.'); });
    }

    // ── VOZ ───────────────────────────────────────────────────────
    function toggleVoz() {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            addSys('Seu navegador não suporta reconhecimento de voz.'); return;
        }
        if (estado.gravandoVoz) {
            if (estado.reconhecimento) estado.reconhecimento.stop();
        } else {
            _iniciarVoz();
        }
    }

    function _iniciarVoz() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var rec = new SR();
        rec.lang = 'pt-BR'; rec.continuous = false; rec.interimResults = false;
        rec.onstart = function () {
            estado.gravandoVoz = true; estado.reconhecimento = rec;
            var b = document.getElementById('ai-btn-voice'); if (b) b.classList.add('gravando');
            addSys('🎙️ Ouvindo...');
        };
        rec.onresult = function (e) {
            var t = e.results[0][0].transcript;
            var inp = document.getElementById('ai-input');
            if (inp) { inp.value = t; resize(inp); }
        };
        rec.onend = function () {
            estado.gravandoVoz = false; estado.reconhecimento = null;
            var b = document.getElementById('ai-btn-voice'); if (b) b.classList.remove('gravando');
        };
        rec.onerror = function (e) {
            estado.gravandoVoz = false;
            var b = document.getElementById('ai-btn-voice'); if (b) b.classList.remove('gravando');
            if (e.error !== 'aborted') addSys('Erro de voz: ' + e.error);
        };
        rec.start();
    }

    // ── CONFIG ────────────────────────────────────────────────────
    function salvarChaveAPI() {
        var el = document.getElementById('ia-openai-key-input');
        if (!el || !el.value.trim()) return;
        alert('Para ativar a IA com OpenAI:\n1. Abra backend/.env\n2. Adicione: OPENAI_API_KEY=' + el.value.trim() + '\n3. Reinicie: npm run dev');
    }

    // ── UTILITÁRIOS ───────────────────────────────────────────────
    function setBtnDisabled(v) {
        var b = document.querySelector('#ai-chat-panel .ai-send-btn');
        if (b) b.disabled = v;
    }

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function fmt(s) {
        return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }

    function fmtV(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }

    function fmtF(f) {
        var m = { cartao_credito: 'Cartão Crédito', cartao_debito: 'Cartão Débito', pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', boleto: 'Boleto' };
        return m[f] || f || 'Dinheiro';
    }

    function fmtD(d) {
        if (!d) return '';
        var p = d.split('-');
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function fmtTipo(t) {
        var m = { boleto: 'Boleto', nota_fiscal: 'Nota Fiscal', comprovante: 'Comprovante PIX', recibo: 'Recibo', documento: 'Documento' };
        return m[t] || t;
    }

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(inicializar, 1500);
    });

    return {
        abrir: abrir,
        fechar: fechar,
        limpar: limpar,
        enviar: enviar,
        keydown: keydown,
        resize: resize,
        confirmarDespesa: confirmarDespesa,
        editarDespesa: editarDespesa,
        cancelarDespesa: cancelarDespesa,
        selecionarArquivo: selecionarArquivo,
        cancelarArquivo: cancelarArquivo,
        abrirBoleto: abrirBoleto,
        fecharBoleto: fecharBoleto,
        processarBoleto: processarBoleto,
        toggleVoz: toggleVoz,
        salvarChaveAPI: salvarChaveAPI,
        _chip: _chip
    };
}());
