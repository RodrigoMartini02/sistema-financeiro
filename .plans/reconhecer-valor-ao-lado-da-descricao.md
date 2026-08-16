# Plano: Reconhecer valor ao lado da descrição

## Origem

- Solicitação: reconhecer corretamente entradas como "salario 5000" no assistente financeiro.
- Classificação: `backend-only`, sem alteração de banco.

## Resumo

Evoluir o parser determinístico para reconhecer um valor numérico no fim de uma descrição, interpretar separadores brasileiros de milhar e impedir que datas e vencimentos sejam tratados como valores.

## Escopo

### Dentro do escopo

- Interpretar `salario 5000`, `mercado 82,50` e `aluguel 1.500` como descrição e valor.
- Tratar pontos de milhar brasileiros corretamente.
- Manter leitura atual de R$, verbos de pagamento, Pix e valores por extenso.
- Rejeitar números que façam parte de data, dia ou vencimento quando não houver outro sinal de valor.
- Cobrir os cenários com testes unitários do parser.

### Fora do escopo

- Mudanças no formulário, banco, migrations, IA externa, áudio ou confirmação de lançamento.

## Arquivos Provavelmente Afetados

- `backend/src/services/financialAssistant.ts`
- `backend/src/services/financialAssistant.test.ts`

## Estratégia de Implementação

1. Ajustar a normalização numérica para distinguir decimal e milhar em formato brasileiro.
2. Adicionar extração de valor numérico ao final de uma descrição quando não houver sinal de data/vencimento.
3. Preservar a prioridade dos formatos explícitos já existentes.
4. Incluir regressões para descrição mais valor, milhares e datas.

## Segurança, Dados e Multi-Tenant

- A alteração apenas prepara rascunhos e não grava dados no banco.
- A confirmação humana obrigatória permanece inalterada.

## Validações Necessárias

- Checagem TypeScript do backend.
- Testes do backend.
- Teste direto do parser para `salario 5000`.

## Critérios de Aceite

- `salario 5000` produz descrição `salario` e valor `5000`.
- `aluguel 1.500` produz valor `1500`.
- `vence dia 15` não produz valor.
- Os testes existentes continuam passando.
