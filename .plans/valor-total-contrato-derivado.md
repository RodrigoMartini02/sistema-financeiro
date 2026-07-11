# Plano de Implementação: Valor Total do Contrato Derivado Automaticamente

## Origem

- Data do planejamento: `2026-07-05`
- Classificação: `frontend-only`

## Resumo

Atualmente o "Valor total do contrato" é um campo editável manual, e existe uma variável `somaCalc` que já calcula o valor correto a partir dos componentes — mas os dois vivem separados. A feature remove a edição manual e faz o total ser sempre derivado da fórmula:

```
valor_total = (valor_mensal × período_meses)
            + implantação_total
            + (horas_presenciais_saldo_ini × horas_presenciais_valor)
            + (horas_remotas_saldo_ini × horas_remotas_valor)
```

## Escopo

### Dentro do escopo

- Remover o `useState` de `valTotal`
- Mover `periodoMeses` e `somaCalc` para o nível do componente (antes de `saveValores`)
- Atualizar `saveValores` para enviar `somaCalc` como `vContrato`
- Substituir o input editável "Valor total do contrato" por display read-only
- Adicionar decomposição visual da fórmula (cada linha: mensalidade, implantação, horas presenciais, horas remotas)
- Remover bloco `temAlerta` (alerta de divergência — não se aplica mais)

### Fora do escopo

- Qualquer mudança no backend ou banco de dados
- Mudança nos outros campos editáveis (mensal, implantação, horas)
- Novos endpoints ou queries

## Leitura de contexto

- `/AGENT.md`
- `src/screens/config/ClienteDetail.tsx`

## Impacto por área

### Frontend

- **Arquivo:** `src/screens/config/ClienteDetail.tsx`
- **Componente:** `ContratoModal`
- Remover `useState` de `valTotal` e seu reset no `useEffect`
- Mover cálculo de `periodoMeses` e `somaCalc` para nível do componente
- Atualizar `saveValores`: `vContrato: somaCalc`
- Substituir `<Input>` de valTotal por display read-only com `formatCurrency(somaCalc)`
- Adicionar decomposição visual da fórmula
- Remover bloco `temAlerta`

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. O campo `valor_contrato` já existe e o endpoint `PUT /contratos/:id` já o aceita.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ClienteDetail.tsx`

## Estratégia de implementação

1. Remover `const [valTotal, setValTotal]` do state e seu reset no `useEffect`
2. Mover `periodoMeses` para o nível do componente (retorna `0` quando `contrato` é undefined)
3. Mover `somaCalc` para o nível do componente (depende de `periodoMeses` + states existentes)
4. Atualizar `saveValores`: `vContrato: somaCalc` em vez de `parseFloat(valTotal) || 0`
5. No JSX: substituir o `<Input>` de `valTotal` por display read-only com `formatCurrency(somaCalc)`
6. Adicionar bloco de decomposição mostrando cada parcela da soma (mensalidade × período, implantação, horas presenciais, horas remotas) — exibir apenas as parcelas > 0
7. Remover `temAlerta` e o bloco de alerta `⚠`
8. Executar `vite build` para validar

## Regras de negócio identificadas

- `valor_total = (valor_mensal × período_meses) + implantação_total + (hp_saldo_ini × hp_valor) + (hr_saldo_ini × hr_valor)`
- Período = diferença em meses entre `data_assinatura` e `vencimento`, ambos inclusive
- Implantação = total bruto (parcelas × valor/parcela), já armazenado como `implTotal` no state
- Horas presenciais = `horas_presenciais_saldo_ini × horas_presenciais_valor`
- Horas remotas = `horas_remotas_saldo_ini × horas_remotas_valor`

## Validações necessárias

- `periodoMeses` deve ser `0` quando datas não estão preenchidas (contrato novo ou incompleto)
- Exibir `R$ 0,00` quando todos os componentes são zero

## Riscos e pontos de atenção

- `periodoMeses` era calculado dentro do IIFE do JSX — mover para nível do componente é seguro; quando `contrato` é `undefined` deve retornar `0`
- `somaCalc` no nível do componente garante que `saveValores` sempre usa o valor atual do render

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Campo "Valor total do contrato" não é mais editável manualmente
- O total é calculado automaticamente ao alterar qualquer componente (mensal, implantação, horas)
- A decomposição da fórmula é visível para o usuário
- O valor calculado é salvo corretamente no banco via `saveValores` (onBlur dos inputs)
- `vite build` passa sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não executar migrations sem confirmação explícita
- Manter alterações focadas no componente `ContratoModal`
- Não alterar `ContratoForm`, `CatalogoServicoRow` nem outros componentes
