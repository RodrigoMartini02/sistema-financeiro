// ================================================================
// SCRIPT DE IMPORTAÇÃO DE DADOS DO LOCALHOST PARA PRODUÇÃO
// ================================================================

const fs = require('fs');
const path = require('path');

// Configurações
const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';
const BACKUP_FILE = 'c:\\Users\\rodri\\Downloads\\backup_financeiro_2026-01-03.json';
const DOCUMENTO = '08996441988';
const SENHA = 'qwe123';

let token = null;

// ================================================================
// FUNÇÃO PARA FAZER LOGIN E OBTER TOKEN
// ================================================================
async function fazerLogin() {
    console.log('🔐 Fazendo login...');

    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documento: DOCUMENTO, senha: SENHA })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Erro no login: ${error.message}`);
    }

    const data = await response.json();
    token = data.data.token;
    console.log('✅ Login realizado com sucesso!');
    return token;
}

// ================================================================
// FUNÇÃO PARA CRIAR CATEGORIAS
// ================================================================
async function criarCategorias(categorias) {
    console.log('\n📁 Criando categorias...');
    const mapaCategorias = {};

    for (const catNome of categorias) {
        try {
            const response = await fetch(`${API_URL}/categorias`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nome: catNome,
                    cor: '#3498db'
                })
            });

            if (response.ok) {
                const data = await response.json();
                mapaCategorias[catNome] = data.data.id;
                console.log(`  ✓ Categoria criada: ${catNome} (ID: ${data.data.id})`);
            }
        } catch (error) {
            console.warn(`  ⚠️ Erro ao criar categoria ${catNome}:`, error.message);
        }
    }

    return mapaCategorias;
}

// ================================================================
// FUNÇÃO PARA CRIAR CARTÕES
// ================================================================
async function criarCartoes(cartoes) {
    console.log('\n💳 Criando cartões...');
    const mapaCartoes = {};

    for (const [key, cartao] of Object.entries(cartoes)) {
        try {
            const response = await fetch(`${API_URL}/cartoes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nome: cartao.nome,
                    limite: parseFloat(cartao.limite),
                    dia_fechamento: parseInt(cartao.diaFechamento),
                    dia_vencimento: parseInt(cartao.diaVencimento),
                    cor: cartao.cor || '#3498db',
                    ativo: cartao.ativo !== false
                })
            });

            if (response.ok) {
                const data = await response.json();
                const numeroCartao = parseInt(key.replace('cartao', ''));
                mapaCartoes[numeroCartao] = data.data.id;
                console.log(`  ✓ Cartão criado: ${cartao.nome} (ID: ${data.data.id})`);
            }
        } catch (error) {
            console.warn(`  ⚠️ Erro ao criar cartão ${cartao.nome}:`, error.message);
        }
    }

    return mapaCartoes;
}

// ================================================================
// FUNÇÃO PARA IMPORTAR RECEITAS
// ================================================================
async function importarReceitas(receitas) {
    console.log('\n💰 Importando receitas...');
    let sucesso = 0;
    let erro = 0;

    for (const receita of receitas) {
        try {
            const response = await fetch(`${API_URL}/receitas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    descricao: receita.descricao,
                    valor: parseFloat(receita.valor),
                    data_recebimento: receita.data,
                    mes: parseInt(receita.mes),
                    ano: parseInt(receita.ano),
                    observacoes: receita.observacoes || ''
                })
            });

            if (response.ok) {
                sucesso++;
                if (sucesso % 10 === 0) {
                    console.log(`  ✓ ${sucesso} receitas importadas...`);
                }
            } else {
                erro++;
                const errorData = await response.json();
                console.warn(`  ⚠️ Erro ao importar receita: ${errorData.message}`);
            }
        } catch (error) {
            erro++;
            console.warn(`  ⚠️ Erro ao importar receita:`, error.message);
        }
    }

    console.log(`✅ Total: ${sucesso} receitas importadas, ${erro} erros`);
}

// ================================================================
// FUNÇÃO PARA IMPORTAR DESPESAS (COM NOVOS CAMPOS)
// ================================================================
async function importarDespesas(despesas, mapaCategorias, mapaCartoes) {
    console.log('\n💸 Importando despesas...');
    let sucesso = 0;
    let erro = 0;

    for (const despesa of despesas) {
        try {
            // Mapear categoria
            const categoriaId = despesa.categoria && mapaCategorias[despesa.categoria]
                ? mapaCategorias[despesa.categoria]
                : null;

            // Mapear cartão
            const cartaoId = despesa.cartao_id && mapaCartoes[despesa.cartao_id]
                ? mapaCartoes[despesa.cartao_id]
                : null;

            const dadosDespesa = {
                descricao: despesa.descricao,
                valor: parseFloat(despesa.valor),
                data_vencimento: despesa.data_vencimento,
                data_compra: despesa.data_compra || null,
                data_pagamento: despesa.data_pagamento || null,
                mes: parseInt(despesa.mes),
                ano: parseInt(despesa.ano),
                categoria_id: categoriaId,
                cartao_id: cartaoId,
                forma_pagamento: despesa.forma_pagamento || 'dinheiro',
                parcelado: despesa.parcelado || false,
                total_parcelas: despesa.total_parcelas || null,
                parcela_atual: despesa.parcela_atual || null,
                pago: despesa.pago || false,
                observacoes: despesa.observacoes || '',
                // ✅ NOVOS CAMPOS PARA JUROS E ECONOMIAS
                valor_original: parseFloat(despesa.valor),
                valor_total_com_juros: null,
                valor_pago: despesa.pago ? parseFloat(despesa.valor) : null
            };

            const response = await fetch(`${API_URL}/despesas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dadosDespesa)
            });

            if (response.ok) {
                sucesso++;
                if (sucesso % 20 === 0) {
                    console.log(`  ✓ ${sucesso} despesas importadas...`);
                }
            } else {
                erro++;
                const errorData = await response.json();
                if (erro <= 5) { // Mostrar apenas os 5 primeiros erros
                    console.warn(`  ⚠️ Erro ao importar despesa: ${errorData.message}`);
                }
            }
        } catch (error) {
            erro++;
            if (erro <= 5) {
                console.warn(`  ⚠️ Erro ao importar despesa:`, error.message);
            }
        }
    }

    console.log(`✅ Total: ${sucesso} despesas importadas, ${erro} erros`);
}

