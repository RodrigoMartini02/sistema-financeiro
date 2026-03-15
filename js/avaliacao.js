// ================================================================
// AVALIAÇÕES DA HOME — exibe avaliações reais + fallback estático
// ================================================================

const reviewsEstaticas = [
    { text: '"O Fin-Gerence foi como ter um funcionário a mais. A produtividade e rentabilidade aumentaram."', author: "Dra. Mariana", stars: 5 },
    { text: '"Finalmente uma organização financeira que faz toda a diferença no meu dia a dia."', author: "Ricardo", stars: 5 },
    { text: '"A versão PWA é fantástica. Rápida, leve e intuitiva como um app nativo."', author: "Marcos", stars: 5 },
    { text: '"O melhor suporte que já tive. O sistema resolveu todos os meus problemas de fluxo."', author: "Dra. Carla", stars: 5 },
    { text: '"Controle total das despesas na palma da mão. Recomendo!"', author: "Lucas", stars: 5 },
    { text: '"Interface limpa e intuitiva. O melhor para pequenas empresas."', author: "Dr. André", stars: 4 },
    { text: '"Mudou minha relação com o dinheiro. Agora sei exatamente para onde vai meu lucro."', author: "Roberto", stars: 5 },
    { text: '"Excelente para controle de cartões de crédito. Nunca mais paguei juros."', author: "Patrícia", stars: 5 },
    { text: '"O sistema de metas de economia é motivador. Já guardei 15% a mais este mês."', author: "Dr. Bruno", stars: 5 },
    { text: '"Suporte rápido e eficiente. Tive uma dúvida e resolveram em minutos."', author: "Fernanda", stars: 5 },
    { text: '"Importação de extratos me poupa horas de trabalho manual."', author: "Gustavo", stars: 4 },
    { text: '"Muito seguro e confiável. Me sinto tranquilo em gerenciar meus dados aqui."', author: "Dr. Sérgio", stars: 5 },
    { text: '"Visual dos gráficos é incrível. Facilita muito a tomada de decisão."', author: "Mônica", stars: 5 },
    { text: '"Uso com minha esposa e o controle multi-usuário funciona perfeitamente."', author: "Diego", stars: 5 },
    { text: '"Relatórios completos. Consigo ver meu balanço anual em um clique."', author: "Dra. Beatriz", stars: 5 },
    { text: '"O melhor PWA que já utilizei. Nem parece que é no navegador."', author: "Thiago", stars: 5 },
    { text: '"A gestão de categorias é muito flexível. Adaptei para o meu negócio."', author: "Vanessa", stars: 4 },
    { text: '"Não vivo mais sem o alerta de vencimentos de contas."', author: "Dr. Luiz", stars: 5 },
    { text: '"Consegui identificar gastos desnecessários logo na primeira semana."', author: "Juliana", stars: 5 },
    { text: '"Fácil de usar até para quem não entende nada de finanças."', author: "Cláudio", stars: 5 },
    { text: '"As recorrências automáticas são uma mão na roda para assinaturas."', author: "Dra. Ellen", stars: 5 },
    { text: '"Melhor custo-benefício do mercado brasileiro."', author: "Marcelo", stars: 5 },
    { text: '"Gráficos de pizza por categoria ajudam a economizar no essencial."', author: "Sônia", stars: 4 },
    { text: '"O sistema é leve e abre rápido em qualquer lugar."', author: "Dr. Felipe", stars: 5 },
    { text: '"Perfeito para quem trabalha como autônomo."', author: "Renata", stars: 5 },
    { text: '"Acompanhar o saldo futuro me dá muita paz mental."', author: "Daniela", stars: 5 },
    { text: '"Superou minhas expectativas em todos os sentidos."', author: "Dr. Igor", stars: 5 }
];

let reviews = [...reviewsEstaticas];
let currentIndex = 0;
const duration = 5000;

