import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVACY_CONTENT, TERMS_CONTENT } from '../screens/public/legalContent';
import { parseLegalText } from './legalText';

test('texto legal: título, item e parágrafo; linhas vazias só separam', () => {
  assert.deepEqual(parseLegalText('\n**1. OBJETO**\nTexto corrido.\n\n• Primeiro item\n'), [
    { kind: 'heading', text: '1. OBJETO' },
    { kind: 'paragraph', text: 'Texto corrido.' },
    { kind: 'item', text: 'Primeiro item' },
  ]);
});

test('termos e privacidade cobrem as duas soluções e as regras de cancelamento', () => {
  const terms = parseLegalText(TERMS_CONTENT).map((block) => block.text).join('\n');
  assert.match(terms, /FINGERENCE Finanças/);
  assert.match(terms, /FINGERENCE Licitações/);
  assert.match(terms, /PNCP/, 'a fonte dos editais fica nos termos (decisão 4)');
  assert.match(terms, /Receita Federal, consultados pela BrasilAPI/, 'a fonte dos dados do CNPJ fica nos termos (item 1C)');
  assert.match(terms, /o acesso termina na hora/);
  assert.match(terms, /o acesso continua até o fim do teste ou do período já pago/);
  const privacy = parseLegalText(PRIVACY_CONTENT).map((block) => block.text).join('\n');
  assert.match(privacy, /Mercado Pago/);
  assert.match(privacy, /BrasilAPI[^\n]*recebe apenas o CNPJ da empresa/, 'o repasse do CNPJ à consulta consta na privacidade (item 1C)');
  assert.match(privacy, /FINGERENCE Licitações/);
});

function textOf(content: string): string {
  return parseLegalText(content)
    .map((block) => block.text)
    .join('\n');
}

test('termos cobrem o cofre e a consulta de sanções: a fonte, os papéis e o que não é certidão (item 9)', () => {
  const terms = textOf(TERMS_CONTENT);
  assert.match(terms, /Portal da Transparência do Governo Federal, mantido pela Controladoria-Geral da União \(CGU\)/);
  assert.match(terms, /CEIS, CNEP e CEPIM/);
  assert.match(terms, /não emite certidão/);
  assert.match(terms, /"Sem registro encontrado" não significa regularidade/);
  assert.match(terms, /FINGERENCE LICITAÇÕES: COFRE DE DOCUMENTOS E CONSULTA DE SANÇÕES/);
  assert.match(terms, /o Usuário é o controlador e a FINGERENCE atua como operadora/);
  assert.match(terms, /não conferimos o conteúdo, a autenticidade nem a validade dos documentos/);
  assert.match(terms, /Guardar no cofre ou consultar nas sanções pessoas sem autorização ou base legal/);
  assert.match(terms, /inclusive os documentos e os dados de terceiros guardados no cofre, serão retidos por até 90 dias/);
  assert.match(terms, /Esta versão inclui o cofre de documentos e a consulta de sanções do FINGERENCE Licitações/);
});

test('privacidade cobre o cofre e as sanções: papéis, dados, repasses, segurança, retenção e direitos de terceiros (item 9)', () => {
  const privacy = textOf(PRIVACY_CONTENT);
  assert.match(privacy, /1\. CONTROLADOR E OPERADOR DOS DADOS PESSOAIS/);
  assert.match(privacy, /o Usuário é o controlador e a FINGERENCE atua como operadora/);
  assert.match(privacy, /Cofre de documentos \(FINGERENCE Licitações\)/);
  assert.match(privacy, /o resultado guardado não repete o CPF nem o nome do sancionado/);
  assert.match(privacy, /Portal da Transparência do Governo Federal \(CGU\), que recebe o CPF ou o CNPJ consultado/);
  assert.match(privacy, /EmailJS[^\n]*recebe o e-mail, o nome e o código de recuperação/);
  assert.match(privacy, /Google, quando o Usuário escolhe entrar com a conta Google/);
  assert.match(privacy, /documentos do cofre não são lidos por ferramentas de inteligência artificial/);
  assert.match(privacy, /armazenamento privado, abertos apenas por link temporário/);
  assert.match(privacy, /CPF das pessoas do cofre não seja registrado nos logs/);
  assert.match(privacy, /Apagar uma pessoa apaga também os documentos e as consultas de sanções dela/);
  assert.match(privacy, /Se os seus dados foram guardados por um Usuário no cofre/);
  assert.match(privacy, /Esta versão inclui o cofre de documentos e a consulta de sanções do FINGERENCE Licitações/);
});

test('termos e privacidade: títulos numerados em sequência, e a seção que os Termos citam é a do encerramento', () => {
  const numbersOf = (content: string) =>
    parseLegalText(content)
      .filter((block) => block.kind === 'heading')
      .map((block) => /^(\d+)\. /.exec(block.text)?.[1])
      .filter((number): number is string => number !== undefined)
      .map(Number);
  assert.deepEqual(numbersOf(TERMS_CONTENT), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.deepEqual(numbersOf(PRIVACY_CONTENT), Array.from({ length: 13 }, (_, index) => index + 1));

  // "conforme a seção N" (planos e cofre): N tem de ser o título da vigência e do encerramento, onde mora a retenção dos dados.
  const blocks = parseLegalText(TERMS_CONTENT);
  const references = [...textOf(TERMS_CONTENT).matchAll(/seção (\d+)/g)].map((match) => match[1]);
  assert.ok(references.length >= 2, 'os Termos citam a seção do encerramento nos planos e no cofre');
  for (const reference of references) {
    const heading = blocks.find((block) => block.kind === 'heading' && block.text.startsWith(`${reference}. `));
    assert.match(heading?.text ?? '', /VIGÊNCIA E RESCISÃO/, `a seção ${reference} é a do encerramento`);
  }
});

test('termos e privacidade têm a mesma data de atualização', () => {
  assert.match(textOf(TERMS_CONTENT), /Última atualização: novembro de 2026/);
  assert.match(textOf(PRIVACY_CONTENT), /Última atualização: novembro de 2026/);
});

test('termos e privacidade não falam em "módulo" nem em "mesmo login"', () => {
  for (const content of [TERMS_CONTENT, PRIVACY_CONTENT]) {
    assert.doesNotMatch(content, /m[óo]dulo/i);
    assert.doesNotMatch(content, /mesmo login/i);
  }
});
