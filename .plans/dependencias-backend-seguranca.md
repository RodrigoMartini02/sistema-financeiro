# Plano de Implementação: Dependências do backend sem vulnerabilidades altas ou críticas

## Origem

- Arquivo de especificação: nenhum. É o pedido do usuário de 06/10/2026, depois dos 35 avisos do `npm audit` no build do Cron Job.
- Data do planejamento: `2026-10-06`
- Classificação: `backend-only` (com efeito no deploy, sem banco de dados)

## Resumo

O `npm audit` do backend acusa 35 pacotes vulneráveis (1 critical, 10 high, 24 moderate). Este plano atualiza só o necessário para zerar os avisos altos e críticos:
- remove o nodemon, que não é usado;
- sobe express, multer e jimp em versões compatíveis;
- aplica `npm audit fix` sem `--force`;
- sobe o sharp para 0.35.5 num commit separado.

O aviso moderado do uuid (via SDK do Mercado Pago 2.x) fica registrado como não aplicável.

## Decisões aplicadas

- **Decisão 1:** o Mercado Pago fica na versão 2.x.
  - O aviso do uuid ("missing buffer bounds check in v3/v5/v6 when buf is provided") não se aplica: o SDK só chama `uuid.v4()`, conferido em `node_modules/mercadopago/dist`.
  - Corrigir exigiria o Mercado Pago 3.x, uma versão maior, que mexe em pagamentos (assinatura e checkout da vitrine).

## Escopo

### Dentro do escopo

- **Remover o nodemon dos `devDependencies`:**
  - nenhum script nem arquivo o usa (`dev` usa `tsx watch`);
  - resolve nodemon, chokidar, braces, picomatch, minimatch e brace-expansion.
- **express 4.22.1 → 4.22.3** (faixa ^4.x): resolve body-parser, path-to-regexp (ReDoS em rotas), proxy-addr (o "critical") e qs.
- **multer 2.1.1 → 2.4.0** (faixa ^2.x): resolve vários DoS no upload multipart.
- **jimp 1.6.0 → 1.6.1:** resolve o file-type 16.5.4 (loop infinito com arquivo malformado).
- **`npm audit fix` sem `--force`:** leva o lodash, que vem do express-validator, a 4.18.1, além do que sobrar de compatível.
- **sharp 0.34.5 → 0.35.5** (versão maior, em commit separado): resolve as falhas herdadas da libvips e da libheif.
- **Mínimos declarados no `backend/package.json`:** passam a ser as versões corrigidas (`^4.22.3`, `^2.4.0`, `^1.6.1`, `^0.35.5`).

### Fora do escopo

- **Mercado Pago 3.x** (decisão 1).
- **Avisos do frontend:** 14 (12 high e 2 moderate), para um plano separado.
- **Bug do jimp na leitura de QR Pix e no tratamento de imagem do OCR** (`pixReader.ts` e `ocrService.ts`). É anterior a este plano e não é vulnerabilidade:
  - o código chama `require('jimp').read`, que não existe no jimp 1.x;
  - a leitura de QR por imagem sempre devolve "nada encontrado";
  - o tratamento de imagem do OCR é pulado em silêncio.

  Fica para um plano próprio.
- **Pacotes desatualizados sem vulnerabilidade** (openai, @anthropic-ai/sdk, zod, typescript, pg e outros).
- Qualquer mudança de código.

## Leitura de contexto

- `/AGENT.md`, seção "Dependências e Compatibilidade":
  - conferir `engines.node`;
  - não aceitar warning de engine;
  - não exigir Node maior que 22.17.0.
