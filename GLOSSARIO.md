# Glossário

Nomenclatura de referência para os papéis/entidades do sistema. Termos em português para conversa, termos técnicos (inglês) para uso em código/API/banco.

| Termo (PT) | Termo técnico | Definição |
|---|---|---|
| Titular | `owner` | Quem cria a conta pela home; dono da conta. |
| Membro | `member` | Pessoa vinculada a uma conta do tipo pessoal (PF). |
| Conta vinculada | `linkedAccount` | Conta adicional criada pelo titular (ex: PJ criada a partir de uma PF). |
| Colaborador | `collaborator` | Pessoa vinculada a uma conta do tipo empresa (PJ). |

## Observação

Hoje, no código, Membro e Colaborador são o mesmo conceito técnico — mesma tabela (`conta_membros`), mesmo cadastro, mesma lógica. Só o rótulo de texto muda conforme o tipo de conta (PF fala em "membro", PJ fala em "colaborador"). Não há, ainda, diferença de permissões/função entre os dois.


Titular → owner
Membro → member
Conta vinculada → linkedAccount
Colaborador → collaborator