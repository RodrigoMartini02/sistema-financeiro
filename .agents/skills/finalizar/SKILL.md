---
name: finalizar
description: Finaliza uma implementação já realizada, conferindo as alterações do repositório, garantindo que elas estejam em uma branch correta, executando validações, criando commit e abrindo uma Pull Request apontando para `staging`. Essa skill deve ser executada normalmente após a skill `implementar`, mas também pode ser chamada diretamente pelo usuário.
---

# Objetivo

Garantir que nenhuma alteração seja commitada diretamente em `main` ou `staging`, e que todo trabalho seja finalizado em uma branch própria com PR para `staging`.

---

# Fluxo Geral

```txt
conferir estado do repositório
→ identificar branch atual
→ proteger alterações se estiver em main/staging
→ criar/usar branch correta
→ revisar alterações
→ rodar checks
→ staged apenas dos arquivos relevantes
→ commit
→ push
→ abrir PR para staging
```

---

# 1. Conferir estado atual do repositório

Executar:

```bash
git status
git branch --show-current
git diff
git diff --staged
```

Identificar:

* branch atual
* arquivos modificados
* arquivos staged
* arquivos untracked
* conflitos
* alterações pendentes
* arquivos sensíveis
* migrations
* artefatos de build
* arquivos temporários

Se não houver alterações para commitar, informar o usuário e parar.

---

# 2. Verificar branches remotas

Antes de criar branch ou mover alterações, executar:

```bash
git fetch origin
git branch -a
```

Confirmar que existe uma branch `staging`.

Se `staging` não existir, parar e informar o usuário.

Não assumir automaticamente `develop`, `dev` ou `release`.

---

# 3. Identificar branch atual

## Caso esteja em uma feature branch

Se a branch atual NÃO for `main` nem `staging`, continuar nela.

Exemplos válidos:

```txt
feat/pdf-job-generation
fix/pdf-worker-security
refactor/pdf-generation-flow
```

Nesse caso:

* revisar alterações
* rodar checks
* fazer commit
* push
* abrir PR para `staging`

---

## Caso esteja em `staging`

Se estiver diretamente em `staging`, NÃO commitar nela.

Criar uma nova branch a partir do estado atual de `staging`, mantendo as alterações locais:

```bash
git checkout -b feat/<descricao-curta>
```

Depois continuar o fluxo nessa nova branch.

---

## Caso esteja em `main`

Se estiver diretamente em `main`, NÃO commitar nela.

Fluxo obrigatório:

```bash
git stash push -u -m "work-in-progress-before-finalize"
git fetch origin
git checkout staging
git pull origin staging
git checkout -b feat/<descricao-curta>
git stash pop
```

Se houver conflito no `stash pop`, parar imediatamente e informar o usuário.

Não resolver conflitos automaticamente de forma arriscada.

---

# 4. Criar nome da branch

Gerar um nome coerente baseado nas alterações ou no plano relacionado.

Priorizar o nome do plano quando existir.

Exemplo:

```txt
.portal/plans/pdf-generation-async.md
```

Branch sugerida:

```txt
feat/pdf-generation-async
```

Padrões aceitos:

```txt
feat/<descricao-curta>
fix/<descricao-curta>
chore/<descricao-curta>
refactor/<descricao-curta>
```

Evitar nomes genéricos:

```txt
fix/changes
feat/update
chore/work
```

---

# 5. Conferir plano relacionado

Se existir um plano em:

```txt
.portal/plans/
```

ou caminho equivalente informado pelo usuário, ler o plano antes de finalizar.

Verificar se as alterações realizadas aderem ao plano.

A PR deve mencionar o plano relacionado.

---

# 6. Revisar alterações antes do commit

Executar uma revisão técnica das alterações.

Verificar:

* aderência ao plano
* aderência aos arquivos `AGENT.md`
* código morto
* console.log esquecidos
* TODO/FIXME temporários
* imports não utilizados
* arquivos não utilizados
* possíveis regressões
* alterações acidentais
* arquivos sensíveis
* mudanças em lockfiles
* mudanças em migrations

Executar:

```bash
git diff
git diff --staged
git status
```

Produzir um resumo técnico contendo:

* arquivos alterados
* objetivo das alterações
* riscos
* pontos que merecem revisão humana

---

# 7. Regra para arquivos sensíveis

Parar e pedir intervenção se houver alterações ou arquivos novos contendo:

