// Termos de Uso e Política de Privacidade, com as soluções FINGERENCE Finanças
// e FINGERENCE Licitações (plano .plans/site-novo.md; cofre, sanções e papéis no
// tratamento de dados: .plans/licitacoes-9-privacidade-e-termos.md). Aparecem no
// cadastro (TermosModal), no aviso de cookies e nas páginas /termos e /privacidade.
// Formato: "**título**" vira título, "• " vira item, o resto vira parágrafo.
// As regras de assinatura seguem o backend: apps/finance/api/src/routes/plans.ts
// (Finanças) e apps/tenders/api/src/routes/billing.ts (Licitações).
//
// O texto afirma o que o produto faz. Se um destes comportamentos mudar, revise a
// seção indicada (T = Termos, P = Política de Privacidade):
// • Cofre: arquivos em armazenamento privado, abertos só por link temporário de
//   poucos minutos; pessoas e documentos pessoais só para o titular da conta; CPF
//   fora dos logs; cada conta só vê os próprios dados (P7).
// • Sanções: o CPF e o CNPJ consultados vão ao Portal da Transparência; o resultado
//   guardado não repete CPF nem nome do sancionado; trocar o CPF ou apagar a pessoa
//   apaga as consultas (T6, T7, P2, P5 e P8).
// • Retenção de até 90 dias depois do encerramento da conta, feita à mão, inclusive
//   os arquivos do cofre no R2 (T12 e P8).
// • Fornecedores que recebem dado pessoal: BrasilAPI, Portal da Transparência,
//   Mercado Pago, EmailJS e Google (P5).
// • Hospedagem: servidor e banco de Licitações nos Estados Unidos (Oregon) e servidor
//   de Finanças na Alemanha (Frankfurt) (P6).
// • Os documentos do cofre não passam por IA (P5): o item 19 do ESCOPO refaz esta
//   frase.

