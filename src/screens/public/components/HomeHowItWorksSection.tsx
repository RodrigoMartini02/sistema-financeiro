import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  BellRing,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  TrendingDown,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

type StepId = 1 | 2 | 3 | 4;

interface HomeHowItWorksSectionProps {
  onOpenRegister: () => void;
}

interface StepConfig {
  id: StepId;
  number: string;
  title: string;
  description: string;
  cardClass: string;
  markerClass: string;
  preview: 'profile' | 'transaction' | 'month' | 'report';
}


// Dados fictícios usados somente na demonstração pública do produto.
const steps: StepConfig[] = [
  {
    id: 1,
    number: '01',
    title: 'Crie seu perfil',
    description: 'Escolha entre Pessoal ou Empresa e mantenha cada contexto completamente separado.',
    cardClass: 'xl:left-[2%] xl:top-[12px] xl:h-[250px] xl:w-[470px] 2xl:left-0 2xl:top-[24px] 2xl:h-[270px] 2xl:w-[520px]',
    markerClass: 'xl:left-[calc(2%+506px)] xl:top-[36px] 2xl:left-[556px] 2xl:top-[48px]',
    preview: 'profile',
  },
  {
    id: 2,
    number: '02',
    title: 'Registre seus movimentos',
    description: 'Adicione receitas e despesas únicas, parceladas ou recorrentes.',
    cardClass: 'xl:left-[20%] xl:top-[340px] xl:h-[250px] xl:w-[470px] 2xl:left-[17%] 2xl:top-[315px] 2xl:h-[270px] 2xl:w-[520px]',
    markerClass: 'xl:left-[calc(20%+506px)] xl:top-[364px] 2xl:left-[calc(17%+556px)] 2xl:top-[339px]',
    preview: 'transaction',
  },
  {
    id: 3,
    number: '03',
    title: 'Acompanhe o mês',
    description: 'Veja o que entrou, o que foi pago e o que ainda está por vencer.',
    cardClass: 'xl:right-[8%] xl:top-[12px] xl:h-[250px] xl:w-[470px] 2xl:right-[10%] 2xl:top-[24px] 2xl:h-[270px] 2xl:w-[520px]',
    markerClass: 'xl:left-[calc(92%+36px)] xl:top-[36px] 2xl:left-[calc(90%+36px)] 2xl:top-[48px]',
    preview: 'month',
  },
  {
    id: 4,
    number: '04',
    title: 'Analise seus resultados',
    description: 'Filtre períodos, identifique padrões e exporte relatórios quando precisar.',
    cardClass: 'xl:right-[4%] xl:top-[340px] xl:h-[250px] xl:w-[470px] 2xl:right-[2%] 2xl:top-[315px] 2xl:h-[270px] 2xl:w-[520px]',
    markerClass: 'xl:left-[calc(96%+36px)] xl:top-[364px] 2xl:left-[calc(98%+36px)] 2xl:top-[339px]',
    preview: 'report',
  },
];

function TimelineMarker({
  step,
  isActive,
  isSelected,
  className = '',
  onSelect,
  onHover,
  onLeave,
  onKeyDown,
}: {
  step: StepConfig;
  isActive: boolean;
  isSelected: boolean;
  className?: string;
  onSelect: (step: StepId) => void;
  onHover: (step: StepId) => void;
  onLeave: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, step: StepId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(step.id)}
      onMouseEnter={() => onHover(step.id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(step.id)}
      onBlur={onLeave}
      onKeyDown={(event) => onKeyDown(event, step.id)}
      aria-label={'Selecionar etapa ' + step.number + ': ' + step.title}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'step' : undefined}
      className={[
        'fingerence-how-marker z-20 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-[22px] font-semibold outline-none transition duration-300',
        isActive
          ? 'scale-[1.04] border-[#62deeb] bg-[rgba(8,42,52,0.95)] text-site-accent shadow-[0_0_24px_rgba(24,191,216,0.42),inset_0_0_18px_rgba(24,191,216,0.12)]'
          : 'border-[rgba(24,191,216,0.30)] bg-[rgba(5,29,38,0.82)] text-site-textMuted hover:border-[rgba(98,222,235,0.72)] hover:text-site-accent',
        'focus-visible:ring-2 focus-visible:ring-site-accent/80 focus-visible:ring-offset-4 focus-visible:ring-offset-[#03161D]',
        className,
      ].join(' ')}
    >
      {step.number}
    </button>
  );
}

