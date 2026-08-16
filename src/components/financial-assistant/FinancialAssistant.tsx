import { useEffect, useRef, useState } from 'react';
import {
  Check, ChevronDown, FileText, History, LayoutDashboard, LoaderCircle, MessageCircleMore,
  Mic, Paperclip, Plus, Send, Square, Trash2, X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, Income } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import type { FinancialCopilotCard, FinancialCopilotIntentHint } from '../../types/financialCopilot';
import {
  deleteFinancialCopilotConversation,
  fetchFinancialCopilotConversation,
  fetchFinancialCopilotConversations,
  sendFinancialCopilotMessage,
} from '../../services/assistantService';
import { fetchFinanceDashboard, saveExpense, saveIncome } from '../../services/financeService';
import { fetchCategorias } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import { useAppContext } from '../../context/AppContext';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  attachmentNames?: string[];
  cards?: FinancialCopilotCard[];
  showWelcomeActions?: boolean;
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

const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Como posso ajudar com suas finanças hoje?',
  showWelcomeActions: true,
};

const INTENT_DETAILS: Record<FinancialCopilotIntentHint, {
  label: string;
  description: string;
  placeholder: string;
}> = {
  register_expense: {
    label: 'Registrar despesa',
    description: 'Conte o que comprou e quanto pagou.',
    placeholder: 'Ex.: Comprei no mercado e paguei R$ 100 no Pix.',
  },
  register_income: {
    label: 'Registrar receita',
    description: 'Conte o que recebeu e de onde veio.',
    placeholder: 'Ex.: Recebi R$ 3.000 de salário hoje.',
  },
  ask: {
    label: 'Fazer uma pergunta',
    description: 'Pergunte sobre seu período financeiro.',
    placeholder: 'Ex.: Quanto gastei este mês?',
  },
};