export const TERMS_CONTENT = `
**TERMOS DE USO — FINGERENCE**
Última atualização: novembro de 2026

**1. OBJETO E ACEITAÇÃO**
Estes Termos de Uso regulam o acesso e a utilização do FINGERENCE ("FINGERENCE", "Plataforma") e das suas soluções, FINGERENCE Finanças e FINGERENCE Licitações, disponibilizados por seus mantenedores ("Nós"). Ao criar uma conta, acessar ou utilizar a Plataforma, você ("Usuário") declara ter lido, compreendido e concordado integralmente com estes Termos. Caso não concorde, não utilize a Plataforma.

**2. DESCRIÇÃO DO SERVIÇO**
A Plataforma tem duas soluções, contratadas separadamente:
• FINGERENCE Finanças: gestão financeira pessoal e empresarial, com controle de receitas, despesas, cartões de crédito, relatórios e contas separadas. É uma ferramenta de organização financeira e não constitui instituição financeira, prestadora de serviços de pagamento, assessoria de investimentos nem atividade regulada pelo Banco Central do Brasil.
• FINGERENCE Licitações: busca e acompanhamento de licitações e contratos públicos a partir dos dados abertos do Portal Nacional de Contratações Públicas (PNCP) e do Portal de Compras do Governo Federal (Compras.gov.br), com buscas salvas, concorrentes acompanhados, avisos de editais e contratos e lembretes de prazo dentro da Plataforma. Também reúne o perfil da empresa, o cofre de documentos de habilitação e a consulta a cadastros federais de sanções.
Cada solução tem cadastro de teste e assinatura próprios.

**3. ELEGIBILIDADE E CADASTRO**
O acesso à Plataforma é destinado a pessoas físicas maiores de 18 anos e pessoas jurídicas regularmente constituídas. O Usuário é responsável pela veracidade das informações fornecidas no cadastro e pela guarda de suas credenciais de acesso. É vedada a criação de múltiplas contas com a finalidade de burlar restrições da Plataforma. O titular de uma conta que cadastra outros usuários responde pelo uso que eles fazem da Plataforma.

**4. OBRIGAÇÕES DO USUÁRIO**
Ao utilizar a Plataforma, o Usuário compromete-se a:
• Fornecer informações verdadeiras, precisas e atualizadas no cadastro.
• Manter a confidencialidade de sua senha e não compartilhar o acesso com terceiros.
• Utilizar a Plataforma exclusivamente para fins lícitos, de acordo com a finalidade de cada solução.
• Notificar imediatamente qualquer acesso não autorizado à sua conta.
• Manter atualizados os dados de contato cadastrados.

**5. USO ACEITÁVEL**
É expressamente vedado ao Usuário:
• Tentar burlar, desabilitar ou comprometer mecanismos de segurança da Plataforma.
• Realizar engenharia reversa, decompilar ou extrair o código-fonte da Plataforma.
• Utilizar a Plataforma para atividades ilícitas, fraudulentas ou que violem direitos de terceiros.
• Inserir dados falsos, maliciosos ou que infrinjam direitos de privacidade de terceiros.
• Guardar no cofre ou consultar nas sanções pessoas sem autorização ou base legal para tratar os dados delas.
• Revender, sublicenciar ou ceder o acesso à Plataforma sem autorização expressa.
• Extrair dados da Plataforma em massa, por meios automatizados.
• Sobrecarregar intencionalmente a infraestrutura da Plataforma.

**6. FINGERENCE LICITAÇÕES: DADOS PÚBLICOS**
• As informações de licitações e contratos vêm de dados públicos do PNCP, do Compras.gov.br (dados abertos do Governo Federal, licença Creative Commons Atribuição) e dos sistemas de origem dos órgãos. A Plataforma não tem vínculo com o PNCP, com o Compras.gov.br nem com os órgãos públicos.
• Não garantimos que os editais estejam completos, corretos ou atualizados, nem que todo edital publicado apareça na Plataforma ou nos avisos. Antes de decidir ou participar, o Usuário deve conferir o edital e os prazos na fonte oficial.
• Os avisos e lembretes aparecem dentro da Plataforma e dependem da coleta dos dados públicos, que pode atrasar ou falhar.
• Os dados cadastrais da empresa que a Plataforma preenche a partir do CNPJ (razão social, situação cadastral, atividades, endereço e contatos) vêm de dados públicos da Receita Federal, consultados pela BrasilAPI. A Plataforma não tem vínculo com a Receita Federal nem com a BrasilAPI e não garante que esses dados estejam completos ou atualizados; o Usuário deve conferi-los e corrigi-los quando necessário.
• Os cadastros de sanções (CEIS, CNEP e CEPIM) são consultados no Portal da Transparência do Governo Federal, mantido pela Controladoria-Geral da União (CGU). A Plataforma não tem vínculo com a CGU, não garante que a consulta esteja completa, atualizada ou disponível e não emite certidão. "Sem registro encontrado" não significa regularidade: antes de apresentar a proposta, o Usuário deve conferir a certidão ou a consulta oficial.
• A Plataforma não presta assessoria jurídica, não elabora propostas e não participa de licitações em nome do Usuário.

**7. FINGERENCE LICITAÇÕES: COFRE DE DOCUMENTOS E CONSULTA DE SANÇÕES**
O cofre guarda os documentos de habilitação da empresa e das pessoas ligadas a ela (sócios, representantes legais, procuradores e responsáveis técnicos), com as datas de emissão e de validade, e avisa dentro da Plataforma quando um documento está perto de vencer. A consulta de sanções verifica a empresa e essas pessoas em cadastros federais.
• Dados de terceiros: o Usuário declara ter autorização ou base legal para guardar e consultar os dados e os documentos dessas pessoas, é responsável por informá-las sobre isso e deve guardar apenas o necessário para a habilitação em licitações.
• Papéis: nesses dados de terceiros, o Usuário é o controlador e a FINGERENCE atua como operadora, tratando os dados apenas para prestar o serviço contratado e conforme as instruções do Usuário, dadas pelo uso das funcionalidades da Plataforma.
• Obrigações da FINGERENCE como operadora: manter as medidas de segurança descritas na Política de Privacidade; usar apenas os fornecedores listados nela; ajudar o Usuário a atender pedidos dos titulares dos dados; avisar o Usuário sobre incidentes de segurança que afetem esses dados; e excluí-los quando a conta for encerrada, conforme a seção 12, ou devolvê-los ao Usuário, se ele pedir antes.
• Conferência dos documentos: não conferimos o conteúdo, a autenticidade nem a validade dos documentos. A situação "válido", "vencendo" ou "vencido" é calculada com as datas informadas pelo Usuário, e a validade sugerida pela Plataforma é apenas um ponto de partida. Os links de emissão levam ao site do órgão emissor, com o qual a Plataforma não tem vínculo.
• Avisos de vencimento: aparecem dentro da Plataforma, dependem da rotina diária de verificação e podem atrasar ou falhar. Eles não substituem o controle do Usuário sobre os prazos de seus documentos.
• Consulta de sanções: é automática e informativa, mostra a data em que foi feita e pode ficar indisponível ou limitada pela fonte. Serve apenas para verificar impedimentos para contratar com o poder público: é vedado usá-la para outra finalidade ou para consultar pessoas sem relação com a empresa do Usuário.
• Limites: o cofre tem limites de quantidade de documentos e de tamanho de arquivo, informados na própria solução.

**8. PLANOS, PAGAMENTO E CANCELAMENTO**
• Cada solução tem 15 dias grátis no início, sem cartão de crédito.
• Os pagamentos são mensais e processados pelo Mercado Pago, por Pix, cartão de crédito ou assinatura recorrente no cartão. Os dados do cartão são tratados pelo Mercado Pago e não ficam guardados na Plataforma.
• Os preços de cada solução são os publicados na página dela. Mudanças de preço valem a partir da cobrança seguinte e são comunicadas com antecedência.
• FINGERENCE Finanças: plano Starter (uma conta, só o titular) ou Premium (várias contas, equipe e recursos comerciais). O pagamento avulso vale por 30 dias. Ao cancelar, o acesso termina na hora, sem reembolso do período já pago.
• FINGERENCE Licitações: assinatura por conta, com 2 usuários incluídos (o titular e mais 1). Cada usuário a mais tem valor mensal próprio, cobrado a partir da próxima cobrança, sem cobrança proporcional. O pagamento avulso vale por 30 dias. Ao cancelar a assinatura recorrente, o acesso continua até o fim do teste ou do período já pago, sem reembolso.
• Sem pagamento depois do teste ou do período pago, o acesso à solução fica suspenso, e os dados continuam guardados conforme a seção 12.

**9. PROPRIEDADE INTELECTUAL**
Todos os elementos que compõem a Plataforma — incluindo código-fonte, interface, marca, logotipos, textos e funcionalidades — são de propriedade exclusiva de seus mantenedores ou licenciados a eles, protegidos pela Lei nº 9.610/1998 e legislação de propriedade intelectual aplicável. O Usuário recebe uma licença limitada, não exclusiva e intransferível para uso da Plataforma. Os dados inseridos pelo Usuário permanecem de sua exclusiva propriedade, e os dados públicos de licitações continuam públicos.

**10. DISPONIBILIDADE E SUPORTE**
A Plataforma é fornecida no estado em que se encontra. Nos empenhamos em manter alta disponibilidade, porém não garantimos que o serviço será ininterrupto ou isento de erros. Manutenções programadas serão comunicadas com antecedência sempre que possível. Para suporte: fingerence@gmail.com ou (49) 99955-4856.

**11. LIMITAÇÃO DE RESPONSABILIDADE**
A Plataforma é uma ferramenta de apoio à organização financeira, ao acompanhamento de licitações e à guarda de documentos de habilitação. Não nos responsabilizamos por:
• Decisões financeiras ou investimentos realizados com base nas informações da Plataforma.
• Editais, prazos ou informações de licitações incompletos, incorretos ou desatualizados, na fonte pública ou na coleta.
• Resultado de licitações, propostas ou prazos perdidos.
• Documentos, validades ou avisos de vencimento incorretos, atrasados ou ausentes, inclusive os decorrentes de datas informadas pelo próprio Usuário.
• Consulta de sanções incompleta, desatualizada ou indisponível, ou decisões tomadas sem conferir a fonte oficial.
• Perdas decorrentes de indisponibilidade temporária do serviço.
• Danos causados por uso indevido das credenciais pelo próprio Usuário ou por terceiros mediante falha de guarda do Usuário.
• Inexatidão de dados inseridos pelo próprio Usuário.
Em qualquer hipótese, nossa responsabilidade limita-se ao valor pago pelo Usuário nos últimos 3 meses de uso, quando aplicável.

**12. VIGÊNCIA E RESCISÃO**
Estes Termos vigoram por prazo indeterminado a partir da aceitação pelo Usuário. O Usuário pode encerrar sua conta a qualquer momento pelo e-mail fingerence@gmail.com. Nos reservamos o direito de suspender ou encerrar contas que violem estes Termos. Após o encerramento, os dados, inclusive os documentos e os dados de terceiros guardados no cofre, serão retidos por até 90 dias e então excluídos, salvo obrigação legal de retenção por prazo superior.

**13. ALTERAÇÕES NOS TERMOS**
Podemos atualizar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail ou notificação na Plataforma com antecedência mínima de 15 dias. O uso continuado após a vigência das alterações constitui aceitação dos novos Termos. Esta versão inclui o cofre de documentos e a consulta de sanções do FINGERENCE Licitações; para quem já usava a Plataforma, ela vale 15 dias depois da publicação.

**14. LEGISLAÇÃO E FORO**
Estes Termos são regidos pela legislação da República Federativa do Brasil. Fica eleito o foro da Comarca de Criciúma/SC para dirimir quaisquer controvérsias, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

Contato: fingerence@gmail.com | (49) 99955-4856
`;

