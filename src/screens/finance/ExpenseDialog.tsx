import { useEffect, useMemo, useRef, useState } from 'react';
import type { Expense, ExpenseFormValues } from '../../types/finance';
import { Dialog } from '../../ui/dialog';
import { C } from '../../ui/dialogFormTokens';
import { formatCurrency } from './formatters';
import { ExpenseForm, type ExpenseFormHandle, type ExpenseFormResumo } from './ExpenseForm';

const formatBr = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Item do lote. O `id` existe só para a chave do React: sem ele, remover a
 * despesa do meio faria o React reaproveitar o formulário seguinte pelo índice
 * e o estado interno (valores digitados, anexos) escorregaria de uma despesa
 * para a outra.
 *
 * `valoresIniciais` é apenas a semente da montagem — depois disso a verdade
 * está dentro do próprio formulário, lida por `ExpenseFormHandle.getValues()`
 * no submit.
 */
interface ItemLote {
  id: number;
  valoresIniciais: ExpenseFormValues;
}

/** Estado vazio: usado enquanto um formulário ainda não publicou seu resumo. */
const RESUMO_VAZIO: ExpenseFormResumo = { preenchido: false, valor: 0, duplicata: null };

interface Props {
  open: boolean;
  /** Mês/ano do painel de origem. Continuam na interface porque as telas os
   *  passam, mas o formulário deriva as datas do que é digitado — nenhum dos
   *  dois é lido aqui. */
  month: number; year: number;
  expense?: Expense; isSaving: boolean; error?: string;
  presetDate?: string;
  onClose: () => void;
  onSave: (items: ExpenseFormValues[]) => Promise<void>;
}

/**
 * Orquestra os formulários de despesa. O formulário do topo é o de entrada; as
 * despesas já adicionadas ao lote aparecem abaixo, cada uma como um
 * ExpenseForm completo e editável, na ordem de inclusão.
 *
 * O pai guarda só o que é compartilhado — a lista do lote, o estado de
 * gravação e o rodapé. O estado por despesa (useForm, anexos, watches,
 * derivados) vive dentro de cada ExpenseForm, para que digitar num formulário
 * não re-renderize os irmãos.
 */