```txt
.env
.env.*
*.pem
*.key
*.pfx
*.p12
certificates/
secrets/
credentials/
private-key
service-account
```

Nunca commitar certificados, chaves privadas, senhas, tokens ou secrets.

---

# 8. Regra para migrations

Nunca executar migrations sem autorização explícita do usuário.

Se houver alterações em:

```txt
drizzle/
migrations/
prisma/migrations/
db/migrations/
supabase/migrations/
```

A skill deve:

1. Identificar a migration.
2. Informar o usuário.
3. Não executar nenhum comando de migration sem confirmação explícita.

Também não deve rodar comandos como:

```bash
drizzle-kit push
drizzle-kit migrate
prisma migrate
knex migrate
```

sem autorização explícita.

---

# 9. Rodar checks do projeto

Identificar o gerenciador de pacotes:

* pnpm-lock.yaml → pnpm
* yarn.lock → yarn
* package-lock.json → npm
* bun.lockb ou bun.lock → bun

Ler `package.json`.

Rodar os checks disponíveis, respeitando scripts existentes:

```bash
lint
test
build
typecheck
```

Exemplos:

```bash
pnpm lint
pnpm test
pnpm build
```

ou equivalentes conforme gerenciador.

Se um check não existir, não inventar comando.

Se algum check falhar:

* informar o erro
* não criar commit
* não abrir PR
* parar o fluxo

---

# 10. Fazer stage apenas dos arquivos relevantes

Não usar:

```bash
git add .
```

A skill deve analisar os arquivos alterados e adicionar apenas os arquivos relevantes.

Usar:

```bash
git add <arquivo-1> <arquivo-2>
```

Depois conferir:

```bash
git status
git diff --staged
```

Se houver dúvida se um arquivo deve entrar no commit, deixar fora e informar o usuário.

---

# 11. Criar commit

Criar commit seguindo Conventional Commits.

Exemplos:

```txt
feat: add async pdf generation flow
fix: prevent external requests during pdf rendering
refactor: move pdf generation to worker
chore: add pdf job infrastructure
```

A mensagem deve refletir as alterações reais.

Antes do commit, garantir que:

* não está em `main`
* não está em `staging`
* staged files são apenas os relevantes
* checks passaram ou foram declaradamente inexistentes

---

# 12. Push da branch

Executar:

```bash
git push -u origin <branch-name>
```

Nunca utilizar:

```bash
git push --force
git push -f
```

sem autorização explícita do usuário.

---

# 13. Criar Pull Request para staging

Criar PR apontando para:

```txt
base: staging
head: branch atual
```

Preferencialmente usando GitHub CLI:

```bash
gh pr create --base staging --head <branch-name> --title "<titulo>" --body "<descricao>"
```

Se `gh` não estiver autenticado, informar o usuário e fornecer o comando/manual necessário.

---

# 14. Template da PR

A descrição da PR deve seguir:

```md
## Resumo

- ...

## Plano relacionado

- `.portal/plans/<arquivo>.md`

## Alterações

- ...

## Checks executados

- [ ] lint
- [ ] test
- [ ] build
- [ ] typecheck

## Riscos / Pontos de atenção

- ...

## Migrations

- Não aplicável
```

Marcar apenas checks realmente executados.

Se algum check não existir, mencionar:

```txt
Não existe script configurado para este check.
```

---

# 15. Resultado esperado

Ao final, informar:

* branch usada/criada
* commit criado
* checks executados
* PR aberta
* link da PR
* riscos ou observações relevantes

---

# Regras absolutas

* Nunca commitar diretamente em `main`.
* Nunca commitar diretamente em `staging`.
* Sempre abrir PR para `staging`.
* Nunca usar `git add .`.
* Nunca commitar secrets.
* Nunca commitar certificados.
* Nunca executar migrations sem confirmação explícita.
* Nunca usar force push sem autorização explícita.
* Nunca usar `git reset --hard` sem autorização explícita.
* Nunca descartar alterações do usuário.
* Nunca resolver conflitos automaticamente se houver risco de perda de código.
* Não esconder falhas de lint, test ou build.

---

# Quando parar e pedir intervenção

Parar se:

* não houver alterações
* `staging` não existir
* houver conflito no stash pop
* houver conflito de merge
* lint/test/build/typecheck falhar
* houver arquivo sensível
* houver migration que exigiria execução
* não for possível identificar o gerenciador de pacotes
* `gh` não estiver autenticado
* houver dúvida sobre arquivo que deve ou não ser commitado
