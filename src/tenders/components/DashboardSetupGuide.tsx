import { CircleCheck, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SetupGuide } from '../utils/dashboard';

/** Guia da conta que ainda não usou o módulo: os primeiros passos, com o que já foi feito marcado. */
export function DashboardSetupGuide({ guide }: { guide: SetupGuide }) {
  const doneCount = guide.steps.filter((step) => step.done).length;
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10" aria-label="Primeiros passos">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-brand-900 dark:text-brand-100">Comece por aqui</h2>
        <p className="text-xs text-brand-800 dark:text-brand-200/90">
          {doneCount} de {guide.steps.length} passos feitos. O painel enche conforme você usa o módulo.
        </p>
      </div>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {guide.steps.map((step) => {
          const Icon = step.done ? CircleCheck : Circle;
          return (
            <li key={step.key}>
              <Link
                to={step.to}
                className="flex h-full items-start gap-2.5 rounded-xl bg-white/80 p-3 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:bg-slate-800/70 dark:hover:bg-slate-800"
              >
                <Icon
                  size={18}
                  className={`mt-0.5 shrink-0 ${step.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${step.done ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {step.title}
                    {step.done && <span className="sr-only"> (feito)</span>}
                  </span>
                  <span className="block text-xs text-slate-600 dark:text-slate-300">{step.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
