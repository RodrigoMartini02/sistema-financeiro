import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  tipo: 'termos' | 'privacidade';
  onClose: () => void;
}

const TERMOS_CONTEUDO = `
**TERMOS DE USO — FINGERENCE Sistema Financeiro**
Última atualização: Junho de 2026

**1. OBJETO E ACEITAÇÃO**
Estes Termos de Uso regulam o acesso e a utilização do FINGERENCE Sistema Financeiro ("FINGERENCE", "Plataforma"), disponibilizado por seus mantenedores ("Nós"). Ao criar uma conta, acessar ou utilizar o FINGERENCE, você ("Usuário") declara ter lido, compreendido e concordado integralmente com estes Termos. Caso não concorde, não utilize a Plataforma.

**2. DESCRIÇÃO DO SERVIÇO**
O FINGERENCE é um sistema de gestão financeira pessoal e empresarial que oferece controle de receitas, despesas, reservas, cartões de crédito, relatórios analíticos e gerenciamento de múltiplos perfis financeiros. O FINGERENCE é uma ferramenta de organização financeira e não constitui instituição financeira, prestadora de serviços de pagamento, assessoria de investimentos ou produto regulado pelo Banco Central do Brasil.

**3. ELEGIBILIDADE E CADASTRO**
O acesso ao FINGERENCE é destinado a pessoas físicas maiores de 18 anos e pessoas jurídicas regularmente constituídas. O Usuário é responsável pela veracidade das informações fornecidas no cadastro e pela guarda de suas credenciais de acesso. É vedada a criação de múltiplas contas com a finalidade de burlar restrições da Plataforma.

**4. OBRIGAÇÕES DO USUÁRIO**
Ao utilizar o FINGERENCE, o Usuário compromete-se a:
• Fornecer informações verdadeiras, precisas e atualizadas no cadastro.
• Manter a confidencialidade de sua senha e não compartilhar o acesso com terceiros.
• Utilizar a Plataforma exclusivamente para fins lícitos de gestão financeira pessoal e empresarial.
• Notificar imediatamente qualquer acesso não autorizado à sua conta.
• Manter atualizados os dados de contato cadastrados.

**5. USO ACEITÁVEL**
É expressamente vedado ao Usuário:
• Tentar burlar, desabilitar ou comprometer mecanismos de segurança da Plataforma.
• Realizar engenharia reversa, decompilar ou extrair o código-fonte do FINGERENCE.
• Utilizar a Plataforma para atividades ilícitas, fraudulentas ou que violem direitos de terceiros.
• Inserir dados falsos, maliciosos ou que infrinjam direitos de privacidade de terceiros.
• Revender, sublicenciar ou ceder o acesso à Plataforma sem autorização expressa.
• Sobrecarregar intencionalmente a infraestrutura da Plataforma.

**6. PROPRIEDADE INTELECTUAL**
Todos os elementos que compõem o FINGERENCE — incluindo código-fonte, interface, marca, logotipos, textos e funcionalidades — são de propriedade exclusiva de seus mantenedores ou licenciados a eles, protegidos pela Lei nº 9.610/1998 e legislação de propriedade intelectual aplicável. O Usuário recebe uma licença limitada, não exclusiva e intransferível para uso pessoal da Plataforma. Os dados financeiros inseridos pelo Usuário permanecem de sua exclusiva propriedade.

**7. DISPONIBILIDADE E SUPORTE**
O FINGERENCE é fornecido no estado em que se encontra. Nos empenhamos em manter alta disponibilidade, porém não garantimos que o serviço será ininterrupto ou isento de erros. Manutenções programadas serão comunicadas com antecedência sempre que possível. Para suporte: fingerence@gmail.com ou (49) 99955-4856.

**8. LIMITAÇÃO DE RESPONSABILIDADE**
O FINGERENCE é uma ferramenta de apoio à organização financeira. Não nos responsabilizamos por:
• Decisões financeiras ou investimentos realizados com base nas informações da Plataforma.
• Perdas decorrentes de indisponibilidade temporária do serviço.
• Danos causados por uso indevido das credenciais pelo próprio Usuário ou por terceiros mediante falha de guarda do Usuário.
• Inexatidão de dados inseridos pelo próprio Usuário.
Em qualquer hipótese, nossa responsabilidade limita-se ao valor pago pelo Usuário nos últimos 3 meses de uso, quando aplicável.

**9. VIGÊNCIA E RESCISÃO**
Estes Termos vigoram por prazo indeterminado a partir da aceitação pelo Usuário. O Usuário pode encerrar sua conta a qualquer momento pelo e-mail fingerence@gmail.com. Nos reservamos o direito de suspender ou encerrar contas que violem estes Termos. Após o encerramento, os dados serão retidos por até 90 dias e então excluídos, salvo obrigação legal de retenção por prazo superior.

**10. ALTERAÇÕES NOS TERMOS**
Podemos atualizar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail ou notificação na Plataforma com antecedência mínima de 15 dias. O uso continuado após a vigência das alterações constitui aceitação dos novos Termos.

**11. LEGISLAÇÃO E FORO**
Estes Termos são regidos pela legislação da República Federativa do Brasil. Fica eleito o foro da Comarca de Criciúma/SC para dirimir quaisquer controvérsias, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

Contato: fingerence@gmail.com | (49) 99955-4856
`;

