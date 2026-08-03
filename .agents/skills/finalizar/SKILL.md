---
name: finalizar
description: "Finaliza uma implementação no FinGerence: revisa alterações, roda validações, prepara commit local e pergunta antes de qualquer push/deploy para produção no Render. Não usa PR nem staging."
---

# Finalizar

Finalize uma implementação já feita no FinGerence.

## Fluxo do Projeto

- Projeto de um único desenvolvedor.
- Não existe PR obrigatório.
- Não existe branch `staging`.
- O fluxo local pode trabalhar direto em `main`, desde que as alterações sejam revisadas.
- Produção é no Render; push para o branch de deploy pode acionar produção.
- Antes de mandar para produção, perguntar explicitamente ao usuário.

## O Que Esta Skill Pode Fazer

1. Conferir estado local do repositório.
2. Revisar diff e staged files.
3. Identificar arquivos sensíveis, migrations e mudanças acidentais.
4. Rodar validações disponíveis.
5. Fazer stage apenas dos arquivos relevantes.
6. Criar commit local, quando o usuário pediu para finalizar a implementação.
7. Atualizar local com `git pull` quando isso for necessário e seguro.
8. Perguntar se pode enviar para produção.

## O Que Exige Confirmação Explícita

Sempre perguntar antes de:

- `git push` para qualquer branch que acione deploy.
- Qualquer ação de deploy no Render.
- Executar migrations.
- Rodar seeds.
- Alterar banco de dados.
- Alterar `.env`, secrets, CI/CD ou configuração do Render.
- Usar force push.
- Resolver conflitos que possam sobrescrever trabalho do usuário.

A pergunta deve ser objetiva, por exemplo:

```txt
Validações passaram e o commit local foi criado. Posso mandar para produção no Render agora?
```

Só executar push/deploy se o usuário responder claramente: `sim`, `pode`, `manda`, `pode mandar para produção` ou equivalente.

## Passos

### 1. Conferir repositório

Executar:

```bash
git status
git branch --show-current
git diff
git diff --staged
```

Se não houver alterações, informar e parar.

### 2. Revisar riscos

Verificar:

- arquivos sensíveis: `.env`, certificados, chaves, secrets;
- migrations ou mudanças de schema;
- mudanças em lockfile;
- artefatos de build;
- arquivos temporários;
- alterações fora do escopo.

Se houver arquivo sensível, parar e pedir orientação.

### 3. Rodar validações

Ler `package.json` e rodar somente scripts existentes e relevantes, como:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Se um script não existir, mencionar. Se um check falhar, não criar commit até o usuário decidir.

### 4. Stage seletivo

Não usar `git add .` sem necessidade clara. Preferir adicionar arquivos específicos:

```bash
git add <arquivo-1> <arquivo-2>
```

Depois conferir:

```bash
git status
git diff --staged
```

### 5. Commit local

Criar commit com Conventional Commits, refletindo a alteração real:

```txt
feat: improve public seo pages
fix: correct sitemap public routes
chore: update project skills
```

### 6. Perguntar sobre produção

Depois do commit local, perguntar se pode mandar para produção no Render.

Não executar push/deploy antes da resposta.

## Saída Final

Informar:

- branch atual;
- commit criado, se houver;
- validações executadas;
- arquivos incluídos;
- se produção foi enviada ou ficou aguardando aprovação;
- pendências e riscos.