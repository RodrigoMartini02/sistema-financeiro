import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Income, IncomeFormValues } from '../../types/finance';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle } from '../../ui/dialogFormTokens';
import { fetchContas } from '../../services/configService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { formatCurrency } from './formatters';
import { IncomeForm, type IncomeFormHandle, type IncomeFormResumo } from './IncomeForm';

/**
 * Item do lote. O `id` existe só para a chave do React: sem ele, remover a
 * receita do meio faria o React reaproveitar o formulário seguinte pelo índice
 * e o estado interno (valores digitados, anexos) escorregaria de uma receita
 * para a outra.
 *
 * `valoresIniciais` é apenas a semente da montagem — depois disso a verdade
 * está dentro do próprio formulário, lida por `IncomeFormHandle.getValues()`
 * no submit.
 */
interface ItemLote {
  id: number;
  valoresIniciais: IncomeFormValues;
}

/** Estado vazio: usado enquanto um formulário ainda não publicou seu resumo. */
const RESUMO_VAZIO: IncomeFormResumo = {
  preenchido: false, valor: 0, duplicata: null, clienteInvalido: false,
};

interface Props {
  open: boolean; month: number; year: number;
  income?: Income; isSaving: boolean; error?: string;
  presetDate?: string;
  onClose: () => void;
  onSave: (items: IncomeFormValues[]) => Promise<void>;
}

/**
 * Orquestra os formulários de receita. O formulário do topo é o de entrada; as
 * receitas já adicionadas ao lote aparecem abaixo, cada uma como um IncomeForm
 * completo e editável, na ordem de inclusão.
 *
 * O pai guarda só o que é compartilhado — a conta, a lista do lote, o estado
 * de gravação e o rodapé. O estado por receita (useForm, anexos, watches,
 * derivados) vive dentro de cada IncomeForm, para que digitar num formulário
 * não re-renderize os irmãos.
 */
