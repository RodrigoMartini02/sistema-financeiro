import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Play, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiIntegrationSetting, AiProviderName } from '../../types/aiIntegration';
import { AI_PROVIDER_LABELS, fetchAiIntegrationSettings, saveAiIntegration, testAiIntegration } from '../../services/aiIntegrationsService';
import { queryKeys } from '../../services/queryKeys';
import { InfoBanner } from '../../ui/InfoBanner';
import { CFG, cfgInputStyle, cfgLabelStyle, cfgPrimaryButtonStyle } from '../../ui/configTokens';

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

  if (settingsQuery.isLoading) {
    return (
      <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
        Carregando integrações...
      </p>
    );
  }
  if (settingsQuery.error) {
    return (
      <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12.5, color: CFG.danger }}>
        Não foi possível carregar as integrações de IA.
      </p>
    );
  }

  return (
    <div className="grid gap-2.5">
      <InfoBanner>
        O copiloto funciona com respostas locais enquanto nenhuma IA estiver ativa. Ao ativar um provedor, somente uma integração fica ativa por vez e a chave permanece cifrada no servidor.
      </InfoBanner>
      {feedback && (
        <InfoBanner variant="success">
          <CheckCircle2 size={13} style={{ flex: 'none' }} /> {feedback}
        </InfoBanner>
      )}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          borderRadius: 10, border: `1px solid ${CFG.dangerBorder}`, background: CFG.dangerBg,
          padding: '7px 9px', fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: CFG.danger,
        }}>
          <CircleAlert size={13} style={{ flex: 'none' }} /> {error}
        </div>
      )}

      <div className="grid gap-2.5">
        {PROVIDERS.map(({ provider, defaultModel }) => {
          const setting = settingsQuery.data?.find((item) => item.provider === provider);
          const form = forms[provider] ?? formFromSetting(setting, defaultModel);
          const isWorking = saveMutation.isPending || testMutation.isPending;
          return (
            <section
              key={provider}
              style={{
                borderRadius: 12, border: `1px solid ${CFG.border}`, background: CFG.surface,
                padding: 14,
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: CFG.text }}>
                    {AI_PROVIDER_LABELS[provider]}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: CFG.muted }}>
                    {setting?.hasToken ? 'Chave configurada no servidor.' : 'Nenhuma chave configurada.'}
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: CFG.textSoft }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => updateForm(provider, { enabled: event.target.checked })}
                    style={{ width: 15, height: 15, accentColor: CFG.primary }}
                  />
                  Ativar este provedor
                </label>
              </div>

              <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={cfgLabelStyle}>Modelo</span>
                  <input
                    value={form.model}
                    onChange={(event) => updateForm(provider, { model: event.target.value })}
                    placeholder={defaultModel}
                    style={cfgInputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={cfgLabelStyle}>Chave de API</span>
                  <span style={{ position: 'relative' }}>
                    <KeyRound
                      size={14}
                      style={{
                        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        pointerEvents: 'none', color: CFG.muted,
                      }}
                    />
                    <input
                      type="password"
                      value={form.token}
                      onChange={(event) => updateForm(provider, { token: event.target.value })}
                      placeholder={setting?.hasToken ? 'Manter chave atual' : 'Cole a chave de API'}
                      autoComplete="new-password"
                      style={{ ...cfgInputStyle, paddingLeft: 30 }}
                    />
                  </span>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => test(provider)}
                  disabled={isWorking || (!form.token && !setting?.hasToken)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px',
                    borderRadius: 999, border: `1px solid ${CFG.borderInput}`, background: CFG.surface,
                    fontSize: 12.5, fontWeight: 600, color: CFG.textSoft,
                    cursor: isWorking || (!form.token && !setting?.hasToken) ? 'not-allowed' : 'pointer',
                    opacity: isWorking || (!form.token && !setting?.hasToken) ? 0.5 : 1,
                  }}
                >
                  {testMutation.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />} Testar
                </button>
                <button
                  type="button"
                  onClick={() => save(provider)}
                  disabled={isWorking || (!form.token && !setting?.hasToken)}
                  style={{
                    ...cfgPrimaryButtonStyle,
                    cursor: isWorking || (!form.token && !setting?.hasToken) ? 'not-allowed' : 'pointer',
                    opacity: isWorking || (!form.token && !setting?.hasToken) ? 0.5 : 1,
                  }}
                >
                  {saveMutation.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />} Salvar
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
