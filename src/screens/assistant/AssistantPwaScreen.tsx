import { AuthenticatedAppGate } from '../../components/auth/AuthenticatedAppGate';
import { FinancialAssistant } from '../../components/financial-assistant/FinancialAssistant';

function AssistantWorkspace() {
  return (
    <main className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950">
      <FinancialAssistant mode="standalone" />
    </main>
  );
}

export function AssistantPwaScreen() {
  return (
    <AuthenticatedAppGate>
      {() => <AssistantWorkspace />}
    </AuthenticatedAppGate>
  );
}
