import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Camera, Check, ChevronDown, FileText, LoaderCircle, MessageCircleMore,
  Mic, Plus, Send, Square, Trash2, X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, Income } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import type {
  FinancialCopilotCard,
  FinancialCopilotIntentHint,
  FinancialCopilotQuickReply,
  FinancialCopilotSlotState,
} from '../../types/financialCopilot';
import {
  deleteFinancialCopilotConversation,
  fetchFinancialCopilotConversation,
  fetchFinancialCopilotConversations,
  sendFinancialCopilotMessage,
} from '../../services/assistantService';
import { fetchFinanceDashboard, saveExpense, saveIncome } from '../../services/financeService';
import { fetchCartoes, fetchCategorias, fetchContas } from '../../services/configService';
import { getActiveAccountId } from '../../services/apiClient';
import { fetchAbertura, type FlowAbertura } from '../../services/assistantFlowService';
import { queryKeys } from '../../services/queryKeys';
import { formatCurrency } from '../../screens/finance/formatters';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { AssistantHeaderMenu } from './AssistantHeaderMenu';
import {
  fontSizeToScale, readStoredFontSize, storeFontSize, type AssistantFontSize,
} from './fontSize';
import { useSpeech } from './useSpeech';
import { escolherSaudacao } from './saudacao';

type ChatRole = 'assistant' | 'user';

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

/**
 * Abertura exibida enquanto a do fluxo nao chegou — e quando ela falha.
 *
 * O chat abre instantaneamente, sem rede, como sempre abriu; se o servidor
 * responder com algo diferente, o texto e substituido em seguida. Sem isso,
 * trazer a abertura para o fluxo custaria uma tela de carregamento no lugar
 * de uma saudação imediata.
 */
const ABERTURA_PADRAO: FlowAbertura = {
  saudacao: 'Olá! O que vamos fazer hoje?',
  opcoes: [
    { intent: 'register_expense', label: 'Lançar despesa', abertura: 'Beleza! Me conta o que você gastou.' },
    { intent: 'register_income', label: 'Lançar receita', abertura: 'Boa! Me conta o que você recebeu.' },
    { intent: 'ask', label: 'Consultar', abertura: 'Pode perguntar. O que você quer saber?' },
  ],
};

function buildInitialMessage(saudacao: string): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: saudacao,
    createdAt: new Date().toISOString(),
    showWelcomeActions: true,
  };
}

/**
 * Visual unico dos chips da conversa — abertura e respostas rapidas. Ficam
 * empilhados, cada um com a largura do proprio texto, como menu de bot de
 * atendimento. Compartilhado para os dois grupos nunca divergirem.
 */
const ASSISTANT_CHIP_CLASS = 'flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-[#0e7490] shadow-sm transition hover:border-cyan-400 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:bg-cyan-900/60';

/**
 * Icone de cada intencao. Fica em codigo enquanto os textos vem do fluxo:
 * escolher icone e decisao de UI, nao de conversa.
 */
const INTENT_ICONS: Record<FinancialCopilotIntentHint, ReactNode> = {
  register_expense: <Plus size={15} />,
  register_income: <Plus size={15} />,
  ask: <MessageCircleMore size={15} />,
};

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

function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

