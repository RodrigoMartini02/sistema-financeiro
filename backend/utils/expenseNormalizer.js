// ================================================================
// EXPENSE NORMALIZER - Normaliza e formata dados de despesas
// ================================================================

const FORMAS_PAGAMENTO_MAP = {
    'cartao': 'cartao_credito',
    'cartão': 'cartao_credito',
    'credito': 'cartao_credito',
    'crédito': 'cartao_credito',
    'cc': 'cartao_credito',
    'debito': 'cartao_debito',
    'débito': 'cartao_debito',
    'cd': 'cartao_debito',
    'pix': 'pix',
    'dinheiro': 'dinheiro',
    'especie': 'dinheiro',
    'espécie': 'dinheiro',
    'transferencia': 'transferencia',
    'transferência': 'transferencia',
    'ted': 'transferencia',
    'doc': 'transferencia',
    'boleto': 'boleto',
};

const CATEGORIAS_KEYWORDS = {
    'Alimentação': ['mercado', 'supermercado', 'restaurante', 'lanche', 'ifood', 'rappi', 'uber eats',
        'padaria', 'açougue', 'pizza', 'hamburguer', 'almoço', 'jantar', 'cafe', 'café',
        'sushi', 'comida', 'refeição', 'delivery', 'hortifruti', 'feira'],
    'Transporte': ['uber', '99', 'combustivel', 'combustível', 'gasolina', 'etanol', 'alcool', 'álcool',
        'ônibus', 'metro', 'metrô', 'taxi', 'táxi', 'passagem', 'transporte', 'estacionamento',
        'pedágio', 'pedagio', 'carro', 'moto', 'bicicleta', 'patinete', 'trem'],
    'Moradia': ['aluguel', 'condominio', 'condomínio', 'iptu', 'luz', 'energia', 'água', 'agua',
        'gas', 'gás', 'internet', 'telefone', 'tv', 'cabo', 'reforma', 'manutenção',
        'manutencao', 'móveis', 'moveis', 'eletrodomestico'],
    'Saúde': ['farmacia', 'farmácia', 'remedio', 'remédio', 'médico', 'medico', 'consulta',
        'hospital', 'clinica', 'clínica', 'dentista', 'exame', 'plano de saude', 'unimed',
        'amil', 'bradesco saude', 'academia', 'gym'],
    'Educação': ['escola', 'faculdade', 'curso', 'livro', 'material escolar', 'mensalidade',
        'uniforme', 'colegio', 'colégio', 'creche', 'aula', 'treinamento', 'certificado'],
    'Lazer': ['cinema', 'teatro', 'show', 'ingresso', 'viagem', 'hotel', 'airbnb', 'passeio',
        'parque', 'museu', 'jogo', 'esporte', 'hobby'],
    'Assinaturas': ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'apple', 'google',
        'youtube', 'deezer', 'globoplay', 'telecine', 'paramount', 'adobe', 'microsoft',
        'office', 'assinatura', 'mensalidade', 'plano'],
    'Vestuário': ['roupa', 'calçado', 'sapato', 'tenis', 'tênis', 'camisa', 'calça', 'vestido',
        'acessório', 'acessorio', 'bolsa', 'moda', 'zara', 'renner', 'c&a', 'riachuelo'],
    'Finanças': ['emprestimo', 'empréstimo', 'financiamento', 'parcela', 'juros', 'banco',
        'seguro', 'investimento', 'poupança', 'poupanca', 'tarifa', 'taxa'],
};

/**
 * Normaliza o valor monetário
 * Aceita: "120", "R$ 120,50", "1.200,50", "1200.50"
 */
function normalizarValor(valorStr) {
    if (!valorStr) return null;
    if (typeof valorStr === 'number') return parseFloat(valorStr.toFixed(2));

    let str = String(valorStr).trim();
    // Remove R$, espaços
    str = str.replace(/R\$\s*/gi, '').trim();
    // Remove pontos de milhar e substitui vírgula por ponto
    str = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(str);
    return isNaN(val) ? null : parseFloat(val.toFixed(2));
}

/**
 * Normaliza a forma de pagamento
 */
function normalizarFormaPagamento(forma) {
    if (!forma) return 'dinheiro';
    const lower = String(forma).toLowerCase().trim();
    return FORMAS_PAGAMENTO_MAP[lower] || lower || 'dinheiro';
}

/**
 * Infere categoria pelo texto da descrição
 */
function inferirCategoria(descricao) {
    if (!descricao) return 'Outros';
    const lower = descricao.toLowerCase();

    for (const [categoria, keywords] of Object.entries(CATEGORIAS_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return categoria;
        }
    }
    return 'Outros';
}

