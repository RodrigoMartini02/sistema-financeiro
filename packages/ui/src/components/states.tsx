import { AlertCircle, Loader2 } from 'lucide-react';

interface StateProps { title: string; description?: string; }

export function LoadingState({ title, description }: StateProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 size={32} className="animate-spin text-brand-600" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}

export function ErrorState({ title, description }: StateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center">
      <AlertCircle size={22} className="text-red-500" />
      <p className="text-sm font-semibold text-red-700">{title}</p>
      {description && <p className="text-xs text-red-600">{description}</p>}
    </div>
  );
}

// EmptyState vive em ui/EmptyState.tsx — havia duas implementacoes com o mesmo
// nome, e o mesmo vazio renderizava diferente conforme a tela.
