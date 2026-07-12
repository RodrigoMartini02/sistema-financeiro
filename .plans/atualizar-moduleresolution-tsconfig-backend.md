# Plano de Implementação: Atualizar moduleResolution do backend (tsconfig)

## Origem

- Arquivo de especificação: pedido direto do usuário, a partir de um aviso de depreciação visto no VSCode em `backend/tsconfig.json`
- Data do planejamento: 2026-07-12
- Classificação: `infra/deploy`

## Resumo

`backend/tsconfig.json` usa `"moduleResolution": "Node"` (alias de `"node10"`), opção marcada pelo time do TypeScript como depreciada, com remoção prevista para o TypeScript 7. O commit `a64bbe3` já havia adicionado `"ignoreDeprecations": "5.0"` como tentativa de silenciar esse aviso, mas isso não resolve a causa — o aviso do editor continua aparecendo porque `ignoreDeprecations: "5.0"` não cobre essa depreciação específica.

A correção real é migrar para `"moduleResolution": "Node16"` (par oficial recomendado para projetos Node/CommonJS), o que também permite remover o `ignoreDeprecations` que hoje só mascara o sintoma. A mudança foi validada empiricamente: uma cópia temporária do `tsconfig.json` (fora do repositório rastreado, apagada logo em seguida) com `module`/`moduleResolution` em `Node16` compilou com `tsc --noEmit` sem nenhum erro novo.

## Escopo

### Dentro do escopo

- `backend/tsconfig.json`: trocar `"module": "CommonJS"` → `"Node16"`, `"moduleResolution": "Node"` → `"Node16"`, remover `"ignoreDeprecations": "5.0"`

### Fora do escopo

- Qualquer alteração de código-fonte em `backend/src/`
- Alteração de `backend/package.json` (`"type"` do pacote permanece ausente/CommonJS)
- tsconfig do frontend (`sistema financas/tsconfig.json`) — não apresentou o mesmo aviso, fora do escopo

## Leitura de contexto

- `backend/tsconfig.json` (estado atual)
- `git log -- backend/tsconfig.json` (histórico: `9739a73` criação, `a64bbe3` adição do `ignoreDeprecations`)
- `backend/node_modules/typescript/package.json` (versão instalada: 5.9.3)
- `backend/package.json` (confirma ausência de `"type": "module"`, saída permanece CommonJS)
- Teste empírico isolado com `tsc -p <config temporária> --noEmit` (arquivo criado e apagado fora do commit, apenas para validar a mudança antes de propor o plano)

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

Apenas configuração de type-checking (`tsc --noEmit`, usado só para validação — o runtime real é `tsx`, que resolve módulos via esbuild e não depende do `moduleResolution` do tsconfig). Sem mudança de comportamento em runtime, sem mudança na saída CommonJS.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado. Não altera Start Command, env vars nem processo de build/deploy no Render.

## Arquivos provavelmente afetados

- `backend/tsconfig.json`

## Estratégia de implementação

1. Editar `backend/tsconfig.json`: `module` → `"Node16"`, `moduleResolution` → `"Node16"`, remover linha `ignoreDeprecations`.
2. Rodar `cd backend && npm run build` (`tsc --noEmit`) e confirmar zero erros.
3. Confirmar no editor (VSCode) que o aviso de depreciação desaparece.
4. Commit isolado, seguir fluxo padrão de `/finalizar`.

## Regras de negócio identificadas

Nenhuma — mudança de configuração de build/type-check, sem lógica de negócio envolvida.

## Regras multi-tenant e segurança

Não aplicável.

## Validações necessárias

- `tsc --noEmit` sem erros novos.
- Nenhuma mudança de saída em runtime (a app roda via `tsx`, que ignora `moduleResolution` do tsconfig).

## Testes necessários

### Frontend

Não aplicável.

### Backend

- `cd backend && npm run build` sem erros.
- Boot local do backend (`npm run dev` ou `npm start`) sem erros, para confirmar que `tsx` continua executando normalmente (não deveria ser afetado, mas validação rápida de segurança).

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
```

## Riscos e pontos de atenção

- Risco muito baixo: mudança já validada empiricamente fora do repositório rastreado, sem erros novos.
- `moduleResolution: Node16` é mais rigoroso que `Node10` para imports ESM-style, mas como o pacote não declara `"type": "module"`, a saída continua CommonJS e o comportamento de resolução para arquivos relativos permanece equivalente ao atual.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `backend/tsconfig.json` não usa mais `moduleResolution: "Node"` nem `ignoreDeprecations`.
- `tsc --noEmit` passa sem erros.
- Aviso de depreciação não aparece mais no editor.

## Observações para a skill implementar

- Mudança pequena e isolada — não expandir escopo para outros arquivos de configuração.
- Confirmar que `backend/package.json` continua sem `"type": "module"` antes e depois (não deve ser alterado).
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
