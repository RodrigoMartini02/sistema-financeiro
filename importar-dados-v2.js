// ================================================================
// SCRIPT DE IMPORTAÇÃO V2 - COM MAPEAMENTO INTELIGENTE DE IDs
// ================================================================
// Este script importa dados do backup V2 para o backend em produção
// mapeando IDs antigos para novos IDs automaticamente
// ================================================================

const fs = require('fs');
const path = require('path');

// ================================================================
// CONFIGURAÇÕES
// ================================================================
const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';
const BACKUP_FILE = 'C:\\Users\\rodri\\Downloads\\backup_financeiro_v2_2026-01-04.json'; // AJUSTAR DATA
const DOCUMENTO = '08996441988';
const SENHA = 'qwe123';

let token = null;
let usuarioId = null;

// Mapas de IDs antigos → novos
const mapaCategorias = {}; // { "Alimentação": 15, "Transporte": 16, ... }
const mapaCartoes = {}; // { 1: 25, 2: 26, 3: 27 }

// ================================================================
// UTILITÁRIOS
// ================================================================
function logSucesso(msg) {
    console.log(`✅ ${msg}`);
}

function logErro(msg, erro = null) {
    console.error(`❌ ${msg}`);
    if (erro) console.error(`   Detalhes: ${erro}`);
}

function logInfo(msg) {
    console.log(`ℹ️  ${msg}`);
}

function logProgresso(atual, total, tipo) {
    if (atual % 10 === 0 || atual === total) {
        console.log(`   📊 ${tipo}: ${atual}/${total}`);
    }
}

// ================================================================
// AUTENTICAÇÃO
// ================================================================
async function fazerLogin() {
    console.log('\n🔐 Fazendo login na API...');

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documento: DOCUMENTO, senha: SENHA })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro no login');
        }

        const data = await response.json();
        token = data.data.token;
        usuarioId = data.data.usuario.id;

        logSucesso(`Login realizado! Usuário: ${data.data.usuario.nome}`);
        logInfo(`Token obtido, válido por 24h`);

        return true;
    } catch (error) {
        logErro('Falha no login', error.message);
        throw error;
    }
}

// ================================================================
// IMPORTAÇÃO DE CATEGORIAS
// ================================================================
async function importarCategorias(categorias) {
    console.log('\n📁 Importando categorias...');

    if (!categorias || categorias.length === 0) {
        logInfo('Nenhuma categoria para importar');
        return;
    }

    let sucesso = 0;
    let erro = 0;

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
                    cor: '#3498db',
                    icone: null
                })
            });

            if (response.ok) {
                const data = await response.json();
                mapaCategorias[catNome] = data.data.id;
                sucesso++;
                logProgresso(sucesso, categorias.length, 'Categorias');
            } else {
                // Categoria pode já existir
                const errorData = await response.json();
                if (errorData.message && errorData.message.includes('já existe')) {
                    // Buscar ID da categoria existente
                    const listResponse = await fetch(`${API_URL}/categorias`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (listResponse.ok) {
                        const listData = await listResponse.json();
                        const catExistente = listData.data.find(c => c.nome === catNome);
                        if (catExistente) {
                            mapaCategorias[catNome] = catExistente.id;
                            sucesso++;
                        }
                    }
                } else {
                    erro++;
                }
            }
        } catch (error) {
            erro++;
            if (erro <= 3) logErro(`Erro ao importar categoria "${catNome}"`, error.message);
        }
    }

    logSucesso(`Categorias: ${sucesso} importadas, ${erro} erros`);
    logInfo(`Mapa de categorias: ${Object.keys(mapaCategorias).length} categorias mapeadas`);
}

// ================================================================
// IMPORTAÇÃO DE CARTÕES
// ================================================================
async function importarCartoes(cartoes) {
    console.log('\n💳 Importando cartões...');

    if (!cartoes || Object.keys(cartoes).length === 0) {
        logInfo('Nenhum cartão para importar');
        return;
    }

    let sucesso = 0;
    let erro = 0;

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
                const numeroCartao = cartao.numero_cartao;

                // Mapear: numeroCartao antigo → ID novo no banco
                mapaCartoes[numeroCartao] = data.data.id;

                sucesso++;
                logInfo(`   ✓ Cartão "${cartao.nome}" criado (ID antigo: ${numeroCartao} → ID novo: ${data.data.id})`);
            } else {
                const errorData = await response.json();
                erro++;
                if (erro <= 3) logErro(`Erro ao criar cartão "${cartao.nome}"`, errorData.message);
            }
        } catch (error) {
            erro++;
            if (erro <= 3) logErro(`Erro ao importar cartão "${cartao.nome}"`, error.message);
        }
    }

    logSucesso(`Cartões: ${sucesso} importados, ${erro} erros`);
    logInfo(`Mapa de cartões: ${JSON.stringify(mapaCartoes)}`);
}

