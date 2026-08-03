---
name: improve-codebase-architecture
description: "Analisa oportunidades de arquitetura no FinGerence sem alterar código. Use para revisar acoplamento, duplicação estrutural, separação frontend/backend, multi-tenant, rotas, services, hooks, dados e testabilidade."
---

# Improve Codebase Architecture

Faça uma análise arquitetural do FinGerence em modo relatório.

## Regra Principal

Não editar código nesta skill. Entregar diagnóstico, oportunidades e riscos. Qualquer implementação deve virar task/plano antes.

Fluxo recomendado:

```txt
/improve-codebase-architecture -> /criar-task -> /planejar -> aprovação -> /implementar -> /finalizar
```

## Contexto do FinGerence

- Frontend React + TypeScript + Vite + Tailwind.
- Backend Express + TypeScript.
- Banco PostgreSQL com Drizzle.
- Sistema com área pública e área privada em `app.html`.
- Segurança, autenticação, dados financeiros e possível isolamento por tenant exigem cautela.
- Não existe PR nem staging obrigatório.
- Produção é no Render e exige confirmação antes de push/deploy.

## Como Analisar

1. Ler `AGENT.md` e `CLAUDE.md`.
2. Delimitar o escopo pedido pelo usuário.
3. Mapear módulos, rotas, services, hooks, componentes e contratos envolvidos.
4. Procurar duplicação real, acoplamento excessivo, responsabilidades misturadas e contratos frágeis.
5. Separar achados confirmados de hipóteses.
6. Não recomendar reescrita grande sem ganho claro.

## Focos de Arquitetura

- Separação entre páginas públicas e app autenticado.
- SEO público sem expor dados privados.
- Contratos frontend/backend claros.
- Hooks e services reutilizáveis sem lógica duplicada em componentes.
- Queries backend com filtros corretos e sem vazamento de dados.
- Validações de entrada no backend.
- Padrões de erro e logs sem dados sensíveis.
- Estrutura de testes possível para fluxos críticos.
- Simplicidade para um único desenvolvedor manter.

## Formato do Relatório

```md
## Diagnóstico Arquitetural

### Achado 1: <título>

**Área:** frontend | backend | banco | infra | fullstack
**Evidência:** arquivo:linha ou padrão observado
**Impacto:** ...
**Risco:** baixo | médio | alto
**Recomendação:** ...
**Próximo passo sugerido:** criar task | planejar | só monitorar
```

## Proibições

- Não alterar arquivos.
- Não executar migrations.
- Não alterar `.env`.
- Não fazer commit/push.
- Não mandar para produção.
- Não transformar análise em implementação sem aprovação.