function ProfilePreview({ active }: { active: boolean }) {
  return (
    <div className={['how-profile-preview grid gap-3 rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.52)] p-3', active ? 'is-active' : ''].join(' ')}>
      <div className="profile-option profile-personal flex items-center gap-3 rounded-xl border border-[rgba(120,149,157,0.18)] bg-[rgba(5,29,38,0.52)] p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(180,197,202,0.22)] bg-[rgba(255,255,255,0.03)] text-site-textMuted">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-site-text">Pessoal</span>
          <span className="block text-[12px] text-site-textMuted">Finanças pessoais</span>
        </span>
      </div>
      <div className="profile-option profile-business flex items-center gap-3 rounded-xl border border-site-accent/70 bg-[rgba(14,196,216,0.13)] p-3 shadow-[0_0_20px_rgba(14,196,216,0.13)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-site-accent/44 bg-[rgba(14,196,216,0.10)] text-site-accent">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-site-text">Empresa</span>
          <span className="block text-[12px] text-site-accent">CNPJ</span>
        </span>
        <CircleCheck className="profile-check h-5 w-5 shrink-0 fill-site-accent text-[#03161D]" aria-hidden="true" />
      </div>
    </div>
  );
}

function TransactionPreview({ active }: { active: boolean }) {
  return (
    <div className={['how-transaction-preview rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.52)] p-3', active ? 'is-active' : ''].join(' ')}>
      <div className="grid grid-cols-2 border-b border-[rgba(74,153,173,0.16)] text-[12px]">
        <span className="tab-income flex items-center justify-center gap-1.5 border-b border-site-accent py-2 font-semibold text-[#26C281]">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          Receita
        </span>
        <span className="flex items-center justify-center gap-1.5 py-2 text-site-textSub">
          <TrendingDown className="h-3.5 w-3.5 text-[#EF6464]" aria-hidden="true" />
          Despesa
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-[11px] text-site-textMuted">
        <label className="how-field block">
          <span className="mb-1 block">Descrição</span>
          <span className="block rounded-lg border border-[rgba(74,153,173,0.18)] bg-[rgba(5,29,38,0.38)] px-3 py-2 text-site-textMuted">Ex: Salário mensal</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="how-field block">
            <span className="mb-1 block">Valor</span>
            <span className="block rounded-lg border border-[rgba(74,153,173,0.18)] bg-[rgba(5,29,38,0.38)] px-3 py-2 text-site-textMuted">R$ 0,00</span>
          </label>
          <label className="how-field block">
            <span className="mb-1 block">Data</span>
            <span className="flex items-center justify-between rounded-lg border border-[rgba(74,153,173,0.18)] bg-[rgba(5,29,38,0.38)] px-3 py-2 text-site-textMuted">
              dd/mm/aaaa
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px] text-site-textSub">
        <span className="rounded-lg border border-site-accent/50 bg-[rgba(14,196,216,0.08)] px-2 py-1.5 text-center text-site-accent">Única</span>
        <span className="rounded-lg border border-[rgba(74,153,173,0.16)] bg-[rgba(5,29,38,0.28)] px-2 py-1.5 text-center">Parcelada</span>
        <span className="recurring-option rounded-lg border border-[rgba(74,153,173,0.16)] bg-[rgba(5,29,38,0.28)] px-2 py-1.5 text-center">Recorrente</span>
      </div>
    </div>
  );
}

