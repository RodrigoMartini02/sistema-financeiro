---
name: limpar
description: "Auditoria report-only de limpeza no FinGerence. Use para encontrar dead code, duplicação, resíduos, arquivos órfãos, inconsistências e sobras de IA; antes de analisar, pergunta se o escopo é apenas o que está em aberto ou o projeto inteiro."
---

# Limpar

Faça uma auditoria de limpeza no FinGerence em modo relatório.

## Pergunta Obrigatória de Escopo

Antes de iniciar, pergunte:

```txt
Você quer analisar:

1. Somente o que está em aberto no git, incluindo diff, staged e untracked
2. O projeto inteiro
```

Só comece após a resposta.

## Modo de Operação

- Report-only por padrão.
- Não editar arquivos sem aprovação explícita.
- Não fazer commit.
- Não fazer push.
- Não mandar para produção.
- Não executar migrations.
- Não alterar `.env` ou secrets.

## Escopo 1: O Que Está em Aberto

Usar:

```bash
git status
git diff
git diff --staged
```

Auditar arquivos modificados, staged e untracked relevantes.

## Escopo 2: Projeto Inteiro

Auditar frontend, backend e arquivos públicos, respeitando limites de tempo e priorizando:

- rotas e páginas públicas;
- componentes duplicados;
- código morto;
- imports e exports órfãos;
- estilos duplicados;
- arquivos antigos não referenciados;
- resíduos de implementação anterior;
- logs temporários;
- código escondido com `display: none`, `false &&`, comentários grandes ou flags fixas;
- dependências aparentemente não usadas;
- riscos de expor dados privados no frontend público.

## Cuidados Especiais do FinGerence

- Área privada em `app.html` pode ter `noindex`; isso não é erro por si só.
- Páginas públicas e sitemap/robots devem ser tratadas separadamente da área autenticada.
- Backend é sensível a tenant/prefeitura; nunca sugerir remoção de filtros sem análise.
- Achados de banco devem ser `suspected`, nunca remoção automática.

## Formato do Relatório

Ordenar por severidade e confiança.

```md
### [categoria] arquivo:linha
**O que:** ...
**Evidência:** ...
**Confiança:** confirmed | suspected
**Recomendação:** ...
```

Finalizar com:

```md
## Resumo

- N achados confirmados
- N achados suspeitos
- Nenhuma alteração aplicada

Quer que eu aplique algum item?
```

## Aplicação de Correções

Somente aplicar após o usuário escolher explicitamente quais achados corrigir.

Após aplicar, rodar validações relevantes e lembrar que `/finalizar` cuida de commit e produção.