const reviews = [
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

let currentIndex = 0;
const duration = 5000;
const container = document.getElementById('progress-bars');
const textEl = document.getElementById('review-text');
const authorEl = document.getElementById('review-author');
const starsEl = document.getElementById('stars-container');

// Calcula Média e Total
document.getElementById('total-reviews').innerText = reviews.length;
const avg = (reviews.reduce((acc, r) => acc + r.stars, 0) / reviews.length).toFixed(1);
document.getElementById('average-rating').innerText = avg;

// Criar barras (Geramos apenas 5 barras para representar o ciclo, para não poluir o topo com 27 riscos)
const displayCount = Math.min(reviews.length, 5); 
for(let i=0; i < displayCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'story-progress-bar';
    bar.innerHTML = '<div class="story-progress-fill"></div>';
    container.appendChild(bar);
}

const fills = document.querySelectorAll('.story-progress-fill');

function nextSlide() {
    // Resetar barras
    let fillIndex = currentIndex % displayCount;
    
    if (fillIndex === 0) {
        fills.forEach(f => { f.style.transition = 'none'; f.style.width = '0%'; });
    }

    const current = reviews[currentIndex];
    
    // Update Estrelas (Amarelas via CSS)
    starsEl.innerHTML = '★'.repeat(current.stars) + '☆'.repeat(5 - current.stars);
    
    // Update Texto
    textEl.style.opacity = 0;
    setTimeout(() => {
        textEl.innerText = current.text;
        authorEl.innerText = current.author;
        textEl.style.opacity = 1;
    }, 300);

    // Animar barra
    setTimeout(() => {
        fills[fillIndex].style.transition = `width ${duration}ms linear`;
        fills[fillIndex].style.width = '100%';
    }, 50);

    setTimeout(() => {
        currentIndex = (currentIndex + 1) % reviews.length;
        nextSlide();
    }, duration);
}

if (container) nextSlide();