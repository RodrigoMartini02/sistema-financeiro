const reviews = [
    { text: '"O faturamento cresceu 25% com a organização financeira."', author: "Mariana", stars: 5 },
    { text: '"Finalmente um sistema simples que eu realmente uso todo dia."', author: "Ricardo", stars: 5 },
    { text: '"A versão PWA no meu iPhone ficou fantástica, muito ágil."', author: "Marcos", stars: 4 },
    { text: '"Interface limpa, intuitiva e suporte nota 10."', author: "Carla", stars: 5 },
    { text: '"Controle total das despesas na palma da mão. Recomendo!"', author: "Lucas", stars: 5 }
];

let currentIndex = 0;
const duration = 5000; 
const progressContainer = document.getElementById('progress-bars');
const textEl = document.getElementById('review-text');
const authorEl = document.getElementById('review-author');
const starsEl = document.getElementById('stars-container');

// Gera as barras
reviews.forEach(() => {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.innerHTML = '<div class="progress-fill"></div>';
    progressContainer.appendChild(bar);
});

const fills = document.querySelectorAll('.progress-fill');

function updateReview() {
    // Reseta barras
    fills.forEach((f, i) => {
        f.style.transition = 'none';
        f.style.width = i < currentIndex ? '100%' : '0%';
    });

    const currentReview = reviews[currentIndex];

    // Atualiza Estrelas (Varia entre 4 e 5)
    let starHtml = '';
    for(let i=0; i<5; i++) {
        starHtml += i < currentReview.stars ? '★' : '☆';
    }
    starsEl.innerHTML = starHtml;

    // Atualiza Texto com fade
    textEl.style.opacity = 0;
    textEl.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
        textEl.innerText = currentReview.text;
        authorEl.innerText = currentReview.author;
        textEl.style.opacity = 1;
        textEl.style.transform = 'translateY(0)';
    }, 300);

    // Anima a barra
    setTimeout(() => {
        const currentFill = fills[currentIndex];
        currentFill.style.transition = `width ${duration}ms linear`;
        currentFill.style.width = '100%';
    }, 50);

    // Próximo slide
    setTimeout(() => {
        currentIndex = (currentIndex + 1) % reviews.length;
        updateReview();
    }, duration);
}

if (progressContainer) updateReview();