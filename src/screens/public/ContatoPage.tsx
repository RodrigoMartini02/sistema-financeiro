import { type FormEvent, useState } from 'react';
import { Lock, Mail, MessageCircle, Phone, Send, ShieldCheck } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

const CANAIS = [
  {
    title: 'E-mail',
    value: 'fingerence@gmail.com',
    href: 'mailto:fingerence@gmail.com',
    icon: Mail,
    accent: 'border-sky-100 bg-sky-50 text-sky-600',
  },
  {
    title: 'WhatsApp',
    value: '(49) 99955-4856',
    href: 'https://wa.me/5549999554856',
    icon: Phone,
    accent: 'border-emerald-100 bg-emerald-50 text-emerald-600',
  },
];

const GARANTIAS = [
  { title: 'Resposta rápida', description: 'Retorno em até 1 dia útil.', icon: ShieldCheck, accent: 'text-emerald-600' },
  { title: 'Privacidade', description: 'Seus dados não são compartilhados.', icon: Lock, accent: 'text-brand-700' },
  { title: 'Canal direto', description: 'Fale por e-mail ou WhatsApp.', icon: MessageCircle, accent: 'text-sky-600' },
];

const FLUXO = [
  {
    title: 'Envie sua dúvida',
    description: 'Descreva o problema ou sugestão pelo formulário, e-mail ou WhatsApp. Qualquer detalhe ajuda.',
  },
  {
    title: 'Avaliamos e respondemos',
    description: 'Nossa equipe analisa e retorna com orientação clara, sem enrolação.',
  },
  {
    title: 'Problema resolvido',
    description: 'Acompanhamos até a resolução completa. Sua satisfação é o critério de encerramento.',
  },
];

function formatPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Label({ children }: { children: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">{children}</p>;
}

const fieldClass = [
  'h-12 rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-950 outline-none transition',
  'placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:shadow-[0_0_0_4px_rgba(14,196,216,0.12)]',
].join(' ');

export function ContatoPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const update = (field: keyof typeof form, value: string) => {
    if (submitState !== 'idle') {
      setSubmitState('idle');
    }
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitState('sending');
    try {
      const body = [
        `Nome: ${form.name}`,
        `E-mail: ${form.email}`,
        `Telefone: ${form.phone || 'Não informado'}`,
        '',
        'Mensagem:',
        form.message,
      ].join('\n');
      const params = new URLSearchParams({
        subject: 'Contato via site',
        body,
      });
      window.location.href = `mailto:fingerence@gmail.com?${params.toString()}`;
      setSubmitState('success');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch {
      setSubmitState('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fbfb] text-slate-950">
      <SiteHeader tone="light" onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero
        tone="light"
        label="CONTATO"
        title="Fale com a gente."
        description="Dúvidas, sugestões ou suporte: estamos disponíveis pelo e-mail ou WhatsApp."
      />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1800px] gap-7 px-5 py-14 sm:px-8 xl:grid-cols-[0.9fr_1.1fr] xl:px-10 xl:py-16">
          <aside className="flex flex-col gap-7 rounded-lg border border-slate-200 bg-[#f8fbfb] p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] sm:p-8">
            <div>
              <Label>Canais de contato</Label>
              <h2 className="mt-4 text-[clamp(26px,2.2vw,40px)] font-light leading-[1.15] tracking-[0.02em] text-slate-950">
                Escolha o canal mais conveniente.
              </h2>
              <p className="mt-4 text-[14px] leading-[1.75] text-slate-600">
                Responda pelo formulário ao lado ou entre em contato diretamente pelos canais abaixo.
              </p>
            </div>

            <div className="grid gap-3">
              {CANAIS.map(({ title, value, href, icon: Icon, accent }) => (
                <a
                  key={title}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noreferrer' : undefined}
                  className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 transition duration-300 hover:border-brand-200 hover:shadow-[0_18px_46px_rgba(15,23,42,0.06)]"
                >
                  <span className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border', accent].join(' ')}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</span>
                    <span className="mt-1 block text-[14px] font-semibold text-slate-950">{value}</span>
                  </span>
                </a>
              ))}
            </div>

            <div className="mt-auto grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3">
              {GARANTIAS.map(({ title, description, icon: Icon, accent }) => (
                <div key={title} className="flex gap-2.5">
                  <Icon className={['mt-0.5 h-4 w-4 shrink-0', accent].join(' ')} aria-hidden="true" />
                  <div>
                    <p className="text-[12px] font-semibold text-slate-950">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-[1.5] text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-brand-100 bg-[#eef8f9] p-6 shadow-[0_24px_70px_rgba(8,52,61,0.10)] sm:p-8"
          >
            <Label>Envie uma mensagem</Label>

            <div className="mt-6 grid gap-4">
              <input
                required
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Nome"
                className={fieldClass}
              />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="E-mail"
                className={fieldClass}
              />
              <input
                inputMode="tel"
                value={form.phone}
                onFocus={() => { if (!form.phone) update('phone', '('); }}
                onBlur={() => { if (form.phone === '(') update('phone', ''); }}
                onChange={(e) => update('phone', formatPhone(e.target.value))}
                placeholder="(DDD) número / WhatsApp"
                className={fieldClass}
              />
              <textarea
                required
                minLength={10}
                value={form.message}
                onChange={(e) => update('message', e.target.value)}
                placeholder="Mensagem"
                className={[fieldClass, 'min-h-[132px] resize-y py-3.5'].join(' ')}
              />
            </div>

            <button
              type="submit"
              disabled={submitState === 'sending'}
              className="site-neon-light-button mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState === 'sending' ? 'Enviando...' : 'Enviar mensagem'}
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>

            {submitState === 'success' && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700" role="status">
                Seu aplicativo de e-mail foi aberto com a mensagem preenchida. Revise e clique em enviar para concluir.
              </p>
            )}
            {submitState === 'error' && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700" role="status">
                Não foi possível abrir o aplicativo de e-mail. Envie sua mensagem para fingerence@gmail.com ou pelo WhatsApp.
              </p>
            )}
          </form>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#eef8f9]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <Label>Como funciona</Label>
          <h2 className="mt-4 text-[clamp(26px,2.2vw,40px)] font-light leading-[1.2] tracking-[0.02em] text-slate-950">
            Do contato à resolução
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {FLUXO.map(({ title, description }, i) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.20em] text-brand-700">
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-[18px] font-semibold text-slate-950">{title}</h3>
                <p className="mt-3 text-[14px] leading-[1.7] text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter
        tone="light"
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} tone="light" />
      <TermosModal
        open={modalAberto !== null}
        tipo={modalAberto ?? 'termos'}
        onClose={() => setModalAberto(null)}
      />
      {!loginOpen && modalAberto === null && <CookieBanner />}
    </div>
  );
}
