import type { LucideIcon } from 'lucide-react';

interface PlaceholderSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function PlaceholderSection({ icon: Icon, title, description }: PlaceholderSectionProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
        <Icon size={26} className="text-slate-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      {description && <p className="text-sm text-slate-500">{description}</p>}
    </div>
  );
}
