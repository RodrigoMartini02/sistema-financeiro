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
  },
  {
    title: 'WhatsApp',
    value: '(49) 99955-4856',
    href: 'https://wa.me/5549999554856',
    icon: Phone,
  },
];

const GARANTIAS = [
  { title: 'Resposta rápida', description: 'Retorno em até 1 dia útil.', icon: ShieldCheck },
  { title: 'Privacidade', description: 'Seus dados não são compartilhados.', icon: Lock },
  { title: 'Canal direto', description: 'Fale por e-mail ou WhatsApp.', icon: MessageCircle },
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

export function ContatoPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const update = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitState('sending');
    try {
      const body = `Nome: ${form.name}%0AEmail: ${form.email}%0ATelefone: ${form.phone}%0A%0AMensagem:%0A${form.message}`;
      window.location.href = `mailto:fingerence@gmail.com?subject=Contato via site&body=${body}`;
      setSubmitState('success');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch {
      setSubmitState('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero
        label="CONTATO"
        title="Fale com a gente."
        description="Dúvidas, sugestões ou suporte — estamos disponíveis pelo e-mail ou WhatsApp."
      />

      {/* Canais + Formulário */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto grid max-w-[1800px] gap-7 px-5 py-14 sm:px-8 xl:grid-cols-[0.9fr_1.1fr] xl:px-10 xl:py-16">

          {/* Canais */}
          <div className="flex flex-col gap-7 rounded-[24px] border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 sm:p-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.30em] text-site-textMuted">CANAIS DE CONTATO</p>
              <h2 className="mt-4 text-[clamp(26px,2.2vw,40px)] font-light leading-[1.15] tracking-[0.03em] text-site-text">
                Escolha o canal mais conveniente.
              </h2>
              <p className="mt-4 text-[14px] leading-[1.75] text-site-textSub">
                Responda pelo formulário ao lado ou entre em contato diretamente pelos canais abaixo.
              </p>
            </div>

            <div className="space-y-3">
              {CANAIS.map(({ title, value, href, icon: Icon }) => (
                <a
                  key={title}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noreferrer' : undefined}
                  className="group flex items-center gap-4 rounded-2xl border border-[rgba(14,196,216,0.0)] bg-[rgba(14,196,216,0.03)] p-3 transition duration-300 hover:border-[rgba(14,196,216,0.28)] hover:bg-[rgba(14,196,216,0.06)] hover:shadow-[0_0_22px_rgba(14,196,216,0.10)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(14,196,216,0.20)] bg-[rgba(14,196,216,0.04)] text-site-textMuted transition duration-300 group-hover:border-site-accent/60 group-hover:text-site-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-site-textMuted">{title}</span>
                    <span className="mt-1 block text-[14px] text-site-text">{value}</span>
                  </span>
                </a>
              ))}
            </div>

            <div className="mt-auto grid gap-4 border-t border-[rgba(14,196,216,0.10)] pt-6 sm:grid-cols-3">
              {GARANTIAS.map(({ title, description, icon: Icon }) => (
                <div key={title} className="flex gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" />
                  <div>
                    <p className="text-[12px] text-site-text">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-[1.5] text-site-textMuted">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulário */}
          <form
            onSubmit={handleSubmit}
            className="rounded-[24px] border border-[rgba(14,196,216,0.20)] bg-[linear-gradient(145deg,rgba(14,196,216,0.05),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            <p className="text-[10px] uppercase tracking-[0.30em] text-site-textMuted">ENVIE UMA MENSAGEM</p>

            <div className="mt-6 grid gap-4">
              <input
                required
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Nome"
                className="h-12 rounded-xl border border-[rgba(14,196,216,0.18)] bg-[rgba(14,196,216,0.04)] px-4 text-[14px] text-site-text outline-none transition placeholder:text-site-textMuted focus:border-site-accent/60 focus:shadow-[0_0_18px_rgba(14,196,216,0.12)]"
              />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="E-mail"
                className="h-12 rounded-xl border border-[rgba(14,196,216,0.18)] bg-[rgba(14,196,216,0.04)] px-4 text-[14px] text-site-text outline-none transition placeholder:text-site-textMuted focus:border-site-accent/60 focus:shadow-[0_0_18px_rgba(14,196,216,0.12)]"
              />
              <input
                inputMode="tel"
                value={form.phone}
                onFocus={() => { if (!form.phone) update('phone', '('); }}
                onBlur={() => { if (form.phone === '(') update('phone', ''); }}
                onChange={(e) => update('phone', formatPhone(e.target.value))}
                placeholder="(DDD) número / WhatsApp"
                className="h-12 rounded-xl border border-[rgba(14,196,216,0.18)] bg-[rgba(14,196,216,0.04)] px-4 text-[14px] text-site-text outline-none transition placeholder:text-site-textMuted focus:border-site-accent/60 focus:shadow-[0_0_18px_rgba(14,196,216,0.12)]"
              />
              <textarea
                required
                minLength={10}
                value={form.message}
                onChange={(e) => update('message', e.target.value)}
                placeholder="Mensagem"
                className="min-h-[110px] resize-y rounded-xl border border-[rgba(14,196,216,0.18)] bg-[rgba(14,196,216,0.04)] px-4 py-3.5 text-[14px] text-site-text outline-none transition placeholder:text-site-textMuted focus:border-site-accent/60 focus:shadow-[0_0_18px_rgba(14,196,216,0.12)]"
              />
            </div>

            <button
              type="submit"
              disabled={submitState === 'sending'}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-site-accent/50 bg-[rgba(14,196,216,0.08)] text-[11px] uppercase tracking-[0.16em] text-site-text transition duration-300 hover:border-site-accent hover:bg-[rgba(14,196,216,0.14)] hover:shadow-[0_0_28px_rgba(14,196,216,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState === 'sending' ? 'ENVIANDO...' : 'ENVIAR MENSAGEM'}
              <Send className="h-4 w-4" />
            </button>

            {submitState === 'success' && (
              <p className="mt-4 rounded-xl border border-site-accent/30 bg-[rgba(14,196,216,0.06)] px-4 py-3 text-[12px] text-site-textSub" role="status">
                Mensagem preparada. Confirme o envio no seu cliente de e-mail.
              </p>
            )}
            {submitState === 'error' && (
              <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[12px] text-red-300" role="status">
                Não foi possível abrir o e-mail. Contate-nos diretamente pelo WhatsApp.
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Fluxo de atendimento */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">COMO FUNCIONA</p>
          <h2 className="mt-4 text-[clamp(26px,2.2vw,40px)] font-light leading-[1.2] tracking-[0.03em] text-site-text">
            Do contato à resolução
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {FLUXO.map(({ title, description }, i) => (
              <article
                key={title}
                className="rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 transition duration-300 hover:-translate-y-[2px] hover:border-[rgba(14,196,216,0.30)] hover:shadow-[0_0_28px_rgba(14,196,216,0.09)]"
              >
                <span className="text-[11px] uppercase tracking-[0.24em] text-site-accent">
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-[18px] font-light text-site-text">{title}</h3>
                <p className="mt-3 text-[14px] leading-[1.7] text-site-textSub">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <TermosModal
        open={modalAberto !== null}
        tipo={modalAberto ?? 'termos'}
        onClose={() => setModalAberto(null)}
      />
      <CookieBanner />
    </div>
  );
}
