# Plano de Implementação: Redesign modal de contrato — layout unificado

## Origem

- Data do planejamento: `2026-07-10`
- Classificação: `frontend-only`

## Resumo

O modal de contrato atual usa duas abas ("Dados do contrato" / "Valores"), campos sempre editáveis e sem validação de Faturando. O redesign unifica tudo em um modal mais largo, introduz modo leitura com botão Editar, e valida que Faturando só pode ser marcado quando o serviço tem valor_mensal > 0.

## Escopo

### Dentro do escopo

- Remover sistema de abas (`MODAL_TABS`, `activeTab`, tabs UI)
- Expandir modal: `size="lg"` → `size="xl"` (ou `max-w-5xl` via className)
- Layout em duas colunas no topo: **Dados do contrato** (esquerda) | **Valores** (direita)
- Abaixo das colunas: **Discriminação de prestação de serviço** (largura total)
- Abaixo: **Anexos** (largura total, só para contrato existente)
- Adicionar estado `isEditing: boolean` (false para contrato existente, true para novo)
- Modo leitura: campos como texto estático; botão "Editar" no header desbloqueia tudo
- Modo edição: campos viram inputs; footer mostra "Salvar contrato" + "Cancelar"
- Cancelar em modo edição: reverte estado para valores originais do contrato e volta para modo leitura
- Checkboxes Contratado/Implantado/Faturando bloqueados em modo leitura (**decisão B**)
- Validação: checkbox "Faturando" de um serviço só fica habilitado se `valor_mensal > 0` naquele serviço
- Tooltip/texto de ajuda no Faturando desabilitado: "Defina o valor/mês primeiro"

### Fora do escopo

- Backend (nenhuma alteração)
- Lógica de save/mutation (`patchValoresMut`, `saveValores`, `handleSaveWithValores`)
- Cards de resumo (já corrigidos: Mensal / Total Anual / Faturando)
- CatalogoServicoRow — só ajuste no prop de disabled para checkboxes

## Arquivos afetados

- `src/screens/config/ClienteDetail.tsx` — único arquivo alterado

## Estratégia de implementação

### 1. Remover tabs

- Deletar constante `MODAL_TABS`
- Deletar estado `activeTab` e `setActiveTab`
- Deletar o bloco JSX das tabs (`.flex.gap-1.border-b`)
- Deletar os blocos condicionais `{activeTab === 'dados' && ...}` e `{activeTab === 'servicos' && ...}`

### 2. Adicionar estado isEditing

```tsx
const [isEditing, setIsEditing] = useState(!contrato); // novo: sempre edit mode
```

Resetar no `useEffect` de `open`:
```tsx
useEffect(() => {
  if (open) {
    setIsEditing(!contrato);
    setPendingServicos(new Map());
  }
}, [open, contrato?.id]);
```

Função cancelar — reverte inputs para valores do contrato atual:
```tsx
const handleCancelEdit = () => {
  setValMensal(fv(contrato?.valor_mensal));
  setImplTotal(fv((contrato?.implantacao_parcelas ?? 1) * (contrato?.implantacao_valor_parcela ?? 0)));
  setImplParc(fv(contrato?.implantacao_parcelas));
  setHpValor(fv(contrato?.horas_presenciais_valor));
  setHpIni(fv(contrato?.horas_presenciais_saldo_ini));
  setHrValor(fv(contrato?.horas_remotas_valor));
  setHrIni(fv(contrato?.horas_remotas_saldo_ini));
  setIsEditing(false);
};
```

### 3. Expandir modal

No `<Dialog>`:
```tsx
size="xl"  // ou adicionar className="max-w-5xl"
```

Verificar se o componente `Dialog` suporta `size="xl"` — se não, adicionar via `className`.

### 4. Novo layout JSX (sem abas)