export function IncomeDialog({ open, month, year, income, isSaving, error, presetDate, onClose, onSave }: Props) {
  const isEditing = !!income;
  const isNew = !income;

  // Seletor de conta: so relevante para quem tem mais de uma (dono de PF+PJs).
  // A conta escolhida aqui vale para o formulario do topo E para todo o lote —
  // nao ha selecao por item individual.
  const contasQuery = useQuery({ queryKey: queryKeys.contas, queryFn: () => fetchContas(), enabled: open });
  const contas = contasQuery.data ?? [];
  const [contaId, setContaId] = useState<number | null>(() => getActiveAccountId());

  // Ao abrir o modal, volta para a conta ativa — nao herda a escolha de uma
  // sessao anterior do mesmo modal.
  useEffect(() => {
    if (open) setContaId(getActiveAccountId());
  }, [open]);

  const contaSelecionada = contas.find((c) => c.id === contaId);
  const isEmpresa = contaSelecionada
    ? contaSelecionada.tipo === 'empresa'
    : localStorage.getItem('contaAtivaTipo') === 'empresa';

  const bodyRef = useRef<HTMLDivElement>(null);
  // Delimita o formulário do topo, para os atalhos distinguirem de qual
  // formulário empilhado veio a tecla.
  const topoRef = useRef<HTMLDivElement>(null);

  const [batch, setBatch] = useState<ItemLote[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Contador de ids do lote. Ref e não state: só precisa ser único, e mudá-lo
  // não deve provocar render.
  const proximoIdRef = useRef(1);

  // ── Ligação com os formulários filhos ────────────────────────────────
  // O submit lê os valores atuais pelos handles, em vez de manter um espelho
  // sincronizado a cada tecla. Cada formulário publica separadamente um resumo
  // enxuto — o suficiente para o rodapé, sem trafegar o objeto inteiro a cada
  // caractere digitado.
  const formTopoRef = useRef<IncomeFormHandle>(null);
  const formsLoteRef = useRef<Map<number, IncomeFormHandle | null>>(new Map());

  const [resumoTopo, setResumoTopo] = useState<IncomeFormResumo>(RESUMO_VAZIO);
  const [resumosLote, setResumosLote] = useState<Record<number, IncomeFormResumo>>({});

  const registrarFormLote = (id: number) => (handle: IncomeFormHandle | null) => {
    if (handle) formsLoteRef.current.set(id, handle);
    else formsLoteRef.current.delete(id);
  };

  const registrarResumoLote = (id: number) => (resumo: IncomeFormResumo) => {
    setResumosLote((prev) => ({ ...prev, [id]: resumo }));
  };

  // Fechar o modal descarta o lote: nada nele foi gravado, e reabrir com as
  // receitas da sessão anterior faria o usuário salvar sem querer o que já
  // tinha desistido de lançar.
  useEffect(() => {
    if (open) return;
    setBatch([]);
    setResumosLote({});
    setResumoTopo(RESUMO_VAZIO);
    formsLoteRef.current.clear();
    setSavedMessage('');
  }, [open]);

  const hasBatch = batch.length > 0;
  const batchTotal = batch.reduce(
    (sum, item) => sum + (resumosLote[item.id]?.valor ?? item.valoresIniciais.valor ?? 0),
    0,
  );

  // Cliente digitado que não existe no cadastro trava o salvamento — tanto no
  // topo quanto em qualquer item do lote, senão o erro só apareceria ao gravar.
  const algumClienteInvalido = resumoTopo.clienteInvalido
    || batch.some((item) => resumosLote[item.id]?.clienteInvalido);

  const podeAdicionar = resumoTopo.preenchido && !resumoTopo.clienteInvalido;
  const canSubmit = (resumoTopo.preenchido || hasBatch) && !algumClienteInvalido;

  // O aviso de duplicata é o do formulário que o usuário está preenchendo; se
  // o topo estiver limpo, o do último item do lote que detectou uma. Um aviso
  // por vez — empilhar N no rodapé fixo comeria a área dos botões.
  const duplicataAviso = resumoTopo.duplicata
    ?? [...batch].reverse().map((item) => resumosLote[item.id]?.duplicata).find(Boolean)
    ?? null;

  /**
   * Move a receita do formulário do topo para o lote e devolve o topo limpo,
   * pronto para a próxima. Nada é gravado aqui — a gravação só acontece no
   * submit, e por isso o item continua totalmente editável abaixo.
   */
  const handleAddToBatch = () => {
    const valores = formTopoRef.current?.getValues();
    if (!valores) return;
    setBatch((prev) => [...prev, { id: proximoIdRef.current++, valoresIniciais: valores }]);
    formTopoRef.current?.reset();
    setTimeout(() => formTopoRef.current?.focus(), 50);
  };

  const removerDoLote = (id: number) => {
    formsLoteRef.current.delete(id);
    setResumosLote((prev) => {
      const proximo = { ...prev };
      delete proximo[id];
      return proximo;
    });
    setBatch((prev) => prev.filter((item) => item.id !== id));
  };

  /**
   * Consolida na ordem de exibição: primeiro os itens do lote, com as edições
   * feitas neles depois de adicionados, e por último o formulário do topo, se
   * estiver preenchido. Um item do lote cujo formulário tenha ficado
   * incompleto cai de volta nos valores com que entrou, para não sumir.
   */
  const coletarItens = (): IncomeFormValues[] => {
    const doLote = batch.map((item) => formsLoteRef.current.get(item.id)?.getValues() ?? item.valoresIniciais);
    const doTopo = formTopoRef.current?.getValues();
    return doTopo ? [...doLote, doTopo] : doLote;
  };

  const doSave = async () => {
    const items = coletarItens();
    if (items.length === 0) return;
    setIsSavingAll(true);
    try {
      await onSave(items);
      setBatch([]);
      setResumosLote({});
      formsLoteRef.current.clear();
      formTopoRef.current?.reset();
      setSavedMessage(items.length > 1 ? `✓ ${items.length} receitas registradas` : '✓ Receita registrada');
      setTimeout(() => setSavedMessage(''), 2600);
    } finally {
      setIsSavingAll(false);
    }
  };

  const submitForm = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    void doSave();
  };

  // Enter salva, Shift+Enter adiciona ao lote. Os atalhos ficam no <form> e
  // valem para qualquer formulário empilhado — mas Shift+Enter só faz sentido
  // no do topo, que é o único que alimenta o lote.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // O formulário para o Escape quando o autocomplete está aberto; se
      // chegou aqui, é para fechar o modal mesmo.
      onClose();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Deixa passar quando o alvo é um controle que usa Enter por conta
      // própria (autocomplete de descrição, campo de novo cliente/tipo) —
      // esses já chamam preventDefault e param aqui.
      if (e.defaultPrevented) return;
      e.preventDefault();
      submitForm();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      // Só o formulário do topo alimenta o lote. Digitado dentro de um item já
      // adicionado, o atalho duplicaria o conteúdo do topo — que não é o que o
      // usuário está olhando.
      if (!topoRef.current?.contains(e.target as Node)) return;
      handleAddToBatch();
    }
  };

  return (
    <Dialog
      open={open}
      title={income ? 'Editar receita' : 'Nova receita'}
      description="Registre uma entrada financeira"
      onClose={onClose}
      size="lg"
      scrollBody={false}
    >
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onSubmit={submitForm}
        onKeyDown={handleKeyDown}
      >
        {/* Corpo rolável. Blocos separados por linha de 1px, não por cards com
            borda: dentro de um modal, card sobre card cria moldura dupla. */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* So aparece para quem tem mais de uma conta (dono de PF+PJs). */}
          {contas.length > 1 && (
            <div>
              <label style={labelStyle}><span>Conta</span></label>
              <select
                value={contaId ?? ''}
                onChange={(e) => setContaId(e.target.value ? Number(e.target.value) : null)}
                style={fieldInputStyle}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social || c.nome} {c.tipo === 'empresa' ? '(PJ)' : '(PF)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Formulário de entrada: sempre no topo, sempre vazio depois de
              adicionar ao lote. O wrapper delimita a região para o atalho
              Shift+Enter saber que a tecla veio daqui. */}
          <div
            ref={topoRef}
            style={{
              background: C.panelBg, border: `1px solid ${C.panelBorder}`,
              borderRadius: 12, padding: 12,
            }}
          >
            <IncomeForm
              ref={formTopoRef}
              income={income}
              month={month}
              year={year}
              presetDate={presetDate}
              contaId={contaId}
              isEmpresa={isEmpresa}
              isNew={isNew}
              open={open}
              autoFocus
              guideEnabled
              onResumoChange={setResumoTopo}
            />
          </div>

          {/* Receitas já adicionadas, na ordem de inclusão, cada uma como
              formulário completo e editável. Nada aqui foi salvo: a gravação
              só acontece no submit, então tudo continua aberto até lá. */}
          {hasBatch && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textSoft, textTransform: 'uppercase' }}>
                  No lote · {batch.length} receita{batch.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(batchTotal)}
                </span>
              </div>

              {batch.map((item, indice) => (
                <div
                  key={item.id}
                  style={{
                    background: C.cardBg, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: 12,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  <IncomeForm
                    ref={registrarFormLote(item.id)}
                    valoresIniciais={item.valoresIniciais}
                    month={month}
                    year={year}
                    presetDate={presetDate}
                    contaId={contaId}
                    isEmpresa={isEmpresa}
                    isNew={isNew}
                    open={open}
                    titulo={`Receita ${indice + 1}`}
                    onRemover={() => removerDoLote(item.id)}
                    onResumoChange={registrarResumoLote(item.id)}
                  />
                </div>
              ))}
            </>
          )}

          {error && (
            <div style={{ borderRadius: 10, border: '1px solid #fbd5d1', background: '#fef3f2', padding: '8px 10px', fontSize: 11.5, color: '#b42318' }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {duplicataAviso && (
            <div style={{ fontSize: '12.5px', color: '#a3728a' }}>
              Você já lançou "{duplicataAviso.descricao}" nos últimos 7 dias — é outra receita?
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={savedMessage
              ? { fontSize: '12.5px', fontWeight: 600, color: C.success, display: 'flex', alignItems: 'center', gap: 6 }
              : { fontSize: '12.5px', color: !canSubmit ? '#a3728a' : C.textMuted }
            }>
              {savedMessage || (canSubmit ? '' : 'Preencha descrição e valor para registrar.')}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Editar uma receita já gravada não tem lote: o que está aberto
                  é aquele lançamento, não uma lista nova. */}
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleAddToBatch}
                  disabled={!podeAdicionar}
                  style={{
                    padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                    whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                    cursor: podeAdicionar ? 'pointer' : 'not-allowed',
                    ...(podeAdicionar
                      ? { background: C.primarySoft, color: C.primaryDark }
                      : { background: '#e6edf1', color: '#a3b6c0' }),
                  }}
                >
                  + Adicionar ao lote
                </button>
              )}

              <button
                type="submit"
                disabled={!canSubmit || isSaving || isSavingAll}
                style={{
                  padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: canSubmit && !isSaving && !isSavingAll ? 'pointer' : 'not-allowed',
                  ...(canSubmit
                    ? { background: C.primary, color: '#fff' }
                    : { background: '#e6edf1', color: '#a3b6c0' }),
                }}
              >
                {isSaving || isSavingAll
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : hasBatch
                      ? `Registrar ${batch.length + (resumoTopo.preenchido ? 1 : 0)} receitas`
                      : 'Registrar receita'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
