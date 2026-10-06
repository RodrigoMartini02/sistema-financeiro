# Plano de Implementação: Leitura de QR Pix por imagem no assistente

## Origem

- Arquivo de especificação: nenhum. É o pedido do usuário de 06/10/2026, depois do achado no plano `.plans/dependencias-backend-seguranca.md`.
- Data do planejamento: `2026-10-06`
- Classificação: `backend-only` (sem banco de dados e sem tela)

## Resumo

Quando o usuário manda ao assistente a foto ou o print de um QR Pix, o rascunho deveria trazer valor, recebedor e forma de pagamento Pix. Hoje isso nunca acontece, por dois motivos:

1. A leitura do QR (`readQRCode`, em `pixReader.ts`) chama `require('jimp').read`, que não existe no jimp 1.x. O erro é engolido e a função sempre devolve `null`.
2. A interpretação do código Pix (`extractPixInfo`) lê os campos errados:
   - o valor vem da tag `04`, quando no padrão do Pix (BR Code/EMV) ele fica na tag `54`;
   - a descrição recebe o txid (campo `62-05`), e não a descrição do campo `26-02`.

O plano faz a leitura com o **sharp**, que já é usado nas imagens de produto. Também corrige a interpretação, apaga a função `preprocessImage`, que não é usada, e remove o **jimp** do projeto.

## Decisões aplicadas

- **Decisão 1:** ler o QR com o sharp e remover do projeto o jimp e a função `preprocessImage`, que não é usada. Não vamos corrigir o uso do jimp 1.x.

## Escopo

### Dentro do escopo

- **Leitura do QR em `readQRCode`, com o sharp:**
  - girar conforme a orientação EXIF (fotos de celular);
  - reduzir até no máximo 2000 px no lado maior, sem distorcer e sem ampliar;
  - gerar pixels RGBA para o jsQR.
- **Erros:** se a leitura falhar, a função continua devolvendo `null` e registrando o erro, como hoje. O assistente segue sem os dados do Pix.
- **Interpretação em `extractPixInfo`:**
  - valor da tag `54`;
  - descrição do campo `26-02`;
  - continuam iguais: chave (`26-01`), nome do recebedor (`59`), cidade (`60`) e txid (`62-05`).
- **Limpeza:**
  - apagar `preprocessImage` de `ocrService.ts` (nenhum código a chama);
  - remover o `jimp` dos `dependencies` do backend.
- **Testes automáticos** de `extractPixInfo`.

### Fora do escopo

- Ler um Pix "copia e cola" colado como texto na mensagem do assistente. Hoje só imagem é lida.
- Melhorias no OCR (tesseract), que não é afetado: ele lê a imagem direto e não usa o jimp.
- Mudanças de tela ou no rascunho do assistente além dos dados do Pix.
- Validar o CRC do código Pix.

## Leitura de contexto

