import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Camera, Check, ChevronDown, CircleCheck, FileText, MessageCircleMore,
  Mic, Plus, Send, Square, Trash2, X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MONTH_NAMES, type Attachment, type Expense, type Income, type OpenExpense } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import type {
  FinancialCopilotCard,
  FinancialCopilotIntentHint,
  FinancialCopilotQuickReply,
} from '../../types/financialCopilot';
import {
  deleteFinancialCopilotConversation,
  fetchFinancialCopilotConversation,
  fetchFinancialCopilotConversations,
  fetchUltimosLancamentos,
  sendFinancialCopilotMessage,
  type UltimosLancamentos,
} from '../../services/assistantService';
import { createExpense, createIncome, fetchDespesasEmAberto, pagarDespesa } from '../../services/financeService';
import { useDashboardQuery } from '../../hooks/useFinanceDashboard';
import { useOwnPermissions } from '../../hooks/useOwnPermissions';
import { usePlanFeatures } from '../../hooks/usePlanFeatures';
import { accountsAllowedByPlan } from '../../hooks/useActiveAccount';
import { allowedAssistantIntents, canReadCatalogList } from '../../utils/screenAccess';
import { fetchCartoes, fetchCategorias, fetchContas } from '../../services/configService';
import { getActiveAccountId } from '../../services/apiClient';
import { fetchClients, type ClientFilters } from '../../services/clientsService';
import { fetchContractsWithHours } from '../../services/contractsService';
import { fetchClassificacoesReceita } from '../../services/incomeClassificationsService';
import { opcoesDeClassificacao } from '../../utils/classificacaoOpcoes';
import { fetchRepresentantes } from '../../services/representantesService';
import { fetchProdutos } from '../../services/catalogoService';
import { invalidateExpenseQueries, invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { formatCurrency } from '../../screens/finance/formatters';
import { formatCents } from '../../screens/finance/entry-dialog/cents';
import type { StatusTone } from '../../screens/finance/entry-dialog/SummaryLine';
import { MIN_INSTALLMENTS, type ExpenseDraft } from '../../screens/finance/expense-dialog/draftState';
import {
  SUMMARY_TONE, effectiveDueDate, installmentAmounts, overdueOpenCount, paidInstallmentCount, summarizeDraft,
  type RuleContext,
} from '../../screens/finance/expense-dialog/draftRules';
import { getLocalTodayIso, isoToBrDate } from '../../utils/date';
import { Card } from '../../ui/card';
import { IsoDateField } from '../../ui/DateField';
import { Badge } from '../../ui/badge';
import { AssistantHeaderMenu } from './AssistantHeaderMenu';
import {
  fontSizeToScale, readStoredFontSize, storeFontSize, type AssistantFontSize,
} from './fontSize';
import { useSpeech } from './useSpeech';
import { escolherSaudacao } from './saudacao';
import { ABERTURA } from './abertura';
import {
  buildExpenseSave, duplicateCheckKey, fillDraftDefaults, normalizeComparable, toExpenseDraft,
} from './cardDraft';
import { InstallmentList } from './InstallmentList';
import { PaymentCard, openExpenseLabel, paymentDifferenceText, type PaymentDraft } from './PaymentCard';
import { CardActions } from './CardActions';

type ChatRole = 'assistant' | 'user';

/** A mesma lista da tela de Clientes (ativos): o cache é o mesmo. */
const ACTIVE_CLIENTS: ClientFilters = { search: '', type: null, status: 'active' };

interface ChatAttachmentSummary {
  nome: string;
  tamanho: number;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachmentSummary[];
  cards?: FinancialCopilotCard[];
  showWelcomeActions?: boolean;
  /** Botoes da pergunta em aberto; some assim que ela e respondida. */
  quickReplies?: FinancialCopilotQuickReply[];
  /**
   * Foto do rascunho no instante em que foi salvo. Fica presa nesta mensagem
   * — nao e uma referencia ao draft ativo, que continua mudando depois.
   */
  registeredDraft?: FinancialAssistantDraft;
  /** Despesas em aberto oferecidas pelo chip "Pagar despesa"; somem ao escolher. */
  paymentCandidates?: OpenExpense[];
  /** Foto do pagamento registrado, como `registeredDraft`. */
  registeredPayment?: PaymentDraft;
}
interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: SpeechRecognitionResultLike;
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const ACCEPTED_FILE_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'text/plain',
]);

// Botao flutuante arrastavel (desktop): posicao em right/bottom, mesma
// convencao do `bottom-5 right-5` original. Tamanho do botao (h-14 w-14) e
// margem de borda entram no clamp para o icone nunca ficar fora da tela.
const FAB_STORAGE_KEY = 'assistant:fabPosition';
const FAB_SIZE = 56;
const FAB_MARGIN = 20;
const FAB_DEFAULT_POSITION: FabPosition = { right: FAB_MARGIN, bottom: FAB_MARGIN };
/** Deslocamento minimo para contar como arraste em vez de clique. */
const FAB_DRAG_THRESHOLD = 5;

interface FabPosition {
  right: number;
  bottom: number;
}

function clampFabPosition(position: FabPosition): FabPosition {
  const maxRight = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
  const maxBottom = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
  return {
    right: Math.min(Math.max(position.right, FAB_MARGIN), maxRight),
    bottom: Math.min(Math.max(position.bottom, FAB_MARGIN), maxBottom),
  };
}

function readStoredFabPosition(): FabPosition {
  if (typeof window === 'undefined') return FAB_DEFAULT_POSITION;
  try {
    const raw = window.localStorage.getItem(FAB_STORAGE_KEY);
    if (!raw) return FAB_DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.right !== 'number' || typeof parsed.bottom !== 'number') return FAB_DEFAULT_POSITION;
    return clampFabPosition(parsed as FabPosition);
  } catch {
    return FAB_DEFAULT_POSITION;
  }
}

function storeFabPosition(position: FabPosition): void {
  try {
    window.localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage indisponivel (modo privado, quota): a posicao so vale para
    // esta sessao, sem quebrar o arraste.
  }
}

function buildInitialMessage(saudacao: string): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: saudacao,
    createdAt: new Date().toISOString(),
    showWelcomeActions: true,
  };
}

// Texto do lembrete de ultimo lancamento, montado conforme o que existir —
// nunca menciona um tipo que ainda nao tem nenhum lancamento.
function buildUltimoLancamentoTexto(dados: UltimosLancamentos | undefined): string | null {
  const despesa = dados?.ultimaDespesa;
  const receita = dados?.ultimaReceita;
  if (!despesa && !receita) return null;

  const trechoDespesa = despesa ? `para despesa foi ${despesa.descricao} — ${formatCurrency(despesa.valor)}` : null;
  const trechoReceita = receita ? `para receita foi ${receita.descricao} — ${formatCurrency(receita.valor)}` : null;

  if (trechoDespesa && trechoReceita) {
    return `Lembrando que seu último lançamento ${trechoDespesa}, e ${trechoReceita}.`;
  }
  return `Lembrando que seu último lançamento ${trechoDespesa ?? trechoReceita}.`;
}

/**
 * Visual dos chips de resposta rapida (perguntas do fluxo de despesa). Ficam
 * empilhados, cada um com a largura do proprio texto, como menu de bot de
 * atendimento.
 */
const ASSISTANT_CHIP_CLASS = 'flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-[#0e7490] shadow-sm transition hover:border-cyan-400 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:bg-cyan-900/60';

/**
 * Icone de cada intencao. Fica em codigo enquanto os textos vem do fluxo:
 * escolher icone e decisao de UI, nao de conversa.
 */
const INTENT_ICONS: Record<FinancialCopilotIntentHint, ReactNode> = {
  register_expense: <Plus size={15} />,
  pay_expense: <CircleCheck size={15} />,
  register_income: <Plus size={15} />,
  ask: <MessageCircleMore size={15} />,
};

/**
 * Cor por intencao dos chips de abertura (menu inicial) — despesa em
 * vermelho, pagar em azul, receita em verde, consultar em amarelo. Largura
 * fixa (w-[172px]) para os quatro ficarem do mesmo tamanho, independente do texto.
 */
const WELCOME_CHIP_CLASS_BY_INTENT: Record<FinancialCopilotIntentHint, string> = {
  register_expense: 'flex w-[172px] items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:border-red-400 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/60',
  pay_expense: 'flex w-[172px] items-center justify-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60',
  register_income: 'flex w-[172px] items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60',
  ask: 'flex w-[172px] items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/60',
};

/** Pílulas da linha de situação do card, nas cores do resumo do modal (SummaryLine). */
const SUMMARY_PILL_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-orange-50 text-amber-700 dark:bg-orange-950/40 dark:text-amber-300',
  info: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** "10x de R$ 300,00 · 2 de 10 pagas · 1 vencida": o botão de parcelas do modal, no card. */
function installmentsButtonLabel(expenseDraft: ExpenseDraft, context: RuleContext): string {
  const amounts = installmentAmounts(expenseDraft);
  const paidCount = paidInstallmentCount(expenseDraft);
  const overdue = overdueOpenCount(expenseDraft, context);
  return `${amounts.length}x${amounts[0] ? ` de ${formatCents(amounts[0])}` : ''} · ${paidCount} de ${amounts.length} pagas`
    + (overdue && !expenseDraft.overdueDismissed ? ` · ${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'}` : '');
}

function formatDraftAmount(value: number | null): string {
  if (!value) return 'Valor não informado';
  return formatCurrency(value);
}