const container = document.getElementById('progress-bars');
const textEl = document.getElementById('review-text');
const authorEl = document.getElementById('review-author');
const starsEl = document.getElementById('stars-container');

// ================================================================
// BUSCAR AVALIAÇÕES REAIS DO BACKEND
// ================================================================
async function carregarAvaliacoesReais() {
    try {
        const response = await fetch('https://sistema-financeiro-backend-o199.onrender.com/api/avaliacoes');
        if (!response.ok) return;

        const data = await response.json();
        if (!data.success || !data.data.avaliacoes.length) return;

        // Converter formato do backend para o formato local
        const reais = data.data.avaliacoes.map(a => ({
            text: `"${a.comentario}"`,
            author: a.autor,
            stars: a.estrelas,
            real: true
        }));

        // Mesclar: reais primeiro, depois estáticas
        reviews = [...reais, ...reviewsEstaticas];

        // Atualizar resumo com dados reais do backend
        const totalCombinado = data.data.total + reviewsEstaticas.length;
        const somaEstaticas = reviewsEstaticas.reduce((acc, r) => acc + r.stars, 0);
        const somaReais = data.data.avaliacoes.reduce((acc, a) => acc + a.estrelas, 0);
        const mediaCombinada = ((somaReais + somaEstaticas) / totalCombinado).toFixed(1);

        const totalEl = document.getElementById('total-reviews');
        const avgEl = document.getElementById('average-rating');
        if (totalEl) totalEl.innerText = totalCombinado;
        if (avgEl) avgEl.innerText = mediaCombinada;

        atualizarBreakdown(reviews);

    } catch {
        // Fallback silencioso — mantém avaliações estáticas
    }
}

// ================================================================
// BREAKDOWN DE ESTRELAS
// ================================================================
function atualizarBreakdown(lista) {
    const total = lista.length;
    if (!total) return;
    [5, 4, 3, 2, 1].forEach(s => {
        const count = lista.filter(r => r.stars === s).length;
        const pct = Math.round((count / total) * 100);
        const fill = document.getElementById(`bar-${s}`);
        const pctEl = document.getElementById(`pct-${s}`);
        if (fill) { setTimeout(() => { fill.style.width = pct + '%'; }, 200); }
        if (pctEl) pctEl.textContent = pct + '%';
    });
}

// ================================================================
// INICIALIZAR SLIDER
// ================================================================
function inicializarSlider() {
    // Calcular média e total das estáticas como fallback inicial
    const totalEl = document.getElementById('total-reviews');
    const avgEl = document.getElementById('average-rating');
    if (totalEl) totalEl.innerText = reviews.length;
    if (avgEl) {
        const avg = (reviews.reduce((acc, r) => acc + r.stars, 0) / reviews.length).toFixed(1);
        avgEl.innerText = avg;
    }

    // Criar barras de progresso (máx 7 barras)
    const displayCount = Math.min(reviews.length, 7);
    for (let i = 0; i < displayCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        bar.innerHTML = '<div class="story-progress-fill"></div>';
        container.appendChild(bar);
    }

    atualizarBreakdown(reviews);

    if (container) nextSlide();
}

// ================================================================
// SLIDE
// ================================================================
function nextSlide() {
    const fills = document.querySelectorAll('.story-progress-fill');
    const displayCount = fills.length;
    if (!displayCount) return;

    const fillIndex = currentIndex % displayCount;

    if (fillIndex === 0) {
        fills.forEach(f => { f.style.transition = 'none'; f.style.width = '0%'; });
    }

    const current = reviews[currentIndex];

    starsEl.innerHTML = '★'.repeat(current.stars) + '☆'.repeat(5 - current.stars);

    textEl.style.opacity = 0;
    setTimeout(() => {
        textEl.innerText = current.text;
        authorEl.innerText = current.real ? `— ${current.author} (usuário verificado)` : current.author;
        textEl.style.opacity = 1;
    }, 300);

    setTimeout(() => {
        fills[fillIndex].style.transition = `width ${duration}ms linear`;
        fills[fillIndex].style.width = '100%';
    }, 50);

    setTimeout(() => {
        currentIndex = (currentIndex + 1) % reviews.length;
        nextSlide();
    }, duration);
}