- `/AGENT.md` e `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- Código lido:
  - `backend/src/services/pixReader.ts`;
  - `backend/src/services/ocrService.ts`;
  - `backend/src/services/financialAssistant.ts`: `extractAttachment` roda OCR e QR em paralelo, e o rascunho usa `pix.nome_destinatario`, `pix.valor` e a forma de pagamento `pix`;
  - `backend/src/modules/catalogo/routes/produtos.ts`, como padrão de uso do sharp (`import sharp from 'sharp'`).
- Conferido em 06/10:
  - no jimp 1.6.1, `require('jimp').read` é `undefined`, e o certo seria `require('jimp').Jimp.read`;
  - `preprocessImage` não é chamada em lugar nenhum.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

**`backend/src/services/pixReader.ts`**
- `readQRCode(imagePath)`:
  - `sharp(imagePath).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })`;
  - `jsQR(new Uint8ClampedArray(...), info.width, info.height)`;
  - o tamanho máximo fica numa constante nomeada.
- `extractPixInfo(payload)`: valor da tag `54` e descrição do campo `26-02`. Corrige também a expressão da descrição, que hoje mistura `??` com `?:`.
- **Imports:** o sharp passa a ser import estático, como em `produtos.ts`. Remover o `fs` se ele ficar sem uso.

**`backend/src/services/ocrService.ts`**
- Apagar `preprocessImage`.

**`backend/src/services/pixReader.test.ts`** (novo)
- Os códigos Pix são montados com um auxiliar de campos (tag + tamanho + valor) dentro do teste.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **jimp removido:** o `backend/package-lock.json` perde o jimp, os pacotes `@jimp/*` e o `file-type`.
- **Sharp e Node:** o sharp 0.35.5 já está no projeto e no deploy (Node 22.16.0 no backend).
- **Sem variáveis nem jobs novos.**

## Arquivos provavelmente afetados

- `backend/src/services/pixReader.ts`
- `backend/src/services/pixReader.test.ts` (novo)
- `backend/src/services/ocrService.ts`
- `backend/package.json`
- `backend/package-lock.json`

## Estratégia de implementação

1. Criar a branch `fix/R/leitura-qr-pix` a partir de `main`.
2. Corrigir `extractPixInfo` e escrever `pixReader.test.ts`.
3. Trocar a leitura de `readQRCode` para o sharp.
4. Apagar `preprocessImage` de `ocrService.ts`.
5. Rodar `npm --prefix backend uninstall jimp`. Depois, conferir que não sobrou nenhuma referência a `jimp` no código.
6. **Teste local com um QR de verdade:**
   - instalar a biblioteca `qrcode` **só numa pasta temporária**, fora do projeto;
   - gerar um PNG de um código Pix e rodar `readPixQRFromImage`:
     - no PNG direto;
     - no QR dentro de uma imagem grande (cerca de 4000x3000);
     - numa imagem sem QR.
7. Rodar os checks.

## Regras de negócio identificadas

- **Precedência no rascunho, sem mudança:**
  - valor: o do documento (OCR/boleto) vem antes do valor do Pix;
  - descrição: o nome da empresa do documento vem antes do nome do recebedor do Pix.
- **QR Pix lido:** a forma de pagamento sugerida é Pix, como hoje.
- **QR não lido:** o rascunho segue como hoje, sem os dados do Pix.

## Regras multi-tenant e segurança

- O projeto não é multi-prefeitura, e nada muda em permissões.
- A imagem já chega validada pelo assistente: tipo e tamanho máximo de 10 MB. Ela fica numa pasta temporária, apagada no fim.
- O sharp limita o tamanho de imagem que aceita processar (padrão `limitInputPixels`), o que protege contra imagens gigantes.
- O log de erro da leitura continua sem o conteúdo do código Pix.

## Validações necessárias

- Código Pix vazio ou malformado: `extractPixInfo` devolve os campos nulos, sem lançar erro.
- Valor inválido na tag `54`: `valor` vem `null`.

## Testes necessários

### Frontend

- Não aplicável.

### Backend

- `pixReader.test.ts`, com `extractPixInfo`:
  - **Pix estático com valor, descrição e txid:** chave, valor, descrição, nome, cidade e txid corretos;
  - **Pix estático sem valor:** `valor` nulo, demais campos corretos;
  - **Pix dinâmico** (campo `26-25` com URL, sem chave): `chave` nula, nome e cidade corretos;
  - **Código vazio e código malformado:** campos nulos, sem erro.
- `npm --prefix backend run build`, `npm --prefix backend test` e `npm --prefix backend run test:tenders-db`.

### E2E

- **Teste local** (passo 6 da estratégia) com um QR gerado fora do projeto.
- **Depois do deploy:** mandar no assistente o print de um QR Pix e conferir que o rascunho vem com o valor e o recebedor.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
npm --prefix backend audit
npx vite build
```

## Riscos e pontos de atenção

- **QR difícil:** QR muito pequeno numa foto grande, ou foto tremida, pode continuar sem leitura, porque o limite de 2000 px reduz detalhes. O rascunho segue como hoje.
- **Remoção do jimp:** é seguro porque `ocrService` e `pixReader` eram os únicos lugares que usavam o jimp. A remoção é conferida com uma busca no código e com a verificação de tipos.
- **Valor no rascunho:** um Pix com valor vai começar a preencher o valor do rascunho quando o documento não tiver valor próprio. É o comportamento esperado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- o QR Pix gerado no teste local for lido, direto e dentro de uma imagem grande, com valor, nome e chave certos;
- uma imagem sem QR devolver `null` sem erro;
- os testes de `extractPixInfo` passarem;
- o `jimp` não estiver mais em `backend/package.json` nem em nenhum código;
- os checks passarem, e o `npm audit` continuar só com os 2 avisos moderate do Mercado Pago.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não instalar o `qrcode` no projeto: só na pasta temporária, para o teste local.
- Não alterar `.env` nem executar migrations (não há nenhuma).
- Manter a mudança pequena: sem refatorar o assistente nem o OCR.