function newMessageId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function formatDayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(isoDate) === dayKey(today.toISOString())) return 'Hoje';
  if (dayKey(isoDate) === dayKey(yesterday.toISOString())) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function groupMessagesByDay(messages: ChatMessage[]): Array<{ dayLabel: string; messages: ChatMessage[] }> {
  const groups: Array<{ key: string; dayLabel: string; messages: ChatMessage[] }> = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ key, dayLabel: formatDayLabel(message.createdAt), messages: [message] });
    }
  }
  return groups;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!data) {
        reject(new Error('Não foi possível ler o arquivo.'));
        return;
      }
      resolve({
        id: `assistant-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        dados: data,
        dataUpload: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * `expenseKey`: valor e vencimento da linha que a despesa vai gravar (no
 * parcelado, a primeira parcela, com o vencimento calculado como no modal).
 */
function findDuplicate(
  draft: FinancialAssistantDraft | null,
  incomes: Income[],
  expenses: Expense[],
  expenseKey: { amount: number; dueDate: string } | null,
): string | null {
  if (!draft?.description || !draft.amount) return null;
  const description = normalizeComparable(draft.description);

  if (draft.kind === 'income') {
    const duplicate = incomes.find((income) => (
      normalizeComparable(income.descricao) === description
      && Math.abs(income.valor - draft.amount!) < 0.01
      && income.data === draft.date
    ));
    return duplicate ? 'Existe uma receita muito parecida no período selecionado. Confirme antes de salvar.' : null;
  }

  if (!expenseKey) return null;
  const duplicate = expenses.find((expense) => (
    normalizeComparable(expense.descricao) === description
    && Math.abs(expense.valorFinal - expenseKey.amount) < 0.01
    && expense.dataVencimento === expenseKey.dueDate
  ));
  return duplicate ? 'Existe uma despesa muito parecida no período selecionado. Confirme antes de salvar.' : null;
}

function formatCardValue(value: number | string): string {
  if (typeof value === 'string') return value;
  return formatCurrency(value);
}

function CopilotCardView({ card }: { card: FinancialCopilotCard }) {
  return (
    <div className="mt-3 border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-950/50">
      <p className="mb-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">{card.title}</p>
      {card.items.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Sem registros para exibir.</p>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {card.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                {item.detail && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.detail}</p>}
              </div>
              <p className={[
                'shrink-0 font-semibold tabular-nums',
                item.tone === 'positive' ? 'text-emerald-700 dark:text-emerald-300'
                  : item.tone === 'danger' ? 'text-red-700 dark:text-red-300'
                    : item.tone === 'warning' ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-700 dark:text-slate-200',
              ].join(' ')}>{formatCardValue(item.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FinancialAssistantProps {
  mode?: 'floating' | 'standalone';
}

export function FinancialAssistant({ mode = 'floating' }: FinancialAssistantProps) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const queryClient = useQueryClient();
  const isStandalone = mode === 'standalone';
  const [open, setOpen] = useState(isStandalone);
  const [fabPosition, setFabPosition] = useState<FabPosition>(() => readStoredFabPosition());
  const fabDragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number; moved: boolean } | null>(null);

  // Lembrete discreto do ultimo lancamento de cada tipo, para reduzir
  // duplicidade por esquecimento. Muda a cada lancamento novo — staleTime
  // curto.
  const { data: ultimosLancamentos } = useQuery({
    queryKey: queryKeys.assistantUltimosLancamentos(getActiveAccountId()),
    queryFn: fetchUltimosLancamentos,
    staleTime: 30_000,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildInitialMessage(ABERTURA.saudacao)]);

  const [fontSize, setFontSize] = useState<AssistantFontSize>(() => readStoredFontSize());
  const handleFontSizeChange = (nextFontSize: AssistantFontSize) => {
    setFontSize(nextFontSize);
    storeFontSize(nextFontSize);
  };
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState<FinancialAssistantDraft | null>(null);
  // Lista de parcelas do card aberta (o resumo "10x de ... · N pagas" a abre).
  const [installmentsOpen, setInstallmentsOpen] = useState(false);
  // Card de pagamento do chip "Pagar despesa", e o valor/data que a ultima
  // frase de pagamento trouxe — usados quando a despesa e escolhida num botao.
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [paymentHint, setPaymentHint] = useState<{ amountPaid: number | null; paymentDate: string | null } | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [intentHint, setIntentHint] = useState<FinancialCopilotIntentHint | null>(null);
  // Marca que a proxima mensagem nasceu do microfone: so ai a resposta e falada.
  const [voiceMode, setVoiceMode] = useState(false);
  const speech = useSpeech();
  // Reconhecimento nao e padrao: sem suporte, o microfone nem aparece.
  const [recognitionSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  // No desktop o `capture` cai no seletor de arquivos comum e o botao ficaria
  // sem funcao propria; a barra ja tem tres controles e nao comporta um quarto
  // decorativo.
  const [temCamera] = useState(() => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Altura real da area visivel. `100dvh` e a altura da JANELA, e no Android e
  // no iOS o teclado nao a altera — encolhe so o visualViewport. Sem medir
  // aqui, o container mantem a altura cheia e o rodape com a barra de digitar
  // fica atras do teclado.
  const [alturaVisivel, setAlturaVisivel] = useState<number | null>(null);

  // Mesma fonte que contaEhEmpresa usa abaixo: a conta escolhida no draft do
  // lancamento em edicao, com fallback para a conta ativa global.
  const contaAtivaId = draft?.contaId ?? getActiveAccountId();
  // Só as listas que a pessoa pode ler, e os lançamentos do lado que ela vê
  // (utils/screenAccess.ts): o resto o servidor recusaria.
  const permissions = useOwnPermissions() ?? {};
  // Clientes, produtos e contratos são do Premium (o servidor recusa no Starter).
  const { premium } = usePlanFeatures();
  const readsList = (list: Parameters<typeof canReadCatalogList>[1]) => canReadCatalogList(permissions, list);
  const readsPremiumList = (list: Parameters<typeof canReadCatalogList>[1]) => premium && readsList(list);
  const allowedIntents = allowedAssistantIntents(permissions);
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categorias(contaAtivaId),
    queryFn: () => fetchCategorias(contaAtivaId),
    enabled: open && readsList('expenseCategories'),
    staleTime: 60_000,
  });
  const dashboardQuery = useDashboardQuery(month, year, { enabled: open });
  const cardsQuery = useQuery({
    queryKey: queryKeys.cartoes(undefined, 'familia'),
    queryFn: () => fetchCartoes(undefined, 'familia'),
    enabled: open && readsList('cards'),
    staleTime: 60_000,
  });
  // Mesma fonte do modal: o seletor so aparece para quem tem mais de uma
  // conta, e a nota fiscal so em conta PJ.
  const contasQuery = useQuery({
    queryKey: queryKeys.contas,
    queryFn: () => fetchContas(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const contas = accountsAllowedByPlan(contasQuery.data ?? [], premium);

  // Sem escolha no card, vale a conta ativa — mesmo comportamento de antes,
  // agora visivel. `contaAtivaTipo` e o fallback que o modal tambem usa.
  const contaDoLancamento = contas.find((conta) => conta.id === draft?.contaId);
  const contaEhEmpresa = contaDoLancamento
    ? contaDoLancamento.tipo === 'empresa'
    : localStorage.getItem('contaAtivaTipo') === 'empresa';

  // Campos de receita exclusivos de conta PJ: mesmas queries do modal de
  // receita do desktop, so habilitadas quando ha o que mostrar.
  const clientesQuery = useQuery({
    queryKey: queryKeys.clients(contaAtivaId, ACTIVE_CLIENTS),
    queryFn: () => fetchClients(contaAtivaId!, ACTIVE_CLIENTS),
    enabled: open && contaEhEmpresa && readsPremiumList('clients') && contaAtivaId !== null,
    staleTime: 60_000,
  });
  // Classificacao vale para receita de conta pessoal e empresa: catalogo da
  // conta do lancamento, como no modal de receita do desktop.
  const classificacoesQuery = useQuery({
    queryKey: queryKeys.classificacoesReceita(contaAtivaId),
    queryFn: () => fetchClassificacoesReceita(contaAtivaId),
    enabled: open && readsList('incomeCategories'),
    staleTime: 60_000,
  });
  const representantesQuery = useQuery({
    queryKey: queryKeys.representantes,
    queryFn: () => fetchRepresentantes(),
    enabled: open && contaEhEmpresa && readsList('representatives'),
    staleTime: 60_000,
  });
  const produtosQuery = useQuery({
    queryKey: queryKeys.catalogoProdutos(contaAtivaId),
    queryFn: () => fetchProdutos(contaAtivaId!),
    enabled: open && contaEhEmpresa && readsPremiumList('products') && contaAtivaId !== null,
    staleTime: 60_000,
  });
  const contratosAtivosQuery = useQuery({
    queryKey: queryKeys.contractsWithHours(contaAtivaId),
    queryFn: () => fetchContractsWithHours(contaAtivaId!),
    enabled: open && contaEhEmpresa && readsPremiumList('contracts') && contaAtivaId !== null,
    staleTime: 60_000,
  });

  const conversationsQuery = useQuery({
    queryKey: queryKeys.copilotConversations,
    queryFn: fetchFinancialCopilotConversations,
    staleTime: 30_000,
  });

  // A conversa mais recente da o tempo desde a ultima visita. Ja vem nesta
  // query, entao a saudacao nao custa request nenhum.
  const saudacaoAtual = escolherSaudacao(ABERTURA, conversationsQuery.data?.[0]?.updatedAt);

  // A saudacao so e conhecida depois que o historico chega: ate la o chat ja
  // abriu com a de primeira vez, e aqui o texto e trocado sem tocar no resto
  // da conversa.
  useEffect(() => {
    setMessages((atual) => atual.map((m) => (
      m.id === 'welcome' && m.content !== saudacaoAtual
        ? { ...m, content: saudacaoAtual }
        : m
    )));
  }, [saudacaoAtual]);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.ativo);
  // Mesma regra do modal: um cartao so-credito nao aparece numa compra no debito.
  const cardsForDraft = (cardsQuery.data ?? []).filter((card) => (
    card.ativo && (!card.tipo || card.tipo === 'ambos' || card.tipo === draft?.paymentMethod)
  ));

  // ── Campos de receita PJ: mesmas regras do modal de receita do desktop ──
  const clientes = clientesQuery.data ?? [];
  const classificacoes = opcoesDeClassificacao(classificacoesQuery.data ?? []);
  const representantes = representantesQuery.data ?? [];
  // Mesmo criterio do desktop: so produtos ativos. A lista ja vem da conta do
  // lancamento — vender de uma conta o produto de outra misturaria os estoques.
  const produtosDisponiveis = (produtosQuery.data ?? []).filter((produto) => produto.ativo);
  const contratosAtivos = contratosAtivosQuery.data ?? [];

  const representanteSelecionado = draft?.representanteId
    ? representantes.find((representante) => representante.id === draft.representanteId)
    : null;
  const comissaoMatch = draft?.classificacaoId
    ? representanteSelecionado?.comissoes?.find((comissao) => comissao.classificacao_id === draft.classificacaoId)
    : undefined;
  const valorComissaoCalculado = comissaoMatch && draft?.amount
    ? (draft.amount * Number(comissaoMatch.percentual)) / 100
    : null;

  const produtoSelecionado = draft?.produtoId
    ? produtosDisponiveis.find((produto) => produto.id === draft.produtoId)
    : null;
  // Sem controle de estoque a venda nao baixa nem e barrada pelo saldo: nao ha estoque a mostrar.
  const estoqueDisponivel = produtoSelecionado?.controlaEstoque ? Number(produtoSelecionado.quantidadeEstoque) : null;

  const contratoSelecionado = draft?.contratoId
    ? contratosAtivos.find((contrato) => contrato.contractId === draft.contratoId)
    : null;
  const tipoHoraSelecionado = draft?.tipoHoraId
    ? contratoSelecionado?.hourTypes.find((tipo) => tipo.id === draft.tipoHoraId) ?? null
    : null;
  const valorHoraSelecionado = tipoHoraSelecionado?.hourlyRate ?? null;
  const saldoHorasAtual = tipoHoraSelecionado?.balance ?? null;
  const horasAcimaDoSaldo = saldoHorasAtual !== null && !!draft?.quantidadeHoras && draft.quantidadeHoras > saldoHorasAtual;
  // Contrato com órgão público: o valor digitado é o bruto, e a receita vale o líquido.
  const contratoComRetencoes = !!contratoSelecionado
    && Object.values(contratoSelecionado.withholdings).some((percentual) => (percentual ?? 0) > 0);

  // Regras do modal de despesa do desktop (draftRules): o card mostra a
  // situação, o vencimento calculado e as parcelas como o modal, e grava pela
  // mesma montagem. Mesmos cartões do modal (queryKeys.cartoes 'familia').
  const todayIso = getLocalTodayIso();
  const ruleContext: RuleContext = { todayIso, cards: (cardsQuery.data ?? []).filter((card) => card.ativo) };
  const expenseDraft = draft?.kind === 'expense' ? toExpenseDraft(draft, categories, todayIso, draftAttachments) : null;
  const expenseSummary = expenseDraft ? summarizeDraft(expenseDraft, ruleContext) : null;
  const installmentsSummary = expenseDraft?.billingType === 'installments'
    ? installmentsButtonLabel(expenseDraft, ruleContext)
    : null;

  const duplicateWarning = findDuplicate(
    draft,
    dashboardQuery.data?.incomes ?? [],
    dashboardQuery.data?.expenses ?? [],
    expenseDraft ? duplicateCheckKey(expenseDraft, ruleContext) : null,
  );
  const messageGroups = groupMessagesByDay(messages);

  // Recibo somente-leitura do que foi salvo. So os pares com valor aparecem —
  // sem isso o recibo de uma despesa simples (sem cartao, sem parcelamento)
  // ficaria com metade das linhas vazias.
  const buildReceiptRows = (registered: FinancialAssistantDraft): Array<{ label: string; value: string }> => {
    const rows: Array<{ label: string; value: string }> = [];
    const push = (label: string, value: string | null | undefined) => {
      if (value) rows.push({ label, value });
    };
    const todosCartoes = cardsQuery.data ?? [];

    const contaNome = registered.contaId
      ? (contas.find((conta) => conta.id === registered.contaId)?.nome_fantasia
        ?? contas.find((conta) => conta.id === registered.contaId)?.razao_social
        ?? contas.find((conta) => conta.id === registered.contaId)?.nome)
      : null;
    push('Conta', contaNome);
    push('Descrição', registered.description);

    if (registered.kind === 'income') {
      push('Valor', formatDraftAmount(registered.amount));
      push('Data', registered.date ? new Date(registered.date + 'T00:00:00').toLocaleDateString('pt-BR') : null);
      push('Cliente', registered.clienteId
        ? clientes.find((cliente) => cliente.id === registered.clienteId)?.name
        : null);
      push('Categoria', registered.classificacaoId
        ? classificacoes.find((classificacao) => classificacao.id === registered.classificacaoId)?.rotulo
        : null);
      push('Representante', registered.representanteId
        ? representantes.find((representante) => representante.id === registered.representanteId)?.nome
        : null);
      push('Produto', registered.produtoId
        ? produtosDisponiveis.find((produto) => produto.id === registered.produtoId)?.nome
        : null);
      if (registered.quantidadeVendida) push('Quantidade', String(registered.quantidadeVendida));
      if (registered.quantidadeHoras) push('Horas faturadas', String(registered.quantidadeHoras));
      if (registered.replicarAte) push('Replicado até', `${MONTH_NAMES[registered.replicarAte.mes]}/${registered.replicarAte.ano}`);
    } else {
      // O que foi gravado, pelas mesmas regras do salvamento: total e parcela
      // no parcelado, vencimento efetivo (o digitado ou o calculado).
      const registeredExpense = toExpenseDraft(registered, categories, todayIso);
      const installments = registered.billingType === 'parcelas';
      push(installments ? 'Total' : 'Valor', formatDraftAmount(registered.amount));
      if (installments) {
        const amounts = installmentAmounts(registeredExpense);
        const paidCount = paidInstallmentCount(registeredExpense);
        push('Parcelas', `${amounts.length}x de ${formatCents(amounts[0] ?? 0)}${paidCount ? ` · ${paidCount} ${paidCount === 1 ? 'paga' : 'pagas'}` : ''}`);
      }
      push(installments ? '1º vencimento' : 'Vencimento', isoToBrDate(effectiveDueDate(registeredExpense, ruleContext).date));
      push('Data da compra', registered.date ? isoToBrDate(registered.date) : null);
      push('Categoria', registered.category);
      push('Pagamento', registered.paymentMethod);
      push('Cartão', registered.cardId
        ? todosCartoes.find((card) => card.id === registered.cardId)?.nome
        : null);
      if (registered.billingType === 'mensal') push('Cobrança', 'Recorrente');
      if (!installments && registered.paid) {
        push('Pago em', registered.paymentDate ? isoToBrDate(registered.paymentDate) : null);
        push('Valor pago', formatDraftAmount(registered.amountPaid ?? registered.amount));
      }
      push('Nota fiscal', registered.invoiceNumber);
    }

    return rows;
  };

  const buildPaymentReceiptRows = (registered: PaymentDraft): Array<{ label: string; value: string }> => {
    const amountPaid = registered.amountPaid ?? registered.expense.valor;
    const rows = [
      { label: 'Despesa', value: openExpenseLabel(registered.expense) },
      { label: 'Valor pago', value: formatCurrency(amountPaid) },
      { label: 'Pago em', value: isoToBrDate(registered.paymentDate) },
    ];
    const difference = paymentDifferenceText(registered.expense, amountPaid);
    if (difference) rows.push({ label: 'Diferença', value: difference.text });
    return rows;
  };


  useEffect(() => {
    if (!open) return;
    // Sem autofoco em tela de toque: focar o campo abre o teclado junto com o
    // assistente, e a viewport encolhendo durante a animacao de abertura
    // deixava a conversa fora de vista. No desktop o foco continua, porque la
    // nao ha teclado virtual e comecar digitando e o esperado.
    const temTecladoVirtual = window.matchMedia('(pointer: coarse)').matches;
    if (temTecladoVirtual) return;
    const timer = window.setTimeout(() => composerRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, draft, payment, isPreparing]);

  // Teclado virtual abrindo/fechando encolhe a viewport sem disparar resize da
  // janela. Duas consequencias, tratadas juntas aqui:
  //
  // 1. a altura precisa acompanhar, senao o rodape fica atras do teclado;
  // 2. a ultima mensagem precisa reaparecer, senao o usuario digita sem ver o
  //    que estava lendo.
  //
  // Salto instantaneo de proposito: animar competiria com a propria animacao
  // do teclado.
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    // Sem a API, o `100dvh` do CSS continua valendo.
    if (!viewport) return;

    const acompanharTeclado = () => {
      setAlturaVisivel(viewport.height);
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    };

    acompanharTeclado();
    viewport.addEventListener('resize', acompanharTeclado);
    // No iOS a viewport desloca quando o teclado abre: sem ouvir o scroll, a
    // altura fica certa e a posicao errada.
    viewport.addEventListener('scroll', acompanharTeclado);

    return () => {
      viewport.removeEventListener('resize', acompanharTeclado);
      viewport.removeEventListener('scroll', acompanharTeclado);
    };
  }, [open]);

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  // Janela redimensionada pode deixar uma posicao ja salva fora da tela
  // (ex.: usuario arrastou numa tela grande, depois encolheu a janela).
  useEffect(() => {
    const reclampFab = () => setFabPosition((current) => clampFabPosition(current));
    window.addEventListener('resize', reclampFab);
    return () => window.removeEventListener('resize', reclampFab);
  }, []);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [composer]);

  const updateDraft = (patch: Partial<FinancialAssistantDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  // Produto vendido sugere o valor (quantidade x preco com desconto), mas nao
  // trava: o campo continua editavel por cima. Mesma regra do modal de receita.
  useEffect(() => {
    if (!produtoSelecionado || !draft?.quantidadeVendida) return;
    const valorCalculado = Number(draft.quantidadeVendida) * produtoSelecionado.valorFinal;
    if (valorCalculado > 0) updateDraft({ amount: valorCalculado });
  }, [produtoSelecionado, draft?.quantidadeVendida]); // eslint-disable-line react-hooks/exhaustive-deps

  // Horas a faturar sugerem o valor (quantidade x valor/hora do contrato),
  // mesma regra de nao travar o campo.
  useEffect(() => {
    if (!valorHoraSelecionado || !draft?.quantidadeHoras) return;
    const valorCalculado = Number(draft.quantidadeHoras) * valorHoraSelecionado;
    if (valorCalculado > 0) updateDraft({ amount: valorCalculado });
  }, [valorHoraSelecionado, draft?.quantidadeHoras]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectIntent = (nextIntent: FinancialCopilotIntentHint) => {
    setIntentHint(nextIntent);
    setLastVoiceTranscript(null);
    setError(null);
    const createdAt = new Date().toISOString();
    const opcao = ABERTURA.opcoes.find((o) => o.intent === nextIntent)!;
    const aberturaMessageId = newMessageId();
    if (nextIntent !== 'pay_expense') {
      setPayment(null);
      setPaymentHint(null);
    }
    setMessages((current) => [
      // Escolhida a acao, os chips saem de cena: manter os tres ativos
      // convidaria a trocar de intencao no meio do lancamento.
      ...current.map((item) => item.showWelcomeActions ? { ...item, showWelcomeActions: false } : item),
      {
        id: newMessageId(),
        role: 'user',
        content: opcao.label,
        createdAt,
      },
      // A resposta e local: o backend recusa mensagem vazia, e uma ida ao
      // servidor so para devolver texto fixo deixaria o chat mudo no caminho.
      {
        id: aberturaMessageId,
        role: 'assistant',
        content: opcao.abertura,
        createdAt,
      },
    ]);
    if (nextIntent === 'pay_expense') void offerOpenExpenses(aberturaMessageId);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  /** Sai do pagamento: tira os botões e o card de pagamento e devolve o menu. */
  const leavePayment = (content: string) => {
    setIntentHint(null);
    setPayment(null);
    setPaymentHint(null);
    setMessages((current) => [
      ...current.map((item) => item.paymentCandidates ? { ...item, paymentCandidates: undefined } : item),
      { id: newMessageId(), role: 'assistant', content, createdAt: new Date().toISOString(), showWelcomeActions: true },
    ]);
  };

  /**
   * "Pagar despesa": as vencidas e as do mês viram botões sob a fala do chip.
   * Escrever o nome também serve (busca no servidor, pelo handleSend).
   */
  const offerOpenExpenses = async (messageId: string) => {
    setIsPreparing(true);
    try {
      const accountId = getActiveAccountId();
      const candidates = await queryClient.fetchQuery({
        queryKey: queryKeys.despesasEmAberto(accountId),
        queryFn: () => fetchDespesasEmAberto(accountId),
        staleTime: 0,
      });
      if (candidates.length === 0) {
        leavePayment('Você não tem despesas em aberto.');
        return;
      }
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, paymentCandidates: candidates } : item));
    } catch (requestError) {
      // Sem a lista, escrever o nome da despesa continua funcionando.
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar as despesas em aberto.');
    } finally {
      setIsPreparing(false);
    }
  };

  /** Despesa escolhida num botão: abre o card com o valor e a data que a última frase trouxe. */
  const choosePaymentCandidate = (candidate: OpenExpense) => {
    setError(null);
    setMessages((current) => [
      ...current.map((item) => item.paymentCandidates ? { ...item, paymentCandidates: undefined } : item),
      { id: newMessageId(), role: 'user', content: openExpenseLabel(candidate), createdAt: new Date().toISOString() },
    ]);
    setDraft(null);
    setPayment({
      expense: candidate,
      amountPaid: paymentHint?.amountPaid ?? null,
      paymentDate: paymentHint?.paymentDate ?? getLocalTodayIso(),
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const selected = Array.from(files);
    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (availableSlots <= 0) {
      setError('Envie no máximo três arquivos por mensagem.');
      return;
    }

    const allowed = selected.slice(0, availableSlots).filter((file) => {
      if (!ACCEPTED_FILE_TYPES.has(file.type)) {
        setError('Use PDF, imagem JPG/PNG/WEBP ou arquivo TXT.');
        return false;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError('Cada arquivo pode ter no máximo 10 MB.');
        return false;
      }
      return true;
    });

    try {
      const converted = await Promise.all(allowed.map(fileToAttachment));
      setAttachments((current) => [...current, ...converted]);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Não foi possível preparar o arquivo.');
    }
  };

  /**
   * `displayLabel` separa o que o usuario LE do que o backend RECEBE. Nos
   * chips os dois divergem: escolher o cartao "Nubank" envia o id "6", e
   * escolher "Não repete" envia "nao" — sem essa separacao o balao mostrava
   * o valor tecnico no lugar da escolha feita.
   */
  const handleSend = async (overrideMessage?: string, displayLabel?: string) => {
    const message = (overrideMessage ?? composer).trim();
    if ((!message && attachments.length === 0) || isPreparing) return;

    // A pergunta veio do microfone? So essa resposta e falada; consumido aqui,
    // o modo volta a falso para a proxima mensagem digitada.
    const askedByVoice = voiceMode;
    setVoiceMode(false);
    speech.stop();

    const messageAttachments = attachments;
    const displayedMessage = message || 'Analise os arquivos enviados.';
    const bubbleText = displayLabel ?? displayedMessage;
    setError(null);
    const wasPaying = intentHint === 'pay_expense';
    setMessages((current) => [
      // Respondida a pergunta, os botoes saem de cena: deixa-los ativos
      // convidaria a responder duas vezes o mesmo campo.
      ...current.map((item) => item.quickReplies || item.paymentCandidates
        ? { ...item, quickReplies: undefined, paymentCandidates: undefined }
        : item),
      {
        id: newMessageId(),
        role: 'user',
        content: bubbleText,
        createdAt: new Date().toISOString(),
        attachments: messageAttachments.map((attachment) => ({ nome: attachment.nome, tamanho: attachment.tamanho })),
      },
    ]);
    setComposer('');
    setAttachments([]);
    setLastVoiceTranscript(null);
    setIsPreparing(true);

    try {
      const result = await sendFinancialCopilotMessage({
        message: displayedMessage,
        month,
        year,
        attachments: messageAttachments,
        context: draft ?? undefined,
        conversationId,
        intentHint,
        voiceMode: askedByVoice,
      });
      setConversationId(result.conversationId);
      const paymentResult = result.mode === 'payment' ? result.payment : undefined;
      const candidates = paymentResult?.candidates ?? [];
      // No pagamento, o que for digitado continua sendo busca de pagamento ate
      // a despesa ser paga, descartada ou o "Voltar".
      setIntentHint(candidates.length > 0 ? 'pay_expense' : null);
      if (result.mode === 'draft' && result.draft) {
        // Datas que os modais do desktop preenchem sozinhos (hoje, "Pago em").
        setDraft(fillDraftDefaults(result.draft, getLocalTodayIso()));
        setInstallmentsOpen(false);
        setDraftAttachments((current) => messageAttachments.length > 0 ? [...current, ...messageAttachments] : current);
      }
      const singleCandidate = candidates.length === 1 ? candidates[0] : undefined;
      if (paymentResult) {
        setPaymentHint({ amountPaid: paymentResult.amountPaid, paymentDate: paymentResult.paymentDate });
        // Uma so: o card abre direto. Varias: botoes para escolher.
        setPayment(singleCandidate ? {
          expense: singleCandidate,
          amountPaid: paymentResult.amountPaid,
          paymentDate: paymentResult.paymentDate ?? getLocalTodayIso(),
        } : null);
      }
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
        cards: result.cards,
        quickReplies: result.quickReplies,
        paymentCandidates: candidates.length > 1 ? candidates : undefined,
        // Pagamento que terminou sem despesa (nenhuma em aberto, sem acesso): o menu volta.
        showWelcomeActions: wasPaying && candidates.length === 0 ? true : undefined,
      }]);
      // A resposta escrita ja esta na tela: a fala e um extra que pode faltar
      // (cota estourada, navegador sem sintese) sem prejudicar o uso.
      if (askedByVoice && result.spokenReply) speech.speak(result.spokenReply);
      await queryClient.invalidateQueries({ queryKey: queryKeys.copilotConversations });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar esta informação.');
    } finally {
      setIsPreparing(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([buildInitialMessage(ABERTURA.saudacao)]);
    setDraft(null);
    setInstallmentsOpen(false);
    setPayment(null);
    setPaymentHint(null);
    setDraftAttachments([]);
    setComposer('');
    setAttachments([]);
    setIntentHint(null);
    setLastVoiceTranscript(null);
    setHistoryOpen(false);
    setError(null);
  };

  const restoreConversation = async (id: number) => {
    setError(null);
    try {
      const storedMessages = await fetchFinancialCopilotConversation(id);
      setConversationId(id);
      setMessages(storedMessages.map((message) => ({
        id: `history-${message.id}`,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        cards: message.payload?.cards,
      })));
      setDraft(null);
      setInstallmentsOpen(false);
      setPayment(null);
      setPaymentHint(null);
      setDraftAttachments([]);
      setIntentHint(null);
      setLastVoiceTranscript(null);
      setHistoryOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível restaurar a conversa.');
    }
  };

  const removeConversation = async (id: number) => {
    setError(null);
    try {
      await deleteFinancialCopilotConversation(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.copilotConversations });
      if (conversationId === id) startNewConversation();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível remover a conversa.');
    }
  };

  // Sem restauracao automatica da ultima conversa: ela fazia setMessages com o
  // historico e engolia a saudacao, entao reabrir o app caia no meio de uma
  // conversa antiga. O historico continua a um toque, no menu do cabecalho.
  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setError('A entrada por voz não é compatível com este navegador.');
      return;
    }

    setError(null);
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) => {
        const result = event.results[event.resultIndex + index];
        return result?.[0]?.transcript ?? '';
      }).join(' ').trim();
      if (!transcript) return;
      setComposer((current) => [current, transcript].filter(Boolean).join(current ? ' ' : ''));
      setLastVoiceTranscript(transcript);
      setVoiceMode(true);
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Permita o uso do microfone para registrar por voz.');
      } else if (event.error !== 'aborted') {
        setError('Não foi possível transcrever sua fala. Tente novamente.');
      }
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setError('Não foi possível iniciar a gravação de voz. Tente novamente.');
    }
  };

  const handleSave = async () => {
    if (!draft) return;

    // A despesa valida e monta o que é gravado pelas regras do modal do
    // desktop (cardDraft → draftRules); a receita segue com a checagem do card.
    let save: () => Promise<void>;
    if (draft.kind === 'expense') {
      const expenseSave = buildExpenseSave(draft, {
        categories,
        context: ruleContext,
        // Sem conta escolhida no card, a despesa entra na conta ativa.
        accountId: draft.contaId ?? getActiveAccountId(),
        attachments: draftAttachments,
      });
      if (!expenseSave.ok) {
        setError(expenseSave.error);
        return;
      }
      save = async () => {
        await createExpense(expenseSave.input);
        invalidateExpenseQueries(queryClient);
      };
    } else {
      const description = draft.description?.trim();
      const amount = draft.amount;
      const date = draft.date;
      if (!description || !amount || amount <= 0) {
        setError('Complete a descrição e o valor antes de salvar.');
        return;
      }
      if (!date) {
        setError('Informe a data antes de salvar.');
        return;
      }
      if (horasAcimaDoSaldo) {
        setError(`Saldo de horas insuficiente: restam ${saldoHorasAtual}h.`);
        return;
      }
      save = async () => {
        const until = draft.replicarAte ?? null;
        const [receiptYear, receiptMonth] = date.split('-').map(Number);
        // "Repetir até" o próprio mês da receita não repete nada.
        const repeats = until !== null && until.ano * 12 + until.mes > receiptYear! * 12 + receiptMonth! - 1;
        await createIncome({
          // Sem conta escolhida no card, a receita entra na conta ativa.
          accountId: draft.contaId ?? getActiveAccountId(),
          description,
          categoryId: draft.classificacaoId ?? null,
          amount,
          receiptDate: date,
          // Campos exclusivos de conta PJ: em conta PF os blocos do card nem
          // aparecem, entao permanecem vazios aqui. A comissao sai do servidor.
          clientId: draft.clienteId ?? null,
          representativeId: draft.representanteId ?? null,
          attachments: draftAttachments.length > 0 ? draftAttachments : null,
          repeatUntil: repeats ? { month: until.mes, year: until.ano } : null,
          productSale: draft.produtoId && draft.quantidadeVendida
            ? { productId: draft.produtoId, quantity: draft.quantidadeVendida }
            : null,
          billableHours: draft.contratoId && draft.tipoHoraId && draft.quantidadeHoras
            ? { hourTypeId: draft.tipoHoraId, hours: draft.quantidadeHoras }
            : null,
        });
        invalidateIncomeQueries(queryClient);
      };
    }

    setError(null);
    setIsSaving(true);
    try {
      await save();
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
      // Fechado o lancamento, a conversa volta ao inicio: o menu de acoes
      // reaparece para quem lanca varias despesas seguidas.
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: draft.kind === 'income'
          ? 'Prontinho, receita lançada! Quer registrar outra?'
          : 'Prontinho, despesa lançada! Quer registrar outra?',
        createdAt: new Date().toISOString(),
        showWelcomeActions: true,
        // Copia do draft no instante do salvamento: a mensagem guarda o que
        // foi lancado, mesmo depois que o draft ativo mudar ou for limpo.
        registeredDraft: { ...draft },
      }]);
      setDraft(null);
      setInstallmentsOpen(false);
      setDraftAttachments([]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const discardDraft = () => {
    if (isSaving) return;
    // Mesmo fechamento do handleSave: sem isso a conversa ficava sem nenhuma
    // acao visivel apos descartar, dando sensacao de travamento.
    setMessages((current) => [...current, {
      id: newMessageId(),
      role: 'assistant',
      content: 'Que pena, quer fazer outro lançamento? É só escolher uma das opções abaixo',
      createdAt: new Date().toISOString(),
      showWelcomeActions: true,
    }]);
    setDraft(null);
    setInstallmentsOpen(false);
    setDraftAttachments([]);
    setError(null);
    setLastVoiceTranscript(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  // Mesma rota e mesmos padrões do "Confirmar Pagamento" do desktop: sem
  // valor digitado, paga o previsto.
  const handlePay = async () => {
    if (!payment) return;
    const amountPaid = payment.amountPaid ?? payment.expense.valor;
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      setError('Informe o valor pago.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate)) {
      setError('Informe a data do pagamento.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await pagarDespesa(payment.expense.id, payment.paymentDate, amountPaid);
      invalidateExpenseQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: 'Prontinho, pagamento registrado! Quer fazer mais alguma coisa?',
        createdAt: new Date().toISOString(),
        showWelcomeActions: true,
        registeredPayment: { ...payment, amountPaid },
      }]);
      setPayment(null);
      setPaymentHint(null);
      setIntentHint(null);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'Não foi possível registrar o pagamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const discardPayment = () => {
    if (isSaving) return;
    setError(null);
    leavePayment('Tudo bem, não registrei o pagamento. Quer fazer outra coisa? É só escolher uma das opções abaixo');
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  // So arrasta no desktop: em touch o icone continua fixo, sem competir com
  // o scroll da pagina. Clique sem deslocamento significativo abre o chat
  // normalmente — so conta como arraste acima do threshold.
  const handleFabMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    event.preventDefault();
    fabDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: fabPosition.right,
      startBottom: fabPosition.bottom,
      moved: false,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = fabDragRef.current;
      if (!drag) return;
      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) > FAB_DRAG_THRESHOLD) drag.moved = true;
      if (!drag.moved) return;
      setFabPosition(clampFabPosition({
        right: drag.startRight - deltaX,
        bottom: drag.startBottom - deltaY,
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const drag = fabDragRef.current;
      fabDragRef.current = null;
      if (!drag) return;
      if (drag.moved) {
        setFabPosition((current) => {
          const clamped = clampFabPosition(current);
          storeFabPosition(clamped);
          return clamped;
        });
      } else {
        setOpen(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      {!isStandalone && (
        <button
          type="button"
          // No desktop o proprio handler de arraste decide abrir ou nao
          // (preventDefault no mousedown suprime o click nativo). Em touch o
          // mousedown nao faz nada, entao o click continua abrindo direto.
          onMouseDown={handleFabMouseDown}
          onClick={() => {
            if (window.matchMedia('(pointer: coarse)').matches) setOpen(true);
          }}
          style={{ right: fabPosition.right, bottom: fabPosition.bottom }}
          className="fixed z-40 flex h-14 w-14 cursor-grab items-center justify-center overflow-hidden rounded-full bg-[#0891b2] text-white shadow-lg shadow-cyan-950/25 transition hover:bg-[#0e7490] focus:outline-none focus:ring-2 focus:ring-[#0EC4D8] focus:ring-offset-2 active:cursor-grabbing dark:focus:ring-offset-slate-950"
          aria-label="Abrir o Juca, seu assistente financeiro"
          title="Juca"
        >
          <img
            src="/icons/assistente-perfil.webp"
            alt=""
            className="h-full w-full object-cover object-[center_35%]"
          />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[70]">
          {!isStandalone && (
            <button
              type="button"
              className="absolute inset-0 hidden bg-slate-950/25 backdrop-blur-[1px] sm:block"
              onClick={() => setOpen(false)}
              aria-label="Fechar o Juca"
            />
          )}
          <section
            className={isStandalone
              // h-[100dvh] e o fallback para quando visualViewport nao existe;
              // quem manda e a altura medida no style, porque o teclado nao
              // altera a altura da janela — so a da viewport visivel.
              ? 'absolute inset-0 flex h-[100dvh] flex-col overflow-hidden bg-slate-50 dark:bg-slate-950'
              : 'absolute inset-0 flex flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(800px,calc(100vh-2.5rem))] sm:w-[440px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-slate-950/25 dark:sm:border-slate-800'}
            // A altura medida vence o 100dvh do CSS: so ela encolhe quando o
            // teclado abre. No modo flutuante nao se aplica — ele tem altura
            // propria e fica ancorado no canto, sem disputa com o teclado.
            style={isStandalone && alturaVisivel ? { height: alturaVisivel } : undefined}
            role={isStandalone ? undefined : 'dialog'}
            aria-label="Juca, assistente financeiro"
            aria-modal={isStandalone ? undefined : true}
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-[#0A6571] bg-[#0D2E3C] px-4 py-3 text-white">
              <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full border border-cyan-100/35 bg-[#07313A]">
                <img
                  src="/icons/assistente-perfil.webp"
                  alt="Avatar do Juca"
                  className="h-full w-full object-cover object-[center_35%]"
                />
              </div>
              <div className="min-w-0 flex-1">
                {/* Nome identifica, funcao explica: quem abre pela primeira
                    vez precisa dos dois. */}
                <p className="text-base font-bold leading-tight">Juca</p>
                <p className="text-[11.5px] text-cyan-100/70">Assistente financeiro</p>
              </div>
              <AssistantHeaderMenu
                onOpenHistory={() => setHistoryOpen((current) => !current)}
                onNewConversation={startNewConversation}
                onOpenDashboard={isStandalone ? () => { window.location.href = '/app.html?source=assistant'; } : undefined}
                fontSize={fontSize}
                onFontSizeChange={handleFontSizeChange}
              />
              {!isStandalone && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fechar o Juca"
                  title="Fechar"
                >
                  <X size={19} />
                </button>
              )}
            </header>

            {historyOpen && (
              <div className="absolute inset-x-0 top-[73px] z-10 max-h-64 overflow-y-auto border-b border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">Conversas recentes</p>
                {conversationsQuery.isLoading && <p className="py-3 text-xs text-slate-500">Carregando histórico...</p>}
                {conversationsQuery.error && <p className="py-3 text-xs text-red-600 dark:text-red-300">Não foi possível carregar o histórico.</p>}
                {!conversationsQuery.isLoading && !conversationsQuery.error && (conversationsQuery.data?.length ?? 0) === 0 && (
                  <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Nenhuma conversa salva nesta conta.</p>
                )}
                <div className="grid gap-1">
                  {conversationsQuery.data?.map((conversation) => (
                    <div key={conversation.id} className="flex items-center gap-1 border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => void restoreConversation(conversation.id)}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="block truncate font-medium">{conversation.title}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{new Date(conversation.updatedAt).toLocaleDateString('pt-BR')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeConversation(conversation.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        aria-label={`Excluir conversa ${conversation.title}`}
                        title="Excluir conversa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className="flex-1 overflow-y-auto bg-[linear-gradient(135deg,rgba(14,196,216,0.045),transparent_45%)] px-3 py-4 dark:bg-[linear-gradient(135deg,rgba(14,196,216,0.08),transparent_45%)]"
              style={{ zoom: fontSizeToScale(fontSize) } as CSSProperties}
            >
              <div className="space-y-3">
                {messageGroups.map((group) => (
                  <div key={group.dayLabel} className="space-y-3">
                    <div className="flex justify-center">
                      <span className="rounded-full bg-white/90 px-3.5 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:bg-slate-800/90 dark:text-slate-300">
                        {group.dayLabel}
                      </span>
                    </div>
                    {group.messages.map((message) => (
                <div key={message.id}>
                <div className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={[
                      'max-w-[86%]',
                      'px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-l-xl rounded-br-xl bg-[#0891b2] text-white'
                        : 'rounded-r-xl rounded-bl-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                    ].join(' ')}>
                      <p>{message.content}</p>
                      {message.attachments?.map((attachment) => (
                        <div
                          key={attachment.nome}
                          className={[
                            'mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2.5',
                            message.role === 'user' ? 'bg-white/15' : 'bg-slate-50 dark:bg-slate-800/60',
                          ].join(' ')}
                        >
                          <span className={[
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            message.role === 'user' ? 'bg-white text-rose-600' : 'bg-white text-rose-600 dark:bg-slate-950',
                          ].join(' ')}>
                            <FileText size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{attachment.nome}</p>
                            <p className="mt-0.5 text-[11px] opacity-75">Arquivo · {formatAttachmentSize(attachment.tamanho)}</p>
                          </div>
                          {message.role === 'user' && <Check size={15} className="shrink-0 text-[#7ffcff]" />}
                        </div>
                      ))}
                      {message.cards?.map((card, index) => <CopilotCardView key={`${card.type}-${index}`} card={card} />)}
                    </div>
                  </div>

                  {/* Recibo do que foi salvo: mesma estrutura do card de
                      edicao, mas travado e semi-transparente — so leitura,
                      sem input nem botao de acao. */}
                  {message.registeredDraft && (
                    <Card className="mt-2 border-slate-200 p-0 opacity-60 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {message.registeredDraft.kind === 'income' ? 'Receita lançada' : 'Despesa lançada'}
                        </p>
                      </div>
                      <div className="px-3.5">
                        {buildReceiptRows(message.registeredDraft).map((row) => (
                          <div key={row.label} className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
                            <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{row.label}</span>
                            <span className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {message.registeredPayment && (
                    <Card className="mt-2 border-slate-200 p-0 opacity-60 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Pagamento registrado</p>
                      </div>
                      <div className="px-3.5">
                        {buildPaymentReceiptRows(message.registeredPayment).map((row) => (
                          <div key={row.label} className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
                            <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{row.label}</span>
                            <span className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Lembrete discreto do ultimo lancamento — so na
                      saudacao inicial, nunca em reaberturas de sub-fluxo
                      (essas tambem usam showWelcomeActions, mas nao sao a
                      mensagem 'welcome'). Puramente informativo, sem
                      destaque visual. */}
                  {message.id === 'welcome' && (() => {
                    const texto = buildUltimoLancamentoTexto(ultimosLancamentos);
                    return texto ? (
                      <p className="mt-1.5 text-xs italic text-slate-500 dark:text-slate-400">{texto}</p>
                    ) : null;
                  })()}

                  {/* Fora do balao, empilhados: sao acoes do usuario, nao
                      conteudo da fala do assistente. Mesmo formato para os
                      chips de abertura e para as respostas rapidas de cada
                      pergunta do fluxo. */}
                  {message.showWelcomeActions && (
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {ABERTURA.opcoes.filter((opcao) => allowedIntents.includes(opcao.intent)).map((opcao) => (
                        <button
                          key={opcao.intent}
                          type="button"
                          onClick={() => selectIntent(opcao.intent)}
                          className={WELCOME_CHIP_CLASS_BY_INTENT[opcao.intent]}
                        >
                          {INTENT_ICONS[opcao.intent]}
                          {opcao.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {message.quickReplies && message.quickReplies.length > 0 && (
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {message.quickReplies.map((quickReply) => (
                        <button
                          key={`${quickReply.value}-${quickReply.label}`}
                          type="button"
                          // Envia o value tecnico, exibe o label no balao.
                          onClick={() => void handleSend(quickReply.value, quickReply.label)}
                          disabled={isPreparing}
                          className={`${ASSISTANT_CHIP_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {quickReply.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Despesas em aberto do "Pagar despesa": tocar abre o card
                      de pagamento; "Voltar" devolve o menu. */}
                  {message.paymentCandidates && message.paymentCandidates.length > 0 && (
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {message.paymentCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => choosePaymentCandidate(candidate)}
                          disabled={isPreparing}
                          className={`${ASSISTANT_CHIP_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {openExpenseLabel(candidate)} · {formatCurrency(candidate.valor)} · {candidate.vencida ? 'venceu' : 'vence'} {isoToBrDate(candidate.vencimento).slice(0, 5)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => leavePayment('Certo. O que vamos fazer? É só escolher uma das opções abaixo')}
                        disabled={isPreparing}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Voltar
                      </button>
                    </div>
                  )}
                  </div>
                    ))}
                  </div>
                ))}

                {isPreparing && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s] dark:bg-slate-600" />
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s] dark:bg-slate-600" />
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">digitando…</span>
                  </div>
                )}

                {draft && (
                  <Card className="border-cyan-200 p-0 dark:border-cyan-900/70">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-cyan-50/60 px-3.5 py-2.5 dark:border-slate-800 dark:bg-cyan-950/20">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {draft.kind === 'income' ? 'Dinheiro que entrou' : 'Despesa'}
                        </p>
                      </div>
                      <Badge tone={draft.confidence === 'high' ? 'income' : draft.confidence === 'medium' ? 'warning' : 'neutral'}>
                        {draft.confidence === 'high' ? 'Leitura alta' : draft.confidence === 'medium' ? 'Conferir' : 'Dados parciais'}
                      </Badge>
                    </div>

                    <div className="px-3.5">
                      {/* Só para quem tem mais de uma conta, como no modal:
                          com uma só não há entre o que escolher. Antes o card
                          usava a conta ativa sem mostrar qual era. */}
                      {contas.length > 1 && (
                        <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                          <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Conta</span>
                          <span className="relative flex-1">
                            <select
                              value={draft.contaId ?? ''}
                              onChange={(event) => updateDraft({ contaId: event.target.value ? Number(event.target.value) : null })}
                              className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                            >
                              <option value="">Conta ativa</option>
                              {contas.map((conta) => (
                                <option key={conta.id} value={conta.id}>
                                  {conta.nome_fantasia || conta.razao_social || conta.nome} {conta.tipo === 'empresa' ? '(PJ)' : '(PF)'}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                          </span>
                        </label>
                      )}

                      <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                        <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Descrição</span>
                        <input
                          value={draft.description ?? ''}
                          onChange={(event) => updateDraft({ description: event.target.value || null })}
                          placeholder="Ex.: Mercado Central"
                          className="h-7 flex-1 bg-transparent text-base font-bold text-slate-900 outline-none transition placeholder:text-slate-400 placeholder:font-normal dark:text-white"
                        />
                      </label>

                      <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                        {/* No parcelado o valor é o total, como no modal do desktop. */}
                        <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {draft.kind === 'expense' && draft.billingType === 'parcelas' ? 'Valor total' : 'Valor'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.amount ?? ''}
                          onChange={(event) => updateDraft({ amount: event.target.value ? Number(event.target.value) : null })}
                          className="h-7 flex-1 appearance-none bg-transparent text-lg font-bold tabular-nums text-slate-900 outline-none transition [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
                        />
                      </label>

                      <label className={['flex items-center gap-3 py-2', draft.kind === 'expense' ? 'border-b border-slate-100 dark:border-slate-800' : ''].join(' ')}>
                        <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {draft.kind === 'expense' ? 'Vencimento' : 'Data'}
                        </span>
                        <IsoDateField
                          value={(draft.kind === 'expense' ? draft.dueDate : draft.date) ?? ''}
                          onChange={(iso) => draft.kind === 'expense'
                            ? updateDraft({ dueDate: iso || null })
                            : updateDraft({ date: iso || null })}
                          label={draft.kind === 'expense' ? 'Vencimento' : 'Data'}
                          inputClassName="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                          height={32}
                        />
                        {/* Em branco o vencimento é calculado, como no modal: a
                            data aparece na linha de situação abaixo. */}
                        {draft.kind === 'expense' && !draft.dueDate && (
                          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">calculado</span>
                        )}
                      </label>

                      {/* Separada do vencimento, como no modal: comprar hoje e
                          vencer no mês que vem é o caso comum no crédito. Era
                          gravada em silêncio (draft.date ?? vencimento). */}
                      {draft.kind === 'expense' && (
                        <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                          <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Data da compra</span>
                          <IsoDateField
                            value={draft.date ?? ''}
                            onChange={(iso) => updateDraft({ date: iso || null })}
                            label="Data da compra"
                            inputClassName="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                            height={32}
                          />
                        </label>
                      )}

                      {draft.kind === 'expense' && (
                        <>
                          <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                            <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Categoria</span>
                            <span className="relative flex-1">
                              <select
                                value={draft.category ?? ''}
                                onChange={(event) => updateDraft({ category: event.target.value || null })}
                                className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                              >
                                <option value="">Sem categoria</option>
                                {categories.map((category) => <option key={category.id} value={category.nome}>{category.nome}</option>)}
                              </select>
                              <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                            </span>
                          </label>
                          <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                            <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Pagamento</span>
                            <span className="relative flex-1">
                              <select
                                value={draft.paymentMethod}
                                onChange={(event) => updateDraft({ paymentMethod: event.target.value as FinancialAssistantDraft['paymentMethod'] })}
                                className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                              >
                                <option value="pix">Pix</option>
                                <option value="dinheiro">Dinheiro</option>
                                <option value="debito">Débito</option>
                                <option value="credito">Crédito</option>
                              </select>
                              <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                            </span>
                          </label>
                          {cardsForDraft.length > 0 && (
                            <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                              <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Cartão</span>
                              <span className="relative flex-1">
                                <select
                                  value={draft.cardId ?? ''}
                                  onChange={(event) => updateDraft({ cardId: event.target.value ? Number(event.target.value) : null })}
                                  className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                >
                                  <option value="">Sem cartão</option>
                                  {cardsForDraft.map((card) => <option key={card.id} value={card.id}>{card.nome}</option>)}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                              </span>
                            </label>
                          )}

                          <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                            <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Cobrança</span>
                            <span className="relative flex-1">
                              <select
                                value={draft.billingType ?? 'nao'}
                                onChange={(event) => {
                                  const billingType = event.target.value as NonNullable<FinancialAssistantDraft['billingType']>;
                                  const installments = billingType === 'parcelas';
                                  updateDraft({
                                    billingType,
                                    installments: installments ? (draft.installments ?? MIN_INSTALLMENTS) : null,
                                    // Parcelas pagas só existem no parcelado.
                                    installmentPayments: installments ? draft.installmentPayments : undefined,
                                    overdueDismissed: installments ? draft.overdueDismissed : undefined,
                                  });
                                  if (!installments) setInstallmentsOpen(false);
                                }}
                                className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                              >
                                <option value="nao">Não repete</option>
                                <option value="parcelas">Parcelado</option>
                                <option value="mensal">Recorrente</option>
                              </select>
                              <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                            </span>
                          </label>

                          {/* Parcelado: quantas, e o resumo que abre a lista
                              de parcelas — a grade do modal do desktop. */}
                          {draft.billingType === 'parcelas' && expenseDraft && (
                            <>
                              <div className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Parcelas</span>
                                <input
                                  type="number"
                                  min="2"
                                  max="360"
                                  value={draft.installments ?? ''}
                                  onChange={(event) => updateDraft({ installments: event.target.value ? Number(event.target.value) : null })}
                                  placeholder={String(MIN_INSTALLMENTS)}
                                  aria-label="Quantidade de parcelas"
                                  className="h-7 w-12 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => setInstallmentsOpen((current) => !current)}
                                  aria-expanded={installmentsOpen}
                                  className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right text-xs font-semibold text-[#0e7490] dark:text-cyan-300"
                                >
                                  <span className="truncate">{installmentsSummary}</span>
                                  <ChevronDown size={15} className={['shrink-0 transition', installmentsOpen ? 'rotate-180' : ''].join(' ')} />
                                </button>
                              </div>
                              {installmentsOpen && (
                                <InstallmentList expenseDraft={expenseDraft} context={ruleContext} onChange={updateDraft} />
                              )}
                            </>
                          )}

                          {draft.billingType !== 'parcelas' && (
                            <>
                              <label className="flex items-center gap-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={draft.paid}
                                  // Como o modal: marcar traz "Pago em" com hoje; desmarcar limpa a data e o valor pago.
                                  onChange={(event) => updateDraft(event.target.checked
                                    ? { paid: true, paymentDate: draft.paymentDate ?? getLocalTodayIso() }
                                    : { paid: false, paymentDate: null, amountPaid: null })}
                                  className="h-[18px] w-[18px] accent-[#0891b2]"
                                />
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">Esta despesa já foi paga</span>
                              </label>

                              {draft.paid && (
                                <>
                                  <label className="flex items-center gap-3 border-t border-slate-100 py-2 dark:border-slate-800">
                                    <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Valor pago</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={draft.amountPaid ?? ''}
                                      onChange={(event) => updateDraft({ amountPaid: event.target.value ? Number(event.target.value) : null })}
                                      placeholder={draft.amount ? String(draft.amount) : ''}
                                      className="h-7 flex-1 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-white"
                                    />
                                  </label>
                                  <label className="flex items-center gap-3 border-t border-slate-100 py-2 dark:border-slate-800">
                                    <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Pago em</span>
                                    <IsoDateField
                                      value={draft.paymentDate ?? ''}
                                      onChange={(iso) => updateDraft({ paymentDate: iso || null })}
                                      label="Pago em"
                                      inputClassName="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                                      height={32}
                                    />
                                  </label>
                                </>
                              )}
                            </>
                          )}

                          {/* Nota fiscal so em conta PJ, mesmo criterio do
                              modal. O card ja gravava numero_nf e
                              data_emissao_nf sem oferecer onde corrigi-los. */}
                          {contaEhEmpresa && (
                            <>
                              <label className="flex items-center gap-3 border-t border-slate-100 py-2 dark:border-slate-800">
                                <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Nota fiscal</span>
                                <input
                                  value={draft.invoiceNumber ?? ''}
                                  onChange={(event) => updateDraft({ invoiceNumber: event.target.value || null })}
                                  placeholder="Número"
                                  className="h-7 flex-1 bg-transparent text-base font-bold text-slate-900 outline-none transition placeholder:text-slate-400 placeholder:font-normal dark:text-white"
                                />
                              </label>

                              <label className="flex items-center gap-3 border-t border-slate-100 py-2 dark:border-slate-800">
                                <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Emissão</span>
                                <IsoDateField
                                  value={draft.invoiceDate ?? ''}
                                  onChange={(iso) => updateDraft({ invoiceDate: iso || null })}
                                  label="Emissão da nota fiscal"
                                  inputClassName="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                                  height={32}
                                />
                              </label>
                            </>
                          )}
                        </>
                      )}

                      {draft.kind === 'income' && classificacoes.length > 0 && (
                        <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                          <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Categoria</span>
                          <span className="relative flex-1">
                            <select
                              value={draft.classificacaoId ?? ''}
                              onChange={(event) => updateDraft({ classificacaoId: event.target.value ? Number(event.target.value) : null })}
                              className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                            >
                              <option value="">Sem categoria</option>
                              {classificacoes.map((classificacao) => (
                                <option key={classificacao.id} value={classificacao.id}>{classificacao.rotulo}</option>
                              ))}
                            </select>
                            <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                          </span>
                        </label>
                      )}

                      {/* Campos de receita exclusivos de conta PJ — mesmo
                          criterio do modal de receita do desktop (isEmpresa).
                          Em conta PF nenhum destes blocos aparece. */}
                      {draft.kind === 'income' && contaEhEmpresa && (
                        <>
                          {clientes.length > 0 && (
                            <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                              <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Cliente</span>
                              <span className="relative flex-1">
                                <select
                                  value={draft.clienteId ?? ''}
                                  onChange={(event) => updateDraft({ clienteId: event.target.value ? Number(event.target.value) : null })}
                                  className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                >
                                  <option value="">Sem cliente</option>
                                  {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.name}</option>)}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                              </span>
                            </label>
                          )}

                          {representantes.length > 0 && (
                            <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                              <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Representante</span>
                              <span className="relative flex-1">
                                <select
                                  value={draft.representanteId ?? ''}
                                  onChange={(event) => updateDraft({ representanteId: event.target.value ? Number(event.target.value) : null })}
                                  className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                >
                                  <option value="">Nenhum</option>
                                  {representantes.map((representante) => (
                                    <option key={representante.id} value={representante.id}>{representante.nome}</option>
                                  ))}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                              </span>
                            </label>
                          )}

                          {representanteSelecionado && valorComissaoCalculado !== null && (
                            <p className="border-b border-slate-100 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              {representanteSelecionado.nome} receberá <span className="font-semibold text-[#0e7490]">{formatCurrency(valorComissaoCalculado)}</span> de comissão ({comissaoMatch!.percentual}%).
                            </p>
                          )}

                          {produtosDisponiveis.length > 0 && (
                            <>
                              <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Produto</span>
                                <span className="relative flex-1">
                                  <select
                                    value={draft.produtoId ?? ''}
                                    onChange={(event) => updateDraft({
                                      produtoId: event.target.value || null,
                                      quantidadeVendida: event.target.value ? draft.quantidadeVendida : null,
                                    })}
                                    className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                  >
                                    <option value="">Lançamento avulso</option>
                                    {produtosDisponiveis.map((produto) => (
                                      <option key={produto.id} value={produto.id}>{produto.nome}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                                </span>
                              </label>
                              {draft.produtoId && (
                                <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                  <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Quantidade</span>
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={draft.quantidadeVendida ?? ''}
                                    onChange={(event) => updateDraft({ quantidadeVendida: event.target.value ? Number(event.target.value) : null })}
                                    className="h-7 flex-1 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                                  />
                                </label>
                              )}
                              {produtoSelecionado && estoqueDisponivel != null && (
                                <p className="border-b border-slate-100 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  {draft.quantidadeVendida && Number(draft.quantidadeVendida) > estoqueDisponivel
                                    ? <span className="text-red-600 dark:text-red-300">Estoque insuficiente: há {estoqueDisponivel} disponível.</span>
                                    : `Baixa ${draft.quantidadeVendida || 0} do estoque · restam ${Math.max(0, estoqueDisponivel - Number(draft.quantidadeVendida || 0))}.`}
                                </p>
                              )}
                            </>
                          )}

                          {contratosAtivos.length > 0 && (
                            <>
                              <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Contrato</span>
                                <span className="relative flex-1">
                                  <select
                                    value={draft.contratoId ?? ''}
                                    onChange={(event) => {
                                      const contrato = contratosAtivos.find((item) => item.contractId === Number(event.target.value));
                                      // As horas são do cliente do contrato, como no modal de receita.
                                      updateDraft({
                                        contratoId: contrato?.contractId ?? null,
                                        tipoHoraId: null,
                                        quantidadeHoras: null,
                                        ...(contrato ? { clienteId: contrato.clientId } : {}),
                                        ...(contrato && !draft.representanteId && contrato.representativeId
                                          ? { representanteId: contrato.representativeId }
                                          : {}),
                                      });
                                    }}
                                    className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                  >
                                    <option value="">Sem contrato</option>
                                    {contratosAtivos.map((contrato) => (
                                      <option key={contrato.contractId} value={contrato.contractId}>
                                        {contrato.clientName}{contrato.number ? ` — ${contrato.number}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                                </span>
                              </label>

                              {contratoSelecionado && (
                                <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                  <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Horas</span>
                                  <span className="relative flex-1">
                                    <select
                                      value={draft.tipoHoraId ?? ''}
                                      onChange={(event) => updateDraft({
                                        tipoHoraId: event.target.value ? Number(event.target.value) : null,
                                        quantidadeHoras: null,
                                      })}
                                      className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                                    >
                                      <option value="">Não faturar horas</option>
                                      {contratoSelecionado.hourTypes.map((tipo) => (
                                        <option key={tipo.id} value={tipo.id}>{tipo.name} · saldo {tipo.balance}h</option>
                                      ))}
                                    </select>
                                    <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                                  </span>
                                </label>
                              )}

                              {draft.tipoHoraId && (
                                <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                                  <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Quantidade</span>
                                  <input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={draft.quantidadeHoras ?? ''}
                                    onChange={(event) => updateDraft({ quantidadeHoras: event.target.value ? Number(event.target.value) : null })}
                                    className="h-7 flex-1 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                                  />
                                  {valorHoraSelecionado != null && (
                                    <span className={`shrink-0 text-xs ${horasAcimaDoSaldo ? 'text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                      {horasAcimaDoSaldo
                                        ? `Saldo insuficiente: restam ${saldoHorasAtual}h`
                                        : `${formatCurrency(valorHoraSelecionado)}/h${saldoHorasAtual != null ? ` · saldo ${saldoHorasAtual}h` : ''}`}
                                    </span>
                                  )}
                                </label>
                              )}
                              {contratoComRetencoes && (
                                <p className="border-b border-slate-100 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  Contrato com retenções: o valor informado é o bruto, e a receita entra pelo líquido.
                                </p>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {/* Replicar ate: PF e PJ, mesmo criterio do desktop. */}
                      {draft.kind === 'income' && (
                        <label className="flex items-center gap-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!draft.replicarAte}
                            onChange={(event) => updateDraft({
                              replicarAte: event.target.checked ? { mes: month, ano: year } : null,
                            })}
                            className="h-[18px] w-[18px] accent-[#0891b2]"
                          />
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">Replicar até...</span>
                        </label>
                      )}

                      {draft.kind === 'income' && draft.replicarAte && (
                        <div className="flex items-center gap-3 border-t border-slate-100 py-2 dark:border-slate-800">
                          <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Até</span>
                          <span className="relative flex-1">
                            <select
                              value={draft.replicarAte.mes}
                              onChange={(event) => updateDraft({ replicarAte: { mes: Number(event.target.value), ano: draft.replicarAte!.ano } })}
                              className="h-7 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-900 outline-none transition dark:text-white"
                            >
                              {MONTH_NAMES.map((nomeMes, index) => <option key={nomeMes} value={index}>{nomeMes}</option>)}
                            </select>
                            <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#0891b2]" />
                          </span>
                          <input
                            type="number"
                            min={year}
                            max={year + 3}
                            value={draft.replicarAte.ano}
                            onChange={(event) => updateDraft({ replicarAte: { mes: draft.replicarAte!.mes, ano: Number(event.target.value) } })}
                            className="h-7 w-20 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                          />
                        </div>
                      )}
                    </div>

                    {/* Mesma linha de situação do modal do desktop: situação,
                        vencimento (o calculado, quando em branco), total e
                        avisos de juros, desconto e parcelas vencidas. */}
                    {expenseSummary && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={['rounded-full px-2 py-0.5 font-semibold', SUMMARY_PILL_CLASS[SUMMARY_TONE[expenseSummary.status]]].join(' ')}>
                          {expenseSummary.status}
                        </span>
                        <span>{expenseSummary.dueText}</span>
                        <span className="tabular-nums text-slate-700 dark:text-slate-200">{expenseSummary.totalText}</span>
                        {expenseSummary.badges.map((badge) => (
                          <span key={badge.text} className={['rounded-full px-2 py-0.5 font-semibold', SUMMARY_PILL_CLASS[badge.tone]].join(' ')}>
                            {badge.text}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="px-3.5 pb-3 pt-2 text-xs text-slate-500 dark:text-slate-400">Toque em qualquer linha para corrigir.</p>

                    {duplicateWarning && (
                      <p className="mx-3.5 mb-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {duplicateWarning}
                      </p>
                    )}

                    <CardActions
                      isSaving={isSaving}
                      onSave={() => void handleSave()}
                      onDiscard={discardDraft}
                      discardLabel="Descartar este lançamento sem salvar"
                    />
                  </Card>
                )}

                {payment && (
                  <PaymentCard
                    payment={payment}
                    isSaving={isSaving}
                    onChange={(patch) => setPayment((current) => current ? { ...current, ...patch } : current)}
                    onSave={() => void handlePay()}
                    onDiscard={discardPayment}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              {error && <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
              {speech.speaking && (
                <button
                  type="button"
                  onClick={speech.stop}
                  className="mb-2 flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-[#0e7490] transition hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200"
                >
                  <Square size={12} fill="currentColor" /> Parar de falar
                </button>
              )}
              {lastVoiceTranscript && (
                <p className="mb-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  <Mic size={13} className="mt-0.5 shrink-0 text-[#0891b2]" />
                  <span>Entendi: &ldquo;{lastVoiceTranscript}&rdquo;. Confira antes de enviar.</span>
                </p>
              )}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attachments.map((attachment) => (
                    <span key={attachment.id} className="flex max-w-full items-center gap-1 border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-200">
                      <FileText size={12} className="shrink-0" />
                      <span className="max-w-[180px] truncate">{attachment.nome}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                        className="ml-0.5 rounded text-cyan-700 hover:text-cyan-950 dark:text-cyan-300 dark:hover:text-white"
                        aria-label={`Remover ${attachment.nome}`}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#0891b2] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  aria-label="Enviar um arquivo ou foto"
                  title="Enviar um arquivo ou foto"
                >
                  <Plus size={19} />
                </button>
                {/* Camera separada do anexo: `capture` no input de arquivo
                    forcaria a camera sempre, e o `+` precisa continuar servindo
                    para PDF e galeria. So aparece onde ha camera traseira. */}
                {temCamera && (
                  <>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => {
                        void handleFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#0891b2] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                      aria-label="Fotografar um boleto ou comprovante"
                      title="Fotografar um boleto ou comprovante"
                    >
                      <Camera size={19} />
                    </button>
                  </>
                )}
                <div className="flex min-h-11 min-w-0 flex-1 items-end gap-1 rounded-[24px] border border-slate-200 bg-slate-100 py-1 pl-3.5 pr-1 dark:border-slate-700 dark:bg-slate-900">
                  <textarea
                    ref={composerRef}
                    rows={1}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="Escreva sua mensagem…"
                    className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[15.5px] leading-snug text-slate-900 outline-none transition placeholder:text-slate-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:text-white"
                  />
                  {recognitionSupported && (
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={[
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition',
                        isListening ? 'bg-red-500 text-white hover:bg-red-600' : 'text-slate-500 hover:bg-slate-200 hover:text-[#0891b2] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300',
                      ].join(' ')}
                      aria-label={isListening ? 'Parar gravação de voz' : 'Falar em vez de escrever'}
                      title={isListening ? 'Parar voz' : 'Falar em vez de escrever'}
                    >
                      {isListening ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isPreparing || (!composer.trim() && attachments.length === 0)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-full bg-[#0891b2] text-white shadow-sm transition hover:bg-[#0e7490] disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Enviar mensagem"
                  title="Enviar"
                >
                  <Send size={19} />
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