function MonthlyPreview({ active }: { active: boolean }) {
  const items: Array<{ label: string; value: string; tone: 'green' | 'blue' | 'coral'; icon: LucideIcon }> = [
    { label: 'Recebido', value: 'R$ 18.540,80', tone: 'green', icon: CircleDollarSign },
    { label: 'Pago', value: 'R$ 5.420,00', tone: 'blue', icon: CreditCard },
    { label: 'Pendente', value: 'R$ 1.280,00', tone: 'coral', icon: Clock3 },
  ];

  const tones = {
    green: 'border-[#26C281]/28 bg-[#26C281]/10 text-[#26C281]',
    blue: 'border-[#3789F5]/28 bg-[#3789F5]/10 text-[#3789F5]',
    coral: 'border-[#EF6464]/28 bg-[#EF6464]/10 text-[#EF6464]',
  };

  return (
    <div className={['how-month-preview grid gap-2 rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.52)] p-3', active ? 'is-active' : ''].join(' ')}>
      {items.map(({ label, value, tone, icon: Icon }) => (
        <div key={label} className="month-row grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border border-[rgba(74,153,173,0.14)] bg-[rgba(5,29,38,0.30)] px-3 py-1.5">
          <span className={['flex h-8 w-8 items-center justify-center rounded-lg border', tones[tone]].join(' ')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[13px] text-site-text">{label}</span>
          <span className={tone === 'green' ? 'whitespace-nowrap text-[11px] font-semibold text-[#26C281]' : tone === 'blue' ? 'whitespace-nowrap text-[11px] font-semibold text-[#3789F5]' : 'whitespace-nowrap text-[11px] font-semibold text-[#EF6464]'}>
            {value}
          </span>
        </div>
      ))}
      <div className="month-alert mt-1 flex items-center justify-center gap-2 rounded-lg border border-[#F6A623]/24 bg-[#F6A623]/8 px-3 py-1.5 text-[12px] font-semibold text-[#F6A623]">
        <BellRing className="h-4 w-4" aria-hidden="true" />
        2 vencimentos próximos
      </div>
    </div>
  );
}

function ReportPreview({ active }: { active: boolean }) {
  const categories = [
    { label: 'Moradia', percent: '34%', width: '100%' },
    { label: 'Alimentação', percent: '22%', width: '65%' },
    { label: 'Transporte', percent: '15%', width: '44%' },
    { label: 'Outros', percent: '10%', width: '30%' },
  ];

  return (
    <div className={['how-report-preview rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.52)] p-3', active ? 'is-active' : ''].join(' ')}>
      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        <span className="rounded-full border border-site-accent/48 bg-site-accent/18 px-2 py-1.5 text-center font-semibold text-site-text">Este mês</span>
        <span className="rounded-full border border-[rgba(74,153,173,0.14)] bg-[rgba(255,255,255,0.04)] px-2 py-1.5 text-center text-site-textSub">Trimestre</span>
        <span className="rounded-full border border-[rgba(74,153,173,0.14)] bg-[rgba(255,255,255,0.04)] px-2 py-1.5 text-center text-site-textSub">Este ano</span>
      </div>

      <h4 className="mt-4 text-[11px] font-semibold uppercase text-site-text">Despesas por categoria</h4>
      <ul className="mt-2.5 grid gap-2">
        {categories.map(({ label, percent, width }) => (
          <li key={label} className="grid grid-cols-[74px_1fr_34px] items-center gap-2 text-[11px] text-site-textSub">
            <span>{label}</span>
            <span
              className="h-2 overflow-hidden rounded-full bg-[rgba(120,149,157,0.16)]"
              role="progressbar"
              aria-label={label + ': ' + percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(percent.replace('%', ''))}
            >
              <span className="report-bar block h-full rounded-full bg-[linear-gradient(90deg,#18bfd8,#3789f5)]" style={{ width }} />
            </span>
            <span className="text-right text-site-text">{percent}</span>
          </li>
        ))}
      </ul>

      <div className="export-action mt-3 flex items-center justify-between rounded-lg border border-[rgba(74,153,173,0.18)] bg-[rgba(5,29,38,0.32)] px-3 py-2 text-[13px] font-semibold text-site-text">
        <span className="inline-flex items-center gap-2">
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar PDF
        </span>
        <ChevronRight className="h-4 w-4 text-site-textMuted" aria-hidden="true" />
      </div>
    </div>
  );
}

function Preview({ type, active }: { type: StepConfig['preview']; active: boolean }) {
  if (type === 'profile') return <ProfilePreview active={active} />;
  if (type === 'transaction') return <TransactionPreview active={active} />;
  if (type === 'month') return <MonthlyPreview active={active} />;
  return <ReportPreview active={active} />;
}

function TimelineStep({
  step,
  isVisual,
  isSelected,
  onSelect,
  onHover,
  onLeave,
  onKeyDown,
}: {
  step: StepConfig;
  isVisual: boolean;
  isSelected: boolean;
  onSelect: (step: StepId) => void;
  onHover: (step: StepId) => void;
  onLeave: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, step: StepId) => void;
}) {
  return (
    <article
      className={[
        'fingerence-how-card group relative z-10 grid grid-cols-[56px_1fr] gap-4 transition duration-300 xl:absolute xl:block',
        step.cardClass,
        isVisual ? 'is-active opacity-100 xl:-translate-y-1' : 'opacity-90',
      ].join(' ')}
      onMouseEnter={() => onHover(step.id)}
      onMouseLeave={onLeave}
      data-active={isVisual ? 'true' : 'false'}
      data-step={step.id}
    >
      <TimelineMarker
        step={step}
        isActive={isVisual}
        isSelected={isSelected}
        className="xl:hidden"
        onSelect={onSelect}
        onHover={onHover}
        onLeave={onLeave}
        onKeyDown={onKeyDown}
      />

      <div className={['relative min-w-0 rounded-[18px] border bg-[rgba(5,29,38,0.90)] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-300 sm:p-4 xl:h-full xl:overflow-hidden 2xl:p-5', isVisual ? 'border-[rgba(98,222,235,0.66)] shadow-[0_0_30px_rgba(24,191,216,0.13),0_22px_80px_rgba(0,0,0,0.24)]' : 'border-[rgba(30,190,216,0.28)]'].join(' ')}>
        <span className="pointer-events-none absolute -left-14 top-4 hidden text-[58px] font-semibold leading-none text-site-accent/[0.055] xl:block" aria-hidden="true">
          {step.number}
        </span>
        <div className="grid h-full gap-4 md:grid-cols-[0.88fr_1.12fr] md:items-center xl:grid-cols-[0.82fr_1.28fr] 2xl:grid-cols-[0.86fr_1.34fr] 2xl:gap-5">
          <div>
            <h3 className="text-[clamp(19px,1.35vw,22px)] font-semibold leading-tight text-site-text">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-site-textSub">{step.description}</p>
          </div>
          <Preview type={step.preview} active={isVisual} />
        </div>
      </div>
    </article>
  );
}