export const PRIVACY_CONTENT = `
**POLÍTICA DE PRIVACIDADE E PROTEÇÃO DE DADOS — FINGERENCE**
Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)
Última atualização: novembro de 2026

**1. CONTROLADOR E OPERADOR DOS DADOS PESSOAIS**
A FINGERENCE é a controladora dos dados pessoais da conta e do uso da Plataforma, tratados por meio do FINGERENCE Finanças e do FINGERENCE Licitações (cadastro, acesso, pagamento e suporte), e pode ser contatada pelo e-mail fingerence@gmail.com ou pelo telefone (49) 99955-4856. Sobre os dados de terceiros que o Usuário guarda no cofre do FINGERENCE Licitações e consulta nas sanções (as pessoas ligadas à empresa, os documentos delas e os resultados das consultas), o Usuário é o controlador e a FINGERENCE atua como operadora, tratando esses dados conforme as instruções do Usuário. Para questões sobre privacidade e proteção de dados, utilize os mesmos canais.

**2. QUAIS DADOS COLETAMOS**
Para a prestação do serviço, coletamos as seguintes categorias de dados pessoais:
• Dados de identificação: nome completo, CPF/CNPJ, endereço de e-mail e, quando informados, telefone e data de nascimento, fornecidos no cadastro.
• Dados de acesso: endereço IP, data, hora e dispositivo utilizado nos acessos, coletados automaticamente por razões de segurança.
• Dados financeiros (FINGERENCE Finanças): receitas, despesas, categorias e demais informações inseridas voluntariamente pelo Usuário.
• Dados de uso do FINGERENCE Licitações: buscas salvas, favoritos, acompanhamento dos editais, observações, concorrentes acompanhados (CNPJ e apelido), o perfil da empresa (razão social, nome fantasia, CNPJ, situação cadastral, atividades, endereço e contatos, que o titular edita ou busca pelo CNPJ) e os usuários cadastrados pelo titular da conta (nome, e-mail e, quando informados, CPF, telefone, cargo, setor, data de admissão e foto).
• Cofre de documentos (FINGERENCE Licitações): as pessoas ligadas à empresa que o titular cadastra (nome, CPF, papel, como sócio, representante legal, procurador ou responsável técnico, cargo, e-mail e telefone) e os documentos guardados, em arquivos PDF, JPG ou PNG, como certidões, contrato social, atestados, documento de identificação e procurações, com as datas de emissão e de validade.
• Consultas de sanções (FINGERENCE Licitações): o resultado de cada consulta aos cadastros federais (tipo da sanção, órgão, datas, fundamento e processo) e a data da consulta, ligados à empresa ou à pessoa consultada. O CPF ou o CNPJ consultado é enviado ao Portal da Transparência para a consulta, mas o resultado guardado não repete o CPF nem o nome do sancionado.
• Dados de pagamento: situação e identificadores dos pagamentos feitos pelo Mercado Pago. Os dados do cartão são tratados pelo Mercado Pago e não ficam guardados na Plataforma.
• Dados de comunicação: mensagens trocadas com nosso suporte.
Os editais, contratos e resultados de licitações exibidos no FINGERENCE Licitações são dados públicos do PNCP e do Compras.gov.br. Não pedimos nem tratamos intencionalmente dados sensíveis conforme definido no Art. 5º, II da LGPD, como origem racial, convicção religiosa, dados genéticos, biométricos ou relativos à saúde.
Os documentos que o Usuário guarda no cofre podem trazer dados de terceiros, como números de documentos, foto e filiação. Por isso, o Usuário deve guardar apenas o necessário para a habilitação em licitações.

**3. FINALIDADES DO TRATAMENTO**
Os dados pessoais são tratados exclusivamente para:
• Criação e gerenciamento da conta do Usuário e dos usuários cadastrados por ele.
• Prestação das funcionalidades de cada solução: gestão financeira e acompanhamento de licitações.
• Guarda dos documentos de habilitação no cofre e aviso do vencimento deles, no FINGERENCE Licitações.
• Consulta aos cadastros federais de sanções, a pedido do Usuário, no FINGERENCE Licitações.
• Processamento dos pagamentos das assinaturas.
• Comunicações transacionais relacionadas ao serviço (confirmações, notificações, suporte).
• Segurança da Plataforma e prevenção a fraudes.
• Cumprimento de obrigações legais e regulatórias.
• Melhoria contínua da Plataforma, de forma anonimizada quando possível.

**4. BASES LEGAIS DO TRATAMENTO (Art. 7º LGPD)**
Cada finalidade de tratamento está fundamentada em ao menos uma base legal:
• Execução de contrato (Art. 7º, V): dados necessários para a prestação do serviço e a cobrança das assinaturas.
• Legítimo interesse (Art. 7º, IX): segurança da Plataforma, prevenção a fraudes e estatísticas de uso do site.
• Cumprimento de obrigação legal (Art. 7º, II): retenção de dados exigida pela legislação.
• Consentimento (Art. 7º, I): comunicações opcionais, quando aplicável.
• Dados de terceiros do cofre e das sanções: a base legal é responsabilidade do Usuário, como controlador (por exemplo, o cumprimento de obrigação legal ou regulatória ou o legítimo interesse de verificar impedimentos para contratar com o poder público). A FINGERENCE os trata para cumprir o contrato com o Usuário (Art. 7º, V).

**5. COMPARTILHAMENTO DE DADOS**
Não vendemos, alugamos, cedemos ou comercializamos seus dados pessoais. O compartilhamento ocorre apenas com:
• Fornecedores de infraestrutura tecnológica (hospedagem, banco de dados e armazenamento de arquivos, inclusive os do cofre), vinculados por cláusulas contratuais de proteção de dados.
• Mercado Pago, para processar os pagamentos das assinaturas.
• BrasilAPI, serviço de consulta de dados públicos de CNPJ, que recebe apenas o CNPJ da empresa quando o titular da conta pede, no FINGERENCE Licitações, para buscar os dados cadastrais da empresa. Nenhum outro dado do Usuário é enviado a ela.
• Portal da Transparência do Governo Federal (CGU), que recebe o CPF ou o CNPJ consultado quando o Usuário pede, no FINGERENCE Licitações, a consulta de sanções da empresa ou de uma pessoa do cofre. É um serviço público, e a FINGERENCE não tem vínculo com ele.
• Serviço de envio de e-mail (EmailJS), que recebe o e-mail, o nome e o código de recuperação quando o Usuário pede a recuperação de senha.
• Google, quando o Usuário escolhe entrar com a conta Google: o Google autentica o Usuário e nos informa o e-mail e o identificador da conta, para reconhecê-lo na Plataforma.
• Autoridades públicas e órgãos reguladores, exclusivamente quando exigido por lei ou ordem judicial.
Hoje, os documentos do cofre não são lidos por ferramentas de inteligência artificial nem enviados a terceiros, além dos fornecedores de armazenamento citados acima.

**6. TRANSFERÊNCIA INTERNACIONAL DE DADOS**
Hoje, o servidor e o banco de dados do FINGERENCE Licitações ficam nos Estados Unidos, e o servidor do FINGERENCE Finanças, na Alemanha. A Plataforma também pode utilizar outros serviços de infraestrutura localizados fora do Brasil, como o armazenamento de arquivos. Quando isso ocorrer, adotamos medidas contratuais adequadas para garantir nível de proteção equivalente ao exigido pela LGPD, conforme Art. 33 da Lei nº 13.709/2018.

**7. SEGURANÇA DAS INFORMAÇÕES**
Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
• Transmissão de dados com criptografia TLS/HTTPS.
• Senhas armazenadas com função de hash segura (bcrypt).
• Autenticação baseada em tokens JWT com expiração controlada.
• Controles de acesso baseados em perfil e princípio do privilégio mínimo.
• Arquivos do cofre em armazenamento privado, abertos apenas por link temporário, que vale por poucos minutos.
• As pessoas cadastradas no cofre e os documentos pessoais delas só aparecem para o titular da conta.
• Cuidados para que o CPF das pessoas do cofre não seja registrado nos logs do servidor.
• Cada conta acessa apenas os próprios dados.
• Monitoramento de acessos suspeitos.
Em caso de incidente que possa gerar risco ao Usuário, notificaremos a ANPD e os titulares afetados nos prazos legais.

**8. RETENÇÃO E ELIMINAÇÃO DOS DADOS**
Seus dados são retidos enquanto sua conta estiver ativa, inclusive quando a assinatura de uma solução vence ou é cancelada.
No cofre, o Usuário pode apagar a qualquer momento um documento (com o arquivo dele) ou uma pessoa. Apagar uma pessoa apaga também os documentos e as consultas de sanções dela, e trocar o CPF dela apaga as consultas guardadas.
Após o encerramento da conta:
• Dados, inclusive os arquivos e os dados do cofre, são retidos por até 90 dias para fins de segurança e eventuais contestações.
• Após esse prazo, os dados são excluídos ou anonimizados definitivamente.
• Logs de segurança podem ser retidos por até 12 meses, conforme exigência legal.
• Dados sujeitos a obrigações fiscais ou legais são retidos pelo prazo exigido pela legislação.

**9. SEUS DIREITOS COMO TITULAR (Art. 18 LGPD)**
Você tem direito a, a qualquer momento:
• Confirmar a existência de tratamento dos seus dados pessoais.
• Acessar os dados pessoais que tratamos sobre você.
• Corrigir dados incompletos, inexatos ou desatualizados.
• Solicitar anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a LGPD.
• Solicitar portabilidade dos seus dados a outro fornecedor de serviço.
• Revogar o consentimento, quando o tratamento for baseado nessa base legal.
• Opor-se a tratamentos realizados com base em legítimo interesse.
• Apresentar reclamação à ANPD (Autoridade Nacional de Proteção de Dados): www.gov.br/anpd.
Se os seus dados foram guardados por um Usuário no cofre (por exemplo, como sócio, representante ou procurador de uma empresa), o controlador deles é o Usuário: faça o pedido a ele. Você também pode escrever para fingerence@gmail.com, e ajudaremos o Usuário a atender o pedido.
Para exercer qualquer desses direitos, entre em contato pelo e-mail fingerence@gmail.com. Responderemos em até 15 dias úteis.

**10. COOKIES E TECNOLOGIAS SIMILARES**
Usamos o armazenamento do navegador de forma essencial, para manter sua sessão autenticada e guardar preferências, como a escolha feita no aviso de cookies. Registramos no nosso próprio servidor as visitas às páginas públicas, para medir o uso do site. Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros. Você pode configurar seu navegador para recusar cookies e armazenamento local, mas isso pode impedir o funcionamento correto do sistema.

**11. MENORES DE IDADE**
A Plataforma não é destinada a menores de 18 anos. Não coletamos intencionalmente dados de menores. Caso identificada tal situação, os dados serão excluídos imediatamente.

**12. ALTERAÇÕES NESTA POLÍTICA**
Esta Política pode ser atualizada periodicamente para refletir mudanças no serviço ou na legislação. Alterações relevantes serão comunicadas por e-mail ou notificação na Plataforma com antecedência mínima de 15 dias. Esta versão inclui o cofre de documentos e a consulta de sanções do FINGERENCE Licitações; para quem já usava a Plataforma, ela vale 15 dias depois da publicação.

**13. CONTATO**
• E-mail: fingerence@gmail.com
• Telefone: (49) 99955-4856
• Prazo de resposta: até 15 dias úteis
`;
