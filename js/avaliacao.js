// ================================================================
// AVALIAÇÕES DA HOME — exibe avaliações reais + fallback estático
// ================================================================

const reviewsEstaticas = [
    { text: '"Antes eu me sentia perdido com meu dinheiro. Hoje tenho clareza total e durmo tranquilo."', author: "Dra. Mariana", stars: 5 },
    { text: '"O diferencial pra mim foi a IA Gen. Ela realmente facilita o registro de receitas e despesas."', author: "Bruno", stars: 5 },
    { text: '"Eu não imaginava o quanto estava desorganizado até começar a usar. Mudou meu dia a dia."', author: "Ricardo", stars: 5 },
    { text: '"Eu vivia apagando incêndio financeiro. Agora tenho controle e consigo planejar."', author: "Dra. Ana", stars: 5 },
    { text: '"Hoje eu sei exatamente para onde vai cada real. Isso não tem preço."', author: "Lucas", stars: 5 },
    { text: '"Simples, direto e funciona. Não precisei aprender nada complicado."', author: "Dr. André", stars: 4 },
    { text: '"Eu achava que ganhava pouco… na verdade eu gastava mal. Isso abriu meus olhos."', author: "Roberto", stars: 5 },
    { text: '"Parei de pagar juros sem perceber. Só isso já valeu muito a pena."', author: "Patrícia", stars: 5 },
    { text: '"Comecei a guardar dinheiro sem sofrimento. Pela primeira vez na vida."', author: "Dr. Bruno", stars: 5 },
    { text: '"Quando precisei de ajuda, resolveram na hora. Isso passa muita confiança."', author: "Fernanda", stars: 5 },
    { text: '"Hoje me sinto seguro em organizar tudo aqui. É simples e confiável."', author: "Dr. Sérgio", stars: 5 },
    { text: '"Agora eu enxergo minha vida financeira de verdade, não só números soltos."', author: "Mônica", stars: 5 },
    { text: '"Eu e minha esposa finalmente paramos de brigar por dinheiro."', author: "Diego", stars: 5 },
    { text: '"Consigo ver o ano inteiro e me planejar com antecedência. Mudou tudo."', author: "Dra. Beatriz", stars: 5 },
    { text: '"Adaptei fácil para minha realidade. Parece que foi feito pra mim."', author: "Vanessa", stars: 4 },
    { text: '"Nunca fui organizado, mas com a IA Gen ficou fácil manter tudo em dia."', author: "Carlos", stars: 5 },
    { text: '"Nunca mais esqueci conta. Parece simples, mas fez muita diferença."', author: "Dr. Luiz", stars: 5 },
    { text: '"Na primeira semana já cortei vários gastos que nem percebia."', author: "Juliana", stars: 5 },
    { text: '"Sou péssimo com finanças e mesmo assim consegui usar sem dificuldade."', author: "Cláudio", stars: 5 },
    { text: '"Minhas despesas se organizam sozinhas agora. Me economiza muito tempo."', author: "Dra. Ellen", stars: 5 },
    { text: '"Vale muito mais do que custa. Sinceramente."', author: "Marcelo", stars: 5 },
    { text: '"Comecei a gastar melhor, não só menos."', author: "Sônia", stars: 4 },
    { text: '"Rápido, direto e sem travar. Uso todo dia."', author: "Dr. Felipe", stars: 5 },
    { text: '"Como autônoma, eu precisava disso há anos."', author: "Renata", stars: 5 },
    { text: '"Saber quanto vou ter no futuro me deu uma paz absurda."', author: "Daniela", stars: 5 },
    { text: '"Eu entrei sem expectativa… e hoje não fico sem."', author: "Dr. Igor", stars: 5 },
    { text: '"Depois que comecei a usar a IA Gen, cadastrar despesas virou coisa de segundos."', author: "Rafael", stars: 5 }
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

    if (container) {
        // Criar barras de progresso (máx 7 barras)
        const displayCount = Math.min(reviews.length, 7);
        for (let i = 0; i < displayCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'story-progress-bar';
            bar.innerHTML = '<div class="story-progress-fill"></div>';
            container.appendChild(bar);
        }
        nextSlide();
    }

    atualizarBreakdown(reviews);
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
        document.getElementById('avaliacao-contador').textContent = '0/50';
        document.getElementById('avaliacao-label-estrelas').textContent = 'Selecione uma nota';
        document.getElementById('avaliacao-msg-erro').style.display = 'none';
        document.getElementById('avaliacao-msg-sucesso').style.display = 'none';
        document.querySelectorAll('.estrela').forEach(e => e.classList.remove('ativa'));
        modal.style.display = 'block';
        modal.classList.remove('saindo');
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
                document.getElementById('avaliacao-contador').textContent = `${textarea.value.length}/50`;
            };
        }

        document.getElementById('btn-enviar-avaliacao').onclick = enviarAvaliacao;
        document.getElementById('btn-fechar-avaliacao').onclick = fecharToastAvaliacao;
        document.getElementById('btn-dispensar-avaliacao').onclick = dispensarAvaliacao;
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

    function fecharToastAvaliacao() {
        const modal = document.getElementById('modal-avaliacao');
        if (!modal) return;
        modal.classList.add('saindo');
        setTimeout(() => { modal.style.display = 'none'; modal.classList.remove('saindo'); }, 320);
    }

    function dispensarAvaliacao() {
        // Chave user-specific: não bloqueia outros usuários no mesmo browser
        localStorage.setItem(chaveDispensado(), Date.now().toString());
        fecharToastAvaliacao();
    }

    function fecharModal() {
        fecharToastAvaliacao();
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

// ================================================================
// VERIFICAÇÃO AUTOMÁTICA — dispara modal após 7 dias de cadastro
// ================================================================
async function verificarEDispararAvaliacao() {
    // Verifica se usuário já avaliou via API
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const res = await fetch('/api/avaliacoes/minha', { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.ok) {
            const data = await res.json();
            if (data && data.avaliacao) return; // já avaliou, não dispara
        }
    } catch(e) { return; }
    // Verifica data de cadastro
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || localStorage.getItem('usuario') || '{}');
    if (!usuario.dataCadastro && !usuario.createdAt) return;
    const dataCadastro = new Date(usuario.dataCadastro || usuario.createdAt);
    const diasDesde = (Date.now() - dataCadastro.getTime()) / (1000 * 60 * 60 * 24);
    if (diasDesde >= 7) {
        setTimeout(() => {
            if (window.abrirModalAvaliacao) window.abrirModalAvaliacao();
        }, 3000); // 3 segundos após carregar
    }
}
window.verificarEDispararAvaliacao = verificarEDispararAvaliacao;