// ================================================================
// IMPORTAÇÃO DE RECEITAS
// ================================================================
async function importarReceitas(receitas) {
    console.log('\n💰 Importando receitas...');

    if (!receitas || receitas.length === 0) {
        logInfo('Nenhuma receita para importar');
        return;
    }

    let sucesso = 0;
    let erro = 0;
    const total = receitas.length;

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
                logProgresso(sucesso, total, 'Receitas');
            } else {
                const errorData = await response.json();
                erro++;
                if (erro <= 5) logErro(`Erro ao importar receita`, errorData.message);
            }
        } catch (error) {
            erro++;
            if (erro <= 5) logErro('Erro ao importar receita', error.message);
        }
    }

    logSucesso(`Receitas: ${sucesso}/${total} importadas, ${erro} erros`);
}

// ================================================================
// IMPORTAÇÃO DE DESPESAS (COM MAPEAMENTO)
// ================================================================
async function importarDespesas(despesas) {
    console.log('\n💸 Importando despesas com mapeamento de IDs...');

    if (!despesas || despesas.length === 0) {
        logInfo('Nenhuma despesa para importar');
        return;
    }

    let sucesso = 0;
    let erro = 0;
    let avisos = 0;
    const total = despesas.length;

    for (const despesa of despesas) {
        try {
            // ✅ MAPEAR CATEGORIA_ID (nome → ID novo)
            let categoriaId = null;
            if (despesa.categoria && mapaCategorias[despesa.categoria]) {
                categoriaId = mapaCategorias[despesa.categoria];
            } else if (despesa.categoria) {
                avisos++;
                if (avisos <= 3) {
                    logInfo(`   ⚠️  Categoria "${despesa.categoria}" não encontrada no mapa, usando null`);
                }
            }

            // ✅ MAPEAR CARTAO_ID (número antigo → ID novo)
            let cartaoId = null;
            if (despesa.cartao_id_original && mapaCartoes[despesa.cartao_id_original]) {
                cartaoId = mapaCartoes[despesa.cartao_id_original];
            } else if (despesa.cartao_id_original) {
                avisos++;
                if (avisos <= 3) {
                    logInfo(`   ⚠️  Cartão ID ${despesa.cartao_id_original} não encontrado no mapa, usando null`);
                }
            }

            // Preparar dados para API
            const dadosDespesa = {
                descricao: despesa.descricao,
                valor: parseFloat(despesa.valor),
                data_vencimento: despesa.data_vencimento,
                data_compra: despesa.data_compra || null,
                data_pagamento: despesa.data_pagamento || null,
                mes: parseInt(despesa.mes),
                ano: parseInt(despesa.ano),
                categoria_id: categoriaId, // ✅ ID MAPEADO
                cartao_id: cartaoId, // ✅ ID MAPEADO
                forma_pagamento: despesa.forma_pagamento || 'dinheiro',
                parcelado: despesa.parcelado || false,
                total_parcelas: despesa.total_parcelas || null,
                parcela_atual: despesa.parcela_atual || null,
                pago: despesa.pago || false,
                observacoes: despesa.observacoes || '',
                // Campos para juros e economias
                valor_original: despesa.valor_original ? parseFloat(despesa.valor_original) : null,
                valor_total_com_juros: despesa.valor_total_com_juros ? parseFloat(despesa.valor_total_com_juros) : null,
                valor_pago: despesa.valor_pago ? parseFloat(despesa.valor_pago) : null
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
                logProgresso(sucesso, total, 'Despesas');
            } else {
                const errorData = await response.json();
                erro++;
                if (erro <= 5) logErro(`Erro ao importar despesa "${despesa.descricao}"`, errorData.message);
            }
        } catch (error) {
            erro++;
            if (erro <= 5) logErro('Erro ao importar despesa', error.message);
        }
    }

    logSucesso(`Despesas: ${sucesso}/${total} importadas, ${erro} erros, ${avisos} avisos`);
}

