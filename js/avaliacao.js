/**
 * Sistema de Avaliações Estilo Stories (Inspirado no Simples Dental)
 */

const reviews = [
    { text: '"O melhor controle que já usei. Simples e direto!"', author: "Ricardo" },
    { text: '"Finalmente organizei minhas metas de reserva."', author: "Ana" },
    { text: '"A versão PWA no meu iPhone ficou fantástica."', author: "Marcos" },
    { text: '"Interface limpa e suporte nota 10."', author: "Carla" },
    { text: '"Economizei 20% logo no primeiro mês de uso."', author: "Lucas" }
];

let currentIndex = 0;
const duration = 5000; // Tempo de cada slide (5 segundos)
const progressContainer = document.getElementById('progress-bars');
const textEl = document.getElementById('review-text');
const authorEl = document.getElementById('review-author');

// 1. Criar as barrinhas dinamicamente
reviews.forEach(() => {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.innerHTML = '<div class="progress-fill"></div>';
    progressContainer.appendChild(bar);
});

const fills = document.querySelectorAll('.progress-fill');

function updateReview() {
    // Resetar preenchimento das barras
    fills.forEach((f, i) => {
        f.style.transition = 'none';
        f.style.width = i < currentIndex ? '100%' : '0%';
    });

    // Atualizar texto e autor
    textEl.style.opacity = 0;
    setTimeout(() => {
        textEl.innerText = reviews[currentIndex].text;
        authorEl.innerText = reviews[currentIndex].author;
        textEl.style.opacity = 1;
    }, 200);

    // Iniciar animação da barra atual
    setTimeout(() => {
        const currentFill = fills[currentIndex];
        currentFill.style.transition = `width ${duration}ms linear`;
        currentFill.style.width = '100%';
    }, 50);

    // Agendar próxima troca
    setTimeout(() => {
        currentIndex = (currentIndex + 1) % reviews.length;
        updateReview();
    }, duration);
}

// Iniciar sistema
if (progressContainer) {
    updateReview();
}