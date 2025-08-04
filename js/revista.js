// ================================================== 
// REVISTA FINANCEIRA - FIN-SIGHTS
// VERSÃO CORRIGIDA SEM INTERFERÊNCIAS
// ================================================== 

// Namespace isolado para evitar conflitos
(function() {
    'use strict';

    // Verificar se já foi inicializado
    if (window.FinSightsRevista) {
        return;
    }

    // Namespace da revista
    const FinSightsRevista = {
        artigosCarregados: false,
        categoriaAtiva: 'destaque',
        
        // Base de dados dos artigos
artigos: {
    destaque: [
        {
            id: 'reserva-emergencia',
            titulo: 'Reserva de Emergência 2025: O Guia Definitivo para Blindar Suas Finanças',
            resumo: 'Esqueça o básico. Aprenda a calcular, construir e onde investir sua reserva no cenário econômico atual para proteger seu futuro de verdade.',
            categoria: 'Planejamento',
            tempo: '9 min',
            data: '15 Jan 2025',
            icone: 'fas fa-shield-alt', // Ícone que remete a proteção
            conteudo: `
                <h3>Por que sua Reserva de Emergência é Mais Crucial que Nunca em 2025?</h3>
                <p>Em um cenário de juros ainda elevados e inflação persistente, a reserva de emergência deixou de ser um conselho financeiro para se tornar o pilar central da sua estabilidade. Ela é sua linha de defesa contra demissões, emergências médicas ou qualquer imprevisto que ameace seu patrimônio. Dados do Banco Central indicam que famílias com reserva financeira são 70% menos propensas a contrair dívidas de juros altos em momentos de crise.</p>
                
                <h3>O Cálculo Inteligente: Quanto Guardar no Cenário de 2025?</h3>
                <p>A regra dos <strong>3 a 6 meses</strong> de custo de vida essencial evoluiu. Para 2025, a recomendação de especialistas é mais específica:</p>
                <ul>
                    <li><strong>CLT (Estável):</strong> Mínimo de 6 meses. O mercado de trabalho, embora aquecido, exige uma segurança maior.</li>
                    <li><strong>Autônomos e Freelancers:</strong> De 9 a 12 meses. A flutuação de renda precisa de um colchão financeiro mais robusto para garantir tranquilidade.</li>
                    <li><strong>Servidor Público:</strong> 3 meses podem ser suficientes, dado a estabilidade.</li>
                </ul>
                <p><strong>Custo Essencial:</strong> Liste aluguel, condomínio, contas (luz, água, internet), alimentação, transporte e saúde. A soma é seu alvo mensal.</p>

                <h3>Estratégias de Guerrilha para Construir sua Reserva Rápido</h3>
                <ul>
                    <li><strong>Automatize o "Boleto do Futuro":</strong> Crie uma transferência automática para o dia do seu pagamento. Trate como uma conta fixa.</li>
                    <li><strong>Método dos Potes Digitais:</strong> Use apps de bancos digitais para separar visualmente o dinheiro da reserva, tornando o progresso mais tangível.</li>
                    <li><strong>Caça ao Dinheiro "Perdido":</strong> Direcione 100% do cashback, 13º salário, bônus e qualquer renda extra diretamente para a reserva.</li>
                    <li><strong>Detox de Assinaturas:</strong> Faça uma auditoria mensal em seus serviços de streaming, apps e clubes de assinatura. Cancele o que não for essencial.</li>
                    <li><strong>Renda Extra Focada:</strong> Dedique 2 a 3 horas semanais a um "side hustle" (freelance, aulas, etc.) com o único propósito de acelerar a reserva.</li>
                </ul>
                
                <h3>Onde Investir a Reserva para Não Perder para a Inflação?</h3>
                <p>A segurança e a liquidez são rainhas, mas a rentabilidade não pode ser ignorada. As melhores opções para 2025 são:</p>
                <ul>
                    <li><strong>Tesouro Selic:</strong> O porto seguro. Rende próximo à taxa Selic e tem liquidez diária. Ideal para a maior parte da reserva.</li>
                    <li><strong>CDBs de liquidez diária a 100%+ do CDI:</strong> Ótimos para acesso rápido. Dê preferência a bancos sólidos (cobertura do FGC).</li>
                    <li><strong>Contas Remuneradas:</strong> A praticidade em pessoa. Deixe uma parte para emergências imediatas em contas digitais que rendem diariamente.</li>
                    <li><strong>Fundos DI com taxa zero:</strong> Uma alternativa prática aos CDBs, mas atenção às taxas de administração.</li>
                </ul>
                
                <h3>Dica Pro: A Estratégia das 3 Camadas de Proteção</h3>
                <p>Divida sua reserva para otimizar: <strong>1)</strong> 1 mês de gastos em conta remunerada (acesso instantâneo); <strong>2)</strong> 3 meses em CDB de liquidez diária (resgate no mesmo dia); <strong>3)</strong> O restante no Tesouro Selic (segurança máxima para o grosso do montante).</p>
            `
        }
    ],

    basico: [
        {
            id: 'orcamento-familiar',
            titulo: 'Orçamento Familiar 2025: O Fim da Briga com o Dinheiro',
            resumo: 'Um guia prático e sem financês para você mapear suas finanças, tomar o controle e fazer o dinheiro sobrar todo mês.',
            categoria: 'Básico',
            tempo: '7 min',
            data: '12 Jan 2025',
            icone: 'fas fa-map-signs', // Ícone que remete a um mapa, um guia
            conteudo: `
                <h3>Orçamento não é prisão, é liberdade!</h3>
                <p>Encare o orçamento como o GPS da sua vida financeira. Ele não te proíbe de gastar, mas te mostra o melhor caminho para usar seu dinheiro, permitindo que você realize seus sonhos sem se endividar.</p>
                
                <h3>O Passo a Passo que Funciona (Método C.A.S.A.)</h3>
                <ul>
                    <li><strong>1. Conheça sua Renda:</strong> Liste TODAS as fontes de renda líquida (após descontos) da família. Salários, bônus, rendas de aluguel, etc.</li>
                    <li><strong>2. Anote seus Gastos:</strong> Por 30 dias, registre absolutamente tudo, do aluguel ao cafezinho. Use um app, uma planilha ou um caderno. Separe em categorias (Moradia, Transporte, Alimentação, Lazer, etc).</li>
                    <li><strong>3. Separe por Prioridade:</strong> Agora, use um método de distribuição. O <strong>50/30/20</strong> é um ótimo começo:
                        <ul>
                            <li><strong>50% para Gastos Essenciais:</strong> Moradia, contas, comida, transporte.</li>
                            <li><strong>30% para Desejos e Estilo de Vida:</strong> Lazer, restaurantes, hobbies, compras.</li>
                            <li><strong>20% para Metas Financeiras:</strong> Pagar dívidas, investir, criar a reserva de emergência.</li>
                        </ul>
                    </li>
                    <li><strong>4. Aja e Ajuste:</strong> Compare o planejado com o realizado. Onde você gastou mais? Onde pode cortar? O orçamento é um organismo vivo, ajuste-o mensalmente.</li>
                </ul>

                <h3>As Ferramentas Certas para o Trabalho</h3>
                <p>Esqueça o papel de pão. Em 2025, a tecnologia é sua aliada: <strong>Mobills, Organizze e Guiabolso (agora do PicPay)</strong> são apps que categorizam seus gastos automaticamente. Para os amantes de planilhas, o <strong>Google Sheets</strong> oferece templates gratuitos e acessíveis de qualquer lugar.</p>
                
                <h3>Dicas de Ouro para Não Desistir na Primeira Semana</h3>
                <ul>
                    <li><strong>Seja brutalmente honesto:</strong> Não adianta mentir para sua planilha.</li>
                    <li><strong>Converse com a família:</strong> O orçamento só funciona se todos estiverem a bordo.</li>
                    <li><strong>Crie uma "verba do prazer":</strong> Defina um valor mensal para gastar sem culpa. Isso evita o sentimento de privação.</li>
                    <li><strong>Comemore as pequenas vitórias:</strong> Cumpriu a meta do mês? Celebre com algo que não comprometa o próximo orçamento!</li>
                </ul>
            `
        },
        {
            id: 'controle-gastos',
            titulo: 'Cartão de Crédito em 2025: Use como um Mestre, não como um Escravo',
            resumo: 'Com os juros do rotativo nas alturas, aprenda as regras de ouro para extrair o melhor do seu cartão: milhas, pontos e poder de compra, sem dívidas.',
            categoria: 'Básico',
            tempo: '6 min',
            data: '10 Jan 2025',
            icone: 'fas fa-credit-card',
            conteudo: `
                <h3>O Duplo Poder do Cartão de Crédito</h3>
                <p>O cartão de crédito pode ser uma ferramenta incrível para acumular benefícios e organizar pagamentos, ou uma porta de entrada para a pior dívida do mercado. Com o teto dos juros do rotativo em vigor, o perigo diminuiu, mas não desapareceu. O controle é a chave.</p>
                
                <h3>As 4 Regras Inquebráveis do Uso Consciente</h3>
                <ul>
                    <li><strong>1. Fatura é Sagrada:</strong> Pagar o valor total da fatura não é uma opção, é a única regra. O pagamento mínimo é uma armadilha.</li>
                    <li><strong>2. Limite não é Salário:</strong> Seu limite deve ser visto como uma conveniência, não uma extensão da sua renda. Use no máximo 30% a 50% dele para manter um bom score de crédito.</li>
                    <li><strong>3. Minimalismo de Plástico:</strong> Cancele os cartões que você não usa. Concentre seus gastos em 1 ou 2 bons cartões para maximizar o acúmulo de pontos/milhas.</li>
                    <li><strong>4. Rastreamento em Tempo Real:</strong> Ative as notificações por push do seu app. Cada compra deve gerar um alerta no seu celular. Isso aumenta a consciência sobre os gastos.</li>
                </ul>
                
                <h3>Táticas de Controle para o Dia a Dia</h3>
                <ul>
                    <li><strong>Cartão Virtual para o Online:</strong> Sempre use cartões virtuais para compras online e assinaturas. Eles oferecem mais segurança e controle.</li>
                    <li><strong>Dia do "Débito ou Pix":</strong> Estabeleça um ou dois dias na semana para deixar o cartão de crédito em casa e usar apenas o dinheiro que você tem em conta.</li>
                    <li><strong>Check-up Semanal da Fatura:</strong> Não espere a fatura fechar. Abra o app do seu banco todo domingo e confira o extrato parcial. Isso evita surpresas.</li>
                </ul>
                
                <h3>Caiu na Cilada do Rotativo? O Plano de Fuga.</h3>
                <p>Se a dívida já existe, a ação precisa ser imediata. Entre em contato com o banco e peça para parcelar a fatura. As taxas do parcelamento são muito menores que as do rotativo. Outra opção é buscar um empréstimo pessoal com juros mais baixos para quitar o valor total e trocar uma dívida cara por uma mais barata. E o mais importante: congele o uso do cartão até a quitação.</p>
            `
        }
    ],
    investimentos: [
        {
            id: 'primeiros-investimentos',
            titulo: 'Saindo da Poupança em 2025: O Roteiro para seu Dinheiro Render Mais',
            resumo: 'Um guia passo a passo para dar seus primeiros passos no mundo dos investimentos com segurança, mesmo que você tenha apenas R$ 50 para começar.',
            categoria: 'Investimentos',
            tempo: '10 min',
            data: '14 Jan 2025',
            icone: 'fas fa-rocket', // Ícone que remete a um lançamento, um início
            conteudo: `
                <h3>O Primeiro Passo é o Mais Importante</h3>
                <p>Investir não é um bicho de sete cabeças. É simplesmente colocar seu dinheiro para trabalhar para você. Antes de tudo, <strong>tenha sua reserva de emergência montada (veja nosso artigo sobre isso!)</strong>. Investir é para objetivos, não para imprevistos.</p>
                
                <h3>Descubra seu DNA de Investidor</h3>
                <p>As corretoras te farão responder um questionário (suitability) para definir seu perfil. Seja honesto:</p>
                <ul>
                    <li><strong>Conservador:</strong> "Não quero perder dinheiro de jeito nenhum". Seu foco é em segurança máxima. Produtos ideais: Tesouro Selic, CDBs.</li>
                    <li><strong>Moderado:</strong> "Topo correr um pouco de risco para ganhar mais". Você busca um equilíbrio entre segurança e rentabilidade. Pode adicionar Fundos Multimercado e Fundos Imobiliários.</li>
                    <li><strong>Arrojado:</strong> "Busco os maiores retornos e entendo que posso ter perdas no caminho". Você está pronto para o mercado de ações e investimentos mais complexos.</li>
                </ul>
                
                <h3>Os Melhores Investimentos para Começar (Porta de Entrada)</h3>
                <ul>
                    <li><strong>Tesouro Selic:</strong> É a porta de entrada ideal. Seguro, rentável e você pode começar com pouco mais de R$ 100.</li>
                    <li><strong>CDBs que pagam 100% do CDI ou mais:</strong> São "empréstimos" que você faz ao banco. Simples de entender e com a proteção do FGC.</li>
                    <li><strong>LCI/LCA:</strong> Semelhantes aos CDBs, mas isentos de Imposto de Renda. Ótimos para turbinar a rentabilidade. Fique de olho na liquidez (prazo de resgate).</li>
                    <li><strong>Fundos de Investimento:</strong> Se não quer escolher ativos sozinho, os fundos são uma boa. Um gestor faz isso por você. Comece com Fundos DI ou de Renda Fixa com baixa taxa de administração.</li>
                </ul>
                
                <h3>O Segredo dos Ricos: Diversificação</h3>
                <p>A famosa frase "não coloque todos os ovos na mesma cesta" é a lei número 1 dos investimentos. Comece diversificando entre Tesouro Selic e um CDB, por exemplo. Conforme você estuda e ganha confiança, adicione outras classes de ativos à sua carteira.</p>
                
                <h3>Checklist do Investidor Iniciante de Sucesso</h3>
                <ul>
                    <li>✅ Tenho minha reserva de emergência.</li>
                    <li>✅ Defini meus objetivos (comprar um carro, aposentadoria, etc.).</li>
                    <li>✅ Conheço meu perfil de investidor.</li>
                    <li>✅ Comecei com pouco para aprender.</li>
                    <li>✅ Tenho o hábito de aportar (investir) todos os meses.</li>
                    <li>✅ Entendi que o poder dos juros compostos trabalha a meu favor no longo prazo.</li>
                </ul>
            `
        },
        {
            id: 'tesouro-direto',
            titulo: 'Tesouro Direto em 2025: Qual Título Escolher para Seus Objetivos?',
            resumo: 'Decifre o Tesouro Selic, Prefixado e IPCA+. Entenda qual deles é o ideal para sua reserva, sua viagem de férias ou sua aposentadoria.',
            categoria: 'Investimentos',
            tempo: '8 min',
            data: '13 Jan 2025',
            icone: 'fas fa-university',
            conteudo: `
                <h3>O que é o Tesouro Direto e por que ele é tão popular?</h3>
                <p>Investir no Tesouro Direto significa que você está "emprestando" dinheiro para o governo federal. Por isso, é considerado o investimento mais seguro do Brasil. Com cerca de R$ 30-40, você já pode se tornar um investidor. O acesso é simples, através de qualquer banco ou corretora.</p>
                
                <h3>O Trio de Ouro: Decifrando cada Título</h3>
                <p>Cada título do Tesouro funciona como uma ferramenta diferente. A escolha depende do seu objetivo:</p>
                <ul>
                    <li><strong>Tesouro Selic (Pós-fixado):</strong>
                        <ul>
                            <li><strong>Como rende?</strong> Sua rentabilidade segue a taxa básica de juros, a Selic. Se a Selic sobe, ele rende mais; se cai, rende menos.</li>
                            <li><strong>Para que serve?</strong> É o rei da <strong>reserva de emergência</strong>. Por não sofrer com a marcação a mercado, você nunca perde dinheiro ao resgatar antes do vencimento.</li>
                        </ul>
                    </li>
                    <li><strong>Tesouro Prefixado:</strong>
                        <ul>
                            <li><strong>Como rende?</strong> Você trava uma taxa de juros fixa no momento da compra (ex: 11% ao ano) e sabe exatamente quanto receberá no vencimento.</li>
                            <li><strong>Para que serve?</strong> Ideal para <strong>metas de médio prazo com data marcada</strong>, como comprar um carro em 3 anos. <strong>Atenção:</strong> se vender antes do prazo, o preço pode variar e você pode ter prejuízo.</li>
                        </ul>
                    </li>
                    <li><strong>Tesouro IPCA+ (Híbrido):</strong>
                        <ul>
                            <li><strong>Como rende?</strong> Paga a variação da inflação (IPCA) + uma taxa de juros prefixada. Garante um <strong>ganho real</strong>, sempre acima da inflação.</li>
                            <li><strong>Para que serve?</strong> Perfeito para a <strong>aposentadoria e objetivos de longuíssimo prazo</strong>. É a melhor forma de proteger seu poder de compra ao longo de décadas.</li>
                        </ul>
                    </li>
                </ul>
                
                <h3>Como Investir na Prática (4 Passos)</h3>
                <ol>
                    <li>Abra conta em uma corretora de valores (XP, Rico, NuInvest, Inter, etc.). Muitas têm taxa zero.</li>
                    <li>Transfira o dinheiro (via Pix ou TED) para sua conta na corretora.</li>
                    <li>Na plataforma da corretora, acesse a seção de "Renda Fixa" ou "Tesouro Direto".</li>
                    <li>Escolha o título, informe o valor e confirme a operação. Pronto, você é um investidor do Tesouro!</li>
                </ol>
                
                <h3>Custos que Você Precisa Conhecer</h3>
                <p>A taxa de custódia da B3 é de <strong>0,20% ao ano</strong> sobre o valor investido. Para o Tesouro Selic, há isenção para os primeiros R$ 10.000. Além disso, há o Imposto de Renda (tabela regressiva, de 22,5% a 15%) sobre os rendimentos no momento do resgate.</p>
            `
        }
    ],
    planejamento: [
        {
            id: 'aposentadoria',
            titulo: 'Aposentadoria: Como Construir seu Futuro e Não Depender do INSS',
            resumo: 'Descubra quanto você precisa juntar, onde investir e como o poder dos juros compostos pode garantir uma aposentadoria tranquila e próspera.',
            categoria: 'Planejamento',
            tempo: '12 min',
            data: '11 Jan 2025',
            icone: 'fas fa-umbrella-beach', // Ícone que remete a tranquilidade, futuro
            conteudo: `
                <h3>A Realidade Nua e Crua: O INSS Não Será Suficiente</h3>
                <p>Com as mudanças demográficas e as reformas da previdência, depender apenas do governo para se aposentar é uma aposta arriscada. Construir seu próprio plano de aposentadoria é a única forma de garantir que você manterá seu padrão de vida e realizará seus sonhos na melhor idade.</p>
                
                <h3>O Número Mágico: Quanto Eu Preciso para me Aposentar?</h3>
                <p>Uma métrica usada por planejadores financeiros é a <strong>Regra dos 300</strong>: multiplique a renda mensal que você deseja na aposentadoria por 300. Quer viver com R$ 10.000 por mês? Você precisará de um patrimônio investido de <strong>R$ 3.000.000</strong>. Esse valor, bem investido, pode gerar sua renda mensal sem que você precise tocar no principal.</p>
                
                <h3>A Estratégia do Ciclo de Vida do Investidor</h3>
                <p>Sua carteira de investimentos para aposentadoria deve mudar com o tempo:</p>
                <ul>
                    <li><strong>Até os 35 anos (Fase de Acumulação):</strong> Você tem o tempo a seu favor. É hora de tomar mais risco para buscar maiores retornos. Foque em <strong>ações de empresas sólidas, fundos de ações e investimentos no exterior</strong>.</li>
                    <li><strong>Dos 35 aos 50 anos (Fase de Consolidação):</strong> Mantenha o crescimento, mas comece a adicionar mais segurança. Equilibre a carteira com <strong>Fundos Imobiliários (FIIs), Tesouro IPCA+ e bons fundos multimercado</strong>.</li>
                    <li><strong>A partir dos 50 anos (Fase de Preservação):</strong> A prioridade é proteger o que você construiu. Migre gradualmente a maior parte do patrimônio para investimentos conservadores, como <strong>Tesouro IPCA+, CDBs e LCI/LCAs de bancos de primeira linha</strong>.</li>
                </ul>
                
                <h3>As Ferramentas Certas para a Aposentadoria</h3>
                <ul>
                    <li><strong>Tesouro RendA+ e Educa+:</strong> Novos títulos do Tesouro Direto criados especificamente para complementar a aposentadoria e custear a educação, pagando uma renda mensal por 20 anos.</li>
                    <li><strong>Previdência Privada (PGBL/VGBL):</strong> Pode ser interessante pelos benefícios fiscais (PGBL para quem faz a declaração completa do IR) e pela ausência do come-cotas. Pesquise fundos com baixas taxas de administração.</li>
                    <li><strong>Fundos Imobiliários (FIIs):</strong> Ótimos para gerar uma renda passiva mensal com os aluguéis distribuídos.</li>
                </ul>
                
                <h3>O Poder do Hábito: Comece Agora!</h3>
                <p>O maior segredo da aposentadoria é o <strong>tempo e a constância</strong>. É melhor começar com R$ 100 por mês aos 25 anos do que com R$ 1.000 aos 45. O poder dos juros compostos fará seu dinheiro crescer exponencialmente. Comece hoje.</p>
            `
        }
    ],
    dicas: [
        {
            id: 'economia-domestica',
            titulo: '10 Hacks de Economia Doméstica para Fazer o Salário Esticar em 2025',
            resumo: 'Pequenas mudanças de hábito com grande impacto no bolso. Descubra como economizar centenas de reais por mês sem sacrificar sua qualidade de vida.',
            categoria: 'Dicas',
            tempo: '5 min',
            data: '09 Jan 2025',
            icone: 'fas fa-lightbulb', // Ícone que remete a uma ideia, uma dica
            conteudo: `
                <h3>Economizar não é sobre se privar, é sobre ser mais esperto que seus gastos.</h3>
                <ol>
                    <li><strong>Planeje Refeições (Meal Prep):</strong> Dedique 2h do seu domingo para planejar e preparar as bases das refeições da semana. Isso evita o desperdício de alimentos e a tentação do delivery. Economia potencial: R$ 300-500/mês.</li>
                    <li><strong>Lista de Compras Reversa:</strong> Antes de ir ao mercado, fotografe sua geladeira e despensa. Crie a lista baseada no que falta, não no que você "acha" que precisa.</li>
                    <li><strong>A Regra das 24 Horas:</strong> Viu algo que quer comprar por impulso (online ou na loja)? Adicione ao carrinho ou tire uma foto e espere 24 horas. Na maioria das vezes, a vontade passa.</li>
                    <li><strong>Auditoria Anual de Contratos:</strong> Uma vez por ano, ligue para sua operadora de internet/celular e renegocie seu plano. Pesquise a concorrência antes. A ameaça de cancelamento quase sempre gera uma oferta melhor.</li>
                    <li><strong>Energia Inteligente:</strong> Troque todas as lâmpadas por LED. Tire da tomada aparelhos que não estão em uso (o modo stand-by consome energia). Banhos 5 minutos mais curtos podem reduzir a conta de luz em até 10%.</li>
                    <li><strong>O Poder dos Genéricos e Marcas Próprias:</strong> Em medicamentos, a eficácia é a mesma. Em produtos de limpeza e alimentos básicos, a qualidade das marcas próprias de supermercado costuma ser excelente por um preço bem menor.</li>
                    <li><strong>Transporte Multimodal:</strong> Intercale o uso de carro/app com transporte público, bicicleta ou caminhada. O "dia do rodízio" pode ser o dia de economizar com combustível e estacionamento.</li>
                    <li><strong>Cashback é o Novo Desconto:</strong> Use apps como Méliuz, Ame Digital e os programas do seu próprio banco/cartão. Cada compra pode gerar um pequeno retorno que, somado, faz diferença.</li>
                    <li><strong>Faça Você Mesmo (DIY):</strong> Pequenos reparos em casa, presentes artesanais ou até mesmo a produção de seus próprios produtos de limpeza podem gerar uma economia surpreendente.</li>
                    <li><strong>Lazer Inteligente:</strong> Troque um jantar caro por um piquenique no parque. Procure por programações culturais gratuitas na sua cidade. Chame os amigos para uma noite de jogos em casa em vez de um bar.</li>
                </ol>
                <br>
                <h3>O Teste do Cafezinho:</h3>
                <p>Um café especial de R$ 10, cinco vezes por semana, custa <strong>R$ 2.600 por ano</strong>. O que você poderia fazer com esse dinheiro? Pequenas mudanças criam grandes resultados.</p>
            `
        }
    ],
    noticias: [
        {
            id: 'economia-2025',
            titulo: 'Cenário Econômico 2025: Como Proteger e Otimizar seu Dinheiro',
            resumo: 'Análise das projeções para inflação, Selic e crescimento, e o que isso significa na prática para seus investimentos, seu poder de compra e seu planejamento.',
            categoria: 'Notícias',
            tempo: '6 min',
            data: '16 Jan 2025',
            icone: 'fas fa-chart-area',
            conteudo: `
                <h3>O Brasil em 2025: Desafios e Oportunidades</h3>
                <p>O cenário econômico para 2025 é de otimismo moderado, mas exige cautela. A luta contra a inflação continua sendo a prioridade do Banco Central, o que impacta diretamente a vida de todos os brasileiros.</p>
                
                <h3>Taxa Selic: O que Esperar?</h3>
                <p>As projeções do mercado, segundo o último Boletim Focus, apontam para uma <strong>manutenção da Taxa Selic em um patamar de um dígito alto, em torno de 9,0% a 9,5% ao ano</strong>. Isso significa que a renda fixa continua muito atrativa, mas o ciclo de cortes agressivos pode ter chegado ao fim, dependendo do controle inflacionário.</p>
                
                <h3>Inflação (IPCA): O Grande Desafio</h3>
                <p>A meta de inflação para 2025 é de <strong>3,0%</strong>, com intervalo de tolerância de 1,5 ponto percentual (de 1,5% a 4,5%). A expectativa do mercado é que a inflação fique próxima ao teto da meta, pressionada por fatores internos (gastos do governo) e externos (cenário internacional). Proteger seu dinheiro da inflação é a tarefa número um.</p>
                
                <h3>PIB e Mercado de Trabalho</h3>
                <p>Espera-se um crescimento do Produto Interno Bruto (PIB) mais modesto, em torno de <strong>1,5% a 2,0%</strong>. A taxa de desemprego deve se manter em patamares baixos, mas com um mercado de trabalho que exige cada vez mais qualificação. Setores de tecnologia, agronegócio e energia verde devem continuar liderando a geração de vagas.</p>
                
                <h3>Como o Investidor Deve se Posicionar?</h3>
                <ul>
                    <li><strong>Renda Fixa é Rainha:</strong> Com a Selic alta, títulos como <strong>Tesouro Selic, CDBs e LCIs/LCAs</strong> continuam sendo excelentes para segurança e rentabilidade.</li>
                    <li><strong>Proteção Contra Inflação:</strong> Aumente a exposição a títulos como o <strong>Tesouro IPCA+</strong> para garantir ganho real no longo prazo.</li>
                    <li><strong>Bolsa com Cautela:</strong> A bolsa de valores (Ibovespa) pode apresentar boas oportunidades, mas a volatilidade deve continuar. Invista em <strong>empresas de setores sólidos e boas pagadoras de dividendos</strong>.</li>
                    <li><strong>Dolarização da Carteira:</strong> Ter uma pequena parte (5% a 15%) de seus investimentos em ativos dolarizados (ETFs internacionais, BDRs ou fundos cambiais) é uma estratégia inteligente para se proteger de crises locais.</li>
                    <li><strong>Educação Financeira:</strong> O melhor investimento em um cenário incerto é o conhecimento. Entender onde seu dinheiro está aplicado te dá tranquilidade para navegar por qualquer tempestade.</li>
                </ul>
            `
        }
    ]
},

        // Dicas rápidas do dia
        dicasRapidas: [
            {
                titulo: "💡 Regra dos 30 Dias",
                conteudo: "Antes de comprar algo não essencial acima de R$ 100, espere 30 dias. Você descobrirá que muitas vezes não precisava daquilo."
            },
            {
                titulo: "📱 Apps de Desconto",
                conteudo: "Use aplicativos como Méliuz, Picpay e Ame Digital para cashback em compras online e físicas."
            },
            {
                titulo: "🏦 Negocie Tarifas",
                conteudo: "Ligue para seu banco anualmente e negocie tarifas. Clientes antigos frequentemente conseguem descontos."
            },
            {
                titulo: "⚡ Energia Elétrica",
                conteudo: "Trocar lâmpadas por LED pode reduzir até 80% do consumo de energia na iluminação."
            },
            {
                titulo: "🚗 Combustível",
                conteudo: "Use aplicativos como Waze para encontrar postos mais baratos e abasteça pela manhã quando o combustível está mais denso."
            },
            {
                titulo: "🛒 Lista de Compras",
                conteudo: "Fazer lista de compras pode reduzir gastos em até 23%, evitando compras por impulso."
            }
        ],

        // Inicialização da revista
        inicializar: function() {
            if (this.artigosCarregados) return;
            
            this.setupEventListeners();
            this.carregarArtigos('destaque');
            this.carregarDicasRapidas();
            this.artigosCarregados = true;
        },

        // Configurar event listeners SEM CONFLITOS
        setupEventListeners: function() {
            const self = this;
            
            // Usar delegação de eventos para evitar conflitos
            const revistaSection = document.getElementById('fin-sights-section');
            if (!revistaSection) return;

            // Navegação por categorias - ESCOPO LIMITADO À REVISTA
            revistaSection.addEventListener('click', function(e) {
                const navBtn = e.target.closest('.nav-categoria');
                if (navBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const categoria = navBtn.dataset.categoria;
                    
                    // Atualizar navegação ativa APENAS dentro da revista
                    revistaSection.querySelectorAll('.nav-categoria').forEach(b => b.classList.remove('active'));
                    navBtn.classList.add('active');
                    
                    // Carregar artigos da categoria
                    self.categoriaAtiva = categoria;
                    self.carregarArtigos(categoria);
                }
            });

            // Botões de ler artigo - ESCOPO LIMITADO À REVISTA
            revistaSection.addEventListener('click', function(e) {
                const btnLer = e.target.closest('.btn-ler-artigo');
                if (btnLer) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const artigoId = btnLer.dataset.artigo;
                    self.abrirArtigoCompleto(artigoId);
                }
                
                // Cards de artigo
                const card = e.target.closest('.artigo-card');
                if (card) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const artigoId = card.dataset.artigo;
                    self.abrirArtigoCompleto(artigoId);
                }
                
                // Calculadoras
                const calcCard = e.target.closest('.calculadora-card');
                if (calcCard) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const calcType = calcCard.dataset.calc;
                    self.abrirCalculadora(calcType);
                }
            });

            // Fechar modais - APENAS MODAIS DA REVISTA
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('close-artigo')) {
                    const modal = document.getElementById('modal-artigo');
                    if (modal) modal.style.display = 'none';
                }
                
                if (e.target.classList.contains('close-calc')) {
                    const modal = document.getElementById('modal-calculadora');
                    if (modal) modal.style.display = 'none';
                }
                
                // Fechar ao clicar fora do modal - APENAS MODAIS DA REVISTA
                if (e.target.classList.contains('modal-artigo')) {
                    e.target.style.display = 'none';
                }
                
                if (e.target.classList.contains('modal-calculadora')) {
                    e.target.style.display = 'none';
                }
            });

            // Ações dos artigos - ESCOPO LIMITADO À REVISTA
            revistaSection.addEventListener('click', function(e) {
                if (e.target.closest('.btn-compartilhar')) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.compartilharArtigo();
                }
                
                if (e.target.closest('.btn-favoritar')) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.favoritarArtigo();
                }
                
                if (e.target.closest('.btn-imprimir')) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.imprimirArtigo();
                }
            });
        },

        // Carregar artigos por categoria
        carregarArtigos: function(categoria) {
            const artigosGrid = document.getElementById('artigos-grid');
            if (!artigosGrid) return;
            
            artigosGrid.innerHTML = '<div class="loading-artigos"><i class="fas fa-spinner"></i><p>Carregando artigos...</p></div>';
            
            const self = this;
            setTimeout(() => {
                const artigosDaCategoria = self.artigos[categoria] || [];
                
                if (artigosDaCategoria.length === 0) {
                    artigosGrid.innerHTML = `
                        <div class="loading-artigos">
                            <i class="fas fa-info-circle"></i>
                            <p>Nenhum artigo encontrado nesta categoria.</p>
                            <p>Novos conteúdos serão adicionados em breve!</p>
                        </div>
                    `;
                    return;
                }
                
                artigosGrid.innerHTML = '';
                
                artigosDaCategoria.forEach(artigo => {
                    const artigoCard = document.createElement('div');
                    artigoCard.className = 'artigo-card';
                    artigoCard.dataset.artigo = artigo.id;
                    
                    artigoCard.innerHTML = `
                        <div class="artigo-card-img">
                            <i class="${artigo.icone}"></i>
                        </div>
                        <div class="artigo-card-content">
                            <h3 class="artigo-card-titulo">${artigo.titulo}</h3>
                            <p class="artigo-card-resumo">${artigo.resumo}</p>
                            <div class="artigo-card-meta">
                                <span><i class="fas fa-clock"></i> ${artigo.tempo}</span>
                                <span><i class="fas fa-tag"></i> ${artigo.categoria}</span>
                            </div>
                        </div>
                    `;
                    
                    artigosGrid.appendChild(artigoCard);
                });
            }, 500);
        },

        // Carregar dicas rápidas
        carregarDicasRapidas: function() {
            const dicasContainer = document.getElementById('dicas-container');
            if (!dicasContainer) return;
            
            // Selecionar 3 dicas aleatórias
            const dicasSelecionadas = this.dicasRapidas.sort(() => 0.5 - Math.random()).slice(0, 3);
            
            dicasContainer.innerHTML = '';
            
            dicasSelecionadas.forEach(dica => {
                const dicaCard = document.createElement('div');
                dicaCard.className = 'dica-card';
                
                dicaCard.innerHTML = `
                    <div class="dica-titulo">${dica.titulo}</div>
                    <div class="dica-conteudo">${dica.conteudo}</div>
                `;
                
                dicasContainer.appendChild(dicaCard);
            });
        },

        // Abrir artigo completo
        abrirArtigoCompleto: function(artigoId) {
            // Encontrar o artigo
            let artigoEncontrado = null;
            
            for (const categoria in this.artigos) {
                const artigo = this.artigos[categoria].find(a => a.id === artigoId);
                if (artigo) {
                    artigoEncontrado = artigo;
                    break;
                }
            }
            
            if (!artigoEncontrado) {
                alert('Artigo não encontrado!');
                return;
            }
            
            // Preencher modal
            const modal = document.getElementById('modal-artigo');
            if (!modal) return;
            
            const titulo = document.getElementById('modal-artigo-titulo');
            const tempo = document.getElementById('modal-artigo-tempo');
            const categoria = document.getElementById('modal-artigo-categoria');
            const data = document.getElementById('modal-artigo-data');
            const imagem = document.getElementById('modal-artigo-imagem');
            const conteudo = document.getElementById('modal-artigo-conteudo');
            
            if (titulo) titulo.textContent = artigoEncontrado.titulo;
            if (tempo) tempo.innerHTML = `<i class="fas fa-clock"></i> ${artigoEncontrado.tempo} de leitura`;
            if (categoria) categoria.innerHTML = `<i class="fas fa-tag"></i> ${artigoEncontrado.categoria}`;
            if (data) data.innerHTML = `<i class="fas fa-calendar"></i> ${artigoEncontrado.data}`;
            if (imagem) imagem.innerHTML = `<i class="${artigoEncontrado.icone}"></i>`;
            if (conteudo) conteudo.innerHTML = artigoEncontrado.conteudo;
            
            // Mostrar modal
            modal.style.display = 'block';
        },

        // Calculadoras financeiras
        abrirCalculadora: function(tipo) {
            const modal = document.getElementById('modal-calculadora');
            const titulo = document.getElementById('modal-calc-titulo');
            const corpo = document.getElementById('modal-calc-body');
            
            if (!modal || !titulo || !corpo) return;
            
            switch(tipo) {
                case 'juros-compostos':
                    titulo.textContent = 'Calculadora de Juros Compostos';
                    corpo.innerHTML = this.criarCalculadoraJurosCompostos();
                    break;
                    
                case 'financiamento':
                    titulo.textContent = 'Simulador de Financiamento';
                    corpo.innerHTML = this.criarCalculadoraFinanciamento();
                    break;
                    
                case 'aposentadoria':
                    titulo.textContent = 'Planejamento de Aposentadoria';
                    corpo.innerHTML = this.criarCalculadoraAposentadoria();
                    break;
                    
                default:
                    corpo.innerHTML = '<p>Calculadora em desenvolvimento...</p>';
            }
            
            modal.style.display = 'block';
        },

        // Criar calculadora de juros compostos
        criarCalculadoraJurosCompostos: function() {
            return `
                <div class="calc-form">
                    <div class="calc-field">
                        <label for="valor-inicial">Valor Inicial (R$):</label>
                        <input type="number" id="valor-inicial" placeholder="10000" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="aporte-mensal">Aporte Mensal (R$):</label>
                        <input type="number" id="aporte-mensal" placeholder="500" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="taxa-juros">Taxa de Juros (% ao ano):</label>
                        <input type="number" id="taxa-juros" placeholder="12" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="periodo">Período (anos):</label>
                        <input type="number" id="periodo" placeholder="10" min="1" max="50">
                    </div>
                    
                    <button class="calc-button" onclick="FinSightsRevista.calcularJurosCompostos()">
                        <i class="fas fa-calculator"></i> Calcular
                    </button>
                </div>
                
                <div id="resultado-juros" style="display: none;"></div>
            `;
        },

        // Criar calculadora de financiamento
        criarCalculadoraFinanciamento: function() {
            return `
                <div class="calc-form">
                    <div class="calc-field">
                        <label for="valor-financiado">Valor a Financiar (R$):</label>
                        <input type="number" id="valor-financiado" placeholder="200000" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="taxa-financiamento">Taxa de Juros (% ao mês):</label>
                        <input type="number" id="taxa-financiamento" placeholder="0.8" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="prazo-financiamento">Prazo (meses):</label>
                        <input type="number" id="prazo-financiamento" placeholder="360" min="1" max="600">
                    </div>
                    
                    <div class="calc-field">
                        <label for="sistema-financiamento">Sistema:</label>
                        <select id="sistema-financiamento">
                            <option value="price">PRICE (Parcelas Fixas)</option>
                            <option value="sac">SAC (Parcelas Decrescentes)</option>
                        </select>
                    </div>
                    
                    <button class="calc-button" onclick="FinSightsRevista.calcularFinanciamento()">
                        <i class="fas fa-home"></i> Calcular Financiamento
                    </button>
                </div>
                
                <div id="resultado-financiamento" style="display: none;"></div>
            `;
        },

        // Criar calculadora de aposentadoria
        criarCalculadoraAposentadoria: function() {
            return `
                <div class="calc-form">
                    <div class="calc-field">
                        <label for="idade-atual">Idade Atual:</label>
                        <input type="number" id="idade-atual" placeholder="30" min="18" max="80">
                    </div>
                    
                    <div class="calc-field">
                        <label for="idade-aposentadoria">Idade Desejada para Aposentadoria:</label>
                        <input type="number" id="idade-aposentadoria" placeholder="60" min="50" max="80">
                    </div>
                    
                    <div class="calc-field">
                        <label for="renda-desejada">Renda Mensal Desejada (R$):</label>
                        <input type="number" id="renda-desejada" placeholder="5000" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="patrimonio-atual">Patrimônio Atual (R$):</label>
                        <input type="number" id="patrimonio-atual" placeholder="50000" min="0" step="0.01">
                    </div>
                    
                    <div class="calc-field">
                        <label for="rentabilidade">Rentabilidade Esperada (% ao ano):</label>
                        <input type="number" id="rentabilidade" placeholder="8" min="0" step="0.01">
                    </div>
                    
                    <button class="calc-button" onclick="FinSightsRevista.calcularAposentadoria()">
                        <i class="fas fa-user-clock"></i> Calcular Aposentadoria
                    </button>
                </div>
                
                <div id="resultado-aposentadoria" style="display: none;"></div>
            `;
        },

        // Funções de cálculo
        calcularJurosCompostos: function() {
            const valorInicial = parseFloat(document.getElementById('valor-inicial').value) || 0;
            const aporteMensal = parseFloat(document.getElementById('aporte-mensal').value) || 0;
            const taxaAnual = parseFloat(document.getElementById('taxa-juros').value) || 0;
            const periodo = parseInt(document.getElementById('periodo').value) || 0;
            
            if (periodo === 0) {
                alert('Por favor, informe um período válido.');
                return;
            }
            
            const taxaMensal = taxaAnual / 100 / 12;
            const meses = periodo * 12;
            
            // Cálculo do montante final
            let montanteFinal = valorInicial * Math.pow(1 + taxaMensal, meses);
            
            // Adicionar aportes mensais
            if (aporteMensal > 0) {
                const fatorAporte = ((Math.pow(1 + taxaMensal, meses) - 1) / taxaMensal);
                montanteFinal += aporteMensal * fatorAporte;
            }
            
            const totalAportado = valorInicial + (aporteMensal * meses);
            const rendimento = montanteFinal - totalAportado;
            const percentualRendimento = ((rendimento / totalAportado) * 100).toFixed(2);
            
            const resultadoDiv = document.getElementById('resultado-juros');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = `
                <div class="calc-resultado">
                    <div class="resultado-titulo">💰 Resultado da Simulação</div>
                    <div class="resultado-valor">Valor Final: ${this.formatarMoeda(montanteFinal)}</div>
                    <div class="resultado-detalhes">
                        <p><strong>Total Investido:</strong> ${this.formatarMoeda(totalAportado)}</p>
                        <p><strong>Rendimento:</strong> ${this.formatarMoeda(rendimento)} (${percentualRendimento}%)</p>
                        <p><strong>Período:</strong> ${periodo} anos (${meses} meses)</p>
                        <p><strong>Taxa:</strong> ${taxaAnual}% ao ano</p>
                    </div>
                </div>
            `;
        },

        calcularFinanciamento: function() {
            const valorFinanciado = parseFloat(document.getElementById('valor-financiado').value) || 0;
            const taxaMensal = parseFloat(document.getElementById('taxa-financiamento').value) / 100 || 0;
            const prazo = parseInt(document.getElementById('prazo-financiamento').value) || 0;
            const sistema = document.getElementById('sistema-financiamento').value;
            
            if (valorFinanciado === 0 || prazo === 0) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }
            
            let resultadoHTML = '';
            
            if (sistema === 'price') {
                // Sistema PRICE (Parcelas Fixas)
                const coeficiente = Math.pow(1 + taxaMensal, prazo);
                const parcela = valorFinanciado * (taxaMensal * coeficiente) / (coeficiente - 1);
                const totalPago = parcela * prazo;
                const totalJuros = totalPago - valorFinanciado;
                
                resultadoHTML = `
                    <div class="calc-resultado">
                        <div class="resultado-titulo">🏠 Financiamento PRICE</div>
                        <div class="resultado-valor">Parcela: ${this.formatarMoeda(parcela)}</div>
                        <div class="resultado-detalhes">
                            <p><strong>Valor Financiado:</strong> ${this.formatarMoeda(valorFinanciado)}</p>
                            <p><strong>Total a Pagar:</strong> ${this.formatarMoeda(totalPago)}</p>
                            <p><strong>Total de Juros:</strong> ${this.formatarMoeda(totalJuros)}</p>
                            <p><strong>Prazo:</strong> ${prazo} meses</p>
                            <p><strong>Taxa:</strong> ${(taxaMensal * 100).toFixed(2)}% ao mês</p>
                        </div>
                    </div>
                `;
            } else {
                // Sistema SAC (Parcelas Decrescentes)
                const amortizacao = valorFinanciado / prazo;
                const primeiraParcela = amortizacao + (valorFinanciado * taxaMensal);
                const ultimaParcela = amortizacao + (amortizacao * taxaMensal);
                const totalJuros = valorFinanciado * taxaMensal * (prazo + 1) / 2;
                const totalPago = valorFinanciado + totalJuros;
                
                resultadoHTML = `
                    <div class="calc-resultado">
                        <div class="resultado-titulo">🏠 Financiamento SAC</div>
                        <div class="resultado-valor">1ª Parcela: ${this.formatarMoeda(primeiraParcela)}</div>
                        <div class="resultado-detalhes">
                            <p><strong>Última Parcela:</strong> ${this.formatarMoeda(ultimaParcela)}</p>
                            <p><strong>Amortização:</strong> ${this.formatarMoeda(amortizacao)}</p>
                            <p><strong>Total a Pagar:</strong> ${this.formatarMoeda(totalPago)}</p>
                            <p><strong>Total de Juros:</strong> ${this.formatarMoeda(totalJuros)}</p>
                            <p><strong>Prazo:</strong> ${prazo} meses</p>
                        </div>
                    </div>
                `;
            }
            
            const resultadoDiv = document.getElementById('resultado-financiamento');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = resultadoHTML;
        },

        calcularAposentadoria: function() {
            const idadeAtual = parseInt(document.getElementById('idade-atual').value) || 0;
            const idadeAposentadoria = parseInt(document.getElementById('idade-aposentadoria').value) || 0;
            const rendaDesejada = parseFloat(document.getElementById('renda-desejada').value) || 0;
            const patrimonioAtual = parseFloat(document.getElementById('patrimonio-atual').value) || 0;
            const rentabilidadeAnual = parseFloat(document.getElementById('rentabilidade').value) / 100 || 0;
            
            if (idadeAtual >= idadeAposentadoria) {
                alert('A idade de aposentadoria deve ser maior que a idade atual.');
                return;
            }
            
            const anosParaAposentadoria = idadeAposentadoria - idadeAtual;
            const rentabilidadeMensal = rentabilidadeAnual / 12;
            
            // Patrimônio necessário (usando regra dos 4%)
            const patrimonioNecessario = rendaDesejada * 12 / 0.04;
            
            // Valor que o patrimônio atual vai render
            const patrimonioFuturo = patrimonioAtual * Math.pow(1 + rentabilidadeAnual, anosParaAposentadoria);
            
            // Valor que ainda precisa acumular
            const valorFaltante = Math.max(0, patrimonioNecessario - patrimonioFuturo);
            
            // Aporte mensal necessário
            let aporteMensal = 0;
            if (valorFaltante > 0) {
                const meses = anosParaAposentadoria * 12;
                aporteMensal = valorFaltante / (((Math.pow(1 + rentabilidadeMensal, meses) - 1) / rentabilidadeMensal));
            }
            
            const resultadoDiv = document.getElementById('resultado-aposentadoria');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = `
                <div class="calc-resultado">
                    <div class="resultado-titulo">👴 Planejamento de Aposentadoria</div>
                    <div class="resultado-valor">Aporte Mensal: ${this.formatarMoeda(aporteMensal)}</div>
                    <div class="resultado-detalhes">
                        <p><strong>Patrimônio Necessário:</strong> ${this.formatarMoeda(patrimonioNecessario)}</p>
                        <p><strong>Patrimônio Atual Futuro:</strong> ${this.formatarMoeda(patrimonioFuturo)}</p>
                        <p><strong>Ainda Precisa Acumular:</strong> ${this.formatarMoeda(valorFaltante)}</p>
                        <p><strong>Anos para Aposentadoria:</strong> ${anosParaAposentadoria} anos</p>
                        <p><strong>Renda Mensal Desejada:</strong> ${this.formatarMoeda(rendaDesejada)}</p>
                        <p><em>*Cálculo baseado na regra dos 4% de retirada anual</em></p>
                    </div>
                </div>
            `;
        },

        // Função utilitária para formatar moeda
        formatarMoeda: function(valor) {
            return valor.toLocaleString('pt-BR', { 
                style: 'currency', 
                currency: 'BRL' 
            });
        },

        // Ações dos artigos
        compartilharArtigo: function() {
            const titulo = document.getElementById('modal-artigo-titulo');
            const tituloTexto = titulo ? titulo.textContent : 'Artigo CanalEconomia';
            
            if (navigator.share) {
                navigator.share({
                    title: tituloTexto,
                    text: 'Confira este artigo do CanalEconomia!',
                    url: window.location.href
                });
            } else {
                // Fallback para navegadores sem suporte ao Web Share API
                const url = window.location.href;
                const texto = `Confira este artigo: "${tituloTexto}" - ${url}`;
                
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(texto).then(() => {
                        alert('Link copiado para a área de transferência!');
                    });
                } else {
                    prompt('Copie o link abaixo:', texto);
                }
            }
        },

        favoritarArtigo: function() {
            const titulo = document.getElementById('modal-artigo-titulo');
            const tituloTexto = titulo ? titulo.textContent : 'Artigo';
            
            // Salvar no localStorage com namespace específico
            let favoritos = JSON.parse(localStorage.getItem('finSights-favoritos')) || [];
            
            if (!favoritos.includes(tituloTexto)) {
                favoritos.push(tituloTexto);
                localStorage.setItem('finSights-favoritos', JSON.stringify(favoritos));
                alert('Artigo adicionado aos favoritos!');
            } else {
                alert('Este artigo já está nos seus favoritos!');
            }
        },

        imprimirArtigo: function() {
            const conteudo = document.getElementById('modal-artigo-conteudo');
            const titulo = document.getElementById('modal-artigo-titulo');
            
            const conteudoTexto = conteudo ? conteudo.innerHTML : '';
            const tituloTexto = titulo ? titulo.textContent : 'Artigo';
            
            const janelaImpressao = window.open('', '_blank');
            janelaImpressao.document.write(`
                <html>
                <head>
                    <title>${tituloTexto}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                        h1 { color: #333; border-bottom: 2px solid #4ecdc4; padding-bottom: 10px; }
                        h3 { color: #4ecdc4; margin-top: 25px; }
                        p { margin-bottom: 15px; }
                        ul { margin: 15px 0; padding-left: 25px; }
                        li { margin-bottom: 8px; }
                        .meta { color: #666; font-size: 0.9em; margin-bottom: 20px; }
                        @media print { body { margin: 20px; } }
                    </style>
                </head>
                <body>
                    <h1>${tituloTexto}</h1>
                    <div class="meta">Fonte: CanalEconomia - Revista Financeira</div>
                    ${conteudoTexto}
                </body>
                </html>
            `);
            
            janelaImpressao.document.close();
            janelaImpressao.focus();
            janelaImpressao.print();
        }
    };

    // Função global para ser chamada quando a revista é ativada
    window.onRevistaActivated = function() {
        FinSightsRevista.inicializar();
    };

    // Exposição controlada do namespace
    window.FinSightsRevista = FinSightsRevista;

    // Auto-inicializar se a seção já estiver ativa
    document.addEventListener('DOMContentLoaded', function() {
        const revistaSection = document.getElementById('fin-sights-section');
        if (revistaSection && revistaSection.classList.contains('active')) {
            setTimeout(() => FinSightsRevista.inicializar(), 100);
        }
    });

})();