const PRIVACIDADE_CONTEUDO = `
**POLÍTICA DE PRIVACIDADE E PROTEÇÃO DE DADOS — FINGERENCE**
Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)
Última atualização: Junho de 2026

**1. CONTROLADOR DOS DADOS PESSOAIS**
O controlador dos dados pessoais tratados por meio do FINGERENCE Sistema Financeiro pode ser contatado pelo e-mail fingerence@gmail.com ou pelo telefone (49) 99955-4856. Para questões sobre privacidade e proteção de dados, utilize os mesmos canais.

**2. QUAIS DADOS COLETAMOS**
Para a prestação do serviço, coletamos as seguintes categorias de dados pessoais:
• Dados de identificação: nome completo, CPF/CNPJ e endereço de e-mail, fornecidos no cadastro.
• Dados de acesso: endereço IP, data, hora e dispositivo utilizado nos acessos, coletados automaticamente por razões de segurança.
• Dados financeiros: receitas, despesas, reservas, categorias e demais informações inseridas voluntariamente pelo Usuário.
• Dados de comunicação: mensagens trocadas com nosso suporte.
Não coletamos dados sensíveis conforme definido no Art. 5º, II da LGPD, como origem racial, convicção religiosa, dados genéticos, biométricos ou relativos à saúde.

**3. FINALIDADES DO TRATAMENTO**
Os dados pessoais são tratados exclusivamente para:
• Criação e gerenciamento da conta do Usuário.
• Prestação das funcionalidades de gestão financeira.
• Comunicações transacionais relacionadas ao serviço (confirmações, notificações, suporte).
• Segurança da Plataforma e prevenção a fraudes.
• Cumprimento de obrigações legais e regulatórias.
• Melhoria contínua da Plataforma, de forma anonimizada quando possível.

**4. BASES LEGAIS DO TRATAMENTO (Art. 7º LGPD)**
Cada finalidade de tratamento está fundamentada em ao menos uma base legal:
• Execução de contrato (Art. 7º, V): dados necessários para a prestação do serviço.
• Legítimo interesse (Art. 7º, IX): segurança da Plataforma e prevenção a fraudes.
• Cumprimento de obrigação legal (Art. 7º, II): retenção de dados exigida pela legislação.
• Consentimento (Art. 7º, I): comunicações opcionais, quando aplicável.

**5. COMPARTILHAMENTO DE DADOS**
Não vendemos, alugamos, cedemos ou comercializamos seus dados pessoais. O compartilhamento ocorre apenas com:
• Fornecedores de infraestrutura tecnológica (hospedagem, banco de dados), vinculados por cláusulas contratuais de proteção de dados.
• Autoridades públicas e órgãos reguladores, exclusivamente quando exigido por lei ou ordem judicial.

**6. TRANSFERÊNCIA INTERNACIONAL DE DADOS**
O FINGERENCE pode utilizar serviços de infraestrutura localizados fora do Brasil. Quando isso ocorrer, adotamos medidas contratuais adequadas para garantir nível de proteção equivalente ao exigido pela LGPD, conforme Art. 33 da Lei nº 13.709/2018.

**7. SEGURANÇA DAS INFORMAÇÕES**
Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
• Transmissão de dados com criptografia TLS/HTTPS.
• Senhas armazenadas com função de hash segura (bcrypt).
• Autenticação baseada em tokens JWT com expiração controlada.
• Controles de acesso baseados em perfil e princípio do privilégio mínimo.
• Monitoramento de acessos suspeitos.
Em caso de incidente que possa gerar risco ao Usuário, notificaremos a ANPD e os titulares afetados nos prazos legais.

**8. RETENÇÃO E ELIMINAÇÃO DOS DADOS**
Seus dados são retidos enquanto sua conta estiver ativa. Após o encerramento:
• Dados são retidos por até 90 dias para fins de segurança e eventuais contestações.
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
Para exercer qualquer desses direitos, entre em contato pelo e-mail fingerence@gmail.com. Responderemos em até 15 dias úteis.

**10. COOKIES E TECNOLOGIAS SIMILARES**
Utilizamos exclusivamente cookies essenciais para manter sua sessão autenticada e garantir o funcionamento adequado da Plataforma. Não utilizamos cookies de rastreamento, publicidade ou análise comportamental de terceiros. Você pode configurar seu navegador para recusar cookies, mas isso pode impedir o funcionamento correto do sistema.

**11. MENORES DE IDADE**
O FINGERENCE não é destinado a menores de 18 anos. Não coletamos intencionalmente dados de menores. Caso identificada tal situação, os dados serão excluídos imediatamente.

**12. ALTERAÇÕES NESTA POLÍTICA**
Esta Política pode ser atualizada periodicamente para refletir mudanças no serviço ou na legislação. Alterações relevantes serão comunicadas por e-mail ou notificação na Plataforma com antecedência mínima de 15 dias.

**13. CONTATO**
• E-mail: fingerence@gmail.com
• Telefone: (49) 99955-4856
• Prazo de resposta: até 15 dias úteis
`;

function renderTexto(texto: string) {
  return texto.trim().split('\n').map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return <p key={i} className="mt-4 first:mt-0 font-bold text-slate-900 text-sm">{line.replace(/\*\*/g, '')}</p>;
    }
    if (line.startsWith('• ')) {
      return <p key={i} className="ml-4 text-sm text-slate-600">• {line.slice(2)}</p>;
    }
    if (line.trim() === '') return null;
    return <p key={i} className="text-sm text-slate-600 leading-relaxed">{line}</p>;
  });
}

export function TermosModal({ open, tipo, onClose }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const titulo = tipo === 'termos' ? 'Termos de Uso' : 'Política de Privacidade e LGPD';
  const conteudo = tipo === 'termos' ? TERMOS_CONTEUDO : PRIVACIDADE_CONTEUDO;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Documento legal</p>
            <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={18} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
          {renderTexto(conteudo)}
        </div>
        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