```tsx
<Dialog open={open} title={...} onClose={onClose} size="xl">
  <div className="grid gap-5">

    {/* Header action */}
    {contrato && !isEditing && (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Editar
        </Button>
      </div>
    )}

    {/* Linha 1: Dados + Valores lado a lado */}
    <div className="grid grid-cols-2 gap-6 items-start">

      {/* Coluna esquerda: Dados do contrato */}
      <div className="grid gap-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Dados do contrato
        </span>
        <ContratoForm
          contrato={contrato}
          representantes={representantes}
          disabled={!isEditing}
          onSubmit={handleSaveWithValores}
        />
      </div>

      {/* Coluna direita: Valores */}
      <div className="grid gap-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Valores
        </span>
        {/* Cards */}
        {/* Campos de valor (condicionais: input se isEditing, texto se não) */}
      </div>

    </div>

    {/* Linha 2: Discriminação */}
    {/* ... CatalogoServicoRow com disabled={!isEditing} */}

    {/* Linha 3: Anexos */}
    {contrato && <ContratoAnexos contratoId={contrato.id} />}

    {/* Footer: só em modo edição */}
    {isEditing && (
      <div className="flex justify-end gap-2">
        {contrato && (
          <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
        )}
        <Button
          disabled={isSaving || patchValoresMut.isPending}
          onClick={handleFooterSave}
        >
          {isSaving || patchValoresMut.isPending ? 'Salvando...' : 'Salvar contrato'}
        </Button>
      </div>
    )}

  </div>
</Dialog>
```

**Campos no modo leitura vs edição:**
- `isEditing = true` → `<Input>` normais
- `isEditing = false` → `<div className="...texto-readonly">` mostrando o valor formatado

**Padrão para campo de leitura:**
```tsx
{isEditing ? (
  <Input value={valMensal} onChange={...} onBlur={saveValores} />
) : (
  <p className="text-sm font-semibold text-slate-700">{formatCurrency(vMensalNum)}</p>
)}
```

### 5. Ajuste em CatalogoServicoRow

Passar prop `disabled={!isEditing}` para o componente. Dentro do `CatalogoServicoRow`:
- Quando `disabled=true`: checkboxes com `disabled` e cursor não permitido
- Campo `valor_mensal` com `readOnly` e sem `onChange`

### 6. Validação Faturando

Dentro de `CatalogoServicoRow`, a checkbox "Faturando" deve ter:
```tsx
disabled={disabled || !vinculo || (vinculo.valor_mensal ?? 0) <= 0}
title={(!vinculo || (vinculo.valor_mensal ?? 0) <= 0) ? 'Defina o valor/mês primeiro' : undefined}
```

### 7. handleFooterSave unificado

Remover a lógica de branch por `activeTab`. O save sempre tenta:
- Se `contrato` existe: chama `patchValoresMut` com valores (dados do contrato vêm do form)
- Se novo contrato: `requestSubmit` do form

Simplificado:
```tsx
const handleFooterSave = () => {
  if (contrato) {
    patchValoresMut.mutate({ vMensal, iTotal, iParc, hpV, hpI, hrV, hrI },
      { onSuccess: () => { setIsEditing(false); onClose(); } }
    );
  } else {
    (document.getElementById('contrato-form') as HTMLFormElement | null)?.requestSubmit();
  }
};
```

**Atenção:** Para contrato existente, os dados do formulário (número, representante, datas) também precisam ser salvos junto com os valores. Verificar se `ContratoForm` com `onSubmit` cobre isso ou se precisa de um save unificado.

**Decisão de implementação:** manter `handleSaveWithValores` como está (já recebe os dados do form + injeta os valores). O `patchValoresMut` salva apenas os valores; os dados do contrato são salvos via form submit. Isso pode ser ajustado durante a implementação se ficar confuso.

## Riscos e pontos de atenção

- O componente `Dialog` pode não suportar `size="xl"` — verificar prop antes e adaptar
- O `ContratoForm` renderiza um `<form id="contrato-form">` — verificar se pode receber `disabled` para desabilitar todos os inputs internos
- `onBlur={saveValores}` nos campos de valor: avaliar se deve continuar ou remover em modo edição (conflito com botão Salvar)
- Se `handleFooterSave` salva via `patchValoresMut` mas o form de dados fica separado, o usuário precisa clicar "Salvar" uma vez — verificar se salva tudo junto

## Critérios de aceite

- Modal abre sem abas, mostrando dados + valores lado a lado + discriminação abaixo
- Contrato existente: todos os campos em modo leitura; botão "Editar" no header desbloqueia
- Após editar e salvar: volta para modo leitura com dados atualizados
- Cancelar: reverte inputs para valores originais e volta para modo leitura
- Checkbox "Faturando" desabilitado quando serviço não tem valor_mensal > 0
- Novo contrato: sempre abre em modo edição, sem botão Editar
- TypeScript sem novos erros