// ================================================================
// FUNÇÃO PARA CRIAR ANOS
// ================================================================
async function criarAnos(anos) {
    console.log('\n📅 Criando anos...');

    for (const ano of anos) {
        try {
            const response = await fetch(`${API_URL}/anos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ano: parseInt(ano) })
            });

            if (response.ok) {
                console.log(`  ✓ Ano criado: ${ano}`);
            }
        } catch (error) {
            console.warn(`  ⚠️ Erro ao criar ano ${ano}:`, error.message);
        }
    }
}

// ================================================================
// FUNÇÃO PRINCIPAL
// ================================================================
async function importarDados() {
    try {
        console.log('🚀 Iniciando importação de dados...\n');
        console.log(`📂 Arquivo: ${BACKUP_FILE}\n`);

        // Ler arquivo de backup
        const backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));

        console.log('📊 Resumo do backup:');
        console.log(`  - Receitas: ${backupData.receitas?.length || 0}`);
        console.log(`  - Despesas: ${backupData.despesas?.length || 0}`);
        console.log(`  - Categorias: ${backupData.categorias?.length || 0}`);
        console.log(`  - Cartões: ${Object.keys(backupData.cartoes || {}).length}`);

        // Fazer login
        await fazerLogin();

        // Extrair categorias únicas
        const categoriasSet = new Set();
        backupData.despesas?.forEach(d => {
            if (d.categoria) categoriasSet.add(d.categoria);
        });
        const categorias = Array.from(categoriasSet);

        // Criar categorias e obter mapeamento
        const mapaCategorias = await criarCategorias(categorias);

        // Criar cartões e obter mapeamento
        const mapaCartoes = backupData.cartoes
            ? await criarCartoes(backupData.cartoes)
            : {};

        // Importar receitas
        if (backupData.receitas && backupData.receitas.length > 0) {
            await importarReceitas(backupData.receitas);
        }

        // Importar despesas
        if (backupData.despesas && backupData.despesas.length > 0) {
            await importarDespesas(backupData.despesas, mapaCategorias, mapaCartoes);
        }

        // Criar anos
        const anosSet = new Set();
        backupData.receitas?.forEach(r => anosSet.add(r.ano));
        backupData.despesas?.forEach(d => anosSet.add(d.ano));
        const anos = Array.from(anosSet);

        if (anos.length > 0) {
            await criarAnos(anos);
        }

        console.log('\n🎉 Importação concluída com sucesso!');
        console.log('\n📝 Próximos passos:');
        console.log('  1. Acesse o sistema em produção');
        console.log('  2. Verifique o dashboard');
        console.log('  3. Confira se juros e economias estão aparecendo');

    } catch (error) {
        console.error('\n❌ Erro fatal durante importação:', error);
        process.exit(1);
    }
}

// Executar importação
importarDados();