// ================================================================
// CRIAR ANOS
// ================================================================
async function criarAnos(anos) {
    console.log('\n📅 Criando anos no sistema...');

    if (!anos || anos.length === 0) {
        logInfo('Nenhum ano para criar');
        return;
    }

    let sucesso = 0;
    let erro = 0;

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
                sucesso++;
                logInfo(`   ✓ Ano ${ano} criado`);
            } else {
                // Ano pode já existir
                erro++;
            }
        } catch (error) {
            erro++;
        }
    }

    logSucesso(`Anos: ${sucesso} criados, ${erro} já existiam`);
}

// ================================================================
// FUNÇÃO PRINCIPAL
// ================================================================
async function importarDados() {
    try {
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║   IMPORTADOR V2 - MAPEAMENTO INTELIGENTE DE IDs            ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        logInfo(`Arquivo: ${BACKUP_FILE}`);
        logInfo(`API: ${API_URL}`);

        // ================================================================
        // 1. LER ARQUIVO DE BACKUP
        // ================================================================
        console.log('\n📂 Lendo arquivo de backup...');

        if (!fs.existsSync(BACKUP_FILE)) {
            throw new Error(`Arquivo não encontrado: ${BACKUP_FILE}`);
        }

        const backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));

        if (backupData.versao !== '2.0') {
            logErro('Versão do backup incompatível. Use o exportar-backup-v2.js');
            process.exit(1);
        }

        logSucesso('Backup carregado!');

        console.log('\n📊 RESUMO DO BACKUP:');
        console.log(`   👤 Usuário: ${backupData.usuario.nome}`);
        console.log(`   📅 Exportado em: ${backupData.data_exportacao}`);
        console.log(`   💰 Receitas: ${backupData.estatisticas.total_receitas}`);
        console.log(`   💸 Despesas: ${backupData.estatisticas.total_despesas}`);
        console.log(`   📁 Categorias: ${backupData.estatisticas.total_categorias}`);
        console.log(`   💳 Cartões: ${backupData.estatisticas.total_cartoes}`);
        console.log(`   📅 Anos: ${backupData.estatisticas.anos.join(', ')}`);

        // ================================================================
        // 2. FAZER LOGIN
        // ================================================================
        await fazerLogin();

        // ================================================================
        // 3. IMPORTAR DADOS NA ORDEM CORRETA
        // ================================================================

        // 3.1. Categorias (precisam existir antes das despesas)
        await importarCategorias(backupData.dados.categorias);

        // 3.2. Cartões (precisam existir antes das despesas)
        await importarCartoes(backupData.dados.cartoes);

        // 3.3. Receitas (independentes)
        await importarReceitas(backupData.dados.receitas);

        // 3.4. Despesas (dependem de categorias e cartões)
        await importarDespesas(backupData.dados.despesas);

        // 3.5. Anos
        await criarAnos(backupData.estatisticas.anos);

        // ================================================================
        // RESUMO FINAL
        // ================================================================
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                  IMPORTAÇÃO CONCLUÍDA!                     ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        console.log('📋 MAPEAMENTOS REALIZADOS:\n');
        console.log(`   📁 Categorias: ${Object.keys(mapaCategorias).length} mapeadas`);
        console.log(`   💳 Cartões: ${Object.keys(mapaCartoes).length} mapeados`);

        console.log('\n🔍 MAPA DE CARTÕES:');
        Object.entries(mapaCartoes).forEach(([idAntigo, idNovo]) => {
            console.log(`   Cartão ${idAntigo} → ID ${idNovo} (banco)`);
        });

        console.log('\n📝 PRÓXIMOS PASSOS:');
        console.log('   1. Acesse: https://sistema-financeiro-frontend.onrender.com');
        console.log('   2. Faça login com suas credenciais');
        console.log('   3. Verifique se todos os dados foram importados');
        console.log('   4. Confira se cartões e categorias estão vinculados corretamente');
        console.log('   5. Valide os cálculos de juros e economias\n');

    } catch (error) {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    ERRO FATAL!                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        logErro('Importação interrompida', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// ================================================================
// EXECUTAR
// ================================================================
importarDados();
