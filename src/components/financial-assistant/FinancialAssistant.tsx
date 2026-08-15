import { useEffect, useRef, useState } from 'react';
import {
  Bot, Check, ChevronDown, FileText, LoaderCircle, MessageCircleMore,
  Mic, Paperclip, Send, Square, X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, Income } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import { createFinancialDraft } from '../../services/assistantService';
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
  content: 'Oi! Me conte uma receita ou despesa, fale pelo microfone ou envie um comprovante. Eu preparo o rascunho para voce revisar.',
};

function formatCurrency(value: number | null): string {
  if (!value) return 'Valor nao informado';
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
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!data) {
        reject(new Error('Nao foi possivel ler o arquivo.'));
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
    return duplicate ? 'Existe uma receita muito parecida no periodo selecionado. Confirme antes de salvar.' : null;
  }

  const duplicate = expenses.find((expense) => (
    normalizeComparable(expense.descricao) === description
    && Math.abs(expense.valorFinal - draft.amount!) < 0.01
    && expense.dataVencimento === date
  ));
  return duplicate ? 'Existe uma despesa muito parecida no periodo selecionado. Confirme antes de salvar.' : null;
}

export function FinancialAssistant() {
  const { month, year } = useAppContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState<FinancialAssistantDraft | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
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
  const categories = (categoriesQuery.data ?? []).filter((category) => category.ativo);
  const duplicateWarning = findDuplicate(
    draft,
    dashboardQuery.data?.incomes ?? [],
    dashboardQuery.data?.expenses ?? [],
  );

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

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const selected = Array.from(files);
    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (availableSlots <= 0) {
      setError('Envie no maximo tres arquivos por mensagem.');
      return;
    }

    const allowed = selected.slice(0, availableSlots).filter((file) => {
      if (!ACCEPTED_FILE_TYPES.has(file.type)) {
        setError('Use PDF, imagem JPG/PNG/WEBP ou arquivo TXT.');
        return false;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError('Cada arquivo pode ter no maximo 10 MB.');
        return false;
      }
      return true;
    });

    try {
      const converted = await Promise.all(allowed.map(fileToAttachment));
      setAttachments((current) => [...current, ...converted]);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Nao foi possivel preparar o arquivo.');
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
    setIsPreparing(true);

    try {
      const result = await createFinancialDraft({
        message: displayedMessage,
        attachments: messageAttachments,
        context: draft ?? undefined,
      });
      setDraft(result.draft);
      setDraftAttachments((current) => messageAttachments.length > 0 ? [...current, ...messageAttachments] : current);
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: 'assistant',
        content: result.reply,
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel analisar esta informacao.');
    } finally {
      setIsPreparing(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setError('A entrada por voz nao e compativel com este navegador.');
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
      }).join(' ');
      setComposer((current) => [current, transcript].filter(Boolean).join(current ? ' ' : ''));
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Permita o uso do microfone para registrar por voz.');
      } else if (event.error !== 'aborted') {
        setError('Nao foi possivel transcrever sua fala. Tente novamente.');
      }
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleSave = async () => {
    if (!draft?.description?.trim() || !draft.amount || draft.amount <= 0) {
      setError('Complete a descricao e o valor antes de salvar.');
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
        content: 'Lancamento salvo. Mantive os anexos junto com ele.',
      }]);
      setDraft(null);
      setDraftAttachments([]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o lancamento.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0C9EAF] text-white shadow-lg shadow-cyan-950/25 transition hover:bg-[#087B89] focus:outline-none focus:ring-2 focus:ring-[#0EC4D8] focus:ring-offset-2 dark:focus:ring-offset-slate-950"
        aria-label="Abrir assistente financeira"
        title="Assistente financeira"
      >
        <MessageCircleMore size={25} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 hidden bg-slate-950/25 backdrop-blur-[1px] sm:block"
            onClick={() => setOpen(false)}
            aria-label="Fechar assistente financeira"
          />
          <section
            className="absolute inset-0 flex flex-col bg-slate-50 shadow-2xl dark:bg-slate-950 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,calc(100vh-2.5rem))] sm:w-[420px] sm:overflow-hidden sm:border sm:border-slate-200 sm:shadow-slate-950/25 dark:sm:border-slate-800"
            role="dialog"
            aria-label="Assistente financeira"
            aria-modal="true"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-[#0A6571] bg-[#0D2E3C] px-4 py-3.5 text-white">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0EC4D8] text-[#07313A]">
                <Bot size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Assistente financeira</p>
                <p className="mt-0.5 text-xs text-cyan-100/70">Rascunhos para voce revisar</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar assistente"
                title="Fechar"
              >
                <X size={19} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(135deg,rgba(14,196,216,0.045),transparent_45%)] px-3 py-4 dark:bg-[linear-gradient(135deg,rgba(14,196,216,0.08),transparent_45%)]">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={[
                      'max-w-[86%] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-l-xl rounded-br-xl bg-[#0C9EAF] text-white'
                        : 'rounded-r-xl rounded-bl-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                    ].join(' ')}>
                      <p>{message.content}</p>
                      {message.attachmentNames?.map((name) => (
                        <p key={name} className="mt-2 flex items-center gap-1.5 text-xs text-inherit/75">
                          <FileText size={13} /> {name}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}

                {isPreparing && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-r-xl rounded-bl-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      <LoaderCircle size={16} className="animate-spin text-[#0C9EAF]" /> Preparando rascunho...
                    </div>
                  </div>
                )}

                {draft && (
                  <div className="border border-cyan-200 bg-white p-3.5 shadow-sm dark:border-cyan-900/70 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Revisar lancamento</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Nada e salvo sem sua confirmacao.</p>
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
                        Descricao
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
                                <option value="debito">Debito</option>
                                <option value="credito">Credito</option>
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
                          Esta despesa ja foi paga
                        </label>
                      )}
                    </div>

                    {duplicateWarning && (
                      <p className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {duplicateWarning}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="mt-3 flex h-10 w-full items-center justify-center gap-2 bg-[#0C9EAF] px-4 text-sm font-semibold text-white transition hover:bg-[#087B89] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                      {isSaving ? 'Salvando...' : `Confirmar ${formatCurrency(draft.amount)}`}
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              {error && <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
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
                  placeholder="Ex.: Paguei R$ 82 no mercado"
                  className="max-h-28 min-h-10 flex-1 resize-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0C9EAF] focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={[
                    'flex h-10 w-10 shrink-0 items-center justify-center transition',
                    isListening ? 'bg-red-500 text-white hover:bg-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-[#0C9EAF] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300',
                  ].join(' ')}
                  aria-label={isListening ? 'Parar gravacao de voz' : 'Falar com a assistente'}
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
