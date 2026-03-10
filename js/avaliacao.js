const reviews = [
    { text: '"O Fin-Gerence foi como ter um funcionário a mais. A produtividade e rentabilidade aumentaram."', author: "Mariana Penedo", stars: 5 },
    { text: '"Finalmente uma organização financeira que faz toda a diferença no meu dia a dia."', author: "Ricardo Silva", stars: 5 },
    { text: '"A versão PWA é fantástica. Rápida, leve e intuitiva como um app nativo."', author: "Marcos Oliveira", stars: 5 },
    { text: '"O melhor suporte que já tive. O sistema resolveu todos os meus problemas de fluxo."', author: "Carla Mendes", stars: 5 },
    { text: '"Controle total das despesas na palma da mão. Recomendo!"', author: "Lucas Santos", stars: 5 },
    { text: '"Interface limpa e intuitiva. O melhor para pequenas empresas."', author: "Ana Júlia", stars: 4 },
    { text: '"Mudou minha relação com o dinheiro. Agora sei exatamente para onde vai meu lucro."', author: "Roberto F.", stars: 5 },
    { text: '"Excelente para controle de cartões de crédito. Nunca mais paguei juros."', author: "Patrícia Lima", stars: 5 },
    { text: '"O sistema de metas de economia é motivador. Já guardei 15% a mais esse mês."', author: "Bruno M.", stars: 5 },
    { text: '"Suporte rápido e eficiente. Tive uma dúvida e resolveram em minutos."', author: "Fernanda S.", stars: 5 },
    { text: '"Importação de extratos me poupa horas de trabalho manual."', author: "Gustavo Henrique", stars: 4 },
    { text: '"Muito seguro e confiável. Me sinto tranquilo em gerenciar meus dados aqui."', author: "Sérgio L.", stars: 5 },
    { text: '"Visual dos gráficos é incrível. Facilita muito a tomada de decisão."', author: "Mônica V.", stars: 5 },
    { text: '"Uso com minha esposa e o controle multi-usuário funciona perfeitamente."', author: "Diego Castro", stars: 5 },
    { text: '"Relatórios completos. Consigo ver meu balanço anual em um clique."', author: "Beatriz A.", stars: 5 },
    { text: '"O melhor PWA que já utilizei. Nem parece que é no navegador."', author: "Thiago Rocha", stars: 5 },
    { text: '"A gestão de categorias é muito flexível. Adaptei para o meu negócio."', author: "Vanessa G.", stars: 4 },
    { text: '"Não vivo mais sem o alerta de vencimentos de contas."', author: "André Luiz", stars: 5 },
    { text: '"Consegui identificar gastos desnecessários logo na primeira semana."', author: "Juliana P.", stars: 5 },
    { text: '"Fácil de usar até para quem não entende nada de finanças."', author: "Cláudio H.", stars: 5 },
    { text: '"As recorrências automáticas são uma mão na roda para assinaturas."', author: "Ellen Ramos", stars: 5 },
    { text: '"Melhor custo-benefício do mercado brasileiro."', author: "Marcelo T.", stars: 5 },
    { text: '"Gráficos de pizza por categoria ajudam a economizar no essencial."', author: "Sônia B.", stars: 4 },
    { text: '"O sistema é leve e abre rápido em qualquer lugar."', author: "Felipe N.", stars: 5 },
    { text: '"Perfeito para quem trabalha como autônomo."', author: "Renata F.", stars: 5 },
    { text: '"Acompanhar o saldo futuro me dá muita paz mental."', author: "Daniela S.", stars: 5 },
    { text: '"Superou minhas expectativas em todos os sentidos."', author: "Igor Lopes", stars: 5 }
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