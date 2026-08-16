import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Play, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiIntegrationSetting, AiProviderName } from '../../types/aiIntegration';
import { AI_PROVIDER_LABELS, fetchAiIntegrationSettings, saveAiIntegration, testAiIntegration } from '../../services/aiIntegrationsService';
import { queryKeys } from '../../services/queryKeys';

const PROVIDERS: Array<{ provider: AiProviderName; defaultModel: string }> = [
  { provider: 'openai', defaultModel: 'gpt-5-mini' },
  { provider: 'anthropic', defaultModel: 'claude-haiku-4-5' },
  { provider: 'gemini', defaultModel: 'gemini-2.5-flash' },
];

interface ProviderForm {
  model: string;
  token: string;
  enabled: boolean;
}

function formFromSetting(setting: AiIntegrationSetting | undefined, defaultModel: string): ProviderForm {
  return { model: setting?.model ?? defaultModel, token: '', enabled: setting?.enabled ?? false };
}

export function IntegracoesIaTab() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: queryKeys.aiIntegrations, queryFn: fetchAiIntegrationSettings });
  const [forms, setForms] = useState<Record<AiProviderName, ProviderForm>>({
    openai: formFromSetting(undefined, PROVIDERS[0].defaultModel),
    anthropic: formFromSetting(undefined, PROVIDERS[1].defaultModel),
    gemini: formFromSetting(undefined, PROVIDERS[2].defaultModel),
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForms({
      openai: formFromSetting(settingsQuery.data.find((item) => item.provider === 'openai'), PROVIDERS[0].defaultModel),
      anthropic: formFromSetting(settingsQuery.data.find((item) => item.provider === 'anthropic'), PROVIDERS[1].defaultModel),
      gemini: formFromSetting(settingsQuery.data.find((item) => item.provider === 'gemini'), PROVIDERS[2].defaultModel),
    });
  }, [settingsQuery.data]);

  const updateForm = (provider: AiProviderName, patch: Partial<ProviderForm>) => {
    setForms((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }));
    setFeedback(null);
    setError(null);
  };

  const saveMutation = useMutation({
    mutationFn: saveAiIntegration,
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.aiIntegrations });
      setForms((current) => ({ ...current, [saved.provider]: { ...current[saved.provider], token: '', enabled: saved.enabled } }));
      setFeedback(`${AI_PROVIDER_LABELS[saved.provider]} atualizado.`);
    },
    onError: (requestError) => setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a integração.'),
  });
  const testMutation = useMutation({
    mutationFn: testAiIntegration,
    onSuccess: () => setFeedback('Conexão validada com sucesso.'),
    onError: (requestError) => setError(requestError instanceof Error ? requestError.message : 'Não foi possível validar a integração.'),
  });

  const save = (provider: AiProviderName) => {
    const form = forms[provider];
    setFeedback(null);
    setError(null);
    saveMutation.mutate({ provider, model: form.model, token: form.token || undefined, enabled: form.enabled, primary: form.enabled });
  };
  const test = (provider: AiProviderName) => {
    const form = forms[provider];
    setFeedback(null);
    setError(null);
    testMutation.mutate({ provider, model: form.model, token: form.token || undefined });
  };

  if (settingsQuery.isLoading) return <p className="py-8 text-sm text-slate-500">Carregando integrações...</p>;
  if (settingsQuery.error) return <p className="py-8 text-sm text-red-600">Não foi possível carregar as integrações de IA.</p>;

  return (
    <div className="grid max-w-4xl gap-5">
      <div className="border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
        O copiloto funciona com respostas locais enquanto nenhuma IA estiver ativa. Ao ativar um provedor, somente uma integração fica ativa por vez e a chave permanece cifrada no servidor.
      </div>
      {feedback && <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 size={17} /> {feedback}</div>}
      {error && <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><CircleAlert size={17} /> {error}</div>}

      <div className="grid gap-4">
        {PROVIDERS.map(({ provider, defaultModel }) => {
          const setting = settingsQuery.data?.find((item) => item.provider === provider);
          const form = forms[provider] ?? formFromSetting(setting, defaultModel);
          const isWorking = saveMutation.isPending || testMutation.isPending;
          return (
            <section key={provider} className="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{AI_PROVIDER_LABELS[provider]}</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{setting?.hasToken ? 'Chave configurada no servidor.' : 'Nenhuma chave configurada.'}</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm(provider, { enabled: event.target.checked })} className="h-4 w-4 accent-[#0C9EAF]" />
                  Ativar este provedor
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Modelo
                  <input value={form.model} onChange={(event) => updateForm(provider, { model: event.target.value })} placeholder={defaultModel} className="h-10 border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Chave de API
                  <span className="relative">
                    <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="password" value={form.token} onChange={(event) => updateForm(provider, { token: event.target.value })} placeholder={setting?.hasToken ? 'Manter chave atual' : 'Cole a chave de API'} autoComplete="new-password" className="h-10 w-full border border-slate-200 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => test(provider)} disabled={isWorking || (!form.token && !setting?.hasToken)} className="flex h-10 items-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
                  {testMutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />} Testar
                </button>
                <button type="button" onClick={() => save(provider)} disabled={isWorking || (!form.token && !setting?.hasToken)} className="flex h-10 items-center gap-2 bg-[#0C9EAF] px-4 text-sm font-semibold text-white transition hover:bg-[#087B89] disabled:cursor-not-allowed disabled:opacity-50">
                  {saveMutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Salvar
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