export function HomeHowItWorksSection({ onOpenRegister }: HomeHowItWorksSectionProps) {
  const [selectedStep, setSelectedStep] = useState<StepId>(1);
  const [hoveredStep, setHoveredStep] = useState<StepId | null>(null);
  const visualStep = hoveredStep ?? selectedStep;

  const selectedTitle = useMemo(
    () => steps.find((step) => step.id === selectedStep)?.title ?? steps[0].title,
    [selectedStep],
  );

  const selectStep = (step: StepId) => setSelectedStep(step);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, step: StepId) => {
    const currentIndex = steps.findIndex((item) => item.id === step);
    const selectByIndex = (index: number) => {
      event.preventDefault();
      const next = steps[index]?.id;
      if (next) {
        setSelectedStep(next);
        setHoveredStep(next);
      }
    };

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedStep(step);
      setHoveredStep(step);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      selectByIndex(Math.min(currentIndex + 1, steps.length - 1));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      selectByIndex(Math.max(currentIndex - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      selectByIndex(0);
      return;
    }
    if (event.key === 'End') {
      selectByIndex(steps.length - 1);
    }
  };

  return (
    <section
      id="como-funciona"
      aria-labelledby="how-it-works-title"
      className="fingerence-how-section public-light-panel relative isolate overflow-hidden border-b border-slate-200 bg-white py-12 sm:py-14 xl:py-12 2xl:py-14"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#eef8f9] via-white to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(238,248,249,0.82),rgba(255,255,255,0.96)_44%,rgba(238,248,249,0.72))]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(14,196,216,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(14,196,216,0.13) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1800px] px-5 sm:px-8 xl:px-10">
        <header className="mx-auto max-w-[1260px] text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.26em] text-site-accent">SIMPLES DESDE O PRIMEIRO ACESSO</p>
          <h2
            id="how-it-works-title"
            className="mx-auto mt-4 max-w-[1420px] text-[clamp(32px,3.05vw,48px)] font-semibold leading-[1.08] text-site-text text-balance"
          >
            Comece a organizar suas finanças em poucos minutos.
          </h2>
          <p className="mx-auto mt-4 max-w-[1120px] text-[clamp(16px,1.25vw,20px)] leading-relaxed text-site-textSub">
            Crie seu perfil, registre seus movimentos e acompanhe tudo com clareza — sem planilhas e sem complicação.
          </p>
        </header>

        <div
          className="relative mt-8 grid gap-6 xl:min-h-[620px] xl:block 2xl:min-h-[610px]"
          aria-label="Como o FINGERENCE funciona"
          aria-describedby="how-it-works-selected"
        >
          <p id="how-it-works-selected" className="sr-only">
            Etapa selecionada: {selectedTitle}
          </p>

          {steps.map((step) => {
            const isVisual = visualStep === step.id;
            const isSelected = selectedStep === step.id;
            return (
              <TimelineStep
                key={step.id}
                step={step}
                isVisual={isVisual}
                isSelected={isSelected}
                onSelect={selectStep}
                onHover={setHoveredStep}
                onLeave={() => setHoveredStep(null)}
                onKeyDown={handleKeyDown}
              />
            );
          })}

          <div className="hidden xl:block">
            {steps.map((step) => {
              const isVisual = visualStep === step.id;
              const isSelected = selectedStep === step.id;
              return (
                <TimelineMarker
                  key={step.id}
                  step={step}
                  isActive={isVisual}
                  isSelected={isSelected}
                  className={['absolute -translate-x-1/2', step.markerClass].join(' ')}
                  onSelect={selectStep}
                  onHover={setHoveredStep}
                  onLeave={() => setHoveredStep(null)}
                  onKeyDown={handleKeyDown}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center text-center xl:mt-1 2xl:mt-2">
          <button
            type="button"
            onClick={onOpenRegister}
            className="site-neon-light-button inline-flex min-h-14 w-full max-w-[320px] items-center justify-center rounded-xl border px-7 text-[18px] font-semibold sm:w-auto sm:min-w-[320px]"
          >
            Começar 15 dias grátis
          </button>
        </div>
      </div>
    </section>
  );
}
