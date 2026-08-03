---
name: write-a-skill
description: "Cria ou atualiza skills locais do FinGerence em .agents/skills. Use quando o usuário pedir para criar, corrigir, padronizar ou adaptar comandos /skills do projeto."
---

# Write a Skill

Crie ou atualize skills locais para o projeto FinGerence.

## Local

Skills locais ficam em:

```txt
.agents/skills/{nome-da-skill}/SKILL.md
```

O nome deve usar letras minúsculas, números e hífens.

## Frontmatter Obrigatório

Todo `SKILL.md` deve começar com:

```yaml
---
name: nome-da-skill
description: "Descrição curta dizendo o que faz e quando usar."
---
```

A descoberta da skill depende principalmente de `name` e `description`. Mantenha a descrição clara e direta.

## Padrões do FinGerence

- Não mencionar PR ou staging, salvo para dizer que o projeto não usa esse fluxo.
- Produção é no Render; qualquer push/deploy exige confirmação explícita.
- O projeto é tocado por um único desenvolvedor.
- Fluxo padrão: `/criar-task` -> `/planejar` -> aprovação -> `/implementar` -> `/finalizar`.
- Não executar migrations sem confirmação explícita.
- Não alterar `.env` ou secrets.
- Não criar skills muito longas; preferir instruções curtas e objetivas.
- Usar UTF-8 correto.

## Ao Atualizar Skills

1. Ler a skill existente.
2. Procurar termos herdados de outros projetos, como `Aether`, `.portal`, `staging`, `Pull Request` e regras incompatíveis.
3. Corrigir para `.plans/` quando falar de planos.
4. Manter instruções específicas o bastante para guiar o agente.
5. Validar se todas as skills possuem frontmatter válido.

## Saída

Informar quais skills foram criadas ou alteradas e quais regras principais foram padronizadas.