/**
 * Normaliza data para formato YYYY-MM-DD
 * Aceita: "dia 15", "15/03", "15/03/2026", "amanha", "hoje", "15"
 */
function normalizarData(dataStr, referencia = new Date()) {
    if (!dataStr) return null;
    const str = String(dataStr).toLowerCase().trim();

    const hoje = new Date(referencia);

    // Palavras especiais
    if (str === 'hoje') return formatarData(hoje);
    if (str === 'amanha' || str === 'amanhã') {
        hoje.setDate(hoje.getDate() + 1);
        return formatarData(hoje);
    }

    // Apenas dia (ex: "15", "dia 15")
    const apenasdia = str.match(/(?:dia\s*)?(\d{1,2})$/);
    if (apenasdia) {
        const dia = parseInt(apenasdia[1]);
        if (dia >= 1 && dia <= 31) {
            const ano = hoje.getFullYear();
            const mes = hoje.getMonth() + 1;
            return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        }
    }

    // DD/MM ou DD/MM/YYYY
    const ddmm = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (ddmm) {
        const dia = parseInt(ddmm[1]);
        const mes = parseInt(ddmm[2]);
        let ano = ddmm[3] ? parseInt(ddmm[3]) : hoje.getFullYear();
        if (ano < 100) ano += 2000;
        return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    }

    // YYYY-MM-DD (já no formato correto)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    return null;
}

function formatarData(date) {
    const d = new Date(date);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

/**
 * Normaliza número de parcelas
 */
function normalizarParcelas(parcelasStr) {
    if (!parcelasStr) return 1;
    const n = parseInt(String(parcelasStr).replace(/[^\d]/g, ''));
    return isNaN(n) || n < 1 ? 1 : n;
}

/**
 * Normaliza um objeto de despesa completo
 */
function normalizarDespesa(dados) {
    const normalizado = {};

    // Descrição
    normalizado.descricao = dados.descricao
        ? String(dados.descricao).trim().substring(0, 255)
        : null;

    // Valor
    normalizado.valor = normalizarValor(dados.valor);

    // Categoria
    normalizado.categoria = dados.categoria || inferirCategoria(dados.descricao);

    // Forma de pagamento
    normalizado.forma_pagamento = normalizarFormaPagamento(dados.forma_pagamento);

    // Vencimento
    normalizado.vencimento = dados.vencimento ? normalizarData(dados.vencimento) : null;

    // Data da compra/despesa
    normalizado.data = dados.data ? normalizarData(dados.data) : formatarData(new Date());

    // Parcelas
    normalizado.parcelas = normalizarParcelas(dados.parcelas);

    // Campos extras preservados do parser
    normalizado.ja_pago    = !!dados.ja_pago;
    normalizado.recorrente = !!dados.recorrente;
    if (dados.data_pagamento) normalizado.data_pagamento = dados.data_pagamento;
    if (dados.nome_cartao) normalizado.nome_cartao = dados.nome_cartao;
    if (dados.categoria_id) normalizado.categoria_id = dados.categoria_id;
    if (dados.cartao_id)    normalizado.cartao_id    = dados.cartao_id;

    return normalizado;
}

/**
 * Valida campos obrigatórios de uma despesa
 * Retorna lista de campos faltando
 */
function validarCamposObrigatorios(dados) {
    const faltando = [];

    if (!dados.descricao) faltando.push('descricao');
    if (!dados.valor || dados.valor <= 0) faltando.push('valor');
    if (!dados.forma_pagamento) faltando.push('forma_pagamento');

    return faltando;
}

/**
 * Gera pergunta amigável para campo faltando
 */
function perguntaParaCampo(campo) {
    const perguntas = {
        'descricao': 'Qual é a descrição desta despesa?',
        'valor': 'Qual é o valor da despesa?',
        'forma_pagamento': 'Qual a forma de pagamento? (cartão, pix, dinheiro, etc)',
        'vencimento': 'Qual a data de vencimento?',
        'categoria': 'Qual a categoria? (Alimentação, Transporte, Moradia, etc)',
        'parcelas': 'Em quantas parcelas?',
    };
    return perguntas[campo] || `Qual é o ${campo}?`;
}

module.exports = {
    normalizarDespesa,
    normalizarValor,
    normalizarFormaPagamento,
    normalizarData,
    normalizarParcelas,
    inferirCategoria,
    validarCamposObrigatorios,
    perguntaParaCampo,
    formatarData,
    CATEGORIAS_KEYWORDS,
};
