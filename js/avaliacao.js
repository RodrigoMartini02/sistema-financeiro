const reviews = [
    { text: '"O Fin-Gerence foi como ter um funcionário a mais. A produtividade e rentabilidade aumentaram."', author: "Mariana Penedo", stars: 5 },
    { text: '"Finalmente uma organização financeira que faz toda a diferença no meu dia a dia."', author: "Ricardo Silva", stars: 5 },
    { text: '"A versão PWA é fantástica. Rápida, leve e intuitiva como um app nativo."', author: "Marcos Oliveira", stars: 4 },
    { text: '"O melhor suporte que já tive. O sistema resolveu todos os meus problemas de fluxo."', author: "Carla Mendes", stars: 5 }
];

let currentIndex = 0;
const duration = 5000;
const container = document.getElementById('progress-bars');
const textEl = document.getElementById('review-text');
const authorEl = document.getElementById('review-author');
const starsEl = document.getElementById('stars-container');

// Criar barras
reviews.forEach(() => {
    const bar = document.createElement('div');
    bar.className = 'story-progress-bar';
    bar.innerHTML = '<div class="story-progress-fill"></div>';
    container.appendChild(bar);
});

const fills = document.querySelectorAll('.story-progress-fill');

function nextSlide() {
    // Resetar barras
    fills.forEach((f, i) => {
        f.style.transition = 'none';
        f.style.width = i < currentIndex ? '100%' : '0%';
    });

    const current = reviews[currentIndex];
    
    // Update Estrelas (Varia 4 e 5)
    starsEl.innerHTML = '★'.repeat(current.stars) + '☆'.repeat(5 - current.stars);
    
    // Update Texto com animação de fade
    textEl.style.opacity = 0;
    setTimeout(() => {
        textEl.innerText = current.text;
        authorEl.innerText = current.author;
        textEl.style.opacity = 1;
    }, 300);

    // Animar barra atual
    setTimeout(() => {
        fills[currentIndex].style.transition = `width ${duration}ms linear`;
        fills[currentIndex].style.width = '100%';
    }, 50);

    // Timer para o próximo
    setTimeout(() => {
        currentIndex = (currentIndex + 1) % reviews.length;
        nextSlide();
    }, duration);
}

if (container) nextSlide();