export function ExpenseDialog({ open, expense, isSaving, error, presetDate, onClose, onSave }: Props) {
  const isEmpresa = useMemo(() => localStorage.getItem('contaAtivaTipo') === 'empresa', []);
  const isEditing = !!expense;

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
  // enxuto (preenchido/valor/duplicata) — o suficiente para o rodapé, sem
  // trafegar o objeto inteiro a cada caractere digitado.
  const formTopoRef = useRef<ExpenseFormHandle>(null);
  const formsLoteRef = useRef<Map<number, ExpenseFormHandle | null>>(new Map());

  const [resumoTopo, setResumoTopo] = useState<ExpenseFormResumo>(RESUMO_VAZIO);
  const [resumosLote, setResumosLote] = useState<Record<number, ExpenseFormResumo>>({});

  const registrarFormLote = (id: number) => (handle: ExpenseFormHandle | null) => {
    if (handle) formsLoteRef.current.set(id, handle);
    else formsLoteRef.current.delete(id);
  };

  const registrarResumoLote = (id: number) => (resumo: ExpenseFormResumo) => {
    setResumosLote((prev) => ({ ...prev, [id]: resumo }));
  };

  // Fechar o modal descarta o lote: nada nele foi gravado, e reabrir com as
  // despesas da sessão anterior faria o usuário salvar sem querer o que já
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
  const batchTotal = batch.reduce((sum, item) => sum + (resumosLote[item.id]?.valor ?? item.valoresIniciais.valor_original ?? 0), 0);
  const podeSalvar = resumoTopo.preenchido;
  const canSubmit = podeSalvar || hasBatch;

  // A duplicata avisada no rodapé é a do formulário que o usuário está
  // preenchendo; se o topo estiver limpo, a do último item do lote que
  // detectou uma. Um aviso por vez — empilhar N avisos no rodapé fixo comeria
  // a área dos botões.
  const duplicataAviso = resumoTopo.duplicata
    ?? [...batch].reverse().map((item) => resumosLote[item.id]?.duplicata).find(Boolean)
    ?? null;

  /**
   * Move a despesa do formulário do topo para o lote e devolve o topo limpo,
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
  const coletarItens = (): ExpenseFormValues[] => {
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
      setSavedMessage(items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada');
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
      onClose();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Deixa passar quando o alvo é um controle que usa Enter por conta
      // própria (autocomplete de descrição, campo de nova categoria, opções do
      // tipo de cobrança) — esses já chamam preventDefault e param aqui.
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
    <Dialog open={open} title={expense ? 'Editar despesa' : 'Nova despesa'} description="Registre uma saída financeira" onClose={onClose} size="xl" scrollBody={false} fixedHeight>
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onSubmit={submitForm}
        onKeyDown={handleKeyDown}
      >
        {/* Corpo rolável: o scroll é do modal, e é ele que o
            CategoryFloatingSelect usa para se reposicionar. */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Formulário de entrada: sempre no topo, sempre vazio depois de
              adicionar ao lote. O wrapper delimita a região para o atalho
              Shift+Enter saber que a tecla veio daqui. */}
          <div ref={topoRef}>
          <ExpenseForm
            ref={formTopoRef}
            expense={expense}
            presetDate={presetDate}
            isEmpresa={isEmpresa}
            isEditing={isEditing}
            open={open}
            scrollContainerRef={bodyRef}
            autoFocus
            guideEnabled
            onResumoChange={setResumoTopo}
          />
          </div>

          {/* Despesas já adicionadas, na ordem de inclusão, cada uma como
              formulário completo e editável. Nada aqui foi salvo: a gravação
              só acontece no submit, então tudo continua aberto até lá. */}
          {hasBatch && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textSoft, textTransform: 'uppercase' }}>
                  No lote · {batch.length} despesa{batch.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(batchTotal)}
                </span>
              </div>

              {batch.map((item, indice) => (
                <div
                  key={item.id}
                  style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column' }}
                >
                  <ExpenseForm
                    ref={registrarFormLote(item.id)}
                    valoresIniciais={item.valoresIniciais}
                    presetDate={presetDate}
                    isEmpresa={isEmpresa}
                    isEditing={isEditing}
                    open={open}
                    scrollContainerRef={bodyRef}
                    titulo={`Despesa ${indice + 1}`}
                    onRemover={() => removerDoLote(item.id)}
                    onResumoChange={registrarResumoLote(item.id)}
                  />
                </div>
              ))}
            </>
          )}

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {duplicataAviso && (
            <div style={{ fontSize: '12.5px', color: '#a3728a' }}>
              Você já lançou isso em {formatBr(duplicataAviso.dataVencimento)} — é outra?
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
              <button
                type="button"
                onClick={handleAddToBatch}
                disabled={!podeSalvar}
                style={{
                  padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: podeSalvar ? 'pointer' : 'not-allowed',
                  ...(podeSalvar
                    ? { background: C.primarySoft, color: C.primaryDark, boxShadow: 'none' }
                    : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
                }}
              >
                + Adicionar ao lote
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isSaving || isSavingAll}
                style={{
                  padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: canSubmit && !isSaving && !isSavingAll ? 'pointer' : 'not-allowed',
                  ...(canSubmit
                    ? { background: C.primary, color: '#fff' }
                    : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
                }}
              >
                {isSaving || isSavingAll
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : hasBatch
                      ? (() => {
                          // Conta o lote mais a despesa em preenchimento, se
                          // válida. Antes o plural era fixo e mostrava
                          // "Salvar 1 despesas".
                          const n = batch.length + (podeSalvar ? 1 : 0);
                          return `Salvar ${n} despesa${n !== 1 ? 's' : ''}`;
                        })()
                      : 'Registrar despesa'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
