import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { Paperclip, X, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { MONTH_NAMES, type Attachment, type Income, type IncomeFormValues, type FinanceDashboardData } from '../../types/finance';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import {
  C, labelStyle, fieldInputStyle, smallInputStyle,
  panelStyle, chipStyle, MoneyField,
} from '../../ui/dialogFormTokens';
import { fetchRepresentantes } from '../../services/representantesService';
import { fetchIncomeTypes, saveIncomeType } from '../../services/incomeTypesService';
import { fetchContratosAtivos, fetchClientes, saveCliente } from '../../services/clientesService';
import { fetchProdutos } from '../../services/catalogoService';
import { fetchIncomeSuggestions, type IncomeSuggestionMatch } from '../../services/incomeSuggestionsService';
import { suggestIncomeTypeForDescription } from '../../utils/incomeTypeSuggestions';
import { queryKeys } from '../../services/queryKeys';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { formatCurrency } from './formatters';


/** Resumo enxuto para o rodape do lote, sem trafegar o objeto a cada tecla. */
export interface IncomeFormResumo {
  preenchido: boolean;
  valor: number;
  duplicata: Income | null;
  /** Cliente digitado que nao existe no cadastro: trava o salvamento. */
  clienteInvalido: boolean;
}

/**
 * Handle imperativo: o pai le os valores no instante do submit, em vez de
 * manter um espelho sincronizado a cada tecla. Assim digitar num item do lote
 * nao re-renderiza os irmaos.
 */
export interface IncomeFormHandle {
  /** Valores atuais, ou null quando descricao/valor ainda estao vazios. */
  getValues: () => IncomeFormValues | null;
  /** Dispara a validacao zod e devolve se passou. */
  validate: () => Promise<boolean>;
  /** Limpa o formulario preservando a data, como apos salvar. */
  reset: () => void;
  /** Foca a descricao — usado depois de adicionar ao lote. */
  focus: () => void;
}

interface IncomeFormProps {
  /** Semente do item do lote: o que foi digitado no formulario do topo. */
  valoresIniciais?: IncomeFormValues;
  income?: Income;
  month: number;
  year: number;
  presetDate?: string;
  /** Conta (PF/CNPJ) do lancamento. Vem do pai: vale para o lote inteiro. */
  contaId?: number | null;
  /** Derivado do contaId no pai; decide quais campos aparecem. */
  isEmpresa: boolean;
  isNew: boolean;
  /** Estado do modal: fechar limpa o formulario. */
  open: boolean;
  /** Autofoco so no formulario de entrada; num item do lote roubaria o foco. */
  autoFocus?: boolean;
  /** Card de primeiro acesso: so uma instancia registra o mesmo escopo. */
  guideEnabled?: boolean;
  onResumoChange?: (resumo: IncomeFormResumo) => void;
  /** So nos itens do lote. */
  onRemover?: () => void;
  /** Cabecalho discreto ("Receita 1"). Ausente no formulario do topo. */
  titulo?: string;
}

/**
 * Corpo do formulario de receita, com estado proprio. Cada receita do lote e
 * uma instancia desta — por isso o useForm, os estados por receita, os watches
 * e os derivados vivem aqui, e nao no IncomeDialog.
 *
 * As queries de representantes/contratos/produtos/clientes ficam aqui em vez
 * de descer por prop: o React Query desduplica pela chave, entao N instancias
 * compartilham o mesmo cache e a mesma requisicao.
 */
const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor:           z.coerce.number().positive('Valor deve ser maior que zero'),
  data:            z.string().min(10, 'Informe a data'),
  cliente:         z.string().optional(),
  tipoReceita:     z.string().optional(),
  representanteId: z.coerce.number().nullable().optional(),
});