function formatCurrency(value: number | null): string {
  if (!value) return 'Valor não informado';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function newMessageId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const { month, year } = useAppContext();
  const queryClient = useQueryClient();
  const isStandalone = mode === 'standalone';
  const [open, setOpen] = useState(isStandalone);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState<FinancialAssistantDraft | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasRestoredLatest, setHasRestoredLatest] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [intentHint, setIntentHint] = useState<FinancialCopilotIntentHint | null>(null);
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categorias,
    queryFn: fetchCategorias,
    enabled: open,
    staleTime: 60_000,
  });
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(month, year),
    queryFn: () => fetchFinanceDashboard(month, year),
    enabled: open,
    staleTime: 30_000,
  });
  const conversationsQuery = useQuery({
    queryKey: queryKeys.copilotConversations,
    queryFn: fetchFinancialCopilotConversations,
    enabled: open,
    staleTime: 30_000,
  });
  const categories = (categoriesQuery.data ?? []).filter((category) => category.ativo);
  const duplicateWarning = findDuplicate(
    draft,
    dashboardQuery.data?.incomes ?? [],
    dashboardQuery.data?.expenses ?? [],
  );
  const activeIntent = intentHint ? INTENT_DETAILS[intentHint] : null;
  const composerPlaceholder = activeIntent?.placeholder ?? 'Ex.: Quanto gastei este mês?';

  useEffect(() => {
    if (open) {
      window.setTimeout(() => composerRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, draft, isPreparing]);

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  const updateDraft = (patch: Partial<FinancialAssistantDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const selectIntent = (nextIntent: FinancialCopilotIntentHint) => {
    setIntentHint(nextIntent);
    setLastVoiceTranscript(null);
    setError(null);
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

  const handleSend = async () => {
    const message = composer.trim();
    if ((!message && attachments.length === 0) || isPreparing) return;

    const messageAttachments = attachments;
    const displayedMessage = message || 'Analise os arquivos enviados.';
    setError(null);
    setMessages((current) => [
      ...current,
      {
        id: newMessageId(),
        role: 'user',
        content: displayedMessage,
        attachmentNames: messageAttachments.map((attachment) => attachment.nome),
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
      });
      setConversationId(result.conversationId);
      setIntentHint(null);
      if (result.mode === 'draft' && result.draft) {
        setDraft(result.draft);
        setDraftAttachments((current) => messageAttachments.length > 0 ? [...current, ...messageAttachments] : current);
      }
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: result.reply,
        cards: result.cards,
      }]);
      await queryClient.invalidateQueries({ queryKey: queryKeys.copilotConversations });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar esta informação.');
    } finally {
      setIsPreparing(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([initialMessage]);
    setDraft(null);
    setDraftAttachments([]);
    setComposer('');
    setAttachments([]);
    setIntentHint(null);
    setLastVoiceTranscript(null);
    setHistoryOpen(false);
    setHasRestoredLatest(true);
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
        cards: message.payload?.cards,
      })));
      setDraft(null);
      setDraftAttachments([]);
      setIntentHint(null);
      setLastVoiceTranscript(null);
      setHistoryOpen(false);
      setHasRestoredLatest(true);
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

  useEffect(() => {
    if (!open || hasRestoredLatest || conversationId || messages.length !== 1 || !conversationsQuery.data?.[0]) return;
    setHasRestoredLatest(true);
    void restoreConversation(conversationsQuery.data[0].id);
  }, [conversationId, conversationsQuery.data, hasRestoredLatest, messages.length, open]);

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
          valor: draft.amount,
          data: date,
          anexos: draftAttachments,
        });
      } else {
        const suggestedCategory = draft.category
          ? categories.find((category) => normalizeComparable(category.nome) === normalizeComparable(draft.category!))
          : undefined;
        await saveExpense(month, year, {
          descricao: draft.description.trim(),
          valor_original: draft.amount,
          valor_final: draft.amount,
          dataVencimento: date,
          dataCompra: draft.date ?? date,
          categoria_id: suggestedCategory?.id,
          formaPagamento: draft.paymentMethod,
          pago: draft.paid,
          anexos: draftAttachments,
        });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: 'Lançamento salvo. Mantive os anexos junto com ele.',
      }]);
      setDraft(null);
      setDraftAttachments([]);
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
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0C9EAF] text-white shadow-lg shadow-cyan-950/25 transition hover:bg-[#087B89] focus:outline-none focus:ring-2 focus:ring-[#0EC4D8] focus:ring-offset-2 dark:focus:ring-offset-slate-950"
          aria-label="Abrir assistente financeira"
          title="Assistente financeira"
        >
          <MessageCircleMore size={25} />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[70]">
          {!isStandalone && (
            <button
              type="button"
              className="absolute inset-0 hidden bg-slate-950/25 backdrop-blur-[1px] sm:block"
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente financeira"
            />
          )}
          <section
            className={isStandalone
              ? 'absolute inset-0 flex min-h-[100dvh] flex-col bg-slate-50 dark:bg-slate-950'
              : 'absolute inset-0 flex flex-col bg-slate-50 shadow-2xl dark:bg-slate-950 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,calc(100vh-2.5rem))] sm:w-[420px] sm:overflow-hidden sm:border sm:border-slate-200 sm:shadow-slate-950/25 dark:sm:border-slate-800'}
            role={isStandalone ? undefined : 'dialog'}
            aria-label="Assistente financeira"
            aria-modal={isStandalone ? undefined : true}
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-[#0A6571] bg-[#0D2E3C] px-4 py-3.5 text-white">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-cyan-100/35 bg-[#07313A]">
                <img
                  src="/icons/assistente-perfil.webp"
                  alt="Avatar da assistente financeira"
                  className="h-full w-full object-cover object-[center_35%]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Assistente financeira</p>
                <p className="mt-0.5 text-xs text-cyan-100/70">Consultas e rascunhos para revisar</p>
              </div>
              {isStandalone && (
                <a
                  href="/app.html?source=assistant"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                  aria-label="Abrir painel financeiro"
                  title="Abrir painel"
                >
                  <LayoutDashboard size={18} />
                </a>
              )}
              <button
                type="button"
                onClick={() => setHistoryOpen((current) => !current)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                aria-label="Abrir histórico de conversas"
                title="Histórico"
              >
                <History size={18} />
              </button>
              <button
                type="button"
                onClick={startNewConversation}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                aria-label="Iniciar nova conversa"
                title="Nova conversa"
              >
                <Plus size={18} />
              </button>
              {!isStandalone && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fechar assistente"
                  title="Fechar"
                >
                  <X size={19} />
                </button>
              )}
            </header>

            {historyOpen && (
              <div className="absolute inset-x-0 top-[68px] z-10 max-h-64 overflow-y-auto border-b border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">Conversas recentes</p>
                {conversationsQuery.isLoading && <p className="py-3 text-xs text-slate-500">Carregando histórico...</p>}
                {conversationsQuery.error && <p className="py-3 text-xs text-red-600 dark:text-red-300">Não foi possível carregar o histórico.</p>}
                {!conversationsQuery.isLoading && !conversationsQuery.error && (conversationsQuery.data?.length ?? 0) === 0 && (
                  <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Nenhuma conversa salva neste perfil.</p>
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

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(135deg,rgba(14,196,216,0.045),transparent_45%)] px-3 py-4 dark:bg-[linear-gradient(135deg,rgba(14,196,216,0.08),transparent_45%)]">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={[
                      message.showWelcomeActions ? 'max-w-[94%]' : 'max-w-[86%]',
                      'px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-l-xl rounded-br-xl bg-[#0C9EAF] text-white'
                        : 'rounded-r-xl rounded-bl-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                    ].join(' ')}>
                      <p>{message.content}</p>
                      {message.showWelcomeActions && (
                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            Para registrar uma nova despesa, conte o que comprou e quanto pagou. Para consultar suas finanças, faça uma pergunta.
                          </p>
                          <div className="mt-3 grid gap-2">
                            <button
                              type="button"
                              onClick={() => selectIntent('register_expense')}
                              className="flex items-center gap-2 border border-slate-200 px-2.5 py-2 text-left transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"><Plus size={15} /></span>
                              <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Registrar despesa</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">Conte o que comprou e quanto pagou.</span></span>
                            </button>
                            <button
                              type="button"
                              onClick={() => selectIntent('register_income')}
                              className="flex items-center gap-2 border border-slate-200 px-2.5 py-2 text-left transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><Plus size={15} /></span>
                              <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Registrar receita</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">Conte o que recebeu e de onde veio.</span></span>
                            </button>
                            <button
                              type="button"
                              onClick={() => selectIntent('ask')}
                              className="flex items-center gap-2 border border-slate-200 px-2.5 py-2 text-left transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-cyan-50 text-[#087B89] dark:bg-cyan-950/40 dark:text-cyan-300"><MessageCircleMore size={15} /></span>
                              <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Fazer uma pergunta</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">Pergunte sobre seu período financeiro.</span></span>
                            </button>
                          </div>
                        </div>
                      )}
                      {message.attachmentNames?.map((name) => (
                        <p key={name} className="mt-2 flex items-center gap-1.5 text-xs text-inherit/75">
                          <FileText size={13} /> {name}
                        </p>
                      ))}
                      {message.cards?.map((card, index) => <CopilotCardView key={`${card.type}-${index}`} card={card} />)}
                    </div>
                  </div>
                ))}

                {isPreparing && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-r-xl rounded-bl-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      <LoaderCircle size={16} className="animate-spin text-[#0C9EAF]" /> Consultando seus dados...
                    </div>
                  </div>
                )}

                {draft && (
                  <div className="border border-cyan-200 bg-white p-3.5 shadow-sm dark:border-cyan-900/70 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Revisar lançamento</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Nada é salvo sem sua confirmação.</p>
                      </div>
                      <span className={[
                        'shrink-0 px-2 py-1 text-[11px] font-semibold',
                        draft.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : draft.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      ].join(' ')}>
                        {draft.confidence === 'high' ? 'Leitura alta' : draft.confidence === 'medium' ? 'Conferir' : 'Dados parciais'}
                      </span>
                    </div>

                    <div className="grid gap-2.5">
                      <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Tipo
                        <span className="relative">
                          <select
                            value={draft.kind}
                            onChange={(event) => updateDraft({ kind: event.target.value as FinancialAssistantDraft['kind'] })}
                            className="h-10 w-full appearance-none border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="expense">Despesa</option>
                            <option value="income">Receita</option>
                          </select>
                          <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </span>
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Descrição
                        <input
                          value={draft.description ?? ''}
                          onChange={(event) => updateDraft({ description: event.target.value || null })}
                          placeholder="Ex.: Mercado Central"
                          className="h-10 border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Valor
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.amount ?? ''}
                            onChange={(event) => updateDraft({ amount: event.target.value ? Number(event.target.value) : null })}
                            className="h-10 border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {draft.kind === 'expense' ? 'Vencimento' : 'Data'}
                          <input
                            type="date"
                            value={(draft.kind === 'expense' ? draft.dueDate : draft.date) ?? ''}
                            onChange={(event) => draft.kind === 'expense'
                              ? updateDraft({ dueDate: event.target.value || null })
                              : updateDraft({ date: event.target.value || null })}
                            className="h-10 border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                      </div>

                      {draft.kind === 'expense' && (
                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Categoria
                            <span className="relative">
                              <select
                                value={draft.category ?? ''}
                                onChange={(event) => updateDraft({ category: event.target.value || null })}
                                className="h-10 w-full appearance-none border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              >
                                <option value="">Sem categoria</option>
                                {categories.map((category) => <option key={category.id} value={category.nome}>{category.nome}</option>)}
                              </select>
                              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            </span>
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Pagamento
                            <span className="relative">
                              <select
                                value={draft.paymentMethod}
                                onChange={(event) => updateDraft({ paymentMethod: event.target.value as FinancialAssistantDraft['paymentMethod'] })}
                                className="h-10 w-full appearance-none border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              >
                                <option value="pix">Pix</option>
                                <option value="boleto">Boleto</option>
                                <option value="dinheiro">Dinheiro</option>
                                <option value="debito">Débito</option>
                                <option value="credito">Crédito</option>
                              </select>
                              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            </span>
                          </label>
                        </div>
                      )}

                      {draft.kind === 'expense' && (
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={draft.paid}
                            onChange={(event) => updateDraft({ paid: event.target.checked })}
                            className="h-4 w-4 accent-[#0C9EAF]"
                          />
                          Esta despesa já foi paga
                        </label>
                      )}
                    </div>

                    {duplicateWarning && (
                      <p className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {duplicateWarning}
                      </p>
                    )}

                    <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                      <button
                        type="button"
                        onClick={discardDraft}
                        disabled={isSaving}
                        className="flex h-10 items-center justify-center gap-2 border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-rose-900 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                      >
                        <X size={16} /> Descartar rascunho
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex h-10 min-w-0 items-center justify-center gap-2 bg-[#0C9EAF] px-4 text-sm font-semibold text-white transition hover:bg-[#087B89] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                        {isSaving ? 'Salvando...' : `Confirmar ${formatCurrency(draft.amount)}`}
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              {error && <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
              {activeIntent && (
                <div className="mb-2 flex items-center gap-2 border-l-2 border-[#0C9EAF] bg-cyan-50 px-2.5 py-2 dark:bg-cyan-950/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-100">{activeIntent.label}</p>
                    <p className="truncate text-[11px] text-cyan-800/75 dark:text-cyan-200/75">{activeIntent.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIntentHint(null)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-cyan-800 transition hover:bg-cyan-100 dark:text-cyan-200 dark:hover:bg-cyan-900/50"
                    aria-label="Remover contexto da mensagem"
                    title="Remover contexto"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              {lastVoiceTranscript && (
                <p className="mb-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  <Mic size={13} className="mt-0.5 shrink-0 text-[#0C9EAF]" />
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

              <div className="flex items-end gap-2">
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-[#0C9EAF] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  aria-label="Anexar documento"
                  title="Anexar documento"
                >
                  <Paperclip size={19} />
                </button>
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
                  placeholder={composerPlaceholder}
                  className="max-h-28 min-h-10 flex-1 resize-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0C9EAF] focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={[
                    'flex h-10 w-10 shrink-0 items-center justify-center transition',
                    isListening ? 'bg-red-500 text-white hover:bg-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-[#0C9EAF] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300',
                  ].join(' ')}
                  aria-label={isListening ? 'Parar gravação de voz' : 'Falar com a assistente'}
                  title={isListening ? 'Parar voz' : 'Falar'}
                >
                  {isListening ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isPreparing || (!composer.trim() && attachments.length === 0)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#0C9EAF] text-white transition hover:bg-[#087B89] disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Enviar mensagem"
                  title="Enviar"
                >
                  <Send size={18} />
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