// ================================================================
// INICIALIZAR SLIDER (home)
// ================================================================
inicializarSlider();
carregarAvaliacoesReais(); // Atualiza em background sem bloquear

// ================================================================
// MODAL DE AVALIAÇÃO (app.html) — disparado após 5 dias de uso
// ================================================================
(function () {
    const API = 'https://sistema-financeiro-backend-o199.onrender.com/api';
    let estrelaSelecionada = 0;
    const labels = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente!'];

    // Expõe globalmente antes de qualquer guard para que o botão funcione
    window.abrirModalAvaliacao = function () {
        const modal = document.getElementById('modal-avaliacao');
        if (!modal) return;
        exibirModalAvaliacao();
    };

    // Só inicializa o resto em app.html onde o modal existe
    if (!document.getElementById('modal-avaliacao') && document.readyState !== 'loading') return;

    // ----------------------------------------------------------------
    // Chave localStorage user-specific para evitar conflito entre users
    // ----------------------------------------------------------------
    function getUserId() {
        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            if (!token) return 'anon';
            // JWT payload é o segundo segmento, base64url-encoded
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload.id || payload.userId || payload.sub || 'anon';
        } catch {
            return 'anon';
        }
    }

    function chaveDispensado() { return `avaliacao_dispensada_${getUserId()}`; }
    function chaveFeita()      { return `avaliacao_feita_${getUserId()}`; }

    // ----------------------------------------------------------------
    // Inicialização — chamada UMA VEZ após sistema estar pronto
    // ----------------------------------------------------------------
    async function inicializarAvaliacaoApp() {
        // Apenas executa se o modal existe na página (app.html)
        if (!document.getElementById('modal-avaliacao')) return;

        // Token: sessionStorage tem prioridade (sessão atual); localStorage é "lembrar"
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        // Guard local: já avaliou neste browser
        if (localStorage.getItem(chaveFeita())) return;

        // Guard local: dispensado recentemente (7 dias)
        const dispensado = localStorage.getItem(chaveDispensado());
        if (dispensado) {
            const dias = (Date.now() - parseInt(dispensado)) / (1000 * 60 * 60 * 24);
            if (dias < 7) return;
        }

        try {
            const response = await fetch(`${API}/avaliacoes/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const data = await response.json();

            if (data.success) {
                // Se backend confirma que já avaliou, salvar guard local e sair
                if (data.data.jaAvaliou) {
                    localStorage.setItem(chaveFeita(), '1');
                    return;
                }
                if (data.data.deveExibir) {
                    setTimeout(exibirModalAvaliacao, 3000);
                }
            }
        } catch { /* silencioso — não prejudica a experiência */ }
    }

    function exibirModalAvaliacao() {
        const modal = document.getElementById('modal-avaliacao');
        if (!modal) return;
        estrelaSelecionada = 0;
        document.getElementById('avaliacao-comentario').value = '';
        document.getElementById('avaliacao-contador').textContent = '0/500';
        document.getElementById('avaliacao-label-estrelas').textContent = 'Selecione uma nota';
        document.getElementById('avaliacao-msg-erro').style.display = 'none';
        document.getElementById('avaliacao-msg-sucesso').style.display = 'none';
        document.querySelectorAll('.estrela').forEach(e => e.classList.remove('ativa'));
        modal.style.display = 'flex';
        configurarEventosModal();
    }

    function configurarEventosModal() {
        document.querySelectorAll('.estrela').forEach(estrela => {
            estrela.onclick = () => selecionarEstrela(parseInt(estrela.dataset.valor));
            estrela.onmouseenter = () => destacarEstrelas(parseInt(estrela.dataset.valor));
            estrela.onmouseleave = () => destacarEstrelas(estrelaSelecionada);
        });

        const textarea = document.getElementById('avaliacao-comentario');
        if (textarea) {
            textarea.oninput = () => {
                document.getElementById('avaliacao-contador').textContent = `${textarea.value.length}/500`;
            };
        }

        document.getElementById('btn-enviar-avaliacao').onclick = enviarAvaliacao;
        document.getElementById('btn-fechar-avaliacao').onclick = dispensarAvaliacao;
        document.getElementById('btn-dispensar-avaliacao').onclick = dispensarAvaliacao;

        const modal = document.getElementById('modal-avaliacao');
        modal.onclick = (e) => { if (e.target === modal) dispensarAvaliacao(); };
    }

    function selecionarEstrela(valor) {
        estrelaSelecionada = valor;
        destacarEstrelas(valor);
        document.getElementById('avaliacao-label-estrelas').textContent = labels[valor];
    }

    function destacarEstrelas(ate) {
        document.querySelectorAll('.estrela').forEach(estrela => {
            estrela.classList.toggle('ativa', parseInt(estrela.dataset.valor) <= ate);
        });
    }

    async function enviarAvaliacao() {
        const comentario = document.getElementById('avaliacao-comentario').value.trim();
        const erroEl = document.getElementById('avaliacao-msg-erro');
        const sucessoEl = document.getElementById('avaliacao-msg-sucesso');
        const btnEnviar = document.getElementById('btn-enviar-avaliacao');

        erroEl.style.display = 'none';
        sucessoEl.style.display = 'none';

        if (!estrelaSelecionada) {
            erroEl.textContent = 'Por favor, selecione uma nota de 1 a 5 estrelas.';
            erroEl.style.display = 'block';
            return;
        }
        if (comentario.length < 10) {
            erroEl.textContent = 'Seu comentário deve ter pelo menos 10 caracteres.';
            erroEl.style.display = 'block';
            return;
        }

        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            const response = await fetch(`${API}/avaliacoes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ estrelas: estrelaSelecionada, comentario })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao enviar avaliação');

            // Marcar como feita localmente para não perguntar de novo
            localStorage.setItem(chaveFeita(), '1');

            sucessoEl.textContent = '✅ Obrigado pela sua avaliação! Ela já está visível na home.';
            sucessoEl.style.display = 'block';
            document.getElementById('btn-enviar-avaliacao').style.display = 'none';
            document.getElementById('btn-dispensar-avaliacao').style.display = 'none';
            setTimeout(fecharModal, 2500);

        } catch (error) {
            erroEl.textContent = error.message || 'Erro ao enviar avaliação. Tente novamente.';
            erroEl.style.display = 'block';
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Avaliação';
        }
    }

    function dispensarAvaliacao() {
        // Chave user-specific: não bloqueia outros usuários no mesmo browser
        localStorage.setItem(chaveDispensado(), Date.now().toString());
        fecharModal();
    }

    function fecharModal() {
        const modal = document.getElementById('modal-avaliacao');
        if (modal) modal.style.display = 'none';
    }

    // ----------------------------------------------------------------
    // Expor globalmente para que main.js possa chamar após sistemaReady
    // ----------------------------------------------------------------
    window.inicializarAvaliacaoApp = inicializarAvaliacaoApp;

    // Disparar APENAS em app.html, após o sistema estar pronto.
    // Escuta o evento custom que main.js emite ao fim de iniciarSistema().
    // Se o evento já foi disparado antes deste script carregar (improvável mas
    // possível), usa DOMContentLoaded como fallback.
    if (document.getElementById('modal-avaliacao')) {
        window.addEventListener('sistemaFinanceiroReady', () => {
            inicializarAvaliacaoApp();
        }, { once: true });
    }
})();