- `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- Investigação (só leitura):
  - `npm audit --json`, `npm outdated`, `npm ls` (caminhos de lodash, file-type, uuid, picomatch, minimatch e brace-expansion) e `npm view` (versões e engines);
  - uso no código: `sharp` e `multer` em `src/modules/catalogo/routes/produtos.ts`, `multer` em `src/modules/contracts/routes/attachments.ts` e `jimp` em `src/services/ocrService.ts` e `src/services/pixReader.ts`.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

- **Código:** nenhuma mudança. Mudam só `backend/package.json` e `backend/package-lock.json`.
- **Comportamento a conferir:**
  - **sharp:** o upload de imagem de produto faz `resize` (fit `inside`, `withoutEnlargement`, 1600 px) e `.webp({ quality: 82 })`;
  - **multer:**
    - anexos de contrato: `memoryStorage`, `fileSize`, `files: 1`, campo `file`;
    - imagens de produto: `memoryStorage`, `fileSize` de 8 MB, `fileFilter`, campo `imagem`;
  - **express:** só versões de correção da 4.22.x.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Node no Render:** o sharp 0.35.5 exige Node 20.9.0 ou mais novo (`engines`).
  - O Cron Job usa Node 24.21.0, conforme o log do build de 06/10.
  - A versão do Web Service do backend não está à vista daqui.
  - **Antes do merge**, o usuário confere no log do último deploy do backend a linha "Using Node.js version". Se for menor que 20.9, o commit do sharp fica de fora.
- **Engines das versões novas:**
  - express 4.22.3: `>= 0.10.0`;
  - multer 2.4.0: `>= 10.16.0`;
  - jimp 1.6.1: `>= 18`;
  - sharp 0.35.5: `>= 20.9.0`;
  - lodash 4.18.1: sem `engines`.

  Todas compatíveis com o Node 22.17.0 do AGENT.md, com o Node 24 local e com o do cron.
- **Binário do sharp:** o sharp usa binários pré-compilados por plataforma (`@img/sharp-*`). O lockfile registra os opcionais de todas as plataformas, e o `npm install` do Render (Linux) baixa o certo. Conferir no log de build do backend.
- **Deploy:** o backend e o cron se atualizam com o merge em `main`.

## Arquivos provavelmente afetados

- `backend/package.json`
- `backend/package-lock.json`

## Estratégia de implementação

1. Criar a branch `fix/R/dependencias-backend` a partir de `main`.
2. **Commit 1, atualizações compatíveis e limpeza:**
   1. `npm --prefix backend uninstall nodemon`
   2. `npm --prefix backend install express@^4.22.3 multer@^2.4.0 jimp@^1.6.1`
   3. `npm --prefix backend audit fix`, **sem** `--force`
   4. Conferir `npm --prefix backend ls lodash file-type proxy-addr path-to-regexp` e se apareceu algum warning de engine na instalação.
   5. Rodar os checks (abaixo).
3. **Commit 2, sharp:**
   1. `npm --prefix backend install sharp@^0.35.5`
   2. Rodar os checks e o teste de imagem (abaixo).
4. `npm --prefix backend audit`: o esperado é sobrar só o uuid (moderate), via mercadopago.
5. Antes do merge, pedir ao usuário a versão do Node do backend no Render.

## Regras de negócio identificadas

- Nada muda para o usuário: uploads, rotas e validações funcionam igual.

## Regras multi-tenant e segurança

- O projeto não é multi-prefeitura, e o isolamento por conta não muda.
- O objetivo é reduzir a superfície de ataque do backend que está no ar:
  - DoS no upload (multer);
  - ReDoS nas rotas (path-to-regexp);
  - DoS no parser de query (qs);
  - bibliotecas de imagem (sharp e libvips).
- O "critical" do proxy-addr só vale com `trust proxy`, que o servidor não usa. Mesmo assim, ele é corrigido junto com o express.

## Validações necessárias

- **Sem warnings de engine** na instalação (regra do AGENT.md).
- **`npm audit` do backend:** nada "high" nem "critical"; o "moderate" do uuid é aceito (decisão 1).

## Testes necessários

### Frontend

- Não aplicável.

### Backend

- `npm --prefix backend run build` (`tsc --noEmit`).
- `npm --prefix backend test` (409 testes).
- `npm --prefix backend run test:tenders-db` (68 testes, banco local).
- **Teste rápido de imagem** (script na pasta temporária, local): gerar uma imagem em memória e rodar o mesmo processamento do upload de produto. O resultado tem de ser um WebP válido, com o lado maior em até 1600 px.
- **Teste rápido de upload** (script na pasta temporária, local):
  - um app Express mínimo com a mesma configuração do multer dos anexos;
  - enviar um arquivo pequeno: deve ser recebido;
  - enviar um acima do limite: deve dar `LIMIT_FILE_SIZE`.
- **Servidor:** subir o backend local (porta de teste, `.env.dev`) e conferir que ele inicia e responde nas rotas públicas.

### E2E

Não há E2E automatizado. Conferência manual depois do deploy:
- enviar uma imagem de produto no catálogo;
- enviar um anexo de contrato.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
npm --prefix backend audit
npx vite build
```

## Riscos e pontos de atenção

- **Versão do Node do backend no Render:** se for menor que 20.9, o sharp 0.35 não instala. O passo de conferência antes do merge cobre isso.
- **Nova versão da libvips no sharp:** pode mudar um pouco o arquivo WebP gerado. O teste de imagem confere o processamento.
- **multer 2.4:** recusa nomes de campo com aninhamento ou índices exagerados. Os nossos (`file` e `imagem`) são simples.
- **Lockfile:** muda bastante. A revisão do diff confere que não entrou nenhum pacote novo além das versões corrigidas e que o nodemon e as dependências dele saíram.
- **Sem `--force`:** se o `audit fix` sem `--force` não resolver algum item, parar e reportar, sem forçar versão maior.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. A versão do Node do backend no Render é uma conferência do usuário antes do merge.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- o `npm audit` do backend não mostrar nada "high" nem "critical";
- a instalação não mostrar warning de engine;
- build, testes e testes de banco local passarem;
- os testes rápidos de imagem e de upload passarem e o servidor local iniciar;
- `backend/package.json` declarar os mínimos corrigidos e não ter mais o nodemon.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não usar `npm audit fix --force`.
- Não atualizar pacotes fora da lista.
- Não alterar `.env`.
- Não executar migrations (não há nenhuma).
- Fazer dois commits: compatíveis + nodemon, e o sharp separado.
- Antes do merge, pedir ao usuário a versão do Node do backend no Render.