type FormData = z.infer<typeof schema>;
export const IncomeForm = forwardRef<IncomeFormHandle, IncomeFormProps>(function IncomeForm({
  valoresIniciais, income, month, year, presetDate, contaId, isEmpresa, isNew,
  open, autoFocus, guideEnabled, onResumoChange, onRemover, titulo,
}, ref) {
  const qc = useQueryClient();
  const defaultDate = presetDate ?? `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const descricaoInputRef = useRef<HTMLInputElement | null>(null);
  // Refs em vez de id fixo: com N formularios do lote abertos, um id
  // repetido faria getElementById pegar o input do primeiro deles.
  const novoClienteRef = useRef<HTMLInputElement | null>(null);
  const novoTipoRef = useRef<HTMLInputElement | null>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);
  const [replicar, setReplicar] = useState(false);
  const [replicarMes, setReplicarMes] = useState(month);
  const [replicarAno, setReplicarAno] = useState(year);

  const [horasFaturar, setHorasFaturar] = useState(false);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [tipoHora, setTipoHora] = useState<'presencial' | 'remoto' | null>(null);
  const [quantidadeHoras, setQuantidadeHoras] = useState<number | ''>('');

  // Venda de produto do catalogo: baixa o estoque pela quantidade informada.
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [quantidadeVendida, setQuantidadeVendida] = useState<number | ''>('');
  const [clienteTocado, setClienteTocado] = useState(false);
  const [representanteTocado, setRepresentanteTocado] = useState(false);

  const [showTipoForm, setShowTipoForm] = useState<string | null>(null);
  const [showClienteForm, setShowClienteForm] = useState<string | null>(null);
  const [tipoSugestao, setTipoSugestao] = useState<{ nome: string } | null>(null);
  const [duplicataInfo, setDuplicataInfo] = useState<{ income: Income } | null>(null);

  const repsQ = useQuery({
    queryKey: queryKeys.representantes,
    queryFn: () => fetchRepresentantes(),
    enabled: open && isEmpresa,
    staleTime: 60_000,
  });
  const representantes = repsQ.data ?? [];

  const contratosQ = useQuery({
    queryKey: queryKeys.contratosAtivos,
    queryFn: fetchContratosAtivos,
    enabled: open && isEmpresa,
    staleTime: 60_000,
  });
  const contratosAtivos = contratosQ.data ?? [];

  // So produtos ativos da conta escolhida no lancamento: vender de uma conta
  // o produto de outra misturaria os estoques.
  const produtosQ = useQuery({
    queryKey: queryKeys.catalogoProdutos,
    queryFn: fetchProdutos,
    enabled: open && isEmpresa,
    staleTime: 60_000,
  });
  const produtosDisponiveis = (produtosQ.data ?? []).filter(
    (p) => p.ativo && (p.contaId === null || p.contaId === contaId),
  );

  const typesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes, staleTime: 60_000 });
  const tiposReceita = (typesQ.data ?? []).filter((t) => t.ativo);

  const clientesQ = useQuery({
    queryKey: queryKeys.clientes,
    queryFn: fetchClientes,
    enabled: open && isEmpresa,
    staleTime: 60_000,
  });
  const clientes = clientesQ.data ?? [];
  const horasGuide = useFirstAccessGuide('receitas:horas-v1', {
    enabled: guideEnabled !== false && open && isNew && contratosAtivos.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });
  const replicarGuide = useFirstAccessGuide('receitas:replicar-v1', {
    enabled: guideEnabled !== false && open && isNew,
    layer: GUIDE_LAYER_MODAL,
  });
  const representanteGuide = useFirstAccessGuide('receitas:representante-v1', {
    enabled: guideEnabled !== false && open && isEmpresa && representantes.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });

  const criarTipoMut = useMutation({
    mutationFn: (nome: string) => saveIncomeType(nome),
    onSuccess: (tipo) => {
      qc.invalidateQueries({ queryKey: queryKeys.incomeTypes });
      form.setValue('tipoReceita', tipo.nome);
      setShowTipoForm(null);
    },
  });

  const criarClienteMut = useMutation({
    mutationFn: (nome: string) => saveCliente({ nome, cnpj: null }),
    onSuccess: (cliente) => {
      qc.invalidateQueries({ queryKey: queryKeys.clientes });
      form.setValue('cliente', cliente.nome);
      setClienteTocado(true);
      setShowClienteForm(null);
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      descricao: '', valor: '' as unknown as number, data: defaultDate,
      cliente: '', tipoReceita: '', representanteId: null,
    },
  });

  const contratoSelecionado = contratoId ? (contratosAtivos.find((c) => c.id === contratoId) ?? null) : null;
  const valorHora = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_valor ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_valor ?? null)
    : null;
  const saldoAtual = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_saldo_atual ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_saldo_atual ?? null)
    : null;
  const valorCalculado = (valorHora && quantidadeHoras) ? Number(quantidadeHoras) * valorHora : null;

  const produtoSelecionado = produtoId ? (produtosDisponiveis.find((p) => p.id === produtoId) ?? null) : null;
  const estoqueDisponivel = produtoSelecionado ? Number(produtoSelecionado.quantidadeEstoque) : null;
  const valorProdutoCalculado = (produtoSelecionado && quantidadeVendida)
    ? Number(quantidadeVendida) * Number(produtoSelecionado.valor)
    : null;

  // Preenche o valor a partir do produto, mas nao trava: e sugestao. Desconto,
  // frete ou negociacao continuam sendo digitados por cima normalmente.
  useEffect(() => {
    if (valorProdutoCalculado && valorProdutoCalculado > 0) {
      form.setValue('valor', valorProdutoCalculado);
    }
  }, [valorProdutoCalculado, form]);

  useEffect(() => {
    if (valorCalculado && valorCalculado > 0) {
      form.setValue('valor', valorCalculado);
    }
  }, [valorCalculado, form]);

  // Contrato traz cliente e representante já vinculados — evita re-digitar/re-selecionar o que já existe.
  useEffect(() => {
    if (!contratoSelecionado) return;
    if (!clienteTocado && !form.getValues('cliente')) {
      form.setValue('cliente', contratoSelecionado.cliente_nome);
    }
    if (!representanteTocado && contratoSelecionado.representante_id && !form.getValues('representanteId')) {
      form.setValue('representanteId', contratoSelecionado.representante_id);
    }
  }, [contratoSelecionado, clienteTocado, representanteTocado, form]);

  useEffect(() => {
    if (!open) {
      setAnexos([]); setReplicar(false);
      setReplicarMes(month); setReplicarAno(year);
      setHorasFaturar(false); setContratoId(null); setTipoHora(null); setQuantidadeHoras('');
      setProdutoId(null); setQuantidadeVendida('');
      setClienteTocado(false); setRepresentanteTocado(false);
      setShowTipoForm(null); setShowClienteForm(null);
      setTipoSugestao(null); setDuplicataInfo(null);
      return;
    }

    setAnexos(income?.anexos ?? valoresIniciais?.anexos ?? []);
    setClienteTocado(!!income?.cliente);
    setRepresentanteTocado(!!income?.representanteId);
    form.reset({
      descricao:       income?.descricao ?? valoresIniciais?.descricao ?? '',
      valor:           income?.valor ?? valoresIniciais?.valor ?? ('' as unknown as number),
      data:            income?.data ?? valoresIniciais?.data ?? defaultDate,
      cliente:         income?.cliente ?? valoresIniciais?.cliente ?? '',
      tipoReceita:     income?.tipoReceita ?? valoresIniciais?.tipoReceita ?? '',
      representanteId: income?.representanteId ?? valoresIniciais?.representanteId ?? null,
    });
  }, [income, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const descricaoWatch          = useWatch({ control: form.control, name: 'descricao' });
  const valorWatch               = useWatch({ control: form.control, name: 'valor' });
  const clienteWatch             = useWatch({ control: form.control, name: 'cliente' });
  const tipoReceitaWatch         = useWatch({ control: form.control, name: 'tipoReceita' });
  const representanteIdWatch     = useWatch({ control: form.control, name: 'representanteId' });

  const repSelecionado = representanteIdWatch
    ? representantes.find((r) => r.id === Number(representanteIdWatch))
    : null;
  const comissaoMatch = repSelecionado?.comissoes?.find((c) => c.tipo_receita === tipoReceitaWatch);
  const valorComissao =
    comissaoMatch && valorWatch > 0
      ? (valorWatch * Number(comissaoMatch.percentual)) / 100
      : null;
  const semComissaoConfigurada = !!repSelecionado && !!tipoReceitaWatch && !comissaoMatch;

  // Recentes: histórico local do dashboard já carregado, sem round-trip extra.
  const cachedIncomes = useMemo(() => {
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    return allCached.flatMap(([, data]) => data?.incomes ?? []);
  }, [qc, month, year]);

  // ── Sugestão de tipo de receita por histórico de descrição parecida (conta PJ apenas) ──
  useEffect(() => {
    if (!isEmpresa || (descricaoWatch?.length ?? 0) < 3 || tipoReceitaWatch) {
      setTipoSugestao(null);
      return;
    }
    const timer = setTimeout(() => {
      const suggestion = suggestIncomeTypeForDescription(descricaoWatch, cachedIncomes, income?.id);
      setTipoSugestao(suggestion);
    }, 250);
    return () => clearTimeout(timer);
  }, [descricaoWatch, tipoReceitaWatch, cachedIncomes, income?.id]);

  // ── Autocomplete de descrição por histórico real (backend) ──
  const [debouncedDescricao, setDebouncedDescricao] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDescricao(descricaoWatch ?? ''), 220);
    return () => clearTimeout(timer);
  }, [descricaoWatch]);

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.incomeSuggestions(debouncedDescricao),
    queryFn: () => fetchIncomeSuggestions(debouncedDescricao),
    enabled: debouncedDescricao.trim().length >= 2,
  });

  const [acHidden, setAcHidden] = useState(false);
  const [acIndex, setAcIndex] = useState(-1);
  const acMatches: IncomeSuggestionMatch[] = acHidden ? [] : (suggestionsQuery.data?.matches ?? [])
    .filter((m) => m.descricao.toLowerCase() !== (descricaoWatch ?? '').toLowerCase())
    .slice(0, 4);
  const acOpen = acMatches.length > 0 && (descricaoWatch?.length ?? 0) >= 2;

  const applySuggestionMatch = (match: IncomeSuggestionMatch) => {
    form.setValue('descricao', match.descricao);
    if (!valorWatch) form.setValue('valor', match.valor);
    if (match.cliente && !clienteWatch) { form.setValue('cliente', match.cliente); setClienteTocado(true); }
    if (match.tipoReceita && !tipoReceitaWatch) form.setValue('tipoReceita', match.tipoReceita);
    setAcHidden(true);
    setAcIndex(-1);
  };

  const ultimoValorRecebido = suggestionsQuery.data?.matches.find(
    (m) => m.descricao.toLowerCase() === (descricaoWatch ?? '').toLowerCase(),
  )?.valor;

  // Detecção de duplicata: mesma descrição + valor + cliente nos últimos 7 dias — aviso não bloqueante.
  useEffect(() => {
    const desc = descricaoWatch?.trim();
    if (!desc || !valorWatch) { setDuplicataInfo(null); return; }
    const seteAtras = new Date();
    seteAtras.setDate(seteAtras.getDate() - 7);
    const dup = cachedIncomes.find((i) => {
      if (i.id === income?.id) return false;
      if (i.descricao.toLowerCase() !== desc.toLowerCase()) return false;
      if (i.valor !== valorWatch) return false;
      if ((i.cliente ?? '') !== (clienteWatch ?? '')) return false;
      if (new Date(i.data) < seteAtras) return false;
      return true;
    });
    setDuplicataInfo(dup ? { income: dup } : null);
  }, [descricaoWatch, valorWatch, clienteWatch, cachedIncomes, income?.id]);

  // Cliente precisa corresponder a um cadastro existente — combobox não aceita texto solto.
  const clienteValido = !isEmpresa || !clienteWatch?.trim() || clientes.some((c) => c.nome === clienteWatch.trim());

  /** Monta o payload dos valores atuais. Nao grava: quem grava e o pai. */
  const montarValores = (data: FormData): IncomeFormValues => {
    const formValues: IncomeFormValues = {
      descricao:         data.descricao,
      contaId,
      valor:             data.valor,
      data:              data.data,
      cliente:           data.cliente,
      tipoReceita:       data.tipoReceita,
      representanteId:   data.representanteId,
      valorComissao:     valorComissao ?? null,
      anexos,
      replicarAte:       isNew && replicar ? { mes: replicarMes, ano: replicarAno } : null,
      contratoId:        isNew && horasFaturar ? contratoId : null,
      tipoHora:          isNew && horasFaturar ? tipoHora : null,
      quantidadeHoras:   isNew && horasFaturar && quantidadeHoras !== '' ? Number(quantidadeHoras) : null,
      // So na criacao: reeditar uma receita ja gravada nao pode baixar o
      // estoque de novo pela mesma venda.
      produtoId:         isNew && produtoId && quantidadeVendida !== '' ? produtoId : null,
      quantidadeVendida: isNew && produtoId && quantidadeVendida !== '' ? Number(quantidadeVendida) : null,
    };
    return formValues;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape com a lista aberta fecha so a lista; sem ela, deixa o pai fechar
    // o modal.
    if (e.key === 'Escape' && acOpen) {
      setAcHidden(true);
      e.stopPropagation();
      return;
    }
    if (acOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setAcIndex((prev) => Math.max(0, Math.min(acMatches.length - 1, prev + delta)));
      return;
    }
    if (acOpen && e.key === 'Enter' && acIndex >= 0) {
      e.preventDefault();
      applySuggestionMatch(acMatches[acIndex]!);
      return;
    }
    if (e.key === 'Tab' && tipoSugestao && !tipoReceitaWatch) {
      e.preventDefault();
      form.setValue('tipoReceita', tipoSugestao.nome);
      setTipoSugestao(null);
      return;
    }
  };

  const currentYear = new Date().getFullYear();
  const replicarAnoOptions = Array.from({ length: 3 }, (_, i) => currentYear + i);
  const replicarMesOptions = Array.from({ length: 12 }, (_, i) => ({ value: i, label: MONTH_NAMES[i] }));


  /** Le os valores no submit, em vez de espelhar estado a cada tecla. */
  useImperativeHandle(ref, () => ({
    getValues: () => {
      const data = form.getValues();
      // Item vazio nao entra no lote: o pai o ignora.
      if (!data.descricao?.trim() || !data.valor) return null;
      return montarValores(data);
    },
    validate: () => form.trigger(),
    reset: () => {
      // Preserva a data: quem lanca varias receitas do mesmo dia nao redigita.
      const dataAtual = form.getValues('data');
      form.reset({
        descricao: '', valor: '' as unknown as number, data: dataAtual,
        cliente: '', tipoReceita: '', representanteId: null,
      });
      setAnexos([]);
      setProdutoId(null);
      setQuantidadeVendida('');
      setClienteTocado(false);
      setRepresentanteTocado(false);
      setDuplicataInfo(null);
    },
    focus: () => descricaoInputRef.current?.focus(),
  }));

  // Resumo para o rodape do pai: so o que ele precisa, sem o objeto inteiro.
  useEffect(() => {
    onResumoChange?.({
      preenchido: !!descricaoWatch?.trim() && !!valorWatch && valorWatch > 0,
      valor: Number(valorWatch) || 0,
      duplicata: duplicataInfo?.income ?? null,
      clienteInvalido: !clienteValido,
    });
  }, [descricaoWatch, valorWatch, duplicataInfo, clienteValido]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div onKeyDown={handleKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Identifica o item no lote, para o leitor de tela e para o olho. */}
      {titulo && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.textMuted }}>{titulo}</span>
          {onRemover && (
            <button
              type="button"
              onClick={onRemover}
              aria-label={`Remover ${titulo}`}
              style={{ display: 'flex', background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

          {/* ── Descrição + Anexos ─────────────────────────────────── */}
          <div>
            <div style={{ minWidth: 0, position: 'relative' }}>
              <label style={labelStyle}>
                <span>Descrição</span><span style={{ color: C.danger }}>*</span>
              </label>
              {/* Anexar fica ao lado do campo, na mesma altura dele. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  {...form.register('descricao', { onChange: () => setAcHidden(false) })}
                  ref={(el) => {
                    form.register('descricao').ref(el);
                    descricaoInputRef.current = el;
                  }}
                  placeholder="Ex: Salário mensal"
                  // Num item do lote roubaria o foco de quem esta digitando.
                  autoFocus={autoFocus}
                  autoComplete="off"
                  style={fieldInputStyle}
                />
                <button
                  type="button"
                  onClick={() => attachmentRef.current?.openPicker()}
                  title="Anexar arquivo"
                  aria-label="Anexar arquivo"
                  style={{
                    display: 'flex', flex: 'none', height: 32, width: 32,
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10, border: `1px solid ${C.borderInput}`,
                    background: '#fff', cursor: 'pointer',
                    color: anexos.length > 0 ? C.primary : C.textMuted,
                  }}
                >
                  <Paperclip size={14} />
                </button>
              </div>
              {acOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAcHidden(true)} />
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 41,
                    background: '#fff', border: `1px solid ${C.borderInput}`, borderRadius: 12,
                    boxShadow: '0 20px 44px -14px rgba(13, 47, 63, 0.34)', padding: 6,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {acMatches.map((match, i) => (
                      <button
                        key={`${match.descricao}-${i}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestionMatch(match)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          height: 38, padding: '0 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                          background: i === acIndex ? C.panelBg : 'transparent', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: C.text }}>{match.descricao}</span>
                        <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(match.valor)}{match.cliente ? ` · ${match.cliente}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {tipoSugestao && !tipoReceitaWatch && (
                <button
                  type="button"
                  onClick={() => { form.setValue('tipoReceita', tipoSugestao.nome); setTipoSugestao(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '12.5px', color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                >
                  <span style={{ fontWeight: 600, background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}`, borderRadius: 6, padding: '2px 7px' }}>
                    {tipoSugestao.nome}
                  </span>
                  <span style={{ color: C.textMuted }}>sugerido · Tab aceita</span>
                </button>
              )}
            </div>

            {/* Anexos ocupam a largura toda. O componente monta sempre — o ref
                é o que abre o seletor de arquivos. */}
            <div style={{ marginTop: 10 }}>
              <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
            </div>
          </div>

          <div style={{ height: 1, background: '#eef2f6' }} />

          {/* ── Valor + Data + Cliente ─────────────────────────────── */}
          <div>
            <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1fr_168px]" style={{ columnGap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={labelStyle}>
                  <span>Valor</span><span style={{ color: C.danger }}>*</span>
                </label>
                <Controller
                  control={form.control}
                  name="valor"
                  render={({ field }) => <MoneyField value={field.value || undefined} onChange={field.onChange} />}
                />
                <div style={{ fontSize: 12, color: C.textFaint, minHeight: 16 }}>
                  {ultimoValorRecebido ? `Última vez você recebeu ${formatCurrency(ultimoValorRecebido)}` : ''}
                </div>
                {form.formState.errors.valor?.message && (
                  <div style={{ fontSize: 12, color: '#b42318' }}>{form.formState.errors.valor.message}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={labelStyle}>
                  <span>Data</span><span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  {...form.register('data')}
                  type="date"
                  readOnly={isNew && !!presetDate}
                  style={{
                    ...fieldInputStyle, fontSize: 14,
                    ...(isNew && presetDate ? { background: C.panelBg, cursor: 'not-allowed' } : {}),
                  }}
                />
              </div>
            </div>

            {/* Conta pessoal nao tem cliente. Mesmo criterio dos demais
                campos de PJ deste modal (tipo de receita, representante,
                produtos), que ja eram condicionais. */}
            {isEmpresa && (
              <div style={{ marginTop: 2, position: 'relative' }}>
                <label style={labelStyle}>Cliente / fonte</label>
                <input
                  {...form.register('cliente', { onChange: () => setClienteTocado(true) })}
                  list="clientes-datalist"
                  placeholder="Ex: Empresa XYZ"
                  autoComplete="off"
                  style={{
                    ...fieldInputStyle, height: 42, fontSize: 14,
                    border: `1.5px solid ${!clienteValido ? '#b42318' : C.borderInput}`,
                  }}
                />
                <datalist id="clientes-datalist">
                  {clientes.map((c) => <option key={c.id} value={c.nome} />)}
                </datalist>
                {!clienteValido && clienteWatch?.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#b42318' }}>Cliente não cadastrado.</span>
                    <button
                      type="button"
                      onClick={() => setShowClienteForm(clienteWatch.trim())}
                      style={{ fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                    >
                      + Cadastrar "{clienteWatch.trim()}"
                    </button>
                  </div>
                )}
                {showClienteForm !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 8 }}>
                    <input
                      type="text"
                      defaultValue={showClienteForm}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarClienteMut.mutate(v); }
                        if (e.key === 'Escape') { e.preventDefault(); setShowClienteForm(null); }
                      }}
                      ref={novoClienteRef}
                      style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={criarClienteMut.isPending}
                      onClick={() => {
                        const el = novoClienteRef.current;
                        const v = el?.value.trim();
                        if (v) criarClienteMut.mutate(v);
                      }}
                      style={{ borderRadius: 8, background: C.primary, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {criarClienteMut.isPending ? '...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => setShowClienteForm(null)} style={{ color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tipo de receita (conta PJ apenas) ────────────────── */}
          {isEmpresa && (tiposReceita.length > 0 || showTipoForm !== null) && (
            <>
            <div style={{ height: 1, background: '#eef2f6' }} />
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={labelStyle}>Tipo de receita</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tiposReceita.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => form.setValue('tipoReceita', tipoReceitaWatch === t.nome ? '' : t.nome)}
                      style={chipStyle(tipoReceitaWatch === t.nome)}
                    >
                      {t.nome}
                    </div>
                  ))}
                  <div
                    onClick={() => setShowTipoForm('')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                      height: 42, padding: '0 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
                      border: `1.5px dashed ${C.chipOffBorder}`, color: C.textMuted, background: '#fff',
                    }}
                  >
                    <span>+</span> novo
                  </div>
                </div>
                {showTipoForm !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 8 }}>
                    <input
                      type="text"
                      defaultValue={showTipoForm}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarTipoMut.mutate(v); }
                        if (e.key === 'Escape') { e.preventDefault(); setShowTipoForm(null); }
                      }}
                      ref={novoTipoRef}
                      placeholder="Nome do tipo de receita"
                      style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={criarTipoMut.isPending}
                      onClick={() => {
                        const el = novoTipoRef.current;
                        const v = el?.value.trim();
                        if (v) criarTipoMut.mutate(v);
                      }}
                      style={{ borderRadius: 8, background: C.primary, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {criarTipoMut.isPending ? '...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => setShowTipoForm(null)} style={{ color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* ── Representante (conta PJ apenas) ──────────────────── */}
          {isEmpresa && representantes.length > 0 && (
            <>
            <div style={{ height: 1, background: '#eef2f6' }} />
            <div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Representante</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div
                    onClick={() => { form.setValue('representanteId', null); setRepresentanteTocado(true); }}
                    style={chipStyle(!representanteIdWatch)}
                  >
                    Nenhum
                  </div>
                  {representantes.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => { form.setValue('representanteId', r.id); setRepresentanteTocado(true); }}
                      style={chipStyle(Number(representanteIdWatch) === r.id)}
                    >
                      {r.nome}
                    </div>
                  ))}
                </div>
                {representanteGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={Users}
                    description={firstAccessGuideMessages.receitasRepresentante}
                    onDismiss={representanteGuide.dismiss}
                    onSilenceAll={representanteGuide.silenceAll}
                  />
                )}

                {valorComissao !== null && repSelecionado && comissaoMatch && (
                  <div style={{ ...panelStyle, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{repSelecionado.nome}</span>
                    <span style={{ fontSize: 13, color: C.textMuted }}>receberá</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDark }}>{formatCurrency(valorComissao)}</span>
                    <span style={{ fontSize: 13, color: C.textFaint }}>·</span>
                    <span style={{ fontSize: 13, color: C.textMuted }}>{comissaoMatch.percentual}%</span>
                    <span style={{ fontSize: 13, color: C.textFaint }}>·</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'capitalize', borderRadius: 999,
                      background: C.primarySoft, padding: '2px 8px', color: C.primaryDark,
                    }}>
                      {comissaoMatch.tipo === 'unica' ? 'única' : 'mensal'}
                    </span>
                  </div>
                )}
                {semComissaoConfigurada && (
                  <div style={{ ...panelStyle, background: C.warnBg, borderColor: C.warnBorder }}>
                    <span style={{ fontSize: 12.5, color: C.warn }}>
                      Nenhuma comissão configurada para este tipo de receita.
                    </span>
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* ── Produto vendido (nova receita only) ───────────────── */}
          {isNew && isEmpresa && produtosDisponiveis.length > 0 && (
            <>
            <div style={{ height: 1, background: '#eef2f6' }} />
            <div>
              <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[minmax(0,1fr)_140px]" style={{ columnGap: 12 }}>
                <div>
                  <label style={labelStyle}>Produto vendido</label>
                  <select
                    value={produtoId ?? ''}
                    onChange={(e) => {
                      setProdutoId(e.target.value || null);
                      if (!e.target.value) setQuantidadeVendida('');
                    }}
                    style={{ ...fieldInputStyle, width: '100%' }}
                  >
                    <option value="">Nenhum (lançamento avulso)</option>
                    {produtosDisponiveis.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — {formatCurrency(Number(p.valor))} · {Number(p.quantidadeEstoque)} em estoque
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Quantidade</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={quantidadeVendida}
                    onChange={(e) => setQuantidadeVendida(e.target.value !== '' ? Number(e.target.value) : '')}
                    disabled={!produtoId}
                    placeholder="0"
                    style={{ ...smallInputStyle, width: '100%', ...(produtoId ? {} : { background: C.panelBg }) }}
                  />
                </div>
              </div>
              {produtoSelecionado && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: C.textMuted }}>
                  {estoqueDisponivel != null && quantidadeVendida !== '' && Number(quantidadeVendida) > estoqueDisponivel
                    ? <span style={{ color: C.danger }}>Estoque insuficiente: há {estoqueDisponivel} disponível.</span>
                    : <>Baixa {quantidadeVendida || 0} do estoque · restam {Math.max(0, (estoqueDisponivel ?? 0) - Number(quantidadeVendida || 0))}. O valor acima pode ser ajustado.</>}
                </p>
              )}
            </div>
            </>
          )}

          {/* ── Horas a faturar (nova receita only) ───────────────── */}
          {isNew && contratosAtivos.length > 0 && (
            <>
            <div style={{ height: 1, background: '#eef2f6' }} />
            <div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => { setHorasFaturar((v) => !v); if (horasFaturar) { setContratoId(null); setTipoHora(null); setQuantidadeHoras(''); } }}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 13, fontWeight: 700, color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={14} />Horas a faturar...</span>
                  {horasFaturar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {horasGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={Clock}
                    description={firstAccessGuideMessages.receitasHoras}
                    onDismiss={horasGuide.dismiss}
                    onSilenceAll={horasGuide.silenceAll}
                  />
                )}
                {horasFaturar && (
                  <div style={panelStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <label style={labelStyle}>Contrato</label>
                      <select
                        value={contratoId ?? ''}
                        onChange={(e) => { setContratoId(e.target.value ? Number(e.target.value) : null); setTipoHora(null); setQuantidadeHoras(''); }}
                        style={{ ...smallInputStyle, width: '100%' }}
                      >
                        <option value="">Selecione o contrato</option>
                        {contratosAtivos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cliente_nome}{c.numero ? ` — ${c.numero}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {contratoSelecionado && (
                      <>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {(contratoSelecionado.horas_presenciais_valor ?? 0) > 0 && (
                            <div onClick={() => setTipoHora('presencial')} style={chipStyle(tipoHora === 'presencial', { h: 36, r: 9, size: 12.5 })}>
                              Presencial
                            </div>
                          )}
                          {(contratoSelecionado.horas_remotas_valor ?? 0) > 0 && (
                            <div onClick={() => setTipoHora('remoto')} style={chipStyle(tipoHora === 'remoto', { h: 36, r: 9, size: 12.5 })}>
                              Remoto
                            </div>
                          )}
                        </div>

                        {tipoHora && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                              <label style={labelStyle}>Quantidade de horas</label>
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={quantidadeHoras}
                                onChange={(e) => setQuantidadeHoras(e.target.value !== '' ? Number(e.target.value) : '')}
                                placeholder="0"
                                style={smallInputStyle}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>
                                {valorHora != null ? `${formatCurrency(valorHora)}/h` : '—'}
                              </span>
                              {saldoAtual != null && (
                                <span style={{ fontSize: 12, color: C.textFaint }}>Saldo: {saldoAtual}h disponíveis</span>
                              )}
                            </div>
                          </div>
                        )}

                        {valorCalculado != null && valorCalculado > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, border: `1px solid ${C.primarySoftBorder}`, background: C.primarySoft, padding: '8px 12px' }}>
                            <span style={{ fontSize: 13, color: C.primaryDark }}>Valor calculado:</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDark }}>{formatCurrency(valorCalculado)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* ── Replicar até (nova receita only) ──────────────────── */}
          {isNew && (
            <>
            <div style={{ height: 1, background: '#eef2f6' }} />
            <div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setReplicar((v) => !v)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 13, fontWeight: 700, color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <span>Replicar até...</span>
                  {replicar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {replicarGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={ChevronDown}
                    description={firstAccessGuideMessages.receitasReplicar}
                    onDismiss={replicarGuide.dismiss}
                    onSilenceAll={replicarGuide.silenceAll}
                  />
                )}
                {replicar && (
                  <div style={panelStyle}>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-3">
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={labelStyle}>MÊS</label>
                        <select
                          value={replicarMes}
                          onChange={(e) => setReplicarMes(Number(e.target.value))}
                          style={{ ...smallInputStyle, width: '100%' }}
                        >
                          {replicarMesOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ width: 100 }}>
                        <label style={labelStyle}>ANO</label>
                        <select
                          value={replicarAno}
                          onChange={(e) => setReplicarAno(Number(e.target.value))}
                          style={{ ...smallInputStyle, width: '100%' }}
                        >
                          {replicarAnoOptions.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
          )}
    </div>
  );
});