function findDuplicate(
  draft: FinancialAssistantDraft | null,
  incomes: Income[],
  expenses: Expense[],
): string | null {
  if (!draft?.description || !draft.amount) return null;
  const description = normalizeComparable(draft.description);
  const date = draft.kind === 'expense' ? (draft.dueDate ?? draft.date) : draft.date;

  if (draft.kind === 'income') {
    const duplicate = incomes.find((income) => (
      normalizeComparable(income.descricao) === description
      && Math.abs(income.valor - draft.amount!) < 0.01
      && income.data === date
    ));
    return duplicate ? 'Existe uma receita muito parecida no período selecionado. Confirme antes de salvar.' : null;
  }

  const duplicate = expenses.find((expense) => (
    normalizeComparable(expense.descricao) === description
    && Math.abs(expense.valorFinal - draft.amount!) < 0.01
    && expense.dataVencimento === date
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

  // A abertura vem do fluxo editavel, mas o chat nao espera por ela: abre com
  // a padrao e troca quando a resposta chega. `placeholderData` evita que o
  // primeiro render tenha `undefined`.
  const { data: abertura = ABERTURA_PADRAO } = useQuery({
    queryKey: queryKeys.assistantAbertura,
    queryFn: fetchAbertura,
    placeholderData: ABERTURA_PADRAO,
    staleTime: 5 * 60_000,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildInitialMessage(ABERTURA_PADRAO.saudacao)]);

  const [fontSize, setFontSize] = useState<AssistantFontSize>(() => readStoredFontSize());
  const handleFontSizeChange = (nextFontSize: AssistantFontSize) => {
    setFontSize(nextFontSize);
    storeFontSize(nextFontSize);
  };
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState<FinancialAssistantDraft | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [intentHint, setIntentHint] = useState<FinancialCopilotIntentHint | null>(null);
  const [slotState, setSlotState] = useState<FinancialCopilotSlotState | null>(null);
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
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categorias(contaAtivaId),
    queryFn: () => fetchCategorias(contaAtivaId),
    enabled: open,
    staleTime: 60_000,
  });
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(month, year),
    queryFn: () => fetchFinanceDashboard(month, year),
    enabled: open,
    staleTime: 30_000,
  });
  const cardsQuery = useQuery({
    queryKey: queryKeys.cartoes(),
    queryFn: () => fetchCartoes(),
    enabled: open,
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
  const contas = contasQuery.data ?? [];

  // Sem escolha no card, vale a conta ativa — mesmo comportamento de antes,
  // agora visivel. `contaAtivaTipo` e o fallback que o modal tambem usa.
  const contaDoLancamento = contas.find((conta) => conta.id === draft?.contaId);
  const contaEhEmpresa = contaDoLancamento
    ? contaDoLancamento.tipo === 'empresa'
    : localStorage.getItem('contaAtivaTipo') === 'empresa';

  const conversationsQuery = useQuery({
    queryKey: queryKeys.copilotConversations,
    queryFn: fetchFinancialCopilotConversations,
    staleTime: 30_000,
  });

  // A conversa mais recente da o tempo desde a ultima visita. Ja vem nesta
  // query, entao a saudacao nao custa request nenhum.
  const saudacaoAtual = escolherSaudacao(abertura, conversationsQuery.data?.[0]?.updatedAt);

  // A saudacao so e conhecida depois que abertura e historico chegam: ate la
  // o chat ja abriu com a padrao, e aqui o texto e trocado sem tocar no resto
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
  const duplicateWarning = findDuplicate(
    draft,
    dashboardQuery.data?.incomes ?? [],
    dashboardQuery.data?.expenses ?? [],
  );
  const messageGroups = groupMessagesByDay(messages);


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
  }, [messages, draft, isPreparing]);

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

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [composer]);

  const updateDraft = (patch: Partial<FinancialAssistantDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const selectIntent = (nextIntent: FinancialCopilotIntentHint) => {
    setIntentHint(nextIntent);
    setLastVoiceTranscript(null);
    setError(null);
    const createdAt = new Date().toISOString();
    // Textos vem do fluxo; o padrao cobre o caso de uma intencao sem opcao
    // correspondente (fluxo editado removendo uma delas).
    const opcao = abertura.opcoes.find((o) => o.intent === nextIntent)
      ?? ABERTURA_PADRAO.opcoes.find((o) => o.intent === nextIntent)!;
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
        id: newMessageId(),
        role: 'assistant',
        content: opcao.abertura,
        createdAt,
      },
    ]);
    window.setTimeout(() => composerRef.current?.focus(), 0);
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
    setMessages((current) => [
      // Respondida a pergunta, os botoes saem de cena: deixa-los ativos
      // convidaria a responder duas vezes o mesmo campo.
      ...current.map((item) => item.quickReplies ? { ...item, quickReplies: undefined } : item),
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
        slotState,
        voiceMode: askedByVoice,
      });
      setConversationId(result.conversationId);
      setIntentHint(null);
      setSlotState(result.mode === 'slot' ? result.slotState ?? null : null);
      if (result.mode === 'draft' && result.draft) {
        setDraft(result.draft);
        setDraftAttachments((current) => messageAttachments.length > 0 ? [...current, ...messageAttachments] : current);
      }
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
        cards: result.cards,
        quickReplies: result.quickReplies,
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
    setMessages([buildInitialMessage(abertura.saudacao)]);
    setDraft(null);
    setDraftAttachments([]);
    setComposer('');
    setAttachments([]);
    setIntentHint(null);
    setSlotState(null);
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
      setDraftAttachments([]);
      setIntentHint(null);
      setSlotState(null);
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
    if (!draft?.description?.trim() || !draft.amount || draft.amount <= 0) {
      setError('Complete a descrição e o valor antes de salvar.');
      return;
    }

    const date = draft.kind === 'expense' ? (draft.dueDate ?? draft.date) : draft.date;
    if (!date) {
      setError('Informe a data antes de salvar.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      if (draft.kind === 'income') {
        await saveIncome(month, year, {
          descricao: draft.description.trim(),
          contaId: draft.contaId ?? undefined,
          valor: draft.amount,
          data: date,
          anexos: draftAttachments,
        });
      } else {
        const suggestedCategory = draft.category
          ? categories.find((category) => normalizeComparable(category.nome) === normalizeComparable(draft.category!))
          : undefined;
        const parcelado = draft.billingType === 'parcelas';
        const recorrente = draft.billingType === 'mensal';
        await saveExpense(month, year, {
          descricao: draft.description.trim(),
          // Undefined mantem a conta ativa, que e o comportamento de antes.
          contaId: draft.contaId ?? undefined,
          valor_original: draft.amount,
          dataVencimento: date,
          dataCompra: draft.date ?? date,
          categoria_id: suggestedCategory?.id,
          cartao_id: draft.cardId ?? undefined,
          formaPagamento: draft.paymentMethod,
          pago: draft.paid,
          valor_pago: draft.paid ? (draft.amountPaid ?? draft.amount) : undefined,
          parcelado,
          total_parcelas: parcelado ? (draft.installments ?? undefined) : undefined,
          parcelasJaPagas: parcelado ? (draft.paidInstallments ?? 0) : undefined,
          recorrente,
          recorrenciaMensal: recorrente,
          numero_nf: draft.invoiceNumber ?? undefined,
          data_emissao_nf: draft.invoiceDate ?? undefined,
          anexos: draftAttachments,
        });
      }
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
      }]);
      setDraft(null);
      setDraftAttachments([]);
      setSlotState(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const discardDraft = () => {
    if (isSaving) return;
    setDraft(null);
    setDraftAttachments([]);
    setError(null);
    setLastVoiceTranscript(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  return (
    <>
      {!isStandalone && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#0891b2] text-white shadow-lg shadow-cyan-950/25 transition hover:bg-[#0e7490] focus:outline-none focus:ring-2 focus:ring-[#0EC4D8] focus:ring-offset-2 dark:focus:ring-offset-slate-950"
          aria-label="Abrir o Nico, seu assistente financeiro"
          title="Nico"
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
              aria-label="Fechar o Nico"
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
            aria-label="Nico, assistente financeiro"
            aria-modal={isStandalone ? undefined : true}
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-[#0A6571] bg-[#0D2E3C] px-4 py-3 text-white">
              <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full border border-cyan-100/35 bg-[#07313A]">
                <img
                  src="/icons/assistente-perfil.webp"
                  alt="Avatar do Nico"
                  className="h-full w-full object-cover object-[center_35%]"
                />
              </div>
              <div className="min-w-0 flex-1">
                {/* Nome identifica, funcao explica: quem abre pela primeira
                    vez precisa dos dois. */}
                <p className="text-base font-bold leading-tight">Nico</p>
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
                  aria-label="Fechar o Nico"
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

                  {/* Fora do balao, empilhados: sao acoes do usuario, nao
                      conteudo da fala do assistente. Mesmo formato para os
                      chips de abertura e para as respostas rapidas de cada
                      pergunta do fluxo. */}
                  {message.showWelcomeActions && (
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {abertura.opcoes.map((opcao) => (
                        <button
                          key={opcao.intent}
                          type="button"
                          onClick={() => selectIntent(opcao.intent)}
                          className={ASSISTANT_CHIP_CLASS}
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
                        <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Valor</span>
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
                        <input
                          type="date"
                          value={(draft.kind === 'expense' ? draft.dueDate : draft.date) ?? ''}
                          onChange={(event) => draft.kind === 'expense'
                            ? updateDraft({ dueDate: event.target.value || null })
                            : updateDraft({ date: event.target.value || null })}
                          className="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                        />
                      </label>

                      {/* Separada do vencimento, como no modal: comprar hoje e
                          vencer no mês que vem é o caso comum no crédito. Era
                          gravada em silêncio (draft.date ?? vencimento). */}
                      {draft.kind === 'expense' && (
                        <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                          <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Data da compra</span>
                          <input
                            type="date"
                            value={draft.date ?? ''}
                            onChange={(event) => updateDraft({ date: event.target.value || null })}
                            className="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
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
                                <option value="boleto">Boleto</option>
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
                                  updateDraft({
                                    billingType,
                                    installments: billingType === 'parcelas' ? draft.installments : null,
                                    paidInstallments: billingType === 'parcelas' ? draft.paidInstallments : null,
                                  });
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

                          {draft.billingType === 'parcelas' && (
                            <label className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                              <span className="w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Parcelas</span>
                              <span className="flex flex-1 items-center gap-2">
                                <input
                                  type="number"
                                  min="2"
                                  max="360"
                                  value={draft.installments ?? ''}
                                  onChange={(event) => updateDraft({ installments: event.target.value ? Number(event.target.value) : null })}
                                  className="h-7 w-16 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400">vezes ·</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={draft.paidInstallments ?? ''}
                                  onChange={(event) => updateDraft({ paidInstallments: event.target.value ? Number(event.target.value) : null })}
                                  className="h-7 w-16 appearance-none bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400">já pagas</span>
                              </span>
                            </label>
                          )}

                          <label className="flex items-center gap-3 py-2">
                            <input
                              type="checkbox"
                              checked={draft.paid}
                              onChange={(event) => updateDraft({ paid: event.target.checked })}
                              className="h-[18px] w-[18px] accent-[#0891b2]"
                            />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">Esta despesa já foi paga</span>
                          </label>

                          {draft.paid && (
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
                                <input
                                  type="date"
                                  value={draft.invoiceDate ?? ''}
                                  onChange={(event) => updateDraft({ invoiceDate: event.target.value || null })}
                                  className="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
                                />
                              </label>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <p className="px-3.5 pb-3 text-xs text-slate-500 dark:text-slate-400">Toque em qualquer linha para corrigir.</p>

                    {duplicateWarning && (
                      <p className="mx-3.5 mb-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {duplicateWarning}
                      </p>
                    )}

                    {/* Lado a lado: empilhados custavam 110px de altura,
                        e o card precisa caber inteiro na tela. */}
                    <div className="grid grid-cols-[1fr_auto] gap-2 px-3.5 pb-3">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 text-base font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                        {isSaving ? 'Salvando...' : `Salvar ${formatDraftAmount(draft.amount)}`}
                      </button>
                      <button
                        type="button"
                        onClick={discardDraft}
                        aria-label="Descartar este lançamento sem salvar"
                        disabled={isSaving}
                        className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-900 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                      >
                        <X size={16} /> Descartar
                      </button>
                    </div>
                  </Card>
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
